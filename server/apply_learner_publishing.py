"""
apply_learner_publishing.py - feat/publishing-tree (learner side)
-----------------------------------------------------------------------
Run ONCE from the server/ folder:

    python apply_learner_publishing.py

Makes learners see only PUBLISHED content, by exact find-and-replace in:
    learner_routes.py, module_performance.py, learner_progress_monitor.py

Safe to run:
  - every FIND block must appear exactly once, otherwise that file is
    NOT changed at all and the script tells you which block didn't match
  - a copy of each changed file is saved next to it as <name>.bak
  - running it again skips blocks that are already applied

The same edits are listed by hand in LEARNER_PATCHES.md, in case you
prefer to copy/paste them yourself.
"""

import os
import sys

MARK = "feat/publishing-tree"

PATCHES = {
    "learner_routes.py": [
        (
            "Published video: join the right status table",
            '''           JOIN learning_resources_stats_tbl lrs ON vt.video_stats_id = lrs.lr_stats_id
           WHERE vt.resource_id = %s AND lrs.lr_stats_name = 'Published'
           ORDER BY vt.video_tutorial_id DESC''',
            '''           JOIN learning_activities_stats_tbl las ON vt.video_stats_id = las.la_stats_id
           WHERE vt.resource_id = %s AND las.la_stats_name = 'Published'
           ORDER BY vt.video_tutorial_id DESC''',
        ),
        (
            "Learning map: only Published chapters and modules",
            '''        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE is_archived = 0 "
            "ORDER BY COALESCE(display_order, 999999) ASC, cat_id ASC"
        )
        categories = cursor.fetchall()

        cursor.execute(
            "SELECT module_id, cat_id FROM modules_tbl WHERE is_archived = 0 "
            "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC"
        )
        modules = cursor.fetchall()''',
            '''        # feat/publishing-tree: learners only see PUBLISHED chapters and modules.
        cursor.execute(
            """SELECT c.cat_id, c.category_name FROM category_tbl c
               JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
               WHERE c.is_archived = 0 AND cs.cat_stats_name = 'Published'
               ORDER BY COALESCE(c.display_order, 999999) ASC, c.cat_id ASC"""
        )
        categories = cursor.fetchall()

        cursor.execute(
            """SELECT m.module_id, m.cat_id FROM modules_tbl m
               JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
               WHERE m.is_archived = 0 AND ms.module_stats_name = 'Published'
               ORDER BY m.cat_id ASC, COALESCE(m.display_order, 999999) ASC, m.module_id ASC"""
        )
        modules = cursor.fetchall()
        visible_modules = []  # feat/publishing-tree: Published modules with a published lesson''',
        ),
        (
            "Learning map: hide a module with no published lesson",
            '''            total_resources = cursor.fetchone()["total"]
''',
            '''            total_resources = cursor.fetchone()["total"]

            # feat/publishing-tree: a Published module with no published
            # lesson is hidden - it could never be "completed" and would
            # keep the next chapter locked forever.
            if total_resources == 0:
                continue
            visible_modules.append(module)
''',
        ),
        (
            "Learning map: count only completed lessons that are Published",
            '''                """SELECT COUNT(*) AS done
                   FROM learner_resource_progress_tbl lrp
                   JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
                   WHERE lr.module_id = %s AND lrp.acc_id = %s AND lrp.status = 'completed'""",''',
            '''                """SELECT COUNT(*) AS done
                   FROM learner_resource_progress_tbl lrp
                   JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
                   JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                   WHERE lr.module_id = %s AND lrp.acc_id = %s AND lrp.status = 'completed'
                     AND lrs.lr_stats_name = 'Published'""",  # feat/publishing-tree''',
        ),
        (
            "Learning map: archived exercises don't count",
            '''                   WHERE lr.module_id = %s AND las.la_stats_name = 'Published'""",
                (module_id,)
            )
            total_exercises = cursor.fetchone()["total"]''',
            '''                   WHERE lr.module_id = %s AND las.la_stats_name = 'Published'
                     AND COALESCE(ce.is_archived, 0) = 0""",  # feat/publishing-tree
                (module_id,)
            )
            total_exercises = cursor.fetchone()["total"]''',
        ),
        (
            "Learning map: count only completed exercises that are Published",
            '''                """SELECT COUNT(*) AS done
                   FROM learner_exercise_progress_tbl lep
                   JOIN coding_exercises_tbl ce ON lep.exercise_id = ce.exercise_id
                   JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
                   WHERE lr.module_id = %s AND lep.acc_id = %s AND lep.status = 'completed'""",''',
            '''                """SELECT COUNT(*) AS done
                   FROM learner_exercise_progress_tbl lep
                   JOIN coding_exercises_tbl ce ON lep.exercise_id = ce.exercise_id
                   JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
                   JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
                   WHERE lr.module_id = %s AND lep.acc_id = %s AND lep.status = 'completed'
                     AND las.la_stats_name = 'Published' AND COALESCE(ce.is_archived, 0) = 0""",  # feat/publishing-tree''',
        ),
        (
            "Learning map: a chapter with nothing to show is hidden",
            '''            category_modules = [m for m in modules if m["cat_id"] == cat_id]
''',
            '''            category_modules = [m for m in visible_modules if m["cat_id"] == cat_id]
            # feat/publishing-tree: no module with a published lesson -> hidden.
            if not category_modules:
                continue
''',
        ),
        (
            "Lessons page: only a Published chapter opens",
            '''        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        category = cursor.fetchone()''',
            '''        # feat/publishing-tree: only a Published chapter opens.
        cursor.execute(
            """SELECT c.cat_id, c.category_name FROM category_tbl c
               JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
               WHERE c.cat_id = %s AND c.is_archived = 0 AND cs.cat_stats_name = 'Published'""",
            (cat_id,)
        )
        category = cursor.fetchone()''',
        ),
        (
            "Lessons page: only Published modules that have a published lesson",
            '''        cursor.execute(
            "SELECT module_id, module_name, description, created_at FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 "
            "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC",
            (cat_id,)
        )
        raw_modules = cursor.fetchall()''',
            '''        # feat/publishing-tree: only Published modules, and only ones with a
        # published lesson (an empty one would block the module 85% gate order).
        cursor.execute(
            """SELECT m.module_id, m.module_name, m.description, m.created_at FROM modules_tbl m
               JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
               WHERE m.cat_id = %s AND m.is_archived = 0 AND ms.module_stats_name = 'Published'
                 AND EXISTS (
                     SELECT 1 FROM learning_resources_tbl lr
                     JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                     WHERE lr.module_id = m.module_id AND lrs.lr_stats_name = 'Published'
                 )
               ORDER BY m.cat_id ASC, COALESCE(m.display_order, 999999) ASC, m.module_id ASC""",
            (cat_id,)
        )
        raw_modules = cursor.fetchall()''',
        ),
        (
            "Lessons page: only Published lessons",
            '''                "SELECT resource_id, resource_title, created_at FROM learning_resources_tbl WHERE module_id = %s "
                "ORDER BY COALESCE(display_order, 999999) ASC, resource_id ASC",''',
            '''                """SELECT lr.resource_id, lr.resource_title, lr.created_at FROM learning_resources_tbl lr
                   JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                   WHERE lr.module_id = %s AND lrs.lr_stats_name = 'Published'
                   ORDER BY COALESCE(lr.display_order, 999999) ASC, lr.resource_id ASC""",  # feat/publishing-tree''',
        ),
        (
            "Lessons page: a Draft exercise no longer blocks finishing a lesson",
            '''                cursor.execute(
                    "SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s",
                    (resource_id,)
                )
                exercise_rows = cursor.fetchall()''',
            '''                # feat/publishing-tree: only the Published, non-archived
                # exercise counts (a Draft one used to block completion).
                cursor.execute(
                    """SELECT ce.exercise_id FROM coding_exercises_tbl ce
                       JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
                       WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                         AND COALESCE(ce.is_archived, 0) = 0""",
                    (resource_id,)
                )
                exercise_rows = cursor.fetchall()''',
        ),
        (
            "Lesson content: an unpublished lesson doesn't open",
            '''        cursor.execute(
            """SELECT lr.resource_id, lr.resource_title, m.cat_id
               FROM learning_resources_tbl lr
               JOIN modules_tbl m ON lr.module_id = m.module_id
               WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return jsonify({"success": False, "message": "Lesson not found."}), 404''',
            '''        cursor.execute(
            """SELECT lr.resource_id, lr.resource_title, m.cat_id,
                      lrs.lr_stats_name, ms.module_stats_name, cs.cat_stats_name
               FROM learning_resources_tbl lr
               JOIN modules_tbl m ON lr.module_id = m.module_id
               JOIN category_tbl c ON m.cat_id = c.cat_id
               LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
               LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
               LEFT JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
               WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return jsonify({"success": False, "message": "Lesson not found."}), 404
        # feat/publishing-tree: an old link or bookmark to a lesson that is
        # not live (lesson, module or chapter not Published) doesn't open.
        # The learner's progress rows are kept.
        if not (resource["lr_stats_name"] == "Published"
                and resource["module_stats_name"] == "Published"
                and resource["cat_stats_name"] == "Published"):
            cursor.close()
            return jsonify({"success": False, "message": "This lesson isn't available right now."}), 404''',
        ),
    ],
    "module_performance.py": [
        (
            "85% gate: a Draft exercise no longer blocks 'lesson complete'",
            '''    cursor.execute("SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s", (resource_id,))
    for ex in cursor.fetchall():''',
            '''    # feat/publishing-tree: only the Published, non-archived exercise counts.
    cursor.execute(
        """SELECT ce.exercise_id FROM coding_exercises_tbl ce
           JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
           WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
             AND COALESCE(ce.is_archived, 0) = 0""",
        (resource_id,)
    )
    for ex in cursor.fetchall():''',
        ),
    ],
    "learner_progress_monitor.py": [
        (
            "Learner Progress: published video joins the right status table",
            '''            JOIN learning_resources_stats_tbl lrs ON vt.video_stats_id = lrs.lr_stats_id
            WHERE vt.resource_id IN ({_ph(ids)}) AND lrs.lr_stats_name = 'Published'""",''',
            '''            JOIN learning_activities_stats_tbl las ON vt.video_stats_id = las.la_stats_id
            WHERE vt.resource_id IN ({_ph(ids)}) AND las.la_stats_name = 'Published'""",  # feat/publishing-tree''',
        ),
        (
            "Learner Progress: course = lessons in Published modules and chapters",
            '''        JOIN modules_tbl m ON lr.module_id = m.module_id
        JOIN category_tbl c ON m.cat_id = c.cat_id
        WHERE lrs.lr_stats_name = 'Published'
          AND COALESCE(c.is_archived, 0) = 0
          AND COALESCE(m.is_archived, 0) = 0''',
            '''        JOIN modules_tbl m ON lr.module_id = m.module_id
        JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
        JOIN category_tbl c ON m.cat_id = c.cat_id
        JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
        WHERE lrs.lr_stats_name = 'Published'
          AND ms.module_stats_name = 'Published'  -- feat/publishing-tree
          AND cs.cat_stats_name = 'Published'
          AND COALESCE(c.is_archived, 0) = 0
          AND COALESCE(m.is_archived, 0) = 0''',
        ),
    ],
}


