/**
 * admin-dashboard-health.js - the System Health strip on the Admin Dashboard
 * (feat/admin-extras). Same data as Admin > System > System Health, every 30 s.
 */
(function () {
    "use strict";

    const REFRESH_MS = 30000;

    document.addEventListener("DOMContentLoaded", () => {
        const box = document.getElementById("dashHealth");
        if (!box) return;
        const status = document.getElementById("dashHealthStatus");
        const facts = document.getElementById("dashHealthFacts");

        async function refresh() {
            if (document.hidden) return;
            try {
                const response = await fetch("/admin/system-health/data", { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
                const data = await response.json();
                if (!data.success) return;
                const h = data.health;
                box.className = `ax-dash-health ax-health-${h.status}`;
                status.textContent = `System health: ${h.status_label}`;
                const bits = [
                    h.database.ok ? `Database OK (${h.database.response_ms} ms)` : "Database DOWN",
                    `Up ${h.app.uptime}`,
                    `${h.sessions.signed_in ?? "—"} signed in`,
                    `${h.errors.today ?? "—"} errors today`,
                    h.backup.found ? `Last backup ${h.backup.age}` : "No backup found",
                ];
                facts.textContent = bits.join("  ·  ");
            } catch (e) { /* next round */ }
        }

        refresh();
        setInterval(refresh, REFRESH_MS);
        document.addEventListener("visibilitychange", refresh);
    });
})();
