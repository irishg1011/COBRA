/**
 * admin-learner-progress.js - Admin > Learner Progress (By Lesson)
 * --------------------------------------------------------------------
 * 1. Table: ONE ROW PER LESSON that has at least one learner record, in
 *    course order - Learners, Avg Score, Completed, Last Activity.
 *    Search (lesson, module or chapter name), Status, Chapter / Module,
 *    Started + Completed date ranges, pagination - live, no reload
 *    (/admin/learner-progress/data). Status and the dates decide which
 *    learner records are counted. Metric cards refresh every fetch.
 * 2. Eye button: the lesson's learners (#lessonLearnersModal,
 *    /admin/learner-progress/lessons/<resource_id>, same Status / dates).
 *    Each learner's eye opens the shared Lesson Progress modal on top
 *    (admin-lesson-progress-modal.js - also used by the By Learner page).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("progressSearchInput");
        const statusSelect = document.getElementById("progressStatusSelect");
        const chapterSelect = document.getElementById("progressChapterSelect");
        const moduleSelect = document.getElementById("progressModuleSelect");
        const startedFromInput = document.getElementById("progressStartedFromInput");
        const startedToInput = document.getElementById("progressStartedToInput");
        const clearStartedBtn = document.getElementById("clearProgressStartedDateBtn");
        const completedFromInput = document.getElementById("progressCompletedFromInput");
        const completedToInput = document.getElementById("progressCompletedToInput");
        const clearCompletedBtn = document.getElementById("clearProgressCompletedDateBtn");
        const dateFilterError = document.getElementById("progressDateFilterError");
        const tableBody = document.getElementById("progressTableBody");
        const showingCount = document.getElementById("progressShowingCount");
        const pageLabel = document.getElementById("progressPageLabel");
        const prevBtn = document.getElementById("progressPrevBtn");
        const nextBtn = document.getElementById("progressNextBtn");

        const metricEls = {
            total_records: document.getElementById("metricTotalRecords"),
            average_score: document.getElementById("metricAverageScore"),
            completed_100: document.getElementById("metricCompleted100"),
            below_80: document.getElementById("metricBelow80"),
        };

        if (!tableBody) return;

        // Read from the server-rendered template, never assumed.
        let currentPage = parseInt(tableBody.dataset.page || "1", 10);
        let totalPages = parseInt(tableBody.dataset.totalPages || "1", 10);
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function scoreBadgeHtml(score) {
            if (score === null || score === undefined) {
                return `<span class="progress-no-score">—</span>`;
            }
            return `<span class="badge ${CobraScore.badgeClass(score)}">${escapeHtml(score)}%</span>`;
        }

        function completionHtml(pct) {
            const value = Number(pct) || 0;
            return `
                <div class="completion-cell">
                    <progress class="completion-bar" value="${value}" max="100" aria-label="Completion ${value}%"></progress>
                    <span class="completion-pct">${value}%</span>
                </div>
            `;
        }

        function completeAtHtml(rec) {
            return rec.is_completed
                ? escapeHtml(rec.completed_at)
                : `<span class="progress-in-progress">In progress</span>`;
        }

        function showDateError(message) {
            if (!dateFilterError) return;
            dateFilterError.textContent = message;
            dateFilterError.classList.add("is-visible");
        }

        function clearDateError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
        }

        function validateDates() {
            clearDateError();
            const checks = [
                ["Started", startedFromInput, startedToInput],
                ["Completed", completedFromInput, completedToInput],
            ];
            for (const [label, fromInput, toInput] of checks) {
                const from = fromInput ? fromInput.value : "";
                const to = toInput ? toInput.value : "";
                if (from && to && from > to) {
                    showDateError(`${label}: the end date must be on or after the start date.`);
                    return false;
                }
            }
            return true;
        }

        // --- Chapter -> Module (options come from the server-rendered list) ---
        const allModules = moduleSelect
            ? Array.from(moduleSelect.querySelectorAll("option[data-cat-id]")).map((o) => ({
                value: o.value,
                label: o.textContent,
                catId: o.dataset.catId,
            }))
            : [];

        function rebuildModules(catId, keepValue) {
            if (!moduleSelect) return;
            const options = allModules.filter((m) => m.catId === catId);
            moduleSelect.innerHTML = `<option value="">All Modules</option>` + options
                .map((m) => `<option value="${escapeHtml(m.value)}" data-cat-id="${escapeHtml(m.catId)}">${escapeHtml(m.label)}</option>`)
                .join("");
            moduleSelect.disabled = !catId;
            moduleSelect.value = options.some((m) => m.value === keepValue) ? keepValue : "";
        }

        if (chapterSelect && moduleSelect) {
            rebuildModules(chapterSelect.value, moduleSelect.value);
        }

        // Status + dates: shared by the table and the lesson modal.
        function recordFilters() {
            return {
                status: statusSelect ? statusSelect.value : "",
                started_from: startedFromInput ? startedFromInput.value : "",
                started_to: startedToInput ? startedToInput.value : "",
                completed_from: completedFromInput ? completedFromInput.value : "",
                completed_to: completedToInput ? completedToInput.value : "",
            };
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            const values = {
                q: searchInput ? searchInput.value.trim() : "",
                cat_id: chapterSelect ? chapterSelect.value : "",
                module_id: moduleSelect && !moduleSelect.disabled ? moduleSelect.value : "",
                ...recordFilters(),
            };
            Object.keys(values).forEach((key) => {
                if (values[key]) params.set(key, values[key]);
            });
            params.set("page", String(page));
            return params;
        }

        function renderRows(lessons) {
            if (!lessons || lessons.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">No lessons found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = lessons.map((l) => `
                <tr data-resource-id="${escapeHtml(l.resource_id)}">
                    <td><strong class="table-item-title cell-truncate">${escapeHtml(l.lesson)}</strong></td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(l.module)}</span></td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(l.chapter)}</span></td>
                    <td>${escapeHtml(l.learners)}</td>
                    <td>${scoreBadgeHtml(l.avg_score)}</td>
                    <td>${escapeHtml(l.completed)}/${escapeHtml(l.learners)} learner${l.learners === 1 ? "" : "s"}</td>
                    <td>${escapeHtml(l.last_activity)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-lesson-btn" data-resource-id="${escapeHtml(l.resource_id)}" title="View learners" aria-label="View learners of ${escapeHtml(l.lesson)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                if (metricEls[key] && metrics[key] !== undefined) {
                    metricEls[key].textContent = metrics[key];
                }
                if (key === "average_score") CobraScore.apply(metricEls[key], metrics[key]);
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            if (showingCount) showingCount.textContent = `Showing ${countOnPage} of ${total} lesson${total === 1 ? "" : "s"}`;
            if (pageLabel) pageLabel.textContent = `${page} of ${pages}`;
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= pages;
        }

        async function fetchLessons(page = 1) {
            if (!validateDates()) return;

            const requestId = ++activeRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/data?${buildParams(page).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return; // a newer request already won

                const lessons = data.lessons || [];
                renderRows(lessons);
                updateMetrics(data.metrics);
                updatePagination(lessons.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-learner-progress: failed to load lessons:", err);
            }
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchLessons(page), DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch(1));
        if (statusSelect) statusSelect.addEventListener("change", () => fetchLessons(1));

        if (chapterSelect) {
            chapterSelect.addEventListener("change", () => {
                rebuildModules(chapterSelect.value, "");
                fetchLessons(1);
            });
        }
        if (moduleSelect) moduleSelect.addEventListener("change", () => fetchLessons(1));

        [startedFromInput, startedToInput, completedFromInput, completedToInput].forEach((input) => {
            if (input) input.addEventListener("change", () => fetchLessons(1));
        });

        function wireClear(btn, fromInput, toInput) {
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (fromInput) fromInput.value = "";
                if (toInput) toInput.value = "";
                clearDateError();
                fetchLessons(1);
            });
        }
        wireClear(clearStartedBtn, startedFromInput, startedToInput);
        wireClear(clearCompletedBtn, completedFromInput, completedToInput);

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchLessons(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchLessons(currentPage + 1);
            });
        }

        // ============================================================
        // 2. LESSON MODAL - every learner of one lesson
        // ============================================================
        const modal = document.getElementById("lessonLearnersModal");
        const modalTitle = document.getElementById("lessonLearnersTitle");
        const modalPath = document.getElementById("lessonLearnersPath");
        const modalNote = document.getElementById("lessonLearnersNote");
        const modalError = document.getElementById("lessonLearnersError");
        const modalBody = document.getElementById("lessonLearnersTableBody");
        const modalCloseBtn = document.getElementById("closeLessonLearnersBtn");
        let modalRequestId = 0;
        let lastFocused = null;

        function modalMessage(text) {
            if (modalBody) modalBody.innerHTML = `<tr><td colspan="7" class="text-muted table-empty-message">${escapeHtml(text)}</td></tr>`;
        }

        function setModalError(message) {
            if (!modalError) return;
            modalError.textContent = message || "";
            modalError.classList.toggle("is-visible", !!message);
        }

        function fillModal(data) {
            if (modalTitle) modalTitle.textContent = data.lesson;
            if (modalPath) modalPath.textContent = `${data.chapter} › ${data.module}`;
            const records = data.records || [];
            if (modalNote) {
                modalNote.textContent = `${records.length} learner${records.length === 1 ? "" : "s"}` +
                    (statusSelect && statusSelect.value ? " (matching the Status filter)" : "");
            }
            if (!records.length) {
                modalMessage("No learner records for this lesson with the current filters.");
                return;
            }
            modalBody.innerHTML = records.map((rec) => `
                <tr>
                    <td>${escapeHtml(rec.acc_id)}</td>
                    <td><div class="profile-cell">${window.CobraAvatar.html(rec.avatar_url)}<span>${escapeHtml(rec.name)}</span></div></td>
                    <td>${scoreBadgeHtml(rec.score)}</td>
                    <td>${completionHtml(rec.completion)}</td>
                    <td>${escapeHtml(rec.started_at)}</td>
                    <td>${completeAtHtml(rec)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-progress-btn" data-progress-id="${escapeHtml(rec.progress_id)}" title="View details" aria-label="View details for ${escapeHtml(rec.acc_id)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        async function openLesson(resourceId) {
            if (!modal) return;
            const requestId = ++modalRequestId;
            lastFocused = document.activeElement;
            setModalError("");
            if (modalTitle) modalTitle.textContent = "Loading…";
            if (modalPath) modalPath.textContent = "";
            if (modalNote) modalNote.textContent = "";
            modalMessage("Loading…");
            modal.classList.remove("modal-hidden");
            if (modalCloseBtn) modalCloseBtn.focus();

            const params = new URLSearchParams();
            const filters = recordFilters();
            Object.keys(filters).forEach((key) => { if (filters[key]) params.set(key, filters[key]); });

            try {
                const response = await fetch(`/admin/learner-progress/lessons/${encodeURIComponent(resourceId)}?${params.toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== modalRequestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
                fillModal(data);
            } catch (err) {
                if (requestId !== modalRequestId) return;
                if (modalTitle) modalTitle.textContent = "Lesson";
                modalMessage("");
                setModalError("Could not load this lesson's learners. Please close and try again.");
                console.error("admin-learner-progress: failed to load lesson learners:", err);
            }
        }

        function closeModal() {
            if (!modal || modal.classList.contains("modal-hidden")) return false;
            modalRequestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-lesson-btn");
            if (btn) openLesson(btn.dataset.resourceId);
        });

        // A learner's eye -> shared Lesson Progress modal, on top of this one
        if (modalBody) {
            modalBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-view-progress-btn");
                if (btn && window.CobraLessonProgressModal) {
                    window.CobraLessonProgressModal.open(btn.dataset.progressId);
                }
            });
        }

        if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal();
            });
        }
        // If the Lesson Progress modal on top just used this Escape, leave
        // this one open (it marks the event with preventDefault()).
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented && closeModal()) e.preventDefault();
        });
    });
})();
