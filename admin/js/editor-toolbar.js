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

    // --- Task #46: minimum lesson content before console/terminal blocks ---
    //
    // Requirement: "Restrict the addition of interactive console or
    // terminal blocks so they cannot be inserted unless a minimum amount
    // of lesson content text has been typed first." The threshold is
    // measured against the admin's own narrative text - NOT the text
    // typed inside an already-inserted console/output/terminal box - so
    // padding out a code block's own content can never be used to game
    // the check. See getMainLessonContentLength() below.
    const MIN_CONTENT_BEFORE_BLOCK = 1;
    const MIN_LESSON_CONTENT_CHARS = 20;

    function isInteractiveBlockWrapper(node) {
        return !!(
            node &&
            node.nodeType === Node.ELEMENT_NODE &&
            (node.classList.contains("editor-code-container") || node.classList.contains("editor-terminal-container"))
        );
    }

    // Measures how much real lesson text the admin has written so far,
    // deliberately excluding the contents of any already-inserted
    // console/terminal block (filename, code, expected output, terminal
    // text) - those are supporting material for a lesson, not the lesson
    // narrative itself, so they should never count toward "enough
    // content to justify adding another interactive block."
    function getMainLessonContentLength() {
        const clone = editor.cloneNode(true);
        clone.querySelectorAll(".editor-code-container, .editor-terminal-container").forEach((n) => n.remove());
        return clone.textContent.replace(/\s+/g, " ").trim().length;
    }

    function hasEnoughLessonContentForBlock() {
        return getMainLessonContentLength() >= MIN_CONTENT_BEFORE_BLOCK;
    }

    // --- Task #47: pre-filled, runnable Python example for new console blocks ---
    //
    // Requirement: every newly-inserted interactive exercise block should
    // land with a real, syntactically valid Python example (a function
    // definition, code that actually calls it, and the matching expected
    // output) instead of empty boxes - so the admin has a working
    // starting point to edit rather than a blank slate.
    const DEFAULT_CODE_FILENAME = "";
    const DEFAULT_CODE_EXAMPLE =
        "def calculate_average(numbers):\n" +
        "    \"\"\"Return the average of a list of numbers.\"\"\"\n" +
        "    if not numbers:\n" +
        "        return 0\n" +
        "    return sum(numbers) / len(numbers)\n" +
        "\n" +
        "\n" +
        "scores = [85, 92, 78, 90, 88]\n" +
        "result = calculate_average(scores)\n" +
        "print(f\"Average score: {result}\")";
    // Matches DEFAULT_CODE_EXAMPLE exactly: (85+92+78+90+88) / 5 = 86.6
    const DEFAULT_CODE_OUTPUT = "Average score: 86.6";

    // --- Task: Run button - executes the Console's code via Pyodide,
    // a real Python interpreter compiled to WebAssembly that runs
    // entirely in the browser. This gives the New Lesson editor a
    // genuine "run it and see" IDE feel without ever sending
    // admin-authored code to the server to execute. ---
    const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
    
    // --- Cross-block imports: lets one Console block `import` another by filename ---
const LESSON_MODULES_DIR = "/lesson_modules";

function ensureModulesDirExists(pyodide) {
    try {
        pyodide.FS.mkdirTree(LESSON_MODULES_DIR);
    } catch (e) {
        // already exists - fine
    }
}

// Writes every named .py block's current code into the shared virtual
// directory, so `import <name>` can find it. Blocks with no filename (or
// a non-.py filename) are skipped - they can't be import targets.
function syncModuleFilesToFS(pyodide, files) {
    ensureModulesDirExists(pyodide);
    files.forEach(({ filename, code }) => {
        const name = (filename || "").trim();
        if (!name.toLowerCase().endsWith(".py")) return;
        const baseName = name.split("/").pop().split("\\").pop();
        try {
            pyodide.FS.writeFile(`${LESSON_MODULES_DIR}/${baseName}`, code || "", { encoding: "utf8" });
        } catch (e) {
            console.warn("Could not write module file for import support:", baseName, e);
        }
    });
}

