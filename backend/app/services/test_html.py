"""
Generate a complete HTML test page from structured test JSON.
Produces the same look and feel as the Unit 7 hardcoded test.
"""
import html as html_lib
import re as _re

TEST_CSS = """
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 14px; background: #dde3eb; margin: 0; padding: 20px; color: #111; }
.paper { max-width: 780px; margin: 0 auto; background: white; padding: 44px; box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
h1 { font-size: 22px; margin: 0; }
.header-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
.datestamp { font-size: 12px; color: #555; text-align: right; padding-top: 4px; }
.name-row { background: #f0f7ff; border: 1px solid #b8d4f0; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
.name-row label { font-weight: bold; white-space: nowrap; font-size: 15px; }
.name-input { border: none; border-bottom: 2px solid #333; font-size: 16px; padding: 2px 6px; width: 300px; outline: none; background: transparent; }
.name-input:focus { border-bottom-color: #0066cc; }
.section-title { font-size: 17px; font-weight: bold; margin: 30px 0 4px; border-bottom: 2px solid #111; padding-bottom: 4px; }
.q-header { font-weight: bold; margin: 14px 0 8px; }
.marks { font-weight: normal; font-size: 12px; color: #555; }
.audio-notice { background: #fff8e1; border: 1px solid #ffc107; border-radius: 6px; padding: 8px 14px; margin: 8px 0 12px; font-size: 13px; color: #7a5800; }
.example { color: #555; margin: 6px 0 10px 16px; font-style: italic; }
.q { margin: 9px 0; line-height: 1.9; }
input.ans { border: none; border-bottom: 2px solid #555; background: transparent; font-size: 14px; padding: 1px 4px; outline: none; min-width: 110px; }
input.ans:focus { border-bottom-color: #0066cc; background: #f0f8ff; }
.ans-sm { min-width: 80px; }
.ans-lg { min-width: 230px; }
.ans-xl { min-width: 340px; max-width: 98%; }
.hint { font-weight: bold; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
.word-box { display: flex; flex-wrap: wrap; gap: 6px 22px; background: #f8f8f8; border: 1px solid #ccc; padding: 8px 16px; border-radius: 4px; margin: 8px 0 12px; font-size: 13px; }
.passage { background: #fafafa; border-left: 4px solid #0066cc; padding: 14px 18px; margin: 12px 0 16px; line-height: 1.7; font-size: 13px; }
.passage h4 { margin: 0 0 10px; text-align: center; font-size: 14px; text-decoration: underline; }
.passage p { margin: 0 0 8px; }
.dialogue { background: #fafafa; border: 1px solid #ddd; padding: 12px 18px; margin: 12px 0; font-size: 13px; }
.dialogue p { margin: 4px 0; line-height: 1.9; }
.sp { font-weight: bold; }
.radio-row { display: flex; align-items: center; gap: 4px; margin: 2px 0 2px 12px; }
.radio-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 8px; border-radius: 4px; }
.radio-row label:hover { background: #f0f0f0; }
.sep { color: #aaa; }
.options-row { display: flex; gap: 10px; margin: 4px 0 4px 12px; flex-wrap: wrap; }
.options-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 12px; border: 1px solid #ddd; border-radius: 20px; font-size: 13px; transition: all 0.15s; }
.options-row label:hover { background: #e8f0fe; border-color: #0066cc; }
.writing-guide { background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; padding: 10px 14px; margin: 8px 0; font-size: 12px; color: #555; line-height: 1.7; }
textarea.writing-box { width: 100%; min-height: 130px; border: 1px solid #ccc; padding: 10px; font-size: 14px; font-family: Arial, sans-serif; resize: vertical; outline: none; border-radius: 4px; }
textarea.writing-box:focus { border-color: #0066cc; box-shadow: 0 0 0 2px rgba(0,102,204,0.12); }
.submit-section { margin-top: 36px; padding-top: 20px; border-top: 2px solid #eee; text-align: center; }
.submit-btn { background: #0066cc; color: white; border: none; padding: 14px 52px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; }
.submit-btn:hover:not(:disabled) { background: #0052a3; }
.submit-btn:disabled { background: #999; cursor: not-allowed; }
.error-msg { color: #c00; font-size: 13px; margin-bottom: 10px; min-height: 18px; }
.confirm-box { display: none; background: #e6f9ee; border: 2px solid #28a745; border-radius: 10px; padding: 36px; text-align: center; margin-top: 20px; }
.confirm-box h2 { color: #1a7a30; margin: 0 0 8px; font-size: 24px; }
.confirm-box p { color: #333; margin: 0; font-size: 15px; }
@media print {
  body { background: white; padding: 0; }
  .paper { box-shadow: none; padding: 20px; }
  .submit-section { display: none; }
}
"""

