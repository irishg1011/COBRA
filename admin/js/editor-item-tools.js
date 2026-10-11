/**
 * editor-item-tools.js - feat/quick-edit-items
 * --------------------------------------------------------------------
 * For the two full editors (Create Learning Activity, Create Coding
 * Exercise). Load after the editor's own script and cobra-find-bar.js.
 *
 * 1. Search inside this activity / these exercises: the sticky
 *    CobraFindBar above the item cards.
 *
 * 2. "Open in full editor" from the preview's Quick edit lands here with
 *    ?item=<id> (activity: q_id / fib_id / flashcard_id; exercise: its
 *    exercise_id). The editor scrolls to that card, makes it glow,
 *    focuses its first field and shows a small note:
 *        Editing Item #12 · [Show all items]
 *    Nothing in the form changes, so the unsaved-changes warnings work
 *    as before.
 */
(function () {
    "use strict";

    const ACTIVITY_CARDS = "#questionsContainer .question-card, #fillBlanksContainer .fill-blank-card, #flashcardsContainer .flashcard-card";

    function visible(el) {
        return !!(el && el.offsetParent !== null);
    }

    function setup() {
        const activityStart = document.getElementById("multipleChoiceSection");
        const exerciseList = document.getElementById("exerciseCards");
        let items, before, observe, placeholder, noun;

        if (activityStart) {
            // Only the cards of the activity type that is showing.
            items = () => Array.from(document.querySelectorAll(ACTIVITY_CARDS)).filter((c) => !c.closest(".d-none"));
            before = activityStart;
            observe = ["questionsContainer", "fillBlanksContainer", "flashcardsContainer"].map((id) => document.getElementById(id));
            placeholder = "Search in this activity...";
            noun = "item";
        } else if (exerciseList) {
            items = () => Array.from(exerciseList.querySelectorAll(".exercise-card"));
            before = exerciseList;
            observe = [exerciseList];
            placeholder = "Search in these exercises...";
            noun = "exercise";
        } else {
            return;
        }

        if (window.CobraFindBar) {
            const bar = CobraFindBar.attach({ before, items, observe, placeholder, noun });
            // The activity type switch shows another list.
            const typeSelect = document.getElementById("activityType");
            if (bar && typeSelect) typeSelect.addEventListener("change", () => setTimeout(bar.refresh, 0));
        }

        focusRequestedItem(items, exerciseList ? "exerciseId" : "itemId", noun, before);
    }

    // ---------- ?item=<id> ----------
    function focusRequestedItem(items, idKey, noun, listStart) {
        const wanted = new URLSearchParams(window.location.search).get("item");
        if (!wanted || !/^\d+$/.test(wanted)) return;

        let tries = 0;
        (function look() {
            const cards = items();
            const card = cards.find((c) => c.dataset[idKey] === wanted);
            if (!card) {
                if (++tries < 60) setTimeout(look, 150);    // exercise cards load after the lesson's fetch
                return;
            }
            const number = cards.indexOf(card) + 1;
            card.classList.add("cie-focus");
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            const field = Array.from(card.querySelectorAll("textarea, input:not([type]), input[type='text']"))
                .find((el) => !el.readOnly && !el.disabled && visible(el));
            if (field) setTimeout(() => field.focus({ preventScroll: true }), 350);
            showNote(card, number, noun, listStart);
        })();
    }

    function showNote(card, number, noun, listStart) {
        const note = document.createElement("div");
        note.className = "cie-note";
        note.setAttribute("role", "status");
        const label = document.createElement("span");
        label.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i> ';
        label.appendChild(document.createTextNode(`Editing ${noun === "exercise" ? "Exercise" : "Item"} #${number}`));
        const all = document.createElement("button");
        all.type = "button";
        all.textContent = noun === "exercise" ? "Show all exercises" : "Show all items";
        note.appendChild(label);
        note.appendChild(all);
        document.body.appendChild(note);

        all.addEventListener("click", () => {
            card.classList.remove("cie-focus");
            note.remove();
            const top = document.querySelector(".cfb") || listStart;
            if (top) top.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
    else setup();
})();
