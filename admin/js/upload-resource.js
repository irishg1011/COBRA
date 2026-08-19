/**
 * upload-resource.js - Task #41: Dynamic Category -> Module dependent
 * dropdowns for Admin > Learning Resources > New Lesson.
 * --------------------------------------------------------------------
 * Category options are rendered server-side from category_tbl (see
 * admin_routes.py: upload_resource()) - this script only handles the
 * dependent Module dropdown: disabled until a valid Category is
 * selected, then populated live from
 *   GET /admin/upload-resource/modules-by-category?cat_id=<selected cat_id>
 * (admin_routes.py -> manage_course.get_modules_by_category()), scoped
 * to modules_tbl.cat_id = the selected category - never a hardcoded
 * mapping.
 *
 * Only present on pages that have #categorySelect and #moduleSelect
 * (currently just upload-resource.html), so this is safe to include as
 * a shared script without guard checks elsewhere.
 */
(function () {
    "use strict";

    const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module...</option>';

    document.addEventListener("DOMContentLoaded", () => {
        const categorySelect = document.getElementById("categorySelect");
        const moduleSelect = document.getElementById("moduleSelect");

        if (!categorySelect || !moduleSelect) return;

        // Requirement #3: Module dropdown starts disabled/locked, even
        // if the server-rendered markup didn't already set it (belt and
        // suspenders - the template itself also renders `disabled`).
        function resetModuleDropdown() {
            moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML;
            moduleSelect.disabled = true;
        }
        resetModuleDropdown();

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

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
    });
})();