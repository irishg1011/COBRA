/**
 * admin-presence-beat.js - "Who's here / who's editing" (feat/publishing-presence)
 * --------------------------------------------------------------------------
 * Loaded by admin-header.html on every staff page. Presence only - like the
 * faces at the top of a Google Doc. It never locks anything and never
 * shares what anyone types.
 *
 * Every HEARTBEAT_MS this tab tells POST /admin/presence/heartbeat:
 *     tab_id        random id kept in sessionStorage (one per browser tab)
 *     path          the page it is on
 *     items         what it has open in an editor: the header's
 *                   <meta name="cobra-editing">, every saved card of the
 *                   coding-exercise editor, and Publishing's open Edit
 *                   chapter / module pop-up ([data-presence-item])
 *     hidden        tab in the background (the server waits longer)
 *     idle_seconds  time since the last click / key / scroll here
 * and gets back who else is on this page and every item someone has open.
 *
 *   Editors     someone else already has the same item open -> warning
 *               "<Name> is editing this right now..." [Open anyway] [Go back].
 *               This tab only counts as "editing" after Open anyway (or when
 *               nobody else had it), then a small bar keeps showing who
 *               else has it open - on BOTH sides.
 *   Publishing  "Here now" avatars (#presenceHere) and "✏️ <Name> is editing"
 *               next to each item in the tree (re-added after every redraw:
 *               "cobra:publishing-rendered" from admin-publishing.js).
 * Closing the tab removes it at once (sendBeacon /admin/presence/leave).
 */
