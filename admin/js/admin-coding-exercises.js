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
        const createdToInput = document.getElementById("exerciseCreatedToInput");
        const createdRangeToggle = document.getElementById("exerciseCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearExerciseCreatedDateBtn");
        const updatedFromInput = document.getElementById("exerciseUpdatedFromInput");
        const updatedToInput = document.getElementById("exerciseUpdatedToInput");
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

        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
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
            if (status === "Archived") return `<span class="badge badge-inactive">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        function renderRows(exercises) {
            if (!exercises || exercises.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-muted table-empty-message">
                            No coding exercises found.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = exercises.map(ex => {
                const isPublished = ex.status === "Published";
                const btnLabel = isPublished ? "Unpublish" : "Publish";
                const btnClass = isPublished ? "btn-unpublish-custom" : "btn-success-custom";
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
                            <a href="/admin/coding-exercises/create?exercise_id=${escapeHtml(ex.exercise_id)}" title="Edit" class="table-action-icon"><i class="fa-solid fa-pen-to-square"></i></a>
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

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
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

        function setupDateFilterEvents(fromInput, toInput, rangeToggle, clearBtn) {
            if (fromInput) {
                fromInput.addEventListener("change", () => {
                    if (toInput && (!rangeToggle || !rangeToggle.checked)) {
                        toInput.value = fromInput.value;
                    }
                    fetchExercises(1);
                });
            }
            if (toInput) {
                toInput.addEventListener("change", () => fetchExercises(1));
            }
            if (rangeToggle) {
                rangeToggle.addEventListener("change", () => {
                    if (rangeToggle.checked) {
                        const today = new Date().toISOString().split("T")[0];
                        if (fromInput) fromInput.value = today;
                        if (toInput) toInput.value = today;
                    }
                    fetchExercises(1);
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                    if (fromInput) fromInput.value = "";
                    if (toInput) toInput.value = "";
                    if (rangeToggle) rangeToggle.checked = false;
                    clearDateFilterError();
                    fetchExercises(1);
                });
            }
        }

        setupDateFilterEvents(createdFromInput, createdToInput, createdRangeToggle, clearCreatedDateBtn);
        setupDateFilterEvents(updatedFromInput, updatedToInput, updatedRangeToggle, clearUpdatedDateBtn);

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
