"""Builds CobraByte_Context_Diagram_and_DFD.docx from png/*.png and specs.js.

Laid out like the sample: portrait Letter, 1 in margins, a plain title line
("Registration – DFD Level 1") above each diagram, one diagram per page.
"""
import json
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_BREAK
from docx.shared import Inches, Pt

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'CobraByte_Context_Diagram_and_DFD.docx'

specs = json.loads(subprocess.check_output(
    ['node', '-e', 'console.log(JSON.stringify(require("./specs.js")))'], cwd=HERE))
meta = {m['id']: m for m in json.load(open(HERE / 'png' / 'meta.json'))}

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
    setattr(sec, side, Inches(1))
normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(11)

MAX_W, MAX_H = 6.5, 8.4
LEVEL_ORDER = ['Context', '0', '1', '2', '3', '4']  # same order as the sample: all of one level, then the next
diagrams = sorted((d for d in specs if d['level'] != 'legend'), key=lambda d: LEVEL_ORDER.index(d['level']))
for i, d in enumerate(diagrams):
    title = doc.add_paragraph(d['title'])
    if i:
        title.paragraph_format.page_break_before = True
    m = meta[d['id']]
    scale = min(MAX_W / m['w'], MAX_H / m['h'])
    doc.add_paragraph().add_run().add_picture(str(HERE / 'png' / (d['id'] + '.png')), width=Inches(m['w'] * scale))

doc.save(OUT)
print('saved', OUT)
