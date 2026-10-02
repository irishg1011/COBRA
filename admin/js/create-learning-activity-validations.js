/**
 * create-learning-activity-validation.js - Task #53, #62, #102
 * --------------------------------------------------------------------
 * Handles:
 *   - feat/activity-auto-title: the read-only Activity Title, filled as
 *     "<Lesson> – <Activity type>" whenever both are chosen (replaces the
 *     old typed title, its casing and its duplicate-title check).
 *   - Lesson Activity Type uniqueness live check.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const activityTitleInput = document.getElementById("activityTitle");
        const createActivityForm = document.getElementById("createActivityForm");
        const activityIdInput = document.getElementById("activityIdInput");
        const lessonSelect = document.getElementById("lessonSelect");
        const activityTypeSelect = document.getElementById("activityType");

        if (!activityTitleInput) return; // field not present on this page

        // ------------------------------------------------------------
        // feat/activity-auto-title: the title is "<Lesson> – <Activity
        // type>", filled here and read-only. It replaces the old typed
        // title + live casing + duplicate-title check: lesson names are
        // unique and each lesson has one activity per type, so this title
        // is unique too. The server builds it again on every save and
        // ignores whatever is sent.
        // ------------------------------------------------------------
        const TITLE_SEPARATOR = " \u2013 ";

        function clearTitleError() {
            if (activityTitleInput) activityTitleInput.classList.remove("field-error");
        }

        function selectedLessonName() {
            if (!lessonSelect || !lessonSelect.value) return "";
            const option = lessonSelect.options[lessonSelect.selectedIndex];
            return option ? option.textContent.trim() : "";
        }

        function updateGeneratedTitle() {
            const lesson = selectedLessonName();
            const type = activityTypeSelect ? activityTypeSelect.value : "";
            activityTitleInput.value = lesson && type ? `${lesson}${TITLE_SEPARATOR}${type}` : "";
            clearTitleError();
            if (typeof window.cobraByteRefreshCharCounters === "function") window.cobraByteRefreshCharCounters();
        }
        // create-learning-activity-dependencies.js calls this after it
        // fills / clears the Lesson dropdown by script (no "change" event).
        window.cobraByteUpdateActivityTitle = updateGeneratedTitle;

        if (lessonSelect) lessonSelect.addEventListener("change", updateGeneratedTitle);
        if (activityTypeSelect) activityTypeSelect.addEventListener("change", updateGeneratedTitle);
        // A reopened activity keeps its saved title until its lesson list loads.
        if (selectedLessonName()) updateGeneratedTitle();

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
                // feat/activity-auto-title: an empty title just means no lesson /
                // type yet - the Lesson check in the draft guard reports that.

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