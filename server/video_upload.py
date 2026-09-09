"""
video_upload.py - New Video Tutorial: Video File Upload Handling
------------------------------------------------------------------
Pure file-storage helpers backing the "Video File" upload control on
Admin > Manage Learning Resources > New Video Tutorial
(upload-video-tutorial.html), mirroring this project's existing
convention (resource_draft.py / coding_exercises.py, etc.): this file
never touches Flask session state directly - admin_routes.py is the
only place these get turned into HTTP responses.

WHAT THIS FILE DOES
Validates and persists an uploaded video file (MP4/WebM/MOV, max 2GB)
to disk, reusing the ALREADY-EXISTING admin_bp static-file serving
mechanism (admin_bp's static_folder is ADMIN_DIR - see
admin_routes.py's Blueprint(...) definition) instead of creating a new
upload/serving route: every file saved here lives under
ADMIN_DIR/uploads/videos/ and is reachable at
url_for('admin_bp.static', filename='uploads/videos/<name>') exactly
like any other file already under the admin/ folder - no new static
route is created.

No database logic lives here - video_tutorials.py is the only place
that reads/writes video_tutorials_tbl. This file's only job is turning
a Werkzeug FileStorage into a safe, unique file on disk (or rejecting
it with a clear message the frontend can show via its existing custom
popup/modal notification pattern - never a native alert()).
"""

import os
import uuid
from werkzeug.utils import secure_filename

# Task requirement: "Supported formats: MP4, WebM, MOV"
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}

# Task requirement: "Maximum file size: 2GB"
MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024  # 2GB

# Relative to admin_dir (ADMIN_DIR in admin_routes.py) - NOT an
# absolute path, so the value saved to video_tutorials_tbl.file_path
# can be handed straight to url_for('admin_bp.static', filename=...).
VIDEO_UPLOAD_SUBDIR = "uploads/videos"


def _get_extension(filename):
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def is_allowed_video_extension(filename):
    """True if `filename`'s extension is one of the supported video
    formats (mp4/webm/mov) - case-insensitive."""
    return _get_extension(filename) in ALLOWED_VIDEO_EXTENSIONS


def format_file_size(num_bytes):
    """
    Human-readable file size, e.g. 245000000 -> "245.0 MB". Matches the
    "Max size: 2GB" hint's unit convention already shown on
    upload-video-tutorial.html.
    """
    if not num_bytes:
        return "0 B"
    try:
        num_bytes = float(num_bytes)
    except (TypeError, ValueError):
        return "0 B"

    for unit in ("B", "KB", "MB", "GB"):
        if unit == "B":
            if num_bytes < 1024.0:
                return f"{int(num_bytes)} B"
        elif num_bytes < 1024.0 or unit == "GB":
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} GB"


def _get_file_size(file_storage):
    """
    Determines a Werkzeug FileStorage's size in bytes without assuming
    Flask's MAX_CONTENT_LENGTH is configured (it isn't, in this
    project - see app.py). Seeks to the end and back so the stream is
    left in a readable state for the caller's subsequent .save().
    """
    stream = file_storage.stream
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    return size


def save_video_file(file_storage, admin_dir):
    """
    Validates and persists an uploaded video file.

    Args:
        file_storage: the Werkzeug FileStorage from
            request.files.get('video_file'). May be None/empty (no
            file chosen this request) - this is not itself an error;
            callers decide whether a file is REQUIRED for the action
            being performed (Task #10 vs #11: Save Draft does not
            require one, Publish does - see
            video_tutorials.save_video_tutorial()).
        admin_dir (str): the same ADMIN_DIR admin_routes.py already
            resolves admin_bp's static_folder to - the video is saved
            under <admin_dir>/uploads/videos/ so it's served by the
            EXISTING admin_bp.static route, never a new one.

    Returns:
        (success: bool, relative_path: str | None, size_bytes: int | None, error_message: str | None)

        relative_path is the value to store as
        video_tutorials_tbl.file_path (e.g. "uploads/videos/intro-
        3f9c2b1a9e4d.mp4") - relative to admin_dir, so it can be
        handed straight to url_for('admin_bp.static', filename=...).
    """
    if file_storage is None or not getattr(file_storage, "filename", ""):
        return False, None, None, "No video file was provided."

    original_name = file_storage.filename
    if not is_allowed_video_extension(original_name):
        return False, None, None, "Unsupported file type. Please upload a MP4, WebM, or MOV video file."

    size_bytes = _get_file_size(file_storage)
    if size_bytes <= 0:
        return False, None, None, "The selected video file appears to be empty."
    if size_bytes > MAX_VIDEO_SIZE_BYTES:
        return False, None, None, "This video exceeds the maximum allowed size of 2GB."

    upload_dir = os.path.join(admin_dir, *VIDEO_UPLOAD_SUBDIR.split("/"))
    try:
        os.makedirs(upload_dir, exist_ok=True)
    except OSError as e:
        return False, None, None, f"Could not prepare the upload folder: {e}"

    extension = _get_extension(original_name)
    safe_base = secure_filename(os.path.splitext(original_name)[0]) or "video"
    unique_name = f"{safe_base}-{uuid.uuid4().hex[:12]}.{extension}"
    absolute_path = os.path.join(upload_dir, unique_name)

    try:
        file_storage.save(absolute_path)
    except OSError as e:
        return False, None, None, f"Could not save the uploaded video: {e}"

    relative_path = f"{VIDEO_UPLOAD_SUBDIR}/{unique_name}"
    return True, relative_path, size_bytes, None


def delete_video_file(admin_dir, relative_path):
    """
    Best-effort cleanup of a previously saved video file (e.g. when an
    admin replaces a video with a new one on the same draft). Never
    raises - a failed delete just leaves an orphaned file on disk,
    which is safer than blocking the save that triggered it.
    """
    if not relative_path:
        return
    absolute_path = os.path.join(admin_dir, *relative_path.split("/"))
    try:
        if os.path.isfile(absolute_path):
            os.remove(absolute_path)
    except OSError:
        pass