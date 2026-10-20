# Context Diagram and DFDs

`../CobraByte_Context_Diagram_and_DFD.docx` is generated from the files here.

- `specs.js` – the nine Level 1 diagrams. Level 0 and the Context Diagram are built from them, so the levels always balance.
- `check.js` – checks the DFD rules (labels, allowed connections, verb-noun process names, inputs and outputs, numbering, balancing)
- `descriptions.js` – the description printed under each figure
- `draw.js` – Gane-Sarson shapes; layout by ELK (orthogonal lines)
- `render.js` – renders each diagram to `png/` with headless Chromium
- `build_docx.py` – assembles the Word document (needs `python-docx`). `python3 build_docx.py <out.docx> <first figure number>` continues your paper's figure numbering.

To change a diagram, edit `specs.js`, then:

```
npm install
node check.js && npm run build
```

`render.js` points at the Chromium in `/opt/pw-browsers`. Change `executablePath` to run it somewhere else.
