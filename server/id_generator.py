"""
id_generator.py - Shared Sequential Account ID Generator
-----------------------------------------------------------
Generalizes login.py's original generate_acc_id() (which only ever
produced Learner IDs with a hardcoded "LR" prefix) so ANY account
creation flow can generate its own prefixed, date-based sequential ID
against the same account_tbl - e.g. accounts created from the Admin >
Create Administrator modal use prefix "AD" instead of "LR", via this
one shared function, rather than a second copy of the ID logic.

Format:   <PREFIX><YYMMDD><NNNN>
Example:  AD2607290001, LR2607300002

IMPORTANT - concurrency & failure safety (identical guarantee to the
original Learner-only implementation):
This must be called from inside an open DB transaction (mysql-connector
defaults to autocommit=False, and the caller commits only after the
INSERT into account_tbl succeeds). It uses "SELECT ... FOR UPDATE" to
lock the row(s) matching today's prefix before reading the current
highest sequence number, so two concurrent creations for the same
prefix/day can never collide - the second caller's SELECT blocks until
the first transaction either commits (sees the new highest ID) or rolls
back (reuses that same sequence number).
"""

from datetime import datetime

ACCOUNT_TABLE = "account_tbl"


def generate_prefixed_acc_id(cursor, prefix, seq_digits=4):
    """
    Generates the next sequential ID for `prefix`, scoped to today's
    date, e.g. generate_prefixed_acc_id(cursor, "AD") -> "AD2607290001".

    Args:
        cursor: an open cursor on a connection with autocommit=False -
            the caller owns commit()/rollback().
        prefix (str): e.g. "LR" for Learner, "AD" for Admin.
        seq_digits (int): zero-padded width of the daily sequence.

    Returns:
        str: the newly generated, not-yet-inserted account ID.
    """
    today_prefix = f"{prefix}{datetime.now().strftime('%y%m%d')}"

    cursor.execute(
        f"""SELECT acc_id FROM {ACCOUNT_TABLE}
            WHERE acc_id LIKE %s
            ORDER BY acc_id DESC
            LIMIT 1
            FOR UPDATE""",
        (f"{today_prefix}%",)
    )
    row = cursor.fetchone()

    if row:
        last_seq = int(row[0][-seq_digits:])
        next_seq = last_seq + 1
    else:
        next_seq = 1

    return f"{today_prefix}{next_seq:0{seq_digits}d}"