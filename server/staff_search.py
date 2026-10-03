"""
staff_search.py - The "Search anything..." box in the staff header
------------------------------------------------------------------------------
feat/staff-search

One search for the whole staff side. As the admin or mentor types, the
header shows a few matches per group; picking one opens the page that
owns it with that search already filled in.

    Pages               every sidebar page (by its name)
    Accounts            name, ID, username or email  -> Account & Security
    Learner progress    learners                     -> Learner Progress, By Learner
    Messages            sender, email or text        -> Messages
    Chapters / Modules                               -> Manage Course
    Lessons                                          -> Learning Resources
    Activities                                       -> Learning Activities
    Coding exercises                                 -> Coding Exercises
    Badges                                           -> Achievements

This file only FINDS things: every result names the Flask endpoint of
its page. admin_routes.py turns that into a URL and drops every result
whose page the logged-in role may not open (role_permissions.is_allowed),
so an admin never sees a mentor page here and the other way round - the
same map that guards the pages themselves.

Read-only. No Flask/session code here.
"""

from mysql.connector import Error

from cobradb import get_db_connection

MIN_QUERY_LENGTH = 2
PER_GROUP = 5

# (title, endpoint, extra words to match). Order = order shown.
PAGES = [
    ("Dashboard", "admin_bp.admin_dashboard", "home overview"),
    ("Dashboard", "admin_bp.mentor_dashboard", "home overview"),
    ("Account & Security", "admin_bp.account_security", "accounts users admins mentors learners create archive"),
    ("Login Logs", "admin_bp.login_logs", "sign in attempts failed locked lockout"),
    ("Publishing", "admin_bp.publishing", "publish preview content ready draft"),
    ("Manage Course", "admin_bp.manage_course", "chapters modules categories"),
    ("Learning Resources", "admin_bp.learning_resources", "lessons videos content"),
    ("Upload Lesson", "admin_bp.upload_resource", "create new lesson resource"),
    ("Learning Activities", "admin_bp.learning_activities", "multiple choice fill in the blanks flashcards quiz"),
    ("Create Learning Activity", "admin_bp.create_learning_activity_page", "new activity quiz"),
    ("Coding Exercises", "admin_bp.coding_exercises", "code problems test cases"),
    ("Create Coding Exercise", "admin_bp.create_coding_exercise", "new exercise"),
    ("Coding Sandbox", "admin_bp.coding_sandbox", "runs code snippets"),
    ("Learner Progress", "admin_bp.learner_progress", "scores completion lessons by lesson"),
    ("Learner Progress - By Learner", "admin_bp.learner_progress_learners", "scores completion course"),
    ("Analytics", "admin_bp.analytics", "charts statistics"),
    ("Recommendations", "admin_bp.recommendations", "weak topics review"),
    ("Achievements", "admin_bp.achievements", "badges awards"),
    ("Reports", "admin_bp.reports", "ranking top learners"),
    ("Messages", "admin_bp.messages", "contact inbox reply landing page"),
    ("Change Password", "admin_bp.staff_change_password", "security account"),
]


def _item(title, subtitle, endpoint, q=None):
    return {"title": title, "subtitle": subtitle or "", "endpoint": endpoint, "q": q}


def _pages(term):
    return [_item(title, "Page", endpoint)
            for title, endpoint, words in PAGES
            if term in title.lower() or term in words]


def _accounts(cursor, like):
    cursor.execute(
        """SELECT a.acc_id, a.email, ut.u_type AS role, p.firstname, p.lastname
           FROM account_tbl a
           JOIN usertype_tbl ut ON a.u_type = ut.ut_id
           LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
           WHERE (a.is_deleted = 0 OR a.is_deleted IS NULL)
             AND (LOWER(a.acc_id) LIKE %s OR LOWER(a.email) LIKE %s OR LOWER(a.username) LIKE %s
                  OR LOWER(CONCAT_WS(' ', p.firstname, p.lastname)) LIKE %s)
           ORDER BY p.firstname, p.lastname, a.acc_id
           LIMIT %s""",
        (like, like, like, like, PER_GROUP)
    )
    accounts, learners = [], []
    for r in cursor.fetchall():
        name = f"{r.get('firstname') or ''} {r.get('lastname') or ''}".strip() or r["acc_id"]
        accounts.append(_item(name, f"{r['role']} · {r['acc_id']} · {r['email']}",
                              "admin_bp.account_security", r["email"]))
        if r["role"] == "Learner":
            learners.append(_item(name, f"Progress of {r['acc_id']}",
                                  "admin_bp.learner_progress_learners", r["acc_id"]))
    return accounts, learners


