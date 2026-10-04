/**
 * module-review.js - Module Review page (/module-review?module_id=N)
 * ------------------------------------------------------------------
 * The card at the end of every module on the Lessons page. Loads
 * /api/module-review (module_review.py) and shows, lesson by lesson,
 * every item the learner missed: what they answered, the feedback, the
 * part of the lesson to re-read, and the retake while the module is
 * below the pass mark. The correct answer only comes from the server
 * once the module is passed (no retake left to give away).
 */
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const moduleId = params.get('module_id');

    const backLink = document.getElementById('reviewBackLink');
    const eyebrow = document.getElementById('reviewEyebrow');
    const title = document.getElementById('reviewTitle');
    const subtitle = document.getElementById('reviewSubtitle');
    const scoreBox = document.getElementById('reviewScore');
    const ring = document.getElementById('reviewRing');
    const ringLabel = document.getElementById('reviewRingLabel');
    const stateEl = document.getElementById('reviewState');
    const explainEl = document.getElementById('reviewExplain');
    const actionsEl = document.getElementById('reviewActions');
    const lessonsCard = document.getElementById('reviewLessonsCard');
    const lessonsSub = document.getElementById('reviewLessonsSub');
    const lessonsEl = document.getElementById('reviewLessons');
    const errorEl = document.getElementById('reviewError');

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function plural(n, word) {
        return `${n} ${word}${n === 1 ? "" : "s"}`;
    }

    function showError(message) {
        subtitle.textContent = "";
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function actionButton(label, href, primary, icon) {
        return `<a class="review-action ${primary ? "is-primary" : ""}" href="${escapeHtml(href)}">${icon ? `<i class="fa-solid ${icon}"></i> ` : ""}${escapeHtml(label)}</a>`;
    }

    // The lesson part (mentor-authored lesson HTML), read-only.
    function partHtmlNode(html) {
        const box = document.createElement('div');
        box.className = 'weak-spot-content lesson-content-body';
        box.innerHTML = html || '';
        box.querySelectorAll('[contenteditable="true"]').forEach((el) => el.setAttribute('contenteditable', 'false'));
        box.querySelectorAll('button, input, textarea, select').forEach((el) => el.remove());
        return box;
    }

    const RESULT_LABELS = { wrong: 'wrong', skipped: 'skipped', unanswered: 'not answered' };

    // One missed item, shown when its number chip is tapped.
    function itemDetailHtml(item) {
        return `
            <div class="review-item-head">
                <span class="weak-spot-item-label">${escapeHtml(item.label)}</span>
                <span class="review-item-type">${escapeHtml(item.activity_type)} · ${escapeHtml(RESULT_LABELS[item.result] || item.result)}</span>
            </div>
            <p class="review-item-prompt">${escapeHtml(item.prompt || '')}</p>
            <dl class="review-item-answers">
                <div><dt>Your answer</dt><dd>${item.result === 'skipped' ? '<em>Skipped</em>'
                    : (item.your_answer ? `<code>${escapeHtml(item.your_answer)}</code>` : '<em>No answer saved</em>')}</dd></div>
                ${item.feedback ? `<div><dt>Feedback</dt><dd>${escapeHtml(item.feedback)}</dd></div>` : ''}
                ${item.correct ? `<div class="is-correct"><dt>Correct answer</dt><dd><code>${escapeHtml(item.correct)}</code></dd></div>` : ''}
                <div><dt>Taught in</dt><dd>${escapeHtml(item.part_heading || '-')}</dd></div>
            </dl>`;
    }

    // The missed item numbers as chips; tapping one shows that item below.
    function missedItemsNode(lesson) {
        const wrap = document.createElement('div');
        wrap.className = 'review-missed';
        wrap.innerHTML = `<p class="review-block-title">Missed items <span>tap a number to see it</span></p>`;

        const chips = document.createElement('div');
        chips.className = 'review-chips';
        const detail = document.createElement('div');
        detail.className = 'review-item';
        detail.hidden = true;

        lesson.items.forEach((item) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `review-chip is-${item.result}`;
            chip.setAttribute('aria-expanded', 'false');
            chip.innerHTML = `${escapeHtml(item.label)} <span>${escapeHtml(RESULT_LABELS[item.result] || item.result)}</span>`;
            chip.addEventListener('click', () => {
                const open = chip.classList.contains('is-active');
                chips.querySelectorAll('.review-chip').forEach((c) => {
                    c.classList.remove('is-active');
                    c.setAttribute('aria-expanded', 'false');
                });
                if (open) {
                    detail.hidden = true;
                    return;
                }
                chip.classList.add('is-active');
                chip.setAttribute('aria-expanded', 'true');
                detail.innerHTML = itemDetailHtml(item);
                detail.hidden = false;
            });
            chips.appendChild(chip);
        });

        wrap.append(chips, detail);
        return wrap;
    }

    // Each lesson part to re-read, ONCE (with the item numbers it covers).
    // The lesson text is only built when the part is opened.
    function partsNode(lesson) {
        const wrap = document.createElement('div');
        wrap.className = 'review-parts';
        wrap.innerHTML = `<p class="review-block-title">Parts to re-read</p>`;
        lesson.parts.forEach((part) => {
            const details = document.createElement('details');
            details.className = 'review-part';
            const summary = document.createElement('summary');
            summary.innerHTML = `<i class="fa-solid fa-book-open"></i> <strong>${escapeHtml(part.heading)}</strong>`
                + (part.is_other_lesson ? ` <span class="review-part-from">from ${escapeHtml(part.lesson_title)}</span>` : '')
                + ` <span class="review-part-covers">covers ${escapeHtml(part.labels.join(', '))}</span>`;
            details.appendChild(summary);
            details.addEventListener('toggle', () => {
                if (details.open && !details.querySelector('.weak-spot-content')) {
                    details.appendChild(partHtmlNode(part.html));
                }
            });
            wrap.appendChild(details);
        });
        return wrap;
    }

    function lessonNode(lesson, openByDefault) {
        const section = document.createElement('details');
        section.className = 'review-lesson' + (lesson.missed ? '' : ' is-clean');
        section.open = !!openByDefault;

        const graded = lesson.percent !== null && lesson.percent !== undefined;
        const meta = graded
            ? `Score ${lesson.percent}% \u2022 ${lesson.missed ? plural(lesson.missed, 'missed item') : 'nothing missed'}`
            : 'No activities';
        const summary = document.createElement('summary');
        summary.className = 'review-lesson-head';
        summary.innerHTML = `
            <div class="review-lesson-title">
                <p class="review-lesson-number">Lesson ${lesson.number}</p>
                <h3>${escapeHtml(lesson.title)}</h3>
                <p class="review-lesson-meta">${meta}</p>
            </div>
            <span class="review-lesson-badge ${lesson.missed ? 'has-missed' : 'is-clean'}">${lesson.missed ? lesson.missed : '<i class="fa-solid fa-check"></i>'}</span>
            <i class="fa-solid fa-chevron-down review-lesson-caret" aria-hidden="true"></i>
        `;
        section.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'review-lesson-body';
        body.innerHTML = `
            <div class="review-lesson-actions">
                <a class="review-action" href="/lesson-content?resource_id=${lesson.resource_id}"><i class="fa-solid fa-book-open"></i> Review lesson</a>
                ${lesson.can_retake ? `<a class="review-action is-retake" href="/lesson-content?resource_id=${lesson.resource_id}&retake=1"><i class="fa-solid fa-rotate-right"></i> Retake ${plural(lesson.missed, 'missed item')}</a>` : ''}
            </div>`;

        if (lesson.exercise) {
            const ex = lesson.exercise;
            const exRow = document.createElement('p');
            exRow.className = 'review-exercise';
            exRow.innerHTML = ex.passed
                ? `<i class="fa-solid fa-code"></i> Coding exercise "${escapeHtml(ex.title)}": passed`
                  + (ex.attempts > 1 ? ` after ${ex.attempts} attempts - worth practising again in the Sandbox.` : ' on the first try.')
                : `<i class="fa-solid fa-code"></i> Coding exercise "${escapeHtml(ex.title)}": not passed yet (${plural(ex.attempts, 'attempt')}).`;
            body.appendChild(exRow);
        }

        // Strong | Needs work (lesson-insights.js)
        if (window.CobraInsights && lesson.insights) {
            const box = document.createElement('div');
            box.innerHTML = window.CobraInsights.html(lesson.insights);
            if (box.innerHTML.trim()) body.appendChild(box);
        }

        if (lesson.items.length) {
            body.appendChild(missedItemsNode(lesson));
            if (lesson.parts && lesson.parts.length) body.appendChild(partsNode(lesson));
        } else {
            const clean = document.createElement('p');
            clean.className = 'review-clean';
            if (lesson.has_games) {
                clean.innerHTML = '<i class="fa-solid fa-circle-check"></i> You got every item in this lesson right on the first try.';
            } else if (lesson.exercise) {
                clean.innerHTML = '<i class="fa-solid fa-circle-check"></i> This lesson only has the coding exercise - nothing else to review.';
            } else {
                clean.innerHTML = '<i class="fa-solid fa-book-open"></i> This lesson has no activities to answer - nothing to review here.';
            }
            body.appendChild(clean);
        }
        section.appendChild(body);
        return section;
    }

    function render(data) {
        const lessonsUrl = `/lessons?cat_id=${data.cat_id}`;
        backLink.href = lessonsUrl;
        eyebrow.textContent = `${data.category_name} • Module ${data.module_number}`;
        title.textContent = `Module ${data.module_number} Review: ${data.module_name}`;
        document.title = `CobraByte - Module ${data.module_number} Review`;

        const actions = [];
        if (data.state === 'not_ready') {
            subtitle.textContent = `Finish ${data.lessons_left === 1 ? 'the last lesson' : `all ${data.lessons_left} remaining lessons`} of this module to see your review.`;
            actions.push(actionButton('Back to Lessons', lessonsUrl, true, 'fa-arrow-left'));
            actionsEl.innerHTML = actions.join('');
            actionsEl.hidden = false;
            return;
        }

        scoreBox.hidden = false;
        ring.style.setProperty('--pct', data.percent);
        ringLabel.textContent = `${data.percent}%`;

        if (data.state === 'needs_retake') {
            subtitle.textContent = 'Every lesson is finished. Fix your weak spots to unlock the next module.';
            stateEl.innerHTML = '<span class="review-pill is-retake">Needs retake</span>';
            explainEl.textContent = `Your module score is ${data.percent}%. You need ${data.pass_percent}% to unlock the next module. `
                + `Re-read the parts below, then retake the ${plural(data.missed_total, 'item')} you missed - only missed items are replayed.`;
            const firstRetake = data.lessons.find((l) => l.can_retake);
            if (firstRetake) {
                actions.push(actionButton(`Start retake: Lesson ${firstRetake.number}`, `/lesson-content?resource_id=${firstRetake.resource_id}&retake=1`, true, 'fa-rotate-right'));
            }
            actions.push(actionButton('Back to Lessons', lessonsUrl, false));
        } else {
            subtitle.textContent = 'You passed this module. This review is optional practice.';
            stateEl.innerHTML = '<span class="review-pill is-passed"><i class="fa-solid fa-check"></i> Passed</span>';
            explainEl.textContent = data.missed_total
                ? `Your module score is ${data.percent}%. Look back at the ${plural(data.missed_total, 'item')} you missed - the correct answers are shown now that the module is passed.`
                : `Your module score is ${data.percent}%. You got every item right on the first try - great job!`;
            const next = data.next;
            if (next && next.type === 'chapter') {
                // Last module of the chapter: the button opens the
                // "Chapter complete!" popup (proceed-modal.js).
                actions.push(`<button type="button" class="review-action is-primary" data-next-chapter><i class="fa-solid fa-flag-checkered"></i> Proceed to next chapter: ${escapeHtml(next.category_name)}</button>`);
            } else if (next && next.type === 'lesson') {
                actions.push(actionButton(`Continue to ${next.new_module ? next.module_name : next.resource_title}`, `/lesson-content?resource_id=${next.resource_id}`, true, 'fa-arrow-right'));
            }
            actions.push(actionButton('Back to Lessons', lessonsUrl, !actions.length));
        }
        actionsEl.innerHTML = actions.join('');
        actionsEl.hidden = false;
        const chapterBtn = actionsEl.querySelector('[data-next-chapter]');
        if (chapterBtn && data.next) {
            chapterBtn.addEventListener('click', () => window.CobraProceed.open({
                icon: 'fa-flag-checkered',
                title: 'Chapter complete!',
                text: `Proceed to the next chapter, ${data.next.category_name}, starting with "${data.next.resource_title}"?`,
                yesLabel: 'Yes, next chapter',
                href: `/lesson-content?resource_id=${data.next.resource_id}`,
            }));
        }

        lessonsCard.hidden = false;
        lessonsSub.textContent = data.missed_total
            ? `${plural(data.missed_total, 'missed item')} across ${plural(data.lessons.filter((l) => l.missed).length, 'lesson')}. Open a lesson to see its missed items and the parts to re-read.`
            : 'Nothing missed in this module.';
        lessonsEl.innerHTML = '';
        // Lessons are collapsed; the first one with missed items starts open.
        const firstMissed = data.lessons.findIndex((l) => l.missed > 0);
        data.lessons.forEach((lesson, i) => lessonsEl.appendChild(lessonNode(lesson, i === firstMissed)));
    }

    async function load() {
        if (!moduleId) {
            window.location.href = '/learning-map';
            return;
        }
        try {
            const response = await fetch(`/api/module-review?module_id=${encodeURIComponent(moduleId)}`, { credentials: 'include' });
            const data = await response.json().catch(() => null);
            if (!data) throw new Error('Request failed');
            if (data.cat_id) backLink.href = `/lessons?cat_id=${data.cat_id}`;
            if (!response.ok || !data.success) {
                showError(data.message || 'Could not load your module review.');
                return;
            }
            render(data);
        } catch (err) {
            console.error('Error loading module review:', err);
            showError('Could not load your module review. Please refresh the page.');
        }
    }

    load();
});
