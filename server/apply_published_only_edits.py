"""
apply_published_only_edits.py - learners only see PUBLISHED content
---------------------------------------------------------------------------
Put this file in your project's main folder (the one that holds the
static, templates and learner folders) and run:

    python apply_published_only_edits.py

The rule it puts in place: a lesson is visible to learners only when the
lesson, its module AND its chapter are all Published. The Learning Map,
the Lessons page, opening a lesson, the module lock, weak spots, and the
profile stats / badges / certificate all follow that one rule.

What it does
  - Finds learner_routes.py, module_performance.py, weak_spots.py and
    learner_profile.py inside that folder.
  - Checks EVERY edit first. If any "find" text is missing or appears more
    than once, it stops and changes nothing.
  - Saves a copy of each file in published-only-backup/ before changing it.
  - Safe to run twice: an edit that is already there is skipped.

No database changes. Learner progress is never deleted - content that is
not Published is only hidden.
"""

import os
import re
import shutil
import sys

SKIP_DIRS = {".git", "venv", ".venv", "env", "node_modules", "__pycache__",
             "consent-backup", "published-only-backup"}

# (file name, text that must be inside the right file, [(marker, find, replace), ...])
#   marker  = text that is only in the file AFTER the edit (used to skip an edit already made)
#   find    = the existing line(s); spaces at the start/end of each line do not have to match
#   replace = what those line(s) become
EDITS = [
    ('module_performance.py', 'def module_locked_for_learner', [
        # ---- module_performance.py, edit 1
        ('def live_course_rows',
         # FIND
         '# ---------------- lessons + completion ----------------',
         # REPLACE WITH
         '''# ---------------- what a learner can see (feat/published-only) ----------------
def live_course_rows(cursor, cat_id=None):
    """
    Every lesson a learner can see, in course order - one row per lesson.
    A lesson is "live" only when the lesson, its module AND its chapter are
    all Published (and the module / chapter are not archived). The Learning
    Map, the Lessons page, opening a lesson, the module lock and the profile
    all read from here, so they can never disagree about what is visible.
    cat_id: only that chapter. Needs a dictionary cursor.
    """
    params = []
    chapter_filter = ""
    if cat_id is not None:
        chapter_filter = "AND c.cat_id = %s"
        params.append(cat_id)
    cursor.execute(
        f"""SELECT c.cat_id, c.category_name,
                   m.module_id, m.module_name, m.description AS module_description,
                   m.created_at AS module_created_at,
                   lr.resource_id, lr.resource_title, lr.created_at AS resource_created_at
            FROM learning_resources_tbl lr
            JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
            JOIN modules_tbl m ON lr.module_id = m.module_id
            JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
            JOIN category_tbl c ON m.cat_id = c.cat_id
            JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
            WHERE lrs.lr_stats_name = 'Published'
              AND ms.module_stats_name = 'Published'
              AND cs.cat_stats_name = 'Published'
              AND COALESCE(m.is_archived, 0) = 0
              AND COALESCE(c.is_archived, 0) = 0
              {chapter_filter}
            ORDER BY COALESCE(c.display_order, 999999), c.cat_id,
                     COALESCE(m.display_order, 999999), m.module_id,
                     COALESCE(lr.display_order, 999999), lr.resource_id""",
        tuple(params)
    )
    return cursor.fetchall()


def live_module_ids(cursor, cat_id):
    """Modules of a chapter a learner can see (each has at least one live lesson), in order."""
    ids = []
    for row in live_course_rows(cursor, cat_id):
        if row["module_id"] not in ids:
            ids.append(row["module_id"])
    return ids


def is_live_lesson(cursor, resource_id):
    """True when this lesson, its module and its chapter are all Published."""
    cursor.execute(
        """SELECT 1 AS live
            FROM learning_resources_tbl lr
            JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
            JOIN modules_tbl m ON lr.module_id = m.module_id
            JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
            JOIN category_tbl c ON m.cat_id = c.cat_id
            JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
            WHERE lrs.lr_stats_name = 'Published'
              AND ms.module_stats_name = 'Published'
              AND cs.cat_stats_name = 'Published'
              AND COALESCE(m.is_archived, 0) = 0
              AND COALESCE(c.is_archived, 0) = 0
              AND lr.resource_id = %s
            LIMIT 1""",
        (resource_id,)
    )
    return cursor.fetchone() is not None


# ---------------- lessons + completion ----------------'''),
        # ---- module_performance.py, edit 2
        ('# feat/published-only: a Draft or archived exercise never blocks',
         # FIND
         '''    cursor.execute("SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s", (resource_id,))
    for ex in cursor.fetchall():''',
         # REPLACE WITH
         '''    # feat/published-only: a Draft or archived exercise never blocks the
    # lesson - only a Published one has to be passed (learners can't even
    # see the others).
    cursor.execute(
        """SELECT ce.exercise_id
           FROM coding_exercises_tbl ce
           JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
           WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
             AND COALESCE(ce.is_archived, 0) = 0""",
        (resource_id,)
    )
    for ex in cursor.fetchall():'''),
        # ---- module_performance.py, edit 3
        ('ids = live_module_ids(',
         # FIND
         '''    cursor.execute(
        "SELECT module_id FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 "
        "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC",
        (row["cat_id"],)
    )
    ids = [r["module_id"] for r in cursor.fetchall()]''',
         # REPLACE WITH
         '''    # feat/published-only: "the module right before it" = the one before it
    # among the modules a learner can see, so a Draft module in between can
    # neither block nor auto-pass anything.
    ids = live_module_ids(cursor, row["cat_id"])'''),
    ]),

    ('learner_routes.py', 'def learning_map_data', [
        # ---- learner_routes.py, edit 1
        ('live_course_rows, is_live_lesson',
         # FIND
         '''from module_performance import (  # Module 85% gate
    module_performance, module_locked_for_learner, get_resource_retake_info, start_activity_retake,
)''',
         # REPLACE WITH
         '''from module_performance import (  # Module 85% gate
    module_performance, module_locked_for_learner, get_resource_retake_info, start_activity_retake,
    live_course_rows, is_live_lesson,  # feat/published-only: what a learner can see
)'''),
        # ---- learner_routes.py, edit 2
        ('seen_categories',
         # FIND
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
         # REPLACE WITH
         '''        # feat/published-only: the map only has chapters and modules a
        # learner can see - lesson, module AND chapter all Published
        # (module_performance.live_course_rows), still in Edit Order.
        categories, modules = [], []
        seen_categories, seen_modules = set(), set()
        for live_row in live_course_rows(cursor):
            if live_row["cat_id"] not in seen_categories:
                seen_categories.add(live_row["cat_id"])
                categories.append({"cat_id": live_row["cat_id"], "category_name": live_row["category_name"]})
            if live_row["module_id"] not in seen_modules:
                seen_modules.add(live_row["module_id"])
                modules.append({"module_id": live_row["module_id"], "cat_id": live_row["cat_id"]})'''),
        # ---- learner_routes.py, edit 3
        ('live_rows = live_course_rows(cursor, cat_id)',
         # FIND
         '''        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        category = cursor.fetchone()
        if not category:
            cursor.close()
            return jsonify({"success": False, "message": "Chapter not found."}), 404''',
         # REPLACE WITH
         '''        # feat/published-only: this page only lists what a learner can see -
        # lesson, module AND chapter all Published. A chapter with nothing
        # live does not exist for learners.
        live_rows = live_course_rows(cursor, cat_id)
        if not live_rows:
            cursor.close()
            return jsonify({"success": False, "message": "Chapter not found."}), 404
        category = {"cat_id": cat_id, "category_name": live_rows[0]["category_name"]}'''),
        # ---- learner_routes.py, edit 4
        ('lessons_by_module[live_row["module_id"]] = []',
         # FIND
         '''        cursor.execute(
            "SELECT module_id, module_name, description, created_at FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 "
            "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC",
            (cat_id,)
        )
        raw_modules = cursor.fetchall()''',
         # REPLACE WITH
         '''        # feat/published-only: modules and their lessons come from live_rows
        # (already in Edit Order), so Draft / Ready ones never show up.
        raw_modules, lessons_by_module = [], {}
        for live_row in live_rows:
            if live_row["module_id"] not in lessons_by_module:
                lessons_by_module[live_row["module_id"]] = []
                raw_modules.append({
                    "module_id": live_row["module_id"],
                    "module_name": live_row["module_name"],
                    "description": live_row["module_description"],
                    "created_at": live_row["module_created_at"],
                })
            lessons_by_module[live_row["module_id"]].append({
                "resource_id": live_row["resource_id"],
                "resource_title": live_row["resource_title"],
                "created_at": live_row["resource_created_at"],
            })'''),
        # ---- learner_routes.py, edit 5
        ('resources = lessons_by_module.get(module_id, [])',
         # FIND
         '''            cursor.execute(
                "SELECT resource_id, resource_title, created_at FROM learning_resources_tbl WHERE module_id = %s "
                "ORDER BY COALESCE(display_order, 999999) ASC, resource_id ASC",
                (module_id,)
            )
            resources = cursor.fetchall()''',
         # REPLACE WITH
         '            resources = lessons_by_module.get(module_id, [])   # feat/published-only'),
        # ---- learner_routes.py, edit 6
        ('# feat/published-only: only a Published exercise counts',
         # FIND
         '''                cursor.execute(
                    "SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s",
                    (resource_id,)
                )''',
         # REPLACE WITH
         '''                # feat/published-only: only a Published exercise counts - a
                # Draft or archived one is invisible to learners, so it must
                # not keep the lesson from completing.
                cursor.execute(
                    """SELECT ce.exercise_id
                       FROM coding_exercises_tbl ce
                       JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
                       WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                         AND COALESCE(ce.is_archived, 0) = 0""",
                    (resource_id,)
                )'''),
        # ---- learner_routes.py, edit 7
        ('if not is_live_lesson(cursor, resource_id):',
         # FIND
         "        # Module 85% gate (strict, live): a lesson in a locked module can't",
         # REPLACE WITH
         '''        # feat/published-only: a lesson that is not live (the lesson, its
        # module or its chapter is not Published) can't be opened, not even
        # by typing its URL.
        if not is_live_lesson(cursor, resource_id):
            cursor.close()
            return jsonify({"success": False, "message": "This lesson is not available."}), 404

        # Module 85% gate (strict, live): a lesson in a locked module can't'''),
    ]),

    ('weak_spots.py', 'def _course_lessons', [
        # ---- weak_spots.py, edit 1
        ("ms.module_stats_name = 'Published'",
         # FIND
         '''           JOIN modules_tbl m ON lr.module_id = m.module_id
           JOIN category_tbl c ON m.cat_id = c.cat_id
           WHERE lrs.lr_stats_name = 'Published'
             AND COALESCE(m.is_archived, 0) = 0''',
         # REPLACE WITH
         '''           JOIN modules_tbl m ON lr.module_id = m.module_id
           JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
           JOIN category_tbl c ON m.cat_id = c.cat_id
           JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
           WHERE lrs.lr_stats_name = 'Published'
             AND ms.module_stats_name = 'Published'
             AND cs.cat_stats_name = 'Published'
             AND COALESCE(m.is_archived, 0) = 0'''),
    ]),

    ('learner_profile.py', 'def _build_overview', [
        # ---- learner_profile.py, edit 1
        ('PASS_PERCENT, live_course_rows',
         # FIND
         'from module_performance import module_performance, PASS_PERCENT',
         # REPLACE WITH
         'from module_performance import module_performance, PASS_PERCENT, live_course_rows'),
        # ---- learner_profile.py, edit 2
        ('live_ids = {',
         # FIND
         '    chapters, _ = _load_course_tree(cursor)',
         # REPLACE WITH
         '''    chapters, _ = _load_course_tree(cursor)

    # feat/published-only: keep only what the learner can see - lesson,
    # module AND chapter all Published (same rule as the Learning Map).
    # Stats, badges, the certificate and notifications all count from this.
    live_ids = {row["resource_id"] for row in live_course_rows(cursor)}
    visible_chapters = []
    for chapter in chapters:
        visible_modules = []
        for module in chapter["modules"]:
            lessons = [lesson for lesson in module["lessons"] if lesson["resource_id"] in live_ids]
            if lessons:
                visible_modules.append({**module, "lessons": lessons})
        if visible_modules:
            visible_chapters.append({**chapter, "modules": visible_modules})
    chapters = visible_chapters'''),
    ]),

]


