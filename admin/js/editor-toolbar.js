document.addEventListener("DOMContentLoaded", function () {
    const editor = document.getElementById("editorContent");
    const form = document.getElementById("uploadModuleForm");
    const hiddenInput = document.getElementById("hiddenModuleContent");
    
    if (!editor || !form) return;

    editor.addEventListener("focus", function () {
        if (editor.innerHTML.trim() === "") {
            const div = document.createElement("div");
            div.appendChild(document.createElement("br"));
            editor.appendChild(div);
            placeCaretAtStart(div);
        }
    });

    const buttons = document.querySelectorAll(".editor-toolbar button[data-action]");
    const BLOCK_TAG_MAP = { normal: "div", h1: "h1", h2: "h2", h3: "h3", quote: "blockquote" };
    const BLOCK_ACTIONS = Object.keys(BLOCK_TAG_MAP);
    const BLOCK_LEVEL_TAGS = ["h1", "h2", "h3", "div", "p", "blockquote", "li"];
    const EXIT_ON_ENTER_TAGS = ["h1", "h2", "h3", "blockquote"];

    // --- Selection helpers ------------------------------------------------

    function getAnchorNode() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        let node = selection.anchorNode;
        if (!node) return null;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (!node || !editor.contains(node)) return null;
        return node;
    }

    // Returns the actual block-level DOM element the caret is in
    // (h1/h2/h3/div/p/blockquote/li) — not just its tag name.
    function getBlockElement(node) {
        let current = node;
        while (current && current !== editor) {
            if (current.nodeType === Node.ELEMENT_NODE && BLOCK_LEVEL_TAGS.includes(current.tagName.toLowerCase())) {
                return current;
            }
            current = current.parentNode;
        }
        return null;
    }

    // Walks the FULL ancestor chain up to (not including) the editor,
    // so list membership is always detected correctly.
    function getBlockContext(node) {
        let activeBlock = "";
        let blockFound = false;
        let insideList = false;
        let currentNode = node;

        while (currentNode && currentNode !== editor) {
            if (currentNode.nodeType === Node.ELEMENT_NODE) {
                const tag = currentNode.tagName.toLowerCase();
                if (tag === "ul" || tag === "ol" || tag === "li") insideList = true;
                if (!blockFound && ["h1", "h2", "h3", "div", "p", "blockquote"].includes(tag)) {
                    activeBlock = tag;
                    blockFound = true;
                }
            }
            currentNode = currentNode.parentNode;
        }
        return { activeBlock, insideList };
    }

    function clearToolbarStates() {
        buttons.forEach((button) => button.classList.remove("active"));
    }

    function getListItem(node) {
        let current = node;
        while (current && current !== editor) {
            if (current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() === "li") {
                return current;
            }
            current = current.parentNode;
        }
        return null;
    }

    function isCollapsedSelection() {
        const selection = window.getSelection();
        return !!selection && selection.rangeCount > 0 && selection.getRangeAt(0).collapsed;
    }

    // "Bold" reflects what the text visually looks like — either real
    // <b>/<strong> formatting, or a block (like a heading) whose CSS
    // makes it bold by default — so the button always matches what's
    // on screen. With a collapsed cursor (nothing selected) we trust
    // the browser's own live toggle state instead: clicking Bold
    // on/off there doesn't touch the DOM until you actually type, so
    // a DOM check alone can't see the change yet.
    function computeIsBold(node, block) {
        if (isCollapsedSelection()) return document.queryCommandState("bold");
        if (hasAncestorTag(node, ["b", "strong"])) return true;
        if (block) {
            const weight = window.getComputedStyle(block).fontWeight;
            return parseInt(weight, 10) >= 700;
        }
        return false;
    }

    // document.queryCommandState is unreliable, and gets further out of
    // sync once we start rewriting blocks manually (see setBlockFormat
    // below) instead of going through execCommand. So instead of asking
    // the browser "is bold on?", we check the actual DOM ourselves.
    function hasAncestorTag(node, tags) {
        let current = node;
        while (current && current !== editor) {
            if (current.nodeType === Node.ELEMENT_NODE && tags.includes(current.tagName.toLowerCase())) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    // Reads text-align directly off the nearest block element instead
    // of relying on queryCommandState for the same reason.
    function getAlignment(node) {
        const block = getBlockElement(node);
        if (!block) return "left";
        const inline = block.style.textAlign;
        if (inline) return inline;
        const computed = window.getComputedStyle(block).textAlign;
        return computed === "center" || computed === "right" ? computed : "left";
    }

    // Descends to the deepest last/first node so the caret ends up
    // truly inside any nested formatting tags (b/i/u/s), not just at
    // the outer block's boundary. A caret sitting on the block itself
    // (rather than inside the nested tags) is what was making Bold/
    // Italic/Underline/Strikethrough read as "off" right after we
    // moved the caret ourselves.
    function getDeepLastNode(el) {
        let node = el;
        while (node.lastChild) node = node.lastChild;
        return node;
    }

    function getDeepFirstNode(el) {
        let node = el;
        while (node.firstChild) node = node.firstChild;
        return node;
    }

    function placeCaretAtEnd(el) {
        const target = getDeepLastNode(el);
        const range = document.createRange();
        if (target.nodeType === Node.TEXT_NODE) {
            range.setStart(target, target.textContent.length);
            range.collapse(true);
        } else {
            range.selectNodeContents(target);
            range.collapse(false);
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function placeCaretAtStart(el) {
        const target = getDeepFirstNode(el);
        const range = document.createRange();
        if (target.nodeType === Node.TEXT_NODE) {
            range.setStart(target, 0);
            range.collapse(true);
        } else {
            range.selectNodeContents(target);
            range.collapse(true);
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // --- Block-level formatting (manual DOM rewrite, no execCommand) -----
    //
    // execCommand("formatBlock", ...) turned out to be unreliable here —
    // especially right after a list conversion, or with a partial text
    // selection inside an existing heading — sometimes silently failing
    // or applying to the wrong element. So instead of asking the browser
    // to guess, we find the exact block element the caret is in and
    // replace its tag ourselves. This is deterministic every time.

    // Saves/restores the caret's exact character position within a
    // block, so that converting a block's tag (e.g. clicking a heading)
    // doesn't always snap the cursor to the very end of the line. On a
    // line with mixed formatting (part bold, part not), jumping to the
    // end could land the cursor on a differently-formatted character
    // than the one you were actually on, making the toolbar look wrong.
    function getCaretOffsetWithinBlock(block) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(block);
        preRange.setEnd(range.endContainer, range.endOffset);
        return preRange.toString().length;
    }

    function setCaretAtOffset(block, offset) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        let remaining = offset;
        let node = walker.nextNode();
        let lastTextNode = null;

        while (node) {
            lastTextNode = node;
            const len = node.textContent.length;
            if (remaining <= len) {
                const range = document.createRange();
                range.setStart(node, remaining);
                range.collapse(true);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }
            remaining -= len;
            node = walker.nextNode();
        }

        if (lastTextNode) {
            const range = document.createRange();
            range.setStart(lastTextNode, lastTextNode.textContent.length);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            placeCaretAtEnd(block);
        }
    }

    function replaceBlockTag(block, tagName) {
        const newBlock = document.createElement(tagName);
        while (block.firstChild) {
            newBlock.appendChild(block.firstChild);
        }
        if (!newBlock.firstChild) {
            newBlock.appendChild(document.createElement("br"));
        }
        block.parentNode.replaceChild(newBlock, block);
        return newBlock;
    }

    // Converts a <li> into a standalone block, splitting its parent
    // list so sibling bullets/numbers above and below stay intact.
    function convertListItemToBlock(li, tagName) {
        const list = li.parentNode;
        const parent = list.parentNode;
        const items = Array.from(list.children).filter(
            (child) => child.tagName && child.tagName.toLowerCase() === "li"
        );
        const index = items.indexOf(li);
        const beforeItems = items.slice(0, index);
        const afterItems = items.slice(index + 1);

        const newBlock = document.createElement(tagName);

        // Browsers sometimes wrap an existing heading inside the new
        // <li> instead of replacing it (e.g. <li><h2>text</h2></li>).
        // If that happened, pull from the inner element's children
        // instead of moving the whole inner element, so we don't end
        // up with a heading nested inside another heading.
        let source = li;
        if (li.childNodes.length === 1 && li.firstChild.nodeType === Node.ELEMENT_NODE) {
            const innerTag = li.firstChild.tagName.toLowerCase();
            if (["h1", "h2", "h3", "div", "p", "blockquote"].includes(innerTag)) {
                source = li.firstChild;
            }
        }

        while (source.firstChild) {
            newBlock.appendChild(source.firstChild);
        }
        if (!newBlock.firstChild) {
            newBlock.appendChild(document.createElement("br"));
        }

        const pieces = [];
        if (beforeItems.length > 0) {
            const beforeList = document.createElement(list.tagName);
            beforeItems.forEach((item) => beforeList.appendChild(item));
            pieces.push(beforeList);
        }
        pieces.push(newBlock);
        if (afterItems.length > 0) {
            const afterList = document.createElement(list.tagName);
            afterItems.forEach((item) => afterList.appendChild(item));
            pieces.push(afterList);
        }

        pieces.forEach((node) => parent.insertBefore(node, list));
        parent.removeChild(list);
        placeCaretAtEnd(newBlock);
        return newBlock;
    }

    // Wraps content that's sitting directly in the editor with no
    // block-level container (can happen if text was typed before any
    // wrapping element existed) so it can be turned into a heading.
    function wrapBareContent(tagName) {
        const newBlock = document.createElement(tagName);
        while (editor.firstChild) {
            newBlock.appendChild(editor.firstChild);
        }
        if (!newBlock.firstChild) {
            newBlock.appendChild(document.createElement("br"));
        }
        editor.appendChild(newBlock);
        placeCaretAtEnd(newBlock);
        return newBlock;
    }

    // Returns every block-level element touched by the current
    // selection, so an action like alignment can apply to a whole
    // multi-line highlight instead of just the first line.
    function getSelectedBlocks() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return [];
        const range = selection.getRangeAt(0);

        if (range.collapsed) {
            const anchorNode = getAnchorNode();
            const block = anchorNode ? getBlockElement(anchorNode) : null;
            return block ? [block] : [];
        }

        const candidates = editor.querySelectorAll("h1, h2, h3, div, p, blockquote, li");
        const blocks = [];
        candidates.forEach((el) => {
            if (range.intersectsNode(el)) blocks.push(el);
        });
        // Drop any block that's an ancestor of another block already
        // in the list, so we don't double-apply to a wrapper and its
        // own children.
        return blocks.filter((b) => !blocks.some((other) => other !== b && b.contains(other)));
    }

    // Sets alignment directly on every block the selection touches,
    // the same way we handle headings/lists — execCommand's justify
    // commands can wrap a heading's content in a nested <div> instead
    // of just styling the heading itself, which then confuses later
    // heading clicks into grabbing that inner wrapper instead of the
    // real block.
    function setAlignment(direction) {
        const blocks = getSelectedBlocks();
        if (blocks.length === 0) {
            const anchorNode = getAnchorNode();
            if (!anchorNode) return;
            const block = getBlockElement(anchorNode) || wrapBareContent("div");
            block.style.textAlign = direction;
            return;
        }
        blocks.forEach((block) => {
            block.style.textAlign = direction;
        });
    }

    // Flattens a heading/quote to plain text BEFORE it becomes a list
    // item. Without this, execCommand("insertUnorderedList") can wrap
    // an existing heading as <li><h3>text</h3></li> instead of
    // replacing it — leaving the bullet still heading-sized, and
    // confusing the toolbar into showing Normal as active while the
    // text is still visually a heading.
    function prepareForList() {
        const anchorNode = getAnchorNode();
        if (!anchorNode) return;
        const block = getBlockElement(anchorNode);
        if (!block) return;
        const tag = block.tagName.toLowerCase();
        if (["h1", "h2", "h3", "blockquote"].includes(tag)) {
            const caretOffset = getCaretOffsetWithinBlock(block);
            const newBlock = replaceBlockTag(block, "div");
            if (caretOffset !== null) {
                setCaretAtOffset(newBlock, caretOffset);
            } else {
                placeCaretAtEnd(newBlock);
            }
        }
    }

    // --- Custom undo/redo -------------------------------------------------
    //
    // Browser Undo/Redo (execCommand) only tracks changes IT made.
    // Since headings, lists, and alignment are now done with direct
    // DOM edits instead of execCommand, the native undo stack has no
    // idea those changes happened. So we keep our own history of full
    // editor snapshots and drive Undo/Redo from that instead.

    let undoStack = [];
    let redoStack = [];
    let lastSnapshotTime = 0;

    function pushHistory() {
        undoStack.push(editor.innerHTML);
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
    }

    // Groups rapid typing into fewer undo steps (so Undo doesn't
    // remove one character at a time) by only snapshotting if enough
    // time has passed since the last one.
    function pushHistoryThrottled() {
        const now = Date.now();
        if (now - lastSnapshotTime > 500) {
            pushHistory();
            lastSnapshotTime = now;
        }
    }

    function restoreSnapshot(html) {
        editor.innerHTML = html;
        const last = editor.lastChild;
        if (last) {
            placeCaretAtEnd(last);
        }
        updateToolbarStates();
    }

    function performUndo() {
        if (undoStack.length === 0) return;
        redoStack.push(editor.innerHTML);
        restoreSnapshot(undoStack.pop());
    }

    function performRedo() {
        if (redoStack.length === 0) return;
        undoStack.push(editor.innerHTML);
        restoreSnapshot(redoStack.pop());
    }

    editor.addEventListener("beforeinput", pushHistoryThrottled);

    // Main entry point used by the toolbar buttons.
    function setBlockFormat(action) {
        const anchorNode = getAnchorNode();
        if (!anchorNode) return;

        const targetTag = BLOCK_TAG_MAP[action];

        // Check for a list item ANYWHERE up the chain first — not
        // just as the nearest block — because a heading can end up
        // nested inside an <li> (see convertListItemToBlock above),
        // and in that case the <h2> etc. would be found before the
        // <li> if we only looked at the nearest block tag.
        const li = getListItem(anchorNode);
        if (li) {
            convertListItemToBlock(li, targetTag);
            return;
        }

        const block = getBlockElement(anchorNode);

        if (!block) {
            wrapBareContent(targetTag);
            return;
        }
        const currentTag = block.tagName.toLowerCase();

        // "Normal" always forces div. Headings/quote toggle back to
        // normal if the block is already that exact type.
        let finalTag = targetTag;
        if (action !== "normal" && currentTag === targetTag) {
            finalTag = "div";
        }

        const caretOffset = getCaretOffsetWithinBlock(block);
        const newBlock = replaceBlockTag(block, finalTag);
        if (caretOffset !== null) {
            setCaretAtOffset(newBlock, caretOffset);
        } else {
            placeCaretAtEnd(newBlock);
        }
    }

    // --- Toolbar click handling -------------------------------------------

    buttons.forEach((button) => {
        button.addEventListener("click", function (e) {
            e.preventDefault();
            editor.focus();

            const action = this.getAttribute("data-action");

            if (action === "undo") {
                performUndo();
                return;
            }
            if (action === "redo") {
                performRedo();
                return;
            }

            pushHistory();

            if (BLOCK_ACTIONS.includes(action)) {
                setBlockFormat(action);
                updateToolbarStates();
                return;
            }

            if (action === "codeBlock") {
                insertCodeBlockTemplate();
                updateToolbarStates();
                return;
            }

            if (action === "terminalBlock") {
                insertTerminalBlockTemplate();
                updateToolbarStates();
                return;
            }

            switch (action) {
                case "bold":
                    document.execCommand("bold", false, null);
                    break;
                case "italic":
                    document.execCommand("italic", false, null);
                    break;
                case "underline":
                    document.execCommand("underline", false, null);
                    break;
                case "strikethrough":
                    document.execCommand("strikethrough", false, null);
                    break;
                case "alignLeft":
                    setAlignment("left");
                    break;
                case "alignCenter":
                    setAlignment("center");
                    break;
                case "alignRight":
                    setAlignment("right");
                    break;
                case "ul":
                    prepareForList();
                    document.execCommand("insertUnorderedList", false, null);
                    break;
                case "ol":
                    prepareForList();
                    document.execCommand("insertOrderedList", false, null);
                    break;
            }

            updateToolbarStates();
        });
    });

    // --- Exit heading/quote formatting when pressing Enter at the end ----
    //
    // Native contenteditable behavior continues the SAME tag (h1, h2,
    // blockquote...) onto the new line when you hit Enter, so a heading
    // "infects" every line you type after it. Most editors (Docs, Word)
    // drop back to normal body text once you press Enter at the end of
    // a heading, so we replicate that here.

    function isCaretAtEndOfBlock(block) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;
        const range = selection.getRangeAt(0);
        if (!range.collapsed) return false;
        const testRange = range.cloneRange();
        testRange.selectNodeContents(block);
        testRange.setStart(range.endContainer, range.endOffset);
        return testRange.toString().length === 0;
    }

    editor.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" || e.shiftKey) return;

        const anchorNode = getAnchorNode();
        if (!anchorNode) return;

        const block = getBlockElement(anchorNode);
        if (!block) return;

        const tag = block.tagName.toLowerCase();
        if (!EXIT_ON_ENTER_TAGS.includes(tag)) return;
        if (!isCaretAtEndOfBlock(block)) return;

        e.preventDefault();
        const newBlock = document.createElement("div");
        newBlock.appendChild(document.createElement("br"));
        block.parentNode.insertBefore(newBlock, block.nextSibling);
        placeCaretAtStart(newBlock);
        updateToolbarStates();
    });

   function insertCodeBlockTemplate() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement("div");
        wrapper.className = "editor-code-container";
        wrapper.contentEditable = "false";

        wrapper.innerHTML = `
            <div class="editor-code-top-bar">
                <div class="editor-code-filename-group">
                    <i class="fa-regular fa-file-code" style="color: #6b7280; font-size: 1.1rem;"></i>
                    <input type="text" class="editor-code-filename" placeholder="File name (e.g. main.py)">
                </div>
                <select class="editor-code-mode-select">
                    <option value="exercise">Interactive Exercise (Console + Output)</option>
                    <option value="snippet">Code Example Only (Console)</option>
                </select>
                <button type="button" class="editor-delete-block-btn" title="Delete Block"><i class="fa-solid fa-trash-can"></i></button>
            </div>
            <div class="editor-code-card console-card-pane">
                <div class="editor-code-card-header" style="background: #06b6d4 !important;"></div>
                <div class="editor-code-card-body">
                    <div class="editor-code-title-row">
                        <div class="editor-code-title"><i class="fa-solid fa-code"></i> Console</div>
                        <button type="button" class="console-action-btn run-btn" title="Run Code"><i class="fa-solid fa-play"></i> Run</button>
                    </div>
                    <p class="editor-code-desc">Provide example code for students.</p>
                    <div class="editor-console-box" contenteditable="true" spellcheck="false" placeholder="# Write your code here..."></div>
                </div>
            </div>
            <div class="editor-code-card output-card-pane">
                <div class="editor-code-card-header" style="background: #06b6d4 !important;"></div>
                <div class="editor-code-card-body">
                    <div class="editor-code-title-row">
                        <div class="editor-code-title"><i class="fa-solid fa-terminal"></i> Expected Output</div>
                        <select class="editor-output-mode-select">
                            <option value="manual">Manual Input</option>
                            <option value="auto">Auto-Evaluate from Code</option>
                        </select>
                    </div>
                    <p class="editor-code-desc output-desc-text">Set the expected output manually.</p>
                    <div class="editor-output-box" contenteditable="true" placeholder="Enter expected output..."></div>
                </div>
            </div>
        `;

        // Delete Block Event Listener
        wrapper.querySelector(".editor-delete-block-btn").addEventListener("click", function () {
            wrapper.remove();
            pushHistory();
        });

        const modeSelect = wrapper.querySelector(".editor-code-mode-select");
        const outputPane = wrapper.querySelector(".output-card-pane");
        const consolePane = wrapper.querySelector(".console-card-pane");
        const runBtn = wrapper.querySelector(".run-btn");
        const outputModeSelect = wrapper.querySelector(".editor-output-mode-select");
        const outputBox = wrapper.querySelector(".editor-output-box");
        const outputDesc = wrapper.querySelector(".output-desc-text");

        modeSelect.addEventListener("change", function () {
            if (this.value === "snippet") {
                outputPane.style.display = "none";
                runBtn.style.display = "none";
                consolePane.style.gridColumn = "1 / -1";
            } else {
                outputPane.style.display = "flex";
                runBtn.style.display = "flex";
                consolePane.style.gridColumn = "auto";
            }
        });

        outputModeSelect.addEventListener("change", function () {
            if (this.value === "auto") {
                outputBox.contentEditable = "false";
                outputBox.style.background = "#f3f4f6";
                outputBox.style.color = "#6b7280";
                outputBox.textContent = "// Output will be automatically evaluated from code execution...";
                outputDesc.textContent = "Output is dynamically generated based on code execution.";
            } else {
                outputBox.contentEditable = "true";
                outputBox.style.background = "#ffffff";
                outputBox.style.color = "#374151";
                outputBox.textContent = "";
                outputDesc.textContent = "Set the expected output manually.";
            }
        });

        range.deleteContents();
        range.insertNode(wrapper);

        const spacer = document.createElement("div");
        spacer.appendChild(document.createElement("br"));
        wrapper.parentNode.insertBefore(spacer, wrapper.nextSibling);
        
        placeCaretAtStart(spacer);
        pushHistory();
    }

    function insertTerminalBlockTemplate() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        const wrapper = document.createElement("div");
        wrapper.className = "editor-terminal-container";
        wrapper.contentEditable = "false";

        wrapper.innerHTML = `
            <div class="editor-terminal-card-header"></div>
            <div class="editor-terminal-card-body">
                <div class="editor-code-title-row" style="margin-bottom: 4px;">
                    <div class="editor-code-title"><i class="fa-solid fa-terminal"></i> Terminal / Command Prompt</div>
                    <button type="button" class="editor-delete-block-btn" title="Delete Block"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <p class="editor-code-desc">Provide command line or REPL shell example for students.</p>
                <div class="editor-terminal-box" contenteditable="true" spellcheck="false" placeholder="Type command prompt or shell example here..."></div>
            </div>
        `;

        wrapper.querySelector(".editor-delete-block-btn").addEventListener("click", function () {
            wrapper.remove();
            pushHistory();
        });

        range.deleteContents();
        range.insertNode(wrapper);

        const spacer = document.createElement("div");
        spacer.appendChild(document.createElement("br"));
        wrapper.parentNode.insertBefore(spacer, wrapper.nextSibling);
        
        placeCaretAtStart(spacer);
        pushHistory();
    }

    // --- State sync ---------------------------------------------------------

    function updateToolbarStates() {
        const node = getAnchorNode();
        if (!node) {
            clearToolbarStates();
            return;
        }

        const block = getBlockElement(node);
        const collapsed = isCollapsedSelection();
        const isBold = computeIsBold(node, block);
        const isItalic = collapsed ? document.queryCommandState("italic") : hasAncestorTag(node, ["i", "em"]);
        const isUnderline = collapsed ? document.queryCommandState("underline") : hasAncestorTag(node, ["u", "ins"]);
        const isStrike = collapsed
            ? document.queryCommandState("strikethrough")
            : hasAncestorTag(node, ["s", "strike", "del"]);
        const alignment = getAlignment(node);
        const isLeft = alignment === "left";
        const isCenter = alignment === "center";
        const isRight = alignment === "right";
        const isUl = node.closest("ul") !== null;
        const isOl = node.closest("ol") !== null;

        const { activeBlock, insideList } = getBlockContext(node);

        buttons.forEach((button) => {
            const action = button.getAttribute("data-action");
            let isActive = false;

            switch (action) {
                case "bold":
                    isActive = isBold;
                    break;
                case "italic":
                    isActive = isItalic;
                    break;
                case "underline":
                    isActive = isUnderline;
                    break;
                case "strikethrough":
                    isActive = isStrike;
                    break;
                case "alignLeft":
                    isActive = isLeft;
                    break;
                case "alignCenter":
                    isActive = isCenter;
                    break;
                case "alignRight":
                    isActive = isRight;
                    break;
                case "ul":
                    isActive = isUl;
                    break;
                case "ol":
                    isActive = isOl;
                    break;
                case "h1":
                    isActive = !insideList && activeBlock === "h1";
                    break;
                case "h2":
                    isActive = !insideList && activeBlock === "h2";
                    break;
                case "h3":
                    isActive = !insideList && activeBlock === "h3";
                    break;
                case "normal":
                    isActive =
                        (insideList && !["h1", "h2", "h3", "blockquote"].includes(activeBlock)) ||
                        activeBlock === "div" ||
                        activeBlock === "p" ||
                        activeBlock === "";
                    break;
                case "quote":
                    isActive = !insideList && activeBlock === "blockquote";
                    break;
            }

            button.classList.toggle("active", isActive);
        });
    }

    document.addEventListener("selectionchange", updateToolbarStates);
    editor.addEventListener("keyup", updateToolbarStates);
    editor.addEventListener("mouseup", updateToolbarStates);
    editor.addEventListener("input", updateToolbarStates);

    form.addEventListener("submit", function () {
        hiddenInput.value = editor.innerHTML;
    });
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
        const activeEl = document.activeElement;
        
        // Check if the focused element is the main lesson editor, console, output, or terminal
        const isEditableArea = activeEl.id === "editorContent" ||
                               activeEl.classList.contains("editor-console-box") ||
                               activeEl.classList.contains("editor-output-box") ||
                               activeEl.classList.contains("editor-terminal-box");

        if (isEditableArea) {
            e.preventDefault(); // Stop focus from jumping out of the box

            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);

            // Insert 4 non-breaking spaces for tab indentation
            const tabNode = document.createTextNode("\u00a0\u00a0\u00a0\u00a0");
            range.deleteContents();
            range.insertNode(tabNode);

            // Move the cursor right after the inserted spaces
            range.setStartAfter(tabNode);
            range.setEndAfter(tabNode);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
});

