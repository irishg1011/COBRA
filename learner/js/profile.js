/*
 * profile.js - learner View Profile page (/profile)
 * Loads /api/profile/overview (which also awards any newly earned
 * badges) and renders the hero, Topic Performance Breakdown, Your Stats,
 * Areas to Improve and the Badges & Achievements tab.
 * Badges are fetched from the database (badges_tbl) - mentors create
 * them on Mentor > Achievements; nothing about a badge is hardcoded here.
 * Styles: learner/css/profile.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const TYPE_LABELS = [
        ['mcq', 'Multiple Choice Quiz'],
        ['flashcards', 'Flashcards'],
        ['fib', 'Fill in the Blanks'],
    ];

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Bar widths are CSS classes in 5% steps (no inline styles).
    function barClass(percent) {
        const p = Math.max(0, Math.min(100, Number(percent) || 0));
        return `bar-w-${Math.round(p / 5) * 5}`;
    }

    function pct(value) {
        return value == null ? '-' : `${value}%`;
    }

    function hours(value) {
        const h = Number(value) || 0;
        return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
    }

    // ---------------- Renderers ----------------
    function renderHero(data) {
        const { profile, stats } = data;
        $('profileName').textContent = profile.full_name;
        $('profileUsername').textContent = `@${profile.username}`;
        $('heroHours').textContent = hours(stats.hours);
        $('heroBadges').textContent = `${stats.badges_earned}/${stats.badges_total}`;
        $('heroOverall').textContent = `${stats.overall_completion}%`;
        $('heroLessons').textContent = `${stats.lessons_completed}/${stats.lessons_total}`;
        document.title = `CobraByte - ${profile.full_name}`;

        // feat/profile-photo: the uploaded photo replaces the default icon.
        // A photo whose file is gone puts the icon back (no broken image).
        const heroAvatar = document.querySelector('.profile-hero-avatar');
        if (heroAvatar && profile.avatar_url) {
            const icon = heroAvatar.innerHTML;
            heroAvatar.classList.add('has-photo');
            heroAvatar.innerHTML = `<img class="profile-hero-photo" src="${esc(profile.avatar_url)}" alt="">`;
            heroAvatar.querySelector('img').addEventListener('error', () => {
                heroAvatar.classList.remove('has-photo');
                heroAvatar.innerHTML = icon;
            }, { once: true });
        }
    }

    function renderStats(stats) {
        $('statScore').textContent = pct(stats.average_score);
        $('statOverall').textContent = `${stats.overall_completion}%`;
        $('statLessons').textContent = `${stats.lessons_completed}/${stats.lessons_total}`;
        $('statBadges').textContent = `${stats.badges_earned}/${stats.badges_total}`;
        $('statHours').textContent = hours(stats.hours);
    }

    function renderTopics(topics, passPercent) {
        const list = $('topicList');
        if (!topics.length) {
            list.innerHTML = '<p class="topic-empty">No chapters are published yet.</p>';
            return;
        }
        list.innerHTML = topics.map((t) => {
            const percentClass = t.percent == null ? 'is-empty' : (t.percent < passPercent ? 'is-low' : '');
            const types = TYPE_LABELS.map(([key, label]) => {
                const value = t.types[key];
                return `
                    <div class="type-bar">
                        <div class="type-bar-label"><span>${label}</span><span>${pct(value)}</span></div>
                        <div class="bar-track"><div class="bar-fill ${barClass(value)}"></div></div>
                    </div>`;
            }).join('');
            return `
                <div class="topic-row">
                    <div class="topic-row-head">
                        <span class="topic-icon" aria-hidden="true"><i class="fa-solid ${esc(t.icon)}"></i></span>
                        <div class="topic-name-wrap">
                            <div class="topic-name">${esc(t.name)}</div>
                            <div class="topic-lessons">${t.lessons_completed}/${t.lessons_total} lessons</div>
                        </div>
                        <span class="topic-percent ${percentClass}">${pct(t.percent)}</span>
                    </div>
                    <div class="topic-types">${types}</div>
                </div>`;
        }).join('');
    }

    function renderAreas(areas, passPercent) {
        const list = $('areaList');
        if (!areas.length) {
            list.innerHTML = `<p class="area-empty">No chapter is below ${passPercent}% right now.</p>`;
            return;
        }
        list.innerHTML = areas.map((a) => `
            <a class="area-item" href="/lessons?cat_id=${encodeURIComponent(a.cat_id)}">
                <span class="area-icon" aria-hidden="true"><i class="fa-solid ${esc(a.icon)}"></i></span>
                <span class="area-body">
                    <span class="area-name">${esc(a.name)}</span>
                    <span class="area-bar-row">
                        <span class="bar-track"><span class="bar-fill ${barClass(a.percent)}"></span></span>
                        <span class="area-percent">${a.percent}%</span>
                    </span>
                </span>
                <i class="fa-solid fa-chevron-right area-chevron" aria-hidden="true"></i>
            </a>`).join('');
    }

    // Badges come from the database (made by mentors on Mentor > Achievements).
    // Earned: the mentor's uploaded image (or the old Font Awesome icon when
    // the badge has no image). Locked: the lock.
    function badgeIconHtml(b) {
        if (!b.earned) return '<i class="fa-solid fa-lock"></i>';
        if (b.icon_url) return `<img class="badge-icon-img" src="${esc(b.icon_url)}" alt="">`;
        return `<i class="fa-solid ${esc(b.icon || 'fa-award')}"></i>`;
    }

    function renderBadges(badges, stats) {
        const grid = $('badgeGrid');
        $('badgesCount').textContent = `${stats.badges_earned} of ${stats.badges_total} earned`;
        if (!badges.length) {
            grid.innerHTML = '<p class="badge-empty">No badges are available yet.</p>';
            return;
        }
        // A locked badge shows how to earn it; an earned one shows its description.
        grid.innerHTML = badges.map((b) => `
            <div class="badge-card ${b.earned ? '' : 'is-locked'}">
                <div class="badge-medal" aria-hidden="true"${b.earned && b.color ? ` data-badge-color="${esc(b.color)}"` : ''}>
                    ${badgeIconHtml(b)}
                </div>
                <div class="badge-name">${esc(b.name)}</div>
                <div class="badge-desc">${esc(b.earned ? b.description : (b.criteria || b.description))}</div>
                <div class="badge-date">${b.earned ? `Earned ${esc(b.earned_at)}` : 'Locked'}</div>
            </div>`).join('');

        // The badge's color goes into the --badge-color variable used by
        // profile.css (.badge-medal.has-color) - no inline styles in the HTML.
        grid.querySelectorAll('[data-badge-color]').forEach((medal) => {
            if (!/^#[0-9a-f]{6}$/i.test(medal.dataset.badgeColor)) return;
            medal.style.setProperty('--badge-color', medal.dataset.badgeColor);
            medal.classList.add('has-color');
        });
    }

    // ---------------- Tabs ----------------
    const tabs = [
        { tab: $('tabAnalytics'), panel: $('panelAnalytics') },
        { tab: $('tabBadges'), panel: $('panelBadges') },
    ];

    function selectTab(index, focus) {
        tabs.forEach((t, i) => {
            const active = i === index;
            t.tab.classList.toggle('is-active', active);
            t.tab.setAttribute('aria-selected', active ? 'true' : 'false');
            t.tab.tabIndex = active ? 0 : -1;
            t.panel.hidden = !active;
        });
        if (focus) tabs[index].tab.focus();
    }

    tabs.forEach((t, i) => {
        t.tab.addEventListener('click', () => selectTab(i, false));
        t.tab.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                selectTab(next, true);
            }
        });
    });

    if (window.location.hash === '#badges') selectTab(1, false);

    // ---------------- Load ----------------
    fetch('/api/profile/overview', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (!data || !data.success) throw new Error(data && data.message);
            renderHero(data);
            renderStats(data.stats);
            renderTopics(data.topics, data.pass_percent);
            renderAreas(data.areas_to_improve, data.pass_percent);
            renderBadges(data.badges, data.stats);
            $('profileLoading').hidden = true;
            $('profileContent').hidden = false;
        })
        .catch(() => {
            $('profileLoading').hidden = true;
            $('profileError').hidden = false;
        });
});