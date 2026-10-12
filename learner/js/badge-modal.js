/*
 * badge-modal.js - one badge, big (feat/badge-modal)
 * ---------------------------------------------------------------
 * Opened from the Badges & Achievements tab (profile.js):
 *
 *   CobraBadgeModal.open(badges, index, { accId, trigger })
 *
 *   badges   the list from /api/profile/overview, in the grid's order
 *            ({code, name, description, criteria, icon, icon_url, color,
 *              earned, earned_at, current, target, unit, rarity_percent})
 *   trigger  the card that opened it - focus goes back there on close
 *
 * EARNED: medal in the badge colour with a shine, "How you earned it",
 *         "Earned on", rarity. The FIRST time a learner opens an earned
 *         badge: a short confetti burst (skipped for reduced motion),
 *         remembered in localStorage per learner + badge.
 * LOCKED: grey medal with a lock, "How to earn", the progress bar
 *         ("1 / 3 modules passed - 2 more to go"), rarity, and a button
 *         to the Learning Map.
 * Prev / Next (buttons, Left / Right keys) go through the grid's order.
 * Esc / X / tapping outside closes. Phones: a bottom sheet.
 * Badges are made by mentors: every text goes in with textContent.
 * Styles: learner/css/badge-modal.css
 */
(function () {
    'use strict';

    let root = null;
    let els = {};
    let list = [];
    let index = 0;
    let opts = {};
    let lastFocus = null;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null && text !== '') node.textContent = text;
        return node;
    }

    function icon(classes) {
        const i = el('i', classes);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function build() {
        root = el('div', 'bm-backdrop');
        root.hidden = true;
        root.innerHTML = `
            <div class="bm-dialog" role="dialog" aria-modal="true" aria-labelledby="bmName" aria-describedby="bmDesc" tabindex="-1">
                <span class="bm-grab" aria-hidden="true"></span>
                <button type="button" class="bm-close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                <div class="bm-scroll">
                    <div class="bm-stage">
                        <button type="button" class="bm-nav bm-prev" aria-label="Previous badge"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                        <div class="bm-medal-wrap">
                            <div class="bm-medal"></div>
                            <span class="bm-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
                        </div>
                        <button type="button" class="bm-nav bm-next" aria-label="Next badge"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                    </div>
                    <span class="bm-chip"></span>
                    <h2 class="bm-name" id="bmName"></h2>
                    <p class="bm-desc" id="bmDesc"></p>
                    <div class="bm-how"></div>
                    <div class="bm-progress" hidden>
                        <div class="bm-progress-text"><span class="bm-progress-count"></span><span class="bm-progress-left"></span></div>
                        <div class="bm-bar" role="progressbar" aria-valuemin="0"><span class="bm-bar-fill"></span></div>
                    </div>
                    <p class="bm-date" hidden></p>
                    <p class="bm-rarity" hidden></p>
                    <a class="bm-cta" href="/learning-map" hidden>Go to Learning Map <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                    <p class="bm-counter" aria-live="polite"></p>
                </div>
            </div>`;
        document.body.appendChild(root);
        const q = (s) => root.querySelector(s);
        els = {
            dialog: q('.bm-dialog'), medal: q('.bm-medal'), lockBadge: q('.bm-lock'),
            chip: q('.bm-chip'), name: q('.bm-name'), desc: q('.bm-desc'), how: q('.bm-how'),
            progress: q('.bm-progress'), count: q('.bm-progress-count'), left: q('.bm-progress-left'),
            bar: q('.bm-bar'), fill: q('.bm-bar-fill'), date: q('.bm-date'), rarity: q('.bm-rarity'),
            cta: q('.bm-cta'), counter: q('.bm-counter'), prev: q('.bm-prev'), next: q('.bm-next'),
            scroll: q('.bm-scroll'),
        };
        q('.bm-close').addEventListener('click', close);
        els.prev.addEventListener('click', () => step(-1));
        els.next.addEventListener('click', () => step(1));
        // Outside the window closes it. preventDefault keeps the browser from
        // moving focus to the page, so focus can go back to the card.
        root.addEventListener('mousedown', (e) => { if (e.target === root) { e.preventDefault(); close(); } });
        root.addEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        // Left / Right flip badges - but never while typing or on the bar.
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            step(e.key === 'ArrowLeft' ? -1 : 1);
            return;
        }
        if (e.key === 'Tab') trapFocus(e);
    }

    function trapFocus(e) {
        const items = [els.dialog].concat(Array.from(root.querySelectorAll('button, a[href]')))
            .filter((n) => !n.hidden && !n.disabled && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ---------- numbers ----------
    function num(n) {
        const v = Number(n) || 0;
        return Number.isInteger(v) ? String(v) : v.toFixed(1);
    }

    function rarityText(p) {
        if (p === null || p === undefined) return '';
        if (p <= 0) return 'No learner has this badge yet - be the first!';
        if (p >= 100) return 'Every learner has this badge';
        return `${p}% of learners have this badge`;
    }

    // ---------- render ----------
    function paintMedal(b) {
        els.medal.textContent = '';
        els.medal.classList.remove('has-color');
        els.medal.style.removeProperty('--badge-color');
        if (b.icon_url) {
            const img = el('img', 'bm-medal-img');
            img.src = b.icon_url;
            img.alt = '';
            img.addEventListener('error', () => { img.replaceWith(icon(`fa-solid ${safeIcon(b.icon)}`)); }, { once: true });
            els.medal.appendChild(img);
        } else {
            els.medal.appendChild(icon(`fa-solid ${safeIcon(b.icon)}`));
        }
        if (b.earned && /^#[0-9a-f]{6}$/i.test(b.color || '')) {
            els.medal.style.setProperty('--badge-color', b.color);
            els.medal.classList.add('has-color');
        }
    }

    // A Font Awesome class name only (badge rows are mentor data).
    function safeIcon(name) {
        return /^fa-[a-z0-9-]+$/.test(name || '') ? name : 'fa-award';
    }

    function render() {
        const b = list[index];
        const earned = !!b.earned;
        els.dialog.classList.toggle('is-earned', earned);
        els.dialog.classList.toggle('is-locked', !earned);
        paintMedal(b);
        els.lockBadge.hidden = earned;

        els.chip.textContent = earned ? 'Earned' : 'Locked';
        els.name.textContent = b.name || '';
        els.desc.textContent = b.description || '';
        els.desc.hidden = !b.description;

        // "How you earned it" (check) / "How to earn" (target)
        els.how.textContent = '';
        if (b.criteria) {
            els.how.hidden = false;
            els.how.appendChild(icon(earned ? 'fa-solid fa-circle-check' : 'fa-solid fa-bullseye'));
            const text = el('span');
            text.appendChild(el('strong', '', earned ? 'How you earned it: ' : 'How to earn: '));
            text.appendChild(document.createTextNode(b.criteria));
            els.how.appendChild(text);
        } else {
            els.how.hidden = true;
        }

        // Progress - locked only, and only when the rule is one we can count
        const hasProgress = !earned && b.target && b.current !== null && b.current !== undefined;
        els.progress.hidden = !hasProgress;
        if (hasProgress) {
            const current = Math.min(Number(b.current) || 0, Number(b.target));
            const left = Math.max(0, Number(b.target) - current);
            els.count.textContent = `${num(current)} / ${num(b.target)}${b.unit ? ` ${b.unit}` : ''}`;
            els.left.textContent = left > 0 ? `${num(Math.round(left * 10) / 10)} more to go` : 'Almost there!';
            const pct = Math.round((current / Number(b.target)) * 100);
            els.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            els.bar.setAttribute('aria-valuemax', String(b.target));
            els.bar.setAttribute('aria-valuenow', String(current));
            els.bar.setAttribute('aria-label', `${num(current)} of ${num(b.target)}${b.unit ? ` ${b.unit}` : ''}`);
        }

        els.date.hidden = !(earned && b.earned_at);
        els.date.textContent = earned && b.earned_at ? `Earned on ${b.earned_at}` : '';

        const rarity = rarityText(b.rarity_percent);
        els.rarity.hidden = !rarity;
        els.rarity.textContent = '';
        if (rarity) {
            els.rarity.appendChild(icon('fa-solid fa-users'));
            els.rarity.appendChild(document.createTextNode(` ${rarity}`));
        }

        els.cta.hidden = earned;
        els.counter.textContent = `Badge ${index + 1} of ${list.length}`;
        const many = list.length > 1;
        els.prev.hidden = els.next.hidden = !many;
        els.scroll.scrollTop = 0;

        if (earned) celebrateOnce(b);
    }

    // ---------- confetti (first view of an earned badge) ----------
    function seenKey(b) {
        return `cobra.badgeSeen.${opts.accId || 'me'}.${b.code}`;
    }

    function celebrateOnce(b) {
        let seen = false;
        try { seen = window.localStorage.getItem(seenKey(b)) === '1'; } catch (e) { seen = true; }  // no storage: never nag
        if (seen) return;
        try { window.localStorage.setItem(seenKey(b), '1'); } catch (e) { /* private mode */ }
        let reduce = false;
        try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }
        if (reduce) return;
        confetti(/^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#22c55e');
    }

    function confetti(mainColor) {
        const canvas = el('canvas', 'bm-confetti');
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) { canvas.remove(); return; }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        // Burst from the medal
        const rect = els.medal.getBoundingClientRect();
        const ox = rect.left + rect.width / 2;
        const oy = rect.top + rect.height / 2;
        const colors = [mainColor, '#fbbf24', '#22c55e', '#38bdf8', '#f472b6', '#a78bfa'];
        const count = w < 600 ? 70 : 110;
        const bits = Array.from({ length: count }, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 7;
            return {
                x: ox, y: oy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 4,
                size: 5 + Math.random() * 6,
                rot: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.3,
                color: colors[Math.floor(Math.random() * colors.length)],
            };
        });
        const DURATION = 1400;
        const start = performance.now();
        (function frame(now) {
            const t = now - start;
            ctx.clearRect(0, 0, w, h);
            ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4));
            bits.forEach((p) => {
                p.vy += 0.25;
                p.vx *= 0.985;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.spin;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            });
            if (t < DURATION) requestAnimationFrame(frame);
            else canvas.remove();
        })(start);
    }

    // ---------- open / close ----------
    function step(delta) {
        if (list.length < 2) return;
        index = (index + delta + list.length) % list.length;
        render();
    }

    function open(badges, startIndex, options) {
        if (!badges || !badges.length) return;
        if (!root) build();
        list = badges;
        index = Math.max(0, Math.min(badges.length - 1, Number(startIndex) || 0));
        opts = options || {};
        lastFocus = opts.trigger || document.activeElement;
        root.hidden = false;
        document.documentElement.classList.add('bm-open');
        // next frame: the sheet slides / fades in
        requestAnimationFrame(() => root.classList.add('is-shown'));
        render();
        // The window itself takes focus (screen readers read its name; no ring on X).
        els.dialog.focus({ preventScroll: true });
    }

    function close() {
        if (!root || root.hidden) return;
        root.classList.remove('is-shown');
        root.hidden = true;
        document.querySelectorAll('.bm-confetti').forEach((c) => c.remove());
        document.documentElement.classList.remove('bm-open');
        // Back to the card of the badge shown last (it may have flipped).
        const target = opts.cardFor ? opts.cardFor(index) : lastFocus;
        const focusTarget = target && document.contains(target) ? target : lastFocus;
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: false });
        if (opts.onClose) opts.onClose();
    }

    window.CobraBadgeModal = { open, close, isOpen: () => !!(root && !root.hidden) };
})();
