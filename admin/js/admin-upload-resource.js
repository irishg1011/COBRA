/**
 * admin-upload-resource.js
 * ---------------------------------------------------------------------
 * TASK #41: Category -> Module dependent dropdowns for the Upload
 * Resource modal.
 *
 * Reuses the EXISTING GET /admin/manage-course/categories endpoint
 * (admin_routes.py -> manage_course.get_categories_with_modules()),
 * which already returns every category together with its nested
 * modules - the exact same data source the Categories modal already
 * uses (see admin-manage-course.js's fetchCategories()). No new
 * backend route or duplicated query logic was needed for the dropdown
 * data itself.
 *
 * TASK #42: Global lesson-title uniqueness + live sentence-case
 * normalization for the "Lesson / Resource Title" field, backed by two
 * new admin_routes.py endpoints (GET /admin/learning-resources/check-title,
 * POST /admin/learning-resources/create) whose actual logic lives in
 * learning_resources.py (is_resource_title_taken / create_learning_resource) -
 * this file only calls them and renders the result.
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
        const typeSelect = document.getElementById("resourceTypeSelectModal");
        const submitBtn = document.getElementById("submitUploadResourceBtn");

        if (!modal || !categorySelect || !moduleSelect) return; // modal not on this page

        // ==================================================================
        // TASK #41: Category -> Module dependency
        // ==================================================================
        let categoriesData = []; // [{cat_id, category_name, modules:[{module_id, module_name, ...}]}]

        // Requirement #3: Module dropdown disabled by default, with its
        // own explicit "locked" placeholder option.
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

        // Requirement #3: selecting a valid Category enables Module;
        // clearing/resetting Category disables it again and clears its
        // options.
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
            clearTitleError();
            titleTaken = false;
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

        window.cobraByteCloseUploadResourceModal = closeModal;

        // ==================================================================
        // TASK #42: live title normalization + global duplicate check
        // ==================================================================
        let titleTaken = false;
        let titleCheckTimer = null;

        function showTitleError(message) {
            let errorEl = titleInput.parentElement.querySelector(".js-error-message");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "js-error-message";
                errorEl.style.color = "#e02424";
                errorEl.style.fontSize = "12px";
                errorEl.style.marginTop = "6px";
                titleInput.parentElement.appendChild(errorEl);
            }
            errorEl.textContent = message;
        }

        function clearTitleError() {
            const errorEl = titleInput.parentElement.querySelector(".js-error-message");
            if (errorEl) errorEl.remove();
        }

        // Requirement #4: normalize live as the admin types - first
        // letter uppercase, every other letter lowercase (sentence
        // case) - matching text_formatting.format_display_name() on
        // the backend exactly.
        function normalizeSentenceCase(value) {
            if (!value) return "";
            const trimmed = value.replace(/^\s+/, "");
            if (!trimmed) return "";
            const lowered = trimmed.toLowerCase();
            return lowered[0].toUpperCase() + lowered.slice(1);
        }

        if (titleInput) {
            titleInput.addEventListener("input", () => {
                const start = titleInput.selectionStart, end = titleInput.selectionEnd;
                titleInput.value = normalizeSentenceCase(titleInput.value);
                if (start !== null && end !== null) titleInput.setSelectionRange(start, end);

                clearTitleError();
                titleTaken = false;

                const value = titleInput.value.trim();
                if (titleCheckTimer) clearTimeout(titleCheckTimer);
                if (!value) return;

                // Requirement #3 + #6: check against the DATABASE
                // (global, not just the current Category/Module),
                // debounced, no page reload.
                titleCheckTimer = setTimeout(async () => {
                    try {
                        const resp = await fetch(
                            `/admin/learning-resources/check-title?title=${encodeURIComponent(value)}`,
                            { credentials: "include" }
                        );
                        const result = await resp.json();
                        if (!result.success) return;
                        if (!result.available) {
                            titleTaken = true;
                            showTitleError("A resource with this lesson title already exists.");
                        } else {
                            titleTaken = false;
                            clearTitleError();
                        }
                    } catch (err) {
                        // best-effort - backend re-validates on submit regardless
                    }
                }, 400);
            });
        }

        // ==================================================================
        // Submit - Task #41 (category/module) + Task #42 (title)
        // ==================================================================
        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();

                // Requirement #5: block submission client-side when the
                // live check already found a duplicate.
                if (titleTaken) {
                    showTitleError("A resource with this lesson title already exists.");
                    return;
                }
                if (!categorySelect.value) {
                    alert("Please select a Category.");
                    return;
                }
                if (moduleSelect.disabled || !moduleSelect.value) {
                    alert("Please select a Module.");
                    return;
                }
                if (!titleInput.value.trim()) {
                    showTitleError("Lesson title is required.");
                    return;
                }

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = "Uploading...";
                }

                try {
                    const body = new URLSearchParams({
                        resource_title: titleInput.value.trim(),
                        cat_id: categorySelect.value,
                        module_id: moduleSelect.value,
                        resource_type_id: typeSelect ? typeSelect.value : "",
                    });
                    const resp = await fetch("/admin/learning-resources/create", {
                        method: "POST", credentials: "include", body
                    });
                    const result = await resp.json();

                    if (!result.success) {
                        // Requirement #6: inline error, no reload.
                        // Requirement #7: this is the SAME backend check
                        // that runs regardless of what the live check
                        // said, so a race (two admins typing the same
                        // title at once) is still caught here.
                        showTitleError(result.message);
                        return;
                    }

                    alert(result.message);
                    closeModal();

                    // If admin-learning-resources.js's live table reload
                    // is available, refresh so the new resource shows up
                    // immediately without a full page reload.
                    if (typeof window.cobraByteReloadResourcesTable === "function") {
                        window.cobraByteReloadResourcesTable();
                    }
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Resource';
                    }
                }
            });
        }
    });
})();