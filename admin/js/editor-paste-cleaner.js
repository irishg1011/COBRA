/**
 * editor-paste-cleaner.js
 * --------------------------------------------------------------------
 * Cleans content pasted into the lesson editor (#editorContent) from
 * MS Word (desktop or web) and websites, and cleans lessons that were
 * saved before this existed.
 *
 * KEPT (what the editor toolbar can make):
 *   bold, italic, underline, strikethrough, H1-H3 (H4-H6 -> H3),
 *   bullet / numbered lists, quotes, line breaks, and left / center /
 *   right alignment.
 *
 * REMOVED:
 *   every other tag's wrapper (span, font, a, table, ...) - the text
 *   inside is kept; styles, classes, ids and every other attribute;
 *   Word's hidden tags (<o:p>, conditional comments); images, media,
 *   form controls and scripts; hidden characters (zero-width spaces
 *   and the like); empty leftover tags; runs of blank lines.
 *
 * WORD EXTRAS:
 *   - bold / italic / underline / strikethrough done with inline
 *     styles instead of tags become real tags;
 *   - Word's fake lists (paragraphs with a typed bullet or "1.")
 *     become real <ul> / <ol> lists.
 *
 * Used by editor-toolbar.js:
 *   window.cobraBytePasteCleaner.cleanPastedHtml(html)   -> clean HTML string
 *   window.cobraBytePasteCleaner.textToHtml(text)        -> clean HTML string
 *   window.cobraBytePasteCleaner.cleanEditorContent(editor)
 *       cleans an already-filled editor in place; Console / Terminal
 *       blocks are left exactly as they are.
 *
 * A pasted Console / Terminal block (copied from another lesson) comes
 * in as its text only - blocks are added with the toolbar buttons.
 */
