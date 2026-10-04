/**
 * code-editor.js - Python code coloring + typing help, everywhere
 * ----------------------------------------------------------------
 * One small, offline helper (no library) used by the learner AND the
 * admin/mentor pages wherever Python code is shown or typed:
 *
 *   - lesson Console / Terminal boxes (.editor-console-box,
 *     .editor-terminal-box) - in the mentor's lesson editor, the admin
 *     preview, the learner's lesson page and the Module Review
 *   - the coding exercise box (#exerciseCodeBox)
 *   - the Sandbox editor and the admin "Learner's Code" view (textareas)
 *   - anything marked data-cobra-code
 *
 * Read-only boxes are colored automatically (also when they appear later,
 * via a MutationObserver). Boxes you can type in also get:
 *   Enter      new line with the same indentation (+4 after a ':')
 *   Tab        4 spaces (indents every selected line)
 *   Shift+Tab  removes 4 spaces of indentation
 *   Backspace  in the indentation, removes a whole 4-space step
 *   ( [ {      the closing bracket is added; typing it again steps over
 *   Ctrl+Z / Ctrl+Y (Cmd on Mac)  undo / redo inside the code box
 * Colors follow the box: light boxes use the same palette as the Fill in
 * the Blanks game, dark boxes (terminal, Sandbox) a matching dark one
 * (code-editor.css).
 *
 * The text of a box is never changed by the coloring - only wrapped in
 * <span>s - so running the code (innerText / .value) works as before.
 * Saved lesson HTML stays clean: CobraCode.stripAll(root) removes the
 * spans and the mentor editor calls it before every save.
 */
