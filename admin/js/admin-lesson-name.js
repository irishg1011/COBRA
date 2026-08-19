/**
 * admin-lesson-name.js - CobraByte Admin: Live Lesson Name
 * Formatting + Global Duplicate Validation
 * ------------------------------------------------------------------
 * Wires up the New Lesson form's Lesson Name input:
 *   - Live formatting as the admin types: first letter uppercase,
 *     every other letter lowercase (mirrors admin-create-admin.js's
 *     live name-capitalization pattern, just with a different rule -
 *     see normalizeLessonName() below).
 *   - Debounced GLOBAL duplicate check against
 *     /admin/lessons/check-name (no Category/Module scoping - matches
 *     the backend's global uniqueness rule).
 *   - Inline error message using the same showFieldError()/
 *     clearFieldError() pattern already used by
 *     admin-create-admin.js, so validation feedback looks and behaves
 *     consistently across the admin panel.
 *
 * ASSUMPTION (please adjust the selector below if it differs): the
 * Lesson Name input is referenced here as #lessonNameInput, matching
 * the "Enter lesson name..." field shown on the New Lesson form
 * screenshot. This script no-ops entirely if that element isn't on
 * the page, so it's safe to include everywhere.
 *
 * Include this on the Upload Learning Resource / New Lesson page,
 * after admin-script.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-lesson-name.js') }}"></script>
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const lessonNameInput = document.getElementById("lessonNameInput");
        if (!lessonNameInput) return;

        // ------------------------------------------------------------
        // Inline error helpers - identical shape to
        // admin-create-admin.js's showFieldError()/clearFieldError(),
        // so error styling/behavior is consistent app-wide.
        // ------------------------------------------------------------
        function showFieldError(input, message) {
            const formGroup = input.closest(".form-group") || input.parentElement;
            let errorEl = formGroup.querySelector(".js-error-message");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "js-error-message";
                errorEl.style.color = "#e02424";
                errorEl.style.fontSize = "12px";
                errorEl.style.marginTop = "6px";
                formGroup.appendChild(errorEl);
            }
            errorEl.textContent = message;
        }

        function clearFieldError(input) {
            const formGroup = input.closest(".form-group") || input.parentElement;
            const errorEl = formGroup.querySelector(".js-error-message");
            if (errorEl) errorEl.remove();
        }

        // ------------------------------------------------------------
        // Live formatting: first character uppercase, every other
        // character lowercase - matches text_formatting.format_display_name()
        // on the backend exactly, so what the admin sees while typing
        // is exactly what gets validated/saved.
        // ------------------------------------------------------------
        function normalizeLessonName(value) {
            const trimmed = value.replace(/^\s+/, ""); // don't fight leading spaces mid-typing
            if (!trimmed) return "";
            const lowered = trimmed.toLowerCase();
            return lowered.charAt(0).toUpperCase() + lowered.slice(1);
        }

        lessonNameInput.addEventListener("input", () => {
            const start = lessonNameInput.selectionStart;
            const end = lessonNameInput.selectionEnd;

            lessonNameInput.value = normalizeLessonName(lessonNameInput.value);

            if (start !== null && end !== null) {
                lessonNameInput.setSelectionRange(start, end);
            }
            clearFieldError(lessonNameInput);
        });

        // Final trim on blur (Task: "trim leading and trailing
        // whitespace") - done on blur rather than on every keystroke
        // so the admin can still type a trailing space mid-word
        // without it being stripped out from under them.
        lessonNameInput.addEventListener("blur", () => {
            lessonNameInput.value = lessonNameInput.value.trim();
        });

        // ------------------------------------------------------------
        // Debounced GLOBAL duplicate check - no Category/Module value
        // is ever sent to this endpoint, matching the backend's
        // global (not scoped) uniqueness rule.
        // ------------------------------------------------------------
        let debounceTimer = null;

        function checkDuplicate() {
            const value = lessonNameInput.value.trim();
            if (!value) { clearFieldError(lessonNameInput); return; }

            fetch(`/admin/lessons/check-name?name=${encodeURIComponent(value)}`, {
                credentials: "include",
            })
                .then((r) => r.json())
                .then((result) => {
                    if (!result.success) return;
                    if (result.available === false) {
                        showFieldError(lessonNameInput, "A lesson with this name already exists.");
                    } else {
                        clearFieldError(lessonNameInput);
                    }
                })
                .catch(() => {
                    // Best-effort - the backend re-validates on submit
                    // regardless (create_lesson()), so a network hiccup
                    // here never allows a real duplicate through.
                });
        }

        lessonNameInput.addEventListener("input", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(checkDuplicate, DEBOUNCE_MS);
        });

        // Expose the exact same formatting function the submit handler
        // can reuse, so "the formatted value is the value submitted"
        // is guaranteed even if submit fires before the debounce timer
        // ran (e.g. a fast Enter press).
        window.cobraByteNormalizeLessonName = normalizeLessonName;
    });
})();