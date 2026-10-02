"""
backfill_activity_titles.py - feat/activity-auto-title: One-Time Activity
Title Update
------------------------------------------------------------------------------
Standalone maintenance script - run manually, once, after the auto-title
change ships. Activity titles are no longer typed by the admin: they are
always "<Lesson name> – <Activity type>" (e.g. "Variables – Multiple
Choice"), built by activity_validation.build_activity_title(). This script
rewrites every EXISTING activity's title to that same format, so old,
hand-typed titles ("Act 1 l1m1c1") line up with new ones.

WHAT IT DOES
For every row in learning_activities_tbl (archived ones too, so a later
restore already has the right name):
    - lesson AND type found  -> compute "<Lesson> – <Type>"
        - already matches    -> skipped (nothing to do)
        - different          -> listed as old -> new (and updated with --apply)
    - lesson or type missing -> skipped and reported

DRY RUN BY DEFAULT - prints what would change and changes nothing.
With --apply every change is written in ONE transaction, and each one is
logged in Name History (title_history_tbl, entity_type 'activity') with
changed_by = --admin-id. Any error rolls the whole batch back.

Run with:
    python backfill_activity_titles.py                              (dry run)
    python backfill_activity_titles.py --apply --admin-id <acc_id>  (for real)

Safe to run more than once: rows that already match are skipped, so a
second run changes nothing.
"""

import argparse

from mysql.connector import Error
from cobradb import get_db_connection
from activity_validation import build_activity_title
from title_history import ensure_title_history, log_title_change
from validators import TITLE_LIMITS


def _load_activities(connection):
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        """SELECT la.la_id, la.activity_title, la.resource_id,
                  lr.resource_title, at.activity_type_name, las.la_stats_name
           FROM learning_activities_tbl la
           LEFT JOIN learning_resources_tbl lr ON la.resource_id = lr.resource_id
           LEFT JOIN activity_types_tbl at ON la.activity_type_id = at.activity_type_id
           LEFT JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
           ORDER BY la.la_id ASC"""
    )
    rows = cursor.fetchall()
    cursor.close()
    return rows


def _admin_exists(connection, acc_id):
    cursor = connection.cursor()
    cursor.execute("SELECT acc_id FROM account_tbl WHERE acc_id = %s", (acc_id,))
    found = cursor.fetchone() is not None
    cursor.close()
    return found


def plan_changes(rows):
    """Splits the rows into (changes, unchanged, skipped). Reads only."""
    changes, unchanged, skipped = [], [], []
    for r in rows:
        if not (r["resource_title"] or "").strip():
            skipped.append((r, "lesson missing"))
            continue
        if not (r["activity_type_name"] or "").strip():
            skipped.append((r, "activity type missing"))
            continue
        new_title = build_activity_title(r["resource_title"], r["activity_type_name"])
        if new_title == r["activity_title"]:
            unchanged.append(r)
        else:
            changes.append((r, new_title))
    return changes, unchanged, skipped


def run_backfill(apply=False, admin_id=None):
    connection = get_db_connection()
    if connection is None:
        print("backfill_activity_titles: could not connect to the database. Aborting.")
        return 1

    try:
        if apply and not _admin_exists(connection, admin_id):
            print(f"backfill_activity_titles: admin account '{admin_id}' not found. Aborting.")
            return 1

        rows = _load_activities(connection)
        changes, unchanged, skipped = plan_changes(rows)
        limit = TITLE_LIMITS["activity"]

        print(f"backfill_activity_titles: {'APPLY' if apply else 'DRY RUN'} - {len(rows)} activity row(s) found.")
        for r, new_title in changes:
            status = r["la_stats_name"] or "?"
            warn = f"  [WARNING: {len(new_title)} chars, over the {limit}-char limit - shorten the lesson name]" if len(new_title) > limit else ""
            print(f"  la_id {r['la_id']} ({status}): \"{r['activity_title']}\" -> \"{new_title}\"{warn}")
        for r, reason in skipped:
            print(f"  la_id {r['la_id']}: SKIPPED ({reason}) - \"{r['activity_title']}\"")

        # Two non-archived activities with the same new title = the same
        # lesson + type twice (normally blocked). Reported, not fixed here.
        seen = {}
        for r, new_title in changes + [(r, r["activity_title"]) for r in unchanged]:
            if r["la_stats_name"] == "Archived":
                continue
            seen.setdefault(new_title.lower(), []).append(r["la_id"])
        for title_key, ids in seen.items():
            if len(ids) > 1:
                print(f"  WARNING: activities {ids} would share the title \"{title_key}\" (same lesson + type).")

        print(
            f"backfill_activity_titles: {len(changes)} to change, "
            f"{len(unchanged)} already correct, {len(skipped)} skipped (lesson/type missing)."
        )

        if not apply:
            print("backfill_activity_titles: dry run - nothing was changed. "
                  "Run again with --apply --admin-id <acc_id> to write these changes.")
            return 0
        if not changes:
            print("backfill_activity_titles: nothing to change.")
            return 0

        ensure_title_history(connection)  # before any write - DDL commits implicitly
        cursor = connection.cursor()
        try:
            for r, new_title in changes:
                cursor.execute(
                    "UPDATE learning_activities_tbl SET activity_title = %s WHERE la_id = %s",
                    (new_title, r["la_id"])
                )
                log_title_change(cursor, "activity", r["la_id"], r["activity_title"], new_title, admin_id)
            connection.commit()
        except Error as e:
            connection.rollback()
            print(f"backfill_activity_titles: FAILED, nothing was changed: {e}")
            return 1
        finally:
            cursor.close()

        print(f"backfill_activity_titles: done - {len(changes)} title(s) updated and logged in Name History.")
        return 0
    finally:
        if connection.is_connected():
            connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rewrite activity titles to '<Lesson> – <Activity type>'.")
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument("--admin-id", help="acc_id saved as changed_by in Name History (required with --apply)")
    args = parser.parse_args()
    if args.apply and not args.admin_id:
        parser.error("--admin-id <acc_id> is required with --apply")
    raise SystemExit(run_backfill(apply=args.apply, admin_id=args.admin_id))
