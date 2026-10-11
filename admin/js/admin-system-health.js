/**
 * admin-system-health.js - Admin > System > System Health (feat/admin-extras)
 * Renders the checks from system_health.py; asks /admin/system-health/data
 * again every 30 s (paused while the tab is hidden). Read-only.
 */
(function () {
    "use strict";

    const REFRESH_MS = 30000;

    function esc(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function stat(label, value, sub) {
        return `<div class="ax-stat"><span class="ax-stat-label">${esc(label)}</span>
            <strong class="ax-stat-value">${value == null || value === "" ? "—" : esc(value)}</strong>
            ${sub ? `<small class="ax-stat-sub">${esc(sub)}</small>` : ""}</div>`;
    }

    function card(title, icon, state, body) {
        return `<section class="ax-health-card ax-health-${state}">
            <h2 class="ax-health-title"><span class="ax-dot ax-dot-${state}" aria-hidden="true"></span>
                <i class="fa-solid ${icon}" aria-hidden="true"></i> ${esc(title)}</h2>
            <div class="ax-stats">${body}</div></section>`;
    }

    function render(h) {
        const root = document.getElementById("healthRoot");
        const db = h.database || {};
        const err = h.errors || {};
        const bk = h.backup || {};
        const disk = h.disk || {};
        const ses = h.sessions || {};
        let html = `<div class="ax-health-banner ax-health-${h.status}">
            <strong>${esc(h.status_label)}</strong>
            ${h.warnings && h.warnings.length ? `<ul>${h.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "<span>Every check passed.</span>"}
            <small>Checked ${esc(h.checked_at)}</small></div><div class="ax-health-grid">`;
        html += card("Database", "fa-database", db.ok ? "ok" : "down", db.ok
            ? stat("Status", db.message, `${db.response_ms} ms to answer`) + stat("Uptime", db.uptime, db.version)
              + stat("Size", db.size, `${db.tables} tables in ${db.name}`) + stat("Open connections", db.connections)
            : stat("Status", db.message));
        html += card("App server", "fa-server", "ok",
            stat("Uptime", h.app.uptime, `since ${h.app.started}`) + stat("Python", h.app.python, `process ${h.app.process}`));
        html += card("Sessions", "fa-users", "ok",
            stat("Signed in now", ses.signed_in) + stat("Active in the last 5 min", ses.online));
        html += card("Errors today", "fa-triangle-exclamation", err.today ? "warning" : "ok",
            stat("Server errors", err.today, err.today ? "see the list below" : "none today"));
        html += card("Last backup", "fa-box-archive", !bk.found ? "warning" : (bk.stale ? "warning" : "ok"), bk.found
            ? stat("Newest", bk.when, `${bk.age} · ${bk.size}`) + stat("Backups kept", bk.count, bk.file)
            : stat("Status", bk.message, `Folder: ${bk.folder} - run deploy/backup.sh daily`));
        html += card("Disk", "fa-hard-drive", disk.free_percent != null && disk.free_percent < 10 ? "warning" : "ok",
            stat("Free", disk.free, disk.total ? `of ${disk.total} (${disk.free_percent}% free)` : ""));
        html += `</div>`;
        html += `<section class="table-card ax-errors"><div class="panel-header"><h3>Last server errors</h3></div>
            ${err.recent && err.recent.length ? `<div class="table-scroll"><table class="data-table ax-table"><thead><tr><th>When</th><th>Code</th><th>Page</th><th>Error</th></tr></thead><tbody>
            ${err.recent.map((e) => `<tr><td class="text-muted ax-nowrap">${esc(e.when)}</td><td>${esc(e.status)}</td><td class="ax-details">${esc(e.where)}</td><td class="ax-details">${esc(e.what)}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="text-muted ax-empty">No server errors recorded.</p>`}</section>`;
        if (root.dataset.html !== html) {
            root.dataset.html = html;
            root.innerHTML = html;
        }
    }

    async function refresh() {
        if (document.hidden) return;
        try {
            const response = await fetch("/admin/system-health/data", { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
            const data = await response.json();
            if (data.success) render(data.health);
        } catch (e) { /* next round */ }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("healthRoot");
        if (!root) return;
        try { render(JSON.parse(root.dataset.health)); } catch (e) { refresh(); }
        setInterval(refresh, REFRESH_MS);
        document.addEventListener("visibilitychange", refresh);
    });
})();