(function () {
    "use strict";

    const HEARTBEAT_MS = 15000;
    const ITEM_RE = /^(cat|mod|res|vid|act|ex)-\d+$/;

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function tabId() {
        try {
            let id = sessionStorage.getItem("cobraPresenceTab");
            if (!id) {
                const bytes = new Uint8Array(12);
                crypto.getRandomValues(bytes);
                id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
                sessionStorage.setItem("cobraPresenceTab", id);
            }
            return id;
        } catch (e) {
            return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    const TAB_ID = tabId();
    let lastActive = Date.now();
    let timer = null;
    let stopped = false;
    let last = null;                 // the latest answer from the server
    let claimed = false;             // editor: counts as "editing" yet?
    let warned = false;

    ["mousemove", "keydown", "click", "scroll", "input", "touchstart"].forEach((type) => {
        document.addEventListener(type, () => { lastActive = Date.now(); }, { passive: true, capture: true });
    });

    // ------------------------------------------------------------
    // What this tab has open
    // ------------------------------------------------------------
    function pageItems() {
        const out = [];
        const meta = document.querySelector('meta[name="cobra-editing"]');
        if (meta && ITEM_RE.test(meta.content)) out.push(meta.content);
        // Coding exercise editor: every saved exercise card on the page.
        document.querySelectorAll("#exerciseCards .exercise-card[data-exercise-id]").forEach((card) => {
            const id = `ex-${card.dataset.exerciseId}`;
            if (ITEM_RE.test(id)) out.push(id);
        });
        return [...new Set(out)];
    }

    function popupItems() {
        // Publishing: the Edit chapter / Edit module pop-up that is open right now.
        return Array.from(document.querySelectorAll("[data-presence-item]"))
            .filter((el) => el.offsetParent !== null || getComputedStyle(el).display !== "none")
            .map((el) => el.dataset.presenceItem)
            .filter((id) => ITEM_RE.test(id));
    }

    function currentItems() {
        return [...new Set((claimed ? pageItems() : []).concat(popupItems()))];
    }

    // ------------------------------------------------------------
    // Heartbeat
    // ------------------------------------------------------------
    async function beat() {
        if (stopped) return;
        try {
            const response = await fetch("/admin/presence/heartbeat", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
                body: JSON.stringify({
                    tab_id: TAB_ID,
                    path: window.location.pathname,
                    items: currentItems(),
                    hidden: document.hidden,
                    idle_seconds: Math.round((Date.now() - lastActive) / 1000),
                }),
            });
            if (response.status === 401 || response.status === 403) { stopped = true; return; }
            const type = response.headers.get("Content-Type") || "";
            if (!response.ok || !type.includes("application/json")) return;
            const data = await response.json();
            if (!data.success) return;
            last = data;
            onAnswer(data);
        } catch (e) {
            // a missed beat is fine - the next one tries again
        }
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            await beat();
            schedule();
        }, HEARTBEAT_MS);
    }

    function beatNow() {
        beat().then(schedule);
    }

    document.addEventListener("visibilitychange", beatNow);
    window.addEventListener("pagehide", () => {
        try {
            navigator.sendBeacon("/admin/presence/leave", JSON.stringify({ tab_id: TAB_ID }));
        } catch (e) { /* the row simply expires */ }
    });

    // ------------------------------------------------------------
    // Answers
    // ------------------------------------------------------------
    function othersOn(items, data) {
        const people = {};
        items.forEach((item) => {
            ((data.editing || {})[item] || []).forEach((p) => {
                if (p.is_me) return;
                const cur = people[p.acc_id];
                if (!cur || p.idle_seconds < cur.idle_seconds) people[p.acc_id] = p;
            });
        });
        return Object.values(people).sort((a, b) => a.idle_seconds - b.idle_seconds);
    }

    function describe(person) {
        return person.idle
            ? `${person.name} has it open (idle ${person.idle_minutes} min)`
            : `${person.name} is editing`;
    }

    function onAnswer(data) {
        const mine = pageItems();
        if (mine.length && !claimed) {
            const others = othersOn(mine, data);
            if (others.length && !warned) {
                warned = true;
                showWarning(others);
                return;
            }
            if (!others.length) {
                claimed = true;
                beatNow();          // tell the others right away
                return;
            }
        }
        renderEditorBar(claimed ? othersOn(mine, data) : []);
        renderHere(data.here || []);
        decorateTree();
    }

    // ------------------------------------------------------------
    // Editor: warning on open + "also open" bar
    // ------------------------------------------------------------
    function showWarning(others) {
        const lead = others[0];
        const more = others.length > 1 ? ` (and ${others.length - 1} more)` : "";
        const overlay = document.createElement("div");
        overlay.className = "sp-overlay";
        overlay.innerHTML = `
            <div class="sp-dialog" role="alertdialog" aria-modal="true" aria-labelledby="spTitle" aria-describedby="spText">
                <div class="sp-icon" aria-hidden="true">✏️</div>
                <h2 class="sp-title" id="spTitle">Someone is already editing this</h2>
                <p class="sp-text" id="spText"></p>
                <p class="sp-note">Nothing is locked - but if you both save, the last save wins and can overwrite the other person's changes.</p>
                <div class="sp-actions">
                    <button type="button" class="sp-btn sp-btn--ghost" data-sp="back">Go back</button>
                    <button type="button" class="sp-btn sp-btn--primary" data-sp="open">Open anyway</button>
                </div>
            </div>`;
        overlay.querySelector("#spText").textContent = lead.idle
            ? `${lead.name}${more} has this open (idle ${lead.idle_minutes} min) - your changes may overwrite each other.`
            : `${lead.name}${more} is editing this right now - your changes may overwrite each other.`;
        document.body.appendChild(overlay);
        overlay.querySelector('[data-sp="open"]').focus();
        overlay.querySelector('[data-sp="open"]').addEventListener("click", () => {
            overlay.remove();
            claimed = true;
            beatNow();
        });
        overlay.querySelector('[data-sp="back"]').addEventListener("click", goBack);
    }

    function goBack() {
        try { navigator.sendBeacon("/admin/presence/leave", JSON.stringify({ tab_id: TAB_ID })); } catch (e) { /* expires */ }
        stopped = true;
        let back = "/admin/publishing";
        try {
            const params = new URLSearchParams(window.location.search);
            const item = pageItems()[0];
            if (params.get("return") === "publishing" && item) {
                back = `/admin/publishing?tab=${encodeURIComponent(params.get("tab") || "draft")}&focus=${encodeURIComponent(item)}`;
            } else if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
                back = document.referrer;
            }
        } catch (e) { /* default */ }
        window.location.href = back;
    }

    let bar = null;
    function renderEditorBar(others) {
        if (!others.length) {
            if (bar) { bar.remove(); bar = null; }
            return;
        }
        if (!bar) {
            bar = document.createElement("div");
            bar.className = "sp-editor-bar";
            bar.setAttribute("role", "status");
            document.body.appendChild(bar);
        }
        const text = `✏️ Also open: ${others.map(describe).join(" · ")} - save carefully, the last save wins.`;
        if (bar.textContent !== text) bar.textContent = text;
    }

    // ------------------------------------------------------------
    // Publishing: "Here now" avatars + "✏️ <Name> is editing" in the tree
    // ------------------------------------------------------------
    function initials(name) {
        return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    }

    function renderHere(here) {
        const box = document.getElementById("presenceHere");
        if (!box) return;
        const html = here.length
            ? `<span class="sp-here-label">Here now</span>` + here.map((p) => {
                const face = p.avatar_url
                    ? `<img src="${escapeHtml(p.avatar_url)}" alt="">`
                    : `<span>${escapeHtml(initials(p.name))}</span>`;
                const title = `${p.name} (${p.role})${p.idle ? " - idle" : ""}`;
                return `<span class="sp-face${p.idle ? " is-idle" : ""}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${face}</span>`;
            }).join("")
            : "";
        if (box.dataset.html !== html) {
            box.dataset.html = html;
            box.innerHTML = html;
            box.hidden = !here.length;
        }
    }

    function decorateTree() {
        const root = document.getElementById("publishingTreeRoot");
        if (!root || !last) return;
        const editing = last.editing || {};
        root.querySelectorAll(".publishing-row[data-node-id]").forEach((row) => {
            const people = (editing[row.dataset.nodeId] || []);
            const wrap = row.querySelector(".publishing-name-wrap");
            if (!wrap) return;
            let chip = wrap.querySelector(".sp-chip");
            if (!people.length) {
                if (chip) chip.remove();
                return;
            }
            const lead = people[0];
            const who = lead.is_me ? "You" : lead.name;
            const text = lead.idle
                ? `${who} ${lead.is_me ? "have" : "has"} it open (idle ${lead.idle_minutes} min)`
                : `${who} ${lead.is_me ? "are" : "is"} editing`;
            const label = `✏️ ${text}${people.length > 1 ? ` +${people.length - 1}` : ""}`;
            if (!chip) {
                chip = document.createElement("span");
                chip.className = "sp-chip";
                wrap.appendChild(chip);
            }
            chip.classList.toggle("is-idle", Boolean(lead.idle));
            chip.classList.toggle("is-me", Boolean(lead.is_me));
            chip.title = people.map((p) => (p.is_me ? "You" : p.name) + (p.idle ? ` (idle ${p.idle_minutes} min)` : " (editing)")).join(", ");
            if (chip.textContent !== label) chip.textContent = label;
        });
    }

    document.addEventListener("cobra:publishing-rendered", decorateTree);

    // Publishing's Edit chapter / module pop-up opens or closes -> say so now.
    const popupWatcher = new MutationObserver(() => {
        const now = popupItems().join(",");
        if (now !== popupWatcher.lastSeen) {
            popupWatcher.lastSeen = now;
            beatNow();
        }
    });
    popupWatcher.lastSeen = "";

    function start() {
        document.querySelectorAll("[id$='Modal']").forEach((el) => {
            popupWatcher.observe(el, { attributes: true, attributeFilter: ["class", "style", "data-presence-item"] });
        });
        // Coding exercise editor: the cards arrive a moment after the page -
        // check for someone else on them as soon as they are there.
        const cards = document.getElementById("exerciseCards");
        if (cards) {
            let seen = pageItems().join(",");
            new MutationObserver(() => {
                const now = pageItems().join(",");
                if (now !== seen) { seen = now; beatNow(); }
            }).observe(cards, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-exercise-id"] });
        }
        beatNow();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
