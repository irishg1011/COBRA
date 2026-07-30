/**
 * table.js - CobraByte Accounts Table
 * ---------------------------------------
 * Responsibilities:
 *   - Search functionality (filters rows by name / username / email)
 *   - Filter dropdown functionality (role + status)
 *
 * Frontend-only: filtering happens entirely against the placeholder rows
 * already present in the DOM. No AJAX/fetch calls are made.
 */
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('accountSearchInput');
    const roleFilter = document.getElementById('filterRole');
    const statusFilter = document.getElementById('filterStatus');
    const sortFilter = document.getElementById('filterSort');
    const tableBody = document.querySelector('#accountsTable tbody');
    const rowCountLabel = document.getElementById('tableRowCount');

    if (!tableBody) return;

    const allRows = Array.from(tableBody.querySelectorAll('tr'));

    function applyFilters() {
        const query = (searchInput?.value || '').trim().toLowerCase();
        const roleValue = roleFilter?.value || 'all';
        const statusValue = statusFilter?.value || 'all';

        let visibleCount = 0;

        allRows.forEach((row) => {
            const rowText = row.textContent.toLowerCase();
            const matchesSearch = !query || rowText.includes(query);
            const matchesRole = roleValue === 'all' || row.dataset.role === roleValue;
            const matchesStatus = statusValue === 'all' || row.dataset.status === statusValue;

            const isVisible = matchesSearch && matchesRole && matchesStatus;
            row.classList.toggle('row-hidden', !isVisible);
            if (isVisible) visibleCount += 1;
        });

        if (rowCountLabel) {
            rowCountLabel.textContent = `Showing ${visibleCount} account${visibleCount === 1 ? '' : 's'}`;
        }
    }

    function applySort() {
        const sortValue = sortFilter?.value || 'date-created';

        const sorted = [...allRows].sort((a, b) => {
            if (sortValue === 'name') {
                const nameA = a.querySelector('.profile-cell')?.textContent.trim().toLowerCase() || '';
                const nameB = b.querySelector('.profile-cell')?.textContent.trim().toLowerCase() || '';
                return nameA.localeCompare(nameB);
            }
            // "date-created" and "last-login" placeholder sorts keep the
            // original static ordering shown in the approved design, since
            // dates here are formatted strings rather than real Date data.
            return 0;
        });

        sorted.forEach((row) => tableBody.appendChild(row));
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (roleFilter) roleFilter.addEventListener('change', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (sortFilter) sortFilter.addEventListener('change', applySort);

    applyFilters();
});