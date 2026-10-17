/**
 * tour.js - first-time user tour (feat/welcome-tour)
 * ---------------------------------------------------------------------------
 * Small popups that point at the real parts of the page. Each part shows
 * ONCE per learner (saved on the server, /api/tour - learner_tour.py):
 *
 *   welcome  Dashboard -> Learning Map -> Lessons page (first login).
 *            "Next" on the last popup of a page goes to the next page and
 *            the tour carries on there.
 *   lesson   the first time a lesson opens
 *   game     the first time a game's "Ready to play?" card shows
 *            (game-kit.js calls CobraTour.auto('game', { target: card }))
 *   sandbox  the first time the Coding Sandbox opens
 *
 * Every popup has Back / Next and "Skip tour". Skipping a part is final for
 * that part only. "Take the tour" in the profile menu (learner.js) replays
 * the part for the page the learner is on (a replay never saves anything);
 * pages without a tour send it to /dashboard?tour=1.
 *
 * While a page is still loading its data, the popup shows a spinner and what
 * it is waiting for (after 6 s: "your connection may be slow" + Skip this
 * step), never just a dimmed screen.
 *
 * Loaded on: dashboard, learning-map, lessons, lesson-content, sandbox.
 * Styles: learner/css/tour.css
 */
(function () {
    'use strict';

    const CONTINUE_KEY = 'cobraTourContinue';   // sessionStorage: 'map' | 'lessons' (welcome tour going to the next page)
    const REPLAY_KEY = 'cobraTourReplay';       // sessionStorage: '1' while a "?" replay walks across pages
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const PAGE = {
        '/dashboard': 'dashboard',
        '/learning-map': 'map',
        '/lessons': 'lessons',
        '/lesson-content': 'lesson',
        '/sandbox': 'sandbox',
    }[path] || null;

    let state = null;          // { seen: {key: status}, pass_percent }
    let statePromise = null;
    let active = null;         // the running tour (one at a time)

    // ---------------- small helpers ----------------
    function ss(key, value) {
        try {
            if (value === undefined) return window.sessionStorage.getItem(key);
            if (value === null) window.sessionStorage.removeItem(key);
            else window.sessionStorage.setItem(key, value);
        } catch (e) { /* private mode: the tour just doesn't carry over to the next page */ }
        return null;
    }

    function visible(el) {
        if (!el || !el.isConnected) return false;
        if (el.closest('[hidden]')) return false;
        const rects = el.getClientRects();
        if (!rects.length) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function resolve(target) {
        if (!target) return null;
        if (typeof target === 'function') return resolve(target());
        if (typeof target === 'string') {
            const list = document.querySelectorAll(target);
            for (const el of list) if (visible(el)) return el;
            return null;
        }
        return visible(target) ? target : null;
    }

    // Waits (up to ms) until the target is on screen - pages fill in after
    // their fetch. stop() true = give up now (Skip this step / tour ended).
    function waitFor(target, ms, stop) {
        return new Promise((done) => {
            const found = resolve(target);
            if (found || !target) { done(found); return; }
            const started = Date.now();
            const timer = setInterval(() => {
                const el = resolve(target);
                if (el || Date.now() - started > ms || (stop && stop())) {
                    clearInterval(timer);
                    done(el);
                }
            }, 150);
        });
    }

    function loadState() {
        if (statePromise) return statePromise;
        statePromise = fetch('/api/tour', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                state = data && data.success ? data : null;
                return state;
            })
            .catch(() => null);
        return statePromise;
    }

    function save(key, status) {
        if (state && state.seen && state.seen[key] !== 'finished') state.seen[key] = status;
        const body = new URLSearchParams({ status });
        return fetch(`/api/tour/${encodeURIComponent(key)}`, { method: 'POST', credentials: 'include', body })
            .catch(() => { /* not saved: the part simply shows again next time */ });
    }

    function pass() {
        return (state && state.pass_percent) || 80;
    }

    // ---------------- the popup ----------------
    let overlay, spot, card, titleEl, textEl, countEl, backBtn, nextBtn, skipBtn;
    let loadingEl, loadingText, stepSkipBtn;

    const SHOW_LOADING_AFTER = 400;   // ms - shorter waits show nothing (no flicker)
    const SLOW_AFTER = 6000;          // ms - then say the connection may be slow
    const SLOW_TEXT = 'This is taking a while - your connection may be slow.';

    function build() {
        overlay = document.createElement('div');
        overlay.className = 'tour-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="tour-spot" data-t="spot"></div>
            <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
                <div class="tour-card-top">
                    <span class="tour-count" data-t="count"></span>
                    <button type="button" class="tour-skip" data-t="skip">Skip tour</button>
                </div>
                <h3 class="tour-title" id="tourTitle" data-t="title"></h3>
                <p class="tour-text" id="tourText" data-t="text"></p>
                <div class="tour-loading" data-t="loading" role="status" aria-live="polite" hidden>
                    <span class="tour-spinner" aria-hidden="true"></span>
                    <span data-t="loadingText"></span>
                </div>
                <div class="tour-actions">
                    <button type="button" class="tour-btn tour-btn-secondary" data-t="stepskip" hidden>Skip this step</button>
                    <button type="button" class="tour-btn tour-btn-secondary" data-t="back">Back</button>
                    <button type="button" class="tour-btn tour-btn-primary" data-t="next">Next</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        spot = overlay.querySelector('[data-t="spot"]');
        card = overlay.querySelector('.tour-card');
        titleEl = overlay.querySelector('[data-t="title"]');
        textEl = overlay.querySelector('[data-t="text"]');
        countEl = overlay.querySelector('[data-t="count"]');
        backBtn = overlay.querySelector('[data-t="back"]');
        nextBtn = overlay.querySelector('[data-t="next"]');
        skipBtn = overlay.querySelector('[data-t="skip"]');
        loadingEl = overlay.querySelector('[data-t="loading"]');
        loadingText = overlay.querySelector('[data-t="loadingText"]');
        stepSkipBtn = overlay.querySelector('[data-t="stepskip"]');

        backBtn.addEventListener('click', () => active && !active.waiting && go(active.index - 1));
        nextBtn.addEventListener('click', () => active && !active.waiting && go(active.index + 1));
        stepSkipBtn.addEventListener('click', () => { if (active) active.giveUp = true; });
        skipBtn.addEventListener('click', () => active && end('skipped'));
        document.addEventListener('keydown', (e) => {
            if (!active) return;
            if (e.key === 'Escape') { e.preventDefault(); end('skipped'); }
            else if (active.waiting) return;
            else if (e.key === 'ArrowRight') go(active.index + 1);
            else if (e.key === 'ArrowLeft' && active.index > 0) go(active.index - 1);
        });
        // Clicks on the dark area do nothing: the learner closes the tour with
        // Skip, so a stray tap can't end it by accident.
        const reflow = () => active && !active.waiting && place();
        window.addEventListener('resize', reflow);
        window.addEventListener('scroll', reflow, { passive: true });
    }

    function place() {
        const step = active.steps[active.index];
        const el = step.el;
        const mobile = window.matchMedia('(max-width: 600px)').matches;
        card.classList.toggle('is-center', !el);
        if (!el) {
            spot.hidden = true;
            card.style.top = card.style.left = '';
            return;
        }
        const pad = 8;
        const r = el.getBoundingClientRect();
        spot.hidden = false;
        spot.style.top = `${r.top - pad}px`;
        spot.style.left = `${r.left - pad}px`;
        spot.style.width = `${r.width + pad * 2}px`;
        spot.style.height = `${r.height + pad * 2}px`;
        if (mobile) {   // phones: the card sits at the top or bottom edge, away from the target
            const targetLow = r.top + r.height / 2 > window.innerHeight / 2;
            card.classList.toggle('is-top', targetLow);
            card.style.top = card.style.left = '';
            return;
        }
        card.classList.remove('is-top');
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const gap = 14;
        const fitsBelow = r.bottom + pad + gap + ch <= window.innerHeight - 12;
        const fitsAbove = r.top - pad - gap - ch >= 12;
        if (!fitsBelow && !fitsAbove && !step.pinnedTop && r.top > pad + 12) {
            // Short screen (e.g. a phone held sideways): bring the target to the
            // top so the card fits under it instead of covering it.
            step.pinnedTop = true;
            window.scrollBy({ top: r.top - pad - 12, behavior: 'auto' });
            return;   // the scroll event places it again
        }
        let top = r.bottom + pad + gap;
        if (!fitsBelow && fitsAbove) top = r.top - pad - gap - ch;
        top = Math.max(12, Math.min(top, window.innerHeight - ch - 12));
        let left = r.left + r.width / 2 - cw / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - cw - 12));
        card.style.top = `${top}px`;
        card.style.left = `${left}px`;
    }

    // Waiting state: a spinner and what is happening, instead of an empty
    // dimmed screen. "Skip tour" stays; "Skip this step" shows once it's slow.
    function showLoading(message, allowStepSkip) {
        card.classList.remove('is-pending');
        card.classList.add('is-loading', 'is-center');
        card.style.top = card.style.left = '';
        spot.hidden = true;
        titleEl.textContent = 'Just a moment...';
        textEl.textContent = '';
        countEl.textContent = '';
        loadingText.textContent = message;
        loadingEl.hidden = false;
        backBtn.hidden = true;
        nextBtn.hidden = true;
        stepSkipBtn.hidden = true;
        clearTimeout(showLoading.slowTimer);
        showLoading.slowTimer = setTimeout(() => {
            if (loadingEl.hidden) return;
            loadingText.textContent = `${message} ${SLOW_TEXT}`;
            stepSkipBtn.hidden = !allowStepSkip;
        }, SLOW_AFTER);
    }

    function hideLoading() {
        clearTimeout(showLoading.slowTimer);
        card.classList.remove('is-loading');
        loadingEl.hidden = true;
        stepSkipBtn.hidden = true;
        nextBtn.hidden = false;
    }

    async function go(index) {
        if (!active) return;
        const tour = active;
        if (index < 0) return;
        if (index >= tour.steps.length) { end('finished'); return; }
        const step = tour.steps[index];
        // A step whose target isn't on this page (e.g. no Skip card) is passed
        // over. While the page is still loading its data, say so.
        tour.waiting = true;
        tour.giveUp = false;
        // Right after the tour opens there is nothing on screen yet, so say what
        // it is waiting for at once; between steps, only after a short wait.
        const firstShow = card.classList.contains('is-pending');
        const loadingTimer = step.target && !resolve(step.target)
            ? setTimeout(() => active === tour && showLoading(step.loading || 'Getting the next step ready...', true),
                         firstShow ? 0 : SHOW_LOADING_AFTER)
            : null;
        step.pinnedTop = false;
        step.el = step.target ? await waitFor(step.target, step.wait || 1200, () => active !== tour || tour.giveUp) : null;
        clearTimeout(loadingTimer);
        if (active !== tour) return;
        tour.waiting = false;
        hideLoading();
        if (step.target && !step.el) {
            const forward = index >= tour.index;
            if (forward) go(index + 1);
            else if (index > 0) go(index - 1);
            return;
        }
        tour.index = index;
        card.classList.remove('is-pending');
        titleEl.textContent = step.title;
        textEl.textContent = typeof step.text === 'function' ? step.text() : step.text;
        countEl.textContent = `${index + 1} of ${tour.steps.length}`;
        backBtn.hidden = index === 0;
        nextBtn.textContent = index === tour.steps.length - 1 ? (tour.finishLabel || 'Got it') : 'Next';
        if (step.el) {
            step.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(() => active === tour && place(), 380);
        }
        place();
        nextBtn.focus({ preventScroll: true });
    }

    function end(how) {
        const tour = active;
        if (!tour) return;
        active = null;
        if (how === 'finished' && tour.leaving) {
            // Going on to the next page: keep the popup up and say so until it opens.
            const leaving = tour.leaving();
            if (leaving) {
                showLoading(leaving, false);
                titleEl.textContent = 'On to the next part';
                skipBtn.hidden = true;
                if (tour.onFinish) tour.onFinish();
                return;
            }
        }
        hideLoading();
        overlay.hidden = true;
        document.body.classList.remove('tour-open');
        if (how === 'finished') {
            if (tour.onFinish) tour.onFinish();
        } else if (tour.onSkip) {
            tour.onSkip();
        }
    }

    /**
     * start({ steps: [{ target, title, text, wait }], finishLabel, onFinish, onSkip })
     * target: a selector, an element, a function returning one, or null (centered popup).
     */
    function start(tour) {
        if (active) return false;
        if (!overlay) build();
        active = Object.assign({ index: 0 }, tour);
        skipBtn.hidden = false;
        hideLoading();
        card.classList.add('is-pending');   // shown once there is something to say (never an empty card)
        overlay.hidden = false;
        document.body.classList.add('tour-open');
        go(0);
        return true;
    }

    // ---------------- the parts ----------------
    function welcomeSteps(page) {
        if (page === 'dashboard') {
            return {
                steps: [
                    { target: null, title: 'Welcome to CobraByte! 👋',
                      text: "Here's a quick 30-second tour so you know where everything is. You can skip it anytime." },
                    { target: '.paths-grid .path-card:nth-child(1)', title: 'Python Lessons',
                      text: 'Your course. Lessons go from the basics to classes and files, one chapter at a time.' },
                    { target: '.paths-grid .path-card:nth-child(2)', title: 'Coding Sandbox',
                      text: 'A free practice space. Write and run your own Python code here - nothing is graded.' },
                    { target: '.profile-menu-btn', title: 'Need this again?',
                      text: 'Open your profile menu and choose "Take the tour" to replay the tour anytime.' },
                ],
                finishLabel: 'Next: Learning Map',
                next: { stage: 'map', href: '/learning-map', leavingText: 'Opening your Learning Map...' },
            };
        }
        if (page === 'map') {
            return {
                steps: [
                    { target: '.map-node:not(.map-node-certificate)', wait: 30000, loading: 'Loading your Learning Map...',
                      title: 'Your Learning Map',
                      text: 'Each stop is a chapter. They open in order - finish a chapter to unlock the next one.' },
                    { target: '.map-node.status-locked', title: 'Locked chapters',
                      text: 'A lock means you need to finish the chapter before it first.' },
                    { target: '.map-node-certificate', title: 'The finish line',
                      text: 'Pass every chapter to earn your Certificate of Completion.' },
                ],
                finishLabel: 'Next: open Chapter 1',
                next: {
                    stage: 'lessons',
                    leavingText: 'Opening Chapter 1...',
                    open: () => document.querySelector('.map-node.node-clickable:not(.map-node-certificate)'),
                },
            };
        }
        if (page === 'lessons') {
            return {
                steps: [
                    { target: '#chapterSkipCard:not([hidden])', wait: 2500, loading: 'Loading your lessons...',
                      title: 'Already know this chapter?',
                      text: 'Some chapters can be skipped. Skipping opens the next chapter, but this one shows as "Skipped", not completed.' },
                    { target: '.module-block .module-gate', wait: 30000, loading: 'Loading your lessons...',
                      title: 'The pass mark',
                      text: () => `Each module needs ${pass()}% or higher to unlock the next module. Your score is half activities, half reading and video.` },
                    { target: '.lessons-list .lesson-card.unlocked', title: 'Start here',
                      text: 'Lessons open one after another. Press Start to begin your first lesson.' },
                    { target: '.module-review-card', title: 'Module Review',
                      text: "After the last lesson of a module you'll see your weak spots here and can retake the questions you missed." },
                ],
                finishLabel: 'Got it - start learning',
            };
        }
        return null;
    }

    const TIPS = {
        lesson: () => ({
            steps: [
                { target: () => { const bar = document.getElementById('lessonStepper'); return bar && bar.children.length ? bar : null; },
                  wait: 30000, loading: 'Loading your lesson...',
                  title: 'How a lesson works',
                  text: "This bar shows this lesson's steps. A lesson can have a video, reading, activities and a coding exercise, and always ends with a Summary. Your place is saved if you leave." },
                { target: '.lesson-step-btn:not([disabled]), .lesson-step-locked-note', title: 'Moving on',
                  text: 'The next step opens after you finish this one - watch the whole video, or scroll to the end of the reading.' },
                { target: null, title: 'Your score',
                  text: () => `Your lesson score is half activities and half reading/video. Average ${pass()}% in a module to unlock the next one - missed questions can be retaken.` },
            ],
        }),
        game: (ctx) => ({
            steps: [
                { target: ctx && ctx.target, title: 'Before you play',
                  text: 'You have 5 lives ♥. A wrong answer, a skip or running out of time costs one. Your lives refill 10 minutes after you lose one.' },
                { target: ctx && ctx.target, title: "Don't leave mid-game",
                  text: 'Switching tabs or apps during a game counts as leaving: the first time is a warning, after that the question is replaced.' },
            ],
            finishLabel: "Got it - let's play",
        }),
        sandbox: () => ({
            steps: [
                { target: '#codeEditor', wait: 30000, loading: 'Loading the Sandbox...',
                  title: 'Your practice space',
                  text: 'Write any Python code here. Nothing in the Sandbox is graded.' },
                { target: '#runCodeBtn', title: 'Run it',
                  text: 'Press Run Code to see what your program prints below.' },
                { target: '#saveCodeBtn', title: 'Keep your code',
                  text: 'Save Code keeps a snippet in your account so you can open it again later.' },
            ],
        }),
    };

    // One welcome-tour page. replay: from the "?" button (saves nothing).
    function runWelcome(page, replay) {
        const part = welcomeSteps(page);
        if (!part) return;
        start({
            steps: part.steps,
            finishLabel: part.finishLabel,
            // The message shown while the next page opens (null = the tour ends here).
            leaving: part.next ? () => {
                if (part.next.open && !part.next.open()) return null;
                return part.next.leavingText;
            } : null,
            onFinish: () => {
                if (part.next) {
                    const target = part.next.open ? part.next.open() : null;
                    if (part.next.open && !target) { finishWelcome(replay); return; }   // no chapter to open yet
                    ss(CONTINUE_KEY, part.next.stage);
                    if (target) target.click();
                    else window.location.href = part.next.href;
                    return;
                }
                finishWelcome(replay);
            },
            onSkip: () => {
                ss(CONTINUE_KEY, null);
                ss(REPLAY_KEY, null);
                if (!replay) save('welcome', 'skipped');
            },
        });
    }

    function finishWelcome(replay) {
        ss(CONTINUE_KEY, null);
        ss(REPLAY_KEY, null);
        if (!replay) save('welcome', 'finished');
    }

    function runTip(key, ctx, replay) {
        const part = TIPS[key](ctx);
        return start({
            steps: part.steps,
            finishLabel: part.finishLabel,
            onFinish: () => { if (!replay) save(key, 'finished'); },
            onSkip: () => { if (!replay) save(key, 'skipped'); },
        });
    }

    // ---------------- public ----------------
    // auto(key, ctx): show a tip part only if this learner hasn't seen it yet.
    async function auto(key, ctx) {
        const s = await loadState();
        if (!s || (s.seen && s.seen[key])) return;
        runTip(key, ctx, false);
    }

    function replay() {
        if (active) return;
        if (PAGE === 'dashboard' || PAGE === 'map' || PAGE === 'lessons') {
            ss(REPLAY_KEY, '1');
            loadState().then(() => runWelcome(PAGE, true));
            return;
        }
        if (PAGE === 'lesson') {
            // On the Ready-to-play card the game tip is what matters; otherwise the lesson tip.
            const ready = resolve('.game-ready-card');
            loadState().then(() => (ready ? runTip('game', { target: ready }, true) : runTip('lesson', null, true)));
            return;
        }
        if (PAGE === 'sandbox') loadState().then(() => runTip('sandbox', null, true));
    }

    async function autoStart() {
        if (!PAGE) return;
        const s = await loadState();
        if (!s) return;   // not signed in / no consent yet: never show a tour
        const seen = s.seen || {};
        if (PAGE === 'dashboard' || PAGE === 'map' || PAGE === 'lessons') {
            const replaying = ss(REPLAY_KEY) === '1';
            const continuing = ss(CONTINUE_KEY) === PAGE;
            if (continuing) ss(CONTINUE_KEY, null);
            if (continuing || !seen.welcome) {
                // Without a "continue", the welcome tour only starts on the Dashboard
                // (a learner who lands on the map first gets it there instead).
                if (!continuing && PAGE !== 'dashboard' && PAGE !== 'map') return;
                runWelcome(PAGE, replaying && continuing);
            }
            if (!continuing) ss(REPLAY_KEY, null);
            return;
        }
        if (PAGE === 'lesson' && !seen.lesson) runTip('lesson', null, false);
        if (PAGE === 'sandbox' && !seen.sandbox) runTip('sandbox', null, false);
    }

    // True on the pages that have a tour (the profile menu's "Take the tour").
    function hasTour() {
        return !!PAGE;
    }

    window.CobraTour = { auto, replay, start, hasTour };

    document.addEventListener('DOMContentLoaded', () => {
        // "Take the tour" from a page without one lands here as /dashboard?tour=1.
        const params = new URLSearchParams(window.location.search);
        if (PAGE === 'dashboard' && params.get('tour') === '1') {
            params.delete('tour');
            const query = params.toString();
            window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
            replay();
            return;
        }
        autoStart();
    });
})();
