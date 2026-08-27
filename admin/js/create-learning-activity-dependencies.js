/**
 * create-learning-activity-dependencies.js - Task #54: Category -> Module
 * -> Lesson Cascading Dependent Dropdowns
 * --------------------------------------------------------------------
 * Wires up the Create Learning Activity form's Activity Information
 * dropdowns (create-learning-activity.html: #courseSelect, #moduleSelect,
 * #lessonSelect) into a real cascading dependency, backed entirely by
 * live database lookups - no hardcoded categories/modules/lessons
 * anywhere in this file:
 *
 *   1. Category (#courseSelect) is already rendered server-side from
 *      category_tbl (see admin_routes.py's create_learning_activity_page()
 *      route -> manage_course.get_categories()), exactly like Upload
 *      Resource's own Category dropdown.
 *
 *   2. Module (#moduleSelect) starts EMPTY and DISABLED - locked until a
 *      valid Category is chosen. On every Category change, this script
 *      calls GET /admin/upload-resource/modules-by-category?cat_id=<id>
 *      (the same generic, already-existing endpoint Upload Resource's
 *      own Category -> Module dependency uses - see
 *      manage_course.get_modules_by_category()) and repopulates the
 *      Module dropdown with only the modules belonging to that category.
 *
 *   3. Lesson (#lessonSelect) starts EMPTY and DISABLED - locked until a
 *      valid Module is chosen. On every Module change, this script calls
 *      GET /admin/create-learning-activity/lessons-by-module?module_id=<id>
 *      (admin_routes.py -> learning_resources.get_resources_by_module())
 *      and repopulates the Lesson dropdown, mapping each resource_id to
 *      its resource_title.
 *
 * Changing a parent dropdown ALWAYS clears and re-locks every dropdown
 * beneath it first (Category change clears both Module and Lesson;
 * Module change clears Lesson), so a stale Module/Lesson selection that
 * no longer belongs to the newly-chosen parent can never be submitted.
 *
 * Task #45-style reload support: when reopening a previously saved
 * draft, the server already pre-selects Category (existing_activity.cat_id
 * - rendered directly into #courseSelect's markup) but the dependent
 * Module/Lesson dropdowns still start out empty/disabled, since they're
 * only ever populated by the "change" handlers below, which never fire
 * just from the server pre-selecting a value. This script mirrors
 * upload-resource.js's own reload handling: on page load, if a Category
 * is already selected, it kicks off the same Module load, restores the
 * saved Module (moduleSelect's data-preselect-module-id, rendered
 * server-side from existing_activity.module_id), then does the same one
 * level deeper for the Lesseen dropdown (data-preselect-resource-id, from
 * existing_activity.resource_id).
 *
 * Only present on pages that have #courseSelect, #moduleSelect, and
 * #lessonSelect (currently just create-learning-activity.html), so this
 * is safe to include as a shared script without guard checks elsewhere.
 */
(function () {
    "use strict";

    const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module</option>';
    const LESSON_PLACEHOLDER_HTML = '<option value="" disabled selected>Select lesson</option>';

    document.addEventListener("DOMContentLoaded", () => {
        const courseSelect = document.getElementById("courseSelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const lessonSelect = document.getElementById("lessonSelect");

        if (!courseSelect || !moduleSelect || !lessonSelect) return;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // ------------------------------------------------------------
        // Lesson dropdown (Module -> Lesson step)
        // ------------------------------------------------------------
        function resetLessonDropdown() {
            lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML;
            lessonSelect.disabled = true;
        }

        async function loadLessonsForModule(moduleId) {
            // Any Module change (including back to the placeholder)
            // always clears the previous Lesson selection first, so a
            // stale lesson can never be submitted alongside a different
            // module.
            resetLessonDropdown();

            if (!moduleId) return; // "Select module" - stay disabled/cleared

            try {
                const response = await fetch(
                    `/admin/create-learning-activity/lessons-by-module?module_id=${encodeURIComponent(moduleId)}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (!result.success || !Array.isArray(result.lessons) || result.lessons.length === 0) {
                    // No lessons for this module (or a request failure) -
                    // keep the dropdown disabled with just the
                    // placeholder, never fake/mock options.
                    resetLessonDropdown();
                    return;
                }

                const optionsHtml = result.lessons
                    .map(l => `<option value="${escapeHtml(l.resource_id)}">${escapeHtml(l.resource_title)}</option>`)
                    .join("");

                lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML + optionsHtml;
                lessonSelect.disabled = false;
            } catch (err) {
                // Backend unreachable - never show mock lessons; stay
                // disabled/cleared instead.
                resetLessonDropdown();
            }
        }

        // ------------------------------------------------------------
        // Module dropdown (Category -> Module step)
        // ------------------------------------------------------------
        function resetModuleDropdown() {
            moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML;
            moduleSelect.disabled = true;
        }

        async function loadModulesForCategory(catId) {
            // Any Category change (including back to the placeholder)
            // always clears the previous Module selection AND, in turn,
            // the Lesson selection beneath it - never allow a module or
            // lesson to survive without an active parent category.
            resetModuleDropdown();
            resetLessonDropdown();

            if (!catId) return; // "Select category" - stay disabled/cleared

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

        courseSelect.addEventListener("change", () => {
            loadModulesForCategory(courseSelect.value);
        });

        moduleSelect.addEventListener("change", () => {
            loadLessonsForModule(moduleSelect.value);
        });

        // ------------------------------------------------------------
        // Reload support: reopening a saved draft. The server already
        // pre-selects Category via #courseSelect's rendered <option
        // selected>, but Module/Lesson still start empty/disabled since
        // only the "change" handlers above ever populate them. Kick off
        // the same cascade once on load whenever a Category is already
        // selected, restoring the saved Module (and, once THAT finishes,
        // the saved Lesson) from the data-preselect-*-id attributes
        // rendered server-side by create-learning-activity.html.
        // ------------------------------------------------------------
        if (courseSelect.value) {
            const preselectModuleId = moduleSelect.dataset.preselectModuleId || "";
            loadModulesForCategory(courseSelect.value).then(() => {
                if (!preselectModuleId) return;
                moduleSelect.value = preselectModuleId;

                const preselectResourceId = lessonSelect.dataset.preselectResourceId || "";
                loadLessonsForModule(preselectModuleId).then(() => {
                    if (preselectResourceId) {
                        lessonSelect.value = preselectResourceId;
                    }
                });
            });
        }
    });
})();