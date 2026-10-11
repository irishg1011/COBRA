/**
 * admin-help-requests.js - Account & Security > Help Requests (feat/account-tools)
 * --------------------------------------------------------------------------
 * Open / Done tabs from /admin/help-requests/data?status=. Each open request:
 *   Reset password  -> confirm -> POST .../reset-password -> the temporary
 *                      password, shown ONCE (never kept by this page)
 *   Unlock now      -> POST .../unlock     (only when the account is locked)
 *   Mark done       -> POST .../done
 * The list refreshes with the shared 10 s timer (admin-live-refresh.js),
 * except while a modal is open.
 */
(function () {
    "use strict";

    const RESOLUTION = { password_reset: "Password reset", unlocked: "Unlocked", other: "Marked done" };

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    async function request(url, method = "GET") {
        const response = await fetch(url, {
            method,
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "include",
            cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success, data };
    }

    document.addEventListener("DOMContentLoaded", () => {
        const list = document.getElementById("helpRequestsList");
        if (!list) return;
        const tabs = Array.from(document.querySelectorAll(".at-help-tab"));
        const confirmModal = document.getElementById("helpResetConfirmModal");
        const confirmText = document.getElementById("helpResetConfirmText");
        const confirmMessage = document.getElementById("helpResetConfirmMessage");
        const confirmBtn = document.getElementById("helpResetConfirmBtn");
        const tempModal = document.getElementById("helpTempPasswordModal");
        const tempValue = document.getElementById("helpTempPasswordValue");
        const tempFor = document.getElementById("helpTempPasswordFor");
        const copyBtn = document.getElementById("helpTempPasswordCopy");

        let status = "open";
        let pendingReset = null;   // {id, name}

        const roleClass = (role) => role === "Admin" ? "badge-admin" : role === "Mentor" ? "badge-mentor" : "badge-learner";

        function accountHtml(r) {
            const a = r.account;
            if (!a) {
                return `<div class="at-help-who"><strong>“${escapeHtml(r.typed_name)}”</strong>
                    <span class="badge badge-inactive">No matching staff account</span></div>
                    <p class="text-muted at-help-note">Nothing to reset. If you know who it is, find them in Account Management.</p>`;
            }
            const flags = [];
            if (a.is_locked) flags.push('<span class="badge badge-locked">Locked</span>');
            if (a.must_change_password) flags.push('<span class="badge badge-inactive">Waiting to set a new password</span>');
            if (a.pending_deletion) flags.push('<span class="badge badge-pending-deletion">Pending deletion</span>');
            if (a.archived) flags.push('<span class="badge badge-inactive">Archived</span>');
            return `<div class="at-help-who">
                    <strong>${escapeHtml(a.full_name)}</strong>
                    <span class="badge ${roleClass(a.role)}">${escapeHtml(a.role)}</span> ${flags.join(" ")}
                </div>
                <div class="at-help-facts text-muted">
                    <span><i class="fa-solid fa-user"></i> ${escapeHtml(a.username)} · ${escapeHtml(a.acc_id)}</span>
                    <span><i class="fa-solid fa-envelope"></i> ${escapeHtml(a.email)}</span>
                    <span><i class="fa-solid fa-clock-rotate-left"></i> Last login ${escapeHtml(a.last_login)}</span>
                    ${a.failed_attempts ? `<span><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(a.failed_attempts)} wrong tries</span>` : ""}
                </div>
                ${r.typed_name.toLowerCase() !== String(a.username).toLowerCase() && r.typed_name.toUpperCase() !== a.acc_id
                    ? `<p class="text-muted at-help-note">They typed “${escapeHtml(r.typed_name)}”.</p>` : ""}`;
        }

        function actionsHtml(r) {
            if (r.status === "done") {
                return `<div class="at-help-done text-muted">
                    <span class="badge badge-active">${escapeHtml(RESOLUTION[r.resolution] || "Done")}</span>
                    by ${escapeHtml(r.handled_by || "—")} · ${escapeHtml(r.handled_at)}</div>`;
            }
            const a = r.account;
            const canReset = a && !a.archived;
            return `<div class="at-help-actions">
                ${canReset ? `<button type="button" class="btn-pill-danger js-help-reset" data-id="${r.request_id}" data-name="${escapeHtml(a.full_name)}"><i class="fa-solid fa-key"></i> Reset password</button>` : ""}
                ${a && a.is_locked ? `<button type="button" class="btn-pill-light js-help-unlock" data-id="${r.request_id}"><i class="fa-solid fa-lock-open"></i> Unlock now</button>` : ""}
                <button type="button" class="btn-pill-light js-help-done" data-id="${r.request_id}"><i class="fa-solid fa-check"></i> Mark done</button>
            </div>`;
        }

        function render(data) {
            Object.entries(data.counts || {}).forEach(([key, n]) => {
                const el = document.querySelector(`[data-count="${key}"]`);
                if (el) el.textContent = n;
            });
            const rows = data.requests || [];
            if (!rows.length) {
                list.innerHTML = `<p class="text-muted table-empty-message">${status === "open" ? "No open help requests. 🎉" : "No closed requests yet."}</p>`;
                return;
            }
            list.innerHTML = rows.map((r) => `
                <article class="at-help-item">
                    <div class="at-help-main">
                        ${accountHtml(r)}
                        <blockquote class="at-help-message">${escapeHtml(r.message)}</blockquote>
                        <div class="at-help-meta text-muted">Request #${r.request_id} · ${escapeHtml(r.created_at)} · IP ${escapeHtml(r.ip_address)}</div>
                    </div>
                    ${actionsHtml(r)}
                </article>`).join("");
        }

        async function load(quiet = false) {
            if (!quiet) list.innerHTML = `<p class="text-muted table-empty-message">Loading&hellip;</p>`;
            const { ok, data } = await request(`/admin/help-requests/data?status=${status}`);
            if (!ok) {
                if (!quiet) list.innerHTML = `<p class="text-muted table-empty-message">${escapeHtml(data.message || "Could not load the requests.")}</p>`;
                return;
            }
            if (quiet && window.CobraLive && !CobraLive.changed("help-requests", data)) return;
            render(data);
        }

        tabs.forEach((tab) => tab.addEventListener("click", () => {
            status = tab.dataset.status;
            tabs.forEach((t) => {
                t.classList.toggle("is-active", t === tab);
                t.setAttribute("aria-selected", t === tab ? "true" : "false");
            });
            if (window.CobraLive) CobraLive.changed("help-requests", null);
            load();
        }));

        // --- actions ---
        function closeModals() {
            confirmModal.classList.add("is-hidden");
        }
        document.querySelectorAll(".js-help-modal-close").forEach((b) => b.addEventListener("click", closeModals));

        list.addEventListener("click", async (e) => {
            const reset = e.target.closest(".js-help-reset");
            const unlock = e.target.closest(".js-help-unlock");
            const done = e.target.closest(".js-help-done");
            if (reset) {
                pendingReset = { id: reset.dataset.id, name: reset.dataset.name };
                confirmText.textContent = `Reset the password of ${reset.dataset.name}? Only do this after checking it's really them.`;
                confirmMessage.textContent = "";
                confirmBtn.disabled = false;
                confirmModal.classList.remove("is-hidden");
                confirmBtn.focus();
                return;
            }
            const btn = unlock || done;
            if (!btn) return;
            btn.disabled = true;
            const { ok, data } = await request(`/admin/help-requests/${btn.dataset.id}/${unlock ? "unlock" : "done"}`, "POST");
            if (!ok) {
                btn.disabled = false;
                alertMessage(data.message || "Something went wrong.");
            }
            load(true);
        });

        function alertMessage(text) {
            const note = document.createElement("p");
            note.className = "at-form-message at-help-alert";
            note.textContent = text;
            list.prepend(note);
            setTimeout(() => note.remove(), 4000);
        }

        confirmBtn.addEventListener("click", async () => {
            if (!pendingReset) return;
            confirmBtn.disabled = true;
            const { ok, data } = await request(`/admin/help-requests/${pendingReset.id}/reset-password`, "POST");
            if (!ok || !data.temp_password) {
                confirmMessage.textContent = data.message || "Could not reset the password.";
                confirmBtn.disabled = false;
                return;
            }
            closeModals();
            tempFor.textContent = `For ${pendingReset.name}. They'll be asked to choose their own password right after signing in.`;
            tempValue.textContent = data.temp_password;
            tempModal.classList.remove("is-hidden");
            copyBtn.focus();
            pendingReset = null;
            load(true);
        });

        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(tempValue.textContent);
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
            } catch (err) {
                const range = document.createRange();
                range.selectNodeContents(tempValue);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                copyBtn.textContent = "Press Ctrl+C";
            }
        });

        document.getElementById("helpTempPasswordDone").addEventListener("click", () => {
            tempValue.textContent = "";            // gone from the page for good
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
            tempModal.classList.add("is-hidden");
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !confirmModal.classList.contains("is-hidden")) closeModals();
        });

        load();
        if (window.CobraLive) {
            CobraLive.every("help-requests", async ({ modalOpen }) => {
                if (!modalOpen) await load(true);
            });
        }
    });
})();
