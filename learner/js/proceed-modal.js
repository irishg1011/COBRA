/**
 * proceed-modal.js - the "Lesson / Module / Chapter complete - proceed?" popup
 * ---------------------------------------------------------------------------
 * One popup shared by the lesson Summary, the Lessons page ("Proceed to
 * next chapter") and the Module Review page. Builds its own markup, so a
 * page only needs this script + learner/css/proceed-modal.css.
 *
 *   CobraProceed.open({
 *       icon: "fa-flag-checkered",          // Font Awesome icon name
 *       title: "Chapter complete!",
 *       text: "Proceed to the next chapter ...?",
 *       yesLabel: "Yes, proceed",
 *       noLabel: "No, stay here",
 *       href: "/lesson-content?resource_id=12",  // where Yes goes (none = just close)
 *       onYes: () => {...},                      // or run this on Yes (popup closes first)
 *       onNo: () => {...}                        // run on the No button only (not Escape/backdrop)
 *   });
 *
 * "No", the backdrop and Escape close it and keep the learner where they are.
 * noLabel: false -> a one-button notice (e.g. the games' "you left the page" warning).
 */
(function () {
    let overlay = null;
    let yesBtn = null;
    let noBtn = null;
    let iconEl = null;
    let titleEl = null;
    let textEl = null;
    let yesHref = null;
    let yesFn = null;
    let noFn = null;
    let returnFocus = null;

    function build() {
        overlay = document.createElement('div');
        overlay.className = 'proceed-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="proceed-dialog" role="dialog" aria-modal="true" aria-labelledby="proceedTitle" aria-describedby="proceedText">
                <div class="proceed-icon" data-p="icon"></div>
                <h2 id="proceedTitle" data-p="title"></h2>
                <p id="proceedText" data-p="text"></p>
                <div class="proceed-actions">
                    <button type="button" class="proceed-btn proceed-btn-secondary" data-p="no"></button>
                    <button type="button" class="proceed-btn proceed-btn-primary" data-p="yes"></button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        iconEl = overlay.querySelector('[data-p="icon"]');
        titleEl = overlay.querySelector('[data-p="title"]');
        textEl = overlay.querySelector('[data-p="text"]');
        yesBtn = overlay.querySelector('[data-p="yes"]');
        noBtn = overlay.querySelector('[data-p="no"]');

        yesBtn.addEventListener('click', () => {
            if (yesHref) { window.location.href = yesHref; return; }
            const fn = yesFn;
            close();
            if (fn) fn();
        });
        noBtn.addEventListener('click', () => {
            const fn = noFn;
            close();
            if (fn) fn();
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) close();
        });
    }

    function open(opts) {
        if (!overlay) build();
        opts = opts || {};
        returnFocus = document.activeElement;
        yesHref = opts.href || null;
        yesFn = typeof opts.onYes === 'function' ? opts.onYes : null;
        noFn = typeof opts.onNo === 'function' ? opts.onNo : null;
        iconEl.innerHTML = `<i class="fa-solid ${opts.icon || 'fa-circle-check'}"></i>`;
        titleEl.textContent = opts.title || 'Lesson complete!';
        textEl.textContent = opts.text || '';
        yesBtn.textContent = opts.yesLabel || 'Yes, proceed';
        noBtn.hidden = opts.noLabel === false;
        noBtn.textContent = opts.noLabel || 'No, stay here';
        overlay.hidden = false;
        yesBtn.focus();
    }

    function close() {
        if (overlay) overlay.hidden = true;
        if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    }

    window.CobraProceed = { open, close };
})();
