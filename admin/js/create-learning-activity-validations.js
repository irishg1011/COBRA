/**
 * create-learning-activity-validation.js - Task #53: Activity Title
 * Live Casing Normalization + Global Uniqueness Check
 * --------------------------------------------------------------------
 * Mirrors upload-resource.js's Task #42 pattern exactly, scoped to
 * #activityTitle on create-learning-activity.html instead of
 * #lessonNameInput on upload-resource.html:
 *
 *   - Live casing normalization while typing: first character
 *     uppercase, every other character lowercase ("PYTHON QUIZ" ->
 *     "Python quiz"), mirroring activity_validation.format_activity_title()
 *     on the server, with caret position preserved so typing isn't
 *     disrupted mid-word.
 *   - Debounced live duplicate check against
 *     GET /admin/create-learning-activity/check-activity-name
 *     (admin_routes.py -> activity_validation.validate_activity_title()),
 *     shown as an inline error under/beside the field.
 *   - Blocks form submission client-side while a known duplicate is
 *     showing (pure UX convenience - the backend's POST handler
 *     (create_activity_submit) and the Save Draft path
 *     (learning_activity_draft.save_activity_draft()) both always
 *     re-validate uniqueness themselves before anything is saved, so
 *     this check being bypassed can never let a duplicate through).
 *
 * Only present on pages that have #activityTitle and
 * #createActivityForm (currently just create-learning-activity.html),
 * so this is safe to include as a shared script without guard checks
 * elsewhere.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const activityTitleInput = document.getElementById("activityTitle");
        const activityTitleError = document.getElementById("activityTitleError");
        const createActivityForm = document.getElementById("createActivityForm");
        const activityIdInput = document.getElementById("activityIdInput");

        if (!activityTitleInput) return; // field not present on this page

        let lastCheckedValue = "";
        let lastCheckAvailable = true; // optimistic until proven otherwise
        let debounceTimer = null;

        function showActivityTitleError(message) {
            if (!activityTitleError) return;
            activityTitleError.textContent = message;
            activityTitleError.style.display = "block";
        }

        function clearActivityTitleError() {
            if (!activityTitleError) return;
            activityTitleError.textContent = "";
            activityTitleError.style.display = "none";
        }

        // Task #53: live casing normalization - first character
        // uppercase, every other character lowercase - "PYTHON QUIZ" ->
        // "Python quiz", "python QUIZ" -> "Python quiz". Mirrors
        // activity_validation.format_activity_title() exactly, but
        // preserves the caret position so typing isn't disrupted
        // mid-word.
        function formatActivityTitleLive(value) {
            if (!value) return value;
            const lower = value.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        }

        activityTitleInput.addEventListener("input", () => {
            const start = activityTitleInput.selectionStart;
            const end = activityTitleInput.selectionEnd;

            activityTitleInput.value = formatActivityTitleLive(activityTitleInput.value);

            if (start !== null && end !== null) {
                activityTitleInput.setSelectionRange(start, end);
            }

            clearActivityTitleError();
            scheduleDuplicateCheck();
        });

        function scheduleDuplicateCheck() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runDuplicateCheck, DEBOUNCE_MS);
        }

        async function runDuplicateCheck() {
            const value = activityTitleInput.value.trim();
            if (!value) {
                lastCheckedValue = "";
                lastCheckAvailable = true;
                clearActivityTitleError();
                return;
            }

            try {
                const params = new URLSearchParams({ name: value });
                // Editing an existing draft - exclude its own row from
                // the duplicate check, same convention the server-side
                // validate_activity_title(exclude_la_id=...) uses.
                if (activityIdInput && activityIdInput.value) {
                    params.set("activity_id", activityIdInput.value);
                }

                const response = await fetch(
                    `/admin/create-learning-activity/check-activity-name?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                lastCheckedValue = value;

                if (!result.success) {
                    // Could not verify - fail safe (treat as unavailable)
                    // so an unverified duplicate can never slip through
                    // client-side.
                    lastCheckAvailable = false;
                    showActivityTitleError(result.message || "Could not verify activity title. Please try again.");
                    return;
                }

                lastCheckAvailable = !!result.available;

                if (!result.available) {
                    showActivityTitleError(result.message || "An activity with this title already exists.");
                } else {
                    clearActivityTitleError();
                }
            } catch (err) {
                // Network/server unreachable - best-effort only; the
                // backend's POST handler re-validates uniqueness
                // authoritatively regardless.
            }
        }

        // Also run once on blur, in case the debounce timer hasn't
        // fired yet and the admin tabs straight to the next field.
        activityTitleInput.addEventListener("blur", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            runDuplicateCheck();
        });

        // ------------------------------------------------------------
        // Task #62: Lesson Activity Type Uniqueness Live Validation
        // ------------------------------------------------------------
        const lessonSelect = document.getElementById("lessonSelect");
        const activityTypeSelect = document.getElementById("activityType");
        const activityTypeError = document.getElementById("activityTypeError");

        let lastTypeAvailable = true;
        let lastTypeErrorMessage = "";

        function showActivityTypeError(message) {
            if (!activityTypeError) return;
            activityTypeError.textContent = message;
            activityTypeError.style.display = "block";
        }

        function clearActivityTypeError() {
            if (!activityTypeError) return;
            activityTypeError.textContent = "";
            activityTypeError.style.display = "none";
        }

        async function checkLessonActivityTypeUniqueness() {
            if (!lessonSelect || !activityTypeSelect) return;
            const lessonId = lessonSelect.value;
            const activityType = activityTypeSelect.value;

            if (!lessonId || !activityType) {
                lastTypeAvailable = true;
                lastTypeErrorMessage = "";
                clearActivityTypeError();
                return;
            }

            try {
                const params = new URLSearchParams({
                    lesson_id: lessonId,
                    activity_type: activityType
                });
                if (activityIdInput && activityIdInput.value) {
                    params.set("activity_id", activityIdInput.value);
                }

                const response = await fetch(
                    `/admin/create-learning-activity/check-lesson-activity-type?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (!result.success || !result.available) {
                    lastTypeAvailable = false;
                    lastTypeErrorMessage = result.message || `A ${activityType} activity already exists for this lesson.`;
                    showActivityTypeError(lastTypeErrorMessage);
                } else {
                    lastTypeAvailable = true;
                    lastTypeErrorMessage = "";
                    clearActivityTypeError();
                }
            } catch (err) {
                // Best-effort client check - backend enforces authoritatively
            }
        }

        if (lessonSelect) {
            lessonSelect.addEventListener("change", checkLessonActivityTypeUniqueness);
        }
        if (activityTypeSelect) {
            activityTypeSelect.addEventListener("change", checkLessonActivityTypeUniqueness);
        }

        if (createActivityForm) {
            createActivityForm.addEventListener("submit", (e) => {
                const value = activityTitleInput.value.trim();

                if (!value) {
                    e.preventDefault();
                    showActivityTitleError("Activity title is required.");
                    activityTitleInput.focus();
                    return;
                }

                // Only block submission on a CONFIRMED duplicate for the
                // exact value currently in the field - an unverified or
                // stale check never blocks submission client-side, since
                // the backend's POST handler is the true source of truth
                // and will reject it there regardless.
                if (value === lastCheckedValue && !lastCheckAvailable) {
                    e.preventDefault();
                    showActivityTitleError("An activity with this title already exists. Activity titles must be unique across the entire system.");
                    activityTitleInput.focus();
                    return;
                }

                // Task #62: Block submission if activity type is already taken for this lesson
                if (!lastTypeAvailable && lastTypeErrorMessage) {
                    e.preventDefault();
                    showActivityTypeError(lastTypeErrorMessage);
                    if (activityTypeSelect) activityTypeSelect.focus();
                    return;
                }
            });
        }
    });
})();