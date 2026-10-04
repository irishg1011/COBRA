/**
 * admin-messages.js - Admin > Messages
 * --------------------------------------------------------------------
 * feat/contact-messages
 *
 * 1. Stat cards + table of the messages sent from the landing page's
 *    "Send Us a Message" form: search, status filter, Received date
 *    range, pagination - live, no reload (/admin/messages/data).
 * 2. Eye button: opens #messageDetailModal with the full message and
 *    the replies already sent (/admin/messages/<id>). Opening a message
 *    marks it as read.
 * 3. Send Reply: POST /admin/messages/<id>/reply {reply}. The server
 *    emails the reply to the sender and saves it; the modal and the
 *    table refresh afterwards.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const BASE_URL = "/admin/messages";

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("msgTableBody");
        if (!tableBody) return;

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("msgSearchInput");
        const statusSelect = document.getElementById("msgStatusSelect");
        const dateFromInput = document.getElementById("msgDateFromInput");
        const dateToInput = document.getElementById("msgDateToInput");
        const clearDateBtn = document.getElementById("clearMsgDateBtn");
        const dateFilterError = document.getElementById("msgDateFilterError");
        const showingCount = document.getElementById("msgShowingCount");
        const pageLabel = document.getElementById("msgPageLabel");
        const prevBtn = document.getElementById("msgPrevBtn");
        const nextBtn = document.getElementById("msgNextBtn");

        const metricEls = {
            total: document.getElementById("metricMsgTotal"),
            unread: document.getElementById("metricMsgUnread"),
            replied: document.getElementById("metricMsgReplied"),
            today: document.getElementById("metricMsgToday"),
        };

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML.replace(/"/g, "&quot;");
        }

        function statusPill(status, label) {
            const cls = ["unread", "read", "replied"].includes(status) ? status : "unread";
            return `<span class="msg-status msg-status-${cls}">${escapeHtml(label)}</span>`;
        }

        function emptyRow(message) {
            return `
                <tr>
                    <td colspan="6" class="text-muted table-empty-message">${escapeHtml(message)}</td>
                </tr>`;
        }

        function hasFilters() {
            return Boolean(searchInput.value.trim() || statusSelect.value || dateFromInput.value || dateToInput.value);
        }

        function validateDates() {
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
            if (dateFromInput.value && dateToInput.value && dateFromInput.value > dateToInput.value) {
                dateFilterError.textContent = "Received: the end date must be on or after the start date.";
                dateFilterError.classList.add("is-visible");
                return false;
            }
            return true;
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            const q = searchInput.value.trim();
            if (q) params.set("q", q);
            if (statusSelect.value) params.set("status", statusSelect.value);
            if (dateFromInput.value) params.set("date_from", dateFromInput.value);
            if (dateToInput.value) params.set("date_to", dateToInput.value);
            params.set("page", String(page));
            return params;
        }

        function renderRows(rows) {
            if (!rows.length) {
                tableBody.innerHTML = emptyRow(hasFilters()
                    ? "No messages match your search or filters."
                    : "No messages yet. Messages sent from the landing page will appear here.");
                return;
            }
            tableBody.innerHTML = rows.map((row) => `
                <tr class="${row.status === "unread" ? "msg-row-unread" : ""}">
                    <td>${row.status === "unread" ? '<span class="msg-unread-dot" aria-hidden="true"></span>' : ""}${escapeHtml(row.name)}</td>
                    <td>${escapeHtml(row.email)}</td>
                    <td>${escapeHtml(row.preview)}</td>
                    <td>${escapeHtml(row.received_at)}</td>
                    <td>${statusPill(row.status, row.status_label)}</td>
                    <td>
                        <button type="button" class="icon-button-reset msg-view-btn js-view-message-btn" data-message-id="${escapeHtml(row.message_id)}" title="View and reply" aria-label="View message from ${escapeHtml(row.name)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>`).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                if (metricEls[key] && metrics[key] !== undefined) metricEls[key].textContent = metrics[key];
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            showingCount.textContent = `Showing ${countOnPage} of ${total} messages`;
            pageLabel.textContent = `${page} of ${pages}`;
            prevBtn.disabled = page <= 1;
            nextBtn.disabled = page >= pages;
        }

        async function fetchRows(page = 1) {
            if (!validateDates()) return;
            const requestId = ++activeRequestId;
            try {
                const response = await fetch(`${BASE_URL}/data?${buildParams(page).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (requestId !== activeRequestId) return;   // a newer request already won

                const rows = data.rows || [];
                renderRows(rows);
                updateMetrics(data.metrics);
                updatePagination(rows.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-messages: failed to load messages:", err);
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = emptyRow("Could not load messages. Please refresh the page.");
            }
        }

        searchInput.addEventListener("input", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchRows(1), DEBOUNCE_MS);
        });
        statusSelect.addEventListener("change", () => fetchRows(1));
        dateFromInput.addEventListener("change", () => fetchRows(1));
        dateToInput.addEventListener("change", () => fetchRows(1));
        clearDateBtn.addEventListener("click", () => {
            dateFromInput.value = "";
            dateToInput.value = "";
            fetchRows(1);
        });
        prevBtn.addEventListener("click", () => { if (currentPage > 1) fetchRows(currentPage - 1); });
        nextBtn.addEventListener("click", () => { if (currentPage < totalPages) fetchRows(currentPage + 1); });

        // ============================================================
        // 2 + 3. MESSAGE MODAL: read + reply
        // ============================================================
        const modal = document.getElementById("messageDetailModal");
        const nameEl = document.getElementById("messageDetailName");
        const emailEl = document.getElementById("messageDetailEmail");
        const receivedEl = document.getElementById("messageDetailReceived");
        const statusEl = document.getElementById("messageDetailStatus");
        const textEl = document.getElementById("messageDetailText");
        const repliesEl = document.getElementById("messageDetailReplies");
        const errorEl = document.getElementById("messageDetailError");
        const replyInput = document.getElementById("messageReplyInput");
        const replyNote = document.getElementById("messageReplyNote");
        const sendBtn = document.getElementById("sendMessageReplyBtn");
        const closeBtn = document.getElementById("closeMessageDetailBtn");
        const closeFooterBtn = document.getElementById("closeMessageDetailFooterBtn");

        let openMessageId = null;
        let modalRequestId = 0;
        let lastFocused = null;
        let sending = false;

        function showNote(text, isError) {
            replyNote.textContent = text || "";
            replyNote.classList.toggle("is-error", Boolean(isError));
        }

        function fillModal(record) {
            nameEl.textContent = record.name;
            emailEl.textContent = record.email;
            receivedEl.textContent = record.received_at;
            statusEl.innerHTML = statusPill(record.status, record.status_label);
            textEl.textContent = record.message;
            repliesEl.innerHTML = record.replies && record.replies.length
                ? record.replies.map((reply) => `
                    <div class="msg-reply-item">
                        <p class="msg-reply-by">${escapeHtml(reply.by)} &middot; ${escapeHtml(reply.sent_at)}</p>
                        <p class="msg-reply-text">${escapeHtml(reply.text)}</p>
                    </div>`).join("")
                : '<p class="msg-detail-empty">No reply has been sent yet.</p>';
        }

        function resetModal() {
            [nameEl, emailEl, receivedEl].forEach((el) => { el.textContent = "—"; });
            statusEl.innerHTML = "";
            textEl.textContent = "Loading...";
            repliesEl.innerHTML = "";
            errorEl.textContent = "";
            replyInput.value = "";
            showNote("");
            sendBtn.disabled = true;
        }

        async function openModal(messageId) {
            openMessageId = messageId;
            lastFocused = document.activeElement;
            resetModal();
            modal.classList.remove("modal-hidden");
            closeBtn.focus();

            const requestId = ++modalRequestId;
            try {
                const response = await fetch(`${BASE_URL}/${encodeURIComponent(messageId)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json().catch(() => ({}));
                if (requestId !== modalRequestId) return;   // closed, or another message opened
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);

                fillModal(data.record);
                sendBtn.disabled = false;
                fetchRows(currentPage);   // the row is now "Read"
            } catch (err) {
                if (requestId !== modalRequestId) return;
                console.error("admin-messages: failed to open message:", err);
                textEl.textContent = "";
                errorEl.textContent = "Could not load this message. Please close and try again.";
            }
        }

        function closeModal() {
            if (modal.classList.contains("modal-hidden") || sending) return false;
            modalRequestId++;
            openMessageId = null;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        async function sendReply() {
            if (sending || !openMessageId) return;
            const reply = replyInput.value.trim();
            if (!reply) {
                showNote("Write your reply first.", true);
                replyInput.focus();
                return;
            }

            sending = true;
            sendBtn.disabled = true;
            showNote("Sending your reply...");
            try {
                const response = await fetch(`${BASE_URL}/${encodeURIComponent(openMessageId)}/reply`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                    body: JSON.stringify({ reply }),
                });
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success) {
                    if (data.record) fillModal(data.record);
                    replyInput.value = "";
                    showNote(data.message || "Reply sent.");
                    fetchRows(currentPage);
                } else {
                    showNote(data.message || "The reply could not be sent. Please try again.", true);
                }
            } catch (err) {
                console.error("admin-messages: failed to send reply:", err);
                showNote("The reply could not be sent. Check your connection and try again.", true);
            } finally {
                sending = false;
                sendBtn.disabled = false;
            }
        }

        // Rows are rebuilt on every fetch, so the eye buttons use delegation.
        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-message-btn");
            if (btn) openModal(btn.dataset.messageId);
        });
        sendBtn.addEventListener("click", sendReply);
        replyInput.addEventListener("input", () => showNote(""));
        closeBtn.addEventListener("click", closeModal);
        closeFooterBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && closeModal()) e.preventDefault();
        });

        fetchRows(1);
    });
})();