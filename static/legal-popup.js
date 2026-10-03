/*
 * legal-popup.js - reads the Terms and Conditions / Privacy Notice in a popup
 * (feat/terms-consent)
 * ---------------------------------------------------------------------------
 * Any element with data-legal-doc="terms" or data-legal-doc="privacy"
 * opens the popup on that document. The text is loaded from the public
 * pages /terms and /privacy (their <article id="legalDoc">), so each
 * document exists in ONE place only.
 *
 * Used on login.html (sign-up checkbox) and consent.html. The page stays
 * as it is underneath, so nothing the person typed is lost.
 *
 * Styles: static/legal.css
 */
(function () {
    "use strict";

    const DOCS = {
        terms: { url: "/terms", label: "Terms and Conditions" },
        privacy: { url: "/privacy", label: "Privacy Notice" },
    };

    const loaded = {};      // key -> the document's HTML, once fetched
    let overlay = null;
    let bodyEl = null;
    let closeBtn = null;
    let lastFocus = null;
    let currentKey = null;

    function build() {
        overlay = document.createElement("div");
        overlay.className = "legal-popup-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="legal-popup-card" role="dialog" aria-modal="true" aria-label="Terms and Conditions and Privacy Notice">
                <button type="button" class="legal-popup-close" data-lp="close" aria-label="Close">&times;</button>
                <div class="legal-popup-tabs" role="tablist">
                    <button type="button" class="legal-popup-tab" role="tab" data-lp-tab="terms">${DOCS.terms.label}</button>
                    <button type="button" class="legal-popup-tab" role="tab" data-lp-tab="privacy">${DOCS.privacy.label}</button>
                </div>
                <div class="legal-popup-body legal-doc" data-lp="body" tabindex="0"></div>
                <div class="legal-popup-actions">
                    <button type="button" class="legal-popup-done" data-lp="done">Close</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        bodyEl = overlay.querySelector('[data-lp="body"]');
        closeBtn = overlay.querySelector('[data-lp="close"]');

        closeBtn.addEventListener("click", close);
        overlay.querySelector('[data-lp="done"]').addEventListener("click", close);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();   // click on the dark backdrop
        });
        overlay.querySelectorAll("[data-lp-tab]").forEach((tab) => {
            tab.addEventListener("click", () => show(tab.dataset.lpTab));
        });
    }

    function setStatus(text) {
        bodyEl.innerHTML = "";
        const p = document.createElement("p");
        p.className = "legal-popup-status";
        p.textContent = text;
        bodyEl.appendChild(p);
    }

    async function show(key) {
        if (!DOCS[key]) return;
        currentKey = key;

        overlay.querySelectorAll("[data-lp-tab]").forEach((tab) => {
            const on = tab.dataset.lpTab === key;
            tab.classList.toggle("is-active", on);
            tab.setAttribute("aria-selected", on ? "true" : "false");
        });

        if (loaded[key]) {
            bodyEl.innerHTML = loaded[key];
            bodyEl.scrollTop = 0;
            return;
        }

        setStatus("Loading...");
        try {
            const res = await fetch(DOCS[key].url, { credentials: "same-origin" });
            if (!res.ok) throw new Error("Request failed");
            const page = new DOMParser().parseFromString(await res.text(), "text/html");
            const doc = page.getElementById("legalDoc");
            if (!doc) throw new Error("Document not found");
            loaded[key] = doc.innerHTML;
            if (currentKey === key) {
                bodyEl.innerHTML = loaded[key];
                bodyEl.scrollTop = 0;
            }
        } catch (err) {
            if (currentKey === key) {
                setStatus(`The ${DOCS[key].label} could not be loaded. Check your connection and try again.`);
            }
        }
    }

    function open(key) {
        if (!overlay) build();
        lastFocus = document.activeElement;
        overlay.hidden = false;
        show(key);
        closeBtn.focus();
    }

    function close() {
        if (!overlay || overlay.hidden) return;
        overlay.hidden = true;
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    document.addEventListener("click", (e) => {
        const trigger = e.target.closest ? e.target.closest("[data-legal-doc]") : null;
        if (!trigger) return;
        e.preventDefault();
        open(trigger.dataset.legalDoc);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
    });
})();