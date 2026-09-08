/**
 * admin-archived-exercises.js - Task #117: Dedicated Archive Modal for Coding Exercises
 * -------------------------------------------------------------------------------------
 * Manages the Coding Exercises archive modal:
 *   - Tab 1: Coding Exercises
 *   - Real-time debounced search
 *   - Pagination
 *   - Restore action (reverts is_archived = 0, status = Draft)
 *   - Permanent Delete action (with confirmation prompt)
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const openBtn = document.getElementById("openArchivedExercisesBtn");
        const modal = document.getElementById("archivedExercisesModal");
        const closeBtn = document.getElementById("closeArchivedExercisesModal");
        const searchInput = document.getElementById("archivedExerciseSearchInput");

        const toggleExercisesBtn = document.getElementById("toggleArchivedExercisesBtn");
        const exercisesView = document.getElementById("archivedExercisesView");

        const exercisesTableBody = document.getElementById("archivedExercisesTableBody");
        const exercisesShowingCount = document.getElementById("archivedExercisesShowingCount");
        const exercisesPageLabel = document.getElementById("archivedExercisesPageLabel");
        const exercisesPrevBtn = document.getElementById("archivedExercisesPrevBtn");
        const exercisesNextBtn = document.getElementById("archivedExercisesNextBtn");

        if (!modal || !openBtn) return;

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function renderRows(items) {
            if (!exercisesTableBody) return;
            if (!items || items.length === 0) {
                exercisesTableBody.innerHTML = `<tr><td colspan="7" class="text-muted table-empty-message">No archived coding exercises found.</td></tr>`;
                return;
            }

            exercisesTableBody.innerHTML = items.map(ce => `
                <tr data-exercise-id="${ce.exercise_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(ce.exercise_title)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(ce.lesson_name)}</td>
                    <td class="text-muted">${escapeHtml(ce.category)}</td>
                    <td>${ce.points} pts</td>
                    <td><span class="badge badge-inactive">Archived</span></td>
                    <td class="text-muted">${escapeHtml(ce.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Restore" class="archive-action-icon restore-action js-restore-exercise" data-id="${ce.exercise_id}">
                                <i class="fa-solid fa-rotate-left"></i>
                            </a>
                            <a href="#" title="Permanently Delete" class="archive-action-icon delete-action js-permanent-delete-exercise" data-id="${ce.exercise_id}">
                                <i class="fa-solid fa-trash-can"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedExercises() {
            if (!exercisesTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/coding-exercises/archived?q=${encodeURIComponent(q)}&page=${currentPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    exercisesTableBody.innerHTML = `<tr><td colspan="7" class="text-muted table-empty-message">Could not load archived exercises.</td></tr>`;
                    return;
                }

                renderRows(result.exercises);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (exercisesShowingCount) exercisesShowingCount.textContent = `Showing ${result.exercises.length} of ${result.total} Archived Exercises`;
                if (exercisesPageLabel) exercisesPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (exercisesPrevBtn) exercisesPrevBtn.disabled = result.page <= 1;
                if (exercisesNextBtn) exercisesNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                exercisesTableBody.innerHTML = `<tr><td colspan="7" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadArchivedExercises, DEBOUNCE_MS);
        }

        if (openBtn) {
            openBtn.addEventListener("click", () => {
                modal.style.display = "flex";
                if (searchInput) searchInput.value = "";
                currentPage = 1;
                loadArchivedExercises();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
        }

        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none";
        });

        if (searchInput) {
            searchInput.addEventListener("input", () => scheduleLoad(true));
        }

        if (exercisesPrevBtn) {
            exercisesPrevBtn.addEventListener("click", () => {
                if (currentPage > 1) { currentPage--; loadArchivedExercises(); }
            });
        }
        if (exercisesNextBtn) {
            exercisesNextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) { currentPage++; loadArchivedExercises(); }
            });
        }

        function refreshMainExercisesTable() {
            const mainSearch = document.getElementById("exerciseSearchInput");
            if (mainSearch) {
                mainSearch.dispatchEvent(new Event("input"));
            } else {
                window.location.reload();
            }
        }

        async function handleActionClick(e) {
            const restoreBtn = e.target.closest(".js-restore-exercise");
            const deleteBtn = e.target.closest(".js-permanent-delete-exercise");

            if (restoreBtn) {
                e.preventDefault();
                const id = restoreBtn.dataset.id;
                if (!confirm("Are you sure you want to restore this coding exercise?")) return;

                restoreBtn.style.pointerEvents = "none";
                try {
                    const resp = await fetch(`/admin/coding-exercises/${id}/restore`, {
                        method: "POST",
                        credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message || "Could not restore coding exercise.");
                    } else {
                        alert(result.message || "Coding exercise restored successfully.");
                        loadArchivedExercises();
                        refreshMainExercisesTable();
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                } finally {
                    restoreBtn.style.pointerEvents = "";
                }
                return;
            }

            if (deleteBtn) {
                e.preventDefault();
                const id = deleteBtn.dataset.id;
                const confirmed = confirm(
                    "Are you sure you want to permanently delete this coding exercise? " +
                    "This action cannot be undone and will permanently remove the exercise and all its test cases from the system."
                );
                if (!confirmed) return;

                deleteBtn.style.pointerEvents = "none";
                try {
                    const resp = await fetch(`/admin/coding-exercises/${id}/permanent-delete`, {
                        method: "POST",
                        credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message || "Could not permanently delete coding exercise.");
                    } else {
                        alert(result.message || "Coding exercise permanently deleted.");
                        loadArchivedExercises();
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                } finally {
                    deleteBtn.style.pointerEvents = "";
                }
            }
        }

        if (exercisesTableBody) {
            exercisesTableBody.addEventListener("click", handleActionClick);
        }
    });
})();
