/**
 * admin-coding-exercises.js - Multi-Field Search + Stats Filter +
 * Date Sorting/Filtering for Manage Coding Exercises
 * --------------------------------------------------------------------
 * Wires up the Manage Coding Exercises toolbar - the search box, the
 * database-driven "All Statuses" dropdown, the Sort dropdown (Newest
 * First / Oldest First / Recently Updated / Title A-Z), and pagination
 * to the backend endpoint (/admin/coding-exercises/data) so the table
 * updates live with no page reload.
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

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

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
                        <td colspan="9" class="text-muted table-empty-message">
                            No coding exercises found.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = exercises.map(ex => `
                <tr data-exercise-id="${escapeHtml(ex.exercise_id)}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(ex.exercise_title)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(ex.category)}</td>
                    <td class="text-muted">${escapeHtml(ex.module)}</td>
                    <td class="text-muted">${escapeHtml(ex.lesson)}</td>
                    <td>${statusBadgeHtml(ex.status)}</td>
                    <td class="text-muted">${escapeHtml(ex.uploaded_by)}</td>
                    <td class="text-muted">${escapeHtml(ex.created_at)}</td>
                    <td class="text-muted">${escapeHtml(ex.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="/admin/coding-exercises/create?exercise_id=${escapeHtml(ex.exercise_id)}" title="Edit" class="table-action-icon"><i class="fa-solid fa-pen-to-square"></i></a>
                            <form action="/admin/coding-exercises/delete/${escapeHtml(ex.exercise_id)}" method="POST" class="inline-form" onsubmit="return confirm('Are you sure you want to delete this coding exercise?');">
                                <button type="submit" title="Delete" class="table-action-icon delete-action icon-button-reset"><i class="fa-solid fa-trash"></i></button>
                            </form>
                        </div>
                    </td>
                </tr>
            `).join("");
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
            const requestId = ++activeRequestId;

            const params = new URLSearchParams();
            const q = searchInput ? searchInput.value.trim() : "";
            const stats = statsSelect ? statsSelect.value : "";
            const sort = sortSelect ? sortSelect.value : "";

            if (q) params.set("q", q);
            if (stats) params.set("stats", stats);
            if (sort) params.set("sort", sort);
            params.set("page", String(page));

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
