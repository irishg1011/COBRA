"""
achievements.py - Mentor > Achievements (Achievement Tracking)
------------------------------------------------------------------
DB helpers behind the Mentor > Achievements page:

    get_achievements_data()  - stat cards + one page of the Badges tab
                               or the Earned Badges tab (also feeds the
                               View Awarded Badges modal)
    get_requirement_limits() - the highest Required Value each content-based
                               requirement type can have (published content only)
    create_badge()           - Create Badge modal (with icon upload)
    update_badge()           - the same modal in Edit mode
    set_badge_archived()     - Archive / Restore (soft archive only)

Same convention as sandbox_monitor.py / coding_exercises.py: no
Flask/session code here; admin_routes.py is the only place these become
HTTP responses. The badge tables, the fixed requirement types and the
awarding rules live in badges.py - this file never awards a badge.

Badge icons are images uploaded by the mentor (PNG, JPG or WebP, 1 MB
max). They are stored in the database (uploaded_images_tbl, see
image_uploads.py) under a random name; badges_tbl.icon_file keeps that
name and the browser loads the image from /media/<name>.
"""

import re
import secrets
from datetime import datetime
from mysql.connector import Error

from cobradb import get_db_connection
from image_uploads import (  # ONE copy of the image checks, shared with profile_avatar.py
    has_upload, read_image_upload, save_image, delete_image, stored_name_regex,
    ensure_image_schema, ERROR_SIZE, ERROR_EMPTY,
)
from badges import (
    BADGES_TABLE, LEARNER_BADGES_TABLE, REQUIREMENT_BY_KEY,
    DEFAULT_BADGE_COLOR, DEFAULT_BADGE_ICON,
    ensure_badge_schema, criteria_text, badge_icon_url,
)
from text_formatting import format_display_name

PROFILE_TABLE = "profile_tbl"
DEFAULT_PER_PAGE = 8

MAX_ICON_BYTES = 1 * 1024 * 1024
ICON_FILE_PREFIX = "badge"
ICON_TYPE_MESSAGE = "The icon must be a PNG, JPG or WebP image."
ICON_SIZE_MESSAGE = "The icon must be 1 MB or smaller."
_ICON_FILE_REGEX = stored_name_regex(ICON_FILE_PREFIX)

# Field limits - also sent to the page so the inputs use the same numbers.
BADGE_LIMITS = {"name": 60, "description": 150, "criteria": 150, "max_value": 9999}

# The swatches in the Create Badge modal (a custom color is also allowed).
BADGE_COLOR_SWATCHES = [
    "#2DD4BF", "#22C55E", "#15803D", "#EAB308", "#F97316",
    "#EF4444", "#EC4899", "#A855F7", "#3B82F6", "#0EA5E9",
]
_COLOR_REGEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

STATUS_FILTERS = {"active": 0, "archived": 1}

# Requirement types that count CONTENT: their Required Value can never be
# higher than what is published right now, or no learner could earn the
# badge. key -> (singular, plural) for the messages. The other types
# (sandbox runs, saved snippets, learning hours, login days) have no such
# ceiling and keep BADGE_LIMITS["max_value"].
PUBLISHED_COUNT_NOUNS = {
    "lessons_completed": ("lesson", "lessons"),
    "modules_passed": ("module", "modules"),
    "chapters_completed": ("chapter", "chapters"),
    "perfect_mcq": ("Multiple Choice activity", "Multiple Choice activities"),
    "perfect_fib": ("Fill in the Blanks activity", "Fill in the Blanks activities"),
    "perfect_flashcards": ("Flashcards activity", "Flashcards activities"),
    "exercises_passed": ("coding exercise", "coding exercises"),
}
ACTIVITY_TYPE_KEYS = {
    "Multiple Choice": "perfect_mcq",
    "Quiz": "perfect_mcq",
    "Fill in the Blanks": "perfect_fib",
    "Flashcards": "perfect_flashcards",
}
# Published lessons in chapters / modules that are not archived - the same
# lessons learners can open (learner_progress_monitor._load_course_tree).
PUBLISHED_LESSONS_SQL = """
    FROM learning_resources_tbl lr
    JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
    JOIN modules_tbl m ON lr.module_id = m.module_id
    JOIN category_tbl c ON m.cat_id = c.cat_id
    WHERE lrs.lr_stats_name = 'Published'
      AND COALESCE(c.is_archived, 0) = 0
      AND COALESCE(m.is_archived, 0) = 0
"""