// Collects {filename, code} from every Code block currently in the editor,
// in DOM order, so Run always sees the latest typed content of every block.
function getAllCodeBlockFiles() {
    const files = [];
    editor.querySelectorAll(".editor-code-container").forEach((wrapper) => {
        const filenameInput = wrapper.querySelector(".editor-code-filename");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        files.push({
            filename: filenameInput ? filenameInput.value.trim() : "",
            code: consoleBox ? consoleBox.innerText : "",
        });
    });
    return files;
}
    
    let activeOutputBox = null; // tracks which Output box the currently-running input() prompt should render into

function showTerminalInputPrompt(promptText) {
    return new Promise((resolve) => {
        const outputBox = activeOutputBox;
        if (!outputBox) { resolve(""); return; }

        const promptSpan = document.createElement("span");
        promptSpan.className = "editor-terminal-prompt-text";
        promptSpan.textContent = promptText || "";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "editor-terminal-inline-input";
        input.autocomplete = "off";
        input.spellcheck = false;

        outputBox.appendChild(promptSpan);
        outputBox.appendChild(input);
        outputBox.scrollTop = outputBox.scrollHeight;
        input.focus();

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                input.disabled = true;
                resolve(input.value);
            }
        });
    });
}
// Pyodide's `import js as _cobrabyte_js` can reach this as
// _cobrabyte_js.cobraByteTerminalInput(...)
window.cobraByteTerminalInput = showTerminalInputPrompt;

    let pyodideLoadPromise = null;

    // Lazily loads (and caches) the single shared Pyodide instance -
    // the WASM runtime is a few MB, so this only happens once per page
    // load, the first time the admin actually clicks Run, not on
    // page load itself.
    function getPyodideInstance() {
        if (!pyodideLoadPromise) {
            if (typeof loadPyodide !== "function") {
                return Promise.reject(new Error("Pyodide script did not load."));
            }
            pyodideLoadPromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
        }
        return pyodideLoadPromise;
    }

    // Runs `code` as Python, capturing everything written to stdout AND
    // stderr (print() output, uncaught tracebacks, etc.) into one
    // string. Never throws - any failure (Pyodide unreachable, a
    // genuine Python error in the admin's example code) is returned as
    // readable text instead, so the caller can always just display
    // whatever comes back in the Expected Output box.
    //
    // NOTE ON input(): Pyodide's sandbox has no real stdin device, so
    // Python's normal input() throws "OSError: [Errno 29] I/O error"
    // the instant example code calls it. Since Run is a live preview
    // tool for the ADMIN (not the eventual learner, whose actual
    // answer isn't known yet), input() is overridden below to pop a
    // real browser prompt() dialog asking the admin for a sample
    // value - whatever they type is fed back into the running code AND
    // echoed into the captured output (prompt text + typed value),
    // exactly like a real terminal would show it.
    async function runPythonCode(code, files = [], currentFilename = "") {
        let pyodide;
        try {
            pyodide = await getPyodideInstance();
        } catch (err) {
            return "Could not load the Python runtime. Check your internet connection and try again.";
        }

        // Modules still get written to disk (harmless fallback), but the
        // real import mechanism below no longer relies on Python's plain
        // synchronous `import` for them.
        syncModuleFilesToFS(pyodide, files);

        pyodide.globals.set("_cobrabyte_user_code", code || "");
        pyodide.globals.set("_cobrabyte_module_files", files);
        pyodide.globals.set("_cobrabyte_current_filename", currentFilename || "");

        try {
            const result = await pyodide.runPythonAsync(
                "import sys, io, traceback, builtins, importlib, ast, types\n" +
                "import js as _cobrabyte_js\n" +
                `_cobrabyte_modules_dir = ${JSON.stringify(LESSON_MODULES_DIR)}\n` +
                "if _cobrabyte_modules_dir not in sys.path:\n" +
                "    sys.path.insert(0, _cobrabyte_modules_dir)\n" +
                "importlib.invalidate_caches()\n" +
                "_cobrabyte_stdout = io.StringIO()\n" +
                "_cobrabyte_stderr = io.StringIO()\n" +
                "_old_stdout, _old_stderr = sys.stdout, sys.stderr\n" +
                "_old_input = builtins.input\n" +
                "sys.stdout, sys.stderr = _cobrabyte_stdout, _cobrabyte_stderr\n" +
                "async def _cobrabyte_input(prompt=''):\n" +
                "    if prompt:\n" +
                "        sys.stdout.write(str(prompt))\n" +
                "    _val = await _cobrabyte_js.cobraByteTerminalInput(str(prompt) if prompt else '')\n" +
                "    if _val is None:\n" +
                "        raise EOFError('Input was cancelled while testing.')\n" +
                "    _val = str(_val)\n" +
                "    sys.stdout.write(_val + chr(10))\n" +
                "    return _val\n" +
                "builtins.input = _cobrabyte_input\n" +
                "class _CobrabyteInputAwaiter(ast.NodeTransformer):\n" +
                "    def visit_Call(self, node):\n" +
                "        self.generic_visit(node)\n" +
                "        if isinstance(node.func, ast.Name) and node.func.id == 'input':\n" +
                "            return ast.copy_location(ast.Await(value=node), node)\n" +
                "        return node\n" +
                "async def _cobrabyte_exec_async(source, mod_globals):\n" +
                "    tree = ast.parse(source or '', mode='exec')\n" +
                "    _CobrabyteInputAwaiter().visit(tree)\n" +
                "    ast.fix_missing_locations(tree)\n" +
                "    body = tree.body if tree.body else [ast.Pass()]\n" +
                "    func = ast.AsyncFunctionDef(\n" +
                "        name='_cobrabyte_block_main',\n" +
                "        args=ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[]),\n" +
                "        body=body, decorator_list=[], returns=None,\n" +
                "    )\n" +
                "    module_ast = ast.Module(body=[func], type_ignores=[])\n" +
                "    ast.fix_missing_locations(module_ast)\n" +
                "    exec(compile(module_ast, '<exec>', 'exec'), mod_globals)\n" +
                "    await mod_globals['_cobrabyte_block_main']()\n" +
                "try:\n" +
                "    for _mf in _cobrabyte_module_files.to_py():\n" +
                "        _mf_name = (_mf.get('filename') or '').strip()\n" +
                "        if not _mf_name.lower().endswith('.py'):\n" +
                "            continue\n" +
                "        if _mf_name == _cobrabyte_current_filename:\n" +
                "            continue\n" +
                "        _mod_name = _mf_name.split('/')[-1].split(chr(92))[-1][:-3]\n" +
                "        sys.modules.pop(_mod_name, None)\n" +
                "        _mod = types.ModuleType(_mod_name)\n" +
                "        sys.modules[_mod_name] = _mod\n" +
                "        try:\n" +
                "            await _cobrabyte_exec_async(_mf.get('code') or '', _mod.__dict__)\n" +
                "        except Exception:\n" +
                "            traceback.print_exc()\n" +
                "    await _cobrabyte_exec_async(_cobrabyte_user_code, {'__name__': '__main__'})\n" +
                "except Exception:\n" +
                "    traceback.print_exc()\n" +
                "finally:\n" +
                "    builtins.input = _old_input\n" +
                "    sys.stdout, sys.stderr = _old_stdout, _old_stderr\n" +
                "_cobrabyte_stdout.getvalue() + _cobrabyte_stderr.getvalue()\n"
            );
            return result;
        } catch (err) {
            return "Error running code: " + (err && err.message ? err.message : String(err));
        }
    }

    // Wires a single code block's "Run" button - shared by BOTH a
    // freshly-inserted block (insertCodeBlockTemplate) and a block
    // rehydrated from a saved draft/lesson (wireCodeContainer), so
    // there is only ever one place this behavior lives.
    function wireRunButton(wrapper) {
        const runBtn = wrapper.querySelector(".run-btn");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        const outputBox = wrapper.querySelector(".editor-output-box");
        const filenameInput = wrapper.querySelector(".editor-code-filename"); // NEW
        if (!runBtn || !consoleBox || !outputBox) return;

        runBtn.addEventListener("click", async function () {
            const code = consoleBox.innerText.trim();
            if (!code) {
                alert("Write some example code in the Console first.");
                return;
            }

            const originalHtml = runBtn.innerHTML;
            runBtn.disabled = true;
            runBtn.innerHTML = pyodideLoadPromise
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Running...'
                : '<i class="fa-solid fa-spinner fa-spin"></i> Loading Python...';

            activeOutputBox = outputBox;
            outputBox.textContent = "";

            const files = getAllCodeBlockFiles();
            const currentFilename = filenameInput ? filenameInput.value.trim() : ""; // NEW
            const output = await runPythonCode(code, files, currentFilename); // NEW arg

            activeOutputBox = null;
            outputBox.textContent = output.trim();
            pushHistory();

            runBtn.disabled = false;
            runBtn.innerHTML = originalHtml;
        });
    }

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

        // Task #46: guarded console/terminal block deletion ---------------
    //
    // Replaces the old single boolean flag (which had to be reset via a
    // deferred microtask and could race against the MutationObserver
    // callback below - losing that race caused a trash-button delete to
    // get treated as "accidental" and the wrapper silently reinserted,
    // leaving a phantom block that kept re-triggering this guard on
    // later, unrelated edits). A WeakSet keyed on the actual wrapper
    // element has no timing dependency at all: a wrapper is marked
    // right before removal and only that exact node is ever exempted,
    // synchronously, whenever the observer happens to run.
    const intentionallyRemovedWrappers = new WeakSet();

    // Requirement: "Prompt a confirmation warning modal when deleting a
    // console or terminal block that contains typed user inputs." Checks
    // every field a block actually lets the admin type into.
