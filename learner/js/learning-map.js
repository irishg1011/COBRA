document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = "http://127.0.0.1:5000";

    const mapCanvas = document.getElementById('mapCanvas');
    const mapChain = document.getElementById('mapChain');
    const mapLoading = document.getElementById('mapLoading');
    const mapError = document.getElementById('mapError');

    const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;
    const SPINNER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`;
    const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`;
    const PLAY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6.75 6 5.25-6 5.25" /></svg>`;
    const SMALL_LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>`;

    function iconForStatus(status, locked) {
        if (locked) return LOCK_ICON;
        if (status === 'completed') return CHECK_ICON;
        if (status === 'in_progress') return SPINNER_ICON;
        return PLAY_ICON;
    }

    function labelForStatus(status, locked) {
        if (locked) return 'Locked';
        if (status === 'completed') return 'Completed';
        if (status === 'in_progress') return 'In Progress';
        return 'Not Started';
    }

    /**
     * Draws actual curved SVG lines between the real, rendered positions
     * of each chapter card - rather than a straight CSS line centered in
     * the row, which no longer lines up once cards are offset left/right
     * via padding. Runs after the cards are in the DOM so getBoundingClientRect()
     * reflects their true final positions.
     */
    function drawConnectors(chapters) {
        // Remove any previously drawn connector layer (e.g. on re-render).
        const existingSvg = mapChain.querySelector('.map-connector-svg');
        if (existingSvg) existingSvg.remove();
        mapChain.querySelectorAll('.map-connector-lock').forEach(el => el.remove());

        const containerRect = mapChain.getBoundingClientRect();
        const nodeEls = mapChain.querySelectorAll('.map-node');

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "map-connector-svg");
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.width = "100%";
        svg.style.height = `${mapChain.scrollHeight}px`;
        svg.style.pointerEvents = "none";
        svg.style.zIndex = "1";

        nodeEls.forEach((nodeEl, index) => {
            if (index >= nodeEls.length - 1) return; // no connector after the last node

            const nextEl = nodeEls[index + 1];
            const rectA = nodeEl.getBoundingClientRect();
            const rectB = nextEl.getBoundingClientRect();

            const x1 = rectA.left + rectA.width / 2 - containerRect.left;
            const y1 = rectA.bottom - containerRect.top;
            const x2 = rectB.left + rectB.width / 2 - containerRect.left;
            const y2 = rectB.top - containerRect.top;

            // Smooth curve: control points pulled toward the vertical
            // midpoint so the line bows gently between the two cards
            // instead of a rigid diagonal.
            const midY = (y1 + y2) / 2;

            const path = document.createElementNS(svgNS, "path");
            const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            path.setAttribute("d", d);
            path.setAttribute("fill", "none");

            const isComplete = chapters[index].status === 'completed';
            path.setAttribute("stroke", isComplete ? "#0ED400" : "#64748b");
            path.setAttribute("stroke-width", "5");
            path.setAttribute("stroke-linecap", "round");
            // White halo behind the line so it stays visible over any part
            // of the busy background artwork.
            path.style.filter = "drop-shadow(0 0 3px rgba(255,255,255,0.9))";

            svg.appendChild(path);

            // Lock/check badge at the curve's midpoint.
            const midX = (x1 + x2) / 2;
            const badge = document.createElement('div');
            badge.className = 'map-connector-lock';
            badge.style.left = `${midX}px`;
            badge.style.top = `${midY}px`;
            badge.innerHTML = chapters[index + 1].locked ? SMALL_LOCK_ICON : CHECK_ICON;
            mapChain.appendChild(badge);
        });

        mapChain.insertBefore(svg, mapChain.firstChild);
    }

    function renderMap(chapters) {
        mapChain.innerHTML = '';

        chapters.forEach((chapter, index) => {
            const row = document.createElement('div');
            row.className = `map-node-row ${index % 2 === 0 ? 'align-left' : 'align-right'}`;

            const node = document.createElement('div');
            node.className = `map-node status-${chapter.status}`;
            if (chapter.locked) node.classList.add('status-locked');
            if (!chapter.locked) node.classList.add('node-clickable');

            node.innerHTML = `
                <div class="map-node-icon">${iconForStatus(chapter.status, chapter.locked)}</div>
                <div class="map-node-text">
                    <p class="chapter-label">Chapter ${index + 1}</p>
                    <h3>${chapter.category_name}</h3>
                    <p class="chapter-meta">${chapter.locked ? labelForStatus(chapter.status, chapter.locked) : `${chapter.modules_completed} / ${chapter.modules_total} Modules`}</p>
                </div>
            `;

            if (!chapter.locked) {
                node.addEventListener('click', () => {
                    window.location.href = `/lessons?cat_id=${chapter.cat_id}`;
                });
            }

            row.appendChild(node);
            mapChain.appendChild(row);
        });

        // Draw the curved connectors once all cards have their final
        // rendered positions (next animation frame, to be safe).
        requestAnimationFrame(() => drawConnectors(chapters));
    }

    async function loadMap() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/learning-map`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Request failed');

            const data = await response.json();

            if (!data.success || !Array.isArray(data.chapters)) {
                throw new Error('Unexpected response shape');
            }

            mapLoading.style.display = 'none';
            renderMap(data.chapters);

        } catch (err) {
            console.error('Error loading learning map:', err);
            mapLoading.style.display = 'none';
            mapError.style.display = 'block';
        }
    }

    loadMap();

    // Subtle parallax: shifts the background image slightly as the page
    // scrolls, giving the map a sense of depth without touching the art.
    function updateParallax() {
        const scrollY = window.scrollY;
        mapCanvas.style.backgroundPositionY = `calc(50% + ${scrollY * 0.08}px)`;
    }
    window.addEventListener('scroll', updateParallax, { passive: true });
    updateParallax();

    // Redraw connectors on window resize, since card positions shift.
    window.addEventListener('resize', () => {
        const nodes = mapChain.querySelectorAll('.map-node');
        if (nodes.length === 0) return;
        // Re-run the last render's data by reading it back off the DOM
        // would be complex - simplest reliable approach is just reloading
        // the map data and re-rendering.
        loadMap();
    });
});