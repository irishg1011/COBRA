document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost

    const urlParams = new URLSearchParams(window.location.search);
    const catId = urlParams.get('cat_id');

    if (!catId) {
        window.location.href = '/learning-map';
        return;
}

    const lessonsTitle = document.getElementById('lessonsTitle');
    const lessonsSubtitle = document.getElementById('lessonsSubtitle');
    const overallPercent = document.getElementById('overallPercent');
    const overallProgressFill = document.getElementById('overallProgressFill');
    const lessonsJumpRow = document.getElementById('lessonsJumpRow');
    const modulesContainer = document.getElementById('modulesContainer');
    const lessonsLoading = document.getElementById('lessonsLoading');
    const lessonsError = document.getElementById('lessonsError');

    const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;
    const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`;
    const FLAG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18M3 4.5h14.25a1.5 1.5 0 0 1 1.06 2.56l-3.19 3.19a1.5 1.5 0 0 0 0 2.12l3.19 3.19a1.5 1.5 0 0 1-1.06 2.56H3" /></svg>`;
    const CHEVRON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>`;

    const RETAKE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;

    // ---- Module 85% gate: module score panel under each module header ----
    //   locked       -> "Pass Module N with 85% or higher to unlock."
    //   in progress  -> reminder that the score shows once every lesson is done
    //   all done     -> Passed / Needs retake pill + bar with the 85% marker
    function buildModuleGate(module, moduleIndex) {
        const pass = module.pass_percent || 85;
        const gate = document.createElement('div');
        gate.className = 'module-gate';

        const top = document.createElement('div');
        top.className = 'module-gate-top';
        const pill = document.createElement('span');
        pill.className = 'module-gate-pill';
        const note = document.createElement('p');
        note.className = 'module-gate-note';
        top.appendChild(pill);
        gate.appendChild(top);

        if (module.locked) {
            gate.classList.add('is-locked');
            pill.classList.add('is-locked');
            pill.innerHTML = `${LOCK_ICON} <span>Locked</span>`;
            note.textContent = `Pass Module ${moduleIndex} with ${pass}% or higher to unlock.`;
            gate.appendChild(note);
            return gate;
        }

        if (!module.all_done) {
            pill.classList.add('is-progress');
            pill.textContent = `${pass}% needed to move on`;
            note.textContent = 'Finish every lesson in this module to see your module score.';
            gate.appendChild(note);
            return gate;
        }

        const percent = Math.max(0, Math.min(100, module.performance_percent || 0));
        const state = module.passed ? 'is-passed' : 'is-retake';
        gate.classList.add(state);
        pill.classList.add(state);
        if (module.passed) {
            pill.innerHTML = `${CHECK_ICON} <span>Passed · ${percent}%</span>`;
        } else {
            pill.textContent = `Needs retake · ${percent}%`;
        }

        const track = document.createElement('div');
        track.className = 'module-gate-track';
        const fill = document.createElement('div');
        fill.className = `module-gate-fill ${state}`;
        fill.style.width = `${percent}%`;
        const marker = document.createElement('div');
        marker.className = 'module-gate-marker';
        marker.style.left = `${pass}%`;
        marker.title = `${pass}% needed`;
        track.appendChild(fill);
        track.appendChild(marker);
        gate.appendChild(track);

        note.textContent = module.passed
            ? `Average of your lesson scores · ${pass}% needed`
            : `You need ${pass}% to unlock the next module. Retake your missed items below (${module.missed_total} left).`;
        gate.appendChild(note);
        return gate;
    }

    function statusLabel(status) {
        if (status === 'completed') return 'Completed';
        if (status === 'ready') return 'Ready';
        return 'Locked';
    }

    function actionLabel(status) {
        if (status === 'completed') return 'Review';
        if (status === 'ready') return 'Start';
        return 'Locked';
    }

    function renderLessons(data) {
        lessonsTitle.textContent = data.category_name;
        lessonsSubtitle.textContent = `Python Programming for Beginners \u00b7 ${data.overall_completed_lessons} / ${data.overall_total_lessons} lessons completed`;

        overallPercent.textContent = `${data.overall_percent}%`;
        overallProgressFill.style.width = `${data.overall_percent}%`;

        lessonsJumpRow.innerHTML = '';
        modulesContainer.innerHTML = '';

        data.modules.forEach((module, moduleIndex) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'lessons-jump-pill';
            pill.innerHTML = `<span class="dot"></span> Module ${moduleIndex + 1}: ${module.module_name} ${module.lessons_completed}/${module.lessons_total}`;
            pill.addEventListener('click', () => {
                document.getElementById(`module-${module.module_id}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            lessonsJumpRow.appendChild(pill);

            const block = document.createElement('div');
            block.className = 'module-block';
            block.id = `module-${module.module_id}`;

            const header = document.createElement('div');
            header.className = 'module-header';
            header.innerHTML = `
                <div class="module-flag-icon">${FLAG_ICON}</div>
                <div>
                    <h2>Module ${moduleIndex + 1}: ${module.module_name} ${module.is_new ? '<span class="new-badge">New</span>' : ''}</h2>
                    <p>${module.description || ''}</p>
                </div>
            `;
            block.appendChild(header);
            block.appendChild(buildModuleGate(module, moduleIndex));

            const railRow = document.createElement('div');
            railRow.className = 'lesson-rail-row';

            const rail = document.createElement('div');
            rail.className = 'lesson-rail';

            const list = document.createElement('div');
            list.className = 'lessons-list';

            module.lessons.forEach((lesson, lessonIndex) => {
                const isUnlocked = lesson.status !== 'locked';

                const railIcon = document.createElement('div');
                railIcon.className = `lesson-rail-icon ${isUnlocked ? 'unlocked' : 'locked'}`;
                railIcon.innerHTML = isUnlocked ? CHECK_ICON : LOCK_ICON;
                rail.appendChild(railIcon);

                if (lessonIndex < module.lessons.length - 1) {
                    const line = document.createElement('div');
                    line.className = `lesson-rail-line ${isUnlocked ? 'unlocked' : ''}`;
                    rail.appendChild(line);
                }

                const card = document.createElement('div');
                card.className = `lesson-card ${isUnlocked ? 'unlocked' : 'locked'}`;

                const baseLabel = lesson.has_exercise
                    ? `${lesson.activities_completed}/${lesson.activities_total} activities \u2022 Exercise ${lesson.exercise_completed ? '\u2713' : ''}`
                    : `${lesson.activities_completed}/${lesson.activities_total} activities`;
                // Module 85% gate: the lesson's own score once it's done.
                const activityLabel = (lesson.status === 'completed' && lesson.performance_percent !== null && lesson.performance_percent !== undefined)
                    ? `${baseLabel} \u2022 ${lesson.performance_percent}%`
                    : baseLabel;
                const needsRetake = module.needs_retake && lesson.missed > 0 && isUnlocked;

                const fillPercent = lesson.activities_total > 0
                    ? Math.round((lesson.activities_completed / lesson.activities_total) * 100)
                    : 0;

                card.innerHTML = `
                    <div class="lesson-card-main">
                        <div class="lesson-badges">
                            <span class="lesson-badge number">Lesson ${lessonIndex + 1}</span>
                            ${needsRetake
                                ? '<span class="lesson-badge status-retake">Needs retake</span>'
                                : `<span class="lesson-badge status-${lesson.status}">${statusLabel(lesson.status)}</span>`}
                            ${lesson.is_new ? '<span class="lesson-badge new-badge">New</span>' : ''}
                        </div>
                        <h3>${lesson.resource_title}</h3>
                        <div class="lesson-mini-progress-row">
                            <div class="lesson-mini-track"><div class="lesson-mini-fill" style="width:${fillPercent}%;"></div></div>
                            <span class="lesson-mini-label">${activityLabel}</span>
                        </div>
                    </div>
                    ${needsRetake ? `
                    <button type="button" class="lesson-action-btn action-retake">
                        ${RETAKE_ICON} Retake ${lesson.missed} missed
                    </button>` : `
                    <button type="button" class="lesson-action-btn ${isUnlocked ? 'action-unlocked' : 'action-locked'}" ${isUnlocked ? '' : 'disabled'}>
                        ${actionLabel(lesson.status)} ${isUnlocked ? CHEVRON_ICON : LOCK_ICON}
                    </button>`}
                `;

                if (needsRetake) {
                    card.querySelector('.lesson-action-btn').addEventListener('click', () => {
                        window.location.href = `/lesson-content?resource_id=${lesson.resource_id}&retake=1`;
                    });
                } else if (isUnlocked) {
                    card.querySelector('.lesson-action-btn').addEventListener('click', () => {
                        window.location.href = `/lesson-content?resource_id=${lesson.resource_id}`;
                    });
                }

                list.appendChild(card);
            });

            railRow.appendChild(rail);
            railRow.appendChild(list);
            block.appendChild(railRow);
            modulesContainer.appendChild(block);
        });
    }

    async function loadLessons() {
        if (!catId) {
            lessonsLoading.style.display = 'none';
            lessonsError.textContent = 'No chapter selected. Please go back to the Learning Map and pick a chapter.';
            lessonsError.style.display = 'block';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/lessons?cat_id=${encodeURIComponent(catId)}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Request failed');

            const data = await response.json();

            if (!data.success) throw new Error('Unexpected response shape');

            lessonsLoading.style.display = 'none';
            renderLessons(data);

        } catch (err) {
            console.error('Error loading lessons:', err);
            lessonsLoading.style.display = 'none';
            lessonsError.style.display = 'block';
        }
    }

    loadLessons();
});