TEST_JS = """
document.getElementById('datestamp').textContent = new Date().toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric'
});

function submitTest() {
  const name = document.getElementById('studentName').value.trim();
  const err = document.getElementById('errorMsg');
  if (!name) {
    err.textContent = 'Please enter your name before submitting.';
    document.getElementById('studentName').focus();
    return;
  }
  err.textContent = '';

  const answers = {};
  document.getElementById('testForm').querySelectorAll('input[name], textarea[name]').forEach(el => {
    if (el.type === 'radio') {
      if (el.checked) answers[el.name] = el.value;
    } else {
      const hint = el.dataset.hint || '';
      answers[el.name] = hint + el.value.trim();
    }
  });

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  fetch(window.location.pathname + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_name: name, answers })
  })
  .then(r => { if (!r.ok) throw new Error('Server error ' + r.status); return r.json(); })
  .then(() => {
    document.getElementById('testForm').style.display = 'none';
    document.querySelector('.name-row').style.display = 'none';
    document.getElementById('confirmBox').style.display = 'block';
    window.scrollTo(0, 0);
  })
  .catch(e => {
    err.textContent = 'Could not submit — please tell your teacher. (' + e.message + ')';
    btn.disabled = false;
    btn.textContent = 'Submit test';
  });
}
"""


def _q_key(block_num: int, q_num: int) -> str:
    return f"s{block_num}_q{q_num}"


def _render_question(q: dict, block_num: int) -> str:
    qtype = q.get("type", "")
    q_key = _q_key(block_num, q["num"])
    text = html_lib.escape(q.get("text", ""))

    if qtype == "fill_in_blank":
        # Determine input width by block context
        if block_num <= 3:
            cls = "ans"
        elif block_num == 4:
            cls = "ans ans-lg"
        else:
            cls = "ans ans-xl"
        inp = f'<input class="{cls}" spellcheck="false" autocorrect="off" name="{q_key}">'
        filled = _re.sub(r'_{3,}', inp, text, count=1)
        if filled == text:  # no blank found — append input after text
            filled = text + ' ' + inp
        return f'<div class="q">{q["num"]}. {filled}</div>'

    elif qtype == "fill_in_blank_hint":
        hint = html_lib.escape(q.get("hint_letter", ""))
        inp = f'<span class="hint">{hint}</span><input class="ans ans-sm" data-hint="{hint}" spellcheck="false" autocorrect="off" name="{q_key}">'
        filled = _re.sub(r'_{3,}', inp, text, count=1)
        if filled == text:
            filled = text + ' ' + inp
        return f'<div class="q">{q["num"]}. {filled}</div>'

    elif qtype == "binary_choice":
        choices = q.get("choice_values") or ["option1", "option2"]
        radios = '<div class="radio-row">'
        for i, val in enumerate(choices):
            v = html_lib.escape(val)
            radios += f'<label><input type="radio" name="{q_key}" value="{v}"> {v}</label>'
            if i < len(choices) - 1:
                radios += '<span class="sep">/</span>'
        radios += '</div>'
        return f'<div class="q">{q["num"]}. {text}\n{radios}</div>'

    elif qtype == "multiple_choice":
        options = q.get("options") or []
        radios = '<div class="options-row">'
        for opt in options:
            if isinstance(opt, (list, tuple)) and len(opt) >= 2:
                letter, label = opt[0], opt[1]
            elif isinstance(opt, (list, tuple)) and len(opt) == 1:
                letter, label = opt[0], opt[0]
            else:
                letter, label = str(opt), str(opt)
            l = html_lib.escape(str(letter))
            lb = html_lib.escape(str(label))
            radios += f'<label><input type="radio" name="{q_key}" value="{l}"> {l}) {lb}</label>'
        radios += '</div>'
        q_text = f' {text}' if text else ''
        return f'<div class="q">{q["num"]}.{q_text}\n{radios}</div>'

    elif qtype == "short_answer":
        inp = f'<input class="ans ans-xl" spellcheck="false" autocorrect="off" name="{q_key}" style="margin-top:5px">'
        return f'<div class="q">{q["num"]}. {text}<br>{inp}</div>'

    elif qtype == "essay":
        ta = f'<textarea class="writing-box" name="{q_key}" spellcheck="false" autocorrect="off" autocomplete="off" data-gramm="false" placeholder="Write your answer here..."></textarea>'
        return f'<div class="q">{ta}</div>'

    elif qtype == "show_work":
        ta = f'<textarea class="writing-box" name="{q_key}" spellcheck="false" autocorrect="off" autocomplete="off" data-gramm="false" placeholder="Show your working here..."></textarea>'
        return f'<div class="q">{q["num"]}. {text}<br>{ta}</div>'

    return f'<div class="q">{q["num"]}. {text}</div>'


