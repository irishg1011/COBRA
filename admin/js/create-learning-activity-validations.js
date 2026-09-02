/**
 * create-learning-activity-validation.js - Task #53, #62, #102
 * --------------------------------------------------------------------
 * Handles:
 *   - Live casing normalization while typing: first character uppercase,
 *     every other character lowercase ("PYTHON QUIZ" -> "Python quiz").
 *   - Debounced live duplicate check with red border (.field-error)
 *     and popup alert notifications (zero inline layout shifts).
 *   - Lesson Activity Type uniqueness live check.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const activityTitleInput = document.getElementById("activityTitle");
        const createActivityForm = document.getElementById("createActivityForm");
        const activityIdInput = document.getElementById("activityIdInput");
        const lessonSelect = document.getElementById("lessonSelect");
        const activityTypeSelect = document.getElementById("activityType");

        if (!activityTitleInput) return; // field not present on this page

        let lastCheckedValue = "";
        let lastCheckAvailable = true;
        let debounceTimer = null;

        function showTitleError(message) {
            if (activityTitleInput) activityTitleInput.classList.add("field-error");
            if (typeof window.cobraByteShowActivityInfoModal === "function") {
                window.cobraByteShowActivityInfoModal(message, "Activity Title Missing");
            } else if (typeof window.cobraByteShowActivityPopupAlert === "function") {
                window.cobraByteShowActivityPopupAlert(message, "error");
            }
        }

        function clearTitleError() {
            if (activityTitleInput) activityTitleInput.classList.remove("field-error");
        }

        // Live casing normalization
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

            clearTitleError();
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
                clearTitleError();
                return;
            }

            try {
                const params = new URLSearchParams({ name: value });
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
                    lastCheckAvailable = false;
                    showTitleError(result.message || "Could not verify activity title. Please try again.");
                    return;
                }

                lastCheckAvailable = !!result.available;

                if (!result.available) {
                    showTitleError(result.message || "An activity with this title already exists.");
                } else {
                    clearTitleError();
                }
            } catch (err) {
                // Best-effort only
            }
        }

        activityTitleInput.addEventListener("blur", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            runDuplicateCheck();
        });

        // ------------------------------------------------------------
        // Task #62: Lesson Activity Type Uniqueness Live Validation
        // ------------------------------------------------------------
        let lastTypeAvailable = true;
        let lastTypeErrorMessage = "";

        function showTypeError(message) {
            if (activityTypeSelect) activityTypeSelect.classList.add("field-error");
            if (typeof window.cobraByteShowActivityInfoModal === "function") {
                window.cobraByteShowActivityInfoModal(message, "Activity Type Error");
            } else if (typeof window.cobraByteShowActivityPopupAlert === "function") {
                window.cobraByteShowActivityPopupAlert(message, "error");
            }
        }

        function clearTypeError() {
            if (activityTypeSelect) activityTypeSelect.classList.remove("field-error");
        }

        async function checkLessonActivityTypeUniqueness() {
            if (!lessonSelect || !activityTypeSelect) return;
            const lessonId = lessonSelect.value;
            const activityType = activityTypeSelect.value;

            if (!lessonId || !activityType) {
                lastTypeAvailable = true;
                lastTypeErrorMessage = "";
                clearTypeError();
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
                    showTypeError(lastTypeErrorMessage);
                } else {
                    lastTypeAvailable = true;
                    lastTypeErrorMessage = "";
                    clearTypeError();
                }
            } catch (err) {
                // Best-effort check
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
                    showTitleError("Activity title is required.");
                    activityTitleInput.focus();
                    return;
                }

                if (value === lastCheckedValue && !lastCheckAvailable) {
                    e.preventDefault();
                    showTitleError("An activity with this title already exists. Activity titles must be unique across the entire system.");
                    activityTitleInput.focus();
                    return;
                }

                if (!lastTypeAvailable && lastTypeErrorMessage) {
                    e.preventDefault();
                    showTypeError(lastTypeErrorMessage);
                    if (activityTypeSelect) activityTypeSelect.focus();
                    return;
                }
            });
        }
    });
})();