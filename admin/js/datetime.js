/**
 * datetime.js - CobraByte Admin Live Date & Time
 * ------------------------------------------------
 * Renders and continuously updates the current local date and time into
 * the datetime badge used on the Admin Dashboard and Account & Security
 * pages. Include this on any admin page that has:
 *
 *   <div class="dashboard-datetime-badge">
 *       <strong id="current-time"></strong>
 *       <small id="current-date"></small>
 *   </div>
 *
 *      <script src="{{ url_for('admin_bp.static', filename='js/datetime.js') }}"></script>
 *
 * No page-specific setup is needed - this file finds its own elements on
 * DOMContentLoaded and initializes independently on every page that
 * includes it (Dashboard, Account & Security, etc.), so there is no
 * duplicated logic to maintain across pages.
 */
(function () {
    "use strict";

    /**
     * Formats a Date as a 12-hour clock string with AM/PM, e.g. "3:45:08 PM".
     */
    function formatTime(date) {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    /**
     * Formats a Date as "DayOfWeek - Month DD, YYYY", e.g.
     * "Saturday - August 01, 2026".
     */
    function formatDate(date) {
        const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
        const month = date.toLocaleDateString('en-US', { month: 'long' });
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${weekday} - ${month} ${day}, ${year}`;
    }

    /**
     * Reads the current local time, writes the formatted time/date into
     * whichever of #current-time / #current-date exist on this page, and
     * does nothing if neither is present (so this file is safe to include
     * everywhere without guard checks on every page).
     */
    function updateDateTime() {
        const timeEl = document.getElementById('current-time');
        const dateEl = document.getElementById('current-date');
        if (!timeEl && !dateEl) return;

        const now = new Date();
        if (timeEl) timeEl.textContent = formatTime(now);
        // Recomputing the date from `now` on every tick (rather than caching
        // it) is what makes the displayed date roll over automatically the
        // moment midnight passes while the page stays open.
        if (dateEl) dateEl.textContent = formatDate(now);
    }

    document.addEventListener('DOMContentLoaded', () => {
        updateDateTime();
        setInterval(updateDateTime, 1000);
    });
})();