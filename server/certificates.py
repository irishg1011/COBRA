"""
certificates.py - Certificate of Completion
--------------------------------------------
One certificate per learner, issued once, when the BACKEND sees that the
learner finished the whole course: every published chapter is passed
(every module in it passed its 85% gate - the same rule as the "Chapter
complete" notification). The browser never decides this.

    issue_certificate_if_complete(connection, acc_id, facts)
        - called wherever the learner's progress "facts" are already built:
          the profile page (learner_profile.py), the bell's sync
          (notifications.py) and the certificate page itself. Saves the
          certificate the first time facts["course_completed"] is true and
          sends the "course completed" notification. Calling it again
          changes nothing (acc_id is UNIQUE), so there is never a second
          certificate and the completion date never moves.
    get_certificate(cursor, acc_id)
        - the saved certificate, or None.
    certificate_payload(certificate, facts)
        - what the learner pages receive.

A certificate is never taken back - not when new chapters are published
later and not when content is archived. The learner's NAME is not stored
here: the certificate page always shows the current name from the
profile, so fixing a typo in Edit Profile fixes the certificate too.

Table (created lazily; same DDL as sql/certificates.sql):
    certificates_tbl - acc_id (unique), reference_no (unique), course_name, issued_at

No Flask/session code here. The acc_id always comes from the caller's
session, so a learner can only ever get their own certificate.
"""

import secrets
from datetime import datetime, timedelta, timezone
from mysql.connector import Error

from notifications import notify, PH_NOW_SQL

CERTIFICATES_TABLE = "certificates_tbl"
COURSE_NAME = "Python Beginner Course"
REFERENCE_PREFIX = "CB"

_schema_ready = False   # the table check runs once per server start


def ensure_certificate_schema(cursor):
    global _schema_ready
    if _schema_ready:
        return
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {CERTIFICATES_TABLE} (
                certificate_id INT(10) NOT NULL AUTO_INCREMENT,
                acc_id VARCHAR(15) NOT NULL,
                reference_no VARCHAR(30) NOT NULL,
                course_name VARCHAR(100) NOT NULL,
                issued_at DATETIME NOT NULL,
                PRIMARY KEY (certificate_id),
                UNIQUE KEY uq_certificate_acc (acc_id),
                UNIQUE KEY uq_certificate_reference (reference_no),
                CONSTRAINT fk_certificate_acc FOREIGN KEY (acc_id)
                    REFERENCES account_tbl (acc_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    _schema_ready = True


def _new_reference():
    """e.g. 'CB-2026-9F3A1C' - the year (Philippine time) + 6 random characters."""
    year = datetime.now(timezone(timedelta(hours=8))).year
    return f"{REFERENCE_PREFIX}-{year}-{secrets.token_hex(3).upper()}"


def get_certificate(cursor, acc_id):
    """The learner's certificate row ({reference_no, course_name, issued_at}), or None."""
    ensure_certificate_schema(cursor)
    cursor.execute(
        f"SELECT reference_no, course_name, issued_at FROM {CERTIFICATES_TABLE} WHERE acc_id = %s",
        (acc_id,)
    )
    return cursor.fetchone()


def issue_certificate_if_complete(connection, acc_id, facts, notify_as_read=False):
    """
    Returns the learner's certificate row, issuing it first when
    facts["course_completed"] is true and they have none yet. Returns None
    while the course is not finished.
    notify_as_read: file the notification as already read (a learner's
    very first notification sync).
    """
    cursor = connection.cursor(dictionary=True)
    try:
        certificate = get_certificate(cursor, acc_id)
        if certificate is not None or not (facts or {}).get("course_completed"):
            return certificate

        created = False
        for _ in range(5):   # a second try only if the random reference was already taken
            cursor.execute(
                f"""INSERT IGNORE INTO {CERTIFICATES_TABLE} (acc_id, reference_no, course_name, issued_at)
                    VALUES (%s, %s, %s, {PH_NOW_SQL})""",
                (acc_id, _new_reference(), COURSE_NAME)
            )
            if cursor.rowcount == 1:
                created = True
                break
            if get_certificate(cursor, acc_id) is not None:
                break   # another request issued it a moment ago

        if created:
            notify(cursor, acc_id, "course_done",
                   f"You completed the **{COURSE_NAME}**",
                   "Your Certificate of Completion is ready. Open it to view or print it.",
                   "/certificate", "course_done", is_read=notify_as_read)
        connection.commit()
        return get_certificate(cursor, acc_id)
    except Error:
        connection.rollback()
        raise
    finally:
        cursor.close()


def certificate_payload(certificate, facts=None):
    """
    What the learner pages get:
      unlocked  -> {unlocked: True, course_name, reference_no, completed_on, completed_on_short}
      locked    -> {unlocked: False, course_name, chapters_passed, chapters_total}
    """
    if certificate:
        issued = certificate["issued_at"]
        return {
            "unlocked": True,
            "course_name": certificate["course_name"],
            "reference_no": certificate["reference_no"],
            "completed_on": f"{issued.strftime('%B')} {issued.day}, {issued.year}",       # October 3, 2026
            "completed_on_short": f"{issued.strftime('%b')} {issued.day}, {issued.year}",  # Oct 3, 2026
        }
    facts = facts or {}
    return {
        "unlocked": False,
        "course_name": COURSE_NAME,
        "chapters_passed": int(facts.get("chapters_passed") or 0),
        "chapters_total": int(facts.get("chapters_total") or 0),
    }