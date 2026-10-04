"""
role_permissions.py - Who may use which /admin endpoint (feat/mentor-role)
-------------------------------------------------------------------------
ONE map: Flask endpoint -> the staff roles allowed to call it.

    Admin   accounts, monitoring, reports. Publishing is VIEW-ONLY for
            admins: the page, its read-only refresh and the read-only
            Preview endpoints - nothing that changes content.
    Mentor  all content and publishing.

Default-deny: an endpoint that is NOT in this map is refused to every
role (including admins), so a new route has to be added here on purpose.
admin_routes._require_admin_session() checks this on every request
after the session / archived checks, using the role loaded fresh from
the database (never from the session).

PUBLIC_ADMIN_ENDPOINTS in admin_routes.py (login, forgot password, the
tab-close beacon, static assets) skip the check because they run
without a session.
"""

from flask import url_for

from user_types import ADMIN_ROLE, MENTOR_ROLE

ADMIN = frozenset({ADMIN_ROLE})
MENTOR = frozenset({MENTOR_ROLE})
BOTH = frozenset({ADMIN_ROLE, MENTOR_ROLE})

# Where each role lands after login, and when it opens a page it can't use.
# Change a role's landing page here only (login + blocked-page redirects use it).
ADMIN_HOME_ENDPOINT = "admin_bp.admin_dashboard"
MENTOR_HOME_ENDPOINT = "admin_bp.mentor_dashboard"
ROLE_HOME_ENDPOINTS = {ADMIN_ROLE: ADMIN_HOME_ENDPOINT, MENTOR_ROLE: MENTOR_HOME_ENDPOINT}

NO_ACCESS_PAGE_MESSAGE = "You don't have access to that page."
NO_PERMISSION_MESSAGE = "You don't have permission to do that."