def find_file(root, name, signature):
    """The one file called `name` under root whose text contains `signature`."""
    hits = []
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        if name in files:
            path = os.path.join(folder, name)
            try:
                with open(path, encoding="utf-8", newline="") as fh:
                    if signature in fh.read():
                        hits.append(path)
            except (OSError, UnicodeDecodeError):
                pass
    return hits


def line_pattern(find):
    """Regex for the find text as whole lines; spaces at line starts/ends may differ."""
    parts = [re.escape(line.strip()) for line in find.split("\n")]
    # ends at a line end that may be "\n" (Mac/Linux) or "\r\n" (Windows)
    return re.compile(r"(?m)^[ \t]*" + r"[ \t]*\r?\n[ \t]*".join(parts) + r"[ \t]*(?=\r?\n|\Z)")


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
    print(f"Project folder: {root}\n")

    planned = []   # (path, original text, new text, notes)
    problems = []

    for name, signature, edits in EDITS:
        hits = find_file(root, name, signature)
        if len(hits) != 1:
            where = "not found" if not hits else "found more than once:\n      " + "\n      ".join(hits)
            problems.append(f"{name}: {where}")
            continue

        path = hits[0]
        with open(path, encoding="utf-8", newline="") as fh:
            original = fh.read()
        newline = "\r\n" if "\r\n" in original else "\n"
        text = original
        notes = []

        for number, (marker, find, replace) in enumerate(edits, start=1):
            if marker in text:
                notes.append(f"edit {number}: already there, skipped")
                continue
            matches = list(line_pattern(find).finditer(text))
            if len(matches) != 1:
                first_line = find.strip().split("\n")[0].strip()
                problems.append(
                    f"{name} edit {number}: the text to find appears {len(matches)} times (need exactly 1). "
                    f"It starts with:  {first_line}"
                )
                continue
            m = matches[0]
            text = text[:m.start()] + replace.replace("\n", newline) + text[m.end():]
            notes.append(f"edit {number}: done")

        planned.append((path, original, text, notes))

    if problems:
        print("NOTHING WAS CHANGED. These need a look first:\n")
        for p in problems:
            print("  - " + p)
        print("\nSend the file(s) named above and the edits can be matched to them.")
        return 1

    backup_root = os.path.join(root, "published-only-backup")
    for path, original, text, notes in planned:
        rel = os.path.relpath(path, root)
        print(rel)
        for n in notes:
            print("    " + n)
        if text == original:
            continue
        backup = os.path.join(backup_root, rel)
        os.makedirs(os.path.dirname(backup), exist_ok=True)
        if not os.path.exists(backup):
            shutil.copy2(path, backup)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)

    print("\nDone. Originals are saved in published-only-backup/.")
    print("Restart the app so the changes are used.")
    return 0


if __name__ == "__main__":
    sys.exit(main())