function blockHasUserInput(wrapper) {
    if (!wrapper) return false;

    if (wrapper.classList.contains("editor-code-container")) {
        const filenameInput = wrapper.querySelector(".editor-code-filename");
        const consoleBox = wrapper.querySelector(".editor-console-box");

        const filenameVal = filenameInput ? filenameInput.value.trim() : "";

        // The default filename is automatically populated and does not
        // count as user-entered content.
        const filenameChanged = !!(
            filenameVal &&
            filenameVal !== DEFAULT_CODE_FILENAME
        );

        // Console content is still considered user input.
        const consoleVal = consoleBox
            ? consoleBox.textContent.trim()
            : "";

        // Output is intentionally NOT checked here because the output box
        // is now read-only / generated content.
        return !!(filenameChanged || consoleVal);
    }

    if (wrapper.classList.contains("editor-terminal-container")) {
        const terminalBox = wrapper.querySelector(".editor-terminal-box");
        return !!(terminalBox && terminalBox.textContent.trim());
    }

    return false;
}

    // Single source of truth for "actually remove this block" - used by
    // every trash button (both newly-inserted blocks and blocks
    // rehydrated from a saved draft/lesson). Confirms first if the block
    // has typed content the admin would otherwise silently lose, then
    // performs the removal through the same intentional-removal flag the
    // MutationObserver safety net below relies on.
        function confirmAndRemoveBlock(wrapper) {
        if (!wrapper || !wrapper.parentNode) return;

        if (blockHasUserInput(wrapper)) {
            const confirmed = window.confirm(
                "This block still has content you typed (filename, code, expected " +
                "output, or terminal text). Deleting it will permanently lose that " +
                "content. Delete it anyway?"
            );
            if (!confirmed) return;
        }

        intentionallyRemovedWrappers.add(wrapper);
        wrapper.remove();
        pushHistory();
    }

    // Safety net: catches any removal of a console/terminal wrapper that
    // did NOT go through confirmAndRemoveBlock() above - e.g. Backspace/
    // Delete at a block boundary the keydown guard below didn't catch, a
    // selection spanning a block, or a cut - and puts the block right
    // back where it was, then explains why. The keydown guard is what
    // makes the common single-caret case feel instant (no flicker); this
    // observer is the guarantee that a block can never actually be lost
    // through anything other than its own trash button.
    const blockRemovalGuard = new MutationObserver((mutationList) => {
        // NEW: same defensive short-circuit as the keydown guard above -
        // if the editor has no interactive blocks left, there is
        // nothing legitimate to restore, so skip processing entirely.
        const hasAnyBlocks = !!editor.querySelector(".editor-code-container, .editor-terminal-container");

        let restoredAny = false;

        mutationList.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (isInteractiveBlockWrapper(node)) {
                    if (intentionallyRemovedWrappers.has(node)) {
                        intentionallyRemovedWrappers.delete(node);
                        return;
                    }
                    if (!hasAnyBlocks) return; // nothing left to legitimately protect
                    try {
                        mutation.target.insertBefore(node, mutation.nextSibling || null);
                        restoredAny = true;
                    } catch (err) {
                        // Parent no longer in the document - fall through.
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && typeof node.querySelectorAll === "function") {
                    const nested = node.querySelectorAll(".editor-code-container, .editor-terminal-container");
                    nested.forEach((wrapper) => {
                        if (intentionallyRemovedWrappers.has(wrapper)) {
                            intentionallyRemovedWrappers.delete(wrapper);
                            return;
                        }
                        editor.appendChild(wrapper);
                        restoredAny = true;
                    });
                }
            });
        });

        if (restoredAny) {
            alert("Console and terminal blocks can only be removed using their delete (trash) button.");
        }
    });
    blockRemovalGuard.observe(editor, { childList: true, subtree: true });

    // Proactive guard: prevents the common case (caret sitting directly
    // next to a block) from ever deleting/merging into the block wrapper
    // in the first place, so there's no visible flicker before the
    // MutationObserver safety net above would otherwise restore it.
    function findAdjacentBlockWrapper(key) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        // A real (non-collapsed) selection is handled by the
        // MutationObserver safety net instead - too many shapes to
        // reason about precisely here.
        if (!range.collapsed) return null;

        let node = range.startContainer;
        let offset = range.startOffset;

        if (key === "Backspace") {
            if (node.nodeType === Node.TEXT_NODE) {
                if (offset > 0) return null; // caret is mid/end of text - safe
                node = node.parentNode;
            } else if (offset > 0) {
                const prev = node.childNodes[offset - 1];
                return isInteractiveBlockWrapper(prev) ? prev : null;
            }
            // Caret sits at the very start of its element - walk up
            // toward the editor looking for a wrapper as the previous
            // sibling at any level.
            let current = node;
            while (current && current !== editor) {
                if (current.previousSibling) {
                    return isInteractiveBlockWrapper(current.previousSibling) ? current.previousSibling : null;
                }
                current = current.parentNode;
            }
            return null;
        }

        if (key === "Delete") {
            if (node.nodeType === Node.TEXT_NODE) {
                if (offset < node.textContent.length) return null; // caret is before end of text - safe
                node = node.parentNode;
            } else if (offset < node.childNodes.length) {
                const next = node.childNodes[offset];
                return isInteractiveBlockWrapper(next) ? next : null;
            }
            let current = node;
            while (current && current !== editor) {
                if (current.nextSibling) {
                    return isInteractiveBlockWrapper(current.nextSibling) ? current.nextSibling : null;
                }
                current = current.parentNode;
            }
            return null;
        }

        return null;
    }

    editor.addEventListener("keydown", function (e) {
        if (e.key !== "Backspace" && e.key !== "Delete") return;

        // NEW: defensive short-circuit. If there are currently zero
        // console/terminal blocks anywhere in the editor, there is
        // nothing this guard could legitimately be protecting - skip
        // the DOM walk entirely rather than risk matching a stale/
        // orphaned node reference (e.g. left over from a delete that
        // happened before this guard's logic was last reloaded, or any
        // other edge case). This makes the guard self-correcting: it
        // can only ever fire when a real block genuinely exists.
        if (!editor.querySelector(".editor-code-container, .editor-terminal-container")) return;

        const adjacentWrapper = findAdjacentBlockWrapper(e.key);
        if (adjacentWrapper) {
            e.preventDefault();
            alert("Console and terminal blocks can only be removed using their delete (trash) button.");
        }
    });

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

            // Task #46: check the state of the main text editor content
            // BEFORE doing anything else for these two actions - no
            // history snapshot, no insertion - so a blocked attempt
            // leaves the editor and its undo stack completely untouched.
            if ((action === "codeBlock" || action === "terminalBlock") && !hasEnoughLessonContentForBlock()) {
                const blockLabel = action === "codeBlock" ? "console" : "terminal";
                alert(
                    `Please write some lesson content before adding a ${blockLabel} block.`
                );
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
        // Task: keep the :empty CSS placeholder rules (module-editor.css:
    // .editor-console-box:empty:before / .editor-output-box:empty:before)
    // matching reliably forever - not just the first time. Backspacing
    // out all typed content in a contenteditable often leaves a stray
    // <br> or empty text node behind, which defeats the :empty selector
    // and makes the placeholder never reappear. Normalizing to TRUE DOM
    // emptiness on every input keeps "type -> delete everything ->
    // placeholder reappears" working every single time, not once.
    function keepPlaceholderPermanent(el) {
        if (!el) return;
        el.addEventListener("input", () => {
            const text = el.textContent.replace(/\u00a0/g, " ").trim();
            if (text === "") el.innerHTML = "";
        });
    }

        // Ensures block insertion (Console/Terminal) always has a valid
    // insertion point inside the editor, regardless of where the
    // browser's selection currently is. Without this, clicking the
    // toolbar button while focus/selection was last in the Lesson Name
    // field, a code block's filename input, the Console/Output boxes,
    // or nowhere at all (selection.rangeCount === 0) caused
    // insertCodeBlockTemplate()/insertTerminalBlockTemplate() to bail
    // out silently - the button appeared to do nothing, with no error
    // and no visible feedback.
    function getInsertionRange() {
        const selection = window.getSelection();
        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            if (editor.contains(range.startContainer)) {
                return range;
            }
        }
        // Selection missing or outside the editor - fall back to the
        // very end of the lesson content instead of doing nothing.
        const target = editor.lastChild || editor;
        placeCaretAtEnd(target);
        return window.getSelection().getRangeAt(0);
    }

    function insertCodeBlockTemplate() {
        const range = getInsertionRange();

        const wrapper = document.createElement("div");
        wrapper.className = "editor-code-container";
        wrapper.contentEditable = "false";

        wrapper.innerHTML = `
            <div class="editor-code-top-bar">
                <div class="editor-code-filename-group">
                    <i class="fa-regular fa-file-code" style="color: #6b7280; font-size: 1.1rem;"></i>
                    <input type="text" class="editor-code-filename" placeholder="File name (e.g. main.py)">
                </div>
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
                    <div class="editor-console-box" contenteditable="true" spellcheck="false" placeholder="e.g. print(&quot;Hello, World!&quot;)"></div>
                </div>
            </div>
            <div class="editor-code-card output-card-pane">
                <div class="editor-code-card-header" style="background: #06b6d4 !important;"></div>
                <div class="editor-code-card-body">
                    <div class="editor-code-title-row">
                        <div class="editor-code-title"><i class="fa-solid fa-terminal"></i> Expected Output</div>
                    </div>
                    <p class="editor-code-desc output-desc-text">Runs automatically as a live terminal - click Run to generate it.</p>
                    <div class="editor-output-box editor-output-terminal" contenteditable="false" placeholder="Click Run to see the output here..."></div>
                </div>
            </div>
        `;

        // Task #47: seed the block with a real, ready-to-run example
        // instead of empty inputs - filename, a working function
        // definition + call, and the output that call actually produces.
        // Set via the DOM properties (not string-interpolated into the
        // template above) so nothing about the example code - quotes,
        // braces, f-strings - needs HTML-escaping.
        const filenameInput = wrapper.querySelector(".editor-code-filename");
        if (filenameInput) filenameInput.value = DEFAULT_CODE_FILENAME;

         wrapper.querySelector(".editor-delete-block-btn").addEventListener("click", function () {
            confirmAndRemoveBlock(wrapper);
        });

        const outputBox = wrapper.querySelector(".editor-output-box");
        const consoleBoxEl = wrapper.querySelector(".editor-console-box");
        keepPlaceholderPermanent(consoleBoxEl);
        wireRunButton(wrapper);

        range.deleteContents();
        range.insertNode(wrapper);

        // Apply auto mode's placeholder-only state immediately on load
        // too, so a resource saved while in Auto mode reopens empty
        // (placeholder) rather than blank-but-editable.
        if (outputModeSelect && outputModeSelect.value === "auto") {
            outputBox.innerHTML = "";
            outputBox.setAttribute("placeholder", "Output will be automatically evaluated from code execution...");
        }

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
                // NEW: empty DOM + placeholder attribute instead of real
                // textContent - this message is now purely a CSS-drawn
                // placeholder (module-editor.css's :empty:before) and is
                // never part of editor.innerHTML, so it can never be
                // saved as actual lesson content.
                outputBox.innerHTML = "";
                outputBox.setAttribute("placeholder", "Output will be automatically evaluated from code execution...");
                outputDesc.textContent = "Output is dynamically generated based on code execution.";
            } else {
                outputBox.contentEditable = "true";
                outputBox.style.background = "#ffffff";
                outputBox.style.color = "#374151";
                outputBox.innerHTML = "";
                outputBox.setAttribute("placeholder", "e.g. Hello, World!");
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
        const range = getInsertionRange();

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
            confirmAndRemoveBlock(wrapper);
        });

        range.deleteContents();
        range.insertNode(wrapper);

        const spacer = document.createElement("div");
        spacer.appendChild(document.createElement("br"));
        wrapper.parentNode.insertBefore(spacer, wrapper.nextSibling);
        
        placeCaretAtStart(spacer);
        pushHistory();
    }

    // --- Task #45: interactive block value sync (save) & rehydration (load) ---
    //
    // WHY THIS EXISTS: the code console / terminal blocks built by
    // insertCodeBlockTemplate()/insertTerminalBlockTemplate() above mix
    // two kinds of editable surfaces inside the SAME wrapper:
    //   - contenteditable <div>s (console box, output box, terminal box)
    //     - typed content DOES serialize into editor.innerHTML for free,
    //       since it's real DOM content.
    //   - real form controls (<input class="editor-code-filename">,
    //     <select class="editor-code-mode-select">,
    //     <select class="editor-output-mode-select">) - typing/selecting
    //     updates their live DOM .value, but that does NOT get reflected
    //     back into the `value=""` / `selected` HTML attributes, which is
    //     the only thing editor.innerHTML actually serializes for form
    //     controls. Left alone, every filename typed and every dropdown
    //     choice made would silently vanish the moment editor.innerHTML
    //     was captured into the hidden field and saved - the exact "drop
    //     secondary builder elements during database submission" failure
    //     Task #45 calls out.
    //
    // syncInteractiveBlockValues() fixes the write side: called right
    // before ANY capture of editor.innerHTML (both the real Publish
    // submit below, and Save Draft - see
    // upload-resource-draft-guard.js's performSaveDraft(), which calls
    // window.cobraByteSyncInteractiveBlocks() for the exact same reason
    // before its own fetch()), it copies each control's current live
    // value into the attribute that actually gets serialized.
    function syncInteractiveBlockValues() {
        editor.querySelectorAll(".editor-code-filename").forEach((input) => {
            input.setAttribute("value", input.value || "");
        });
        editor.querySelectorAll(".editor-code-mode-select, .editor-output-mode-select").forEach((select) => {
            Array.from(select.options).forEach((opt) => {
                if (opt.value === select.value) {
                    opt.setAttribute("selected", "selected");
                } else {
                    opt.removeAttribute("selected");
                }
            });
        });
    }
    // Exposed globally so upload-resource-draft-guard.js's Save Draft
    // flow can run the exact same fix before ITS OWN capture of
    // editor.innerHTML, instead of a second, divergent copy of this
    // logic.
    window.cobraByteSyncInteractiveBlocks = syncInteractiveBlockValues;

    // hydrateExistingInteractiveBlocks() is the read-side companion:
    // when a saved lesson's content_body (already-serialized HTML,
    // complete with the value="..."/selected fixes above) is reloaded
    // into #editorContent by the server (see admin_routes.py's
    // upload_resource() GET handler + upload-resource.html), the
    // restored <select> elements' change handlers and each block's
    // delete button are NOT wired up automatically - those listeners
    // only ever got attached at the moment a NEW block was inserted via
    // insertCodeBlockTemplate()/insertTerminalBlockTemplate() during
    // this same page session, never for markup that arrived already
    // sitting in the DOM on page load. Without this, a reloaded code
    // block's mode dropdown would LOOK right (selected value restored)
    // but silently do nothing when changed, and its delete button
    // wouldn't work either - exactly the "retrieved resource content
    // renders fully with all integrated functions ... intact"
    // requirement this task calls out.
    function wireDeleteButton(wrapper) {
        const btn = wrapper.querySelector(".editor-delete-block-btn");
        if (btn) {
            btn.addEventListener("click", function () {
                confirmAndRemoveBlock(wrapper);
            });
        }
    }

