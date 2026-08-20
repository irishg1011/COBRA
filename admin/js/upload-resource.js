/**
 * upload-resource.js - Task #41 & Task #42
 * --------------------------------------------------------------------
 * Task #41: Dynamic Category -> Module dependent dropdowns for
 * Admin > Learning Resources > New Lesson. Category options are
 * rendered server-side from category_tbl (see admin_routes.py:
 * upload_resource()) - this script handles the dependent Module
 * dropdown: disabled until a valid Category is selected, then
 * populated live from
 *   GET /admin/upload-resource/modules-by-category?cat_id=<selected cat_id>
 * (admin_routes.py -> manage_course.get_modules_by_category()), scoped
 * to modules_tbl.cat_id = the selected category - never a hardcoded
 * mapping.
 *
 * Task #42: Global Lesson Name uniqueness + auto-formatting.
 *   - Live sentence-case normalization while typing (first character
 *     uppercase, rest lowercase - "javascript" -> "Javascript"),
 *     mirroring lesson_validation.format_lesson_title() on the server.
 *   - Debounced live duplicate check against
 *     GET /admin/upload-resource/check-lesson-name?name=<value>
 *     (admin_routes.py -> lesson_validation.validate_lesson_title()),
 *     shown as an inline error under the field - mirrors
 *     admin-create-admin.js's checkAvailability() pattern exactly.
 *   - Blocks form submission client-side while a known duplicate is
 *     showing (pure UX convenience - the backend's POST handler always
 *     re-validates uniqueness itself before anything is saved, so this
 *     check being bypassed can never let a duplicate through).
 *
 * Only present on pages that have #categorySelect and #moduleSelect
 * (currently just upload-resource.html), so this is safe to include as
 * a shared script without guard checks elsewhere.
 */
(function () {
    "use strict";

    const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module...</option>';
    const DEBOUNCE_MS = 400;

    document.addEventListener("DOMContentLoaded", () => {
        const categorySelect = document.getElementById("categorySelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const lessonNameInput = document.getElementById("lessonNameInput");
        const lessonNameError = document.getElementById("lessonNameError");
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
                // Requirement #5/#6: any category change (including back to
                // the placeholder) always clears the previous Module
                // selection first, so a stale module can never be submitted.
                resetModuleDropdown();

                if (!catId) return; // "Select category..." - stay disabled/cleared

                try {
                    const response = await fetch(
                        `/admin/upload-resource/modules-by-category?cat_id=${encodeURIComponent(catId)}`,
                        { credentials: "include" }
                    );
                    const result = await response.json();

                    if (!result.success || !Array.isArray(result.modules) || result.modules.length === 0) {
                        // Requirement #4/empty-state: no modules for this
                        // category (or a request failure) - keep the
                        // dropdown disabled with just the placeholder, never
                        // fake/mock options.
                        resetModuleDropdown();
                        return;
                    }

                    const optionsHtml = result.modules
                        .map(m => `<option value="${escapeHtml(m.module_id)}">${escapeHtml(m.module_name)}</option>`)
                        .join("");

                    moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML + optionsHtml;
                    moduleSelect.disabled = false;
                } catch (err) {
                    // Backend unreachable - never show mock modules; stay
                    // disabled/cleared instead.
                    resetModuleDropdown();
                }
            }

            categorySelect.addEventListener("change", () => {
                loadModulesForCategory(categorySelect.value);
            });

            // Task #45: when reopening a previously saved resource, the
            // server already renders categorySelect with the right
            // option selected (see admin_routes.py's upload_resource()
            // GET handler + upload-resource.html), but the dependent
            // Module dropdown still starts out empty/disabled - it's
            // only ever populated by the "change" handler above, which
            // never fires just from the server pre-selecting a value.
            // Kick off that same load once on page load whenever a
            // category is already selected, then restore the saved
            // module (moduleSelect's data-preselect-module-id, rendered
            // server-side from existing_resource.module_id) once the
            // real module list has finished loading.
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
        // Task #42: Lesson Name live formatting + global duplicate check
        // ------------------------------------------------------------
        if (!lessonNameInput) return; // field not present on this page

        let lastCheckedValue = "";
        let lastCheckAvailable = true; // optimistic until proven otherwise
        let debounceTimer = null;

        function showLessonNameError(message) {
            if (!lessonNameError) return;
            lessonNameError.textContent = message;
            lessonNameError.style.display = "block";
        }

        function clearLessonNameError() {
            if (!lessonNameError) return;
            lessonNameError.textContent = "";
            lessonNameError.style.display = "none";
        }

        // Live sentence-case normalization: first character uppercase,
        // every other character lowercase - "javascript" -> "Javascript",
        // "JAVASCRIPT" -> "Javascript", "jAvAsCrIpT" -> "Javascript".
        // Mirrors lesson_validation.format_lesson_title() exactly, but
        // preserves the caret position (like script.js's own live
        // formatters) so typing isn't disrupted mid-word.
        function formatLessonNameLive(value) {
            if (!value) return value;
            const lower = value.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
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
                    // Could not verify - fail safe (treat as unavailable)
                    // so an unverified duplicate can never slip through
                    // client-side, exactly like lesson_validation.py's
                    // own "fail safe on DB error" behavior.
                    lastCheckAvailable = false;
                    showLessonNameError(result.message || "Could not verify lesson name. Please try again.");
                    return;
                }

                lastCheckAvailable = !!result.available;

                if (!result.available) {
                    showLessonNameError(result.message || "A lesson with this name already exists.");
                } else {
                    clearLessonNameError();
                }
            } catch (err) {
                // Network/server unreachable - best-effort only; the
                // backend's POST handler re-validates uniqueness
                // authoritatively regardless, so this never blocks
                // correctness, only the live UX hint.
            }
        }

        // Also run once on blur, in case the debounce timer hasn't
        // fired yet and the admin tabs straight to the next field.
        lessonNameInput.addEventListener("blur", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            runDuplicateCheck();
        });

        if (uploadForm) {
            uploadForm.addEventListener("submit", (e) => {
                const value = lessonNameInput.value.trim();

                if (!value) {
                    e.preventDefault();
                    showLessonNameError("Lesson name is required.");
                    lessonNameInput.focus();
                    return;
                }

                // Only block submission on a CONFIRMED duplicate for the
                // exact value currently in the field - an unverified or
                // stale check never blocks submission client-side, since
                // the backend's POST handler is the true source of truth
                // and will reject it there regardless.
                if (value === lastCheckedValue && !lastCheckAvailable) {
                    e.preventDefault();
                    showLessonNameError("A lesson with this name already exists. Lesson names must be unique across all categories and modules.");
                    lessonNameInput.focus();
                }
            });
        }
    });
})();