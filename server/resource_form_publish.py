"""
resource_form_publish.py - Task #95: Save-then-mark-ready for New Lesson
------------------------------------------------------------------------
Shared helper behind the lesson editor's main button. Persistence still
lives in resource_draft.save_lesson_draft(); this file only sequences
the save with the next status step so admin_routes.py stays a thin HTTP
wrapper.

feat/publishing-tree: the editor's button is now "Mark Ready" instead of
"Publish" - lessons only go live from the Publishing page. The function
keeps its old name so both routes that call it
(/admin/upload-resource POST and /admin/upload-resource/publish) need no
changes.
"""

from resource_draft import save_lesson_draft
from publishing_actions import mark_ready


def save_and_publish_lesson(
    resource_id=None,
    lesson_name="",
    cat_id=None,
    module_id=None,
    content_html="",
    uploaded_by=None,
):
    """
    Save the lesson (insert or update), then mark it Ready to Publish.

    Returns:
        (success: bool, message: str, saved_resource_id)
        If marking ready is blocked (e.g. its module is still Draft), the
        lesson is still saved and saved_resource_id is returned so the
        admin can stay on it.
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

    ready_ok, ready_message, _ = mark_ready("lesson", saved_resource_id)
    if not ready_ok:
        return (
            False,
            f"Lesson saved, but could not mark it ready: {ready_message}",
            saved_resource_id,
        )

    return True, "Lesson saved and marked as Ready to Publish.", saved_resource_id
