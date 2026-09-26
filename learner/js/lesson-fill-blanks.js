/**
 * lesson-fill-blanks.js - Learner Fill in the Blanks (Cobra vs SyntaxBug)
 * ---------------------------------------------------------------
 * Self-contained game for the "Fill in the Blanks" activity type. It
 * does not use any of the Multiple Choice cobra-arena code; lesson-
 * activities.js just hands the activity over through
 * window.cobraByteRenderFillBlanks(activity, container, onActivityDone).
 *
 * Rules (all enforced server-side - see lesson_fill_blanks.py):
 *   - One FIB lives pool per learner, shared across all lessons (max 3,
 *     +1 every 5 minutes).
 *   - Wrong answer: -1 life and Try Again on the same item.
 *   - Correct answer: Cobra strikes SyntaxBug, next item.
 *   - 0 lives: the play pauses on its item; review the lesson and come
 *     back - it resumes the same play once a life is back.
 *   - Saved score = first-attempt correct count. No replay.
 *
 * Items come from GET /api/lesson-activities/fib-play (never includes
 * the correct answer); answers go to POST /api/lesson-activities/fib-answer.
 * The 3D stage (battle3d.js) is loaded only when this activity opens.
 */
(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:5000";

    // Folder this script was served from - battle3d.js (and
    // three.module.js) are loaded from the same folder.
    const FIB_JS_BASE = (document.currentScript && document.currentScript.src)
        ? new URL(".", document.currentScript.src).href
        : "";

    const FIB_BLANK_PATTERN = /\[?_{3,}\]?/;
    const FIB_TOKEN_PATTERN = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z0-9_'"#]+)/g;
    const FIB_KEYWORDS = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
        "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
        "return", "try", "while", "with", "yield"
    ]);
    const FIB_ANIM = { strike: 1500, foebite: 1300, death: 1700 };

    // ---------------- small helpers ----------------
    function el(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function fibClock(totalSeconds) {
        const s = Math.max(0, Math.ceil(totalSeconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    function fibHearts(lives, max) {
        let html = "";
        for (let i = 0; i < max; i++) {
            html += `<i class="${i < lives ? "fa-solid" : "fa-regular"} fa-heart"></i>`;
        }
        return html;
    }

    // The activities list has used both "la_id" and "activity_id" for the
    // same thing - accept either so this never calls ?la_id=undefined.
    function activityIdOf(activity) {
        const id = activity && (activity.la_id ?? activity.activity_id ?? activity.id);
        return id === undefined || id === null || id === "" ? null : id;
    }

    // Reads JSON safely: a missing route returns an HTML 404 page, which
    // would otherwise surface as a vague "Could not load" with no cause.
    async function readJson(response, what) {
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            data = null;
        }
        if (!data) {
            throw new Error(response.status === 404
                ? `The Fill in the Blanks API was not found (HTTP 404 on ${what}). Check that learner_fib_routes.py is registered in login.py and restart Flask.`
                : `The server sent an unexpected response (HTTP ${response.status} on ${what}).`);
        }
        return data;
    }

    async function fetchPlay(laId) {
        if (laId === null) throw new Error("This activity has no id in the activities list (la_id / activity_id is missing).");
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/fib-play?la_id=${encodeURIComponent(laId)}`, {
            credentials: "include"
        });
        const data = await readJson(response, "fib-play");
        if (!response.ok || !data.success) throw new Error(data.message || `Request failed (HTTP ${response.status}).`);
        return data;
    }

    async function postAnswer(payload) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/fib-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        return readJson(response, "fib-answer");
    }

    // Appends syntax-coloured spans for one line of code. textContent only -
    // content comes from the database and is never parsed as HTML.
    function highlightInto(parent, text) {
        let last = 0;
        FIB_TOKEN_PATTERN.lastIndex = 0;
        let m;
        while ((m = FIB_TOKEN_PATTERN.exec(text)) !== null) {
            if (m[0] === "") { FIB_TOKEN_PATTERN.lastIndex += 1; continue; }
            if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
            let cls = "";
            if (m[1]) cls = "tok-cmt";
            else if (m[2]) cls = "tok-str";
            else if (m[3]) cls = "tok-num";
            else if (m[4]) {
                if (FIB_KEYWORDS.has(m[4])) cls = "tok-kw";
                else if (text.charAt(m.index + m[4].length) === "(") cls = "tok-fn";
            }
            if (cls) {
                const span = el("span", cls);
                span.textContent = m[0];
                parent.appendChild(span);
            } else {
                parent.appendChild(document.createTextNode(m[0]));
            }
            last = m.index + m[0].length;
        }
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    }

    // ---------------- the activity ----------------
    function renderFillBlanks(activity, container, onActivityDone) {
        container.innerHTML = "";
        const root = el("div", "fib-root");
        root.innerHTML = `
            <header class="fib-topbar">
                <div class="fib-brand">
                    <span class="fib-brand-icon"><i class="fa-solid fa-code"></i></span>
                    <div>
                        <span class="fib-brand-eyebrow">Activity · Fill in the Blanks</span>
                        <h3 class="fib-brand-title" data-f="title"></h3>
                    </div>
                </div>
                <div class="fib-stats">
                    <div class="fib-stat is-score" data-f="scoreStat"><b data-f="score">0</b><i>Score</i></div>
                    <div class="fib-stat"><b data-f="progress">-</b><i>Puzzle</i></div>
                    <div class="fib-stat"><b data-f="streak">0</b><i>Streak</i></div>
                    <div class="fib-stat is-lives" data-f="livesStat"><b data-f="lives"></b><i data-f="livesLabel">Lives</i></div>
                </div>
            </header>
            <div class="fib-play">
                <section class="fib-stage" data-f="stage">
                    <canvas class="fib-canvas" data-f="canvas"></canvas>
                    <div class="fib-hpbar is-hero">
                        <span class="fib-hpbar-name">Cobra · your debugger</span>
                        <div class="fib-hpbar-track" data-f="heroTrack"></div>
                    </div>
                    <div class="fib-hpbar is-foe">
                        <span class="fib-hpbar-name">SyntaxBug</span>
                        <div class="fib-hpbar-track" data-f="foeTrack"></div>
                    </div>
                    <p class="fib-stage-hint">Drag the arena to look around · double-click to reset</p>
                </section>
                <section class="fib-board">
                    <div class="fib-board-head">
                        <span class="fib-chip" data-f="qmeta"></span>
                        <span class="fib-chip is-muted" data-f="modeChip"></span>
                    </div>
                    <p class="fib-instruction" data-f="instruction" hidden></p>
                    <div class="fib-code" data-f="code"></div>
                    <div class="fib-tray-head" data-f="trayHead">
                        <h4>Choices</h4>
                        <span class="fib-keyhint">Click or drag a tile into the blank · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Backspace</kbd> clear · <kbd>Enter</kbd> check</span>
                    </div>
                    <div class="fib-tray" data-f="tray"></div>
                    <div class="fib-controls" data-f="controls">
                        <button type="button" class="fib-primary-btn" data-f="checkBtn" disabled><i class="fa-solid fa-check"></i> Check answer</button>
                        <button type="button" class="fib-ghost-btn" data-f="clearBtn"><i class="fa-solid fa-eraser"></i> Clear</button>
                    </div>
                    <div class="fib-feedback" data-f="feedback" hidden>
                        <div class="fib-feedback-body">
                            <b class="fib-feedback-title" data-f="fbTitle"></b>
                            <p class="fib-feedback-text" data-f="fbText"></p>
                        </div>
                        <button type="button" class="fib-primary-btn" data-f="nextBtn" hidden>Next puzzle</button>
                    </div>
                </section>
                <div class="fib-overlay" data-f="overlay" hidden></div>
            </div>
        `;
        container.appendChild(root);

        const ui = {};
        root.querySelectorAll("[data-f]").forEach((node) => { ui[node.dataset.f] = node; });
        ui.title.textContent = activity.activity_title || "";
        const laId = activityIdOf(activity);

        // ---- state ----
        let items = [];
        let total = 0;
        let server = null;          // last state the server sent
        let mode = "loading";       // loading | ready | playing | busy | review | cooldown | done | error
        let booted = false;
        let disposed = false;
        let stage3d = null;         // battle3d.js api, null when WebGL/Three is unavailable
        let qIndex = 0;
        let score = 0, streak = 0, bestStreak = 0;
        let placedChoice = null;    // index into the current item's choices
        let wrongChoices = new Set(); // tiles already tried (wrong) on this item, this session
        let slotEl = null, slotInput = null;
        let rafId = null, countdownTimer = null, refreshing = false;
        const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;

        // battle animation state (display only - the server owns the real numbers)
        const bt = {
            foeMax: 1, foeHP: 1, heroMax: 3, heroHP: 3,
            anim: null, hitDone: false, shake: 0, flashFoe: 0, flashHero: 0,
            defeated: false, heroDown: false, t: 0, lastTs: 0
        };

        function currentItem() { return items[qIndex]; }
        function isTyping() { return !(currentItem().choices && currentItem().choices.length); }

        // ---- HUD ----
        function setMode(next) {
            mode = next;
            root.dataset.mode = next;
            updateControls();
        }

        function applyState(state) {
            server = state;
            updateHUD();
        }

        function updateHUD() {
            ui.score.textContent = score;
            ui.progress.textContent = total ? `${Math.min(qIndex + 1, total)}/${total}` : "-";
            ui.streak.textContent = streak;
            const lives = server ? server.lives : 3;
            const max = server ? server.max_lives : 3;
            ui.lives.innerHTML = fibHearts(lives, max);
            ui.livesLabel.textContent = (server && lives < max && server.seconds_to_next_life > 0)
                ? `Lives · ${fibClock(server.seconds_to_next_life)}`
                : "Lives";
        }

        function bump(node) {
            node.classList.remove("bump");
            void node.offsetWidth;
            node.classList.add("bump");
        }

        function drawBars() {
            [[ui.foeTrack, bt.foeMax, bt.foeHP], [ui.heroTrack, bt.heroMax, bt.heroHP]].forEach(([track, max, hp]) => {
                track.innerHTML = "";
                for (let i = 0; i < max; i++) track.appendChild(el("i", i < hp ? "is-on" : ""));
            });
        }

        // ---- overlay (only static markup + numbers go through innerHTML) ----
        function showOverlay(html) {
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
        }

        function hideOverlay() {
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
        }

        function showReady(restored) {
            setMode("ready");
            const title = restored ? "A life is back"
                : (server && server.solved_count > 0) ? "Pick up where you left off"
                : "Forge the missing code";
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid ${restored ? "fa-heart" : "fa-code"} fib-overlay-icon"></i>
                    <h4>${title}</h4>
                    <p>Each puzzle hides part of a Python line. Fill the blank and Cobra strikes SyntaxBug. A wrong answer lets the bug bite back and costs a life, then you try again.</p>
                    <div class="fib-keys"><kbd>1–9 pick a tile</kbd><kbd>Backspace clear</kbd><kbd>Enter check</kbd></div>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="startBtn">${(server && server.solved_count > 0) || restored ? "Resume" : "Start activity"}</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="startBtn"]').addEventListener("click", () => {
                hideOverlay();
                setMode("playing");
                if (slotInput) slotInput.focus({ preventScroll: true });
            });
        }

        function enterCooldown() {
            setMode("cooldown");
            bt.heroDown = true;
            const max = server ? server.max_lives : 3;
            showOverlay(`
                <div class="fib-overlay-card">
                    <div class="fib-overlay-hearts">${fibHearts(0, max)}</div>
                    <div class="fib-countdown" data-f="countdown">${fibClock(server ? server.seconds_to_next_life : 0)}</div>
                    <p>until your next life. You'll resume at puzzle ${qIndex + 1}. Review the lesson while you wait. Your progress is saved.</p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="reviewBtn"><i class="fa-solid fa-book-open"></i> Review lesson</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="reviewBtn"]').addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("cobrabyte:review-lesson"));
            });
        }

        function finish() {
            setMode("done");
            const firstTry = server ? server.first_try_correct : 0;
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-trophy fib-overlay-icon"></i>
                    <h4>SyntaxBug defeated</h4>
                    <div class="fib-results">
                        <div><b>${firstTry}/${total}</b><span>First try</span></div>
                        <div><b>${bestStreak}</b><span>Best streak</span></div>
                        <div><b>${score}</b><span>Score</span></div>
                    </div>
                    <p class="fib-saved-note">Saved to your progress: ${firstTry} correct on the first try</p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="continueBtn">Continue</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="continueBtn"]').addEventListener("click", () => {
                dispose();
                onActivityDone();
            });
        }

        function showError(message) {
            setMode("error");
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-triangle-exclamation fib-overlay-icon is-warn"></i>
                    <h4>Something went wrong</h4>
                    <p data-f="errorText"></p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="retryBtn">Try again</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="errorText"]').textContent =
                message || "Could not reach the server. Your progress is saved.";
            ui.overlay.querySelector('[data-f="retryBtn"]').addEventListener("click", async () => {
                if (!booted) { boot(); return; }
                try {
                    const play = await fetchPlay(laId);
                    applyState(play.state);
                } catch (err) {
                    const text = ui.overlay.querySelector('[data-f="errorText"]');
                    if (text) text.textContent = `Still failing: ${err.message}`;
                    return;
                }
                if (!disposed) resyncFromState();
            });
        }

        // ---- puzzle board ----
        function loadItem() {
            const item = currentItem();
            placedChoice = null;
            wrongChoices = new Set();
            slotEl = null;
            slotInput = null;

            ui.qmeta.textContent = `Puzzle ${qIndex + 1} of ${total}`;
            ui.modeChip.textContent = isTyping() ? "Type the answer" : "Pick a tile";
            ui.instruction.textContent = item.instruction || "";
            ui.instruction.hidden = !item.instruction;
            hideFeedback();
            ui.trayHead.hidden = isTyping();
            ui.tray.hidden = isTyping();

            renderCode();
            renderTray();
            updateHUD();
            updateControls();
        }

        function buildSlot() {
            const slot = el("span", "fib-slot");
            if (isTyping()) {
                slot.classList.add("is-input");
                const input = el("input", "fib-slot-input");
                input.type = "text";
                input.autocomplete = "off";
                input.spellcheck = false;
                input.size = 8;
                input.setAttribute("aria-label", "Your answer for the blank");
                input.addEventListener("input", () => {
                    input.size = Math.max(8, input.value.length + 1);
                    slot.classList.remove("is-wrong");
                    updateControls();
                });
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (mode === "playing") submitAnswer();
                        else if (mode === "review") advance();
                    }
                });
                slot.appendChild(input);
                slotInput = input;
            } else {
                slot.tabIndex = 0;
                slot.setAttribute("role", "button");
                slot.addEventListener("click", () => { if (mode === "playing") clearSlot(); });
                slot.addEventListener("dragover", (e) => {
                    if (mode !== "playing") return;
                    e.preventDefault();
                    slot.classList.add("is-over");
                });
                slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
                slot.addEventListener("drop", (e) => {
                    e.preventDefault();
                    slot.classList.remove("is-over");
                    const idx = Number(e.dataTransfer.getData("text/plain"));
                    if (mode === "playing" && !Number.isNaN(idx)) placeChoice(idx);
                });
            }
            slotEl = slot;
            paintSlot();
            return slot;
        }

        function paintSlot() {
            if (!slotEl || isTyping()) return;
            const choices = currentItem().choices;
            slotEl.textContent = placedChoice === null ? "?" : choices[placedChoice];
            slotEl.classList.toggle("is-filled", placedChoice !== null);
            slotEl.setAttribute("aria-label", placedChoice === null ? "Empty blank" : `Blank filled with ${choices[placedChoice]}. Click to clear.`);
        }

        function renderCode() {
            const content = String(currentItem().content || "").replace(/\r\n?/g, "\n");
            const lines = content.split("\n");
            const blankLine = lines.findIndex((line) => FIB_BLANK_PATTERN.test(line));
            ui.code.innerHTML = "";

            lines.forEach((line, i) => {
                const row = el("div", "fib-code-row");
                const ln = el("span", "fib-ln");
                ln.textContent = i + 1;
                const body = el("span", "fib-code-line");
                if (i === blankLine) {
                    const m = line.match(FIB_BLANK_PATTERN);
                    highlightInto(body, line.slice(0, m.index));
                    body.appendChild(buildSlot());
                    highlightInto(body, line.slice(m.index + m[0].length));
                } else {
                    highlightInto(body, line);
                }
                row.appendChild(ln);
                row.appendChild(body);
                ui.code.appendChild(row);
            });

            // No blank marker in the content: the answer goes on its own line.
            if (blankLine === -1) {
                const row = el("div", "fib-code-row");
                const ln = el("span", "fib-ln");
                ln.textContent = lines.length + 1;
                const body = el("span", "fib-code-line");
                body.appendChild(buildSlot());
                row.appendChild(ln);
                row.appendChild(body);
                ui.code.appendChild(row);
            }
        }

        function renderTray() {
            ui.tray.innerHTML = "";
            if (isTyping()) return;
            currentItem().choices.forEach((choice, i) => {
                const tile = el("button", "fib-tile");
                tile.type = "button";
                tile.draggable = true;
                tile.dataset.index = i;
                const key = el("span", "fib-tile-key");
                key.textContent = i < 9 ? i + 1 : "";
                const text = el("code", "fib-tile-text");
                text.textContent = choice;
                tile.appendChild(key);
                tile.appendChild(text);
                tile.addEventListener("click", () => { if (mode === "playing") placeChoice(i); });
                tile.addEventListener("dragstart", (e) => {
                    if (mode !== "playing" || wrongChoices.has(i)) { e.preventDefault(); return; }
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.effectAllowed = "move";
                    tile.classList.add("is-dragging");
                });
                tile.addEventListener("dragend", () => tile.classList.remove("is-dragging"));
                ui.tray.appendChild(tile);
            });
            paintTray();
        }

        function paintTray() {
            ui.tray.querySelectorAll(".fib-tile").forEach((tile) => {
                const idx = Number(tile.dataset.index);
                tile.classList.toggle("is-used", idx === placedChoice);
                tile.classList.toggle("is-wrong", wrongChoices.has(idx));
                tile.disabled = mode !== "playing" || wrongChoices.has(idx);
            });
        }

        function placeChoice(i) {
            if (!currentItem().choices || i < 0 || i >= currentItem().choices.length || wrongChoices.has(i)) return;
            placedChoice = i;
            if (slotEl) slotEl.classList.remove("is-wrong");
            paintSlot();
            paintTray();
            updateControls();
        }

        function clearSlot() {
            if (slotInput) {
                slotInput.value = "";
                slotInput.size = 8;
                slotInput.focus({ preventScroll: true });
            } else {
                placedChoice = null;
                paintSlot();
                paintTray();
            }
            if (slotEl) slotEl.classList.remove("is-wrong");
            updateControls();
        }

        function currentAnswer() {
            if (slotInput) return slotInput.value.trim();
            return placedChoice === null ? "" : currentItem().choices[placedChoice];
        }

        function updateControls() {
            const playing = mode === "playing";
            const hasAnswer = items.length > 0 && !!currentAnswer();
            ui.checkBtn.disabled = !playing || !hasAnswer;
            ui.clearBtn.disabled = !playing || !hasAnswer;
            ui.controls.hidden = mode === "review";
            if (slotInput) slotInput.disabled = !playing;
            paintTray();
        }

        function hideFeedback() {
            ui.feedback.hidden = true;
            ui.nextBtn.hidden = true;
        }

        function showFeedback(result) {
            ui.feedback.hidden = false;
            ui.feedback.classList.toggle("is-correct", !!result.is_correct);
            ui.feedback.classList.toggle("is-incorrect", !result.is_correct);
            ui.fbTitle.textContent = result.is_correct ? "Correct!"
                : result.is_close ? "Almost there" : "Not quite";
            ui.fbText.textContent = result.is_correct
                ? (result.feedback || "")
                : `${result.feedback || ""} SyntaxBug bites back (−1 life).`.trim();
            ui.nextBtn.hidden = !result.is_correct;
            ui.nextBtn.textContent = server.completed ? "See results" : "Next puzzle";
        }

        // ---- answering ----
        async function submitAnswer() {
            const answer = currentAnswer();
            if (mode !== "playing" || !answer) return;
            setMode("busy");
            const item = currentItem();
            const triedChoice = placedChoice;

            let result = null;
            try {
                result = await postAnswer({ la_id: laId, fib_id: item.fib_id, answer: answer });
            } catch (err) {
                result = { success: false, message: err.message };
            }
            if (disposed) return;
            if (!result || !result.success) {
                showError(result && result.message);
                return;
            }

            applyState(result.state);
            if (!result.graded) {
                // Out of lives or on a different item than the server - resync.
                resyncFromState();
                return;
            }

            showFeedback(result);
            if (result.is_correct) {
                if (slotEl) slotEl.classList.add("is-right");
                streak += 1;
                bestStreak = Math.max(bestStreak, streak);
                score += (result.first_try ? 100 : 50) + streak * 20;
                bump(ui.scoreStat);
                heroStrike();
                updateHUD();
                setMode("review");
                ui.nextBtn.focus({ preventScroll: true });
                return;
            }

            // Wrong: stay on this item (Try Again).
            streak = 0;
            bump(ui.livesStat);
            foeStrike();
            if (slotEl) slotEl.classList.add("is-wrong");
            if (triedChoice !== null) {
                wrongChoices.add(triedChoice);
                placedChoice = null;
                paintSlot();
            }
            updateHUD();
            if (server.lives <= 0) {
                setTimeout(() => { if (!disposed) enterCooldown(); }, FIB_ANIM.foebite);
                setMode("busy");
            } else {
                setMode("playing");
                if (slotInput) slotInput.select();
            }
        }

        function advance() {
            if (mode !== "review") return;
            if (server.completed) {
                if (bt.anim && bt.anim.name === "death") {
                    setMode("busy");
                    setTimeout(() => { if (!disposed) finish(); }, FIB_ANIM.death);
                } else {
                    finish();
                }
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            setMode("playing");
            loadItem();
            if (server.lives <= 0) enterCooldown();
        }

        function resyncFromState() {
            hideOverlay();
            bt.foeMax = Math.max(1, total);
            bt.foeHP = Math.max(0, total - server.solved_count);
            bt.heroMax = server.max_lives;
            bt.heroHP = server.lives;
            bt.heroDown = server.lives <= 0;
            bt.defeated = bt.foeHP === 0;
            drawBars();
            if (server.completed) {
                finish();
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            setMode("ready");
            loadItem();
            if (server.lives <= 0) enterCooldown();
            else showReady(false);
        }

        async function refreshState() {
            if (refreshing) return;
            refreshing = true;
            try {
                const play = await fetchPlay(laId);
                if (disposed) return;
                applyState(play.state);
                bt.heroHP = play.state.lives;
                bt.heroDown = play.state.lives <= 0;
                drawBars();
                if (mode === "cooldown" && play.state.lives > 0) showReady(true);
            } catch (err) {
                if (server) server.seconds_to_next_life = 5; // retry shortly
            } finally {
                refreshing = false;
            }
        }

        function tick() {
            if (!server || server.lives >= server.max_lives || server.completed) return;
            server.seconds_to_next_life = Math.max(0, server.seconds_to_next_life - 1);
            updateHUD();
            const countdown = ui.overlay.querySelector('[data-f="countdown"]');
            if (countdown) countdown.textContent = fibClock(server.seconds_to_next_life);
            if (server.seconds_to_next_life <= 0) refreshState();
        }

        // ---- battle stage ----
        function playAnim(name, onImpact, onEnd) {
            bt.anim = { name, dur: FIB_ANIM[name], t: 0, startTs: performance.now(), onImpact, onEnd };
            bt.hitDone = false;
        }

        function heroStrike() {
            playAnim("strike", () => {
                bt.foeHP = Math.max(0, bt.foeHP - 1);
                bt.flashFoe = 1;
                bt.shake = 16;
                if (stage3d) {
                    stage3d.float("foe", "-1 HP", "#dc2626");
                    stage3d.burst("foe", "#f87171", 26);
                }
                drawBars();
                if (bt.foeHP === 0) {
                    setTimeout(() => {
                        if (!disposed) playAnim("death", null, () => { bt.defeated = true; });
                    }, 380);
                }
            });
        }

        function foeStrike() {
            playAnim("foebite", () => {
                bt.heroHP = server ? server.lives : Math.max(0, bt.heroHP - 1);
                bt.flashHero = 1;
                bt.shake = 14;
                if (stage3d) {
                    stage3d.float("hero", "-1 life", "#dc2626");
                    stage3d.burst("hero", "#16a34a", 18);
                }
                drawBars();
                if (bt.heroHP <= 0) bt.heroDown = true;
            });
        }

        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
        function easeIn(t) { return t * t; }

        function heroLunge() {
            if (!bt.anim) return 0;
            const p = bt.anim.t / bt.anim.dur;
            if (bt.anim.name === "strike") {
                if (p < 0.22) return -0.22 * easeOut(p / 0.22);
                if (p < 0.42) return easeIn((p - 0.22) / 0.20);
                if (p < 0.62) return 1;
                return 1 - easeOut((p - 0.62) / 0.38);
            }
            if (bt.anim.name === "foebite" && p > 0.36 && p < 0.66) return -0.18;
            return 0;
        }

        function foeLunge() {
            if (!bt.anim || bt.anim.name !== "foebite") return 0;
            const p = bt.anim.t / bt.anim.dur;
            if (p < 0.24) return -0.15 * easeOut(p / 0.24);
            if (p < 0.42) return easeIn((p - 0.24) / 0.18);
            if (p < 0.58) return 1;
            return 1 - easeOut((p - 0.58) / 0.42);
        }

        function loop(ts) {
            if (disposed) return;
            rafId = requestAnimationFrame(loop);
            const dt = Math.min((ts - bt.lastTs) / 1000, 0.12) || 0;
            bt.lastTs = ts;
            bt.t += dt;
            if (bt.anim) {
                bt.anim.t = performance.now() - bt.anim.startTs;
                const p = bt.anim.t / bt.anim.dur;
                if (!bt.hitDone && p >= 0.42 && bt.anim.onImpact) { bt.hitDone = true; bt.anim.onImpact(); }
                if (p >= 1) { const end = bt.anim.onEnd; bt.anim = null; if (end) end(); }
            }
            bt.shake = Math.max(0, bt.shake - dt * 40);
            bt.flashFoe = Math.max(0, bt.flashFoe - dt * 2.4);
            bt.flashHero = Math.max(0, bt.flashHero - dt * 2.4);

            if (!stage3d || root.offsetParent === null) return; // hidden: skip the GPU work
            stage3d.render({
                t: bt.t,
                heroLunge: heroLunge(),
                foeLunge: foeLunge(),
                heroFlash: bt.flashHero,
                foeFlash: bt.flashFoe,
                shake: bt.shake * 0.02,
                hp01: bt.foeMax ? bt.foeHP / bt.foeMax : 0,
                critical: bt.foeMax > 1 && bt.foeHP === 1,
                dying: bt.anim && bt.anim.name === "death" ? bt.anim.t / bt.anim.dur : 0,
                dead: bt.defeated,
                heroDown: bt.heroDown,
                status: bt.defeated ? "bug fixed \u2713" : ""
            });
        }

        // ---- input + lifecycle ----
        function onKeyDown(e) {
            if (disposed || !items.length || root.offsetParent === null) return;
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if (target && target.closest && target.closest("button") && e.key === "Enter") return; // let the focused button handle it

            if (mode === "playing" && !isTyping() && /^[1-9]$/.test(e.key)) {
                const idx = Number(e.key) - 1;
                if (idx < currentItem().choices.length) {
                    e.preventDefault();
                    placeChoice(idx);
                }
            } else if (mode === "playing" && e.key === "Backspace" && !isTyping()) {
                e.preventDefault();
                clearSlot();
            } else if (e.key === "Enter") {
                if (mode === "playing" && currentAnswer()) { e.preventDefault(); submitAnswer(); }
                else if (mode === "review") { e.preventDefault(); advance(); }
            }
        }

        function onVisibility() {
            if (!document.hidden && server && server.lives < server.max_lives) {
                refreshState(); // timers are throttled in background tabs
            }
        }

        function onResize() {
            if (!disposed && stage3d) stage3d.resize();
        }

        function dispose() {
            if (disposed) return;
            disposed = true;
            cancelAnimationFrame(rafId);
            clearInterval(countdownTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.disconnect();
            if (stage3d && stage3d.dispose) stage3d.dispose();
            stage3d = null;
        }

        ui.checkBtn.addEventListener("click", submitAnswer);
        ui.clearBtn.addEventListener("click", () => { if (mode === "playing") clearSlot(); });
        ui.nextBtn.addEventListener("click", advance);

        // ---- boot ----
        async function boot() {
            setMode("loading");
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin fib-overlay-icon"></i>
                    <p>Loading activity...</p>
                </div>
            `);

            let play;
            try {
                play = await fetchPlay(laId);
            } catch (err) {
                console.error("Error loading fill-in-the-blanks activity:", err);
                if (!disposed) showError(`Could not load this activity. ${err.message || ""}`.trim());
                return;
            }
            if (disposed) return;

            items = play.items || [];
            total = items.length;
            if (total === 0) {
                dispose();
                onActivityDone();
                return;
            }
            applyState(play.state);
            score = play.state.first_try_correct * 100
                + Math.max(0, play.state.solved_count - play.state.first_try_correct) * 50;

            try {
                const mod = await import(FIB_JS_BASE + "battle3d.js");
                if (disposed) return;
                stage3d = mod.createBattle(ui.canvas);
            } catch (err) {
                console.warn("Battle stage unavailable, showing the board only:", err);
                stage3d = null;
                root.classList.add("fib-no-3d");
            }
            if (disposed) return;

            booted = true;
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.observe(ui.stage);
            countdownTimer = setInterval(tick, 1000);
            rafId = requestAnimationFrame(loop);

            resyncFromState();
        }

        boot();
    }

    window.cobraByteRenderFillBlanks = renderFillBlanks;
})();