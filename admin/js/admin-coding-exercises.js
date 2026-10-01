/**
 * admin-coding-exercises.js - Multi-Field Search + Status Filter +
 * Date Filtering for Manage Coding Exercises (Task #114)
 * --------------------------------------------------------------------
 * Wires up the Manage Coding Exercises toolbar - the search box, the
 * database-driven "All Statuses" dropdown, and Created At / Updated At date
 * filters to the backend endpoint (/admin/coding-exercises/data) so the
 * table updates live with no page reload.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("exerciseSearchInput");
        const statsSelect = document.getElementById("exerciseStatsSelect");
        const sortSelect = document.getElementById("exerciseSortSelect");
        const tableBody = document.getElementById("exercisesTableBody");
        const showingCount = document.getElementById("exercisesShowingCount");
        const pageLabel = document.getElementById("exercisesPageLabel");
        const prevBtn = document.getElementById("exercisesPrevBtn");
        const nextBtn = document.getElementById("exercisesNextBtn");

        if (!tableBody) return;

        const createdFromInput = document.getElementById("exerciseCreatedFromInput");
        const createdRangeToggle = document.getElementById("exerciseCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearExerciseCreatedDateBtn");
        const updatedFromInput = document.getElementById("exerciseUpdatedFromInput");
        const updatedRangeToggle = document.getElementById("exerciseUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearExerciseUpdatedDateBtn");
        const dateFilterError = document.getElementById("exerciseDateFilterError");

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function showDateFilterError(message) {
            if (!dateFilterError) { alert(message); return; }
            dateFilterError.textContent = message;
            dateFilterError.style.display = "block";
        }

        function clearDateFilterError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.style.display = "none";
        }

        // A single picked date filters that one day (from = to).
        function getEffectiveDateRange(fromInput) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            return { from, to: from };
        }

        // Today's LOCAL date as YYYY-MM-DD (never toISOString(), which
        // is UTC and lands on yesterday before 8 AM in UTC+8).
        function getTodayLocalDate() {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, "0");
            const d = String(now.getDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
        }

        // "2026-10-01" -> "Oct 1, 2026"
        function formatFilterDate(value) {
            const [y, m, d] = value.split("-").map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }

        function describeFilterDay(value) {
            return value === getTodayLocalDate() ? "today" : `on ${formatFilterDate(value)}`;
        }

        function getEmptyMessage() {
            const created = createdFromInput ? createdFromInput.value : "";
            const updated = updatedFromInput ? updatedFromInput.value : "";
            if (created && updated) return "No coding exercises match these date filters.";
            if (created) return `No coding exercises created ${describeFilterDay(created)}.`;
            if (updated) return `No coding exercises updated ${describeFilterDay(updated)}.`;
            return "No coding exercises found.";
        }

        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput);
            if (updated.from && updated.to && updated.from > updated.to) {
                showDateFilterError("Updated At: end date must be on or after the start date.");
                return false;
            }

            return true;
        }

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function statusBadgeHtml(status) {
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Ready to Publish") return `<span class="badge badge-ready">${escapeHtml(status)}</span>`;
            if (status === "Archived") return `<span class="badge badge-inactive">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        function renderRows(exercises) {
            if (!exercises || exercises.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-muted table-empty-message">
                            ${escapeHtml(getEmptyMessage())}
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = exercises.map(ex => {
                // Same three states as the server-rendered
                // coding-exercises.html Publish Action column.
                let btnLabel, btnClass;
                if (ex.status === "Published") { btnLabel = "Unpublish"; btnClass = "btn-unpublish-custom"; }
                else if (ex.status === "Ready to Publish") { btnLabel = "Move to Draft"; btnClass = "btn-movedraft-custom"; }
                else { btnLabel = "Ready to Publish"; btnClass = "btn-ready-custom"; }
                return `
                <tr data-exercise-id="${escapeHtml(ex.exercise_id)}">
                    <td>
                        <strong class="table-item-title cell-truncate">${escapeHtml(ex.exercise_title)}</strong>
                    </td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(ex.category)}</span></td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(ex.module)}</span></td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(ex.lesson)}</span></td>
                    <td class="js-status-cell">${statusBadgeHtml(ex.status)}</td>
                    <td class="text-muted"><span class="cell-truncate-1 cell-truncate--sm">${escapeHtml(ex.uploaded_by)}</span></td>
                    <td class="text-muted">${escapeHtml(ex.created_at)}</td>
                    <td class="text-muted">${escapeHtml(ex.updated_at)}</td>
                    <td class="text-right exercise-actions-column">
                        <div class="table-actions-group">
                            <a href="#" title="Preview" class="table-action-icon js-preview-exercise-btn" data-exercise-id="${escapeHtml(ex.exercise_id)}" data-exercise-title="${escapeHtml(ex.exercise_title)}"><i class="fa-regular fa-eye"></i></a>
                            <a href="/admin/coding-exercises/create?exercise_id=${escapeHtml(ex.exercise_id)}" title="Edit" class="table-action-icon"><i class="fa-solid fa-pen-to-square"></i></a>
                            <a href="#" title="Name history" class="table-action-icon js-title-history" data-scope="exercise" data-id="${escapeHtml(ex.exercise_id)}"><i class="fa-solid fa-clock-rotate-left"></i></a>
                            <a href="#" title="Archive"
                               class="table-action-icon delete-action js-archive-exercise-btn"
                               data-exercise-id="${escapeHtml(ex.exercise_id)}">
                                <i class="fa-solid fa-box-archive"></i>
                            </a>
                        </div>
                    </td>
                    <td class="text-right publish-status-column">
                        <button type="button"
                                class="btn ${btnClass} js-toggle-exercise-publish-btn"
                                data-exercise-id="${escapeHtml(ex.exercise_id)}"
                                data-status="${escapeHtml(ex.status || 'Draft')}"
                                data-module-status="${escapeHtml(ex.module_status || 'Draft')}">
                            ${btnLabel}
                        </button>
                    </td>
                </tr>
            `}).join("");

            // Task #124: post-restore row highlight - flashRestoredRow()
            // consumes (reads then clears) window.cobraByteHighlightRestoredId,
            // a shared, well-known signal set by admin-archived-exercises.js
            // right before it triggers this table's own reload, since the
            // restore itself happens in a completely different script/modal.
            flashRestoredRow(tableBody, `tr[data-exercise-id="${window.cobraByteHighlightRestoredId}"]`);
        }

        // Task #124: duplicated as a small, self-contained helper in each
        // admin table's own render file (rather than a shared module),
        // matching this project's existing convention - each file already
        // owns its row template and knows exactly when its own rows exist
        // in the DOM.
        function flashRestoredRow(container, selector) {
            if (!container || !window.cobraByteHighlightRestoredId) return;
            const row = container.querySelector(selector);
            window.cobraByteHighlightRestoredId = null;
            if (!row) return;
            row.classList.add("row-restored-highlight");
            setTimeout(() => row.classList.remove("row-restored-highlight"), 4000);
        }

        function updatePagination(total, page, pages) {
            currentPage = page;
            totalPages = pages;

            if (showingCount) {
                const countOnPage = tableBody.querySelectorAll("tr:not(:has(.table-empty-message))").length;
                showingCount.textContent = `Showing ${countOnPage} of ${total} Exercises`;
            }

            if (pageLabel) {
                pageLabel.textContent = `${page} of ${pages}`;
            }

            if (prevBtn) {
                prevBtn.disabled = (page <= 1);
            }
            if (nextBtn) {
                nextBtn.disabled = (page >= pages);
            }
        }

        async function fetchExercises(page = 1) {
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;

            const params = new URLSearchParams();
            const q = searchInput ? searchInput.value.trim() : "";
            const stats = statsSelect ? statsSelect.value : "";
            const sort = sortSelect ? sortSelect.value : "";

            if (q) params.set("q", q);
            if (stats) params.set("stats", stats);
            if (sort) params.set("sort", sort);
            params.set("page", String(page));

            const created = getEffectiveDateRange(createdFromInput);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            try {
                const response = await fetch(`/admin/coding-exercises/data?${params.toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return; // Stale response

                renderRows(data.exercises || []);
                updatePagination(data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-coding-exercises: failed to fetch live data:", err);
            }
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchExercises(page), DEBOUNCE_MS);
        }

        if (searchInput) {
            searchInput.addEventListener("input", () => scheduleFetch(1));
        }

        if (statsSelect) {
            statsSelect.addEventListener("change", () => fetchExercises(1));
        }

        if (sortSelect) {
            sortSelect.addEventListener("change", () => fetchExercises(1));
        }

        // "Today" checkbox: a shortcut that fills/clears the date input.
        // It stays ticked only while the picked date IS today.
        function setupDateFilterEvents(fromInput, todayToggle, clearBtn) {
            const syncTodayToggle = () => {
                if (!todayToggle) return;
                todayToggle.checked = !!(fromInput && fromInput.value) && fromInput.value === getTodayLocalDate();
            };
            syncTodayToggle();

            if (fromInput) {
                fromInput.addEventListener("change", () => {
                    syncTodayToggle();
                    fetchExercises(1);
                });
            }
            if (todayToggle) {
                todayToggle.addEventListener("change", () => {
                    if (fromInput) fromInput.value = todayToggle.checked ? getTodayLocalDate() : "";
                    clearDateFilterError();
                    fetchExercises(1);
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                    if (fromInput) fromInput.value = "";
                    if (todayToggle) todayToggle.checked = false;
                    clearDateFilterError();
                    fetchExercises(1);
                });
            }
        }

        setupDateFilterEvents(createdFromInput, createdRangeToggle, clearCreatedDateBtn);
        setupDateFilterEvents(updatedFromInput, updatedRangeToggle, clearUpdatedDateBtn);

        // feat/module-title-history: a reverted name shows up right away.
        document.addEventListener("cobra:title-changed", () => fetchExercises(currentPage));

        // feat/admin-real-game-preview: eye icon -> the REAL learner exercise
        // screen in a popup (admin-preview-frame.js). Delegated, so it works
        // for the server-rendered rows and the ones renderRows() builds.
        tableBody.addEventListener("click", (e) => {
            const previewBtn = e.target.closest(".js-preview-exercise-btn");
            if (!previewBtn) return;
            e.preventDefault();
            window.CobraPreviewFrame.open(
                `exercise_id=${encodeURIComponent(previewBtn.dataset.exerciseId)}`,
                previewBtn.dataset.exerciseTitle || "Coding Exercise"
            );
        });

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchExercises(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchExercises(currentPage + 1);
            });
        }
    });
})();
