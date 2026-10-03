"""
badges.py - Learner Badges & Achievements (database-driven)
-----------------------------------------------------------
Badges are created and managed by mentors on Mentor > Achievements
(achievements.py + admin_routes.py) and stored in badges_tbl. Nothing
about a badge is hardcoded here except:

    REQUIREMENT_TYPES - the fixed list of things CobraByte can count
                        (lessons completed, modules passed, ...). A
                        badge's rule is one of these + a required value.
    STARTER_BADGES    - the 12 original badges. They are added ONCE as
                        normal rows, then mentors can edit or archive
                        them like any other badge (never re-seeded over).

Badges are checked whenever the learner opens their profile
(learner_profile.py -> /api/profile/overview) and on the notification
sync (notifications.py): every ACTIVE badge's rule is compared with that
learner's "facts" and any newly earned badge is saved once in
learner_badges_tbl with the date it was earned. A saved badge is never
taken back, even if the badge is edited or archived later.

Tables (created / upgraded lazily; same DDL as sql/mentor_achievements.sql):
    badges_tbl          - the badge catalogue
    learner_badges_tbl  - who earned which badge and when (one row per badge)
"""

from mysql.connector import Error
from notifications import notify

BADGES_TABLE = "badges_tbl"
LEARNER_BADGES_TABLE = "learner_badges_tbl"

# Uploaded badge icons are stored in the database (image_uploads.py) and
# loaded by the browser from /media/<name> (learner_profile.py).
BADGE_ICON_URL_PREFIX = "/media/"
DEFAULT_BADGE_COLOR = "#22C55E"
DEFAULT_BADGE_ICON = "fa-award"   # shown only when a badge has no uploaded image

# ------------------------------------------------------------------
# The only things the system can count. "key" is stored in
# badges_tbl.requirement_type; "label" fills the Requirement Type
# dropdown; singular/plural build the default criteria text.
# ------------------------------------------------------------------
REQUIREMENT_TYPES = [
    {"key": "lessons_completed", "label": "Lesson Completion",
     "singular": "Complete 1 lesson", "plural": "Complete {n} lessons"},
    {"key": "modules_passed", "label": "Module Passed",
     "singular": "Pass 1 module", "plural": "Pass {n} modules"},
    {"key": "chapters_completed", "label": "Chapter Completion",
     "singular": "Complete 1 chapter", "plural": "Complete {n} chapters"},
    {"key": "perfect_mcq", "label": "Perfect Multiple Choice Score",
     "singular": "Get a perfect first-try score on 1 Multiple Choice activity",
     "plural": "Get a perfect first-try score on {n} Multiple Choice activities"},
    {"key": "perfect_fib", "label": "Perfect Fill in the Blanks Score",
     "singular": "Get a perfect first-try score on 1 Fill in the Blanks activity",
     "plural": "Get a perfect first-try score on {n} Fill in the Blanks activities"},
    {"key": "perfect_flashcards", "label": "Perfect Flashcards Score",
     "singular": "Get a perfect first-try score on 1 Flashcards activity",
     "plural": "Get a perfect first-try score on {n} Flashcards activities"},
    {"key": "exercises_passed", "label": "Coding Exercises Passed",
     "singular": "Pass 1 coding exercise", "plural": "Pass {n} coding exercises"},
    {"key": "sandbox_runs", "label": "Sandbox Runs",
     "singular": "Run code in the Sandbox 1 time", "plural": "Run code in the Sandbox {n} times"},
    {"key": "snippets_saved", "label": "Saved Snippets",
     "singular": "Save 1 snippet in the Sandbox", "plural": "Save {n} snippets in the Sandbox"},
    {"key": "learning_hours", "label": "Learning Hours",
     "singular": "Reach 1 hour of learning time", "plural": "Reach {n} hours of learning time"},
    {"key": "login_days", "label": "Login Days",
     "singular": "Log in on 1 day", "plural": "Log in on {n} different days"},
]
REQUIREMENT_BY_KEY = {t["key"]: t for t in REQUIREMENT_TYPES}

