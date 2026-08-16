document.addEventListener("DOMContentLoaded", function () {
    const editor = document.getElementById("editorContent");
    const form = document.getElementById("uploadModuleForm");
    const hiddenInput = document.getElementById("hiddenModuleContent");

    if (!editor || !form) return;

    editor.addEventListener("focus", function () {
        if (editor.innerHTML.trim() === "") {
            document.execCommand("defaultParagraphSeparator", false, "div");
            document.execCommand("formatBlock", false, "<div>");
        }
    });

    const buttons = document.querySelectorAll(".editor-toolbar button[data-action]");

    // Maps a toolbar action to the tag it should produce.
    const BLOCK_TAG_MAP = { normal: "div", h1: "h1", h2: "h2", h3: "h3", quote: "blockquote" };
    const BLOCK_ACTIONS = Object.keys(BLOCK_TAG_MAP);

    // --- Selection helpers ---------------------------------------------

    // Returns the element the caret/selection is currently in, or null
    // if there's no selection or it's outside the editor.
    function getAnchorNode() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;

        let node = selection.anchorNode;
        if (!node) return null;
        if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }
        if (!node || !editor.contains(node)) return null;
        return node;
    }

    // Walks the FULL ancestor chain up to (not including) the editor,
    // so list membership is always detected correctly even when a
    // heading/blockquote happens to be nested inside a list item.
    function getBlockContext(node) {
        let activeBlock = "";
        let blockFound = false;
        let insideList = false;
        let currentNode = node;

        while (currentNode && currentNode !== editor) {
            if (currentNode.nodeType === Node.ELEMENT_NODE) {
                const tag = currentNode.tagName.toLowerCase();

                if (tag === "ul" || tag === "ol" || tag === "li") {
                    insideList = true;
                }

                if (!blockFound && ["h1", "h2", "h3", "div", "p", "blockquote"].includes(tag)) {
                    activeBlock = tag;
                    blockFound = true;
                }
            }
            currentNode = currentNode.parentNode;
        }

        return { activeBlock, insideList };
    }

    // Finds the nearest <li> ancestor of node, if any.
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

    function clearToolbarStates() {
        buttons.forEach((button) => button.classList.remove("active"));
    }

    // --- Core fix: convert a list item into a heading/quote/normal ------
    //
    // execCommand("insertUnorderedList") followed immediately by
    // execCommand("formatBlock", ...) is unreliable — firing two
    // execCommand calls back to back is a known race condition in
    // browsers, and the second command can silently fail or land on
    // the wrong node. So instead of chaining commands, we rebuild
    // that piece of the DOM ourselves: pull the <li> out of its list,
    // wrap its content in the target tag, and — if the list had other
    // items above/below it — split the list so those items stay intact.
    function convertListItemToBlock(li, tagName) {
        const list = li.parentNode; // <ul> or <ol>
        const parent = list.parentNode;
        const items = Array.from(list.children).filter(
            (child) => child.tagName && child.tagName.toLowerCase() === "li"
        );
        const index = items.indexOf(li);
        const beforeItems = items.slice(0, index);
        const afterItems = items.slice(index + 1);

        const newBlock = document.createElement(tagName);
        while (li.firstChild) {
            newBlock.appendChild(li.firstChild);
        }
        if (!newBlock.firstChild) {
            newBlock.appendChild(document.createElement("br"));
        }

        const piecesToInsert = [];

        if (beforeItems.length > 0) {
            const beforeList = document.createElement(list.tagName);
            beforeItems.forEach((item) => beforeList.appendChild(item));
            piecesToInsert.push(beforeList);
        }

        piecesToInsert.push(newBlock);

        if (afterItems.length > 0) {
            const afterList = document.createElement(list.tagName);
            afterItems.forEach((item) => afterList.appendChild(item));
            piecesToInsert.push(afterList);
        }

        piecesToInsert.forEach((node) => parent.insertBefore(node, list));
        parent.removeChild(list);

        // Put the caret at the end of the newly created block.
        const range = document.createRange();
        range.selectNodeContents(newBlock);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        return newBlock;
    }

    // --- Toolbar click handling -----------------------------------------

    buttons.forEach((button) => {
        button.addEventListener("click", function (e) {
            e.preventDefault();
            editor.focus();

            const action = this.getAttribute("data-action");

            if (BLOCK_ACTIONS.includes(action)) {
                const anchorNode = getAnchorNode();
                const targetTag = BLOCK_TAG_MAP[action];

                if (anchorNode) {
                    const { activeBlock, insideList } = getBlockContext(anchorNode);

                    if (insideList) {
                        const li = getListItem(anchorNode);
                        if (li) {
                            convertListItemToBlock(li, targetTag);
                        }
                    } else if (action === "normal") {
                        document.execCommand("formatBlock", false, "<div>");
                    } else {
                        // Toggle off if this exact block type is already active.
                        const toggleOff = activeBlock === targetTag;
                        document.execCommand("formatBlock", false, toggleOff ? "<div>" : "<" + targetTag + ">");
                    }
                }

                updateToolbarStates();
                return;
            }

            switch (action) {
                case "undo":
                    document.execCommand("undo", false, null);
                    break;
                case "redo":
                    document.execCommand("redo", false, null);
                    break;
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
                    document.execCommand("justifyLeft", false, null);
                    break;
                case "alignCenter":
                    document.execCommand("justifyCenter", false, null);
                    break;
                case "alignRight":
                    document.execCommand("justifyRight", false, null);
                    break;
                case "ul":
                    document.execCommand("insertUnorderedList", false, null);
                    break;
                case "ol":
                    document.execCommand("insertOrderedList", false, null);
                    break;
            }

            updateToolbarStates();
        });
    });

    // --- State sync -------------------------------------------------------

    function updateToolbarStates() {
        const node = getAnchorNode();
        if (!node) {
            clearToolbarStates();
            return;
        }

        const isBold = document.queryCommandState("bold");
        const isItalic = document.queryCommandState("italic");
        const isUnderline = document.queryCommandState("underline");
        const isStrike = document.queryCommandState("strikethrough");
        const isLeft = document.queryCommandState("justifyLeft");
        const isCenter = document.queryCommandState("justifyCenter");
        const isRight = document.queryCommandState("justifyRight");
        const isUl = document.queryCommandState("insertUnorderedList");
        const isOl = document.queryCommandState("insertOrderedList");

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
                    isActive = isUl || node.closest("ul") !== null;
                    break;
                case "ol":
                    isActive = isOl || node.closest("ol") !== null;
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
                    isActive = insideList || activeBlock === "div" || activeBlock === "p" || activeBlock === "";
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