(function () {
    "use strict";

    const WRAPPER_SELECTOR = ".editor-code-container, .editor-terminal-container";

    const BLOCK_MAP = {
        div: "div", p: "div", section: "div", article: "div", header: "div",
        footer: "div", main: "div", aside: "div", nav: "div", figure: "div",
        figcaption: "div", address: "div", dd: "div", dt: "div", center: "div",
        tr: "div", caption: "div", pre: "div",
        h1: "h1", h2: "h2", h3: "h3", h4: "h3", h5: "h3", h6: "h3",
        blockquote: "blockquote",
        ul: "ul", ol: "ol", li: "li",
    };
    const INLINE_MAP = {
        b: "b", strong: "b", i: "i", em: "i", u: "u", ins: "u",
        s: "s", strike: "s", del: "s",
    };
    // Removed together with everything inside them.
    const DROP_TAGS = new Set([
        "script", "style", "meta", "link", "title", "head", "noscript",
        "template", "svg", "math", "img", "picture", "video", "audio",
        "source", "track", "iframe", "object", "embed", "canvas", "map",
        "input", "select", "textarea", "button", "option", "datalist",
        "xml", "o:p", "v:shapetype", "v:shape", "w:sdt",
    ]);
    const BLOCK_OUT = new Set(["div", "h1", "h2", "h3", "blockquote", "ul", "ol", "li"]);
    const ALIGNABLE = new Set(["div", "h1", "h2", "h3", "blockquote", "li"]);

    // Zero-width / invisible characters that only cause trouble.
    const HIDDEN_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

    function tagOf(node) {
        return node.nodeType === Node.ELEMENT_NODE ? node.tagName.toLowerCase() : "";
    }

    function styleValue(el, prop) {
        const style = (el.getAttribute && el.getAttribute("style")) || "";
        const match = style.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)", "i"));
        return match ? match[1].trim().toLowerCase() : "";
    }

    function readAlignment(el) {
        const value = styleValue(el, "text-align") || (el.getAttribute("align") || "").toLowerCase();
        return value === "center" || value === "right" ? value : "";
    }

    function isPreformatted(el) {
        const tag = tagOf(el);
        if (tag === "pre") return true;
        const ws = styleValue(el, "white-space");
        if (ws.startsWith("pre")) return true;
        const cls = (el.getAttribute && el.getAttribute("class")) || "";
        return /editor-(console|output|terminal)-box/.test(cls);
    }

    // ------------------------------------------------------------
    // Word's fake lists: <p class="MsoListParagraph..." style="mso-list:...">
    // with the bullet / number typed in a hidden "mso-list:Ignore" span.
    // ------------------------------------------------------------
    function wordListInfo(el) {
        if (tagOf(el) !== "p" && tagOf(el) !== "div") return null;
        const cls = el.getAttribute("class") || "";
        const style = el.getAttribute("style") || "";
        if (!/MsoListParagraph/i.test(cls) && !/mso-list\s*:/i.test(style)) return null;
        const marker = el.querySelector('[style*="mso-list"]');
        const markerText = marker ? marker.textContent.replace(/\s|\u00a0/g, "") : "";
        const ordered = /^(\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]$/.test(markerText);
        return { ordered: ordered };
    }

    function isWordListMarker(el) {
        return /mso-list\s*:\s*ignore/i.test(el.getAttribute("style") || "");
    }

    // ------------------------------------------------------------
    // Pass 1 - build a new tree with only allowed tags. Anything else
    // is unwrapped (its children are kept).
    // ------------------------------------------------------------
    function cleanChildren(source, target, pre) {
        let node = source.firstChild;
        while (node) {
            const next = node.nextSibling;
            cleanNode(node, target, pre);
            node = next;
        }
    }

    function appendText(text, target, pre) {
        let value = text.replace(HIDDEN_CHARS, "").replace(/[\u2028\u2029]/g, "\n");
        if (!pre) {
            target.appendChild(document.createTextNode(value.replace(/[\r\n\t]+/g, " ")));
            return;
        }
        const lines = value.replace(/\r\n?/g, "\n").split("\n");
        lines.forEach((line, i) => {
            if (i > 0) target.appendChild(document.createElement("br"));
            // Leading spaces / tabs would collapse in a normal line - keep the indent.
            const kept = line.replace(/\t/g, "    ").replace(/^ +/, (m) => "\u00a0".repeat(m.length));
            if (kept) target.appendChild(document.createTextNode(kept));
        });
    }

    function cleanNode(node, target, pre) {
        if (node.nodeType === Node.TEXT_NODE) {
            appendText(node.textContent, target, pre);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return; // comments etc.

        const tag = tagOf(node);
        if (DROP_TAGS.has(tag)) return;
        if (isWordListMarker(node)) return;
        if (styleValue(node, "display") === "none") return;

        if (tag === "br") {
            target.appendChild(document.createElement("br"));
            return;
        }

        const childPre = pre || isPreformatted(node);

        // Word fake list paragraph -> <li data-word-list="ul|ol">
        const listInfo = wordListInfo(node);
        if (listInfo) {
            const li = document.createElement("li");
            li.setAttribute("data-word-list", listInfo.ordered ? "ol" : "ul");
            cleanChildren(node, li, childPre);
            target.appendChild(li);
            return;
        }

        // Table cells: keep the text, separated by a space.
        if (tag === "td" || tag === "th") {
            cleanChildren(node, target, childPre);
            target.appendChild(document.createTextNode(" "));
            return;
        }

        let out = null;
        if (BLOCK_MAP[tag]) {
            out = document.createElement(BLOCK_MAP[tag]);
            const align = readAlignment(node);
            if (align && ALIGNABLE.has(BLOCK_MAP[tag])) out.style.textAlign = align;
        } else if (INLINE_MAP[tag]) {
            // Google Docs wraps everything in <b style="font-weight:normal">.
            const weight = styleValue(node, "font-weight");
            const notReallyBold = INLINE_MAP[tag] === "b" && (weight === "normal" || weight === "400");
            out = notReallyBold ? null : document.createElement(INLINE_MAP[tag]);
        }

        // Formatting done with inline styles (Word, Google Docs, websites).
        let host = target;
        const wrappers = [];
        const weight = styleValue(node, "font-weight");
        if (!INLINE_MAP[tag] && (weight === "bold" || weight === "bolder" || parseInt(weight, 10) >= 600)) wrappers.push("b");
        if (styleValue(node, "font-style") === "italic") wrappers.push("i");
        const decoration = styleValue(node, "text-decoration") + " " + styleValue(node, "text-decoration-line");
        if (/underline/.test(decoration)) wrappers.push("u");
        if (/line-through/.test(decoration)) wrappers.push("s");

        if (out) {
            target.appendChild(out);
            host = out;
        }
        wrappers.forEach((w) => {
            if (out && out.tagName.toLowerCase() === w) return;
            const el = document.createElement(w);
            host.appendChild(el);
            host = el;
        });

        cleanChildren(node, host, childPre);
    }

    // ------------------------------------------------------------
    // Pass 2 - make the structure something the editor handles well.
    // ------------------------------------------------------------
    function isBlock(node) {
        return node.nodeType === Node.ELEMENT_NODE && BLOCK_OUT.has(tagOf(node));
    }

    function unwrap(el) {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
    }

    // Blocks inside an inline tag / heading / li -> flatten.
    function normalize(root) {
        // Inline tags that contain blocks lose their wrapper.
        root.querySelectorAll("b, i, u, s").forEach((el) => {
            if (Array.from(el.children).some(isBlock)) unwrap(el);
        });

        // Headings and list items: inner blocks become lines (<br>).
        root.querySelectorAll("h1, h2, h3, li").forEach((el) => {
            Array.from(el.querySelectorAll("div, h1, h2, h3, blockquote")).forEach((inner) => {
                if (!inner.parentNode) return;
                if (inner.previousSibling) inner.parentNode.insertBefore(document.createElement("br"), inner);
                unwrap(inner);
            });
        });

        // A div / blockquote that holds other blocks is only a wrapper:
        // loose inline content inside it becomes its own line.
        let changed = true;
        while (changed) {
            changed = false;
            root.querySelectorAll("div").forEach((div) => {
                if (div.parentNode && Array.from(div.childNodes).some(isBlock)) {
                    wrapLooseInline(div);
                    unwrap(div);
                    changed = true;
                }
            });
        }
        root.querySelectorAll("blockquote").forEach((bq) => {
            if (Array.from(bq.childNodes).some(isBlock)) wrapLooseInline(bq);
        });

        // Word fake-list items -> real lists (consecutive items share one list).
        root.querySelectorAll("li[data-word-list]").forEach((li) => {
            if (!li.parentNode) return;
            const kind = li.getAttribute("data-word-list");
            const prev = li.previousElementSibling;
            li.removeAttribute("data-word-list");
            if (prev && tagOf(prev) === kind) {
                prev.appendChild(li);
            } else if (tagOf(li.parentNode) !== "ul" && tagOf(li.parentNode) !== "ol") {
                const list = document.createElement(kind);
                li.parentNode.insertBefore(list, li);
                list.appendChild(li);
            }
        });

        // Lists: only <li> children; nested lists are flattened.
        root.querySelectorAll("ul, ol").forEach((list) => {
            Array.from(list.childNodes).forEach((child) => {
                if (tagOf(child) === "li") return;
                if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) {
                    child.remove();
                    return;
                }
                if (tagOf(child) === "ul" || tagOf(child) === "ol") {
                    unwrap(child);
                    return;
                }
                const li = document.createElement("li");
                list.insertBefore(li, child);
                li.appendChild(child);
            });
        });
        root.querySelectorAll("li ul, li ol").forEach((inner) => {
            const li = inner.closest("li");
            const list = li && li.parentNode;
            if (!list) return;
            Array.from(inner.children).forEach((child) => list.insertBefore(child, li.nextSibling));
            inner.remove();
        });
        // A <li> that ended up outside any list becomes a normal line.
        root.querySelectorAll("li").forEach((li) => {
            const parentTag = tagOf(li.parentNode);
            if (parentTag !== "ul" && parentTag !== "ol") {
                const div = document.createElement("div");
                li.parentNode.replaceChild(div, li);
                while (li.firstChild) div.appendChild(li.firstChild);
            }
        });

        wrapLooseInline(root);
        tidy(root);
    }

    // Loose text / inline tags sitting next to blocks -> wrapped in a <div>.
    function wrapLooseInline(parent) {
        let line = null;
        Array.from(parent.childNodes).forEach((child) => {
            if (isBlock(child) || (child.nodeType === Node.ELEMENT_NODE && child.matches(WRAPPER_SELECTOR))) {
                line = null;
                return;
            }
            if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim() && !line) {
                child.remove();
                return;
            }
            if (!line) {
                line = document.createElement("div");
                parent.insertBefore(line, child);
            }
            line.appendChild(child);
        });
    }

    function isEmptyInline(el) {
        return !el.textContent.replace(/\u00a0/g, " ").trim() && !el.querySelector("br");
    }

    function tidy(root) {
        // Empty inline tags.
        let found = true;
        while (found) {
            found = false;
            root.querySelectorAll("b, i, u, s").forEach((el) => {
                if (isEmptyInline(el)) { el.remove(); found = true; }
            });
        }
        // Same tag nested in itself (<b><b>x</b></b>).
        root.querySelectorAll("b b, i i, u u, s s").forEach(unwrap);

        // Trim spaces at the start / end of each line.
        root.querySelectorAll("div, h1, h2, h3, li, blockquote").forEach((block) => {
            const first = block.firstChild;
            if (first && first.nodeType === Node.TEXT_NODE) first.textContent = first.textContent.replace(/^[ \t]+/, "");
            const last = block.lastChild;
            if (last && last.nodeType === Node.TEXT_NODE) last.textContent = last.textContent.replace(/[ \t\u00a0]+$/, "");
            // A trailing <br> in a line that has text is invisible - drop it.
            const lastEl = block.lastChild;
            if (lastEl && tagOf(lastEl) === "br" && lastEl.previousSibling && block.textContent.trim()) lastEl.remove();
        });

        // Empty lines -> <div><br></div>; empty headings / items / lists removed.
        root.querySelectorAll("div, h1, h2, h3, blockquote, li").forEach((block) => {
            if (block.matches(WRAPPER_SELECTOR) || block.closest(WRAPPER_SELECTOR)) return;
            const empty = !block.textContent.replace(/\u00a0/g, " ").trim() && !block.querySelector(WRAPPER_SELECTOR);
            if (!empty) return;
            if (tagOf(block) === "div") {
                block.innerHTML = "<br>";
            } else {
                block.remove();
            }
        });
        root.querySelectorAll("ul, ol").forEach((list) => {
            if (!list.querySelector("li")) list.remove();
        });

        // At most one blank line in a row, and none at the very start / end.
        const kids = Array.from(root.childNodes);
        let prevBlank = true;
        kids.forEach((child) => {
            const blank = tagOf(child) === "div" && child.childNodes.length === 1 && tagOf(child.firstChild) === "br";
            if (blank && prevBlank) child.remove();
            prevBlank = blank;
        });
        while (root.lastChild && tagOf(root.lastChild) === "div" &&
               root.lastChild.childNodes.length === 1 && tagOf(root.lastChild.firstChild) === "br") {
            root.lastChild.remove();
        }
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------
    function cleanPastedHtml(html) {
        const doc = new DOMParser().parseFromString(html || "", "text/html");
        const root = document.createElement("div");
        cleanChildren(doc.body, root, false);
        normalize(root);
        return root.innerHTML;
    }

    function textToHtml(text) {
        const lines = String(text || "").replace(HIDDEN_CHARS, "").replace(/\r\n?/g, "\n").split("\n");
        const root = document.createElement("div");
        lines.forEach((line) => {
            const div = document.createElement("div");
            const value = line.replace(/\t/g, "\u00a0\u00a0\u00a0\u00a0");
            if (value.trim()) div.textContent = value;
            else div.appendChild(document.createElement("br"));
            root.appendChild(div);
        });
        tidy(root);
        // One line of plain text -> no line wrapper, so it joins the current line.
        if (root.childNodes.length === 1 && tagOf(root.firstChild) === "div") return root.firstChild.innerHTML;
        return root.innerHTML;
    }

    // Cleans a saved lesson in place. Console / Terminal blocks are kept
    // exactly as they are (same nodes, never re-created) and only the
    // text around them is cleaned.
    function cleanEditorContent(editor) {
        if (!editor || !editor.firstChild) return;

        const pieces = []; // { wrapper } | { nodes: [] }
        function collect(parent) {
            Array.from(parent.childNodes).forEach((child) => {
                if (child.nodeType === Node.ELEMENT_NODE && child.matches(WRAPPER_SELECTOR)) {
                    pieces.push({ wrapper: child });
                } else if (child.nodeType === Node.ELEMENT_NODE && child.querySelector(WRAPPER_SELECTOR)) {
                    collect(child);
                } else {
                    const last = pieces[pieces.length - 1];
                    if (last && last.nodes) last.nodes.push(child);
                    else pieces.push({ nodes: [child] });
                }
            });
        }
        collect(editor);

        const result = document.createDocumentFragment();
        pieces.forEach((piece) => {
            if (piece.wrapper) {
                result.appendChild(piece.wrapper);
                return;
            }
            const source = document.createElement("div");
            piece.nodes.forEach((n) => source.appendChild(n));
            const root = document.createElement("div");
            cleanChildren(source, root, false);
            normalize(root);
            while (root.firstChild) result.appendChild(root.firstChild);
        });

        editor.innerHTML = "";
        editor.appendChild(result);
    }

    window.cobraBytePasteCleaner = {
        cleanPastedHtml: cleanPastedHtml,
        textToHtml: textToHtml,
        cleanEditorContent: cleanEditorContent,
    };
})();