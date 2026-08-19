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
 * TASK #44: Unsaved-changes protection.
 *   - Every relevant field (Category, Module, Title, Resource Type)
 *     marks the form "dirty" the moment it changes.
 *   - Closing the modal (X button, outside click) while dirty asks the
 *     admin what to do, via the SAME window.confirm() pattern already
 *     used elsewhere in this project (e.g. admin-create-admin.js's own
 *     "unsaved changes" close-guard) rather than a new modal component:
 *       1st confirm  -> OK = Save as Draft, Cancel = choose whether to discard
 *       2nd confirm  -> OK = Leave without saving, Cancel = stay on the form
 *   - "Save as Draft" reuses the EXACT SAME create endpoint the normal
 *     "Upload Resource" submit uses - Task #43 already guarantees every
 *     new resource defaults to Draft, so no new backend behavior is
 *     needed here at all.
 *   - The dirty flag is only cleared after a REQUEST SUCCEEDS (normal
 *     submit or Save as Draft) - a failed request leaves it dirty, and
 *     the modal stays open so the admin doesn't lose their input.
 *   - A standard beforeunload listener protects against real browser
 *     navigation/tab close/refresh while the modal is open and dirty.
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
        // TASK #44: dirty-state tracking
        // ==================================================================
        let isModalOpen = false;
        let formDirty = false;

        function markDirty() {
            formDirty = true;
        }

        function markClean() {
            formDirty = false;
        }

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
        // options. Task #44: also marks the form dirty.
        categorySelect.addEventListener("change", () => {
            markDirty();
            const catId = categorySelect.value;
            if (!catId) {
                disableModuleSelect();
                return;
            }
            enableModuleSelectFor(catId);
        });

        // Task #44: Module and Resource Type selections also count as
        // unsaved changes.
        if (moduleSelect) moduleSelect.addEventListener("change", markDirty);
        if (typeSelect) typeSelect.addEventListener("change", markDirty);

        function resetForm() {
            if (form) form.reset();
            disableModuleSelect();
            categorySelect.innerHTML = `<option value="" selected>Loading categories&hellip;</option>`;
            clearTitleError();
            titleTaken = false;
            markClean(); // Task #44: a freshly reset form has no unsaved changes
        }

        if (openBtn) {
            openBtn.addEventListener("click", (e) => {
                e.preventDefault();
                modal.classList.remove("modal-hidden");
                modal.style.display = "flex";
                isModalOpen = true; // Task #44
                loadCategories();
            });
        }

        /**
         * Task #44: the ACTUAL close - hides the modal and resets the
         * form/dirty-state unconditionally. Only ever called after it's
         * already been decided that closing is safe (form wasn't dirty,
         * the admin chose to discard, or a save just succeeded).
         */
        function actuallyCloseModal() {
            modal.style.display = "none";
            modal.classList.add("modal-hidden");
            isModalOpen = false;
            resetForm();
        }

        /**
         * Task #44, Requirements #2-3: the GATE every user-initiated
         * close (X button, outside click) goes through. Mirrors
         * admin-create-admin.js's "unsaved changes" close-guard pattern
         * (window.confirm(), no page reload), extended with a
         * Save-as-Draft option using two chained confirms since
         * window.confirm() only ever offers two choices:
         *
         *   1st confirm: OK = Save as Draft (and then close on success)
         *                Cancel = go to the 2nd confirm
         *   2nd confirm: OK = Leave without saving (discard + close)
         *                Cancel = stay open, nothing changes
         */
        function attemptCloseModal() {
            if (!formDirty) {
                actuallyCloseModal();
                return;
            }

            const wantsSaveAsDraft = window.confirm(
                "Unsaved Changes\n\n" +
                "You have unsaved changes on this Upload Resource form.\n\n" +
                "Click OK to Save as Draft before leaving, or Cancel to choose whether to discard your changes."
            );

            if (wantsSaveAsDraft) {
                saveAsDraft();
                return; // saveAsDraft() closes the modal itself on success
            }

            const wantsLeave = window.confirm(
                "Are you sure you want to leave without saving? Your unsaved changes will be lost."
            );

            if (wantsLeave) {
                actuallyCloseModal();
            }
            // else: stay open, form and dirty state untouched
        }

        if (closeBtn) closeBtn.addEventListener("click", attemptCloseModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) attemptCloseModal();
        });

        // Exposed globally so any other trigger (e.g. a future Cancel
        // button) can reuse this exact guarded-close logic instead of a
        // second, divergent copy of it.
        window.cobraByteCloseUploadResourceModal = attemptCloseModal;

        // Task #44, Requirement #6: standard browser mechanism for real
        // navigation/tab close/refresh - only actually warns while this
        // modal is open AND dirty, so it never interferes with any other
        // page/feature. Registered once at setup time (not per open/close),
        // so there is only ever one beforeunload listener from this file.
        window.addEventListener("beforeunload", (e) => {
            if (!isModalOpen || !formDirty) return;
            e.preventDefault();
            e.returnValue = ""; // required by some browsers to show the native prompt
        });

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
                markDirty(); // Task #44

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
        // Shared create-request helper - used by BOTH the normal "Upload
        // Resource" submit AND Task #44's "Save as Draft" flow, since
        // Task #43 already guarantees every resource created through
        // this endpoint starts as Draft. No separate "draft" endpoint
        // or duplicated request-building logic is needed.
        // ==================================================================
        async function submitResourceCreate() {
            const body = new URLSearchParams({
                resource_title: titleInput.value.trim(),
                cat_id: categorySelect.value,
                module_id: moduleSelect.value,
                resource_type_id: typeSelect ? typeSelect.value : "",
            });
            const resp = await fetch("/admin/learning-resources/create", {
                method: "POST", credentials: "include", body
            });
            return resp.json();
        }

        /**
         * Task #44, Requirements #3-4: preserves the current form values
         * as a Draft (reusing the same create endpoint, which already
         * always defaults to Draft per Task #43). Only clears the dirty
         * flag / closes the modal after a SUCCESSFUL save - a failed
         * request leaves formDirty = true and the modal open so nothing
         * the admin typed is lost.
         */
        async function saveAsDraft() {
            if (!categorySelect.value || moduleSelect.disabled || !moduleSelect.value || !titleInput.value.trim()) {
                alert("Please fill in Category, Module, and Title before saving as a draft.");
                return; // stays dirty, modal stays open
            }
            if (titleTaken) {
                alert("A resource with this lesson title already exists. Please change the title before saving.");
                return;
            }

            try {
                const result = await submitResourceCreate();
                if (!result.success) {
                    // Requirement #3: "Do NOT clear the dirty state if
                    // the backend request fails."
                    showTitleError(result.message || "Could not save draft.");
                    alert(result.message || "Could not save draft.");
                    return;
                }

                markClean(); // Requirement #4
                alert(result.message || "Saved as Draft.");
                actuallyCloseModal();

                if (typeof window.cobraByteReloadResourcesTable === "function") {
                    window.cobraByteReloadResourcesTable();
                }
            } catch (err) {
                // Network failure - keep dirty = true, keep the modal open.
                alert("Could not reach the server. Your changes were not saved.");
            }
        }

        // ==================================================================
        // Submit - Task #41 (category/module) + Task #42 (title) +
        // Task #44 (clears dirty state only on success)
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
                    const result = await submitResourceCreate();

                    if (!result.success) {
                        // Requirement #6/#7 (Task #42) + Task #44
                        // Requirement #5: a failed request must NOT clear
                        // the dirty state - formDirty stays true, and the
                        // modal stays open so nothing is lost.
                        showTitleError(result.message);
                        return;
                    }

                    // Task #44, Requirement #5: successful normal
                    // submission clears the unsaved-changes state too.
                    markClean();

                    alert(result.message);
                    actuallyCloseModal();

                    // If admin-learning-resources.js's live table reload
                    // is available, refresh so the new resource shows up
                    // immediately without a full page reload.
                    if (typeof window.cobraByteReloadResourcesTable === "function") {
                        window.cobraByteReloadResourcesTable();
                    }
                } catch (err) {
                    // Network failure - keep dirty = true.
                    alert("Could not reach the server. Your changes were not saved.");
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