def _messages(cursor, like):
    cursor.execute(
        """SELECT sender_name, sender_email, message
           FROM contact_messages_tbl
           WHERE LOWER(sender_name) LIKE %s OR LOWER(sender_email) LIKE %s OR LOWER(message) LIKE %s
           ORDER BY received_at DESC
           LIMIT %s""",
        (like, like, like, PER_GROUP)
    )
    items = []
    for r in cursor.fetchall():
        text = " ".join((r["message"] or "").split())
        items.append(_item(r["sender_name"], text[:70] + ("…" if len(text) > 70 else ""),
                           "admin_bp.messages", r["sender_email"]))
    return items


def _chapters(cursor, like):
    cursor.execute(
        """SELECT category_name FROM category_tbl
           WHERE COALESCE(is_archived, 0) = 0 AND LOWER(category_name) LIKE %s
           ORDER BY COALESCE(display_order, 999999), cat_id
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["category_name"], "Chapter", "admin_bp.manage_course", r["category_name"])
            for r in cursor.fetchall()]


def _modules(cursor, like):
    cursor.execute(
        """SELECT m.module_name, c.category_name
           FROM modules_tbl m
           LEFT JOIN category_tbl c ON m.cat_id = c.cat_id
           WHERE COALESCE(m.is_archived, 0) = 0 AND LOWER(m.module_name) LIKE %s
           ORDER BY m.module_name
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["module_name"], f"Module in {r['category_name']}" if r["category_name"] else "Module",
                  "admin_bp.manage_course", r["module_name"])
            for r in cursor.fetchall()]


def _lessons(cursor, like):
    cursor.execute(
        """SELECT lr.resource_title, lrs.lr_stats_name, m.module_name
           FROM learning_resources_tbl lr
           JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
           LEFT JOIN modules_tbl m ON lr.module_id = m.module_id
           WHERE lrs.lr_stats_name <> 'Archived' AND LOWER(lr.resource_title) LIKE %s
           ORDER BY lr.resource_title
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["resource_title"],
                  " · ".join(x for x in ("Lesson", r["lr_stats_name"], r["module_name"]) if x),
                  "admin_bp.learning_resources", r["resource_title"])
            for r in cursor.fetchall()]


def _activities(cursor, like):
    cursor.execute(
        """SELECT la.activity_title, las.la_stats_name, atp.activity_type_name
           FROM learning_activities_tbl la
           JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
           LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
           WHERE las.la_stats_name <> 'Archived' AND LOWER(la.activity_title) LIKE %s
           ORDER BY la.activity_title
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["activity_title"],
                  " · ".join(x for x in (r["activity_type_name"] or "Activity", r["la_stats_name"]) if x),
                  "admin_bp.learning_activities", r["activity_title"])
            for r in cursor.fetchall()]


def _exercises(cursor, like):
    cursor.execute(
        """SELECT exercise_title FROM coding_exercises_tbl
           WHERE COALESCE(is_archived, 0) = 0 AND LOWER(exercise_title) LIKE %s
           ORDER BY exercise_title
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["exercise_title"], "Coding exercise", "admin_bp.coding_exercises", r["exercise_title"])
            for r in cursor.fetchall()]


def _badges(cursor, like):
    cursor.execute(
        """SELECT badge_name, description FROM badges_tbl
           WHERE COALESCE(is_archived, 0) = 0 AND LOWER(badge_name) LIKE %s
           ORDER BY badge_name
           LIMIT %s""",
        (like, PER_GROUP)
    )
    return [_item(r["badge_name"], r["description"], "admin_bp.achievements", r["badge_name"])
            for r in cursor.fetchall()]


def search_everything(query):
    """
    Returns [{"label": str, "items": [{"title", "subtitle", "endpoint", "q"}]}]
    for every group that has a match - for ALL roles; the route keeps only
    what the logged-in role may open. A group whose table is missing or
    unreadable is simply left out (the others still answer).
    """
    term = " ".join((query or "").lower().split())
    if len(term) < MIN_QUERY_LENGTH:
        return []

    groups = []
    pages = _pages(term)
    if pages:
        groups.append({"label": "Pages", "items": pages})

    connection = get_db_connection()
    if connection is None:
        return groups
    like = f"%{term}%"
    try:
        cursor = connection.cursor(dictionary=True)

        def run(label, finder):
            try:
                items = finder(cursor, like)
            except Error as e:
                print(f"staff_search: '{label}' could not be searched: {e}")
                return
            if items:
                groups.append({"label": label, "items": items})

        try:
            accounts, learners = _accounts(cursor, like)
        except Error as e:
            print(f"staff_search: 'Accounts' could not be searched: {e}")
            accounts, learners = [], []
        if accounts:
            groups.append({"label": "Accounts", "items": accounts})
        if learners:
            groups.append({"label": "Learner progress", "items": learners})

        run("Messages", _messages)
        run("Chapters", _chapters)
        run("Modules", _modules)
        run("Lessons", _lessons)
        run("Activities", _activities)
        run("Coding exercises", _exercises)
        run("Badges", _badges)
        cursor.close()
    finally:
        if connection.is_connected():
            connection.close()
    return groups