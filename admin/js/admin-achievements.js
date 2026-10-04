/**
 * admin-achievements.js - Mentor > Achievements (Achievement Tracking)
 * --------------------------------------------------------------------
 * 1. Stat cards + the two tabs (Badges / Earned Badges): live search,
 *    status filter, date range and pagination, no page reload
 *    (/admin/achievements/data).
 * 2. Create Badge / Edit Badge modal (#badgeFormModal): icon upload
 *    with preview, color swatches, live Badge Preview. Posts a
 *    multipart form to /admin/achievements/badges[/<id>].
 *    Required Value has a ceiling for the requirement types that count
 *    content (lessons, modules, chapters, activities, coding exercises):
 *    it can not be more than what is PUBLISHED right now. The ceilings
 *    come from the server with every data load (requirement_limits).
 * 3. Archive / Restore from a row, through the shared
 *    #confirmActionModal (/admin/achievements/badges/<id>/archive|restore).
 * 4. View Awarded Badges modal (#awardedBadgesModal): learner search +
 *    learner dropdown, its own pagination.
 *
 * The server checks every rule again (achievements.py) - the checks
 * here only save the mentor a round trip.
 *
 * Badge colors: elements carry data-badge-color="#rrggbb" and
 * applyBadgeColors() copies it into the --badge-color CSS variable
 * (achievements.css) - no inline styles in any HTML string.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const TOAST_MS = 2500;
    const MAX_ICON_BYTES = 1024 * 1024;
    const ICON_TYPES = ["image/png", "image/jpeg", "image/webp"];
    const ICON_NAME = /\.(png|jpe?g|webp)$/i;
    const ICON_MAX_SIDE = 256;    // px - a badge icon is never shown larger than this
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;
    const DATA_URL = "/admin/achievements/data";
    const BADGES_URL = "/admin/achievements/badges";

    document.addEventListener("DOMContentLoaded", () => {
        const badgesBody = document.getElementById("achBadgesTableBody");
        const earnedBody = document.getElementById("achEarnedTableBody");
        if (!badgesBody || !earnedBody) return;

        // ============================================================
        // Shared helpers
        // ============================================================
        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML.replace(/"/g, "&quot;");
        }

        // data-badge-color -> --badge-color (see achievements.css)
        function setBadgeColor(el, color) {
            if (!el) return;
            if (HEX_COLOR.test(color || "")) {
                el.dataset.badgeColor = color;
                el.style.setProperty("--badge-color", color);
            } else {
                delete el.dataset.badgeColor;
                el.style.removeProperty("--badge-color");
            }
        }

        function applyBadgeColors(root) {
            root.querySelectorAll("[data-badge-color]").forEach((el) => setBadgeColor(el, el.dataset.badgeColor));
        }

        // Icon tile: the uploaded image, or the old Font Awesome icon when a badge has none.
        function iconTileHtml(item, sizeClass = "") {
            const inner = item.icon_url
                ? `<img src="${escapeHtml(item.icon_url)}" alt="">`
                : `<i class="fa-solid ${escapeHtml(item.icon)}" aria-hidden="true"></i>`;
            return `<span class="ach-icon-tile ${sizeClass}" data-badge-color="${escapeHtml(item.color)}">${inner}</span>`;
        }

        function emptyRow(colspan, message) {
            return `
                <tr>
                    <td colspan="${colspan}" class="text-muted table-empty-message">${escapeHtml(message)}</td>
                </tr>`;
        }

        async function getJson(params) {
            const response = await fetch(`${DATA_URL}?${params.toString()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }

        // --- Toast: reuses .changes-saved-toast (success) / .resource-popup-alert (error) ---
        let toastTimer = null;
        function showToast(message, isError = false) {
            const id = isError ? "achErrorToast" : "achSuccessToast";
            let toast = document.getElementById(id);
            if (!toast) {
                toast = document.createElement("div");
                toast.id = id;
                toast.className = isError ? "resource-popup-alert" : "changes-saved-toast";
                toast.setAttribute("role", isError ? "alert" : "status");
                document.body.appendChild(toast);
            }
            const icon = isError ? "fa-circle-exclamation" : "fa-circle-check";
            toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
            toast.classList.add("show");
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove("show"), TOAST_MS);
        }

        // --- Shared #confirmActionModal as a promise (true = confirmed) ---
        const confirmModal = document.getElementById("confirmActionModal");
        const confirmTitle = document.getElementById("confirmActionTitle");
        const confirmText = document.getElementById("confirmActionText");
        const confirmCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmOkBtn = document.getElementById("confirmActionConfirmBtn");
        const confirmIcon = confirmModal ? confirmModal.querySelector(".modal-confirm-icon") : null;
        let confirmResolve = null;

        function askConfirm({ title, text, confirmLabel, danger }) {
            if (!confirmModal) return Promise.resolve(false);
            confirmTitle.textContent = title;
            confirmText.textContent = text;
            confirmOkBtn.textContent = confirmLabel;
            confirmOkBtn.classList.toggle("modal-btn-danger", danger);
            confirmOkBtn.classList.toggle("modal-btn-save", !danger);
            if (confirmIcon) {
                confirmIcon.classList.toggle("modal-confirm-icon-danger", danger);
                confirmIcon.classList.toggle("modal-confirm-icon-info", !danger);
            }
            confirmModal.classList.remove("modal-hidden");
            confirmCancelBtn.focus();
            return new Promise((resolve) => { confirmResolve = resolve; });
        }

        function settleConfirm(result) {
            if (!confirmResolve) return false;
            confirmModal.classList.add("modal-hidden");
            const resolve = confirmResolve;
            confirmResolve = null;
            resolve(result);
            return true;
        }

        if (confirmModal) {
            confirmOkBtn.addEventListener("click", () => settleConfirm(true));
            confirmCancelBtn.addEventListener("click", () => settleConfirm(false));
            confirmModal.addEventListener("click", (e) => {
                if (e.target === confirmModal) settleConfirm(false);
            });
        }

        // ============================================================
        // 1. STAT CARDS + TABS + TABLES
        // ============================================================
        const tabButtons = Array.from(document.querySelectorAll(".ach-tab"));
        const panels = {
            badges: document.getElementById("achPanelBadges"),
            earned: document.getElementById("achPanelEarned"),
        };
        const searchInput = document.getElementById("achSearchInput");
        const statusSelect = document.getElementById("achStatusSelect");
        const dateLabel = document.getElementById("achDateLabel");
        const dateFromInput = document.getElementById("achDateFromInput");
        const dateToInput = document.getElementById("achDateToInput");
        const clearDateBtn = document.getElementById("clearAchDateBtn");
        const dateFilterError = document.getElementById("achDateFilterError");
        const showingCount = document.getElementById("achShowingCount");
        const pageLabel = document.getElementById("achPageLabel");
        const prevBtn = document.getElementById("achPrevBtn");
        const nextBtn = document.getElementById("achNextBtn");

        const metricEls = {
            total_badges: document.getElementById("metricTotalBadges"),
            badges_awarded: document.getElementById("metricBadgesAwarded"),
            unique_earners: document.getElementById("metricUniqueEarners"),
            avg_per_earner: document.getElementById("metricAvgPerEarner"),
        };

        const TAB_TEXT = {
            badges: { search: "Search badges...", date: "Created", noun: "badges" },
            earned: { search: "Search by learner ID or badge...", date: "Earned", noun: "earned badges" },
        };

        let currentTab = "badges";
        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;
        const badgesById = new Map();   // rows on screen, for the Edit modal

        function validateDates() {
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
            if (dateFromInput.value && dateToInput.value && dateFromInput.value > dateToInput.value) {
                dateFilterError.textContent = `${TAB_TEXT[currentTab].date} date: the end date must be on or after the start date.`;
                dateFilterError.classList.add("is-visible");
                return false;
            }
            return true;
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            params.set("tab", currentTab);
            const q = searchInput.value.trim();
            if (q) params.set("q", q);
            if (statusSelect.value) params.set("status", statusSelect.value);
            if (dateFromInput.value) params.set("date_from", dateFromInput.value);
            if (dateToInput.value) params.set("date_to", dateToInput.value);
            params.set("page", String(page));
            return params;
        }

        function renderBadgeRows(rows) {
            badgesById.clear();
            if (!rows.length) {
                badgesBody.innerHTML = emptyRow(6, "No badges found. Use Create Badges to add one.");
                return;
            }
            rows.forEach((badge) => badgesById.set(String(badge.badge_id), badge));

            badgesBody.innerHTML = rows.map((badge) => {
                const id = escapeHtml(badge.badge_id);
                const name = escapeHtml(badge.name);
                const archivedTag = badge.is_archived ? ' <span class="badge badge-inactive">Archived</span>' : "";
                const toggleBtn = badge.is_archived
                    ? `<button type="button" class="table-action-icon ach-action-btn js-restore-badge" data-badge-id="${id}" title="Restore" aria-label="Restore ${name}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>`
                    : `<button type="button" class="table-action-icon delete-action ach-action-btn js-archive-badge" data-badge-id="${id}" title="Archive" aria-label="Archive ${name}"><i class="fa-solid fa-box-archive" aria-hidden="true"></i></button>`;
                return `
                    <tr data-badge-id="${id}" class="${badge.is_archived ? "ach-row-archived" : ""}">
                        <td>
                            <span class="ach-badge-cell">
                                ${iconTileHtml(badge)}
                                <span class="ach-badge-name cell-truncate-1">${name}</span>${archivedTag}
                            </span>
                        </td>
                        <td><span class="cell-truncate">${escapeHtml(badge.description)}</span></td>
                        <td><span class="cell-truncate">${escapeHtml(badge.criteria)}</span></td>
                        <td><span class="ach-count-pill ${badge.earners > 0 ? "has-earners" : ""}">${escapeHtml(badge.earners)}</span></td>
                        <td>${escapeHtml(badge.created_at)}</td>
                        <td>
                            <div class="table-actions-group">
                                <button type="button" class="table-action-icon ach-action-btn js-edit-badge" data-badge-id="${id}" title="Edit" aria-label="Edit ${name}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>
                                ${toggleBtn}
                            </div>
                        </td>
                    </tr>`;
            }).join("");
            applyBadgeColors(badgesBody);
        }

        // Shared by the Earned Badges tab and the View Awarded Badges modal.
        function earnedRowsHtml(rows, emptyMessage) {
            if (!rows.length) return emptyRow(3, emptyMessage);
            return rows.map((row) => `
                <tr>
                    <td>
                        ${escapeHtml(row.acc_id)}
                        ${row.learner_name ? `<span class="ach-learner-name">${escapeHtml(row.learner_name)}</span>` : ""}
                    </td>
                    <td>
                        <span class="ach-earned-pill ${row.is_archived ? "is-archived" : ""}">
                            ${iconTileHtml(row, "ach-icon-tile--sm")}
                            ${escapeHtml(row.badge_name)}
                        </span>
                    </td>
                    <td>${escapeHtml(row.earned_at)}</td>
                </tr>`).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                if (metricEls[key] && metrics[key] !== undefined) metricEls[key].textContent = metrics[key];
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            showingCount.textContent = `Showing ${countOnPage} of ${total} ${TAB_TEXT[currentTab].noun}`;
            pageLabel.textContent = `${page} of ${pages}`;
            prevBtn.disabled = page <= 1;
            nextBtn.disabled = page >= pages;
        }

        async function fetchTable(page = 1) {
            if (!validateDates()) return;
            const requestId = ++activeRequestId;
            const tab = currentTab;

            try {
                const data = await getJson(buildParams(page));
                if (requestId !== activeRequestId) return;   // a newer request already won

                const rows = data.rows || [];
                if (tab === "badges") {
                    renderBadgeRows(rows);
                } else {
                    earnedBody.innerHTML = earnedRowsHtml(rows, "No earned badges found.");
                    applyBadgeColors(earnedBody);
                }
                updateMetrics(data.metrics);
                if (data.requirement_limits) requirementLimits = data.requirement_limits;
                updatePagination(rows.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-achievements: failed to load data:", err);
                if (requestId !== activeRequestId) return;
                const message = "Could not load this list. Please refresh the page.";
                if (tab === "badges") badgesBody.innerHTML = emptyRow(6, message);
                else earnedBody.innerHTML = emptyRow(3, message);
            }
        }

        function scheduleFetch() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchTable(1), DEBOUNCE_MS);
        }

        function selectTab(name, focus) {
            currentTab = name === "earned" ? "earned" : "badges";
            tabButtons.forEach((btn) => {
                const active = btn.dataset.tab === currentTab;
                btn.classList.toggle("is-active", active);
                btn.setAttribute("aria-selected", active ? "true" : "false");
                btn.tabIndex = active ? 0 : -1;
                if (active && focus) btn.focus();
            });
            Object.keys(panels).forEach((key) => panels[key].classList.toggle("is-hidden", key !== currentTab));
            searchInput.placeholder = TAB_TEXT[currentTab].search;
            dateLabel.textContent = TAB_TEXT[currentTab].date;
            fetchTable(1);
        }

        tabButtons.forEach((btn, index) => {
            btn.addEventListener("click", () => selectTab(btn.dataset.tab, false));
            btn.addEventListener("keydown", (e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const step = e.key === "ArrowRight" ? 1 : tabButtons.length - 1;
                selectTab(tabButtons[(index + step) % tabButtons.length].dataset.tab, true);
            });
        });

        searchInput.addEventListener("input", scheduleFetch);
        statusSelect.addEventListener("change", () => fetchTable(1));
        dateFromInput.addEventListener("change", () => fetchTable(1));
        dateToInput.addEventListener("change", () => fetchTable(1));
        clearDateBtn.addEventListener("click", () => {
            dateFromInput.value = "";
            dateToInput.value = "";
            fetchTable(1);
        });
        prevBtn.addEventListener("click", () => { if (currentPage > 1) fetchTable(currentPage - 1); });
        nextBtn.addEventListener("click", () => { if (currentPage < totalPages) fetchTable(currentPage + 1); });

        // ============================================================
        // 2. CREATE / EDIT BADGE MODAL
        // ============================================================
        const formModal = document.getElementById("badgeFormModal");
        const form = document.getElementById("badgeForm");
        const formTitle = document.getElementById("badgeFormTitle");
        const formError = document.getElementById("badgeFormError");
        const nameInput = document.getElementById("badgeNameInput");
        const descriptionInput = document.getElementById("badgeDescriptionInput");
        const typeSelect = document.getElementById("badgeRequirementTypeSelect");
        const valueInput = document.getElementById("badgeRequiredValueInput");
        const criteriaInput = document.getElementById("badgeCriteriaInput");
        const iconInput = document.getElementById("badgeIconInput");
        const iconPickBtn = document.getElementById("badgeIconPickBtn");
        const iconPickLabel = document.getElementById("badgeIconPickLabel");
        const iconFileName = document.getElementById("badgeIconFileName");
        const iconThumb = document.getElementById("badgeIconThumb");
        const uploadRow = formModal.querySelector(".ach-upload-row");
        const swatchGroup = document.getElementById("badgeColorSwatches");
        const swatches = Array.from(swatchGroup.querySelectorAll("button.ach-swatch"));
        const customSwatch = document.getElementById("badgeCustomColorSwatch");
        const customColorInput = document.getElementById("badgeCustomColorInput");
        const previewTile = document.getElementById("badgePreviewTile");
        const previewName = document.getElementById("badgePreviewName");
        const previewCriteria = document.getElementById("badgePreviewCriteria");
        const saveBtn = document.getElementById("saveBadgeBtn");
        const cancelFormBtn = document.getElementById("cancelBadgeFormBtn");
        const closeFormBtn = document.getElementById("closeBadgeFormBtn");
        const openCreateBtn = document.getElementById("openCreateBadgeBtn");

        const defaultColor = previewTile.dataset.badgeColor;   // DEFAULT_BADGE_COLOR from the server
        const valueHint = document.getElementById("badgeRequiredValueHint");
        const defaultMaxValue = parseInt(valueInput.dataset.defaultMax, 10) || 9999;
        // { requirement key: { max, text } } - only the types that count published content.
        let requirementLimits = {};
        // Each field key -> the element that gets the red border.
        const fieldEls = {
            name: nameInput,
            description: descriptionInput,
            requirement_type: typeSelect,
            required_value: valueInput,
            criteria: criteriaInput,
            icon: uploadRow,
            color: swatchGroup,
        };

        let editingBadge = null;      // null = Create
        let selectedColor = defaultColor;
        let currentIcon = null;       // { icon_url, icon } of the badge being edited
        let objectUrl = null;         // preview of a newly picked image
        let formLastFocused = null;
        let isSaving = false;

        applyBadgeColors(formModal);

        function clearErrors() {
            formError.textContent = "";
            form.querySelectorAll(".ach-field-error").forEach((el) => { el.textContent = ""; });
            Object.values(fieldEls).forEach((el) => el.classList.remove("field-error"));
        }

        function clearFieldError(key) {
            const messageEl = form.querySelector(`.ach-field-error[data-error-for="${key}"]`);
            if (messageEl) messageEl.textContent = "";
            if (fieldEls[key]) fieldEls[key].classList.remove("field-error");
        }

        function showErrors(errors) {
            let first = null;
            Object.keys(errors).forEach((key) => {
                const messageEl = form.querySelector(`.ach-field-error[data-error-for="${key}"]`);
                if (messageEl) messageEl.textContent = errors[key];
                if (fieldEls[key]) {
                    fieldEls[key].classList.add("field-error");
                    if (!first) first = fieldEls[key];
                }
            });
            if (!first) return;
            if (first === uploadRow) iconPickBtn.focus();
            else if (first === swatchGroup) swatches[0].focus();
            else first.focus();
        }

        // Default requirement text from the dropdown's own data (filled by the server).
        function autoCriteria() {
            const option = typeSelect.options[typeSelect.selectedIndex];
            const n = parseInt(valueInput.value, 10);
            if (!option || !Number.isInteger(n) || n < 1) return "";
            return n === 1 ? option.dataset.singular : option.dataset.plural.replace("{n}", String(n));
        }

        function capitalizeFirst(text) {
            const trimmed = text.trim();
            return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
        }

        function setTileIcon(tile) {
            let inner = '<i class="fa-solid fa-image" aria-hidden="true"></i>';
            if (objectUrl) {
                inner = `<img src="${escapeHtml(objectUrl)}" alt="">`;
            } else if (currentIcon && currentIcon.icon_url) {
                inner = `<img src="${escapeHtml(currentIcon.icon_url)}" alt="">`;
            } else if (currentIcon && currentIcon.icon) {
                inner = `<i class="fa-solid ${escapeHtml(currentIcon.icon)}" aria-hidden="true"></i>`;
            }
            tile.innerHTML = inner;
        }

        function updatePreview() {
            const auto = autoCriteria();
            criteriaInput.placeholder = auto || "e.g. Complete 5 lessons";
            previewName.textContent = capitalizeFirst(nameInput.value) || "Badge Preview";
            previewCriteria.textContent = capitalizeFirst(criteriaInput.value) || auto || "Criteria preview...";
            setBadgeColor(previewTile, selectedColor);
            setBadgeColor(iconThumb, selectedColor);
            setTileIcon(previewTile);
            setTileIcon(iconThumb);
        }

        function selectColor(color) {
            selectedColor = HEX_COLOR.test(color || "") ? color.toUpperCase() : defaultColor;
            let matched = false;
            swatches.forEach((swatch) => {
                const active = swatch.dataset.badgeColor.toUpperCase() === selectedColor;
                swatch.classList.toggle("is-selected", active);
                swatch.setAttribute("aria-checked", active ? "true" : "false");
                swatch.tabIndex = active ? 0 : -1;
                matched = matched || active;
            });
            // A color that is not one of the swatches lives on the "+" swatch.
            customSwatch.classList.toggle("is-selected", !matched);
            setBadgeColor(customSwatch, matched ? "" : selectedColor);
            if (!matched) customColorInput.value = selectedColor.toLowerCase();
            if (!matched) swatches[0].tabIndex = 0;   // keep the group reachable with Tab
            clearFieldError("color");
            updatePreview();
        }

        function releaseObjectUrl() {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }

        function resetIconPicker() {
            releaseObjectUrl();
            iconInput.value = "";
            const hasCurrent = Boolean(currentIcon && currentIcon.icon_url);
            iconFileName.textContent = hasCurrent ? "Current image" : "No image chosen";
            iconPickLabel.textContent = hasCurrent ? "Replace image" : "Upload image";
        }

        function openForm(badge) {
            editingBadge = badge || null;
            currentIcon = badge ? { icon_url: badge.icon_url, icon: badge.icon } : null;
            formLastFocused = document.activeElement;
            form.reset();
            clearErrors();

            formTitle.textContent = badge ? "Edit Badge" : "Create Badge";
            if (badge) {
                nameInput.value = badge.name;
                descriptionInput.value = badge.description;
                if (badge.requirement_type) typeSelect.value = badge.requirement_type;
                valueInput.value = badge.required_value || 1;
                criteriaInput.value = badge.criteria || "";
            }
            resetIconPicker();
            applyValueLimit();
            selectColor(badge ? badge.color : defaultColor);

            formModal.classList.remove("modal-hidden");
            if (typeof window.cobraByteRefreshCharCounters === "function") window.cobraByteRefreshCharCounters();
            nameInput.focus();
        }

        function closeForm() {
            if (isSaving) return;
            formModal.classList.add("modal-hidden");
            releaseObjectUrl();
            editingBadge = null;
            if (formLastFocused && typeof formLastFocused.focus === "function") formLastFocused.focus();
        }

        openCreateBtn.addEventListener("click", () => openForm(null));
        closeFormBtn.addEventListener("click", closeForm);
        cancelFormBtn.addEventListener("click", closeForm);
        formModal.addEventListener("click", (e) => { if (e.target === formModal) closeForm(); });

        // --- Icon upload ---
        iconPickBtn.addEventListener("click", () => iconInput.click());
        iconInput.addEventListener("change", () => {
            const file = iconInput.files && iconInput.files[0];
            clearFieldError("icon");
            if (!file) { resetIconPicker(); updatePreview(); return; }

            let problem = "";
            // Some systems leave file.type empty - fall back to the file name there.
            const typeOk = file.type ? ICON_TYPES.includes(file.type) : ICON_NAME.test(file.name);
            if (!typeOk) problem = "The icon must be a PNG, JPG or WebP image.";
            else if (file.size > MAX_ICON_BYTES) problem = "The icon must be 1 MB or smaller.";
            if (problem) {
                resetIconPicker();
                showErrors({ icon: problem });
                updatePreview();
                return;
            }

            releaseObjectUrl();
            objectUrl = URL.createObjectURL(file);
            iconFileName.textContent = file.name;
            iconPickLabel.textContent = "Replace image";
            updatePreview();
        });

        // --- Color swatches (radio group: arrows move, the choice follows) ---
        swatches.forEach((swatch, index) => {
            swatch.addEventListener("click", () => selectColor(swatch.dataset.badgeColor));
            swatch.addEventListener("keydown", (e) => {
                const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
                const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
                if (!forward && !back) return;
                e.preventDefault();
                const next = swatches[(index + (forward ? 1 : swatches.length - 1)) % swatches.length];
                selectColor(next.dataset.badgeColor);
                next.focus();
            });
        });
        customColorInput.addEventListener("input", () => selectColor(customColorInput.value));

        // --- Live preview + clear a field's error once it is edited ---
        [[nameInput, "name"], [descriptionInput, "description"], [criteriaInput, "criteria"],
         [valueInput, "required_value"]].forEach(([input, key]) => {
            input.addEventListener("input", () => { clearFieldError(key); updatePreview(); });
        });
        typeSelect.addEventListener("change", () => {
            clearFieldError("requirement_type");
            applyValueLimit();
            showValueErrorNow();
            updatePreview();
        });
        valueInput.addEventListener("input", showValueErrorNow);

        // ---- Required Value ceiling (published content only) ----
        // The limit for the selected requirement type, or null when the type
        // has no ceiling (sandbox runs, saved snippets, learning hours, login days).
        function currentLimit() {
            const limit = requirementLimits[typeSelect.value];
            return limit && Number.isInteger(limit.max) ? limit : null;
        }

        // Sets the input's max and the hint under it for the selected type.
        function applyValueLimit() {
            const limit = currentLimit();
            if (!limit) {
                valueInput.max = String(defaultMaxValue);
                valueHint.textContent = "";
            } else if (limit.max === 0) {
                valueInput.max = "1";
                valueHint.textContent = `No ${limit.text.replace(/^0 /, "")} yet.`;
            } else {
                valueInput.max = String(limit.max);
                valueHint.textContent = `Maximum ${limit.max} (${limit.text}).`;
            }
        }

        // The message for the Required Value field, or "" when it is fine.
        function valueProblem() {
            const raw = valueInput.value.trim();
            const n = Number(raw);
            if (!/^\d+$/.test(raw) || n < 1 || n > defaultMaxValue) {
                return `Enter a whole number from 1 to ${defaultMaxValue}.`;
            }
            const limit = currentLimit();
            if (!limit) return "";
            // A saved badge may keep the rule it already has (the server allows it too).
            const unchanged = editingBadge && editingBadge.requirement_type === typeSelect.value
                && Number(editingBadge.required_value) === n;
            if (unchanged) return "";
            if (limit.max === 0) return `There are no ${limit.text.replace(/^0 /, "")} yet. Publish one first, or choose another requirement type.`;
            if (n > limit.max) {
                return limit.max === 1
                    ? `Only ${limit.text}, so the required value can only be 1.`
                    : `Only ${limit.text}. Enter a whole number from 1 to ${limit.max}.`;
            }
            return "";
        }

        // Shows the ceiling message as soon as the value or the type changes.
        function showValueErrorNow() {
            const messageEl = form.querySelector('.ach-field-error[data-error-for="required_value"]');
            const problem = valueInput.value.trim() ? valueProblem() : "";
            messageEl.textContent = problem;
            valueInput.classList.toggle("field-error", Boolean(problem));
        }

        function validateForm() {
            const errors = {};
            if (!nameInput.value.trim()) errors.name = "Badge name is required.";
            if (!editingBadge && !(iconInput.files && iconInput.files[0])) errors.icon = "Upload a badge icon.";
            if (!descriptionInput.value.trim()) errors.description = "Badge description is required.";
            if (!typeSelect.value) errors.requirement_type = "Choose a requirement type.";
            const problem = valueProblem();
            if (problem) errors.required_value = problem;
            return errors;
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (isSaving) return;
            clearErrors();

            const errors = validateForm();
            if (Object.keys(errors).length) { showErrors(errors); return; }

            const body = new FormData();
            body.append("name", nameInput.value.trim());
            body.append("description", descriptionInput.value.trim());
            body.append("color", selectedColor);
            body.append("requirement_type", typeSelect.value);
            body.append("required_value", valueInput.value.trim());
            body.append("criteria", criteriaInput.value.trim());
            const pickedIcon = iconInput.files && iconInput.files[0];

            const editedId = editingBadge ? editingBadge.badge_id : null;
            const url = editedId ? `${BADGES_URL}/${encodeURIComponent(editedId)}` : BADGES_URL;

            isSaving = true;
            saveBtn.disabled = true;
            try {
                if (pickedIcon) {
                    // Shrunk in the browser first (image-shrink.js): icons are stored in the database.
                    const shrink = window.cobraByteShrinkImage;
                    const icon = typeof shrink === "function" ? await shrink(pickedIcon, ICON_MAX_SIDE) : pickedIcon;
                    body.append("icon", icon, icon.name);
                }
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                    body,
                });
                const data = await response.json().catch(() => ({}));

                if (response.ok && data.success) {
                    isSaving = false;
                    closeForm();
                    showToast(data.message || "Badge saved.");
                    // A new badge goes last; an edited one stays on its page.
                    await fetchTable(editedId ? currentPage : 1);
                    return;
                }
                if (data.errors && Object.keys(data.errors).length) showErrors(data.errors);
                else formError.textContent = data.message || "Could not save the badge. Please try again.";
            } catch (err) {
                console.error("admin-achievements: failed to save badge:", err);
                formError.textContent = "Could not save the badge. Check your connection and try again.";
            } finally {
                isSaving = false;
                saveBtn.disabled = false;
            }
        });

        // ============================================================
        // 3. ROW ACTIONS (event delegation - rows are rebuilt on every fetch)
        // ============================================================
        async function toggleArchive(badge, archive) {
            const confirmed = await askConfirm(archive ? {
                title: "Archive this badge?",
                text: `"${badge.name}" will stop being awarded and will be hidden from learners who have not earned it. Learners who already earned it keep it.`,
                confirmLabel: "Archive",
                danger: true,
            } : {
                title: "Restore this badge?",
                text: `"${badge.name}" will be shown to learners and awarded again.`,
                confirmLabel: "Restore",
                danger: false,
            });
            if (!confirmed) return;

            try {
                const response = await fetch(
                    `${BADGES_URL}/${encodeURIComponent(badge.badge_id)}/${archive ? "archive" : "restore"}`, {
                        method: "POST",
                        headers: { "X-Requested-With": "XMLHttpRequest" },
                        credentials: "include",
                    });
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success) {
                    showToast(data.message || "Badge updated.");
                    await fetchTable(currentPage);
                } else {
                    showToast(data.message || "Could not update the badge.", true);
                }
            } catch (err) {
                console.error("admin-achievements: archive/restore failed:", err);
                showToast("Could not update the badge. Check your connection and try again.", true);
            }
        }

        badgesBody.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-badge-id]");
            if (!btn) return;
            const badge = badgesById.get(btn.dataset.badgeId);
            if (!badge) return;

            if (btn.classList.contains("js-edit-badge")) openForm(badge);
            else if (btn.classList.contains("js-archive-badge")) toggleArchive(badge, true);
            else if (btn.classList.contains("js-restore-badge")) toggleArchive(badge, false);
        });

        // ============================================================
        // 4. VIEW AWARDED BADGES MODAL
        // ============================================================
        const awardedModal = document.getElementById("awardedBadgesModal");
        const awardedBody = document.getElementById("awardedTableBody");
        const awardedSearch = document.getElementById("awardedSearchInput");
        const awardedLearnerSelect = document.getElementById("awardedLearnerSelect");
        const awardedShowing = document.getElementById("awardedShowingCount");
        const awardedPageLabel = document.getElementById("awardedPageLabel");
        const awardedPrevBtn = document.getElementById("awardedPrevBtn");
        const awardedNextBtn = document.getElementById("awardedNextBtn");
        const openAwardedBtn = document.getElementById("openAwardedBadgesBtn");

        let awardedPage = 1;
        let awardedTotalPages = 1;
        let awardedRequestId = 0;
        let awardedDebounce = null;
        let awardedLastFocused = null;

        function fillLearnerSelect(learners) {
            const keep = awardedLearnerSelect.value;
            awardedLearnerSelect.innerHTML = '<option value="">All Learners</option>' + learners.map((l) => {
                const label = l.name ? `${l.acc_id} - ${l.name}` : l.acc_id;
                return `<option value="${escapeHtml(l.acc_id)}">${escapeHtml(label)}</option>`;
            }).join("");
            awardedLearnerSelect.value = keep;
            if (awardedLearnerSelect.value !== keep) awardedLearnerSelect.value = "";
        }

        async function fetchAwarded(page = 1, withLearners = false) {
            const requestId = ++awardedRequestId;
            const params = new URLSearchParams({ tab: "earned", page: String(page) });
            const q = awardedSearch.value.trim();
            if (q) params.set("q", q);
            if (awardedLearnerSelect.value) params.set("learner", awardedLearnerSelect.value);
            if (withLearners) params.set("include_learners", "1");

            try {
                const data = await getJson(params);
                if (requestId !== awardedRequestId) return;

                const rows = data.rows || [];
                if (data.learners) fillLearnerSelect(data.learners);
                awardedBody.innerHTML = earnedRowsHtml(rows, "No awarded badges found.");
                applyBadgeColors(awardedBody);

                awardedPage = data.page || 1;
                awardedTotalPages = data.total_pages || 1;
                awardedShowing.textContent = `Showing ${rows.length} of ${data.total || 0} awarded badges`;
                awardedPageLabel.textContent = `${awardedPage} of ${awardedTotalPages}`;
                awardedPrevBtn.disabled = awardedPage <= 1;
                awardedNextBtn.disabled = awardedPage >= awardedTotalPages;
            } catch (err) {
                console.error("admin-achievements: failed to load awarded badges:", err);
                if (requestId !== awardedRequestId) return;
                awardedBody.innerHTML = emptyRow(3, "Could not load awarded badges. Please try again.");
            }
        }

        function openAwarded() {
            awardedLastFocused = document.activeElement;
            awardedSearch.value = "";
            awardedLearnerSelect.value = "";
            awardedBody.innerHTML = emptyRow(3, "Loading awarded badges...");
            awardedModal.classList.remove("modal-hidden");
            awardedSearch.focus();
            fetchAwarded(1, true);
        }

        function closeAwarded() {
            awardedModal.classList.add("modal-hidden");
            if (awardedLastFocused && typeof awardedLastFocused.focus === "function") awardedLastFocused.focus();
        }

        openAwardedBtn.addEventListener("click", openAwarded);
        document.getElementById("closeAwardedBadgesBtn").addEventListener("click", closeAwarded);
        document.getElementById("closeAwardedBadgesFooterBtn").addEventListener("click", closeAwarded);
        awardedModal.addEventListener("click", (e) => { if (e.target === awardedModal) closeAwarded(); });
        awardedSearch.addEventListener("input", () => {
            if (awardedDebounce) clearTimeout(awardedDebounce);
            awardedDebounce = setTimeout(() => fetchAwarded(1), DEBOUNCE_MS);
        });
        awardedLearnerSelect.addEventListener("change", () => fetchAwarded(1));
        awardedPrevBtn.addEventListener("click", () => { if (awardedPage > 1) fetchAwarded(awardedPage - 1); });
        awardedNextBtn.addEventListener("click", () => { if (awardedPage < awardedTotalPages) fetchAwarded(awardedPage + 1); });

        // ============================================================
        // Escape closes whichever dialog is on top
        // ============================================================
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (settleConfirm(false)) return;
            if (!formModal.classList.contains("modal-hidden")) closeForm();
            else if (!awardedModal.classList.contains("modal-hidden")) closeAwarded();
        });

        // First load
        fetchTable(1);
    });
})();