/**
 * admin-manage-course.js - Task #24, #27, #77, #80 & #87
 * ------------------------------------------------------------------
 * Handles Manage Course table (search/status filter/date filter/pagination),
 * standalone Create Module & Create Category modals with cancel confirmation
 * guards, Categories list modal, and Unified Archives modal (Modules & Categories).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    // ------------------------------------------------------------
    // Task #77: Module Name / Description sentence-case formatter.
    // ------------------------------------------------------------
    function formatSentenceCase(value) {
        if (!value) return "";
        const trimmed = value.trim();
        if (!trimmed) return "";

        const chars = trimmed.split("");
        const isAlpha = (ch) => /[a-zA-Z]/.test(ch);

        chars[0] = chars[0].toUpperCase();

        let capitalizeNextAlpha = false;
        for (let i = 1; i < chars.length; i++) {
            const ch = chars[i];
            if (capitalizeNextAlpha) {
                if (isAlpha(ch)) {
                    chars[i] = ch.toUpperCase();
                    capitalizeNextAlpha = false;
                }
            } else if (isAlpha(ch)) {
                chars[i] = ch.toLowerCase();
            }
            if (ch === ".") capitalizeNextAlpha = true;
        }
        return chars.join("");
    }

    document.addEventListener("DOMContentLoaded", () => {
        // Active Table DOM Elements
        const searchInput = document.getElementById("moduleSearchInput");
        const statusSelect = document.getElementById("moduleStatusSelect");
        const tableBody = document.getElementById("modulesTableBody");
        const showingCount = document.getElementById("modulesShowingCount");
        const pageLabel = document.getElementById("modulesPageLabel");
        const prevBtn = document.getElementById("modulesPrevBtn");
        const nextBtn = document.getElementById("modulesNextBtn");

        // Date Filter Elements
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

        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

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
                            <a href="#" title="Archive" class="table-action-icon delete-action js-delete-module" data-id="${m.module_id}"><i class="fa-solid fa-box-archive"></i></a>
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
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            try {
                const response = await fetch(`/admin/manage-course/data?${buildParams().toString()}`, { credentials: "include" });
                const result = await response.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
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

        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

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

        // Active Table Actions: Edit / Archive module
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
                    if (categoriesModal && categoriesModal.style.display === "flex") {
                        refreshCategoriesModal();
                    }
                }
            });
        }

        // ------------------------------------------------------------
        // Categories & Statuses Fetch Helpers
        // ------------------------------------------------------------
        async function fetchCategories() {
            try {
                const resp = await fetch("/admin/manage-course/categories", { credentials: "include" });
                const result = await resp.json();
                return result.success ? result.categories : [];
            } catch (e) { return []; }
        }

        async function fetchStatuses() {
            const opts = Array.from(document.querySelectorAll("#moduleStatusSelect option"))
                .filter(o => o.value)
                .map((o, i) => ({ module_stats_id: i + 1, module_stats_name: o.value }));
            return opts;
        }

        async function populateSelectWithCategories(selectElement) {
            if (!selectElement) return;
            const categories = await fetchCategories();
            selectElement.innerHTML = `<option value="" disabled selected>Select Category</option>` +
                categories.map(c => `<option value="${c.cat_id}">${c.category_name}</option>`).join("");
        }

        // ------------------------------------------------------------
        // STANDALONE CREATE MODULE MODAL (Task #87)
        // ------------------------------------------------------------
        const createModuleModal = document.getElementById("createModuleModal");
        const openCreateModuleBtn = document.getElementById("openCreateModuleBtn");
        const closeCreateModuleModalBtn = document.getElementById("closeCreateModuleModalBtn");
        const cancelCreateModuleBtn = document.getElementById("cancelCreateModuleBtn");
        const createModuleForm = document.getElementById("createModuleForm");
        const newModuleName = document.getElementById("newModuleName");
        const newModuleDesc = document.getElementById("newModuleDesc");
        const newModuleCategory = document.getElementById("newModuleCategory");

        async function openCreateModule(preselectedCatId = null) {
            if (!createModuleModal) return;
            if (createModuleForm) createModuleForm.reset();
            await populateSelectWithCategories(newModuleCategory);
            if (preselectedCatId && newModuleCategory) {
                newModuleCategory.value = String(preselectedCatId);
            }
            createModuleModal.style.display = "flex";
            if (newModuleName) newModuleName.focus();
        }

        function createModuleHasInputs() {
            const nameVal = newModuleName ? newModuleName.value.trim() : "";
            const descVal = newModuleDesc ? newModuleDesc.value.trim() : "";
            const catVal = newModuleCategory ? newModuleCategory.value : "";
            return Boolean(nameVal || descVal || catVal);
        }

        function attemptCloseCreateModuleModal() {
            if (!createModuleModal || createModuleModal.style.display === "none") return;
            if (createModuleHasInputs()) {
                const confirmed = confirm("Are you sure you want to cancel? Any entered input data will be deleted and cannot be undone.");
                if (!confirmed) return;
            }
            createModuleModal.style.display = "none";
            if (createModuleForm) createModuleForm.reset();
        }

        if (openCreateModuleBtn) {
            openCreateModuleBtn.addEventListener("click", (e) => {
                e.preventDefault();
                openCreateModule();
            });
        }
        if (closeCreateModuleModalBtn) {
            closeCreateModuleModalBtn.addEventListener("click", attemptCloseCreateModuleModal);
        }
        if (cancelCreateModuleBtn) {
            cancelCreateModuleBtn.addEventListener("click", attemptCloseCreateModuleModal);
        }
        if (createModuleModal) {
            createModuleModal.addEventListener("click", (e) => {
                if (e.target === createModuleModal) attemptCloseCreateModuleModal();
            });
        }

        if (newModuleName) {
            newModuleName.addEventListener("blur", () => {
                newModuleName.value = formatSentenceCase(newModuleName.value);
            });
            newModuleName.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (newModuleDesc) newModuleDesc.focus();
                }
            });
        }
        if (newModuleDesc) {
            newModuleDesc.addEventListener("blur", () => {
                newModuleDesc.value = formatSentenceCase(newModuleDesc.value);
            });
            newModuleDesc.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (newModuleCategory) newModuleCategory.focus();
                }
            });
        }

        let submittingCreateModule = false;
        if (createModuleForm) {
            createModuleForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (submittingCreateModule) return;

                const name = newModuleName ? newModuleName.value.trim() : "";
                const desc = newModuleDesc ? newModuleDesc.value.trim() : "";
                const catId = newModuleCategory ? newModuleCategory.value : "";

                if (!name || !desc || !catId) {
                    alert("Module name, description, and category are all required.");
                    return;
                }

                submittingCreateModule = true;
                try {
                    const statuses = await fetchStatuses();
                    const draft = statuses.find(s => s.module_stats_name === "Draft") || statuses[0];

                    const resp = await fetch("/admin/manage-course/modules/create", {
                        method: "POST", credentials: "include",
                        body: new URLSearchParams({
                            module_name: formatSentenceCase(name),
                            description: formatSentenceCase(desc),
                            cat_id: catId,
                            module_stats_id: draft ? draft.module_stats_id : ""
                        })
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message);
                        return;
                    }

                    createModuleModal.style.display = "none";
                    createModuleForm.reset();
                    loadModules();
                    if (categoriesModal && categoriesModal.style.display === "flex") {
                        refreshCategoriesModal();
                    }
                } finally {
                    submittingCreateModule = false;
                }
            });
        }

        // ------------------------------------------------------------
        // STANDALONE CREATE CATEGORY MODAL (Task #87)
        // ------------------------------------------------------------
        const createCategoryModal = document.getElementById("createCategoryModal");
        const openCreateCategoryBtn = document.getElementById("openCreateCategoryBtn");
        const closeCreateCategoryModalBtn = document.getElementById("closeCreateCategoryModalBtn");
        const cancelCreateCategoryBtn = document.getElementById("cancelCreateCategoryBtn");
        const createCategoryForm = document.getElementById("createCategoryForm");
        const newCategoryName = document.getElementById("newCategoryName");

        function openCreateCategory() {
            if (!createCategoryModal) return;
            if (createCategoryForm) createCategoryForm.reset();
            createCategoryModal.style.display = "flex";
            if (newCategoryName) newCategoryName.focus();
        }

        function createCategoryHasInputs() {
            return Boolean(newCategoryName && newCategoryName.value.trim() !== "");
        }

        function attemptCloseCreateCategoryModal() {
            if (!createCategoryModal || createCategoryModal.style.display === "none") return;
            if (createCategoryHasInputs()) {
                const confirmed = confirm("Are you sure you want to cancel? Any entered input data will be deleted and cannot be undone.");
                if (!confirmed) return;
            }
            createCategoryModal.style.display = "none";
            if (createCategoryForm) createCategoryForm.reset();
        }

        if (openCreateCategoryBtn) {
            openCreateCategoryBtn.addEventListener("click", (e) => {
                e.preventDefault();
                openCreateCategory();
            });
        }
        if (closeCreateCategoryModalBtn) {
            closeCreateCategoryModalBtn.addEventListener("click", attemptCloseCreateCategoryModal);
        }
        if (cancelCreateCategoryBtn) {
            cancelCreateCategoryBtn.addEventListener("click", attemptCloseCreateCategoryModal);
        }
        if (createCategoryModal) {
            createCategoryModal.addEventListener("click", (e) => {
                if (e.target === createCategoryModal) attemptCloseCreateCategoryModal();
            });
        }

        let submittingCreateCategory = false;
        if (createCategoryForm) {
            createCategoryForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (submittingCreateCategory) return;

                const name = newCategoryName ? newCategoryName.value.trim() : "";
                if (!name) { alert("Category name is required."); return; }

                submittingCreateCategory = true;
                try {
                    const resp = await fetch("/admin/manage-course/categories/create", {
                        method: "POST", credentials: "include",
                        body: new URLSearchParams({ category_name: name })
                    });
                    const result = await resp.json();
                    if (!result.success) { alert(result.message); return; }

                    createCategoryModal.style.display = "none";
                    createCategoryForm.reset();
                    loadModules();
                    if (categoriesModal && categoriesModal.style.display === "flex") {
                        refreshCategoriesModal();
                    }
                } finally {
                    submittingCreateCategory = false;
                }
            });
        }

        // ------------------------------------------------------------
        // VIEW CATEGORIES MODAL (Task #87)
        // ------------------------------------------------------------
        const categoriesModal = document.getElementById("categoriesModal");
        const openViewCategoriesBtn = document.getElementById("openViewCategoriesBtn");
        const closeCategoriesModal = document.getElementById("closeCategoriesModal");
        const categoriesListView = document.getElementById("categoriesListView");
        const modalAddCategoryBtn = document.getElementById("modalAddCategoryBtn");
        const modalAddModuleBtn = document.getElementById("modalAddModuleBtn");

        function renderCategoriesAccordion(categories) {
            if (!categoriesListView) return;
            if (!categories.length) {
                categoriesListView.innerHTML = `<p class="text-muted" style="padding:16px 0;">No active categories yet. Use "+ Category" to create one.</p>`;
                return;
            }
            categoriesListView.innerHTML = categories.map((cat, idx) => `
                <div class="category-accordion-item ${idx === 0 ? 'active' : ''}" data-cat-id="${cat.cat_id}">
                    <div class="category-accordion-toggle">
                        <i class="fa-solid ${idx === 0 ? 'fa-chevron-down' : 'fa-chevron-right'} toggle-arrow"></i>
                        <span class="category-name">${escapeHtml(cat.category_name)}</span>
                        <span class="module-row-actions js-cat-actions" style="margin-left:auto; display:flex; gap:10px;">
                            <i class="fa-solid fa-square-plus js-add-module-to-category" title="Add Module"></i>
                            <i class="fa-solid fa-pen-to-square js-edit-category" title="Rename"></i>
                            <i class="fa-solid fa-trash js-delete-category" title="Archive Category"></i>
                        </span>
                    </div>
                    <div class="category-modules-list" ${idx === 0 ? 'style="display:block;"' : ''}>
                        ${cat.modules.length ? cat.modules.map((m, i) => `
                            <div class="category-module-row">
                                <div class="module-badge-num bg-success-log">${i + 1}</div>
                                <div class="module-info-text">
                                    <strong>${escapeHtml(m.module_name)}</strong>
                                    <small>${escapeHtml(m.description)}</small>
                                </div>
                                <span class="badge ${m.status_name === 'Published' ? 'badge-success-log' : (m.status_name === 'Draft' ? 'badge-draft' : 'badge-inactive')}">${escapeHtml(m.status_name)}</span>
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
                icon.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const item = icon.closest(".category-accordion-item");
                    const catId = item.dataset.catId;
                    const currentName = item.querySelector(".category-name").textContent.trim();
                    openEditCategoryModal(catId, currentName);
                });
            });

            categoriesListView.querySelectorAll(".js-delete-category").forEach(icon => {
                icon.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const item = icon.closest(".category-accordion-item");
                    const catId = item.dataset.catId;
                    if (!confirm("Are you sure you want to archive this category?")) return;
                    const resp = await fetch(`/admin/manage-course/categories/${catId}/archive`, {
                        method: "POST", credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message);
                    } else {
                        alert("Category archived successfully.");
                    }
                    refreshCategoriesModal();
                    loadModules();
                });
            });

            categoriesListView.querySelectorAll(".js-add-module-to-category").forEach(icon => {
                icon.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const item = icon.closest(".category-accordion-item");
                    const catId = item.dataset.catId;
                    openCreateModule(catId);
                });
            });
        }

        async function refreshCategoriesModal() {
            const categories = await fetchCategories();
            renderCategoriesAccordion(categories);
        }

        if (openViewCategoriesBtn && categoriesModal) {
            openViewCategoriesBtn.addEventListener("click", () => {
                categoriesModal.style.display = "flex";
                refreshCategoriesModal();
            });
        }
        if (closeCategoriesModal && categoriesModal) {
            closeCategoriesModal.addEventListener("click", () => {
                categoriesModal.style.display = "none";
            });
        }
        if (categoriesModal) {
            categoriesModal.addEventListener("click", (e) => {
                if (e.target === categoriesModal) categoriesModal.style.display = "none";
            });
        }
        if (modalAddCategoryBtn) {
            modalAddCategoryBtn.addEventListener("click", () => openCreateCategory());
        }
        if (modalAddModuleBtn) {
            modalAddModuleBtn.addEventListener("click", () => openCreateModule());
        }

        // ------------------------------------------------------------
        // Edit Module Modal
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

            const [categories, statuses] = await Promise.all([fetchCategories(), fetchStatuses()]);

            editModuleCategorySelect.innerHTML = `<option value="" disabled>Select Category</option>` +
                categories.map(c => `<option value="${c.cat_id}">${c.category_name}</option>`).join("");
            editModuleStatusSelect.innerHTML = `<option value="" disabled>Select Status</option>` +
                statuses.map(s => `<option value="${s.module_stats_id}">${s.module_stats_name}</option>`).join("");

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

        if (editModuleNameInput) {
            editModuleNameInput.addEventListener("blur", () => {
                editModuleNameInput.value = formatSentenceCase(editModuleNameInput.value);
            });
        }
        if (editModuleDescInput) {
            editModuleDescInput.addEventListener("blur", () => {
                editModuleDescInput.value = formatSentenceCase(editModuleDescInput.value);
            });
        }
        if (closeEditModuleModalBtn) closeEditModuleModalBtn.addEventListener("click", closeEditModuleModal);
        if (editModuleModal) {
            editModuleModal.addEventListener("click", (e) => {
                if (e.target === editModuleModal) closeEditModuleModal();
            });
        }

        if (editModuleForm) {
            editModuleForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const id = editModuleIdInput.value;
                const body = new URLSearchParams({
                    module_name: formatSentenceCase(editModuleNameInput.value),
                    description: formatSentenceCase(editModuleDescInput.value),
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
                if (categoriesModal && categoriesModal.style.display === "flex") {
                    refreshCategoriesModal();
                }
            });
        }

        // ------------------------------------------------------------
        // Edit Category Modal
        // ------------------------------------------------------------
        const editCategoryModal = document.getElementById("editCategoryModal");
        const closeEditCategoryModalBtn = document.getElementById("closeEditCategoryModal");
        const cancelEditCategoryBtn = document.getElementById("cancelEditCategoryBtn");
        const editCategoryForm = document.getElementById("editCategoryForm");
        const editCategoryIdInput = document.getElementById("editCategoryId");
        const editCategoryNameInput = document.getElementById("editCategoryName");

        function openEditCategoryModal(id, currentName) {
            if (!editCategoryModal) return;
            editCategoryIdInput.value = id;
            editCategoryNameInput.value = currentName;
            editCategoryModal.style.display = "flex";
            editCategoryNameInput.focus();
        }

        function closeEditCategoryModal() {
            if (editCategoryModal) editCategoryModal.style.display = "none";
            if (editCategoryForm) editCategoryForm.reset();
        }

        if (closeEditCategoryModalBtn) closeEditCategoryModalBtn.addEventListener("click", closeEditCategoryModal);
        if (cancelEditCategoryBtn) cancelEditCategoryBtn.addEventListener("click", closeEditCategoryModal);
        if (editCategoryModal) {
            editCategoryModal.addEventListener("click", (e) => {
                if (e.target === editCategoryModal) closeEditCategoryModal();
            });
        }

        if (editCategoryForm) {
            editCategoryForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const catId = editCategoryIdInput.value;
                const resp = await fetch(`/admin/manage-course/categories/${catId}/update`, {
                    method: "POST", credentials: "include",
                    body: new URLSearchParams({ category_name: editCategoryNameInput.value.trim() })
                });
                const result = await resp.json();
                if (!result.success) {
                    alert(result.message);
                    return;
                }
                closeEditCategoryModal();
                refreshCategoriesModal();
                loadModules();
            });
        }

        // ------------------------------------------------------------
        // UNIFIED ARCHIVES MODAL (Task #27, #80 & #87)
        // ------------------------------------------------------------
        const archivedModal = document.getElementById("archivedModulesModal");
        const openArchivedBtn = document.getElementById("openArchivedModulesBtn");
        const closeArchivedBtn = document.getElementById("closeArchivedModulesModal");
        const archivedSearchInput = document.getElementById("archivedSearchInput");

        const toggleArchivedModulesBtn = document.getElementById("toggleArchivedModulesBtn");
        const toggleArchivedCategoriesBtn = document.getElementById("toggleArchivedCategoriesBtn");

        const archivedModulesView = document.getElementById("archivedModulesView");
        const archivedCategoriesView = document.getElementById("archivedCategoriesView");

        const archivedModulesTableBody = document.getElementById("archivedModulesTableBody");
        const archivedModulesShowingCount = document.getElementById("archivedModulesShowingCount");
        const archivedModulesPageLabel = document.getElementById("archivedModulesPageLabel");
        const archivedModulesPrevBtn = document.getElementById("archivedModulesPrevBtn");
        const archivedModulesNextBtn = document.getElementById("archivedModulesNextBtn");

        const archivedCategoriesTableBody = document.getElementById("archivedCategoriesTableBody");
        const archivedCategoriesShowingCount = document.getElementById("archivedCategoriesShowingCount");
        const archivedCategoriesPageLabel = document.getElementById("archivedCategoriesPageLabel");
        const archivedCategoriesPrevBtn = document.getElementById("archivedCategoriesPrevBtn");
        const archivedCategoriesNextBtn = document.getElementById("archivedCategoriesNextBtn");

        let activeArchiveTab = "modules";
        let archivedModulesCurrentPage = 1;
        let archivedModulesTotalPages = 1;
        let archivedCategoriesCurrentPage = 1;
        let archivedCategoriesTotalPages = 1;
        let archivedDebounceTimer = null;
        let archivedActiveRequestId = 0;

        function setArchiveTab(tab) {
            activeArchiveTab = tab;
            if (toggleArchivedModulesBtn) toggleArchivedModulesBtn.classList.toggle("active", tab === "modules");
            if (toggleArchivedCategoriesBtn) toggleArchivedCategoriesBtn.classList.toggle("active", tab === "categories");

            if (archivedModulesView) archivedModulesView.style.display = (tab === "modules") ? "block" : "none";
            if (archivedCategoriesView) archivedCategoriesView.style.display = (tab === "categories") ? "block" : "none";

            if (archivedSearchInput) {
                archivedSearchInput.placeholder = (tab === "modules") ? "Search archived modules..." : "Search archived categories...";
                archivedSearchInput.value = "";
            }

            if (tab === "modules") {
                archivedModulesCurrentPage = 1;
                loadArchivedModules();
            } else {
                archivedCategoriesCurrentPage = 1;
                loadArchivedCategories();
            }
        }

        if (toggleArchivedModulesBtn) {
            toggleArchivedModulesBtn.addEventListener("click", () => setArchiveTab("modules"));
        }
        if (toggleArchivedCategoriesBtn) {
            toggleArchivedCategoriesBtn.addEventListener("click", () => setArchiveTab("categories"));
        }

        function renderArchivedModules(modules) {
            if (!archivedModulesTableBody) return;
            if (!modules || modules.length === 0) {
                archivedModulesTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">No archived modules found.</td></tr>`;
                return;
            }
            archivedModulesTableBody.innerHTML = modules.map(m => `
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
                            <a href="#" title="Restore" class="table-action-icon js-restore-module" data-id="${m.module_id}">
                                <i class="fa-solid fa-rotate-left"></i>
                            </a>
                            <a href="#" title="Permanently Delete" class="table-action-icon delete-action js-permanent-delete-module" data-id="${m.module_id}">
                                <i class="fa-solid fa-trash-can"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedModules() {
            if (!archivedModulesTableBody) return;
            const requestId = ++archivedActiveRequestId;
            const q = archivedSearchInput ? archivedSearchInput.value.trim() : "";
            try {
                const response = await fetch(`/admin/manage-course/modules/archived?q=${encodeURIComponent(q)}&page=${archivedModulesCurrentPage}`, { credentials: "include" });
                const result = await response.json();
                if (requestId !== archivedActiveRequestId) return;

                if (!result.success) {
                    archivedModulesTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Could not load archived modules.</td></tr>`;
                    return;
                }

                renderArchivedModules(result.modules);
                archivedModulesCurrentPage = result.page;
                archivedModulesTotalPages = result.total_pages;

                if (archivedModulesShowingCount) archivedModulesShowingCount.textContent = `Showing ${result.modules.length} of ${result.total} Archived Modules`;
                if (archivedModulesPageLabel) archivedModulesPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (archivedModulesPrevBtn) archivedModulesPrevBtn.disabled = result.page <= 1;
                if (archivedModulesNextBtn) archivedModulesNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== archivedActiveRequestId) return;
                archivedModulesTableBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function renderArchivedCategories(categories) {
            if (!archivedCategoriesTableBody) return;
            if (!categories || categories.length === 0) {
                archivedCategoriesTableBody.innerHTML = `<tr><td colspan="3" class="text-muted table-empty-message">No archived categories found.</td></tr>`;
                return;
            }
            archivedCategoriesTableBody.innerHTML = categories.map(c => `
                <tr data-cat-id="${c.cat_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(c.category_name)}</strong>
                    </td>
                    <td class="text-muted">${c.module_count} module${c.module_count === 1 ? '' : 's'}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Restore Category" class="table-action-icon js-restore-category" data-id="${c.cat_id}">
                                <i class="fa-solid fa-rotate-left"></i>
                            </a>
                            <a href="#" title="Permanently Delete Category" class="table-action-icon delete-action js-permanent-delete-category" data-id="${c.cat_id}">
                                <i class="fa-solid fa-trash-can"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedCategories() {
            if (!archivedCategoriesTableBody) return;
            const requestId = ++archivedActiveRequestId;
            const q = archivedSearchInput ? archivedSearchInput.value.trim() : "";
            try {
                const response = await fetch(`/admin/manage-course/categories/archived?q=${encodeURIComponent(q)}&page=${archivedCategoriesCurrentPage}`, { credentials: "include" });
                const result = await response.json();
                if (requestId !== archivedActiveRequestId) return;

                if (!result.success) {
                    archivedCategoriesTableBody.innerHTML = `<tr><td colspan="3" class="text-muted table-empty-message">Could not load archived categories.</td></tr>`;
                    return;
                }

                renderArchivedCategories(result.categories);
                archivedCategoriesCurrentPage = result.page;
                archivedCategoriesTotalPages = result.total_pages;

                if (archivedCategoriesShowingCount) archivedCategoriesShowingCount.textContent = `Showing ${result.categories.length} of ${result.total} Archived Categories`;
                if (archivedCategoriesPageLabel) archivedCategoriesPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (archivedCategoriesPrevBtn) archivedCategoriesPrevBtn.disabled = result.page <= 1;
                if (archivedCategoriesNextBtn) archivedCategoriesNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== archivedActiveRequestId) return;
                archivedCategoriesTableBody.innerHTML = `<tr><td colspan="3" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleArchivedLoad(resetPage = true) {
            if (activeArchiveTab === "modules") {
                if (resetPage) archivedModulesCurrentPage = 1;
                if (archivedDebounceTimer) clearTimeout(archivedDebounceTimer);
                archivedDebounceTimer = setTimeout(loadArchivedModules, DEBOUNCE_MS);
            } else {
                if (resetPage) archivedCategoriesCurrentPage = 1;
                if (archivedDebounceTimer) clearTimeout(archivedDebounceTimer);
                archivedDebounceTimer = setTimeout(loadArchivedCategories, DEBOUNCE_MS);
            }
        }

        if (openArchivedBtn && archivedModal) {
            openArchivedBtn.addEventListener("click", () => {
                archivedModal.style.display = "flex";
                setArchiveTab("modules");
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

        if (archivedModulesPrevBtn) {
            archivedModulesPrevBtn.addEventListener("click", () => {
                if (archivedModulesCurrentPage > 1) { archivedModulesCurrentPage--; loadArchivedModules(); }
            });
        }
        if (archivedModulesNextBtn) {
            archivedModulesNextBtn.addEventListener("click", () => {
                if (archivedModulesCurrentPage < archivedModulesTotalPages) { archivedModulesCurrentPage++; loadArchivedModules(); }
            });
        }

        if (archivedCategoriesPrevBtn) {
            archivedCategoriesPrevBtn.addEventListener("click", () => {
                if (archivedCategoriesCurrentPage > 1) { archivedCategoriesCurrentPage--; loadArchivedCategories(); }
            });
        }
        if (archivedCategoriesNextBtn) {
            archivedCategoriesNextBtn.addEventListener("click", () => {
                if (archivedCategoriesCurrentPage < archivedCategoriesTotalPages) { archivedCategoriesCurrentPage++; loadArchivedCategories(); }
            });
        }

        // Archived Modules Event Delegation
        if (archivedModulesTableBody) {
            archivedModulesTableBody.addEventListener("click", async (e) => {
                const restoreBtn = e.target.closest(".js-restore-module");
                const permanentDeleteBtn = e.target.closest(".js-permanent-delete-module");

                if (restoreBtn) {
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
                    loadArchivedModules();
                    loadModules();
                    return;
                }

                if (permanentDeleteBtn) {
                    e.preventDefault();
                    const id = permanentDeleteBtn.dataset.id;
                    const confirmed = confirm(
                        "Are you sure you want to permanently delete this module? " +
                        "This action cannot be undone and the module will be permanently " +
                        "removed from the system."
                    );
                    if (!confirmed) return;

                    permanentDeleteBtn.style.pointerEvents = "none";
                    try {
                        const resp = await fetch(`/admin/manage-course/modules/${id}/permanent-delete`, {
                            method: "POST", credentials: "include"
                        });
                        const result = await resp.json();
                        if (!result.success) {
                            alert(result.message || "Could not permanently delete this module.");
                            permanentDeleteBtn.style.pointerEvents = "";
                            return;
                        }
                        alert(result.message || "Module permanently deleted.");
                        loadArchivedModules();
                    } catch (err) {
                        alert("Could not reach the server. Please try again.");
                        permanentDeleteBtn.style.pointerEvents = "";
                    }
                }
            });
        }

        // Archived Categories Event Delegation
        if (archivedCategoriesTableBody) {
            archivedCategoriesTableBody.addEventListener("click", async (e) => {
                const restoreBtn = e.target.closest(".js-restore-category");
                const permanentDeleteBtn = e.target.closest(".js-permanent-delete-category");

                if (restoreBtn) {
                    e.preventDefault();
                    const id = restoreBtn.dataset.id;
                    if (!confirm("Are you sure you want to restore this category?")) return;
                    const resp = await fetch(`/admin/manage-course/categories/${id}/restore`, {
                        method: "POST", credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message);
                    } else {
                        alert("Category restored successfully.");
                    }
                    loadArchivedCategories();
                    refreshCategoriesModal();
                    loadModules();
                    return;
                }

                if (permanentDeleteBtn) {
                    e.preventDefault();
                    const id = permanentDeleteBtn.dataset.id;
                    const confirmed = confirm(
                        "Are you sure you want to permanently delete this category? " +
                        "This action cannot be undone and the category will be permanently " +
                        "removed from the system."
                    );
                    if (!confirmed) return;

                    permanentDeleteBtn.style.pointerEvents = "none";
                    try {
                        const resp = await fetch(`/admin/manage-course/categories/${id}/permanent-delete`, {
                            method: "POST", credentials: "include"
                        });
                        const result = await resp.json();
                        if (!result.success) {
                            alert(result.message || "Could not permanently delete this category.");
                            permanentDeleteBtn.style.pointerEvents = "";
                            return;
                        }
                        alert(result.message || "Category permanently deleted.");
                        loadArchivedCategories();
                    } catch (err) {
                        alert("Could not reach the server. Please try again.");
                        permanentDeleteBtn.style.pointerEvents = "";
                    }
                }
            });
        }
    });
})();