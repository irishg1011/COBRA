/**
 * admin-upload-resource.js - CobraByte Admin: New Lesson / Upload
 * Learning Resource - Dynamic Category -> Module Dropdowns
 * ---------------------------------------------------------------
 * Wires up the "New Lesson" form's Category and Module dropdowns to
 * the backend (admin_routes.py: /admin/upload-resource/categories and
 * /admin/upload-resource/modules), which in turn read real data from
 * category_tbl / modules_tbl via manage_course.py.
 *
 * Behavior:
 *   - On page load: Category is populated from the database; Module
 *     stays disabled with its placeholder until a Category is chosen.
 *   - On Category change: any previously selected Module is cleared,
 *     old Module options are removed, and only modules belonging to
 *     the newly selected cat_id are fetched and shown. Module is
 *     enabled only if that category actually has modules.
 *
 * Expected markup (IDs only - existing layout/styling untouched):
 *   <select id="lessonCategorySelect">...</select>
 *   <select id="lessonModuleSelect" disabled>...</select>
 *
 * Include this on the Upload Learning Resource page, after
 * admin-script.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-upload-resource.js') }}"></script>
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const categorySelect = document.getElementById("lessonCategorySelect");
        const moduleSelect = document.getElementById("lessonModuleSelect");

        // No-op on any page that doesn't have this exact form - safe to
        // include everywhere without guard checks elsewhere.
        if (!categorySelect || !moduleSelect) return;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        /**
         * Resets the Module dropdown to a disabled placeholder state -
         * used on initial load, whenever the Category changes, and
         * while a fetch for the new Category is in flight.
         */
        function setModuleDisabledState(placeholderText) {
            moduleSelect.innerHTML =
                `<option value="" disabled selected>${escapeHtml(placeholderText)}</option>`;
            moduleSelect.disabled = true;
        }

        // Module is disabled by default until a valid Category is chosen.
        setModuleDisabledState("Select module...");

        /**
         * Loads Category options from category_tbl (never hardcoded).
         * Does not preselect any category - the placeholder stays
         * selected until the admin actively picks one.
         */
        async function loadCategories() {
            try {
                const response = await fetch("/admin/upload-resource/categories", {
                    credentials: "include",
                });
                const result = await response.json();
                if (!result.success || !Array.isArray(result.categories)) return;

                const options = result.categories
                    .map(c => `<option value="${c.cat_id}">${escapeHtml(c.category_name)}</option>`)
                    .join("");

                categorySelect.innerHTML =
                    `<option value="" disabled selected>Select category...</option>${options}`;
            } catch (err) {
                console.error("admin-upload-resource: failed to load categories:", err);
            }
        }

        /**
         * Loads Module options scoped to a single cat_id - only ever
         * called with a Category the admin explicitly selected. Any
         * previously loaded modules (from a different Category) are
         * fully replaced, never merged/appended.
         */
        async function loadModulesForCategory(catId) {
            setModuleDisabledState("Loading modules...");

            try {
                const response = await fetch(
                    `/admin/upload-resource/modules?cat_id=${encodeURIComponent(catId)}`,
                    { credentials: "include" }
                );
                const result = await response.json();
                const modules = (result.success && Array.isArray(result.modules))
                    ? result.modules
                    : [];

                if (modules.length === 0) {
                    // Task requirement: no modules for this category ->
                    // keep Module unavailable, with an empty-state
                    // placeholder, rather than showing an empty enabled
                    // dropdown or modules from another category.
                    setModuleDisabledState("No modules for this category");
                    return;
                }

                const options = modules
                    .map(m => `<option value="${m.module_id}">${escapeHtml(m.module_name)}</option>`)
                    .join("");

                moduleSelect.innerHTML =
                    `<option value="" disabled selected>Select module...</option>${options}`;
                moduleSelect.disabled = false;
            } catch (err) {
                console.error("admin-upload-resource: failed to load modules:", err);
                setModuleDisabledState("Could not load modules");
            }
        }

        // Task requirement: changing Category always resets/reloads
        // Module - clearing any previous selection and previous
        // options before fetching the new Category's modules.
        categorySelect.addEventListener("change", () => {
            const catId = categorySelect.value;
            if (!catId) {
                setModuleDisabledState("Select module...");
                return;
            }
            loadModulesForCategory(catId);
        });

        loadCategories();
    });
})();