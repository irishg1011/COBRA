/**
 * admin-account-tools.js - Account & Security extras (feat/account-tools)
 * --------------------------------------------------------------------------
 *   1. "Allow progress reset (testing)" switch    GET/POST /admin/settings/progress-reset
 *   2. Pending Deletion modal + Restore            /admin/accounts/pending-deletion
 *                                                  /admin/accounts/<id>/restore-pending
 *   3. Account Details > Learning > Reset progress /admin/accounts/<id>/progress-reset
 *      (type the account ID to confirm; learners only; only while the switch is ON)
 *   4. Account Details > Security > Account Actions (the activity log)
 *
 * Account Details tells this file which account is open through the
 * "cobra:account-details" event (admin-account-actions.js fillDetails()).
 */
(function () {
    "use strict";

    const TOAST_MS = 3500;

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    async function request(url, method = "GET", body = null) {
        const options = {
            method,
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "include",
        };
        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success, data };
    }

    let toastTimer = null;
    function toast(message, isError = false) {
        const id = isError ? "accountErrorToast" : "accountSuccessToast";
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.className = isError ? "resource-popup-alert" : "changes-saved-toast";
            el.setAttribute("role", isError ? "alert" : "status");
            document.body.appendChild(el);
        }
        el.innerHTML = `<i class="fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"}"></i> <span>${escapeHtml(message)}</span>`;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), TOAST_MS);
    }

    function refreshTable() {
        if (window.CobraAccountsTable) window.CobraAccountsTable.refresh();
    }

    document.addEventListener("DOMContentLoaded", () => {
        // ------------------------------------------------------------
        // 1. The ON/OFF switch
        // ------------------------------------------------------------
        const resetSwitch = document.getElementById("progressResetSwitch");
        let resetAllowed = false;

        async function loadSwitch() {
            const { ok, data } = await request("/admin/settings/progress-reset");
            if (ok) {
                resetAllowed = Boolean(data.enabled);
                if (resetSwitch) resetSwitch.checked = resetAllowed;
            }
        }

        if (resetSwitch) {
            resetSwitch.addEventListener("change", async () => {
                const wanted = resetSwitch.checked;
                resetSwitch.disabled = true;
                const { ok, data } = await request("/admin/settings/progress-reset", "POST", { enabled: wanted });
                resetSwitch.disabled = false;
                if (!ok) {
                    resetSwitch.checked = !wanted;
                    toast(data.message || "Could not save the setting.", true);
                    return;
                }
                resetAllowed = Boolean(data.enabled);
                toast(resetAllowed ? "Progress reset is ON (testing)." : "Progress reset is OFF.");
                updateResetButton();
            });
        }
        loadSwitch();

        // ------------------------------------------------------------
        // 2. Pending Deletion
        // ------------------------------------------------------------
        const pendingModal = document.getElementById("pendingDeletionModal");
        const pendingBody = document.getElementById("pendingDeletionTableBody");
        const pendingSearch = document.getElementById("pendingDeletionSearchInput");
        const roleClass = (role) => role === "Admin" ? "badge-admin" : role === "Mentor" ? "badge-mentor" : "badge-learner";
        let pendingTimer = null;

        async function loadPending() {
            const q = pendingSearch ? pendingSearch.value.trim() : "";
            const { ok, data } = await request(`/admin/accounts/pending-deletion?q=${encodeURIComponent(q)}`);
            if (!ok) {
                pendingBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">${escapeHtml(data.message || "Could not load the list.")}</td></tr>`;
                return;
            }
            if (!data.accounts.length) {
                pendingBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Nobody is waiting to be deleted.</td></tr>`;
                return;
            }
            pendingBody.innerHTML = data.accounts.map((a) => `
                <tr>
                    <td><strong>${escapeHtml(a.full_name)}</strong><br><small class="text-muted">${escapeHtml(a.username)} · ${escapeHtml(a.acc_id)}</small></td>
                    <td><span class="badge ${roleClass(a.role)}">${escapeHtml(a.role)}</span></td>
                    <td class="text-muted">${escapeHtml(a.requested_at)}</td>
                    <td>${escapeHtml(a.delete_on)}<br><small class="text-muted">${a.days_left} day${a.days_left === 1 ? "" : "s"} left</small></td>
                    <td class="text-right"><button type="button" class="btn-pill-light js-restore-pending" data-acc-id="${escapeHtml(a.acc_id)}" data-name="${escapeHtml(a.full_name)}">
                        <i class="fa-solid fa-rotate-left"></i> Restore</button></td>
                </tr>`).join("");
        }

        function openPending() {
            pendingModal.classList.remove("is-hidden");
            if (pendingSearch) pendingSearch.value = "";
            pendingBody.innerHTML = `<tr><td colspan="5" class="text-muted table-empty-message">Loading&hellip;</td></tr>`;
            loadPending();
        }

        function closePending() {
            pendingModal.classList.add("is-hidden");
        }

        const openPendingBtn = document.getElementById("openPendingDeletionBtn");
        if (openPendingBtn && pendingModal) {
            openPendingBtn.addEventListener("click", openPending);
            document.getElementById("closePendingDeletionModal").addEventListener("click", closePending);
            pendingModal.addEventListener("click", (e) => { if (e.target === pendingModal) closePending(); });
            if (pendingSearch) pendingSearch.addEventListener("input", () => {
                clearTimeout(pendingTimer);
                pendingTimer = setTimeout(loadPending, 300);
            });
            pendingBody.addEventListener("click", async (e) => {
                const btn = e.target.closest(".js-restore-pending");
                if (!btn) return;
                btn.disabled = true;
                const { ok, data } = await request(`/admin/accounts/${encodeURIComponent(btn.dataset.accId)}/restore-pending`, "POST");
                toast(ok ? `${btn.dataset.name} restored - they can sign in normally again.` : (data.message || "Could not restore."), !ok);
                await loadPending();
                refreshTable();
            });
        }

        // ------------------------------------------------------------
        // 3. Reset progress (Account Details > Learning)
        // ------------------------------------------------------------
        const resetBtn = document.getElementById("openProgressResetBtn");
        const resetModal = document.getElementById("progressResetModal");
        const resetList = document.getElementById("progressResetList");
        const resetWho = document.getElementById("progressResetWho");
        const resetAccIdEl = document.getElementById("progressResetAccId");
        const resetTyped = document.getElementById("progressResetTyped");
        const resetMessage = document.getElementById("progressResetMessage");
        const resetConfirmBtn = document.getElementById("confirmProgressResetBtn");
        let account = null;

        function updateResetButton() {
            if (!resetBtn) return;
            const isLearner = account && account.role === "Learner";
            resetBtn.classList.toggle("is-hidden", !(isLearner && resetAllowed));
        }

        function closeReset() {
            resetModal.classList.add("is-hidden");
        }

        async function openReset() {
            if (!account) return;
            resetModal.classList.remove("is-hidden");
            resetWho.textContent = `${account.full_name} · ${account.acc_id}`;
            resetAccIdEl.textContent = account.acc_id;
            resetTyped.value = "";
            resetMessage.textContent = "";
            resetConfirmBtn.disabled = true;
            resetList.innerHTML = `<li class="text-muted">Loading&hellip;</li>`;
            resetTyped.focus();
            const { ok, data } = await request(`/admin/accounts/${encodeURIComponent(account.acc_id)}/progress-reset`);
            if (!ok) {
                resetList.innerHTML = `<li class="text-muted">${escapeHtml(data.message || "Could not load what would be erased.")}</li>`;
                return;
            }
            if (!data.allowed) resetMessage.textContent = data.message;
            const shown = data.rows.filter((r) => r.count > 0);
            resetList.innerHTML = shown.length
                ? shown.map((r) => `<li><span>${escapeHtml(r.label)}</span><strong>${escapeHtml(r.count)}</strong></li>`).join("")
                  + `<li class="at-reset-total"><span>Total rows erased</span><strong>${escapeHtml(data.total)}</strong></li>`
                : `<li class="text-muted">This learner has no progress yet - there is nothing to erase.</li>`;
        }

        if (resetBtn && resetModal) {
            resetBtn.addEventListener("click", openReset);
            document.getElementById("closeProgressResetModal").addEventListener("click", closeReset);
            document.getElementById("cancelProgressResetBtn").addEventListener("click", closeReset);
            resetModal.addEventListener("click", (e) => { if (e.target === resetModal) closeReset(); });
            resetTyped.addEventListener("input", () => {
                resetConfirmBtn.disabled = !account || resetTyped.value.trim() !== account.acc_id;
            });
            resetConfirmBtn.addEventListener("click", async () => {
                if (!account || resetTyped.value.trim() !== account.acc_id) return;
                resetConfirmBtn.disabled = true;
                resetConfirmBtn.textContent = "Resetting…";
                const { ok, data } = await request(`/admin/accounts/${encodeURIComponent(account.acc_id)}/progress-reset`, "POST",
                    { typed_acc_id: resetTyped.value.trim() });
                resetConfirmBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Reset progress';
                if (!ok) {
                    resetMessage.textContent = data.message || "Could not reset the progress.";
                    resetConfirmBtn.disabled = false;
                    return;
                }
                closeReset();
                toast(data.message);
                // Re-open the same account so its Learning tab and Account Actions show the change.
                const view = document.querySelector(`.js-account-view[data-acc-id="${CSS.escape(account.acc_id)}"][data-tab="learning"]`);
                if (view) view.click();
            });
        }

        // ------------------------------------------------------------
        // 4. Account Actions (activity log) + which account is open
        // ------------------------------------------------------------
        const actionsEl = document.getElementById("accountActionsLog");
        document.addEventListener("cobra:account-details", (e) => {
            account = e.detail || null;
            updateResetButton();
            if (!actionsEl || !account) return;
            const actions = account.actions || [];
            actionsEl.innerHTML = actions.length
                ? `<table class="data-table progress-detail-table at-actions-table"><thead><tr><th>When</th><th>What</th><th>By</th></tr></thead><tbody>
                    ${actions.map((a) => `<tr>
                        <td class="text-muted at-nowrap">${escapeHtml(a.at)}</td>
                        <td><strong>${escapeHtml(a.label)}</strong>${a.details ? `<br><small class="text-muted">${escapeHtml(a.details)}</small>` : ""}</td>
                        <td>${escapeHtml(a.by)}</td></tr>`).join("")}
                   </tbody></table>`
                : `<p class="text-muted progress-detail-note">No account actions yet.</p>`;
        });

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (resetModal && !resetModal.classList.contains("is-hidden")) { e.preventDefault(); closeReset(); return; }
            if (pendingModal && !pendingModal.classList.contains("is-hidden")) { e.preventDefault(); closePending(); }
        }, true);
    });
})();
