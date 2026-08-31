"""
resource_form_publish.py - Task #95: Save-then-publish for New Lesson
------------------------------------------------------------------------
Shared helper behind Admin > Learning Resources > Upload Resource
Publish. Persistence still lives in resource_draft.save_lesson_draft()
and resource_publishing.publish_resource(); this file only sequences
those two existing functions so admin_routes.py stays a thin HTTP
wrapper (same convention as upload_resource_save_draft()).
"""

from resource_draft import save_lesson_draft
from resource_publishing import publish_resource


def save_and_publish_lesson(
    resource_id=None,
    lesson_name="",
    cat_id=None,
    module_id=None,
    content_html="",
    uploaded_by=None,
):
    """
    Save the lesson (insert or update), then attempt to publish it.

    Returns:
        (success: bool, message: str, saved_resource_id)
        On a publish-gate failure the lesson is still saved as a Draft
        and saved_resource_id is returned so the admin can stay on it.
    """
    success, message, saved_resource_id = save_lesson_draft(
        resource_id=resource_id,
        lesson_name=lesson_name,
        cat_id=cat_id,
        module_id=module_id,
        content_html=content_html,
        uploaded_by=uploaded_by,
    )
    if not success:
        return False, message, saved_resource_id

    publish_success, publish_message = publish_resource(saved_resource_id)
    if not publish_success:
        return (
            False,
            f"Lesson saved as a draft, but could not publish it: {publish_message}",
            saved_resource_id,
        )

    return True, "Lesson published successfully.", saved_resource_id
