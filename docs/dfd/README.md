# Context Diagram and DFDs

`../CobraByte_Context_Diagram_and_DFD.docx` is generated from the files here.

- `specs.js` – every diagram: processes, data flows, and the data stores (`STORES`)
- `descriptions.js` – the description printed under each figure
- `draw.js` – Gane-Sarson shapes; layout by ELK (orthogonal lines)
- `render.js` – renders each diagram to `png/` with headless Chromium
- `build_docx.py` – assembles the Word document (needs `python-docx`), laid out like a capstone paper: diagram, "Figure N" caption, then the description (Arial 12, double-spaced). `python3 build_docx.py <out.docx> <first figure number>` continues your paper's figure numbering

To change a diagram, edit `specs.js`, then:

```
npm install
npm run build
```

`render.js` points at the Chromium in `/opt/pw-browsers`. Change `executablePath` to run it somewhere else.
