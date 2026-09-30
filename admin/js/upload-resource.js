/**
 * upload-resource.js - Task #41, Task #42 & Task #93
 * --------------------------------------------------------------------
 * Task #41: Dynamic Category -> Module dependent dropdowns for
 * Admin > Learning Resources > New Lesson. Category options are
 * rendered server-side from category_tbl - this script handles the
 * dependent Module dropdown.
 *
 * Task #42: Global Lesson Name uniqueness + auto-formatting.
 *   - Live sentence-case normalization while typing.
 *   - Debounced live duplicate check against
 *     GET /admin/upload-resource/check-lesson-name?name=<value>.
 *
 * Task #93: Replaced inline layout-shifting errors with clean
 * red field borders (.field-error) and popup alerts.
 */
(function () {
    "use strict";

    const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module...</option>';
    const DEBOUNCE_MS = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const categorySelect = document.getElementById("categorySelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const lessonNameInput = document.getElementById("lessonNameInput");
        const uploadForm = document.getElementById("uploadModuleForm");

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // ------------------------------------------------------------
        // Task #41: Category -> Module dependent dropdown
        // ------------------------------------------------------------
        if (categorySelect && moduleSelect) {
            function resetModuleDropdown() {
                moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML;
                moduleSelect.disabled = true;
            }
            resetModuleDropdown();

            async function loadModulesForCategory(catId) {
                resetModuleDropdown();

                if (!catId) return;

                try {
                    const response = await fetch(
                        `/admin/upload-resource/modules-by-category?cat_id=${encodeURIComponent(catId)}`,
                        { credentials: "include" }
                    );
                    const result = await response.json();

                    if (!result.success || !Array.isArray(result.modules) || result.modules.length === 0) {
                        resetModuleDropdown();
                        return;
                    }

                    const optionsHtml = result.modules
                        .map(m => `<option value="${escapeHtml(m.module_id)}">${escapeHtml(m.module_name)}</option>`)
                        .join("");

                    moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML + optionsHtml;
                    moduleSelect.disabled = false;
                } catch (err) {
                    resetModuleDropdown();
                }
            }

            categorySelect.addEventListener("change", () => {
                loadModulesForCategory(categorySelect.value);
            });

            if (categorySelect.value) {
                const preselectModuleId = moduleSelect.dataset.preselectModuleId || "";
                loadModulesForCategory(categorySelect.value).then(() => {
                    if (preselectModuleId) {
                        moduleSelect.value = preselectModuleId;
                    }
                });
            }
        }

        // ------------------------------------------------------------
        // Task #42 & #93: Lesson Name formatting + duplicate check with red border & popup
        // ------------------------------------------------------------
        if (!lessonNameInput) return;

        let lastCheckedValue = "";
        let lastCheckAvailable = true;
        let lastCheckMessage = "";
        let debounceTimer = null;

        function showLessonNameError(message) {
            lessonNameInput.classList.add("field-error");
            if (typeof window.cobraByteShowResourcePopupAlert === "function") {
                window.cobraByteShowResourcePopupAlert(message, "error");
            }
        }

        function clearLessonNameError() {
            lessonNameInput.classList.remove("field-error");
            if (typeof window.cobraByteHideResourcePopupAlert === "function") {
                window.cobraByteHideResourcePopupAlert();
            }
        }

        // Only the first letter becomes capital - everything else stays
        // exactly as typed (same rule as the server's format_lesson_title()).
        function formatLessonNameLive(value) {
            if (!value) return value;
            return value.replace(/^(\s*)(\S)/, (m, space, ch) => space + ch.toUpperCase());
        }

        lessonNameInput.addEventListener("input", () => {
            const start = lessonNameInput.selectionStart;
            const end = lessonNameInput.selectionEnd;

            lessonNameInput.value = formatLessonNameLive(lessonNameInput.value);

            if (start !== null && end !== null) {
                lessonNameInput.setSelectionRange(start, end);
            }

            clearLessonNameError();
            scheduleDuplicateCheck();
        });

        function scheduleDuplicateCheck() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runDuplicateCheck, DEBOUNCE_MS);
        }

        async function runDuplicateCheck() {
            const value = lessonNameInput.value.trim();
            if (!value) {
                lastCheckedValue = "";
                lastCheckAvailable = true;
                clearLessonNameError();
                return;
            }

            try {
                const response = await fetch(
                    `/admin/upload-resource/check-lesson-name?name=${encodeURIComponent(value)}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                lastCheckedValue = value;

                if (!result.success) {
                    lastCheckAvailable = false;
                    showLessonNameError(result.message || "Could not verify lesson name. Please try again.");
                    return;
                }

                lastCheckAvailable = !!result.available;
                lastCheckMessage = result.message || "";

                if (!result.available) {
                    showLessonNameError(result.message || "A lesson with this name already exists.");
                } else {
                    clearLessonNameError();
                }
            } catch (err) {
                // Best-effort only
            }
        }

        lessonNameInput.addEventListener("blur", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            runDuplicateCheck();
        });

        if (uploadForm) {
            uploadForm.addEventListener("submit", (e) => {
                const value = lessonNameInput.value.trim();

                if (!value) {
                    e.preventDefault();
                    showLessonNameError("Please enter a lesson name.");
                    lessonNameInput.focus();
                    return;
                }

                if (value === lastCheckedValue && !lastCheckAvailable) {
                    e.preventDefault();
                    showLessonNameError(lastCheckMessage || "A lesson with this name already exists. Lesson names must be unique across all categories and modules.");
                    lessonNameInput.focus();
                }
            });
        }
    });
})();