# ------------------------------------------------------------------
# Formatting helpers
# ------------------------------------------------------------------
def _fmt_date(dt):
    """e.g. 'Jan 1, 2026'. NULL -> '—'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _clean_date(value):
    """Only a real 'YYYY-MM-DD' date is used; anything else is ignored."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _where(clauses):
    return ("WHERE " + " AND ".join(clauses)) if clauses else ""


def _paging(total, page, per_page):
    per_page = max(1, per_page)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = min(max(1, page or 1), total_pages)
    return page, per_page, total_pages, (page - 1) * per_page


def _full_name(row):
    return f"{row.get('firstname') or ''} {row.get('lastname') or ''}".strip()


def _badge_look(row):
    """What the page needs to draw a badge's icon tile."""
    return {
        "icon": row.get("icon") or DEFAULT_BADGE_ICON,
        "icon_url": badge_icon_url(row.get("icon_file")),
        "color": row.get("color") or DEFAULT_BADGE_COLOR,
    }


def _empty_metrics():
    return {"total_badges": 0, "badges_awarded": 0, "unique_earners": 0, "avg_per_earner": "0"}


def empty_achievements_data(tab="badges"):
    """Used when the DB is unreachable so the page still answers."""
    return {
        "tab": tab, "rows": [], "metrics": _empty_metrics(),
        "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1,
    }


# ------------------------------------------------------------------
# Required Value ceiling: how much published content there is
# ------------------------------------------------------------------
def _published_counts(cursor):
    """
    {requirement key: how many are published right now} for the
    content-based types only. Counts what learners can actually reach:
    published lessons (and the modules / chapters that hold them), and the
    published activities and coding exercises under those lessons.
    """
    counts = {key: 0 for key in PUBLISHED_COUNT_NOUNS}

    cursor.execute(
        f"""SELECT COUNT(*) AS lessons,
                   COUNT(DISTINCT lr.module_id) AS modules,
                   COUNT(DISTINCT m.cat_id) AS chapters
            {PUBLISHED_LESSONS_SQL}"""
    )
    row = cursor.fetchone() or {}
    counts["lessons_completed"] = int(row.get("lessons") or 0)
    counts["modules_passed"] = int(row.get("modules") or 0)
    counts["chapters_completed"] = int(row.get("chapters") or 0)

    cursor.execute(
        f"""SELECT atp.activity_type_name AS type_name, COUNT(*) AS n
            FROM learning_activities_tbl la
            JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
            JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
            WHERE las.la_stats_name = 'Published'
              AND la.resource_id IN (SELECT lr.resource_id {PUBLISHED_LESSONS_SQL})
            GROUP BY atp.activity_type_name"""
    )
    for row in cursor.fetchall():
        key = ACTIVITY_TYPE_KEYS.get(row["type_name"])
        if key:
            counts[key] += int(row["n"] or 0)

    cursor.execute(
        f"""SELECT COUNT(*) AS n
            FROM coding_exercises_tbl ce
            JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
            WHERE las.la_stats_name = 'Published'
              AND COALESCE(ce.is_archived, 0) = 0
              AND ce.resource_id IN (SELECT lr.resource_id {PUBLISHED_LESSONS_SQL})"""
    )
    counts["exercises_passed"] = int((cursor.fetchone() or {}).get("n") or 0)
    return counts


def get_requirement_limits(cursor):
    """
    For the Create / Edit Badge modal:
        {requirement key: {"max": int, "text": "11 published chapters"}}
    Only the content-based types are listed. {} when the counts could not
    be read (the modal then shows no ceiling; saving checks again).
    """
    try:
        counts = _published_counts(cursor)
    except Error as e:
        print(f"achievements: could not count published content: {e}")
        return {}
    limits = {}
    for key, count in counts.items():
        singular, plural = PUBLISHED_COUNT_NOUNS[key]
        limits[key] = {"max": count, "text": f"{count} published {singular if count == 1 else plural}"}
    return limits


