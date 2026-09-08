document.addEventListener('DOMContentLoaded', () => {

    const codeEditor = document.getElementById('codeEditor');
    const lineCountLabel = document.getElementById('lineCountLabel');
    const runCodeBtn = document.getElementById('runCodeBtn');
    const resetCodeBtn = document.getElementById('resetCodeBtn');
    const saveCodeBtn = document.getElementById('saveCodeBtn');
    const clearOutputBtn = document.getElementById('clearOutputBtn');
    const outputBody = document.getElementById('outputBody');
    const outputPlaceholder = document.getElementById('outputPlaceholder');
    const snippetsList = document.getElementById('snippetsList');
    const snippetsEmpty = document.getElementById('snippetsEmpty');
    const snippetsCount = document.getElementById('snippetsCount');

    const DEFAULT_CODE = `print("Hello, CobraByte!")

name = "Python"
print("Let's learn", name)`;

    // ===============================
    // Line count
    // ===============================
    function updateLineCount() {
        if (!codeEditor || !lineCountLabel) return;
        const lines = codeEditor.value.split('\n').length;
        lineCountLabel.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
    }

    if (codeEditor) {
        codeEditor.addEventListener('input', updateLineCount);
        updateLineCount();
    }

    // ===============================
    // Reset
    // ===============================
    if (resetCodeBtn && codeEditor) {
        resetCodeBtn.addEventListener('click', () => {
            codeEditor.value = DEFAULT_CODE;
            updateLineCount();
        });
    }

    // ===============================
    // Run Code (front-end preview only ---
    // no real Python execution is wired up yet)
    // ===============================
    function showOutput(message, isNote = false) {
        if (!outputBody) return;
        outputBody.innerHTML = '';
        const p = document.createElement('p');
        p.className = isNote ? 'output-placeholder' : 'output-line';
        p.textContent = message;
        outputBody.appendChild(p);
    }

    if (runCodeBtn) {
        runCodeBtn.addEventListener('click', () => {
            showOutput('Running code is not connected to a live Python engine yet. This is a front-end preview only.', true);
        });
    }

    // ===============================
    // Clear Output
    // ===============================
    if (clearOutputBtn) {
        clearOutputBtn.addEventListener('click', () => {
            if (!outputBody || !outputPlaceholder) return;
            outputBody.innerHTML = '';
            outputBody.appendChild(outputPlaceholder);
        });
    }

    // ===============================
    // Save Code (client-side only, list resets on reload)
    // ===============================
    let savedSnippets = [];

    function renderSnippets() {
        if (!snippetsList || !snippetsEmpty || !snippetsCount) return;

        snippetsCount.textContent = `${savedSnippets.length} saved`;

        if (savedSnippets.length === 0) {
            snippetsEmpty.style.display = 'block';
            snippetsList.innerHTML = '';
            return;
        }

        snippetsEmpty.style.display = 'none';
        snippetsList.innerHTML = '';

        savedSnippets.forEach((snippet) => {
            const li = document.createElement('li');
            li.className = 'snippet-item';

            const label = document.createElement('span');
            label.textContent = snippet.label;

            const time = document.createElement('span');
            time.className = 'snippet-time';
            time.textContent = snippet.time;

            li.appendChild(label);
            li.appendChild(time);
            snippetsList.appendChild(li);
        });
    }

    if (saveCodeBtn && codeEditor) {
        saveCodeBtn.addEventListener('click', () => {
            const firstLine = codeEditor.value.split('\n')[0].trim();
            const label = firstLine ? firstLine.slice(0, 40) : `Snippet ${savedSnippets.length + 1}`;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            savedSnippets.unshift({ label, time });
            renderSnippets();
        });
    }

    renderSnippets();
});