# code, name, description, Font Awesome icon (fallback until a mentor
# uploads an image), requirement type, required value
STARTER_BADGES = [
    ("first_steps", "First Steps", "Complete your first lesson.", "fa-shoe-prints", "lessons_completed", 1),
    ("lesson_learner", "Lesson Learner", "Complete 10 lessons.", "fa-book-open", "lessons_completed", 10),
    ("module_master", "Module Master", "Pass your first module (85% gate).", "fa-layer-group", "modules_passed", 1),
    ("chapter_champion", "Chapter Champion", "Complete a whole chapter.", "fa-flag-checkered", "chapters_completed", 1),
    ("quiz_ace", "Quiz Ace", "Perfect first-try score on a Multiple Choice activity.", "fa-bullseye", "perfect_mcq", 1),
    ("blank_buster", "Blank Buster", "Perfect first-try score on a Fill in the Blanks activity.", "fa-puzzle-piece", "perfect_fib", 1),
    ("card_shark", "Card Shark", "Perfect first-try score on a Flashcards activity.", "fa-clone", "perfect_flashcards", 1),
    ("problem_solver", "Problem Solver", "Pass a coding exercise.", "fa-laptop-code", "exercises_passed", 1),
    ("code_runner", "Code Runner", "Run code in the Sandbox 25 times.", "fa-play", "sandbox_runs", 25),
    ("snippet_saver", "Snippet Saver", "Save 5 snippets in the Sandbox.", "fa-floppy-disk", "snippets_saved", 5),
    ("dedicated", "Dedicated", "Reach 10 hours of learning time.", "fa-hourglass-half", "learning_hours", 10),
    ("consistent", "Consistent", "Log in on 7 different days.", "fa-calendar-check", "login_days", 7),
]

# Columns added to the original badges_tbl (name, DDL). Added one by one
# only when missing, so this is safe to run on any existing database.
_NEW_BADGE_COLUMNS = [
    ("icon_file", "VARCHAR(100) NULL"),
    ("color", "VARCHAR(7) NULL"),
    ("requirement_type", "VARCHAR(40) NULL"),
    ("required_value", "INT(10) NOT NULL DEFAULT 1"),
    ("criteria_description", "VARCHAR(150) NULL"),
    ("is_archived", "TINYINT(1) NOT NULL DEFAULT 0"),
    ("created_by", "VARCHAR(15) NULL"),
    ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updated_at", "DATETIME NULL"),
]
_CREATED_BY_FK = "fk_badge_created_by"

_schema_ready = False   # the schema check runs once per server start


# ------------------------------------------------------------------
# Small shared helpers (also used by achievements.py)
# ------------------------------------------------------------------
def criteria_text(requirement_type, required_value):
    """Default requirement text, e.g. ('lessons_completed', 5) -> 'Complete 5 lessons'."""
    req = REQUIREMENT_BY_KEY.get(requirement_type)
    if not req:
        return ""
    try:
        n = int(required_value)
    except (TypeError, ValueError):
        n = 1
    return req["singular"] if n == 1 else req["plural"].format(n=n)


def badge_icon_url(icon_file):
    return f"{BADGE_ICON_URL_PREFIX}{icon_file}" if icon_file else None


def fact_value(facts, requirement_type):
    """The learner's current number for one requirement type."""
    if requirement_type == "learning_hours":
        return (facts.get("learning_seconds") or 0) / 3600
    return facts.get(requirement_type) or 0


def badge_rule_met(badge, facts):
    """True when this badge row's rule is met by `facts`. Unknown rule -> never."""
    if badge.get("requirement_type") not in REQUIREMENT_BY_KEY:
        return False
    return fact_value(facts, badge["requirement_type"]) >= (badge.get("required_value") or 1)


def _first_value(row):
    """First column of a row from either a dictionary or a tuple cursor."""
    if isinstance(row, dict):
        return next(iter(row.values()))
    return row[0]


