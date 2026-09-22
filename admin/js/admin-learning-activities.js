/**
 * admin-learning-activities.js - Manage Learning Activities: grouped-
 * by-Lesson table, live search/filter/sort/date, Activity content
 * preview icons, Edit/Archive choice controls, and batch Publish.
 * --------------------------------------------------------------------
 * Task: restructured from one row PER ACTIVITY to one row PER LESSON
 * (mirroring Manage Learning Resources), with:
 *   - RESOURCE = the Lesson.
 *   - ACTIVITY = an icon per activity TYPE the lesson actually has
 *     (Multiple Choice / Fill in the Blanks / Flashcards) - clicking
 *     one opens a read-only preview of that type's content.
 *   - MODULE / CATEGORY / UPLOADED BY / STATUS / CREATED AT / UPDATED AT.
 *   - ACTIONS: Edit opens a dropdown listing every individual activity
 *     this Lesson has (so an admin picks exactly which one to edit);
 *     Archive opens a checklist of the same list (so an admin can
 *     archive one, several, or all of them at once) - never a direct
 *     link/action on the row itself anymore, since a row can now
 *     represent more than one activity.
 *   - PUBLISH STATUS: unchanged backend-wise - batches the SAME,
 *     unmodified per-activity /publish and /unpublish endpoints
 *     (admin-learning-activity-publish.js's own logic is untouched;
 *     this file simply doesn't reuse its button class, since that
 *     script was built for a single activity id per button and this
 *     button now represents a whole lesson's worth of them).
 *
 * Only present on pages that have #activitySearchInput and
 * #activitiesTableBody (currently just manage-learning-activities.html).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("activitySearchInput");
        const typeSelect = document.getElementById("activityTypeSelect");
        const sortSelect = document.getElementById("activitySortSelect");
        const tableBody = document.getElementById("activitiesTableBody");
        const showingCount = document.getElementById("activitiesShowingCount");
        const pageLabel = document.getElementById("activitiesPageLabel");
        const prevBtn = document.getElementById("activitiesPrevBtn");
        const nextBtn = document.getElementById("activitiesNextBtn");

        if (!searchInput || !tableBody) return;

        const createdFromInput = document.getElementById("activityCreatedFromInput");
        const createdToInput = document.getElementById("activityCreatedToInput");
        const createdRangeToggle = document.getElementById("activityCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearActivityCreatedDateBtn");
        const updatedFromInput = document.getElementById("activityUpdatedFromInput");
        const updatedToInput = document.getElementById("activityUpdatedToInput");
        const updatedRangeToggle = document.getElementById("activityUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearActivityUpdatedDateBtn");
        const dateFilterError = document.getElementById("activityDateFilterError");

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
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Ready to Publish") return `<span class="badge badge-ready">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        // ------------------------------------------------------------
        // ACTIVITY column icons - one per type actually present, never
        // per individual activity (a lesson with two Multiple Choice
        // activities still shows that icon once).
        // ------------------------------------------------------------
        const ACTIVITY_TYPE_ICONS = {
            "Multiple Choice": "fa-solid fa-list-check",
            "Fill in the Blanks": "fa-solid fa-i-cursor",
            "Flashcards": "fa-solid fa-clone",
        };

        function activityIconsHtml(resourceId, typeNames) {
            return (typeNames || [])
                .filter((t) => ACTIVITY_TYPE_ICONS[t])
                .map((t) => `<button type="button" class="activity-content-trigger" data-resource-id="${resourceId}" data-activity-type="${escapeHtml(t)}" title="Preview ${escapeHtml(t)}"><i class="${ACTIVITY_TYPE_ICONS[t]}"></i></button>`)
                .join("");
        }

        function actionsHtml(resourceId) {
            return `
                <div class="table-actions-group">
                    <button type="button" title="Edit" class="table-action-icon js-edit-activity-trigger" data-resource-id="${resourceId}"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button type="button" title="Archive" class="table-action-icon delete-action js-archive-activity-trigger" data-resource-id="${resourceId}"><i class="fa-solid fa-box-archive"></i></button>
                </div>`;
        }

        function publishButtonHtml(resourceId, status, moduleStatus) {
            let label, btnClass;
            if (status === "Published") { label = "Unpublish"; btnClass = "btn-unpublish-custom"; }
            else if (status === "Ready to Publish") { label = "Move to Draft"; btnClass = "btn-movedraft-custom"; }
            else { label = "Ready to Publish"; btnClass = "btn-ready-custom"; }
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-lesson-activities-publish-btn"
                        data-resource-id="${resourceId}"
                        data-status="${escapeHtml(status || "Draft")}"
                        data-module-status="${escapeHtml(moduleStatus || "Draft")}">
                    ${label}
                </button>`;
        }

        function renderRows(lessons) {
            if (!lessons || lessons.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-muted table-empty-message">
                            No learning activities found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 of 0 Activities";
                return;
            }

            tableBody.innerHTML = lessons.map(l => `
                <tr data-resource-id="${l.resource_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(l.lesson_name)}</strong>
                    </td>
                    <td>${activityIconsHtml(l.resource_id, l.activity_type_names)}</td>
                    <td class="text-muted">${escapeHtml(l.module)}</td>
                    <td class="text-muted">${escapeHtml(l.category)}</td>
                    <td class="text-muted">${escapeHtml(l.uploaded_by)}</td>
                    <td class="js-status-cell">${statusBadgeHtml(l.status)}</td>
                    <td class="text-muted">${escapeHtml(l.created_at)}</td>
                    <td class="text-muted">${escapeHtml(l.updated_at)}</td>
                    <td class="text-right activity-actions-column">${actionsHtml(l.resource_id)}</td>
                    <td class="text-right publish-status-column">${publishButtonHtml(l.resource_id, l.status, l.module_status)}</td>
                </tr>
            `).join("");

            // Task #124: post-restore row highlight - flashes the whole
            // Lesson row (this table is grouped by Lesson, not by
            // individual activity), consuming the signal set by
            // admin-archived-activities.js right before it triggers
            // this table's reload.
            flashRestoredRow(tableBody, `tr[data-resource-id="${window.cobraByteHighlightRestoredId}"]`);
        }

        function flashRestoredRow(container, selector) {
            if (!container || !window.cobraByteHighlightRestoredId) return;
            const row = container.querySelector(selector);
            window.cobraByteHighlightRestoredId = null;
            if (!row) return;
            row.classList.add("row-restored-highlight");
            setTimeout(() => row.classList.remove("row-restored-highlight"), 4000);
        }

        function buildParams() {
            const params = new URLSearchParams();
            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);
            if (sortSelect && sortSelect.value) params.set("sort", sortSelect.value);

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            params.set("page", currentPage);
            return params;
        }

        async function loadActivities() {
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            const params = buildParams();

            try {
                const response = await fetch(
                    `/admin/learning-activities/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    if (response.status === 400 && result.message) {
                        showDateFilterError(result.message);
                        return;
                    }
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="10" class="text-muted table-empty-message">
                                Could not load activities. Please try again.
                            </td>
                        </tr>`;
                    return;
                }

                clearDateFilterError();
                renderRows(result.lessons);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (showingCount) showingCount.textContent = `Showing ${result.lessons.length} of ${result.total} Activities`;
                if (pageLabel) pageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (prevBtn) prevBtn.disabled = result.page <= 1;
                if (nextBtn) nextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-muted table-empty-message">
                            Could not reach the server.
                        </td>
                    </tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadActivities, DEBOUNCE_MS);
        }

        searchInput.addEventListener("input", () => scheduleLoad(true));
        if (typeSelect) typeSelect.addEventListener("change", () => scheduleLoad(true));
        if (sortSelect) sortSelect.addEventListener("change", () => scheduleLoad(true));

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadActivities(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadActivities(); } });

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

        // ------------------------------------------------------------
        // Shared confirm/info modal (#confirmActionModal) - same
        // pattern used throughout this admin.
        // ------------------------------------------------------------
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let pendingConfirmAction = null;

        function showAlertModal(message, title = "Notice") {
            if (!confirmActionModal) { alert(message); return; }
            pendingConfirmAction = null;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "OK";
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function showConfirmModal(message, onConfirm, title) {
            if (!confirmActionModal) {
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "Confirm";
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function closeConfirmModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "Confirm";
            pendingConfirmAction = null;
        }

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener("click", closeConfirmModal);
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeConfirmModal();
            });
        }
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeConfirmModal();
                if (typeof action === "function") action();
            });
        }

        let openEditMenu = null;
        function closeEditMenu() {
            if (openEditMenu) {
                openEditMenu.remove();
                openEditMenu = null;
            }
        }

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (confirmActionModal && !confirmActionModal.classList.contains("modal-hidden") && confirmActionModal.style.display !== "none") {
                closeConfirmModal();
            }
            if (openEditMenu) closeEditMenu();
        });
        document.addEventListener("click", (e) => {
            if (openEditMenu && !openEditMenu.contains(e.target) && !e.target.closest(".js-edit-activity-trigger")) {
                closeEditMenu();
            }
        });

        // ------------------------------------------------------------
        // Fetches every individual activity for a Lesson - shared data
        // source for the content preview icons, the Edit dropdown, and
        // the Archive checklist (see admin_routes.py's
        // /admin/learning-activities/preview, backed by
        // learning_activities.get_activities_for_resource()).
        // ------------------------------------------------------------
        async function fetchActivitiesForResource(resourceId) {
            try {
                const response = await fetch(`/admin/learning-activities/preview?resource_id=${encodeURIComponent(resourceId)}`, {
                    credentials: "include",
                });
                const result = await response.json();
                return result.success ? (result.activities || []) : [];
            } catch (err) {
                return [];
            }
        }

        // ------------------------------------------------------------
        // Edit dropdown - lists every individual activity this Lesson
        // has, so an admin picks exactly which one to edit. A Lesson
        // with only one activity still shows a one-item dropdown
        // (never auto-navigates), keeping the interaction consistent.
        // ------------------------------------------------------------
        async function openActivityEditMenu(trigger) {
            closeEditMenu();
            const resourceId = trigger.dataset.resourceId;
            const activities = await fetchActivitiesForResource(resourceId);

            const menu = document.createElement("div");
            menu.className = "resource-edit-menu";

            if (activities.length === 0) {
                const empty = document.createElement("div");
                empty.className = "resource-edit-menu-item";
                empty.style.cursor = "default";
                empty.textContent = "No activities yet";
                menu.appendChild(empty);
            } else {
                activities.forEach((a) => {
                    const item = document.createElement("button");
                    item.type = "button";
                    item.className = "resource-edit-menu-item";
                    const icon = ACTIVITY_TYPE_ICONS[a.activity_type] || "fa-solid fa-file-lines";
                    item.innerHTML = `<i class="${icon}"></i> ${escapeHtml(a.activity_type)}: ${escapeHtml(a.activity_title)}`;
                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        closeEditMenu();
                        const targetUrl = `/admin/create-learning-activity?activity_id=${encodeURIComponent(a.activity_id)}`;
                        // Published-state interception (same rule as
                        // Manage Learning Resources' Edit dropdown): a
                        // Draft activity opens straight in the editor; a
                        // Published one asks for confirmation first, since
                        // the admin is about to modify something learners
                        // can currently see.
                        if (a.status === "Published") {
                            showConfirmModal(
                                "You are about to edit a published activity. Do you wish to continue?",
                                () => { window.location.href = targetUrl; },
                                "Edit Published Activity?"
                            );
                        } else {
                            window.location.href = targetUrl;
                        }
                    });
                    menu.appendChild(item);
                });
            }

            document.body.appendChild(menu);
            const rect = trigger.getBoundingClientRect();
            const menuWidth = menu.offsetWidth;
            menu.style.top = `${rect.bottom + 6}px`;
            let left = rect.right - menuWidth;
            if (left < 8) left = rect.left;
            menu.style.left = `${left}px`;
            openEditMenu = menu;
        }

        // ------------------------------------------------------------
        // Archive checklist modal - lists every individual activity
        // this Lesson has, with checkboxes (+ a "Select all" toggle),
        // so an admin can archive one, several, or all of them in one
        // action. Each checked activity is archived via the SAME
        // /admin/learning-activities/<id>/archive route, called once
        // per selection - no batch-specific backend logic needed.
        // ------------------------------------------------------------
        function openActivityArchiveChecklist(resourceId, activities, lessonContext) {
            let overlay = document.getElementById("activityArchiveModalOverlay");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "activityArchiveModalOverlay";
            overlay.className = "modal-overlay";

            // Task #120: every listed item shares this same Lesson (this
            // modal is always opened from one specific Lesson's Archive
            // icon), so the Category/Module/Lesson context is shown once,
            // prominently, right under the title - rather than repeated
            // identically on every single checklist row, which would just
            // be noise. Built entirely from data already rendered in the
            // table row - no fetch, no backend change needed.
            const contextParts = [lessonContext?.category, lessonContext?.module, lessonContext?.lessonName]
                .filter((part) => part && part !== "—");
            const contextHtml = contextParts.length
                ? `<p style="margin: 0 0 16px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; font-size: 13px; color: #475569;">
                       <i class="fa-solid fa-location-dot" style="margin-right: 6px; color: #64748b;"></i>${contextParts.map(escapeHtml).join(" &rsaquo; ")}
                   </p>`
                : "";

            const itemsHtml = activities.map((a) => `
                <label class="archive-checklist-item${a.status === "Published" ? " archive-checklist-item-disabled" : ""}">
                    <input type="checkbox" class="archive-checklist-checkbox" value="${a.activity_id}" ${a.status === "Published" ? "disabled" : ""}>
                    <span><i class="${ACTIVITY_TYPE_ICONS[a.activity_type] || 'fa-solid fa-file-lines'}"></i> ${escapeHtml(a.activity_type)}: ${escapeHtml(a.activity_title)}${a.status === "Published" ? ' <span style="color:#b45309; font-weight:600;">(Published)</span>' : ""}</span>
                </label>
            `).join("");

            // Task #123: universal Published-dependency rule - the whole
            // Archive Selected action is disabled outright while ANY
            // activity in this Lesson is Published, not just that one
            // item's own checkbox. No bypass/confirm-anyway option.
            const hasAnyBlocker = activities.some((a) => a.status === "Published");
            const warningHtml = hasAnyBlocker
                ? `<p style="margin: 0 0 14px; padding: 10px 12px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; color: #92400e; font-size: 13px; font-weight: 500;">
                       You must unpublish these items first before you can archive this parent record.
                   </p>`
                : "";

            overlay.innerHTML = `
                <div class="content-preview-card" style="max-width: 460px;">
                    <div class="content-preview-header">
                        <strong>Archive which activities?</strong>
                        <button type="button" id="activityArchiveCloseBtn" class="modal-close-btn" style="position: static; font-size: 22px;" title="Close">&times;</button>
                    </div>
                    <div class="content-preview-body">
                        ${contextHtml}
                        ${warningHtml}
                        <label class="archive-checklist-item archive-checklist-select-all">
                            <input type="checkbox" id="activityArchiveSelectAll">
                            <span><strong>Select all</strong></span>
                        </label>
                        ${itemsHtml}
                        <p id="activityArchiveValidationMsg" style="display:none; color:#dc2626; font-size:13px; margin: 10px 0 0;"></p>
                        <div style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" class="modal-btn-cancel" id="activityArchiveCancelBtn">Cancel</button>
                            <button type="button" class="modal-btn-save" id="activityArchiveConfirmBtn" ${hasAnyBlocker ? "disabled" : ""}>Archive Selected</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function closeModal() { overlay.remove(); }
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
            overlay.querySelector("#activityArchiveCloseBtn").addEventListener("click", closeModal);
            overlay.querySelector("#activityArchiveCancelBtn").addEventListener("click", closeModal);

            const selectAll = overlay.querySelector("#activityArchiveSelectAll");
            const checkboxes = Array.from(overlay.querySelectorAll(".archive-checklist-checkbox"));
            const validationMsg = overlay.querySelector("#activityArchiveValidationMsg");
            selectAll.addEventListener("change", () => {
                checkboxes.filter((cb) => !cb.disabled).forEach((cb) => { cb.checked = selectAll.checked; });
            });

            async function performArchive(selectedIds) {
                const confirmBtn = overlay.querySelector("#activityArchiveConfirmBtn");
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = "Archiving...";
                }

                let failures = 0;
                try {
                    const responses = await Promise.all(selectedIds.map((id) =>
                        fetch(`/admin/learning-activities/${id}/archive`, { method: "POST", credentials: "include" })
                            .then((r) => r.json())
                            .catch(() => ({ success: false }))
                    ));
                    failures = responses.filter((r) => !r || !r.success).length;
                } catch (err) {
                    failures = selectedIds.length;
                }

                closeModal();

                if (failures > 0) {
                    showAlertModal(
                        failures === selectedIds.length
                            ? "Could not archive the selected activities. Please try again."
                            : `${failures} of ${selectedIds.length} selected activities could not be archived.`,
                        "Archive Incomplete"
                    );
                }

                // If every activity under this lesson was archived, the
                // whole row disappears from the active list; otherwise
                // just refresh this row's data via a full reload of the
                // current page/filters (simplest correct behavior).
                loadActivities();
            }

            overlay.querySelector("#activityArchiveConfirmBtn").addEventListener("click", () => {
                // Task #123: no bypass anymore - the button itself is
                // disabled outright (see hasAnyBlocker above) whenever
                // any activity here is Published, and each Published
                // checkbox is individually disabled too, so this only
                // ever runs with Draft selections already guaranteed.
                const selectedIds = checkboxes.filter((cb) => cb.checked && !cb.disabled).map((cb) => cb.value);
                if (selectedIds.length === 0) {
                    // Task fix: this used to silently close the modal with
                    // no feedback at all when nothing was checked, which
                    // reads exactly like "the button doesn't do anything."
                    if (validationMsg) {
                        validationMsg.textContent = "Please select at least one activity to archive.";
                        validationMsg.style.display = "block";
                    }
                    return;
                }
                if (validationMsg) validationMsg.style.display = "none";
                performArchive(selectedIds);
            });
        }

        // ------------------------------------------------------------
        // Content preview modal - read-only display of one activity
        // TYPE's content for a Lesson (all activities of that type, if
        // more than one exists).
        // ------------------------------------------------------------
        function renderActivityPreviewBody(activities, type) {
            const matching = activities.filter((a) => a.activity_type === type);
            if (matching.length === 0) return "<em>No content yet.</em>";

            return matching.map((a) => {
                let itemsHtml = "";
                if (type === "Multiple Choice") {
                    itemsHtml = a.items.map((q, idx) => `
                        <p style="font-weight: 600; margin: 14px 0 6px;">${idx + 1}. ${escapeHtml(q.question_text)}</p>
                        <ul style="margin: 0 0 10px; padding-left: 20px;">
                            ${q.options.map((o) => `<li style="${o.is_correct ? 'color:#16a34a; font-weight:600;' : ''}">${escapeHtml(o.option_letter)}. ${escapeHtml(o.text)}${o.is_correct ? ' ✓' : ''}</li>`).join("")}
                        </ul>
                    `).join("");
                } else if (type === "Fill in the Blanks") {
                    itemsHtml = a.items.map((f, idx) => `
                        <p style="margin: 14px 0 4px;"><strong>${idx + 1}.</strong> ${escapeHtml(f.content)}</p>
                        <p style="margin: 0 0 10px; color:#16a34a;">Answer: ${escapeHtml(f.correct_answer)}</p>
                    `).join("");
                } else if (type === "Flashcards") {
                    itemsHtml = a.items.map((c, idx) => `
                        <p style="margin: 14px 0 4px;"><strong>Card ${idx + 1} - Front:</strong> ${escapeHtml(c.front)}</p>
                        <p style="margin: 0 0 10px;"><strong>Back:</strong> ${escapeHtml(c.back)}</p>
                    `).join("");
                }
                return `<div style="margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #e5e7eb;">
                    <p style="font-weight: 700; margin: 0 0 4px;">${escapeHtml(a.activity_title)} <span style="font-weight:400; color:#6b7280;">(${escapeHtml(a.status)})</span></p>
                    ${itemsHtml}
                </div>`;
            }).join("");
        }

        function showActivityPreviewModal(resourceId, activityType, activities) {
            let overlay = document.getElementById("activityPreviewModalOverlay");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "activityPreviewModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="content-preview-card">
                    <div class="content-preview-header">
                        <strong>${escapeHtml(activityType)}</strong>
                        <button type="button" id="activityPreviewCloseBtn" class="modal-close-btn" style="position: static; font-size: 22px;" title="Close">&times;</button>
                    </div>
                    <div class="content-preview-body">${renderActivityPreviewBody(activities, activityType)}</div>
                </div>
            `;
            document.body.appendChild(overlay);

            function closeModal() {
                overlay.remove();
                document.removeEventListener("keydown", onEscKey);
            }
            function onEscKey(e) { if (e.key === "Escape") closeModal(); }
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
            overlay.querySelector("#activityPreviewCloseBtn").addEventListener("click", closeModal);
            document.addEventListener("keydown", onEscKey);
        }

        tableBody.addEventListener("click", async (e) => {
            const previewTrigger = e.target.closest(".activity-content-trigger");
            if (previewTrigger) {
                e.preventDefault();
                const resourceId = previewTrigger.dataset.resourceId;
                const activityType = previewTrigger.dataset.activityType;
                const activities = await fetchActivitiesForResource(resourceId);
                showActivityPreviewModal(resourceId, activityType, activities);
                return;
            }

            const editTrigger = e.target.closest(".js-edit-activity-trigger");
            if (editTrigger) {
                e.preventDefault();
                e.stopPropagation();
                if (openEditMenu && openEditMenu._trigger === editTrigger) {
                    closeEditMenu();
                } else {
                    await openActivityEditMenu(editTrigger);
                    if (openEditMenu) openEditMenu._trigger = editTrigger;
                }
                return;
            }

            const archiveTrigger = e.target.closest(".js-archive-activity-trigger");
            if (archiveTrigger) {
                e.preventDefault();
                const resourceId = archiveTrigger.dataset.resourceId;
                const activities = await fetchActivitiesForResource(resourceId);
                if (activities.length === 0) {
                    showAlertModal("This lesson has no activities to archive.", "Nothing to Archive");
                    return;
                }
                // Task #120: Lesson/Module/Category context for the modal -
                // read straight from this row's own cells (Resource,
                // Activity, Module, Category, in that column order), since
                // the table already has all of it rendered; no extra
                // fetch or backend change needed.
                const row = archiveTrigger.closest("tr");
                const lessonContext = row ? {
                    lessonName: row.cells[0] ? row.cells[0].textContent.trim() : "",
                    module: row.cells[2] ? row.cells[2].textContent.trim() : "",
                    category: row.cells[3] ? row.cells[3].textContent.trim() : "",
                } : null;
                openActivityArchiveChecklist(resourceId, activities, lessonContext);
                return;
            }

            // ------------------------------------------------------------
            // Batch Publish/Unpublish - calls the SAME, unmodified
            // per-activity /admin/learning-activities/<id>/publish and
            // .../unpublish endpoints once for every activity under this
            // lesson. No publish-related backend logic is added or
            // changed here - this only orchestrates existing calls.
            // ------------------------------------------------------------
            const publishBtn = e.target.closest(".js-toggle-lesson-activities-publish-btn");
            if (publishBtn) {
                e.preventDefault();
                const resourceId = publishBtn.dataset.resourceId;
                const currentStatus = publishBtn.dataset.status || "Draft";

                let endpointSuffix, confirmMsg, confirmTitle, busyText;
                if (currentStatus === "Published") {
                    endpointSuffix = "unpublish";
                    confirmMsg = "Are you sure you want to unpublish every activity in this lesson? They will be moved back to Draft and hidden from learners.";
                    confirmTitle = "Unpublish Lesson's Activities?";
                    busyText = "Unpublishing...";
                } else if (currentStatus === "Ready to Publish") {
                    endpointSuffix = "unpublish";
                    confirmMsg = "Are you sure you want to move every activity in this lesson back to Draft?";
                    confirmTitle = "Move to Draft?";
                    busyText = "Moving to Draft...";
                } else {
                    endpointSuffix = "ready-to-publish";
                    confirmMsg = "Are you sure you want to mark every activity in this lesson as Ready to Publish?";
                    confirmTitle = "Ready to Publish?";
                    busyText = "Marking Ready...";
                }

                showConfirmModal(confirmMsg, async () => {
                    publishBtn.disabled = true;
                    const originalText = publishBtn.textContent;
                    publishBtn.textContent = busyText;

                    const activities = await fetchActivitiesForResource(resourceId);

                    // Task fix: this used to fire every request and
                    // update the UI unconditionally afterward, regardless
                    // of whether any of them actually succeeded - a 400
                    // response (e.g. Task #10's "parent lesson is still
                    // Draft" gate rejecting every single one) resolves
                    // normally in fetch() and was never inspected, so a
                    // fully-rejected batch still looked like a success
                    // until the next real page load told the truth.
                    let successCount = 0;
                    let firstErrorMessage = null;
                    try {
                        const results = await Promise.all(activities.map((a) =>
                            fetch(`/admin/learning-activities/${a.activity_id}/${endpointSuffix}`, {
                                method: "POST", credentials: "include",
                            }).then((r) => r.json().catch(() => ({ success: false })))
                        ));
                        results.forEach((r) => {
                            if (r && r.success) {
                                successCount += 1;
                            } else if (!firstErrorMessage && r && r.message) {
                                firstErrorMessage = r.message;
                            }
                        });
                    } catch (err) {
                        firstErrorMessage = firstErrorMessage || "Could not reach the server.";
                    }

                    publishBtn.disabled = false;

                    if (activities.length === 0 || successCount === 0) {
                        publishBtn.textContent = originalText;
                        showAlertModal(
                            firstErrorMessage || "None of this lesson's activities could be updated.",
                            "Not Updated"
                        );
                        return;
                    }

                    if (successCount < activities.length) {
                        showAlertModal(
                            `${successCount} of ${activities.length} activities were updated. ${firstErrorMessage || "The rest could not be changed."}`,
                            "Partially Updated"
                        );
                    }

                    // Only reached the requested status if EVERY activity
                    // actually made it - otherwise the row's real,
                    // authoritative status is whatever the server now
                    // has, so re-fetch rather than guess.
                    if (successCount === activities.length) {
                        const newStatus = currentStatus === "Draft" ? "Ready to Publish" : "Draft";
                        publishBtn.dataset.status = newStatus;
                        let newLabel, newClass;
                        if (newStatus === "Ready to Publish") { newLabel = "Move to Draft"; newClass = "btn-movedraft-custom"; }
                        else { newLabel = "Ready to Publish"; newClass = "btn-ready-custom"; }
                        publishBtn.textContent = newLabel;
                        publishBtn.classList.remove("btn-success-custom", "btn-unpublish-custom", "btn-ready-custom", "btn-movedraft-custom");
                        publishBtn.classList.add(newClass);

                        const row = publishBtn.closest("tr");
                        const statusCell = row ? row.querySelector(".js-status-cell") : null;
                        if (statusCell) statusCell.innerHTML = statusBadgeHtml(newStatus);
                    } else {
                        publishBtn.textContent = originalText;
                        loadActivities();
                    }
                }, confirmTitle);
            }
        });
    });
})();