def _value_error(cursor, requirement_type, required_value):
    """
    Message when `required_value` is more than the published content the
    requirement type counts; None when it is fine or the type has no ceiling.
    """
    if requirement_type not in PUBLISHED_COUNT_NOUNS:
        return None
    try:
        count = _published_counts(cursor)[requirement_type]
    except Error as e:
        print(f"achievements: could not count published content: {e}")
        return None   # counts unreadable - the general 1..max_value rule already passed
    singular, plural = PUBLISHED_COUNT_NOUNS[requirement_type]
    if count == 0:
        return f"There are no published {plural} yet. Publish one first, or choose another requirement type."
    if required_value > count:
        if count == 1:
            return f"Only 1 {singular} is published, so the required value can only be 1."
        return f"Only {count} {plural} are published. Enter a whole number from 1 to {count}."
    return None


# ------------------------------------------------------------------
# Stat cards (whole system, not affected by the table filters)
# ------------------------------------------------------------------
def _get_metrics(cursor):
    cursor.execute(f"SELECT COUNT(*) AS n FROM {BADGES_TABLE} WHERE is_archived = 0")
    total_badges = int(cursor.fetchone()["n"] or 0)

    cursor.execute(
        f"SELECT COUNT(*) AS awarded, COUNT(DISTINCT acc_id) AS earners FROM {LEARNER_BADGES_TABLE}"
    )
    row = cursor.fetchone() or {}
    awarded = int(row.get("awarded") or 0)
    earners = int(row.get("earners") or 0)
    average = round(awarded / earners, 1) if earners else 0

    return {
        "total_badges": total_badges,
        "badges_awarded": awarded,
        "unique_earners": earners,
        "avg_per_earner": f"{average:g}",
    }


# ------------------------------------------------------------------
# Badges tab
# ------------------------------------------------------------------
def _get_badges_page(cursor, search_query, status_filter, date_from, date_to, page, per_page):
    clauses, params = [], []

    term = (search_query or "").strip().lower()
    if term:
        clauses.append("LOWER(b.badge_name) LIKE %s")
        params.append(f"%{term}%")
    status = STATUS_FILTERS.get((status_filter or "").strip().lower())
    if status is not None:
        clauses.append("b.is_archived = %s")
        params.append(status)
    if date_from:
        clauses.append("DATE(b.created_at) >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("DATE(b.created_at) <= %s")
        params.append(date_to)
    where_sql = _where(clauses)

    cursor.execute(f"SELECT COUNT(*) AS total FROM {BADGES_TABLE} b {where_sql}", tuple(params))
    total = cursor.fetchone()["total"]
    page, per_page, total_pages, offset = _paging(total, page, per_page)

    cursor.execute(
        f"""
        SELECT b.badge_id, b.badge_name, b.description, b.icon, b.icon_file, b.color,
               b.requirement_type, b.required_value, b.criteria_description,
               b.is_archived, b.created_at,
               COALESCE(e.earners, 0) AS earners
        FROM {BADGES_TABLE} b
        LEFT JOIN (
            SELECT badge_id, COUNT(*) AS earners
            FROM {LEARNER_BADGES_TABLE}
            GROUP BY badge_id
        ) e ON e.badge_id = b.badge_id
        {where_sql}
        ORDER BY b.is_archived ASC, b.display_order ASC, b.badge_id ASC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [per_page, offset])
    )

    rows = []
    for row in cursor.fetchall():
        req = REQUIREMENT_BY_KEY.get(row["requirement_type"])
        rows.append({
            "badge_id": row["badge_id"],
            "name": row["badge_name"],
            "description": row["description"],
            "requirement_type": row["requirement_type"] or "",
            "requirement_label": req["label"] if req else "",
            "required_value": row["required_value"],
            "criteria": row["criteria_description"] or criteria_text(row["requirement_type"], row["required_value"]),
            "earners": int(row["earners"] or 0),
            "is_archived": bool(row["is_archived"]),
            "created_at": _fmt_date(row["created_at"]),
            **_badge_look(row),
        })
    return rows, total, page, per_page, total_pages


# ------------------------------------------------------------------
# Earned Badges tab + View Awarded Badges modal
# ------------------------------------------------------------------
def _get_earned_page(cursor, search_query, status_filter, date_from, date_to, learner, page, per_page):
    clauses, params = [], []

    term = (search_query or "").strip().lower()
    if term:
        clauses.append(
            "(LOWER(lb.acc_id) LIKE %s OR LOWER(b.badge_name) LIKE %s "
            "OR LOWER(CONCAT_WS(' ', p.firstname, p.lastname)) LIKE %s)"
        )
        params.extend([f"%{term}%"] * 3)
    status = STATUS_FILTERS.get((status_filter or "").strip().lower())
    if status is not None:
        clauses.append("b.is_archived = %s")
        params.append(status)
    if date_from:
        clauses.append("DATE(lb.earned_at) >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("DATE(lb.earned_at) <= %s")
        params.append(date_to)
    learner = (learner or "").strip()
    if learner:
        clauses.append("lb.acc_id = %s")
        params.append(learner)
    where_sql = _where(clauses)

    from_sql = f"""
        FROM {LEARNER_BADGES_TABLE} lb
        INNER JOIN {BADGES_TABLE} b ON b.badge_id = lb.badge_id
        LEFT JOIN {PROFILE_TABLE} p ON p.acc_id = lb.acc_id
    """

    cursor.execute(f"SELECT COUNT(*) AS total {from_sql} {where_sql}", tuple(params))
    total = cursor.fetchone()["total"]
    page, per_page, total_pages, offset = _paging(total, page, per_page)

    cursor.execute(
        f"""
        SELECT lb.lb_id, lb.acc_id, lb.earned_at,
               b.badge_name, b.icon, b.icon_file, b.color, b.is_archived,
               p.firstname, p.lastname
        {from_sql}
        {where_sql}
        ORDER BY lb.earned_at DESC, lb.lb_id DESC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [per_page, offset])
    )

    rows = [{
        "lb_id": row["lb_id"],
        "acc_id": row["acc_id"],
        "learner_name": _full_name(row),
        "badge_name": row["badge_name"],
        "is_archived": bool(row["is_archived"]),
        "earned_at": _fmt_date(row["earned_at"]),
        **_badge_look(row),
    } for row in cursor.fetchall()]
    return rows, total, page, per_page, total_pages