function wireCodeContainer(wrapper) {
    wireDeleteButton(wrapper);
    wireRunButton(wrapper);

    const outputBox = wrapper.querySelector(".editor-output-box");

    // Make output a read-only terminal
    if (outputBox) {
        outputBox.setAttribute("contenteditable", "false");
        outputBox.classList.add("editor-output-terminal");
    }

    // Remove legacy mode controls if they still exist
    const legacyModeSelect = wrapper.querySelector(".editor-code-mode-select");
    if (legacyModeSelect) {
        legacyModeSelect.remove();
    }

    const legacyOutputModeSelect = wrapper.querySelector(".editor-output-mode-select");
    if (legacyOutputModeSelect) {
        legacyOutputModeSelect.remove();
    }
}

    function wireTerminalContainer(wrapper) {
        wireDeleteButton(wrapper);
    }

    function hydrateExistingInteractiveBlocks() {
        editor.querySelectorAll(".editor-code-container").forEach(wireCodeContainer);
        editor.querySelectorAll(".editor-terminal-container").forEach(wireTerminalContainer);
    }
    hydrateExistingInteractiveBlocks();

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
        // Task #45: must run BEFORE reading editor.innerHTML, or every
        // filename/dropdown selection typed into a code block would be
        // silently dropped from what actually gets saved.
        syncInteractiveBlockValues();
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