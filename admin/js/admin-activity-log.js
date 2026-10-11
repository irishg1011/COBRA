/**
 * admin-activity-log.js - Admin > System > Activity Log (feat/admin-extras)
 * --------------------------------------------------------------------------
 * Search + Person / Category / Action / dates re-ask /admin/activity-log/data
 * (no page reload); Prev / Next page; "Export CSV" downloads exactly what
 * the filters show (every page). New events appear with the shared 10 s
 * refresh (admin-live-refresh.js) while you are on page 1.
 */
(function () {
    "use strict";

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const $ = (id) => document.getElementById(id);
        const body = $("actBody");
        if (!body) return;
        const inputs = { q: $("actSearch"), actor: $("actActor"), category: $("actCategory"), action: $("actAction"), from: $("actFrom"), to: $("actTo") };
        const pageEl = $("actPage");
        let page = Number(pageEl.dataset.page) || 1;
        let totalPages = Number(pageEl.dataset.totalPages) || 1;
        let timer = null;
        let requestId = 0;

        function params(withPage = true) {
            const p = new URLSearchParams();
            Object.entries(inputs).forEach(([key, el]) => { if (el && el.value.trim()) p.set(key, el.value.trim()); });
            if (withPage) p.set("page", page);
            return p;
        }

        function rowHtml(r) {
            return `<tr>
                <td class="text-muted ax-nowrap">${escapeHtml(r.when)}</td>
                <td><strong>${escapeHtml(r.actor_name)}</strong>${r.actor_role ? `<small class="ax-sub">${escapeHtml(r.actor_role)}</small>` : ""}</td>
                <td><span class="ax-cat ax-cat-${escapeHtml(r.category)}">${escapeHtml(r.category_label)}</span> ${escapeHtml(r.label)}</td>
                <td class="ax-wrap">${escapeHtml(r.target_name)}${r.target_id && r.target_type ? `<small class="ax-sub">${escapeHtml(r.target_type)} #${escapeHtml(r.target_id)}</small>` : ""}</td>
                <td class="text-muted ax-details">${escapeHtml(r.details)}</td>
                <td class="text-muted ax-nowrap">${escapeHtml(r.ip_address)}</td>
            </tr>`;
        }

        function render(data) {
            body.innerHTML = data.rows.length
                ? data.rows.map(rowHtml).join("")
                : `<tr><td colspan="6" class="text-muted table-empty-message">Nothing matches these filters.</td></tr>`;
            page = data.page;
            totalPages = data.total_pages;
            pageEl.textContent = `${page} of ${totalPages}`;
            $("actCount").textContent = `${data.total} event${data.total === 1 ? "" : "s"}`;
            $("actPrev").disabled = page <= 1;
            $("actNext").disabled = page >= totalPages;
        }

        async function load(quiet = false) {
            const id = ++requestId;
            const err = $("actError");
            try {
                const response = await fetch(`/admin/activity-log/data?${params().toString()}`, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
                const data = await response.json();
                if (id !== requestId) return;
                if (!data.success) { err.textContent = data.message || "Could not load the log."; return; }
                err.textContent = "";
                if (quiet && window.CobraLive && !CobraLive.changed("activity-log", data.rows)) return;
                render(data);
            } catch (e) {
                if (!quiet) err.textContent = "Could not reach the server.";
            }
        }

        function restart() {
            page = 1;
            clearTimeout(timer);
            timer = setTimeout(() => load(), 250);
        }

        inputs.q.addEventListener("input", restart);
        ["actor", "category", "action", "from", "to"].forEach((k) => inputs[k].addEventListener("change", restart));
        $("actPrev").addEventListener("click", () => { if (page > 1) { page--; load(); } });
        $("actNext").addEventListener("click", () => { if (page < totalPages) { page++; load(); } });
        $("actPrev").disabled = page <= 1;
        $("actNext").disabled = page >= totalPages;
        $("actExport").addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = `/admin/activity-log/export.csv?${params(false).toString()}`;
        });

        if (window.CobraLive) {
            CobraLive.every("activity-log", async () => { if (page === 1) await load(true); });
        }
    });
})();
