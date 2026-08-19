/**
 * admin-upload-resource.js - Task #41: Upload Resource dependent dropdowns
 * ---------------------------------------------------------------------
 * Wires the Upload Resource modal's Category -> Module dependency.
 *
 * Reuses the EXISTING GET /admin/manage-course/categories endpoint
 * (admin_routes.py -> manage_course.get_categories_with_modules()),
 * which already returns every category together with its nested
 * modules - the exact same data source the Categories modal already
 * uses (see admin-manage-course.js's fetchCategories()). No new
 * backend route or duplicated query logic was needed for this task.
 *
 * Included on learning-resources.html, after admin-learning-resources.js.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const openBtn = document.getElementById("openUploadResourceBtn");
        const modal = document.getElementById("uploadResourceModal");
        const closeBtn = document.getElementById("closeUploadResourceModal");
        const form = document.getElementById("uploadResourceForm");

        const categorySelect = document.getElementById("resourceCategorySelect");
        const moduleSelect = document.getElementById("resourceModuleSelect");
        const titleInput = document.getElementById("resourceTitleInput");

        if (!modal || !categorySelect || !moduleSelect) return; // modal not on this page

        let categoriesData = []; // [{cat_id, category_name, modules:[{module_id, module_name, ...}]}]

        // ------------------------------------------------------------
        // Task #41, Requirement #3: Module dropdown disabled by default,
        // with its own explicit "locked" placeholder option.
        // ------------------------------------------------------------
        function disableModuleSelect() {
            moduleSelect.innerHTML = `<option value="" selected>Select a category first</option>`;
            moduleSelect.disabled = true;
        }

        function enableModuleSelectFor(catId) {
            const category = categoriesData.find(c => String(c.cat_id) === String(catId));
            const modules = category ? category.modules : [];

            if (!modules.length) {
                moduleSelect.innerHTML = `<option value="" selected>No modules in this category</option>`;
                moduleSelect.disabled = true;
                return;
            }

            moduleSelect.innerHTML = `<option value="" disabled selected>Select Module</option>` +
                modules.map(m => `<option value="${m.module_id}">${m.module_name}</option>`).join("");
            moduleSelect.disabled = false;
        }

        async function loadCategories() {
            categorySelect.innerHTML = `<option value="" selected>Loading categories&hellip;</option>`;
            disableModuleSelect();
            try {
                const resp = await fetch("/admin/manage-course/categories", { credentials: "include" });
                const result = await resp.json();
                categoriesData = result.success ? result.categories : [];

                if (!categoriesData.length) {
                    categorySelect.innerHTML = `<option value="" selected>No categories available</option>`;
                    return;
                }

                categorySelect.innerHTML = `<option value="" disabled selected>Select Category</option>` +
                    categoriesData.map(c => `<option value="${c.cat_id}">${c.category_name}</option>`).join("");
            } catch (err) {
                categorySelect.innerHTML = `<option value="" selected>Could not load categories</option>`;
            }
        }

        // Task #41, Requirement #3: selecting a valid Category enables
        // Module; clearing/resetting Category disables it again and
        // clears its options.
        categorySelect.addEventListener("change", () => {
            const catId = categorySelect.value;
            if (!catId) {
                disableModuleSelect();
                return;
            }
            enableModuleSelectFor(catId);
        });

        function resetForm() {
            if (form) form.reset();
            disableModuleSelect();
            categorySelect.innerHTML = `<option value="" selected>Loading categories&hellip;</option>`;
        }

        if (openBtn) {
            openBtn.addEventListener("click", (e) => {
                e.preventDefault();
                modal.classList.remove("modal-hidden");
                modal.style.display = "flex";
                loadCategories();
            });
        }

        function closeModal() {
            modal.style.display = "none";
            modal.classList.add("modal-hidden");
            resetForm();
        }

        if (closeBtn) closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // Exposed so admin-upload-resource.js's own submit handler
        // (added in Task #42 below) can close the modal the same way.
        window.cobraByteCloseUploadResourceModal = closeModal;
    });
})();