ENDPOINT_ROLES = {
    # ------------------------------------------------------------
    # Shared by both roles
    # ------------------------------------------------------------
    "admin_bp.admin_logout": BOTH,
    "admin_bp.admin_session_end_beacon": BOTH,  # also public (runs without a session)

    # Header search box (feat/staff-search) - results are filtered by this same map
    "admin_bp.staff_search": BOTH,

    # Profile photo in the shared header (feat/profile-photo) - own account only
    "admin_bp.profile_photo_upload": BOTH,
    "admin_bp.profile_photo_remove": BOTH,

    # Change Password from the header dropdown (feat/staff-change-password) - own account only
    "admin_bp.staff_change_password": BOTH,
    "admin_bp.staff_password_send_otp": BOTH,
    "admin_bp.staff_password_verify_otp": BOTH,
    "admin_bp.staff_password_reset": BOTH,

    # Publishing - admins view only (page + read-only refresh)
    "admin_bp.publishing": BOTH,
    "admin_bp.publishing_data": BOTH,

    # Read-only Preview (Publishing's big Preview button + per-item Preview).
    # The POSTs here only grade answers / keep preview state in the
    # session - nothing is written to the database.
    "admin_bp.publishing_preview_learning_map": BOTH,
    "admin_bp.publishing_preview_lessons": BOTH,
    "admin_bp.publishing_preview_lesson_content": BOTH,
    "admin_bp.publishing_preview_activities": BOTH,
    "admin_bp.publishing_preview_video": BOTH,
    "admin_bp.publishing_preview_exercise": BOTH,
    "admin_bp.publishing_preview_exercise_grade": BOTH,
    "admin_bp.publishing_preview_next_lesson": BOTH,
    "admin_bp.publishing_preview_check_answer": BOTH,
    "admin_bp.preview_play_page": BOTH,
    "admin_bp.preview_play_lesson_content": BOTH,
    "admin_bp.preview_play_activities": BOTH,
    "admin_bp.preview_play_mcq_state": BOTH,
    "admin_bp.preview_play_mcq_action": BOTH,
    "admin_bp.preview_play_fib_play": BOTH,
    "admin_bp.preview_play_fib_action": BOTH,
    "admin_bp.preview_play_flashcard_play": BOTH,
    "admin_bp.preview_play_flashcard_action": BOTH,
    "admin_bp.preview_play_mark_complete": BOTH,
    "admin_bp.preview_play_exercise_submit": BOTH,
    "admin_bp.preview_play_tally": BOTH,
    "admin_bp.learning_resources_preview_content": BOTH,  # Publishing's per-lesson Preview

    # ------------------------------------------------------------
    # Admin only - accounts, monitoring, reports
    # ------------------------------------------------------------
    "admin_bp.admin_dashboard": ADMIN,

    # Account & Security
    "admin_bp.account_security": ADMIN,
    "admin_bp.search_accounts": ADMIN,
    "admin_bp.accounts_filter": ADMIN,
    "admin_bp.account_detail": ADMIN,
    "admin_bp.account_archive": ADMIN,
    "admin_bp.account_restore": ADMIN,
    "admin_bp.accounts_archived": ADMIN,
    "admin_bp.create_administrator": ADMIN,
    "admin_bp.create_mentor": ADMIN,
    "admin_bp.preview_next_admin_id": ADMIN,
    "admin_bp.check_account_field_availability": ADMIN,

    # Login Logs
    "admin_bp.login_logs": ADMIN,
    "admin_bp.login_logs_data": ADMIN,
    "admin_bp.login_logs_metrics": ADMIN,

    # Coding Sandbox monitor
    "admin_bp.coding_sandbox": ADMIN,
    "admin_bp.coding_sandbox_data": ADMIN,
    "admin_bp.coding_sandbox_run_detail": ADMIN,

    # Learner Progress (By Lesson + By Learner)
    "admin_bp.learner_progress": ADMIN,
    "admin_bp.learner_progress_data": ADMIN,
    "admin_bp.learner_progress_detail": ADMIN,
    "admin_bp.learner_progress_learners": ADMIN,
    "admin_bp.learner_progress_learners_data": ADMIN,
    "admin_bp.learner_progress_learner_detail": ADMIN,

    "admin_bp.analytics": ADMIN,
    "admin_bp.analytics_data": ADMIN,
    "admin_bp.reports": ADMIN,
    "admin_bp.reports_data": ADMIN,

    # Header bell (feat/admin-bell) - the admin's own notifications; mentors have no bell
    "admin_bp.staff_notifications_list": ADMIN,
    "admin_bp.staff_notifications_count": ADMIN,
    "admin_bp.staff_notifications_read": ADMIN,
    "admin_bp.staff_notifications_read_all": ADMIN,

    # Messages (feat/contact-messages): landing page "Send Us a Message" inbox + replies
    "admin_bp.messages": ADMIN,
    "admin_bp.messages_data": ADMIN,
    "admin_bp.messages_detail": ADMIN,
    "admin_bp.messages_reply": ADMIN,

    # ------------------------------------------------------------
    # Mentor only - content and publishing actions
    # ------------------------------------------------------------
    "admin_bp.mentor_dashboard": MENTOR,  # the mentor's home page

    # Publishing actions (mark ready, publish, unpublish, checklist, reorder)
    "admin_bp.publishing_item_action": MENTOR,
    "admin_bp.publishing_checklist_action": MENTOR,
    "admin_bp.publishing_reorder": MENTOR,
    "admin_bp.publishing_unpublish_category": MENTOR,
    "admin_bp.publishing_unpublish_module": MENTOR,
    "admin_bp.publishing_unpublish_resource": MENTOR,
    "admin_bp.publishing_unpublish_activity": MENTOR,
    "admin_bp.publishing_unpublish_exercise": MENTOR,

    # Manage Course (categories + modules, archive / restore, history)
    "admin_bp.manage_course": MENTOR,
    "admin_bp.manage_course_data": MENTOR,
    "admin_bp.manage_course_categories": MENTOR,  # also fills Publishing's + Module / Edit modals
    "admin_bp.manage_course_create_category": MENTOR,
    "admin_bp.manage_course_update_category": MENTOR,
    "admin_bp.manage_course_category_ready_to_publish": MENTOR,
    "admin_bp.manage_course_category_move_to_draft": MENTOR,
    "admin_bp.manage_course_publish_category": MENTOR,
    "admin_bp.manage_course_category_archive_check": MENTOR,
    "admin_bp.manage_course_delete_category": MENTOR,
    "admin_bp.manage_course_archive_category": MENTOR,
    "admin_bp.manage_course_archived_categories": MENTOR,
    "admin_bp.manage_course_restore_category": MENTOR,
    "admin_bp.manage_course_category_restore_options": MENTOR,
    "admin_bp.manage_course_category_restore_selected": MENTOR,
    "admin_bp.manage_course_permanently_delete_category": MENTOR,
    "admin_bp.manage_course_create_module": MENTOR,
    "admin_bp.manage_course_update_module": MENTOR,
    "admin_bp.manage_course_module_archive_check": MENTOR,
    "admin_bp.manage_course_delete_module": MENTOR,
    "admin_bp.manage_course_publish_module": MENTOR,
    "admin_bp.manage_course_unpublish_module": MENTOR,
    "admin_bp.manage_course_ready_to_publish_module": MENTOR,
    "admin_bp.manage_course_archived_modules": MENTOR,
    "admin_bp.manage_course_restore_module": MENTOR,
    "admin_bp.manage_course_module_restore_options": MENTOR,
    "admin_bp.manage_course_module_restore_selected": MENTOR,
    "admin_bp.manage_course_permanently_delete_module": MENTOR,
    "admin_bp.title_history": MENTOR,
    "admin_bp.title_history_revert": MENTOR,

    # Learning Resources + Upload Lesson
    "admin_bp.learning_resources": MENTOR,
    "admin_bp.learning_resources_data": MENTOR,
    "admin_bp.publish_learning_resource": MENTOR,
    "admin_bp.unpublish_learning_resource": MENTOR,
    "admin_bp.ready_to_publish_learning_resource": MENTOR,
    "admin_bp.learning_resource_archive_check": MENTOR,
    "admin_bp.archive_learning_resource": MENTOR,
    "admin_bp.learning_resources_archived": MENTOR,
    "admin_bp.restore_learning_resource_route": MENTOR,
    "admin_bp.permanently_delete_learning_resource_route": MENTOR,
    "admin_bp.upload_resource": MENTOR,
    "admin_bp.upload_resource_check_lesson_name": MENTOR,
    "admin_bp.upload_resource_save_draft": MENTOR,
    "admin_bp.upload_resource_publish": MENTOR,
    "admin_bp.upload_resource_modules_by_category": MENTOR,

    # Video Tutorial
    "admin_bp.upload_video_tutorial": MENTOR,
    "admin_bp.upload_video_tutorial_save_draft": MENTOR,
    "admin_bp.upload_video_tutorial_publish": MENTOR,
    "admin_bp.archive_video_tutorial_route": MENTOR,

    # Learning Activities + Create Learning Activity
    "admin_bp.learning_activities": MENTOR,
    "admin_bp.learning_activities_data": MENTOR,
    "admin_bp.learning_activities_preview": MENTOR,
    "admin_bp.learning_activity_archive_check": MENTOR,
    "admin_bp.archive_learning_activity": MENTOR,
    "admin_bp.learning_activities_archived": MENTOR,
    "admin_bp.restore_learning_activity_route": MENTOR,
    "admin_bp.permanently_delete_learning_activity_route": MENTOR,
    "admin_bp.publish_learning_activity": MENTOR,
    "admin_bp.unpublish_learning_activity": MENTOR,
    "admin_bp.ready_to_publish_learning_activity": MENTOR,
    "admin_bp.delete_activity": MENTOR,
    "admin_bp.create_learning_activity_page": MENTOR,
    "admin_bp.create_learning_activity_save_draft": MENTOR,
    "admin_bp.create_activity_submit": MENTOR,
    "admin_bp.create_learning_activity_check_name": MENTOR,
    "admin_bp.create_learning_activity_check_lesson_activity_type": MENTOR,
    "admin_bp.create_learning_activity_lessons_by_module": MENTOR,

    # Coding Exercises + Create Coding Exercise
    "admin_bp.coding_exercises": MENTOR,
    "admin_bp.coding_exercises_data": MENTOR,
    "admin_bp.delete_exercise": MENTOR,
    "admin_bp.publish_coding_exercise": MENTOR,
    "admin_bp.unpublish_coding_exercise": MENTOR,
    "admin_bp.ready_to_publish_coding_exercise": MENTOR,
    "admin_bp.coding_exercises_archived": MENTOR,
    "admin_bp.restore_coding_exercise_route": MENTOR,
    "admin_bp.permanently_delete_coding_exercise_route": MENTOR,
    "admin_bp.coding_exercise_archive_check": MENTOR,
    "admin_bp.archive_coding_exercise": MENTOR,
    "admin_bp.coding_exercises_modules_by_category": MENTOR,
    "admin_bp.coding_exercises_lessons_by_module": MENTOR,
    "admin_bp.coding_exercises_check_title": MENTOR,
    "admin_bp.create_coding_exercise": MENTOR,
    "admin_bp.save_coding_exercise_draft": MENTOR,

    "admin_bp.recommendations": MENTOR,
    "admin_bp.recommendations_data": MENTOR,  # feat/mentor-recommendations
    "admin_bp.achievements": MENTOR,
    # Achievements (feat/mentor-achievements): mentor-made badges
    "admin_bp.achievements_data": MENTOR,
    "admin_bp.achievements_create_badge": MENTOR,
    "admin_bp.achievements_update_badge": MENTOR,
    "admin_bp.achievements_archive_badge": MENTOR,
    "admin_bp.achievements_restore_badge": MENTOR,
}


def is_allowed(endpoint, role):
    """True only when the endpoint is mapped AND lists this role."""
    return role in ENDPOINT_ROLES.get(endpoint, ())


def role_home_endpoint(role):
    return ROLE_HOME_ENDPOINTS.get(role, ADMIN_HOME_ENDPOINT)


def role_home_url(role):
    return url_for(role_home_endpoint(role))