/**
 * clipboard-guard.js - feat/copy-paste-block (learner pages only)
 * ---------------------------------------------------------------------------
 * One shared script; each learner page switches it on by loading it.
 *
 *   BLOCKED zones (games: questions, choices, Fill in the Blanks code, cards,
 *   hints, feedback; the coding exercise: instructions, expected output,
 *   editor): no copy, cut, paste, right-click menu, drag and drop of text or
 *   text selection (long-press on phones included).
 *
 *   Lesson content and the sandbox: copying is allowed, and whatever is
 *   copied there is remembered (localStorage, so it carries from a lesson
 *   page to the sandbox page).
 *
 *   The sandbox editor (data-clip="inside-only") accepts a paste only when
 *   it matches text copied inside CobraByte; anything else is blocked with
 *   a short message.
 *
 * Mentor and admin pages never load this file, so they are unaffected.
 * Limits: screenshots, a phone camera and retyping can't be stopped - this
 * is a strong deterrent, not a wall.
 */
(function () {
    "use strict";

    const BLOCKED = ".activity-host, .mcq-arena-root, .fib-root, .fc-root, #exerciseStep, [data-clip=\"block\"]";
    const INSIDE_ONLY = "[data-clip=\"inside-only\"]";
    const STORE_KEY = "cobrabyte.copied";
    const KEEP = 10;   // remembered copies
    const PASTE_MSG = "Pasting is turned off here. Please type your answer.";
    const OUTSIDE_MSG = "Only code copied inside CobraByte can be pasted here.";
    const COPY_MSG = "Copying is turned off during activities.";

    function closest(target, selector) {
        const node = target && target.nodeType === 1 ? target : target && target.parentElement;
        return node && node.closest ? node.closest(selector) : null;
    }

    function norm(text) {
        return String(text || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
    }

    function load() {
        try {
            const list = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function remember(text) {
        const value = norm(text);
        if (!value) return;
        try {
            const list = load().filter((t) => t !== value);
            list.unshift(value);
            localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, KEEP)));
        } catch (e) { /* storage full / blocked: the paste is then refused */ }
    }

    function copiedInside(text) {
        const value = norm(text);
        return !!value && load().some((t) => t === value || t.includes(value));
    }

    function selectedText(target) {
        const field = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT") ? target : null;
        if (field && typeof field.selectionStart === "number") {
            return field.value.slice(field.selectionStart, field.selectionEnd);
        }
        return window.getSelection ? String(window.getSelection()) : "";
    }

    let toast = null, toastTimer = null;
    function say(message, near) {
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "clip-toast";
            toast.setAttribute("role", "status");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("is-on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2600);
        if (near && near.focus) near.focus({ preventScroll: true });
    }

    function stop(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    // Capture on window: runs before code-editor.js's own document listeners.
    window.addEventListener("copy", (e) => {
        if (closest(e.target, BLOCKED)) {
            stop(e);
            say(COPY_MSG);
            return;
        }
        remember(selectedText(e.target));
    }, true);

    window.addEventListener("cut", (e) => {
        if (closest(e.target, BLOCKED)) {
            stop(e);
            say(COPY_MSG);
            return;
        }
        remember(selectedText(e.target));
    }, true);

    window.addEventListener("paste", (e) => {
        if (closest(e.target, BLOCKED)) {
            stop(e);
            say(PASTE_MSG, e.target);
            return;
        }
        if (closest(e.target, INSIDE_ONLY)) {
            const clip = e.clipboardData || window.clipboardData;
            const text = clip ? clip.getData("text/plain") : "";
            if (!copiedInside(text)) {
                stop(e);
                say(OUTSIDE_MSG, e.target);
            }
        }
    }, true);

    ["contextmenu", "dragstart", "selectstart"].forEach((type) => {
        window.addEventListener(type, (e) => {
            const zone = closest(e.target, BLOCKED);
            if (!zone) return;
            // Typing an answer still needs a caret / selection inside the field.
            if (type === "selectstart" && e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
            if (type === "selectstart" && closest(e.target, "[contenteditable=\"true\"]")) return;
            e.preventDefault();
        }, true);
    });

    window.addEventListener("drop", (e) => {
        if (closest(e.target, BLOCKED) || closest(e.target, INSIDE_ONLY)) {
            // Tiles in Fill in the Blanks are dragged with their own index, not text.
            const dt = e.dataTransfer;
            const types = dt ? Array.from(dt.types || []) : [];
            const isTile = closest(e.target, ".fib-slot") && types.length === 1 && types[0] === "text/plain"
                && /^\d+$/.test(dt.getData("text/plain"));
            if (isTile) return;
            stop(e);
            say(PASTE_MSG, e.target);
        }
    }, true);

    // In-app copy buttons (e.g. the sandbox's "Copy code") call this.
    window.CobraClipboard = { remember };
})();
