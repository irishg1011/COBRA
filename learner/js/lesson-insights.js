/**
 * lesson-insights.js - "Strong | Needs work" box for one lesson
 * --------------------------------------------------------------
 * Renders the automatic strengths & weaknesses from lesson_insights.py
 * (first-try results per activity type, compared with the lesson). Used
 * by the lesson Summary and the Module Review. Styles: lesson-insights.css.
 *
 *   CobraInsights.html(insights)  -> HTML string ("" when nothing answered yet)
 */
(function () {
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function skillHtml(skill) {
        const score = skill.key === "applying"
            ? `${skill.right}/${skill.total} test cases on the first try${skill.attempts > 1 ? ` · passed after ${skill.attempts} tries` : ""}`
            : `${skill.right}/${skill.total} on the first try`;
        const parts = (!skill.strong && skill.parts && skill.parts.length)
            ? `<p class="insight-parts"><i class="fa-solid fa-book-open"></i> Re-read: ${skill.parts.map(escapeHtml).join(", ")}</p>`
            : "";
        return `
            <li class="insight-item">
                <div class="insight-head">
                    <strong>${escapeHtml(skill.label)}${skill.skipped ? ' <span class="insight-skipped">(skipped)</span>' : ''}</strong>
                    <span class="insight-score">${skill.percent}%</span>
                </div>
                <p class="insight-meta">${escapeHtml(skill.source)} · ${escapeHtml(score)}</p>
                <p class="insight-text">${escapeHtml(skill.text)}</p>
                ${parts}
            </li>`;
    }

    function column(kind, title, icon, skills, emptyText) {
        return `
            <div class="insight-col is-${kind}">
                <h4><i class="fa-solid ${icon}"></i> ${title}</h4>
                ${skills.length
                    ? `<ul class="insight-list">${skills.map(skillHtml).join("")}</ul>`
                    : `<p class="insight-empty">${escapeHtml(emptyText)}</p>`}
            </div>`;
    }

    function html(insights) {
        if (!insights || !insights.skills || !insights.skills.length) return "";
        const strong = insights.strong || [];
        const weak = insights.weak || [];
        return `
            <div class="lesson-insights">
                <p class="insights-title">Your strengths &amp; weak areas in this lesson</p>
                <p class="insights-sub">Worked out from your first-try answers: ${insights.strong_percent}% or higher is strong.</p>
                <div class="insight-grid">
                    ${column("strong", "Strong", "fa-arrow-trend-up", strong, "Nothing at 80% yet - keep going!")}
                    ${column("weak", "Needs work", "fa-arrow-trend-down", weak, "No weak areas - great job!")}
                </div>
            </div>`;
    }

    window.CobraInsights = { html };
})();
