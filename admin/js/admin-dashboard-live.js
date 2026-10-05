/**
 * admin-dashboard-live.js - Admin Dashboard auto-refresh
 * --------------------------------------------------------------------
 * Every 10 s (shared timer, admin-live-refresh.js) asks /admin/dashboard/live
 * for the Dashboard's sections - account cards, learning cards, Top 5
 * learners, Recent logins, Content snapshot - rendered by the SAME templates
 * the page was built from (dashboard-live-*.html). A section is swapped only
 * when its HTML changed; an unchanged section is never touched.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const holders = {};
        document.querySelectorAll("[data-live-section]").forEach((el) => {
            holders[el.dataset.liveSection] = el;
        });
        if (!window.CobraLive || !Object.keys(holders).length) return;

        const lastHtml = {};

        function visibleText(html) {
            const tpl = document.createElement("template");
            tpl.innerHTML = html;
            return tpl.content.textContent.replace(/\s+/g, " ").trim();
        }

        CobraLive.every("dashboard", async () => {
            const response = await fetch("/admin/dashboard/live", {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
            });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || !data.sections) return;

            Object.keys(holders).forEach((name) => {
                const html = data.sections[name];
                if (typeof html !== "string" || html === lastHtml[name]) return;
                const holder = holders[name];
                // First answer: the page was rendered from the same template a
                // moment ago - keep it if it still says the same thing.
                const firstLook = !(name in lastHtml);
                lastHtml[name] = html;
                if (firstLook && visibleText(html) === holder.textContent.replace(/\s+/g, " ").trim()) return;
                holder.innerHTML = html;
            });
        });
    });
})();
