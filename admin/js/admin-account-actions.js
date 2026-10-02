/**
 * admin-account-actions.js - Admin > Account & Security row actions
 * --------------------------------------------------------------------
 * feat/archive-accounts
 *
 * 1. Row icons (eye / shield / chart-or-book) open #accountDetailsModal
 *    on the matching tab - data from /admin/accounts/<acc_id>/detail.
 *    The Learning tab's button opens the shared Course Progress modal
 *    (admin-learner-course-modal.js) on top.
 * 2. Archive (row icon or the modal's footer button) asks for
 *    confirmation in the shared #confirmActionModal, then POSTs
 *    /admin/accounts/<acc_id>/archive. Soft delete only.
 * 3. "Archived Accounts" opens #archivedAccountsModal - search,
 *    pagination and Restore (/admin/accounts/<acc_id>/restore).
 *
 * The server enforces every rule (not yourself, not the last admin) -
 * the disabled buttons here are only a convenience.
 * After archive/restore the table + metric cards reload through
 * window.CobraAccountsTable.refresh() (admin-account-search.js).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const TOAST_MS = 2500;

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("accountsTableBody");
        if (!tableBody) return;

        // ============================================================
        // Shared helpers
        // ============================================================
        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // feat/mentor-role: role -> badge class (Mentor has its own color).
        function roleBadgeClass(role) {
            if (role === "Admin") return "badge-admin";
            if (role === "Mentor") return "badge-mentor";
            return "badge-learner";
        }

        function badge(cls, label) {
            return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
        }

        function infoItem(label, value, sub = "") {
            return `
                <div class="progress-summary-item">
                    <span class="progress-summary-label">${escapeHtml(label)}</span>
                    <strong>${escapeHtml(value)}</strong>
                    ${sub ? `<small class="progress-summary-sub">${escapeHtml(sub)}</small>` : ""}
                </div>`;
        }

        async function postJson(url) {
            const response = await fetch(url, {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
            });
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok && data.success, message: data.message || "Something went wrong." };
        }

        // --- Toast: reuses .changes-saved-toast (success) / .resource-popup-alert (error) ---
        let toastTimer = null;
        function showToast(message, isError = false) {
            const id = isError ? "accountErrorToast" : "accountSuccessToast";
            let toast = document.getElementById(id);
            if (!toast) {
                toast = document.createElement("div");
                toast.id = id;
                toast.className = isError ? "resource-popup-alert" : "changes-saved-toast";
                toast.setAttribute("role", isError ? "alert" : "status");
                document.body.appendChild(toast);
            }
            const icon = isError ? "fa-circle-exclamation" : "fa-circle-check";
            toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
            toast.classList.add("show");
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove("show"), TOAST_MS);
        }

        // --- Shared #confirmActionModal as a promise (true = confirmed) ---
        const confirmModal = document.getElementById("confirmActionModal");
        const confirmTitle = document.getElementById("confirmActionTitle");
        const confirmText = document.getElementById("confirmActionText");
        const confirmCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmOkBtn = document.getElementById("confirmActionConfirmBtn");
        const confirmIcon = confirmModal ? confirmModal.querySelector(".modal-confirm-icon") : null;
        let confirmResolve = null;

        function askConfirm({ title, text, confirmLabel, danger }) {
            if (!confirmModal) return Promise.resolve(false);
            confirmTitle.textContent = title;
            confirmText.textContent = text;
            confirmOkBtn.textContent = confirmLabel;
            // Danger look for Archive, the normal green look for Restore.
            confirmOkBtn.classList.toggle("modal-btn-danger", danger);
            confirmOkBtn.classList.toggle("modal-btn-save", !danger);
            if (confirmIcon) {
                confirmIcon.classList.toggle("modal-confirm-icon-danger", danger);
                confirmIcon.classList.toggle("modal-confirm-icon-info", !danger);
            }
            confirmModal.classList.remove("modal-hidden");
            confirmCancelBtn.focus();
            return new Promise((resolve) => { confirmResolve = resolve; });
        }

        function settleConfirm(result) {
            if (!confirmResolve) return false;
            confirmModal.classList.add("modal-hidden");
            const resolve = confirmResolve;
            confirmResolve = null;
            resolve(result);
            return true;
        }

        if (confirmModal) {
            confirmOkBtn.addEventListener("click", () => settleConfirm(true));
            confirmCancelBtn.addEventListener("click", () => settleConfirm(false));
            confirmModal.addEventListener("click", (e) => {
                if (e.target === confirmModal) settleConfirm(false);
            });
        }

        function refreshTable() {
            if (window.CobraAccountsTable) return window.CobraAccountsTable.refresh();
            return Promise.resolve();
        }

        // Same soft green flash the other tables use after a restore.
        function flashRow(accId) {
            const row = Array.from(tableBody.querySelectorAll("tr[data-acc-id]"))
                .find((tr) => tr.dataset.accId === accId);
            if (!row) return;
            row.classList.remove("row-restored-highlight");
            void row.offsetWidth;
            row.classList.add("row-restored-highlight");
            row.addEventListener("animationend", () => row.classList.remove("row-restored-highlight"), { once: true });
        }

        // ============================================================
        // 1. ACCOUNT DETAILS MODAL
        // ============================================================
        const detailsModal = document.getElementById("accountDetailsModal");
        const detailsCloseBtn = document.getElementById("closeAccountDetailsBtn");
        const detailsError = document.getElementById("accountDetailsError");
        const nameEl = document.getElementById("accountDetailsName");
        const accIdEl = document.getElementById("accountDetailsAccId");
        const badgesEl = document.getElementById("accountDetailsBadges");
        const profileGrid = document.getElementById("accountProfileGrid");
        const securityGrid = document.getElementById("accountSecurityGrid");
        const recentLoginsEl = document.getElementById("accountRecentLogins");
        const learningGrid = document.getElementById("accountLearningGrid");
        const contentTableEl = document.getElementById("accountContentTable");
        const courseBtn = document.getElementById("openCourseProgressBtn");
        const archiveBtn = document.getElementById("accountArchiveBtn");
        const archiveNote = document.getElementById("accountArchiveNote");
        const tabs = detailsModal ? Array.from(detailsModal.querySelectorAll(".account-tab")) : [];
        const panels = {
            profile: document.getElementById("accountPanelProfile"),
            security: document.getElementById("accountPanelSecurity"),
            learning: document.getElementById("accountPanelLearning"),
            content: document.getElementById("accountPanelContent"),
        };
        const defaultArchiveNote = archiveNote ? archiveNote.textContent : "";

        let currentAccount = null;
        let detailsRequestId = 0;
        let detailsLastFocused = null;

        function selectTab(name) {
            const available = tabs.filter((t) => !t.classList.contains("is-hidden")).map((t) => t.dataset.tab);
            const target = available.includes(name) ? name : "profile";
            tabs.forEach((tab) => {
                const active = tab.dataset.tab === target;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
                tab.tabIndex = active ? 0 : -1;
            });
            Object.keys(panels).forEach((key) => {
                if (panels[key]) panels[key].classList.toggle("is-hidden", key !== target);
            });
        }

        function showDetailsError(message) {
            detailsError.textContent = message;
            detailsError.classList.add("is-visible");
        }

        function resetDetails() {
            currentAccount = null;
            nameEl.textContent = "—";
            accIdEl.textContent = "—";
            badgesEl.innerHTML = "";
            detailsError.textContent = "";
            detailsError.classList.remove("is-visible");
            profileGrid.innerHTML = `<p class="progress-detail-empty is-full">Loading...</p>`;
            securityGrid.innerHTML = "";
            recentLoginsEl.innerHTML = "";
            learningGrid.innerHTML = "";
            contentTableEl.innerHTML = "";
            archiveBtn.disabled = true;
            archiveNote.textContent = defaultArchiveNote;
        }

        function statusBadge(acc) {
            if (acc.is_locked) return badge("badge-locked", "Locked");
            return acc.status === "Active" ? badge("badge-active", "Active") : badge("badge-inactive", acc.status);
        }

        // Read-only "input" box like the Figma Edit Profile fields.
        // full = takes the whole row (Full Name / Username / Email).
        function profileField(label, value, { full = false, note = "" } = {}) {
            return `
                <div class="account-profile-field${full ? " is-full" : ""}">
                    <span class="account-profile-label">${escapeHtml(label)}</span>
                    <div class="account-profile-value">${escapeHtml(value)}${note ? ` <small>${escapeHtml(note)}</small>` : ""}</div>
                </div>`;
        }

        function fillProfile(acc) {
            // Mobile is only saved for accounts made with Create
            // Administrator - hide it when there's none, and let
            // Birthdate take the whole row instead.
            const hasMobile = acc.mobile && acc.mobile !== "—";
            const age = acc.age !== null && acc.age !== undefined ? `${acc.age} years old` : "";

            profileGrid.innerHTML = [
                profileField("Full Name", acc.full_name, { full: true }),
                profileField("Username", acc.username, { full: true }),
                profileField("Email", acc.email, { full: true }),
                profileField("Account ID", acc.acc_id),
                profileField("Gender", acc.gender),
                profileField("Birthdate", acc.birthdate, { full: !hasMobile, note: age }),
                hasMobile ? profileField("Mobile", acc.mobile) : "",
                profileField("Date Created", acc.date_created),
                profileField("Last Login", acc.last_login),
            ].join("");
        }

        function fillSecurity(sec, acc) {
            securityGrid.innerHTML = [
                infoItem("Right Now", sec.online ? "Online" : "Offline", sec.last_seen !== "—" ? `Last seen ${sec.last_seen}` : ""),
                infoItem("Successful Logins", sec.logins_success),
                infoItem("Failed Logins", sec.logins_failed, acc.failed_attempts ? `${acc.failed_attempts} in a row now` : ""),
                infoItem("Lockouts", sec.lockouts, sec.lockouts ? `Last: ${sec.last_lockout}` : ""),
                infoItem("Password Resets", sec.resets, sec.resets ? `Last: ${sec.last_reset}` : ""),
                infoItem("Locked Until", acc.is_locked ? acc.locked_until : "Not locked"),
            ].join("");

            if (!sec.recent_logins || sec.recent_logins.length === 0) {
                recentLoginsEl.innerHTML = `<p class="progress-detail-empty">No login attempts recorded yet.</p>`;
                return;
            }
            const rows = sec.recent_logins.map((l) => `
                <tr>
                    <td>${escapeHtml(l.attempted_at)}</td>
                    <td>${l.status === "Success" ? badge("badge-success-log", "Success") : badge("badge-failed-log", l.status)}</td>
                    <td>${escapeHtml(l.ip_address)}</td>
                </tr>`).join("");
            recentLoginsEl.innerHTML = `
                <table class="progress-detail-table">
                    <thead><tr><th>Date &amp; Time</th><th>Result</th><th>IP Address</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        }

        function fillLearning(learning) {
            if (!learning) {
                learningGrid.innerHTML = `<p class="progress-detail-empty">No learning data could be loaded for this learner.</p>`;
                courseBtn.disabled = true;
                return;
            }
            courseBtn.disabled = false;

            let current = learning.current_lesson || "—";
            let path = learning.current_path || "";
            if (learning.current_state === "not_started") { current = "Not started"; path = ""; }
            if (learning.current_state === "finished") { current = "Finished the course"; path = ""; }
            if (learning.current_state === "idle") path = `Last completed • ${path}`;

            learningGrid.innerHTML = [
                infoItem("Currently On", current, path),
                infoItem("Progress", `${learning.lessons_completed} / ${learning.lessons_total} lessons`,
                    `${learning.modules_completed} / ${learning.modules_total} modules`),
                infoItem("Avg Score", learning.avg_score === null || learning.avg_score === undefined ? "—" : `${learning.avg_score}%`),
                infoItem("Course Completion", `${learning.completion}%`),
                infoItem("Last Active", learning.last_active || "—"),
            ].join("");
        }

        function fillContent(content) {
            if (!content || content.length === 0) {
                contentTableEl.innerHTML = `<p class="progress-detail-empty">No content could be loaded.</p>`;
                return;
            }
            const rows = content.map((c) => `
                <tr>
                    <td>${escapeHtml(c.label)}</td>
                    <td><strong>${escapeHtml(c.total)}</strong></td>
                    <td>${escapeHtml(c.published)}</td>
                    <td>${escapeHtml(c.ready)}</td>
                    <td>${escapeHtml(c.draft)}</td>
                    <td>${escapeHtml(c.archived)}</td>
                </tr>`).join("");
            contentTableEl.innerHTML = `
                <table class="progress-detail-table">
                    <thead><tr><th>Content</th><th>Total</th><th>Published</th><th>Ready</th><th>Draft</th><th>Archived</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        }

        function fillDetails(acc) {
            currentAccount = acc;
            nameEl.textContent = acc.full_name;
            accIdEl.textContent = acc.acc_id;
            badgesEl.innerHTML = `${badge(roleBadgeClass(acc.role), acc.role)} ${statusBadge(acc)}`
                + (acc.is_self ? ` ${badge("badge-inactive", "You")}` : "");

            // Staff (Admin or Mentor) get the Content section; learners get Learning.
            const isStaff = acc.role === "Admin" || acc.role === "Mentor";
            document.getElementById("accountTabLearning").classList.toggle("is-hidden", isStaff);
            document.getElementById("accountTabContent").classList.toggle("is-hidden", !isStaff);

            fillProfile(acc);
            fillSecurity(acc.security || {}, acc);
            if (isStaff) fillContent(acc.content);
            else fillLearning(acc.learning);

            archiveBtn.disabled = Boolean(acc.archive_block);
            archiveNote.textContent = acc.archive_block || defaultArchiveNote;
        }

        async function openDetails(accId, tab) {
            if (!detailsModal || !accId) return;
            detailsLastFocused = document.activeElement;
            resetDetails();
            selectTab("profile");
            detailsModal.classList.remove("modal-hidden");
            detailsCloseBtn.focus();

            const requestId = ++detailsRequestId;
            try {
                const response = await fetch(`/admin/accounts/${encodeURIComponent(accId)}/detail`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== detailsRequestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);

                fillDetails(data.account);
                selectTab(tab);
            } catch (err) {
                if (requestId !== detailsRequestId) return;
                profileGrid.innerHTML = "";
                showDetailsError("Could not load this account. It may have been archived - close and try again.");
                console.error("admin-account-actions: failed to load account:", err);
            }
        }

        function closeDetails() {
            if (!detailsModal || detailsModal.classList.contains("modal-hidden")) return false;
            detailsRequestId++;
            detailsModal.classList.add("modal-hidden");
            if (detailsLastFocused && typeof detailsLastFocused.focus === "function" && document.contains(detailsLastFocused)) {
                detailsLastFocused.focus();
            }
            return true;
        }

        if (detailsModal) {
            tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));

            // Left / Right arrows move between visible tabs.
            detailsModal.querySelector(".account-tabs").addEventListener("keydown", (e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const visible = tabs.filter((t) => !t.classList.contains("is-hidden"));
                const index = visible.findIndex((t) => t.classList.contains("is-active"));
                const next = visible[(index + (e.key === "ArrowRight" ? 1 : -1) + visible.length) % visible.length];
                selectTab(next.dataset.tab);
                next.focus();
            });

            detailsCloseBtn.addEventListener("click", closeDetails);
            detailsModal.addEventListener("click", (e) => {
                if (e.target === detailsModal) closeDetails();
            });

            courseBtn.addEventListener("click", () => {
                if (currentAccount && window.CobraLearnerCourseModal) {
                    window.CobraLearnerCourseModal.open(currentAccount.acc_id);
                }
            });

            archiveBtn.addEventListener("click", () => {
                if (currentAccount && !currentAccount.archive_block) {
                    archiveAccount(currentAccount.acc_id, currentAccount.full_name);
                }
            });
        }

        // ============================================================
        // 2. ARCHIVE
        // ============================================================
        async function archiveAccount(accId, name) {
            const confirmed = await askConfirm({
                title: `Archive ${name}?`,
                text: "They won't be able to log in until the account is restored. "
                    + "Their progress, logs and uploaded content are kept - nothing is deleted.",
                confirmLabel: "Archive",
                danger: true,
            });
            if (!confirmed) return;

            const result = await postJson(`/admin/accounts/${encodeURIComponent(accId)}/archive`);
            if (!result.ok) {
                showToast(result.message, true);
                return;
            }
            closeDetails();
            showToast(result.message || "Account archived.");
            await refreshTable();
        }

        // Row icons (rows are rebuilt on every search, so delegate).
        tableBody.addEventListener("click", (e) => {
            const viewBtn = e.target.closest(".js-account-view");
            if (viewBtn) {
                openDetails(viewBtn.dataset.accId, viewBtn.dataset.tab);
                return;
            }
            const archiveRowBtn = e.target.closest(".js-account-archive");
            if (archiveRowBtn) archiveAccount(archiveRowBtn.dataset.accId, archiveRowBtn.dataset.name);
        });

        // ============================================================
        // 3. ARCHIVED ACCOUNTS MODAL (restore only)
        // ============================================================
        const archivedModal = document.getElementById("archivedAccountsModal");
        const openArchivedBtn = document.getElementById("openArchivedAccountsBtn");
        const closeArchivedBtn = document.getElementById("closeArchivedAccountsModal");
        const archivedSearch = document.getElementById("archivedAccountsSearchInput");
        const archivedBody = document.getElementById("archivedAccountsTableBody");
        const archivedCount = document.getElementById("archivedAccountsShowingCount");
        const archivedPageLabel = document.getElementById("archivedAccountsPageLabel");
        const archivedPrev = document.getElementById("archivedAccountsPrevBtn");
        const archivedNext = document.getElementById("archivedAccountsNextBtn");

        let archivedPage = 1;
        let archivedTotalPages = 1;
        let archivedRequestId = 0;
        let archivedDebounce = null;

        function archivedMessageRow(message) {
            archivedBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">${escapeHtml(message)}</td></tr>`;
        }

        async function loadArchived(page = 1) {
            const requestId = ++archivedRequestId;
            const params = new URLSearchParams({ page: String(page) });
            const term = archivedSearch.value.trim();
            if (term) params.set("q", term);

            try {
                const response = await fetch(`/admin/accounts/archived?${params.toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== archivedRequestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);

                archivedPage = data.page;
                archivedTotalPages = data.total_pages;
                const accounts = data.accounts || [];

                if (accounts.length === 0) {
                    archivedMessageRow(term ? "No archived accounts match your search." : "No archived accounts.");
                } else {
                    archivedBody.innerHTML = accounts.map((a) => `
                        <tr>
                            <td>
                                <strong class="table-item-title cell-truncate-1">${escapeHtml(a.full_name)}</strong>
                                <small class="text-muted cell-truncate-1">${escapeHtml(a.email)}</small>
                            </td>
                            <td><span class="cell-truncate-1 cell-truncate--sm">${escapeHtml(a.username)}</span></td>
                            <td>${badge(roleBadgeClass(a.role), a.role)}</td>
                            <td>${escapeHtml(a.archived_at)}</td>
                            <td class="text-right">
                                <button type="button" class="btn-pill-sm btn-pill-light js-restore-account" data-acc-id="${escapeHtml(a.acc_id)}" data-name="${escapeHtml(a.full_name)}">
                                    <i class="fa-solid fa-rotate-left"></i> Restore
                                </button>
                            </td>
                        </tr>`).join("");
                }

                archivedCount.textContent = `Showing ${accounts.length} of ${data.total} archived account${data.total === 1 ? "" : "s"}`;
                archivedPageLabel.textContent = `${archivedPage} of ${archivedTotalPages}`;
                archivedPrev.disabled = archivedPage <= 1;
                archivedNext.disabled = archivedPage >= archivedTotalPages;
            } catch (err) {
                if (requestId !== archivedRequestId) return;
                archivedMessageRow("Could not load archived accounts.");
                console.error("admin-account-actions: failed to load archived accounts:", err);
            }
        }

        function openArchived() {
            archivedSearch.value = "";
            archivedMessageRow("Loading archived accounts…");
            archivedModal.classList.remove("is-hidden");
            archivedSearch.focus();
            loadArchived(1);
        }

        function closeArchived() {
            if (archivedModal.classList.contains("is-hidden")) return false;
            archivedRequestId++;
            archivedModal.classList.add("is-hidden");
            openArchivedBtn.focus();
            return true;
        }

        async function restoreAccount(accId, name) {
            const confirmed = await askConfirm({
                title: `Restore ${name}?`,
                text: "The account goes back to the accounts table and can log in again, with all of its progress and content.",
                confirmLabel: "Restore",
                danger: false,
            });
            if (!confirmed) return;

            const result = await postJson(`/admin/accounts/${encodeURIComponent(accId)}/restore`);
            if (!result.ok) {
                showToast(result.message, true);
                return;
            }
            showToast(result.message || "Account restored.");
            await loadArchived(archivedPage);
            await refreshTable();
            flashRow(accId);
        }

        if (archivedModal && openArchivedBtn) {
            openArchivedBtn.addEventListener("click", openArchived);
            closeArchivedBtn.addEventListener("click", closeArchived);
            archivedModal.addEventListener("click", (e) => {
                if (e.target === archivedModal) closeArchived();
            });

            archivedSearch.addEventListener("input", () => {
                if (archivedDebounce) clearTimeout(archivedDebounce);
                archivedDebounce = setTimeout(() => loadArchived(1), DEBOUNCE_MS);
            });
            archivedPrev.addEventListener("click", () => {
                if (archivedPage > 1) loadArchived(archivedPage - 1);
            });
            archivedNext.addEventListener("click", () => {
                if (archivedPage < archivedTotalPages) loadArchived(archivedPage + 1);
            });
            archivedBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-restore-account");
                if (btn) restoreAccount(btn.dataset.accId, btn.dataset.name);
            });
        }

        // ============================================================
        // Escape: close only the TOP-most open thing
        // (confirm -> course/lesson modals [they mark the event used]
        //  -> details -> archived list)
        // ============================================================
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (settleConfirm(false) || closeDetails() || (archivedModal && closeArchived())) {
                e.preventDefault();
            }
        });
    });
})();
