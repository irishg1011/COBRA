/**
 * admin-manage-course.js - Task #24: Manage Course DB Integration
 * ------------------------------------------------------------------
 * Wires the Manage Course table (search/status filter/pagination) and
 * the Categories modal (view + Add Category + Add Module) to the real
 * backend endpoints in admin_routes.py, replacing every placeholder
 * value that used to live in manage-course.html / categories-modal.html.
 *
 * Include this on manage-course.html, right after admin-script.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-manage-course.js') }}"></script>
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("moduleSearchInput");
        const statusSelect = document.getElementById("moduleStatusSelect");
        const tableBody = document.getElementById("modulesTableBody");
        const showingCount = document.getElementById("modulesShowingCount");
        const pageLabel = document.getElementById("modulesPageLabel");
        const prevBtn = document.getElementById("modulesPrevBtn");
        const nextBtn = document.getElementById("modulesNextBtn");

        // Task #30 (simplified): Created At / Updated At date filter
        // controls. Each field is a single date picker by default; the
        // matching "Range" toggle checkbox reveals its second (end) date
        // input only when the admin wants to filter a span of dates.
        const createdFromInput = document.getElementById("createdFromInput");
        const createdToInput = document.getElementById("createdToInput");
        const createdRangeToggle = document.getElementById("createdRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearCreatedDateBtn");
        const updatedFromInput = document.getElementById("updatedFromInput");
        const updatedToInput = document.getElementById("updatedToInput");
        const updatedRangeToggle = document.getElementById("updatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearUpdatedDateBtn");
        const dateFilterError = document.getElementById("dateFilterError");

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function showDateFilterError(message) {
            if (!dateFilterError) { alert(message); return; }
            dateFilterError.textContent = message;
            dateFilterError.style.display = "block";
        }

        function clearDateFilterError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.style.display = "none";
        }

        /**
         * Resolves a date filter field's effective {from, to} pair based
         * on its own Range toggle: with the toggle off, the field acts as
         * a single-date filter ("on this date") and `to` mirrors `from`;
         * with it on, `to` comes from the field's own end-date input.
         * An empty `from` means the filter isn't in use at all.
         */
        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        /**
         * Task #30, Requirement #17: reject an invalid date range
         * (End before Start) client-side, before ever calling the
         * backend, so the admin gets instant feedback. The backend's
         * /manage-course/data endpoint re-validates the exact same rule
         * server-side (never trusting only this check) in case this
         * script is bypassed.
         */
        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from && updated.to && updated.from > updated.to) {
                showDateFilterError("Updated At: end date must be on or after the start date.");
                return false;
            }

            return true;
        }

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function statusBadgeHtml(status) {
            const cls = status === "Published" ? "badge-success-log"
                : status === "Draft" ? "badge-draft" : "badge-inactive";
            return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
        }

        function renderModules(modules) {
            if (!tableBody) return;
            if (!modules || modules.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">No modules found.</td></tr>`;
                return;
            }
            tableBody.innerHTML = modules.map(m => `
                <tr data-module-id="${m.module_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(m.module_name)}</strong>
                        <small class="text-muted">${escapeHtml(m.description)}</small>
                    </td>
                    <td class="text-muted">${escapeHtml(m.category)}</td>
                    <td>${statusBadgeHtml(m.status)}</td>
                    <td class="text-muted">${escapeHtml(m.created_at)}</td>
                    <td class="text-muted">${escapeHtml(m.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Edit" class="table-action-icon js-edit-module" data-id="${m.module_id}"><i class="fa-solid fa-pen-to-square"></i></a>
                            <a href="#" title="Delete" class="table-action-icon delete-action js-delete-module" data-id="${m.module_id}"><i class="fa-solid fa-trash"></i></a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        function buildParams() {
            const params = new URLSearchParams();
            const term = searchInput ? searchInput.value.trim() : "";
            if (term) params.set("q", term);
            if (statusSelect && statusSelect.value) params.set("status", statusSelect.value);
            // Task #30 (simplified): only ever sent when the admin
            // actually picked a "from" value - an empty/untouched date
            // field adds no restriction, matching get_modules_overview()'s
            // "absent bound = no restriction" behavior on the backend.
            // With the Range toggle off, "to" mirrors "from" (a single-day
            // filter); with it on, "to" comes from the field's own end
            // date input - see getEffectiveDateRange() above.
            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            params.set("page", currentPage);
            return params;
        }

        async function loadModules() {
            // Task #30: don't even call the backend with a known-bad
            // range - keep the current table/pagination as-is and just
            // surface the validation message.
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            try {
                const response = await fetch(`/admin/manage-course/data?${buildParams().toString()}`, { credentials: "include" });
                const result = await response.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    // Task #30: the backend's own range check (400) lands
                    // here too (e.g. if this script's client-side check
                    // was somehow bypassed) - show it as a filter error,
                    // not a generic "could not load" message.
                    if (response.status === 400 && result.message) {
                        showDateFilterError(result.message);
                        return;
                    }
                    tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load modules.</td></tr>`;
                    return;
                }

                clearDateFilterError();
                renderModules(result.modules);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (showingCount) showingCount.textContent = `Showing ${result.modules.length} of ${result.total} Modules`;
                if (pageLabel) pageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (prevBtn) prevBtn.disabled = result.page <= 1;
                if (nextBtn) nextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadModules, DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleLoad(true));
        if (statusSelect) statusSelect.addEventListener("change", () => scheduleLoad(true));
        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadModules(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadModules(); } });

        // ------------------------------------------------------------
        // Task #30: Created At / Updated At date filters
        // ------------------------------------------------------------
        // Each date input reruns the same combined load (debounced, and
        // resets to page 1 - Requirement #12), preserving whatever is
        // currently in search/status/the other date fields, exactly like
        // status/search already do above.
        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

        // ------------------------------------------------------------
        // Simplified date filters: each field's "Range" toggle shows/
        // hides its own end-date input, instead of both always being
        // visible. Restores the toggle's checked state from whatever
        // values were already rendered server-side (e.g. a bookmarked/
        // shared filtered URL) BEFORE the first sync, so loading a page
        // with an active range doesn't wipe out its own end date.
        // ------------------------------------------------------------
        function initDateRangeToggle(fromInput, toInput, rangeToggle) {
            if (!rangeToggle || !toInput) return;

            const fromVal = fromInput ? fromInput.value : "";
            if (toInput.value && toInput.value !== fromVal) {
                rangeToggle.checked = true;
            }

            const sync = () => {
                toInput.style.display = rangeToggle.checked ? "" : "none";
                if (!rangeToggle.checked) toInput.value = "";
            };
            sync();

            rangeToggle.addEventListener("change", () => {
                sync();
                scheduleLoad(true);
            });
        }
        initDateRangeToggle(createdFromInput, createdToInput, createdRangeToggle);
        initDateRangeToggle(updatedFromInput, updatedToInput, updatedRangeToggle);

        // Requirement #9/#10: Clear only removes ITS OWN date
        // restriction (Created At or Updated At) - search, status, and
        // the other date filter are left completely untouched.
        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdToInput) createdToInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                if (createdToInput) createdToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedToInput) updatedToInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                if (updatedToInput) updatedToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }

        // ------------------------------------------------------------
        // Edit / Delete module (event delegation - rows are re-rendered)
        // ------------------------------------------------------------
        if (tableBody) {
            tableBody.addEventListener("click", async (e) => {
                const editBtn = e.target.closest(".js-edit-module");
                const delBtn = e.target.closest(".js-delete-module");

                if (editBtn) {
                    e.preventDefault();
                    const id = editBtn.dataset.id;
                    const row = editBtn.closest("tr");
                    const currentName = row.querySelector(".table-item-title").textContent;
                    const currentDesc = row.querySelector("small").textContent;
                    openEditModuleModal(id, currentName, currentDesc);
                }

                if (delBtn) {
                    e.preventDefault();
                    const id = delBtn.dataset.id;
                    // Task #27: this used to permanently delete the module.
                    // It now archives it instead (soft delete) - the module
                    // row is preserved and can be restored later from the
                    // Archived Modules modal.
                    if (!confirm("Are you sure you want to archive this module?")) return;
                    const resp = await fetch(`/admin/manage-course/modules/${id}/delete`, {
                        method: "POST", credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message);
                    } else {
                        alert("Module archived successfully.");
                    }
                    loadModules();
                }
            });
        }

        // ------------------------------------------------------------
        // Categories modal: view + Add Category + Add Module
        // ------------------------------------------------------------
        const categoriesListView = document.getElementById("categoriesListView");
        const categoriesModal = document.getElementById("categoriesModal");

        async function fetchCategories() {
            try {
                const resp = await fetch("/admin/manage-course/categories", { credentials: "include" });
                const result = await resp.json();
                return result.success ? result.categories : [];
            } catch (e) { return []; }
        }

        async function fetchStatuses() {
            // Statuses aren't behind their own endpoint - reuse the
            // server-rendered <option> list already in the page's
            // status filter dropdown so there's a single source of truth.
            const opts = Array.from(document.querySelectorAll("#moduleStatusSelect option"))
                .filter(o => o.value)
                .map((o, i) => ({ module_stats_id: i + 1, module_stats_name: o.value }));
            return opts;
        }

        function renderCategoriesAccordion(categories) {
            if (!categoriesListView) return;
            if (!categories.length) {
                categoriesListView.innerHTML = `<p class="text-muted" style="padding:16px 0;">No categories yet. Use "Add Category" below to create one.</p>`;
                return;
            }
            categoriesListView.innerHTML = categories.map((cat, idx) => `
                <div class="category-accordion-item ${idx === 0 ? 'active' : ''}" data-cat-id="${cat.cat_id}">
                    <div class="category-accordion-toggle">
                        <i class="fa-solid ${idx === 0 ? 'fa-chevron-down' : 'fa-chevron-right'} toggle-arrow"></i>
                        <span class="category-name">${cat.category_name}</span>
                        <span class="module-row-actions js-cat-actions" style="margin-left:auto; display:flex; gap:10px;">
                            <i class="fa-solid fa-pen-to-square js-edit-category" title="Rename"></i>
                            <i class="fa-solid fa-trash js-delete-category" title="Delete"></i>
                        </span>
                    </div>
                    <div class="category-modules-list" ${idx === 0 ? 'style="display:block;"' : ''}>
                        ${cat.modules.length ? cat.modules.map((m, i) => `
                            <div class="category-module-row">
                                <div class="module-badge-num bg-success-log">${i + 1}</div>
                                <div class="module-info-text">
                                    <strong>${m.module_name}</strong>
                                    <small>${m.description}</small>
                                </div>
                                <span class="badge ${m.status_name === 'Published' ? 'badge-success-log' : (m.status_name === 'Draft' ? 'badge-draft' : 'badge-inactive')}">${m.status_name}</span>
                            </div>
                        `).join("") : `<p class="text-muted" style="padding:8px 0;">No modules in this category yet.</p>`}
                    </div>
                </div>
            `).join("");

            categoriesListView.querySelectorAll(".category-accordion-toggle").forEach(toggle => {
                toggle.addEventListener("click", (e) => {
                    if (e.target.closest(".js-cat-actions")) return;
                    const item = toggle.closest(".category-accordion-item");
                    item.classList.toggle("active");
                    const arrow = toggle.querySelector(".toggle-arrow");
                    const list = item.querySelector(".category-modules-list");
                    const open = item.classList.contains("active");
                    list.style.display = open ? "block" : "none";
                    arrow.classList.toggle("fa-chevron-down", open);
                    arrow.classList.toggle("fa-chevron-right", !open);
                });
            });

            categoriesListView.querySelectorAll(".js-edit-category").forEach(icon => {
                icon.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const item = icon.closest(".category-accordion-item");
                    const catId = item.dataset.catId;
                    const currentName = item.querySelector(".category-name").textContent;
                    const newName = prompt("Rename category:", currentName);
                    if (newName === null || !newName.trim()) return;
                    const resp = await fetch(`/admin/manage-course/categories/${catId}/update`, {
                        method: "POST", credentials: "include",
                        body: new URLSearchParams({ category_name: newName })
                    });
                    const result = await resp.json();
                    if (!result.success) alert(result.message);
                    refreshCategoriesModal();
                    loadModules();
                });
            });

            categoriesListView.querySelectorAll(".js-delete-category").forEach(icon => {
                icon.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const item = icon.closest(".category-accordion-item");
                    const catId = item.dataset.catId;
                    if (!confirm("Delete this category?")) return;
                    const resp = await fetch(`/admin/manage-course/categories/${catId}/delete`, {
                        method: "POST", credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) alert(result.message);
                    refreshCategoriesModal();
                });
            });
        }

        async function populateModuleCategorySelect() {
            const select = document.getElementById("newModuleCategorySelect");
            if (!select) return;
            const categories = await fetchCategories();
            select.innerHTML = `<option value="" disabled selected>Select Category</option>` +
                categories.map(c => `<option value="${c.cat_id}">${c.category_name}</option>`).join("");
        }

        async function refreshCategoriesModal() {
            const categories = await fetchCategories();
            renderCategoriesAccordion(categories);
            populateModuleCategorySelect();
        }

        if (categoriesModal) {
            // Refresh every time the modal is opened (View Categories /
            // Add Module buttons already toggle display:flex elsewhere
            // in admin-script.js).
            const observer = new MutationObserver(() => {
                if (categoriesModal.style.display === "flex") refreshCategoriesModal();
            });
            observer.observe(categoriesModal, { attributes: true, attributeFilter: ["style"] });
        }

        // ------------------------------------------------------------
        // Edit Module Modal (replaces the old prompt()/alert()-based
        // edit flow - see edit-module-modal.html)
        // ------------------------------------------------------------
        const editModuleModal = document.getElementById("editModuleModal");
        const closeEditModuleModalBtn = document.getElementById("closeEditModuleModal");
        const editModuleForm = document.getElementById("editModuleForm");
        const editModuleIdInput = document.getElementById("editModuleId");
        const editModuleNameInput = document.getElementById("editModuleName");
        const editModuleDescInput = document.getElementById("editModuleDesc");
        const editModuleCategorySelect = document.getElementById("editModuleCategory");
        const editModuleStatusSelect = document.getElementById("editModuleStatus");

        async function openEditModuleModal(id, currentName, currentDesc) {
            if (!editModuleModal) return;

            editModuleIdInput.value = id;
            editModuleNameInput.value = currentName.trim();
            editModuleDescInput.value = currentDesc.trim();

            // Populate both dropdowns fresh every time the modal opens,
            // same source-of-truth functions the Categories modal and
            // Add Module drawer already use (never hardcoded values).
            const [categories, statuses] = await Promise.all([fetchCategories(), fetchStatuses()]);

            editModuleCategorySelect.innerHTML = `<option value="" disabled>Select Category</option>` +
                categories.map(c => `<option value="${c.cat_id}">${c.category_name}</option>`).join("");
            editModuleStatusSelect.innerHTML = `<option value="" disabled>Select Status</option>` +
                statuses.map(s => `<option value="${s.module_stats_id}">${s.module_stats_name}</option>`).join("");

            // Pre-select this row's current category/status by matching
            // the text already shown in the table, so the dropdowns open
            // reflecting today's values instead of the blank placeholder.
            const row = document.querySelector(`tr[data-module-id="${id}"]`);
            if (row) {
                const catText = row.children[1] ? row.children[1].textContent.trim() : "";
                const statusBadge = row.querySelector(".badge");
                const statusText = statusBadge ? statusBadge.textContent.trim() : "";

                const catOption = [...editModuleCategorySelect.options].find(o => o.textContent === catText);
                if (catOption) catOption.selected = true;

                const statusOption = [...editModuleStatusSelect.options].find(o => o.textContent === statusText);
                if (statusOption) statusOption.selected = true;
            }

            editModuleModal.style.display = "flex";
        }

        function closeEditModuleModal() {
            if (editModuleModal) editModuleModal.style.display = "none";
            if (editModuleForm) editModuleForm.reset();
        }

        if (closeEditModuleModalBtn) {
            closeEditModuleModalBtn.addEventListener("click", closeEditModuleModal);
        }
        if (editModuleModal) {
            // Click outside the card closes it too, matching the Create
            // Administrator modal's own outside-click behavior.
            editModuleModal.addEventListener("click", (e) => {
                if (e.target === editModuleModal) closeEditModuleModal();
            });
        }

        if (editModuleForm) {
            editModuleForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const id = editModuleIdInput.value;
                const body = new URLSearchParams({
                    module_name: editModuleNameInput.value.trim(),
                    description: editModuleDescInput.value.trim(),
                    cat_id: editModuleCategorySelect.value,
                    module_stats_id: editModuleStatusSelect.value
                });
                const resp = await fetch(`/admin/manage-course/modules/${id}/update`, {
                    method: "POST", credentials: "include", body
                });
                const result = await resp.json();
                if (!result.success) {
                    alert(result.message);
                    return;
                }
                closeEditModuleModal();
                loadModules();
            });
        }

        // ------------------------------------------------------------
        // Add Category submit
        // ------------------------------------------------------------
        const submitCreateCategoryBtn = document.getElementById("submitCreateCategoryBtn");
        const newCategoryNameInput = document.getElementById("newCategoryNameInput");

        // Task #28: single source of truth for "create this category" -
        // both the button's click handler AND the Enter-key handler below
        // call this exact function, so there is only ever one place that
        // builds the request (no separate/duplicated Enter-key logic).
        // `submittingCategory` guards against a double-fire if the user
        // holds Enter down or otherwise triggers this twice before the
        // first request resolves.
        let submittingCategory = false;
        async function submitCreateCategory() {
            if (submittingCategory) return;
            const name = newCategoryNameInput ? newCategoryNameInput.value.trim() : "";
            if (!name) { alert("Category name is required."); return; }

            submittingCategory = true;
            try {
                const resp = await fetch("/admin/manage-course/categories/create", {
                    method: "POST", credentials: "include",
                    body: new URLSearchParams({ category_name: name })
                });
                const result = await resp.json();
                if (!result.success) { alert(result.message); return; }
                if (newCategoryNameInput) newCategoryNameInput.value = "";
                refreshCategoriesModal();
            } finally {
                submittingCategory = false;
            }
        }

        if (submitCreateCategoryBtn) {
            submitCreateCategoryBtn.addEventListener("click", submitCreateCategory);
        }

        // Task #28: Enter key in the Add Category input acts like clicking
        // "Create Category" - scoped to just this one input (not a page-
        // wide keydown listener), so it can never fire from any other
        // field/modal on the page.
        if (newCategoryNameInput) {
            newCategoryNameInput.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault(); // no surrounding <form>, but keeps this consistent/defensive
                submitCreateCategory();
            });
        }

        // ------------------------------------------------------------
        // Add Module submit
        // ------------------------------------------------------------
        const submitCreateModuleBtn = document.getElementById("submitCreateModuleBtn");
        const newModuleNameInput = document.getElementById("newModuleNameInput");
        const newModuleDescInput = document.getElementById("newModuleDescInput");
        const newModuleCategorySelect = document.getElementById("newModuleCategorySelect");

        // Task #28: same pattern as submitCreateCategory() above - one
        // function, reused by both the button click and the Enter-key
        // handling on the final field, guarded against duplicate
        // in-flight submissions.
        let submittingModule = false;
        async function submitCreateModule() {
            if (submittingModule) return;
            const name = newModuleNameInput ? newModuleNameInput.value.trim() : "";
            const desc = newModuleDescInput ? newModuleDescInput.value.trim() : "";
            const catId = newModuleCategorySelect ? newModuleCategorySelect.value : "";

            if (!name || !desc || !catId) {
                alert("Module name, description, and category are all required.");
                return;
            }

            submittingModule = true;
            try {
                // Default new modules to "Draft" status - looked up by
                // name from the same source of truth as the filter dropdown,
                // never a hardcoded id.
                const statuses = await fetchStatuses();
                const draft = statuses.find(s => s.module_stats_name === "Draft") || statuses[0];

                const resp = await fetch("/admin/manage-course/modules/create", {
                    method: "POST", credentials: "include",
                    body: new URLSearchParams({
                        module_name: name, description: desc,
                        cat_id: catId, module_stats_id: draft ? draft.module_stats_id : ""
                    })
                });
                const result = await resp.json();
                if (!result.success) { alert(result.message); return; }

                if (newModuleNameInput) newModuleNameInput.value = "";
                if (newModuleDescInput) newModuleDescInput.value = "";
                refreshCategoriesModal();
                loadModules();
            } finally {
                submittingModule = false;
            }
        }

        if (submitCreateModuleBtn) {
            submitCreateModuleBtn.addEventListener("click", submitCreateModule);
        }

        // Task #28: Enter-key navigation across the Add Module drawer's
        // fields, in their actual on-screen order (Name -> Description ->
        // Category -> submit). Each handler is bound to exactly one field
        // inside #addModuleDrawer, so Enter here can never reach the Add
        // Category drawer or any other form on the page.
        if (newModuleNameInput && newModuleDescInput) {
            newModuleNameInput.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                newModuleDescInput.focus();
            });
        }
        if (newModuleDescInput && newModuleCategorySelect) {
            newModuleDescInput.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                // The description field is a <textarea> - plain Enter
                // still needs to insert a newline for a multi-line
                // description, so only a plain (non-Shift) Enter advances
                // to the next field; Shift+Enter behaves like a normal
                // textarea and adds a line break instead.
                if (e.shiftKey) return;
                e.preventDefault();
                newModuleCategorySelect.focus();
            });
        }
        if (newModuleCategorySelect) {
            newModuleCategorySelect.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                // Final field in the drawer - Enter triggers the same
                // "Create Module" action the button uses.
                e.preventDefault();
                submitCreateModule();
            });
        }

        // Initial population of the Add Module category dropdown, since
        // it's no longer hardcoded to "basics"/"control-flow".
        populateModuleCategorySelect();

        // ------------------------------------------------------------
        // Task #27: Archived Modules modal - view + Restore
        // ------------------------------------------------------------
        const archivedModal = document.getElementById("archivedModulesModal");
        const openArchivedBtn = document.getElementById("openArchivedModulesBtn");
        const closeArchivedBtn = document.getElementById("closeArchivedModulesModal");
        const archivedSearchInput = document.getElementById("archivedModuleSearchInput");
        const archivedTableBody = document.getElementById("archivedModulesTableBody");
        const archivedShowingCount = document.getElementById("archivedModulesShowingCount");
        const archivedPageLabel = document.getElementById("archivedModulesPageLabel");
        const archivedPrevBtn = document.getElementById("archivedModulesPrevBtn");
        const archivedNextBtn = document.getElementById("archivedModulesNextBtn");

        let archivedCurrentPage = 1;
        let archivedTotalPages = 1;
        let archivedDebounceTimer = null;
        let archivedActiveRequestId = 0;

        function archivedBuildParams() {
            const params = new URLSearchParams();
            const term = archivedSearchInput ? archivedSearchInput.value.trim() : "";
            if (term) params.set("q", term);
            params.set("page", archivedCurrentPage);
            return params;
        }

        function renderArchivedModules(modules) {
            if (!archivedTableBody) return;
            if (!modules || modules.length === 0) {
                archivedTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">No archived modules found.</td></tr>`;
                return;
            }
            archivedTableBody.innerHTML = modules.map(m => `
                <tr data-module-id="${m.module_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(m.module_name)}</strong>
                        <small class="text-muted">${escapeHtml(m.description)}</small>
                    </td>
                    <td class="text-muted">${escapeHtml(m.category)}</td>
                    <td>${statusBadgeHtml(m.status)}</td>
                    <td class="text-muted">${escapeHtml(m.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Restore" class="table-action-icon js-restore-module" data-id="${m.module_id}"><i class="fa-solid fa-rotate-left"></i></a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedModules() {
            if (!archivedTableBody) return;
            const requestId = ++archivedActiveRequestId;
            try {
                const response = await fetch(`/admin/manage-course/modules/archived?${archivedBuildParams().toString()}`, { credentials: "include" });
                const result = await response.json();
                if (requestId !== archivedActiveRequestId) return;

                if (!result.success) {
                    archivedTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Could not load archived modules.</td></tr>`;
                    return;
                }

                renderArchivedModules(result.modules);
                archivedCurrentPage = result.page;
                archivedTotalPages = result.total_pages;

                if (archivedShowingCount) archivedShowingCount.textContent = `Showing ${result.modules.length} of ${result.total} Archived Modules`;
                if (archivedPageLabel) archivedPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (archivedPrevBtn) archivedPrevBtn.disabled = result.page <= 1;
                if (archivedNextBtn) archivedNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== archivedActiveRequestId) return;
                archivedTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleArchivedLoad(resetPage = true) {
            if (resetPage) archivedCurrentPage = 1;
            if (archivedDebounceTimer) clearTimeout(archivedDebounceTimer);
            archivedDebounceTimer = setTimeout(loadArchivedModules, DEBOUNCE_MS);
        }

        if (openArchivedBtn && archivedModal) {
            openArchivedBtn.addEventListener("click", () => {
                archivedModal.style.display = "flex";
                if (archivedSearchInput) archivedSearchInput.value = "";
                archivedCurrentPage = 1;
                loadArchivedModules();
            });
        }
        if (closeArchivedBtn && archivedModal) {
            closeArchivedBtn.addEventListener("click", () => { archivedModal.style.display = "none"; });
        }
        if (archivedModal) {
            archivedModal.addEventListener("click", (e) => {
                if (e.target === archivedModal) archivedModal.style.display = "none";
            });
        }
        if (archivedSearchInput) archivedSearchInput.addEventListener("input", () => scheduleArchivedLoad(true));
        if (archivedPrevBtn) archivedPrevBtn.addEventListener("click", () => { if (archivedCurrentPage > 1) { archivedCurrentPage--; loadArchivedModules(); } });
        if (archivedNextBtn) archivedNextBtn.addEventListener("click", () => { if (archivedCurrentPage < archivedTotalPages) { archivedCurrentPage++; loadArchivedModules(); } });

        if (archivedTableBody) {
            archivedTableBody.addEventListener("click", async (e) => {
                const restoreBtn = e.target.closest(".js-restore-module");
                if (!restoreBtn) return;
                e.preventDefault();
                const id = restoreBtn.dataset.id;
                if (!confirm("Are you sure you want to restore this module?")) return;
                const resp = await fetch(`/admin/manage-course/modules/${id}/restore`, {
                    method: "POST", credentials: "include"
                });
                const result = await resp.json();
                if (!result.success) {
                    alert(result.message);
                } else {
                    alert("Module restored successfully.");
                }
                // Restored module leaves the archived list and reappears
                // in the active Manage Course table - refresh both.
                loadArchivedModules();
                loadModules();
            });
        }
    });
})();