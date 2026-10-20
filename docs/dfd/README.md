# Context Diagram and DFDs

`../CobraByte_Context_Diagram_and_DFD.docx` is generated from the files here.

- `specs.js` – every diagram: processes, data flows, and the D1–D23 data stores
- `draw.js` – Gane-Sarson shapes; layout by ELK (orthogonal lines)
- `render.js` – renders each diagram to `png/` with headless Chromium
- `build_docx.py` – assembles the Word document (needs `python-docx`); the store → table list is in `STORE_TABLES`

To change a diagram, edit `specs.js`, then:

```
npm install
npm run build
```

`render.js` points at the Chromium in `/opt/pw-browsers`. Change `executablePath` to run it somewhere else.
