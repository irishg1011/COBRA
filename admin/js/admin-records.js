/**
 * admin-records.js - Admin > System > Records (feat/admin-extras)
 * READ-ONLY: pick a table, search, page through it (/admin/records/data).
 * There is no edit / delete anywhere - the server only ever SELECTs, and
 * leaves secret columns (passwords, tokens) out completely.
 */
(function () {
    "use strict";

    function esc(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const $ = (id) => document.getElementById(id);
        const pick = $("recTable");
        if (!pick) return;
        const search = $("recSearch");
        let page = 1;
        let totalPages = 1;
        let timer = null;
        let requestId = 0;

        function cell(v) {
            if (v === null || v === undefined) return `<td class="ax-null">NULL</td>`;
            return `<td>${esc(v)}</td>`;
        }

        async function load() {
            const table = pick.value;
            search.disabled = !table;
            if (!table) return;
            const id = ++requestId;
            const params = new URLSearchParams({ table, page, q: search.value.trim() });
            try {
                const response = await fetch(`/admin/records/data?${params}`, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
                const data = await response.json();
                if (id !== requestId) return;
                if (!data.success) { $("recError").textContent = data.message || "Could not read this table."; return; }
                $("recError").textContent = "";
                $("recHead").innerHTML = `<tr>${data.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
                $("recBody").innerHTML = data.rows.length
                    ? data.rows.map((row) => `<tr>${row.map(cell).join("")}</tr>`).join("")
                    : `<tr><td colspan="${data.columns.length}" class="text-muted table-empty-message">No rows${search.value.trim() ? " match this search" : ""}.</td></tr>`;
                $("recHidden").textContent = data.hidden.length
                    ? `Never shown here: ${data.hidden.join(", ")}` : "";
                page = data.page;
                totalPages = data.total_pages;
                $("recPage").textContent = `${page} of ${totalPages}`;
                $("recCount").textContent = `${data.total} row${data.total === 1 ? "" : "s"}`;
                $("recPrev").disabled = page <= 1;
                $("recNext").disabled = page >= totalPages;
                const url = new URL(window.location.href);
                url.searchParams.set("table", table);
                window.history.replaceState(null, "", url.toString());
            } catch (e) {
                $("recError").textContent = "Could not reach the server.";
            }
        }

        pick.addEventListener("change", () => { page = 1; search.value = ""; load(); });
        search.addEventListener("input", () => { page = 1; clearTimeout(timer); timer = setTimeout(load, 300); });
        $("recPrev").addEventListener("click", () => { if (page > 1) { page--; load(); } });
        $("recNext").addEventListener("click", () => { if (page < totalPages) { page++; load(); } });
        if (pick.value) load();
    });
})();
