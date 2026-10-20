"""Builds CobraByte_Context_Diagram_and_DFD.docx from png/*.png and specs.js."""
import json
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'CobraByte_Context_Diagram_and_DFD.docx'

specs = json.loads(subprocess.check_output(
    ['node', '-e', 'const s=require("./specs.js");console.log(JSON.stringify({d:s,stores:s.STORES}))'], cwd=HERE))
meta = {m['id']: m for m in json.load(open(HERE / 'png' / 'meta.json'))}

# Database tables behind each data store (database/cobra_db.sql, migrations/, defense_revisions.sql
# and the tables the server creates on first use).
STORE_TABLES = {
    'D1': 'account_tbl, profile_tbl, usertype_tbl, gender_tbl',
    'D2': 'login_logs_tbl, lockout_logs_tbl, password_reset_logs_tbl, unlock_logs_tbl',
    'D3': 'active_sessions_tbl, staff_presence_tbl, learner_where_tbl',
    'D4': 'consent_tbl',
    'D5': 'category_tbl, category_stats_tbl',
    'D6': 'modules_tbl, module_stats_tbl',
    'D7': 'learning_resources_tbl, lesson_content_tbl, resource_types_tbl, learning_resources_stats_tbl, uploaded_images_tbl',
    'D8': 'video_tutorials_tbl',
    'D9': 'learning_activities_tbl, activity_types_tbl, learning_activities_stats_tbl, mcq_questions_tbl, mcq_options_tbl, fill_blanks_tbl, flashcards_tbl',
    'D10': 'coding_exercises_tbl, test_cases_tbl, exercise_required_tags_tbl',
    'D11': 'activity_plays_tbl, activity_play_items_tbl, mcq_activity_sessions_tbl, mcq_learner_answers_tbl, fib_learner_answers_tbl, flashcard_activity_sessions_tbl, flashcard_learner_answers_tbl, activity_retakes_tbl, activity_leave_logs_tbl',
    'D12': 'exercise_submissions_tbl, learner_exercise_draws_tbl',
    'D13': 'learner_resource_progress_tbl, learner_activity_progress_tbl, learner_exercise_progress_tbl, learner_progress_unlocks_tbl, learner_chapter_skips_tbl, learner_lives_tbl, fib_learner_lives_tbl, learner_time_tbl, learner_tour_tbl',
    'D14': 'badges_tbl, learner_badges_tbl',
    'D15': 'certificates_tbl',
    'D16': 'lesson_recommendations_tbl',
    'D17': 'notifications_tbl',
    'D18': 'sandbox_runs_tbl, sandbox_snippets_tbl',
    'D19': 'help_requests_tbl',
    'D20': 'activity_log_tbl, account_actions_log_tbl, error_log_tbl',
    'D21': 'title_history_tbl',
    'D22': 'game_settings_tbl',
    'D23': 'system_settings_tbl',
}

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
    setattr(sec, side, Inches(1))
doc.styles['Normal'].font.name = 'Arial'
doc.styles['Normal'].font.size = Pt(11)

title = doc.add_heading('CobraByte: Learn Python the Interactive Way', 0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
p = doc.add_paragraph('Context Diagram and Data Flow Diagrams')
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.runs[0].font.size = Pt(14)

doc.add_heading('Users of the System', 1)
for name, desc in [
    ('Admin', 'Manages accounts, security, help requests, game settings, reports and monitoring. Can view Publishing and Preview but cannot change content.'),
    ('Mentor', 'Creates and publishes all course content: chapters, modules, lessons, videos, learning activities, coding exercises and badges. Views learner progress and recommendations.'),
    ('Learner', 'Signs up, works through the course (lessons, activities, coding exercises, sandbox), and earns badges and a Certificate of Completion.'),
    ('Email Server', 'Sends the verification, password-reset and username codes.'),
]:
    para = doc.add_paragraph(style='List Bullet')
    para.add_run(name + ' – ').bold = True
    para.add_run(desc)

doc.add_heading('Legend', 1)
doc.add_picture(str(HERE / 'png' / 'legend.png'), width=Inches(5.5))
doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_heading('Data Stores', 1)
doc.add_paragraph('Each data store in the diagrams stands for one or more tables in the CobraByte database (cobra_db).')
table = doc.add_table(rows=1, cols=3)
table.style = 'Light Grid Accent 1'
for cell, text in zip(table.rows[0].cells, ('No.', 'Data Store', 'Database Tables')):
    cell.text = text
for key, name in specs['stores'].items():
    row = table.add_row().cells
    row[0].text, row[1].text, row[2].text = key, name, STORE_TABLES[key]
for row in table.rows:
    row.cells[0].width, row.cells[1].width, row.cells[2].width = Inches(0.6), Inches(1.6), Inches(4.3)
    for cell in row.cells:
        for para in cell.paragraphs:
            for run in para.runs:
                run.font.size = Pt(9.5)

MARGIN = 0.6
LEVEL_ORDER = ['Context', '0', '1', '2', '3', '4']  # same order as the sample: all of one level, then the next
for d in sorted((d for d in specs['d'] if d['level'] != 'legend'), key=lambda d: LEVEL_ORDER.index(d['level'])):
    m = meta[d['id']]
    text_h = 1.6  # heading + intro paragraph (up to 3 lines) + spacing
    port = min((8.5 - 2 * MARGIN) / m['w'], (11 - 2 * MARGIN - text_h) / m['h'])
    land = min((11 - 2 * MARGIN) / m['w'], (8.5 - 2 * MARGIN - text_h) / m['h'])
    landscape = land > port
    sec = doc.add_section(WD_SECTION.NEW_PAGE)
    sec.orientation = WD_ORIENT.LANDSCAPE if landscape else WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = (Inches(11), Inches(8.5)) if landscape else (Inches(8.5), Inches(11))
    for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(sec, side, Inches(MARGIN))
    doc.add_heading(d['title'], 1)
    if d.get('intro'):
        doc.add_paragraph(d['intro'])
    doc.add_picture(str(HERE / 'png' / (d['id'] + '.png')), width=Inches(m['w'] * max(port, land)))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.save(OUT)
print('saved', OUT)