def apply_file(folder, name, patches):
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        print(f"  !! {name}: file not found in {folder} - skipped")
        return False

    raw = open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    text = raw.replace("\r\n", "\n")

    problems, applied, already = [], 0, 0
    for label, find, replace in patches:
        if replace in text:  # checked first: some replacements contain their own FIND text
            already += 1
            continue
        count = text.count(find)
        if count == 1:
            text = text.replace(find, replace)
            applied += 1
        else:
            problems.append(f"{label}  (found {count} times, expected 1)")

    if problems:
        print(f"  !! {name}: NOT changed - these blocks didn't match:")
        for p in problems:
            print(f"       - {p}")
        return False

    if applied:
        open(path + ".bak", "wb").write(raw.encode("utf-8"))
        out = text.replace("\n", "\r\n") if crlf else text
        open(path, "wb").write(out.encode("utf-8"))
    print(f"  ok {name}: {applied} change(s) applied, {already} already applied")
    return True


def main():
    folder = os.path.dirname(os.path.abspath(__file__))
    print(f"{MARK}: making learners see only Published content ({folder})")
    results = [apply_file(folder, name, patches) for name, patches in PATCHES.items()]
    if all(results):
        print("Done. Delete __pycache__ and restart the server.")
        return 0
    print("Some files were not changed - see above. Nothing was half-applied.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
