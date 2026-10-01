"""
badges.py - Learner Badges & Achievements
------------------------------------------
12 starter badges, earned automatically from data CobraByte already
tracks. Badges are checked whenever the learner opens their profile
(learner_profile.py -> /api/profile/overview): every rule is evaluated
against that learner's "facts" and any newly earned badge is saved once
in learner_badges_tbl with the date it was earned. A saved badge is
never taken back, even if the underlying data changes later.

Tables (created lazily + seeded; same DDL as sql/profile_badges.sql):
    badges_tbl          - the badge catalogue (code, name, description, icon, order)
    learner_badges_tbl  - who earned which badge and when (one row per badge)
"""

from mysql.connector import Error

BADGES_TABLE = "badges_tbl"
LEARNER_BADGES_TABLE = "learner_badges_tbl"

# code, name, description (shown on locked badges too), Font Awesome icon, rule
BADGE_CATALOGUE = [
    ("first_steps", "First Steps", "Complete your first lesson.", "fa-shoe-prints",
     lambda f: f["lessons_completed"] >= 1),
    ("lesson_learner", "Lesson Learner", "Complete 10 lessons.", "fa-book-open",
     lambda f: f["lessons_completed"] >= 10),
    ("module_master", "Module Master", "Pass your first module (85% gate).", "fa-layer-group",
     lambda f: f["modules_passed"] >= 1),
    ("chapter_champion", "Chapter Champion", "Complete a whole chapter.", "fa-flag-checkered",
     lambda f: f["chapters_completed"] >= 1),
    ("quiz_ace", "Quiz Ace", "Perfect first-try score on a Multiple Choice activity.", "fa-bullseye",
     lambda f: f["perfect_mcq"] >= 1),
    ("blank_buster", "Blank Buster", "Perfect first-try score on a Fill in the Blanks activity.", "fa-puzzle-piece",
     lambda f: f["perfect_fib"] >= 1),
    ("card_shark", "Card Shark", "Perfect first-try score on a Flashcards activity.", "fa-clone",
     lambda f: f["perfect_flashcards"] >= 1),
    ("problem_solver", "Problem Solver", "Pass a coding exercise.", "fa-laptop-code",
     lambda f: f["exercises_passed"] >= 1),
    ("code_runner", "Code Runner", "Run code in the Sandbox 25 times.", "fa-play",
     lambda f: f["sandbox_runs"] >= 25),
    ("snippet_saver", "Snippet Saver", "Save 5 snippets in the Sandbox.", "fa-floppy-disk",
     lambda f: f["snippets_saved"] >= 5),
    ("dedicated", "Dedicated", "Reach 10 hours of learning time.", "fa-hourglass-half",
     lambda f: f["learning_seconds"] >= 10 * 3600),
    ("consistent", "Consistent", "Log in on 7 different days.", "fa-calendar-check",
     lambda f: f["login_days"] >= 7),
]

RULES = {code: rule for code, _, _, _, rule in BADGE_CATALOGUE}


def ensure_badge_schema(cursor):
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {BADGES_TABLE} (
                badge_id INT(10) NOT NULL AUTO_INCREMENT,
                badge_code VARCHAR(40) NOT NULL,
                badge_name VARCHAR(60) NOT NULL,
                description VARCHAR(150) NOT NULL,
                icon VARCHAR(40) NOT NULL,
                display_order INT(5) NOT NULL DEFAULT 0,
                PRIMARY KEY (badge_id),
                UNIQUE KEY uq_badge_code (badge_code)
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
    # Seed / refresh the catalogue (badge_code is the stable key).
    for order, (code, name, description, icon, _) in enumerate(BADGE_CATALOGUE, start=1):
        cursor.execute(
            f"""INSERT INTO {BADGES_TABLE} (badge_code, badge_name, description, icon, display_order)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE badge_name = VALUES(badge_name),
                    description = VALUES(description), icon = VALUES(icon),
                    display_order = VALUES(display_order)""",
            (code, name, description, icon, order)
        )


def award_and_list_badges(connection, acc_id, facts):
    """
    Saves every badge whose rule `facts` now meets (once - never removed),
    then returns all badges in display order:
        [{code, name, description, icon, earned, earned_at}, ...]
    """
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_badge_schema(cursor)
        cursor.execute(
            f"SELECT badge_id, badge_code, badge_name, description, icon FROM {BADGES_TABLE} ORDER BY display_order, badge_id"
        )
        catalogue = cursor.fetchall()

        for badge in catalogue:
            rule = RULES.get(badge["badge_code"])
            if rule and rule(facts):
                cursor.execute(
                    f"INSERT IGNORE INTO {LEARNER_BADGES_TABLE} (acc_id, badge_id, earned_at) VALUES (%s, %s, NOW())",
                    (acc_id, badge["badge_id"])
                )
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
                "icon": b["icon"],
                "earned": b["badge_id"] in earned,
                "earned_at": earned[b["badge_id"]].strftime("%b %d, %Y") if b["badge_id"] in earned else None,
            }
            for b in catalogue
        ]
    except Error:
        connection.rollback()
        raise
    finally:
        cursor.close()