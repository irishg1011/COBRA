/**
 * admin-search.js - the "Search anything..." box in the staff header
 * --------------------------------------------------------------------
 * feat/staff-search   (loaded from admin-header.html, so it runs on every
 * admin and mentor page)
 *
 * 1. As the staff member types, GET /admin/search?q=... returns a few
 *    matches per group (pages, accounts, lessons, ...) - only things
 *    their role may open - and they are listed under the box.
 *    Up / Down move through the results, Enter opens the highlighted
 *    one (or the first), Escape closes the list.
 * 2. A result opens its page with "?q=<what to look for>". Pages that
 *    are rendered by the server already use it. For the others, this
 *    script copies it into the page's own table search box and lets the
 *    page's own live search do the rest - no page needs changing.
 */
(function () {
    "use strict";

    const SEARCH_URL = "/admin/search";
    const DEBOUNCE_MS = 250;
    const MIN_LENGTH = 2;

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML.replace(/"/g, "&quot;");
    }

    // ---- 2. "?q=" -> the page's own table search ----
    function prefillPageSearch() {
        const q = new URLSearchParams(window.location.search).get("q");
        if (!q) return;
        const pageSearch = document.querySelector(".table-toolbar .header-search input");
        if (!pageSearch || pageSearch.value) return;   // no table search here, or the server already filled it
        pageSearch.value = q;
        pageSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // The page's own script attaches its search listener on DOMContentLoaded.
    // This file is loaded with "defer", so it runs just BEFORE that event:
    // the prefill has to wait until the page's listeners exist.
    let prefillDone = false;
    function prefillOnce() {
        if (prefillDone) return;
        prefillDone = true;
        prefillPageSearch();
    }
    if (document.readyState === "complete") {
        prefillOnce();
    } else {
        document.addEventListener("DOMContentLoaded", prefillOnce);
        window.addEventListener("load", prefillOnce);
    }

    // ---- 1. the header box ----
    function init() {
        const box = document.getElementById("staffSearch");
        const input = document.getElementById("staffSearchInput");
        const results = document.getElementById("staffSearchResults");
        if (!box || !input || !results) return;

        let debounceTimer = null;
        let requestId = 0;
        let activeIndex = -1;

        const items = () => Array.from(results.querySelectorAll(".staff-search-item"));

        function setOpen(open) {
            results.hidden = !open;
            input.setAttribute("aria-expanded", open ? "true" : "false");
            if (!open) {
                activeIndex = -1;
                input.removeAttribute("aria-activedescendant");
            }
        }

        function setActive(index) {
            const list = items();
            list.forEach((el, i) => {
                el.classList.toggle("is-active", i === index);
                el.setAttribute("aria-selected", i === index ? "true" : "false");
            });
            activeIndex = index;
            if (index >= 0 && list[index]) {
                input.setAttribute("aria-activedescendant", list[index].id);
                list[index].scrollIntoView({ block: "nearest" });
            } else {
                input.removeAttribute("aria-activedescendant");
            }
        }

        function render(groups, query) {
            if (!groups.length) {
                results.innerHTML = `<p class="staff-search-empty">No results for "${escapeHtml(query)}".</p>`;
                setOpen(true);
                return;
            }
            let n = 0;
            results.innerHTML = groups.map((group) => `
                <p class="staff-search-group-label">${escapeHtml(group.label)}</p>
                ${group.items.map((item) => `
                    <a class="staff-search-item" role="option" aria-selected="false" id="staffSearchItem${n++}" href="${escapeHtml(item.url)}">
                        <span class="staff-search-title">${escapeHtml(item.title)}</span>
                        ${item.subtitle ? `<span class="staff-search-subtitle">${escapeHtml(item.subtitle)}</span>` : ""}
                    </a>`).join("")}`).join("");
            setOpen(true);
            setActive(-1);
        }

        async function search() {
            const query = input.value.trim();
            if (query.length < MIN_LENGTH) {
                requestId++;
                results.innerHTML = "";
                setOpen(false);
                return;
            }
            const thisRequest = ++requestId;
            try {
                const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (thisRequest !== requestId) return;   // a newer search already won
                render(data.groups || [], query);
            } catch (err) {
                if (thisRequest !== requestId) return;
                console.error("admin-search: search failed:", err);
                results.innerHTML = '<p class="staff-search-empty">Search is not available right now.</p>';
                setOpen(true);
            }
        }

        input.addEventListener("input", () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(search, DEBOUNCE_MS);
        });

        input.addEventListener("focus", () => {
            if (results.innerHTML && input.value.trim().length >= MIN_LENGTH) setOpen(true);
        });

        input.addEventListener("keydown", (e) => {
            const list = items();
            if (e.key === "Escape") {
                if (!results.hidden) { e.preventDefault(); setOpen(false); }
                return;
            }
            if (results.hidden || !list.length) {
                // Enter before the results are showing: search right away
                // instead of waiting for the typing pause.
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (debounceTimer) clearTimeout(debounceTimer);
                    search();
                }
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((activeIndex + 1) % list.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((activeIndex - 1 + list.length) % list.length);
            } else if (e.key === "Enter") {
                e.preventDefault();
                (list[activeIndex] || list[0]).click();
            }
        });

        // Closes when the click or the focus goes anywhere outside the box.
        document.addEventListener("click", (e) => {
            if (!box.contains(e.target)) setOpen(false);
        });
        box.addEventListener("focusout", (e) => {
            if (!box.contains(e.relatedTarget)) setOpen(false);
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();