(function () {
    "use strict";

    const INDENT = "    ";
    const EDITABLE_SELECTOR = ".editor-console-box, .editor-terminal-box, #exerciseCodeBox, [data-cobra-code]";
    const DISPLAY_SELECTOR = ".editor-console-box, .editor-terminal-box, #exerciseCodeBox, [data-cobra-code]";
    const TEXTAREA_SELECTOR = "#codeEditor, #sandboxRunCode, textarea[data-cobra-code]";

    const KEYWORDS = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
        "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
        "return", "try", "while", "with", "yield", "match", "case",
    ]);
    const BUILTINS = new Set([
        "print", "input", "len", "range", "int", "float", "str", "bool", "list", "dict",
        "set", "tuple", "type", "sum", "min", "max", "abs", "round", "sorted", "reversed",
        "enumerate", "zip", "map", "filter", "open", "isinstance", "any", "all", "ord", "chr",
        "self",
    ]);

    // One pass over the code: comments, strings (incl. triple-quoted and
    // f/r/b prefixes), numbers, decorators, words.
    const TOKEN_RE = new RegExp([
        "(#[^\\n]*)",                                                           // 1 comment
        "((?:[rRbBuUfF]{1,2})?(?:\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$)|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?))", // 2 string
        "(\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?j?\\b)",                       // 3 number
        "(@[A-Za-z_][\\w.]*)",                                                  // 4 decorator
        "([A-Za-z_]\\w*)",                                                      // 5 word
    ].join("|"), "g");

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function span(cls, text) {
        return `<span class="${cls}">${escapeHtml(text)}</span>`;
    }

    /** Python source -> HTML with colored <span>s (text unchanged). */
    function highlight(code) {
        let out = "";
        let last = 0;
        let prevWord = "";
        TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = TOKEN_RE.exec(code)) !== null) {
            if (m[0] === "") { TOKEN_RE.lastIndex += 1; continue; }
            out += escapeHtml(code.slice(last, m.index));
            if (m[1]) out += span("cc-cmt", m[1]);
            else if (m[2]) out += span("cc-str", m[2]);
            else if (m[3]) out += span("cc-num", m[3]);
            else if (m[4]) out += span("cc-dec", m[4]);
            else {
                const word = m[5];
                const after = code.charAt(m.index + word.length);
                if (prevWord === "def" || prevWord === "class") out += span("cc-def", word);
                else if (KEYWORDS.has(word)) out += span("cc-kw", word);
                else if (BUILTINS.has(word)) out += span("cc-bi", word);
                else if (after === "(") out += span("cc-fn", word);
                else out += escapeHtml(word);
                prevWord = word;
                last = m.index + m[0].length;
                continue;
            }
            prevWord = "";
            last = m.index + m[0].length;
        }
        out += escapeHtml(code.slice(last));
        return out;
    }

    // ---------------- contenteditable text + caret model ----------------
    // After the first coloring a box is one flat run of text nodes and
    // spans (newlines are "\n" characters, shown by white-space: pre-wrap).
    // What each box looked like right after we colored it - kept in memory
    // (never as an attribute, so nothing extra ends up in saved lessons).
    const rendered = new WeakMap();

    // Old saved content keeps each line in a <div> (an empty line is
    // <div><br></div>) - read it line by line, exactly as it is shown.
    // (innerText would count such an empty line twice.)
    function linesText(node) {
        let out = "";
        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                out += child.nodeValue;
            } else if (child.nodeName === "BR") {
                out += "\n";
            } else if (child.nodeName === "DIV" || child.nodeName === "P") {
                if (out && !out.endsWith("\n")) out += "\n";
                const inner = linesText(child);
                out += inner === "\n" ? "\n" : inner;
                if (!out.endsWith("\n")) out += "\n";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                out += linesText(child);
            }
        });
        return out;
    }

    function plainText(el) {
        // A flat box is read as-is (so caret offsets match exactly).
        const text = isFlat(el) ? el.textContent : linesText(el);
        return (text || "").replace(/ /g, " ").replace(/\r\n?/g, "\n");
    }

    function isFlat(el) {
        return !el.querySelector("br, div, p");
    }

    function caretOffsets(el) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer)) return null;
        const pre = document.createRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        pre.setEnd(range.endContainer, range.endOffset);
        const end = pre.toString().length;
        return { start, end };
    }

    function setCaret(el, start, end) {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let pos = 0;
        let node;
        let startSet = false;
        if (end === undefined) end = start;
        while ((node = walker.nextNode())) {
            const len = node.nodeValue.length;
            if (!startSet && start <= pos + len) {
                range.setStart(node, start - pos);
                startSet = true;
            }
            if (startSet && end <= pos + len) {
                range.setEnd(node, end - pos);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            pos += len;
        }
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function render(el, text, caret) {
        // A typed-in box keeps a trailing "\n" so a new last line is visible;
        // an empty box stays truly empty so its :empty placeholder shows.
        if (el.isContentEditable && text && !text.endsWith("\n")) text += "\n";
        if (!text.trim()) text = "";
        el.innerHTML = highlight(text);
        rendered.set(el, el.innerHTML);
        if (caret) setCaret(el, Math.min(caret.start, text.length), Math.min(caret.end, text.length));
    }

    /** Color one box now (keeps the caret where it was). */
    function colorize(el) {
        if (!el || el.querySelector("input, button, textarea, select")) return;
        if (rendered.get(el) === el.innerHTML) return;   // already colored, unchanged
        const text = plainText(el);
        const focused = document.activeElement === el;
        render(el, text, focused ? caretOffsets(el) : null);
    }

    /** Remove the coloring spans (before saving lesson HTML). */
    function strip(el) {
        if (el.querySelector('span[class^="cc-"]')) el.textContent = el.textContent;
        rendered.delete(el);
    }

    function stripAll(root) {
        (root || document).querySelectorAll(DISPLAY_SELECTOR).forEach(strip);
    }

    function colorAll(root) {
        (root || document).querySelectorAll(DISPLAY_SELECTOR).forEach((el) => {
            if (document.activeElement === el) return;   // never re-render under the caret
            colorize(el);
        });
        (root || document).querySelectorAll(TEXTAREA_SELECTOR).forEach(attachTextarea);
    }

    // ---------------- undo / redo for code boxes ----------------
    const history = new WeakMap();   // el -> { undo: [], redo: [], last: 0 }

    function snapshot(el) {
        const caret = caretOffsets(el) || { start: 0, end: 0 };
        return { text: plainText(el), start: caret.start, end: caret.end };
    }

    function remember(el, force) {
        let h = history.get(el);
        if (!h) { h = { undo: [], redo: [], last: 0 }; history.set(el, h); }
        const now = Date.now();
        if (!force && now - h.last < 600) return;   // group fast typing into one step
        h.last = now;
        h.undo.push(snapshot(el));
        if (h.undo.length > 200) h.undo.shift();
        h.redo = [];
    }

    function restore(el, from, to) {
        const h = history.get(el);
        if (!h || !h[from].length) return;
        h[to].push(snapshot(el));
        const state = h[from].pop();
        render(el, state.text, { start: state.start, end: state.end });
        h.last = 0;
        notifyInput(el);
    }

    function notifyInput(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function notifyBefore(el) {
        // The mentor editor snapshots its own Undo on 'beforeinput'.
        try {
            el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: false }));
        } catch (e) { /* old browsers: no InputEvent constructor */ }
    }

    // ---------------- typing help ----------------
    function lineStart(text, pos) {
        return text.lastIndexOf("\n", pos - 1) + 1;
    }

    // Shared by contenteditable boxes and textareas: returns
    // { text, start, end } after the key, or null to let the browser act.
    function applyKey(e, text, start, end) {
        const key = e.key;
        if (key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const ls = lineStart(text, start);
            const line = text.slice(ls, start);
            let indent = (line.match(/^[ \t]*/) || [""])[0];
            if (/:\s*(#.*)?$/.test(line)) indent += INDENT;
            const between = "([{".includes(text.charAt(start - 1)) && ")]}".includes(text.charAt(end));
            if (between) {
                const inner = "\n" + indent + INDENT;
                const insert = inner + "\n" + indent;
                return { text: text.slice(0, start) + insert + text.slice(end), start: start + inner.length, end: start + inner.length };
            }
            const insert = "\n" + indent;
            return { text: text.slice(0, start) + insert + text.slice(end), start: start + insert.length, end: start + insert.length };
        }
        if (key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const ls = lineStart(text, start);
            const multi = text.slice(start, end).includes("\n");
            if (!e.shiftKey && !multi) {
                return { text: text.slice(0, start) + INDENT + text.slice(end), start: start + INDENT.length, end: start + INDENT.length };
            }
            // (Un)indent every line touched by the selection.
            const le = text.indexOf("\n", end - (end > start && text.charAt(end - 1) === "\n" ? 1 : 0));
            const blockEnd = le === -1 ? text.length : le;
            const lines = text.slice(ls, blockEnd).split("\n");
            let firstShift = 0;
            let total = 0;
            const changed = lines.map((l, i) => {
                if (e.shiftKey) {
                    const remove = Math.min(INDENT.length, (l.match(/^ */) || [""])[0].length);
                    if (i === 0) firstShift = -remove;
                    total -= remove;
                    return l.slice(remove);
                }
                if (i === 0) firstShift = INDENT.length;
                total += INDENT.length;
                return INDENT + l;
            });
            const newText = text.slice(0, ls) + changed.join("\n") + text.slice(blockEnd);
            return { text: newText, start: Math.max(ls, start + firstShift), end: Math.max(ls, end + total) };
        }
        if (key === "Backspace" && start === end && start > 0) {
            const ls = lineStart(text, start);
            const before = text.slice(ls, start);
            if (before.length && /^ +$/.test(before) && before.length % INDENT.length === 0) {
                return { text: text.slice(0, start - INDENT.length) + text.slice(end), start: start - INDENT.length, end: start - INDENT.length };
            }
            const pair = { "(": ")", "[": "]", "{": "}" }[text.charAt(start - 1)];
            if (pair && text.charAt(start) === pair) {
                return { text: text.slice(0, start - 1) + text.slice(start + 1), start: start - 1, end: start - 1 };
            }
            return null;
        }
        if ("([{".includes(key) && key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const close = { "(": ")", "[": "]", "{": "}" }[key];
            const next = text.charAt(end);
            if (start !== end) {
                return { text: text.slice(0, start) + key + text.slice(start, end) + close + text.slice(end), start: start + 1, end: end + 1 };
            }
            if (next === "" || /[\s)\]},:]/.test(next)) {
                return { text: text.slice(0, start) + key + close + text.slice(end), start: start + 1, end: start + 1 };
            }
            return null;
        }
        if (")]}".includes(key) && key.length === 1 && start === end && text.charAt(start) === key) {
            return { text, start: start + 1, end: start + 1 };
        }
        return null;
    }

    function editableBox(target) {
        const el = target && target.closest && target.closest(EDITABLE_SELECTOR);
        return el && el.isContentEditable ? el : null;
    }

    // Captured before the mentor editor's own key / Tab handlers.
    document.addEventListener("keydown", (e) => {
        if (e.isComposing) return;
        const el = editableBox(e.target);
        if (!el) return;

        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const redo = e.key === "y" || e.key === "Y" || e.shiftKey;
            restore(el, redo ? "redo" : "undo", redo ? "undo" : "redo");
            return;
        }

        if (!isFlat(el)) render(el, plainText(el), caretOffsets(el));
        const caret = caretOffsets(el);
        if (!caret) return;
        const text = plainText(el);
        const result = applyKey(e, text, caret.start, caret.end);
        if (!result) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (result.text !== text) {
            notifyBefore(el);
            remember(el, true);
        }
        render(el, result.text, { start: result.start, end: result.end });
        if (result.text !== text) notifyInput(el);
    }, true);

    // Plain-text paste (tabs -> 4 spaces), then re-color.
    document.addEventListener("paste", (e) => {
        const el = editableBox(e.target);
        if (!el) return;
        const clip = e.clipboardData || window.clipboardData;
        if (!clip) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isFlat(el)) render(el, plainText(el), caretOffsets(el));
        const caret = caretOffsets(el) || { start: plainText(el).length, end: plainText(el).length };
        const text = plainText(el);
        const pasted = (clip.getData("text/plain") || "").replace(/\r\n?/g, "\n").replace(/\t/g, INDENT).replace(/ /g, " ");
        notifyBefore(el);
        remember(el, true);
        const pos = caret.start + pasted.length;
        render(el, text.slice(0, caret.start) + pasted + text.slice(caret.end), { start: pos, end: pos });
        notifyInput(el);
    }, true);

    // Ordinary typing: remember for undo, re-color after a short pause
    // (never during an on-screen keyboard's composition on phones).
    const timers = new WeakMap();
    document.addEventListener("beforeinput", (e) => {
        const el = editableBox(e.target);
        if (el && !e.isComposing && e.isTrusted) remember(el, false);
    }, true);

    document.addEventListener("input", (e) => {
        const el = editableBox(e.target);
        if (!el || e.isComposing || !e.isTrusted) return;
        clearTimeout(timers.get(el));
        timers.set(el, setTimeout(() => {
            if (document.activeElement === el && !composing) colorize(el);
        }, 250));
    });

    let composing = false;
    document.addEventListener("compositionstart", () => { composing = true; }, true);
    document.addEventListener("compositionend", (e) => {
        composing = false;
        const el = editableBox(e.target);
        if (el) setTimeout(() => colorize(el), 0);
    }, true);

    document.addEventListener("focusout", (e) => {
        const el = editableBox(e.target);
        if (el) colorize(el);
    }, true);

    // ---------------- textareas (Sandbox, admin code view) ----------------
    // A colored <pre> sits exactly behind the textarea, whose own text is
    // transparent (the caret stays visible). The textarea keeps its value,
    // undo and scrolling; the <pre> just follows it.
    function attachTextarea(ta) {
        if (!ta || ta.dataset.ccAttached) return;
        ta.dataset.ccAttached = "1";

        // Read the textarea's look BEFORE its text is made transparent.
        const style = getComputedStyle(ta);
        const textColor = style.color;
        const dark = isDark(ta);
        const metrics = {};
        ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight",
            "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
            "borderLeftWidth", "tabSize"].forEach((prop) => { metrics[prop] = style[prop]; });

        const wrap = document.createElement("div");
        wrap.className = "cc-overlay-wrap";
        ta.parentNode.insertBefore(wrap, ta);
        const pre = document.createElement("pre");
        pre.className = "cc-overlay" + (dark ? " cc-dark" : "");
        pre.setAttribute("aria-hidden", "true");
        wrap.appendChild(pre);
        wrap.appendChild(ta);
        ta.classList.add("cc-overlay-input");

        Object.assign(pre.style, metrics);
        pre.style.color = textColor;
        ta.style.caretColor = textColor;   // the caret stays visible

        function sync() {
            const value = ta.value;
            pre.innerHTML = highlight(value) + (value.endsWith("\n") ? " " : "");
            pre.scrollTop = ta.scrollTop;
            pre.scrollLeft = ta.scrollLeft;
        }
        ta.addEventListener("input", sync);
        ta.addEventListener("scroll", () => {
            pre.scrollTop = ta.scrollTop;
            pre.scrollLeft = ta.scrollLeft;
        });
        // Code set from JavaScript (loading a snippet, Reset) fires no
        // input event - watch the value property too.
        const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        Object.defineProperty(ta, "value", {
            get() { return proto.get.call(this); },
            set(v) { proto.set.call(this, v); sync(); },
            configurable: true,
        });

        if (!ta.readOnly) {
            ta.addEventListener("keydown", (e) => {
                if (e.isComposing) return;
                const result = applyKey(e, ta.value, ta.selectionStart, ta.selectionEnd);
                if (!result) return;
                e.preventDefault();
                if (result.text !== ta.value) {
                    // execCommand keeps the textarea's own undo history.
                    ta.setSelectionRange(0, ta.value.length);
                    const ok = document.queryCommandSupported && document.queryCommandSupported("insertText")
                        && document.execCommand("insertText", false, result.text);
                    if (!ok) {
                        proto.set.call(ta, result.text);
                        ta.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                }
                ta.setSelectionRange(result.start, result.end);
                sync();
            });
        }
        sync();
    }

    function isDark(el) {
        const bg = getComputedStyle(el).backgroundColor;
        let node = el;
        let color = bg;
        while ((color === "rgba(0, 0, 0, 0)" || color === "transparent") && node.parentElement) {
            node = node.parentElement;
            color = getComputedStyle(node).backgroundColor;
        }
        const m = color.match(/\d+(\.\d+)?/g);
        if (!m) return false;
        const [r, g, b] = m.map(Number);
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }

    // ---------------- start ----------------
    let scheduled = false;
    function scheduleColorAll() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            colorAll(document);
        }, 60);
    }

    function start() {
        colorAll(document);
        // New or changed boxes (lesson loaded, code filled in, modal opened)
        // get colored too. Our own re-render leaves a box exactly as
        // remembered in `rendered`, so it is skipped - no loop.
        new MutationObserver(scheduleColorAll).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();

    window.CobraCode = { highlight, colorize, colorAll, strip, stripAll, attachTextarea };
})();
