"""
backfill_learner_unlocks.py - Task #12: One-Time Permanent Unlock Backfill
------------------------------------------------------------------------------
Standalone maintenance script - run ONCE, manually, right after Task #11's
learner_progress_unlocks_tbl is created and BEFORE Task #13's new
read-first-fallback-to-live logic ever ships. Walks every learner and
re-derives which categories/modules they've ALREADY legitimately reached
under TODAY's existing live-calculation rule (the same "is the previous
one 100% done" check learning_map_data() already uses), writing one
permanent row per qualifying category/module into
learner_progress_unlocks_tbl.

WHY THIS MUST RUN NOW, NOT LAZILY LATER
If this only ran the first time each learner happened to load the
Learning Map page, any learner who hasn't logged in yet when an admin
later makes a breaking edit (e.g. adding a module to an already-passed
category) would fall back on a live check that's ALREADY broken by then
- there would be nothing left to "rescue" their existing progress with.
Running this once, proactively, for every learner, right now - while
today's data is still the untouched, correct baseline - closes that gap
before it can ever open.

Run with:
    python backfill_learner_unlocks.py

Safe to run more than once (relies on learner_progress_unlocks_tbl's own
uq_learner_unlock unique constraint - a duplicate INSERT is simply
skipped via INSERT IGNORE, never an error, never a second row).
"""

from mysql.connector import Error
from cobradb import get_db_connection


def _get_all_learner_acc_ids(connection):
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """SELECT a.acc_id FROM account_tbl a
           JOIN usertype_tbl ut ON a.u_type = ut.ut_id
           WHERE ut.u_type = 'Learner' AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
    )
    rows = cursor.fetchall()
    cursor.close()
    return [r["acc_id"] for r in rows]


def _write_unlock(cursor, acc_id, entity_type, entity_id):
    cursor.execute(
        """INSERT IGNORE INTO learner_progress_unlocks_tbl
           (acc_id, entity_type, entity_id, unlocked_at)
           VALUES (%s, %s, %s, NOW())""",
        (acc_id, entity_type, entity_id)
    )


def backfill_for_learner(connection, acc_id):
    """
    Re-derives this ONE learner's already-earned categories/modules
    using the EXACT same live rule learning_map_data() uses today, and
    writes a permanent unlock row for each one that qualifies.

    Mirrors learning_map_data()'s own module/category completion logic
    exactly - this is a read of the CURRENT state, run once, not a new
    rule.
    """
    cursor = connection.cursor(dictionary=True)

    cursor.execute(
        "SELECT cat_id, category_name FROM category_tbl WHERE is_archived = 0 ORDER BY cat_id ASC"
    )
    categories = cursor.fetchall()

    cursor.execute(
        "SELECT module_id, cat_id FROM modules_tbl WHERE is_archived = 0 ORDER BY cat_id ASC, module_id ASC"
    )
    modules = cursor.fetchall()

    module_status_by_id = {}
    module_unlock_written = set()

    for module in modules:
        module_id = module["module_id"]

        cursor.execute(
            """SELECT COUNT(*) AS total FROM learning_resources_tbl lr
               JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
               WHERE lr.module_id = %s AND lrs.lr_stats_name = 'Published'""",
            (module_id,)
        )
        total_resources = cursor.fetchone()["total"]

        cursor.execute(
            """SELECT COUNT(*) AS done FROM learner_resource_progress_tbl lrp
               JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
               WHERE lr.module_id = %s AND lrp.acc_id = %s AND lrp.status = 'completed'""",
            (module_id, acc_id)
        )
        completed_resources = cursor.fetchone()["done"]

        cursor.execute(
            """SELECT COUNT(*) AS total FROM learning_activities_tbl la
               JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
               WHERE la.module_id = %s AND las.la_stats_name = 'Published'""",
            (module_id,)
        )
        total_activities = cursor.fetchone()["total"]

        cursor.execute(
            """SELECT COUNT(*) AS done FROM learner_activity_progress_tbl lap
               JOIN learning_activities_tbl la ON lap.la_id = la.la_id
               WHERE la.module_id = %s AND lap.acc_id = %s AND lap.status = 'completed'""",
            (module_id, acc_id)
        )
        completed_activities = cursor.fetchone()["done"]

        cursor.execute(
            """SELECT COUNT(*) AS total FROM coding_exercises_tbl ce
               JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
               JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
               WHERE lr.module_id = %s AND las.la_stats_name = 'Published'""",
            (module_id,)
        )
        total_exercises = cursor.fetchone()["total"]

        cursor.execute(
            """SELECT COUNT(*) AS done FROM learner_exercise_progress_tbl lep
               JOIN coding_exercises_tbl ce ON lep.exercise_id = ce.exercise_id
               JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
               WHERE lr.module_id = %s AND lep.acc_id = %s AND lep.status = 'completed'""",
            (module_id, acc_id)
        )
        completed_exercises = cursor.fetchone()["done"]

        total_items = total_resources + total_activities + total_exercises
        completed_items = completed_resources + completed_activities + completed_exercises

        if total_items > 0 and completed_items == total_items:
            status = "completed"
        elif completed_items > 0:
            status = "in_progress"
        else:
            status = "not_started"

        module_status_by_id[module_id] = status

        # A learner has "reached" a module if they've touched it at all
        # (in_progress or completed) - matches the same bar Task #13
        # will use for the read-first check, so the backfill and the
        # new live logic agree on what "reached" means from day one.
        if status in ("completed", "in_progress"):
            _write_unlock(cursor, acc_id, "module", module_id)
            module_unlock_written.add(module_id)

    for index, category in enumerate(categories):
        cat_id = category["cat_id"]
        category_modules = [m for m in modules if m["cat_id"] == cat_id]

        modules_total = len(category_modules)
        modules_completed = sum(
            1 for m in category_modules
            if module_status_by_id.get(m["module_id"]) == "completed"
        )
        any_in_progress = any(
            module_status_by_id.get(m["module_id"]) == "in_progress"
            for m in category_modules
        )

        if modules_total > 0 and modules_completed == modules_total:
            chapter_status = "completed"
        elif modules_completed > 0 or any_in_progress:
            chapter_status = "in_progress"
        else:
            chapter_status = "not_started"

        # First category is always reachable, matching learning_map_data()'s
        # own "index == 0 -> never locked" rule.
        if index == 0 or chapter_status in ("completed", "in_progress"):
            _write_unlock(cursor, acc_id, "category", cat_id)

    connection.commit()
    cursor.close()


def run_backfill():
    connection = get_db_connection()
    if connection is None:
        print("backfill_learner_unlocks: could not connect to the database. Aborting.")
        return

    try:
        acc_ids = _get_all_learner_acc_ids(connection)
        print(f"backfill_learner_unlocks: found {len(acc_ids)} learner account(s).")

        for i, acc_id in enumerate(acc_ids, start=1):
            try:
                backfill_for_learner(connection, acc_id)
                print(f"  [{i}/{len(acc_ids)}] backfilled {acc_id}")
            except Error as e:
                print(f"  [{i}/{len(acc_ids)}] FAILED for {acc_id}: {e}")

        print("backfill_learner_unlocks: done.")
    finally:
        if connection.is_connected():
            connection.close()


if __name__ == "__main__":
    run_backfill()