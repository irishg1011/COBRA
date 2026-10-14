/**
 * course-finish.js - the course's finish line (feat/certificate-finish-line)
 * ---------------------------------------------------------------------------
 * Shows what the SERVER decided about the Certificate of Completion
 * (/api/lesson-summary, /api/course-status and /api/learning-map all send
 * the same "course" block - server/course_status.py). The browser never
 * decides whether the course is finished.
 *
 *   CobraCourseFinish.celebrate(course)  -> "Congratulations!" popup (proceed-modal.js),
 *                                           once per certificate, only when just earned
 *   CobraCourseFinish.card(course)       -> "Almost there" card element, or null
 *   CobraCourseFinish.openPanel(course)  -> Learning Map: what is left before the certificate
 *
 * Styles: learner/css/course-finish.css
 */
(function () {
    const SEEN_PREFIX = "cobrabyte.certificateCelebrated.";

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function seen(ref) {
        try { return window.localStorage.getItem(SEEN_PREFIX + ref) === "1"; } catch (e) { return false; }
    }

    function markSeen(ref) {
        try { window.localStorage.setItem(SEEN_PREFIX + ref, "1"); } catch (e) { /* private mode */ }
    }

    // Only a certificate earned just now (the server's just_earned) - learners
    // who had theirs before this release don't get a surprise popup.
    function celebrate(course) {
        if (!course || course.state !== "certificate" || !course.just_earned || !course.reference_no) return false;
        if (seen(course.reference_no) || !window.CobraProceed) return false;
        markSeen(course.reference_no);
        window.CobraProceed.open({
            icon: "fa-trophy",
            title: "Congratulations!",
            text: `You finished the ${course.course_name || "Python Beginner Course"}!`,
            yesLabel: "View my certificate",
            noLabel: "Close",
            href: "/certificate",
        });
        return true;
    }

    function statusText(module, passPercent) {
        if (module.status === "needs_retake") return `${module.percent}% · needs ${passPercent}%`;
        if (module.status === "in_progress") return `In progress · ${module.percent}% so far`;
        return "Not started";
    }

    function moduleRows(modules, passPercent, showChapter) {
        return modules.map((m) => `
            <li class="course-finish-module">
                <div class="course-finish-module-text">
                    <span class="course-finish-module-name">${escapeHtml(m.name)}</span>
                    ${showChapter && m.chapter ? `<span class="course-finish-module-chapter">${escapeHtml(m.chapter)}</span>` : ""}
                    <span class="course-finish-module-status is-${escapeHtml(m.status)}">${escapeHtml(statusText(m, passPercent))}</span>
                </div>
                ${m.action ? `<a class="course-finish-btn" href="${escapeHtml(m.action.url)}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> ${escapeHtml(m.action.label)}</a>` : ""}
            </li>`).join("");
    }

    // Every lesson finished, but some module is below its gate.
    function card(course) {
        if (!course || course.state !== "almost") return null;
        const modules = [];
        (course.remaining || []).forEach((ch) => (ch.modules || []).forEach((m) => modules.push(Object.assign({ chapter: ch.name }, m))));
        if (!modules.length) return null;
        const box = document.createElement("div");
        box.className = "course-finish-card";
        box.innerHTML = `
            <div class="course-finish-head">
                <span class="course-finish-icon" aria-hidden="true"><i class="fa-solid fa-flag-checkered"></i></span>
                <div>
                    <h3>You finished all the lessons!</h3>
                    <p>Almost there: pass ${modules.length === 1 ? "this module" : "these modules"} to unlock your certificate.</p>
                </div>
            </div>
            <ul class="course-finish-modules">${moduleRows(modules, course.pass_percent, true)}</ul>`;
        return box;
    }

    // ---------------- Learning Map: "what's left" panel ----------------
    let overlay = null;
    let returnFocus = null;

    function closePanel() {
        if (!overlay) return;
        overlay.hidden = true;
        document.body.classList.remove("course-panel-open");
        if (returnFocus && returnFocus.focus) returnFocus.focus();
    }

    function openPanel(course) {
        if (!course) return;
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "course-panel-overlay";
            overlay.hidden = true;
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
            document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay && !overlay.hidden) closePanel(); });
            document.body.appendChild(overlay);
        }
        const chapters = (course.remaining || []).map((ch) => `
            <section class="course-panel-chapter">
                <h4>${escapeHtml(ch.name)}</h4>
                <ul class="course-finish-modules">${moduleRows(ch.modules || [], course.pass_percent, false)}</ul>
            </section>`).join("");
        overlay.innerHTML = `
            <div class="course-panel" role="dialog" aria-modal="true" aria-labelledby="coursePanelTitle">
                <button type="button" class="course-panel-close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                <div class="course-panel-trophy" aria-hidden="true"><i class="fa-solid fa-trophy"></i><i class="fa-solid fa-lock course-panel-lock"></i></div>
                <h3 id="coursePanelTitle">Certificate locked</h3>
                <p class="course-panel-count">${course.chapters_passed || 0} of ${course.chapters_total || 0} chapters passed</p>
                ${chapters ? `<p class="course-panel-subtitle">What's left</p><div class="course-panel-list">${chapters}</div>` : ""}
                <p class="course-panel-rule">Finish every chapter with ${course.pass_percent}% in each module to unlock it.</p>
            </div>`;
        overlay.querySelector(".course-panel-close").addEventListener("click", closePanel);
        returnFocus = document.activeElement;
        overlay.hidden = false;
        document.body.classList.add("course-panel-open");
        overlay.querySelector(".course-panel-close").focus();
    }

    window.CobraCourseFinish = { celebrate, card, openPanel };
})();
