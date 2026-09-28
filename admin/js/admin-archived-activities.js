/**
 * admin-archived-activities.js - Task #117: Dedicated Archive Modal for Learning Activities
 * -----------------------------------------------------------------------------------------
 * Manages the Learning Activities tabbed archive modal:
 *   - Tab 1: Multiple Choice Test (MCT)
 *   - Tab 2: Fill in the Blanks (FIB)
 *   - Tab 3: Flashcards (FC)
 *   - Real-time debounced search per active tab
 *   - Independent pagination
 *   - Restore action (reverts status to Draft)
 *   - Permanent Delete action (with confirmation prompt)
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const openBtn = document.getElementById("openArchivedActivitiesBtn");
        const modal = document.getElementById("archivedActivitiesModal");
        const closeBtn = document.getElementById("closeArchivedActivitiesModal");
        const searchInput = document.getElementById("archivedActivitySearchInput");

        const toggleMctBtn = document.getElementById("toggleArchivedMctBtn");
        const toggleFibBtn = document.getElementById("toggleArchivedFibBtn");
        const toggleFcBtn = document.getElementById("toggleArchivedFcBtn");

        const mctView = document.getElementById("archivedMctView");
        const fibView = document.getElementById("archivedFibView");
        const fcView = document.getElementById("archivedFcView");

        const mctTableBody = document.getElementById("archivedMctTableBody");
        const mctShowingCount = document.getElementById("archivedMctShowingCount");
        const mctPageLabel = document.getElementById("archivedMctPageLabel");
        const mctPrevBtn = document.getElementById("archivedMctPrevBtn");
        const mctNextBtn = document.getElementById("archivedMctNextBtn");

        const fibTableBody = document.getElementById("archivedFibTableBody");
        const fibShowingCount = document.getElementById("archivedFibShowingCount");
        const fibPageLabel = document.getElementById("archivedFibPageLabel");
        const fibPrevBtn = document.getElementById("archivedFibPrevBtn");
        const fibNextBtn = document.getElementById("archivedFibNextBtn");

        const fcTableBody = document.getElementById("archivedFcTableBody");
        const fcShowingCount = document.getElementById("archivedFcShowingCount");
        const fcPageLabel = document.getElementById("archivedFcPageLabel");
        const fcPrevBtn = document.getElementById("archivedFcPrevBtn");
        const fcNextBtn = document.getElementById("archivedFcNextBtn");

        if (!modal || !openBtn) return;

        // ------------------------------------------------------------
        // Shared confirm/alert modal (#confirmActionModal) - replaces
        // this file's previous native confirm()/alert() calls, matching
        // the same styled-modal convention used everywhere else in
        // this admin.
        // ------------------------------------------------------------
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");
        let pendingConfirmAction = null;

        function closeSharedModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            pendingConfirmAction = null;
        }

        function showAlertModal(message, title = "Notice") {
            if (!confirmActionModal) { alert(message); return; }
            pendingConfirmAction = null;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "OK";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function showConfirmModal(message, onConfirm, title = "Confirm Action") {
            if (!confirmActionModal) { if (window.confirm(message)) onConfirm(); return; }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "Confirm";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener("click", closeSharedModal);
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeSharedModal();
                if (typeof action === "function") action();
            });
        }
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeSharedModal();
            });
        }

        let activeTab = "mct"; // "mct" | "fib" | "fc"
        let mctPage = 1, mctTotalPages = 1;
        let fibPage = 1, fibTotalPages = 1;
        let fcPage = 1, fcTotalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function setArchiveTab(tab) {
            activeTab = tab;
            if (toggleMctBtn) toggleMctBtn.classList.toggle("active", tab === "mct");
            if (toggleFibBtn) toggleFibBtn.classList.toggle("active", tab === "fib");
            if (toggleFcBtn) toggleFcBtn.classList.toggle("active", tab === "fc");

            if (mctView) mctView.style.display = (tab === "mct") ? "block" : "none";
            if (fibView) fibView.style.display = (tab === "fib") ? "block" : "none";
            if (fcView) fcView.style.display = (tab === "fc") ? "block" : "none";

            if (searchInput) {
                if (tab === "mct") searchInput.placeholder = "Search archived multiple choice tests...";
                else if (tab === "fib") searchInput.placeholder = "Search archived fill in the blanks...";
                else searchInput.placeholder = "Search archived flashcards...";
                searchInput.value = "";
            }

            if (tab === "mct") {
                mctPage = 1;
                loadArchivedMct();
            } else if (tab === "fib") {
                fibPage = 1;
                loadArchivedFib();
            } else {
                fcPage = 1;
                loadArchivedFc();
            }
        }

        if (toggleMctBtn) toggleMctBtn.addEventListener("click", () => setArchiveTab("mct"));
        if (toggleFibBtn) toggleFibBtn.addEventListener("click", () => setArchiveTab("fib"));
        if (toggleFcBtn) toggleFcBtn.addEventListener("click", () => setArchiveTab("fc"));

        function renderRows(items, tableBody, emptyMessage) {
            if (!tableBody) return;
            if (!items || items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">${emptyMessage}</td></tr>`;
                return;
            }

            tableBody.innerHTML = items.map(a => `
                <tr data-activity-id="${a.activity_id}">
                    <td>
                        <strong class="table-item-title cell-truncate">${escapeHtml(a.activity_name)}</strong>
                    </td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(a.lesson_name)}</span></td>
                    <td>${a.points} pts</td>
                    <td><span class="badge badge-inactive">Archived</span></td>
                    <td class="text-muted">${escapeHtml(a.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Restore" class="archive-action-icon restore-action js-restore-activity" data-id="${a.activity_id}" data-resource-id="${a.resource_id || ''}">
                                <i class="fa-solid fa-rotate-left"></i>
                            </a>
                            <a href="#" title="Permanently Delete" class="archive-action-icon delete-action js-permanent-delete-activity" data-id="${a.activity_id}">
                                <i class="fa-solid fa-trash-can"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedMct() {
            if (!mctTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/learning-activities/archived?type=Multiple%20Choice&q=${encodeURIComponent(q)}&page=${mctPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    mctTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load archived activities.</td></tr>`;
                    return;
                }

                renderRows(result.activities, mctTableBody, "No archived multiple choice tests found.");
                mctPage = result.page;
                mctTotalPages = result.total_pages;

                if (mctShowingCount) mctShowingCount.textContent = `Showing ${result.activities.length} of ${result.total} Archived Activities`;
                if (mctPageLabel) mctPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (mctPrevBtn) mctPrevBtn.disabled = result.page <= 1;
                if (mctNextBtn) mctNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                mctTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        async function loadArchivedFib() {
            if (!fibTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/learning-activities/archived?type=Fill%20in%20the%20Blanks&q=${encodeURIComponent(q)}&page=${fibPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    fibTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load archived activities.</td></tr>`;
                    return;
                }

                renderRows(result.activities, fibTableBody, "No archived fill in the blanks found.");
                fibPage = result.page;
                fibTotalPages = result.total_pages;

                if (fibShowingCount) fibShowingCount.textContent = `Showing ${result.activities.length} of ${result.total} Archived Activities`;
                if (fibPageLabel) fibPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (fibPrevBtn) fibPrevBtn.disabled = result.page <= 1;
                if (fibNextBtn) fibNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                fibTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        async function loadArchivedFc() {
            if (!fcTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/learning-activities/archived?type=Flashcards&q=${encodeURIComponent(q)}&page=${fcPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    fcTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load archived activities.</td></tr>`;
                    return;
                }

                renderRows(result.activities, fcTableBody, "No archived flashcards found.");
                fcPage = result.page;
                fcTotalPages = result.total_pages;

                if (fcShowingCount) fcShowingCount.textContent = `Showing ${result.activities.length} of ${result.total} Archived Activities`;
                if (fcPageLabel) fcPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (fcPrevBtn) fcPrevBtn.disabled = result.page <= 1;
                if (fcNextBtn) fcNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                fcTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (activeTab === "mct") {
                if (resetPage) mctPage = 1;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadArchivedMct, DEBOUNCE_MS);
            } else if (activeTab === "fib") {
                if (resetPage) fibPage = 1;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadArchivedFib, DEBOUNCE_MS);
            } else {
                if (resetPage) fcPage = 1;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadArchivedFc, DEBOUNCE_MS);
            }
        }

        if (openBtn) {
            openBtn.addEventListener("click", () => {
                modal.style.display = "flex";
                setArchiveTab("mct");
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
        }

        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none";
        });

        if (searchInput) {
            searchInput.addEventListener("input", () => scheduleLoad(true));
        }

        if (mctPrevBtn) mctPrevBtn.addEventListener("click", () => { if (mctPage > 1) { mctPage--; loadArchivedMct(); } });
        if (mctNextBtn) mctNextBtn.addEventListener("click", () => { if (mctPage < mctTotalPages) { mctPage++; loadArchivedMct(); } });

        if (fibPrevBtn) fibPrevBtn.addEventListener("click", () => { if (fibPage > 1) { fibPage--; loadArchivedFib(); } });
        if (fibNextBtn) fibNextBtn.addEventListener("click", () => { if (fibPage < fibTotalPages) { fibPage++; loadArchivedFib(); } });

        if (fcPrevBtn) fcPrevBtn.addEventListener("click", () => { if (fcPage > 1) { fcPage--; loadArchivedFc(); } });
        if (fcNextBtn) fcNextBtn.addEventListener("click", () => { if (fcPage < fcTotalPages) { fcPage++; loadArchivedFc(); } });

        function refreshCurrentTab() {
            if (activeTab === "mct") loadArchivedMct();
            else if (activeTab === "fib") loadArchivedFib();
            else loadArchivedFc();
        }

        function refreshMainActivityTable() {
            const mainSearch = document.getElementById("activitySearchInput");
            if (mainSearch) {
                mainSearch.dispatchEvent(new Event("input"));
            } else {
                window.location.reload();
            }
        }

        function handleActionClick(e) {
            const restoreBtn = e.target.closest(".js-restore-activity");
            const deleteBtn = e.target.closest(".js-permanent-delete-activity");

            if (restoreBtn) {
                e.preventDefault();
                const id = restoreBtn.dataset.id;
                const resourceId = restoreBtn.dataset.resourceId;
                showConfirmModal("Are you sure you want to restore this activity?", async () => {
                    restoreBtn.style.pointerEvents = "none";
                    try {
                        const resp = await fetch(`/admin/learning-activities/${id}/restore`, {
                            method: "POST",
                            credentials: "include"
                        });
                        const result = await resp.json();
                        if (!result.success) {
                            showAlertModal(result.message || "Could not restore activity.", "Error");
                        } else {
                            showAlertModal(result.message || "Learning activity restored successfully.", "Restored");
                            refreshCurrentTab();
                            // Task #124: the Activities table is grouped
                            // BY LESSON, not by individual activity - the
                            // row to flash is the Lesson's own row
                            // (data-resource-id), which is why this needs
                            // the activity's resource_id, not its own id.
                            if (resourceId) window.cobraByteHighlightRestoredId = resourceId;
                            refreshMainActivityTable();
                        }
                    } catch (err) {
                        showAlertModal("Could not reach the server. Please try again.", "Error");
                    } finally {
                        restoreBtn.style.pointerEvents = "";
                    }
                }, "Restore Activity?");
                return;
            }

            if (deleteBtn) {
                e.preventDefault();
                const id = deleteBtn.dataset.id;
                showConfirmModal(
                    "Are you sure you want to permanently delete this learning activity? " +
                    "This action cannot be undone and will permanently remove the activity and all its questions from the system.",
                    async () => {
                        deleteBtn.style.pointerEvents = "none";
                        try {
                            const resp = await fetch(`/admin/learning-activities/${id}/permanent-delete`, {
                                method: "POST",
                                credentials: "include"
                            });
                            const result = await resp.json();
                            if (!result.success) {
                                showAlertModal(result.message || "Could not permanently delete activity.", "Error");
                            } else {
                                showAlertModal(result.message || "Learning activity permanently deleted.", "Deleted");
                                refreshCurrentTab();
                            }
                        } catch (err) {
                            showAlertModal("Could not reach the server. Please try again.", "Error");
                        } finally {
                            deleteBtn.style.pointerEvents = "";
                        }
                    },
                    "Permanently Delete Activity?"
                );
            }
        }

        if (mctTableBody) mctTableBody.addEventListener("click", handleActionClick);
        if (fibTableBody) fibTableBody.addEventListener("click", handleActionClick);
        if (fcTableBody) fcTableBody.addEventListener("click", handleActionClick);
    });
})();