def _get_badge_earners(cursor):
    """Learners with at least one badge - the modal's learner dropdown."""
    cursor.execute(
        f"""
        SELECT lb.acc_id, MAX(p.firstname) AS firstname, MAX(p.lastname) AS lastname
        FROM {LEARNER_BADGES_TABLE} lb
        LEFT JOIN {PROFILE_TABLE} p ON p.acc_id = lb.acc_id
        GROUP BY lb.acc_id
        ORDER BY lb.acc_id
        """
    )
    return [{"acc_id": row["acc_id"], "name": _full_name(row)} for row in cursor.fetchall()]


# ------------------------------------------------------------------
# Page data
# ------------------------------------------------------------------
def get_achievements_data(tab="badges", search_query=None, status_filter=None, date_from=None,
                          date_to=None, learner=None, page=1, per_page=DEFAULT_PER_PAGE,
                          include_learners=False):
    """
    Returns:
        {
            "tab": "badges" | "earned", "rows": [...], "metrics": {...},
            "total": int, "page": int, "per_page": int, "total_pages": int,
            "learners": [...]   # only when include_learners is True
        }
    or None if the database is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_badge_schema(connection, cursor)

        tab = "earned" if tab == "earned" else "badges"
        date_from = _clean_date(date_from)
        date_to = _clean_date(date_to)

        if tab == "earned":
            rows, total, page, per_page, total_pages = _get_earned_page(
                cursor, search_query, status_filter, date_from, date_to, learner, page, per_page)
        else:
            rows, total, page, per_page, total_pages = _get_badges_page(
                cursor, search_query, status_filter, date_from, date_to, page, per_page)

        data = {
            "tab": tab,
            "rows": rows,
            "metrics": _get_metrics(cursor),
            "requirement_limits": get_requirement_limits(cursor),
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
        if include_learners:
            data["learners"] = _get_badge_earners(cursor)

        cursor.close()
        return data

    except Error as e:
        print(f"achievements: failed to load data: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Icon upload (the checks themselves live in image_uploads.py)
# ------------------------------------------------------------------
def _read_icon(file_storage):
    """
    Checks an uploaded icon WITHOUT saving it.
    Returns (data, extension, error_message) - error_message is None when valid.
    """
    data, extension, error = read_image_upload(file_storage, MAX_ICON_BYTES)
    if error == ERROR_SIZE:
        return None, None, ICON_SIZE_MESSAGE
    if error == ERROR_EMPTY:
        return None, None, "The icon file is empty."
    if error:
        return None, None, ICON_TYPE_MESSAGE
    return data, extension, None


def _save_icon(cursor, data, extension):
    """Stores the icon in the database (caller's transaction) and returns its name."""
    return save_image(cursor, ICON_FILE_PREFIX, data, extension)


def _delete_icon(cursor, filename):
    """Removes an icon this module saved (caller's transaction)."""
    delete_image(cursor, ICON_FILE_PREFIX, filename)


def _has_file(file_storage):
    return has_upload(file_storage)


# ------------------------------------------------------------------
# Create / Edit validation
# ------------------------------------------------------------------
def _validate_badge_form(cursor, form, badge_id=None, saved_rule=None):
    """
    Returns (clean, errors). `errors` maps a field key (name, description,
    color, requirement_type, required_value, criteria) to its message.
    Name, description and criteria only get their first letter
    capitalized - the rest is kept as typed.

    For the content-based requirement types the required value can not be
    more than the published content (see _value_error). saved_rule is the
    (requirement_type, required_value) an existing badge already has:
    leaving it unchanged is always allowed, so a badge saved before content
    was unpublished can still have its name, icon or color edited.
    """
    errors = {}

    name = format_display_name(form.get("name"))
    if not name:
        errors["name"] = "Badge name is required."
    elif len(name) > BADGE_LIMITS["name"]:
        errors["name"] = f"Badge name must be {BADGE_LIMITS['name']} characters or fewer."
    else:
        cursor.execute(
            f"""SELECT is_archived FROM {BADGES_TABLE}
                WHERE LOWER(badge_name) = LOWER(%s) AND badge_id <> %s
                LIMIT 1""",
            (name, badge_id or 0)
        )
        clash = cursor.fetchone()
        if clash:
            errors["name"] = ("This name is used by an archived badge." if clash["is_archived"]
                              else "A badge with this name already exists.")

    description = format_display_name(form.get("description"))
    if not description:
        errors["description"] = "Badge description is required."
    elif len(description) > BADGE_LIMITS["description"]:
        errors["description"] = f"Description must be {BADGE_LIMITS['description']} characters or fewer."

    color = (form.get("color") or "").strip()
    if not _COLOR_REGEX.match(color):
        errors["color"] = "Pick a badge color."
    color = color.upper()

    requirement_type = (form.get("requirement_type") or "").strip()
    if requirement_type not in REQUIREMENT_BY_KEY:
        errors["requirement_type"] = "Choose a requirement type."

    required_value = None
    raw_value = (form.get("required_value") or "").strip()
    if raw_value.isdigit() and 1 <= int(raw_value) <= BADGE_LIMITS["max_value"]:
        required_value = int(raw_value)
        if "requirement_type" not in errors and (requirement_type, required_value) != saved_rule:
            too_high = _value_error(cursor, requirement_type, required_value)
            if too_high:
                errors["required_value"] = too_high
    else:
        errors["required_value"] = f"Enter a whole number from 1 to {BADGE_LIMITS['max_value']}."

    criteria = format_display_name(form.get("criteria"))
    if len(criteria) > BADGE_LIMITS["criteria"]:
        errors["criteria"] = f"Criteria must be {BADGE_LIMITS['criteria']} characters or fewer."
    elif not criteria and "requirement_type" not in errors and required_value:
        criteria = criteria_text(requirement_type, required_value)

    clean = {
        "name": name, "description": description, "color": color,
        "requirement_type": requirement_type, "required_value": required_value,
        "criteria": criteria,
    }
    return clean, errors


def _invalid(errors):
    return {"success": False, "message": "Please fix the highlighted fields.", "errors": errors}, 400


def _db_down():
    return {"success": False, "message": "Could not connect to the database."}, 500


# ------------------------------------------------------------------
# Create
# ------------------------------------------------------------------
def create_badge(form, icon_file, created_by):
    """
    Create Badge modal. `form` is request.form, `icon_file` is
    request.files.get('icon'), `created_by` is the mentor's acc_id from
    the session. Returns (payload, http_status).
    """
    connection = get_db_connection()
    if connection is None:
        return _db_down()

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_badge_schema(connection, cursor)
        ensure_image_schema(cursor)

        clean, errors = _validate_badge_form(cursor, form)

        icon_data = icon_extension = None
        if not _has_file(icon_file):
            errors["icon"] = "Upload a badge icon."
        else:
            icon_data, icon_extension, icon_error = _read_icon(icon_file)
            if icon_error:
                errors["icon"] = icon_error
        if errors:
            cursor.close()
            return _invalid(errors)

        saved_icon = _save_icon(cursor, icon_data, icon_extension)

        cursor.execute(f"SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM {BADGES_TABLE}")
        next_order = cursor.fetchone()["next_order"]

        cursor.execute(
            f"""INSERT INTO {BADGES_TABLE}
                    (badge_code, badge_name, description, icon, display_order, icon_file, color,
                     requirement_type, required_value, criteria_description,
                     is_archived, created_by, created_at)
                VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, 0, %s, NOW())""",
            (f"custom_{secrets.token_hex(8)}", clean["name"], clean["description"], next_order,
             saved_icon, clean["color"], clean["requirement_type"], clean["required_value"],
             clean["criteria"], created_by)
        )
        connection.commit()
        cursor.close()
        return {"success": True, "message": f'Badge "{clean["name"]}" created.'}, 201

    except (Error, OSError) as e:
        print(f"achievements: failed to create badge: {e}")
        try:
            connection.rollback()   # also undoes the stored icon - no orphan
        except Error:
            pass
        return {"success": False, "message": "Could not save the badge. Please try again."}, 500
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Edit
# ------------------------------------------------------------------
def update_badge(badge_id, form, icon_file):
    """
    Edit Badge modal. A new icon is optional - without one the badge
    keeps its current image. Learners who already earned the badge keep
    it whatever changes here. Returns (payload, http_status).
    """
    connection = get_db_connection()
    if connection is None:
        return _db_down()

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_badge_schema(connection, cursor)
        ensure_image_schema(cursor)

        cursor.execute(
            f"SELECT badge_id, icon_file, requirement_type, required_value FROM {BADGES_TABLE} WHERE badge_id = %s",
            (badge_id,)
        )
        current = cursor.fetchone()
        if not current:
            cursor.close()
            return {"success": False, "message": "Badge not found."}, 404

        clean, errors = _validate_badge_form(
            cursor, form, badge_id=badge_id,
            saved_rule=(current["requirement_type"], current["required_value"]))

        icon_data = icon_extension = None
        if _has_file(icon_file):
            icon_data, icon_extension, icon_error = _read_icon(icon_file)
            if icon_error:
                errors["icon"] = icon_error
        if errors:
            cursor.close()
            return _invalid(errors)

        saved_icon = _save_icon(cursor, icon_data, icon_extension) if icon_data else None

        cursor.execute(
            f"""UPDATE {BADGES_TABLE}
                SET badge_name = %s, description = %s, color = %s,
                    requirement_type = %s, required_value = %s, criteria_description = %s,
                    icon_file = %s, updated_at = NOW()
                WHERE badge_id = %s""",
            (clean["name"], clean["description"], clean["color"], clean["requirement_type"],
             clean["required_value"], clean["criteria"],
             saved_icon or current["icon_file"], badge_id)
        )
        if saved_icon:
            _delete_icon(cursor, current["icon_file"])   # the replaced image is no longer used
        connection.commit()
        cursor.close()

        return {"success": True, "message": f'Badge "{clean["name"]}" updated.'}, 200

    except (Error, OSError) as e:
        print(f"achievements: failed to update badge {badge_id}: {e}")
        try:
            connection.rollback()   # also undoes the stored icon - no orphan
        except Error:
            pass
        return {"success": False, "message": "Could not save the badge. Please try again."}, 500
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Archive / Restore (soft - the row and every earned record stay)
# ------------------------------------------------------------------
def set_badge_archived(badge_id, archived):
    """Returns (payload, http_status)."""
    connection = get_db_connection()
    if connection is None:
        return _db_down()

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_badge_schema(connection, cursor)

        cursor.execute(f"SELECT badge_name FROM {BADGES_TABLE} WHERE badge_id = %s", (badge_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return {"success": False, "message": "Badge not found."}, 404

        cursor.execute(
            f"UPDATE {BADGES_TABLE} SET is_archived = %s, updated_at = NOW() WHERE badge_id = %s",
            (1 if archived else 0, badge_id)
        )
        connection.commit()
        cursor.close()

        action = "archived" if archived else "restored"
        return {"success": True, "message": f'Badge "{row["badge_name"]}" {action}.'}, 200

    except Error as e:
        print(f"achievements: failed to archive/restore badge {badge_id}: {e}")
        try:
            connection.rollback()
        except Error:
            pass
        return {"success": False, "message": "Could not update the badge. Please try again."}, 500
    finally:
        if connection.is_connected():
            connection.close()