# ------------------------------------------------------------------
# Schema: create / upgrade + add the starter badges once
# ------------------------------------------------------------------
def ensure_badge_schema(connection, cursor):
    """
    Creates / upgrades the two badge tables and adds the starter badges.
    Runs once per server start, and commits its own work so the starter
    rows are saved even if the caller rolls back later.
    """
    global _schema_ready
    if _schema_ready:
        return

    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {BADGES_TABLE} (
                badge_id INT(10) NOT NULL AUTO_INCREMENT,
                badge_code VARCHAR(40) NOT NULL,
                badge_name VARCHAR(60) NOT NULL,
                description VARCHAR(150) NOT NULL,
                icon VARCHAR(40) NULL,
                display_order INT(5) NOT NULL DEFAULT 0,
                icon_file VARCHAR(100) NULL,
                color VARCHAR(7) NULL,
                requirement_type VARCHAR(40) NULL,
                required_value INT(10) NOT NULL DEFAULT 1,
                criteria_description VARCHAR(150) NULL,
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                created_by VARCHAR(15) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NULL,
                PRIMARY KEY (badge_id),
                UNIQUE KEY uq_badge_code (badge_code),
                KEY idx_badge_created_by (created_by),
                CONSTRAINT {_CREATED_BY_FK} FOREIGN KEY (created_by)
                    REFERENCES account_tbl (acc_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {LEARNER_BADGES_TABLE} (
                lb_id INT(10) NOT NULL AUTO_INCREMENT,
                acc_id VARCHAR(15) NOT NULL,
                badge_id INT(10) NOT NULL,
                earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (lb_id),
                UNIQUE KEY uq_learner_badge (acc_id, badge_id),
                KEY idx_lb_badge (badge_id),
                CONSTRAINT fk_lb_acc FOREIGN KEY (acc_id)
                    REFERENCES account_tbl (acc_id) ON DELETE CASCADE,
                CONSTRAINT fk_lb_badge FOREIGN KEY (badge_id)
                    REFERENCES {BADGES_TABLE} (badge_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )

    # --- Upgrade a badges_tbl that was created before mentor-made badges ---
    cursor.execute(f"SHOW COLUMNS FROM {BADGES_TABLE}")
    existing = {_first_value(row) for row in cursor.fetchall()}
    for name, ddl in _NEW_BADGE_COLUMNS:
        if name not in existing:
            cursor.execute(f"ALTER TABLE {BADGES_TABLE} ADD COLUMN {name} {ddl}")
    # `icon` (Font Awesome class) is now only a fallback for badges with no image.
    cursor.execute(f"ALTER TABLE {BADGES_TABLE} MODIFY icon VARCHAR(40) NULL")

    # created_by -> account_tbl. A link only, so a failure here must never
    # stop badges from working.
    try:
        cursor.execute(
            """SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND CONSTRAINT_NAME = %s""",
            (BADGES_TABLE, _CREATED_BY_FK)
        )
        if not _first_value(cursor.fetchone()):
            cursor.execute(
                f"""ALTER TABLE {BADGES_TABLE}
                    ADD CONSTRAINT {_CREATED_BY_FK} FOREIGN KEY (created_by)
                    REFERENCES account_tbl (acc_id) ON DELETE SET NULL"""
            )
    except Error as e:
        print(f"badges: could not add {_CREATED_BY_FK}: {e}")

    # --- Starter badges: added only when missing, never updated here ---
    for order, (code, name, description, icon, req_type, value) in enumerate(STARTER_BADGES, start=1):
        cursor.execute(
            f"""INSERT IGNORE INTO {BADGES_TABLE}
                    (badge_code, badge_name, description, icon, display_order,
                     requirement_type, required_value, criteria_description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (code, name, description, icon, order, req_type, value, criteria_text(req_type, value))
        )
        # A starter row from the old hardcoded version has no rule saved yet.
        # Filled once; a row a mentor already edited is left alone.
        cursor.execute(
            f"""UPDATE {BADGES_TABLE}
                SET requirement_type = %s, required_value = %s, criteria_description = %s
                WHERE badge_code = %s AND requirement_type IS NULL""",
            (req_type, value, criteria_text(req_type, value), code)
        )

    connection.commit()
    _schema_ready = True


# ------------------------------------------------------------------
# Learner side: award + list
# ------------------------------------------------------------------
def award_and_list_badges(connection, acc_id, facts, notify_as_read=False):
    """
    Saves every ACTIVE badge whose rule `facts` now meets (once - never
    removed), adds a "You earned ..." notification for each NEW one
    (notify_as_read: file it as already read - used for a learner's very
    first sync), then returns the badges this learner can see, in
    display order:
        [{code, name, description, criteria, icon, icon_url, color,
          earned, earned_at}, ...]
    An archived badge is listed only for learners who already earned it.
    """
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_badge_schema(connection, cursor)
        cursor.execute(
            f"""SELECT badge_id, badge_code, badge_name, description, icon, icon_file, color,
                       requirement_type, required_value, criteria_description, is_archived
                FROM {BADGES_TABLE}
                ORDER BY display_order, badge_id"""
        )
        catalogue = cursor.fetchall()

        for badge in catalogue:
            if badge["is_archived"] or not badge_rule_met(badge, facts):
                continue
            cursor.execute(
                f"INSERT IGNORE INTO {LEARNER_BADGES_TABLE} (acc_id, badge_id, earned_at) VALUES (%s, %s, NOW())",
                (acc_id, badge["badge_id"])
            )
            if cursor.rowcount == 1:
                notify(cursor, acc_id, "badge",
                       f"You earned the **{badge['badge_name']}** badge",
                       badge["description"], "/profile#badges",
                       f"badge:{badge['badge_code']}", is_read=notify_as_read)
        connection.commit()

        cursor.execute(
            f"SELECT badge_id, earned_at FROM {LEARNER_BADGES_TABLE} WHERE acc_id = %s",
            (acc_id,)
        )
        earned = {r["badge_id"]: r["earned_at"] for r in cursor.fetchall()}

        return [
            {
                "code": b["badge_code"],
                "name": b["badge_name"],
                "description": b["description"],
                "criteria": b["criteria_description"] or criteria_text(b["requirement_type"], b["required_value"]),
                "icon": b["icon"] or DEFAULT_BADGE_ICON,
                "icon_url": badge_icon_url(b["icon_file"]),
                "color": b["color"],
                "earned": b["badge_id"] in earned,
                "earned_at": earned[b["badge_id"]].strftime("%b %d, %Y") if b["badge_id"] in earned else None,
            }
            for b in catalogue
            if not b["is_archived"] or b["badge_id"] in earned
        ]
    except Error:
        connection.rollback()
        raise
    finally:
        cursor.close()