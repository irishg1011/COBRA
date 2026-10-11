/**
 * cobra-find-bar.js - "find in this activity" (feat/quick-edit-items)
 * --------------------------------------------------------------------
 * One slim sticky bar, like the browser's Ctrl+F but for item cards:
 *
 *   [ search in this activity... ]  3 of 50  [^] [v]  [Go to #]  [ ] Show matches only
 *
 *   - typing highlights every card whose text has the words;
 *   - ^ / v (or Enter / Shift+Enter) jump between matches - the current one glows;
 *   - "Go to #" + Enter jumps to that item number;
 *   - "Show matches only" HIDES the other cards until the search is cleared.
 *     It only hides them: they stay in the form, so saving still sends every item.
 *
 * Used by the activity editor, the coding exercise editor and the
 * preview's Review list:
 *
 *   CobraFindBar.attach({
 *       before: element,               // the bar goes right before it
 *       items: () => [cards],          // the cards, in order
 *       textOf: (card) => "...",       // what search looks in (default: field values + text)
 *       numberOf: (card, index) => n,  // "Go to #" number (default: index + 1)
 *       placeholder: "Search in this activity...",
 *       noun: "item",
 *       onChange: () => {},            // after highlight / hide changed
 *       observe: [containers],         // re-count when cards are added / removed
 *   })  -> { refresh() }
 */