def _render_section(section: dict, prev_section_title: str) -> str:
    parts = []
    section_title = section.get("section_title", "")
    block_num = section.get("block_num", 1)
    marks = section.get("marks", 0)

    # Section title header — only when section changes
    if section_title != prev_section_title:
        parts.append(f'<div class="section-title">{html_lib.escape(section_title)}</div>')

    # Question block header
    instruction = html_lib.escape(section.get("instruction", ""))
    parts.append(f'<div class="q-header">{block_num} &nbsp; {instruction} <span class="marks">({marks} marks)</span></div>')

    # Audio notice
    audio = section.get("audio_ref")
    if audio:
        parts.append(f'<div class="audio-notice">&#128266; Listen carefully to <strong>track {html_lib.escape(audio)}</strong> played by your teacher.</div>')

    # Word box
    word_box = section.get("word_box")
    if word_box:
        words = " &nbsp;&nbsp; ".join(html_lib.escape(w) for w in word_box)
        parts.append(f'<div class="word-box">{words}</div>')

    # Example
    example = section.get("example")
    if example:
        parts.append(f'<div class="example">{html_lib.escape(example)}</div>')

    # Reading passage
    passage_title = section.get("passage_title")
    passage = section.get("passage")
    if passage:
        title_html = f'<h4>{html_lib.escape(passage_title)}</h4>' if passage_title else ""
        paras = "".join(f"<p>{html_lib.escape(p.strip())}</p>" for p in passage.split("\n") if p.strip())
        parts.append(f'<div class="passage">{title_html}{paras}</div>')

    # Dialogue
    dialogue = section.get("dialogue")
    if dialogue:
        lines = []
        for line in dialogue.split("\n"):
            line = line.strip()
            if not line:
                continue
            # Detect speaker prefix (A: or B:)
            if line.startswith("A:") or line.startswith("B:"):
                speaker = line[0]
                rest = html_lib.escape(line[2:].strip())
                lines.append(f'<p><span class="sp">{speaker}:</span> {rest}</p>')
            else:
                lines.append(f'<p>{html_lib.escape(line)}</p>')
        parts.append(f'<div class="dialogue">{"".join(lines)}</div>')

    # Writing guide
    writing_guide = section.get("writing_guide")
    if writing_guide:
        parts.append(f'<div class="writing-guide">{html_lib.escape(writing_guide)}</div>')

    # Questions
    for q in section.get("questions", []):
        parts.append(_render_question(q, block_num))

    return "\n".join(parts)


def generate_test_html(test_data: dict, test_id: str) -> str:
    title = html_lib.escape(test_data.get("title", "Test"))
    sections_html = []
    prev_title = ""
    for section in test_data.get("sections", []):
        sections_html.append(_render_section(section, prev_title))
        prev_title = section.get("section_title", "")

    body = "\n".join(sections_html)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>{TEST_CSS}</style>
</head>
<body>
<div class="paper">
  <div class="header-bar">
    <h1>{title}</h1>
    <div class="datestamp" id="datestamp"></div>
  </div>
  <div class="name-row">
    <label for="studentName">Student name:</label>
    <input type="text" id="studentName" class="name-input"
      spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="words"
      placeholder="Enter your full name" required>
  </div>
  <form id="testForm" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
{body}
    <div class="submit-section">
      <div id="errorMsg" class="error-msg"></div>
      <button type="button" class="submit-btn" id="submitBtn" onclick="submitTest()">Submit test</button>
      <div style="font-size:12px;color:#888;margin-top:10px;">Check all your answers before submitting. You cannot change them after.</div>
    </div>
  </form>
  <div class="confirm-box" id="confirmBox">
    <h2>&#10003; Test submitted!</h2>
    <p>Your answers have been saved. You can close this window.</p>
  </div>
</div>
<script>{TEST_JS}</script>
</body>
</html>"""
