/**
 * admin-preview-play.js - feat/admin-real-game-preview
 * ---------------------------------------------------------------
 * Loaded FIRST on /admin/preview-play, before the real learner game
 * scripts. Sets window.COBRA_PREVIEW_MODE, which is the ONLY thing that
 * switches lesson-content.js / lesson-activities.js / lesson-fill-blanks.js
 * / lesson-flashcards.js into preview mode. On learner pages this file
 * is never loaded, so the flag is undefined and they run untouched.
 *
 * In preview mode the learner scripts call the admin mirror routes under
 * /admin/preview-play/api/... (no locks, full lives, nothing saved).
 *
 * When the page is inside a popup (iframe), it tells the parent page
 * which step it is on, when the preview is finished (so the Publishing
 * walkthrough can move its stepper and show its summary) and when Esc
 * is pressed (so the popup can close).
 */
(function () {
    "use strict";

    const params = new URLSearchParams(window.location.search);

    // Opened inside a preview popup (CobraPreviewFrame adds frame=modal):
    // compact layout - preview-play.css hides the stepper / lesson title
    // the popup already shows, so the game itself gets the space.
    if (params.get("frame") === "modal") {
        document.documentElement.classList.add("preview-in-modal");
    }
    const allowed = ["la_id", "resource_id", "activity_type", "exercise_id", "scope"];
    const query = new URLSearchParams();
    allowed.forEach((key) => {
        if (params.has(key)) query.set(key, params.get(key));
    });

    function tellParent(message) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(Object.assign({ source: "cobra-preview-play" }, message), window.location.origin);
        }
    }

    // Esc pressed inside the frame never reaches the parent page, so pass
    // it on (the popup closes on Esc) - unless the exercise's own Run
    // dialog is open, which uses Esc itself.
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const runModal = document.querySelector(".code-run-modal-overlay");
        if (runModal && !runModal.hidden) return;
        tellParent({ type: "escape" });
    });

    window.COBRA_PREVIEW_MODE = {
        apiBase: "/admin/preview-play",
        query: query.toString(),
        onStep(key) { tellParent({ type: "step", key: key }); },
        onFinished() { tellParent({ type: "finished" }); }
    };
})();