(function () {
    "use strict";

    function fieldText(card) {
        const parts = [];
        card.querySelectorAll("textarea, input:not([type]), input[type='text'], input[type='search']").forEach((el) => {
            if (el.closest(".cfb")) return;
            parts.push(el.value);
        });
        // Labels / chips the mentor sees but are not fields (required tags, titles).
        card.querySelectorAll(".required-tag-chip-label, .rv-q, .rv-value, .rv-option").forEach((el) => parts.push(el.textContent));
        return parts.join("\n");
    }

    function attach(opts) {
        if (!opts || !opts.before || !opts.before.parentNode) return null;
        const noun = opts.noun || "item";
        const textOf = opts.textOf || fieldText;
        const numberOf = opts.numberOf || ((card, index) => index + 1);

        const bar = document.createElement("div");
        bar.className = "cfb";
        bar.setAttribute("role", "search");
        bar.innerHTML = `
            <div class="cfb-search">
                <i class="fa-solid fa-magnifying-glass cfb-icon" aria-hidden="true"></i>
                <input type="search" class="cfb-input" autocomplete="off" spellcheck="false">
            </div>
            <span class="cfb-count" aria-live="polite"></span>
            <div class="cfb-nav">
                <button type="button" class="cfb-btn cfb-prev" title="Previous match (Shift+Enter)" aria-label="Previous match"><i class="fa-solid fa-chevron-up"></i></button>
                <button type="button" class="cfb-btn cfb-next" title="Next match (Enter)" aria-label="Next match"><i class="fa-solid fa-chevron-down"></i></button>
            </div>
            <input type="number" class="cfb-goto" min="1" step="1" inputmode="numeric" placeholder="Go to #" aria-label="Go to ${noun} number">
            <label class="cfb-only"><input type="checkbox" class="cfb-only-box"> <span>Show matches only</span></label>`;
        opts.before.parentNode.insertBefore(bar, opts.before);
        // The bar can sit inside an editor's <form>: typing a search is not an
        // edit (no unsaved-changes warning, no field formatting, no submit).
        ["input", "change", "keydown", "keyup", "paste", "focusin", "focusout"].forEach((type) => {
            bar.addEventListener(type, (e) => e.stopPropagation());
        });

        const input = bar.querySelector(".cfb-input");
        const count = bar.querySelector(".cfb-count");
        const prevBtn = bar.querySelector(".cfb-prev");
        const nextBtn = bar.querySelector(".cfb-next");
        const gotoInput = bar.querySelector(".cfb-goto");
        const onlyBox = bar.querySelector(".cfb-only-box");
        input.placeholder = opts.placeholder || "Search...";
        input.setAttribute("aria-label", input.placeholder.replace(/\.+$/, ""));

        let matches = [];
        let current = -1;      // index in matches

        function words() {
            return (input.value || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
        }

        function setCurrent(card) {
            opts.items().forEach((c) => c.classList.remove("cfb-current"));
            if (card) card.classList.add("cfb-current");
        }

        function scrollTo(card) {
            if (!card) return;
            card.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        function renderCount(total) {
            if (!words().length) {
                count.textContent = `${total} ${noun}${total === 1 ? "" : "s"}`;
            } else if (!matches.length) {
                count.textContent = "No matches";
            } else {
                count.textContent = `${current + 1} of ${matches.length}`;
            }
            count.classList.toggle("is-none", !!words().length && !matches.length);
            prevBtn.disabled = nextBtn.disabled = matches.length === 0;
        }

        // keepCurrent: the same card stays current when it still matches (typing in a card).
        function refresh(keepCurrent) {
            const cards = opts.items();
            const terms = words();
            const before = current >= 0 ? matches[current] : null;
            matches = [];
            cards.forEach((card) => {
                const text = terms.length ? textOf(card).toLowerCase() : "";
                const hit = terms.length > 0 && terms.every((w) => text.includes(w));
                card.classList.toggle("cfb-match", hit);
                // The card being typed in never disappears under the mentor's cursor.
                const typingHere = card.contains(document.activeElement);
                card.classList.toggle("cfb-hidden", onlyBox.checked && terms.length > 0 && !hit && !typingHere);
                if (hit) matches.push(card);
            });
            if (!terms.length) {
                current = -1;
                setCurrent(null);
            } else if (keepCurrent && before && matches.includes(before)) {
                current = matches.indexOf(before);
            } else {
                current = matches.length ? 0 : -1;
                setCurrent(matches[0] || null);
            }
            renderCount(cards.length);
            if (opts.onChange) opts.onChange();
        }

        function step(delta) {
            if (!matches.length) return;
            current = (current + delta + matches.length) % matches.length;
            setCurrent(matches[current]);
            scrollTo(matches[current]);
            renderCount(opts.items().length);
        }

        function goTo() {
            const n = parseInt(gotoInput.value, 10);
            if (!Number.isFinite(n)) return;
            const cards = opts.items();
            const card = cards.find((c, i) => Number(numberOf(c, i)) === n);
            if (!card) {
                gotoInput.classList.add("is-error");
                gotoInput.title = `There is no ${noun} #${n}.`;
                return;
            }
            gotoInput.classList.remove("is-error");
            gotoInput.title = "";
            if (card.classList.contains("cfb-hidden")) {     // a hidden card: show everything again
                onlyBox.checked = false;
                refresh(true);
            }
            if (matches.includes(card)) current = matches.indexOf(card);
            setCurrent(card);
            scrollTo(card);
            renderCount(cards.length);
        }

        let timer = null;
        input.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                refresh(false);
                if (matches.length) scrollTo(matches[0]);
            }, 120);
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
            if (e.key === "Escape" && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; refresh(false); }
        });
        prevBtn.addEventListener("click", () => step(-1));
        nextBtn.addEventListener("click", () => step(1));
        gotoInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); goTo(); }
        });
        gotoInput.addEventListener("input", () => gotoInput.classList.remove("is-error"));
        onlyBox.addEventListener("change", () => refresh(true));

        // Cards change while the mentor types in them, or are added / removed:
        // keep the highlights true (only while a search is active).
        let typing = null;
        document.addEventListener("input", (e) => {
            if (!words().length || bar.contains(e.target)) return;
            clearTimeout(typing);
            typing = setTimeout(() => refresh(true), 250);
        });

        // Cards added / removed / moved (Add, Delete, a lesson loaded...).
        (opts.observe || []).forEach((el) => {
            if (!el) return;
            new MutationObserver(() => {
                clearTimeout(typing);
                typing = setTimeout(() => refresh(true), 60);
            }).observe(el, { childList: true });
        });

        refresh(false);
        return { refresh: () => refresh(true), element: bar };
    }

    window.CobraFindBar = { attach };
})();
