from fastapi import APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json, uuid, os
from datetime import datetime
from app.services.database import get_db
from app.services.token_store import get_user_id_from_token
from app.services.test_html import generate_test_html
from app.services.test_parser import parse_test, parse_answer_key
from app.services.profile import get_ai_client

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_auth(request: Request) -> str:
    """Return user_id or raise 401."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    return get_user_id_from_token(auth.split(" ")[1])


# ---------------------------------------------------------------------------
# Hardcoded Unit 7 test (kept for backward compatibility)
# ---------------------------------------------------------------------------

TEST_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unit 7 Standard Test A</title>
<style>
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
  .submit-section, .name-row button { display: none; }
}
</style>
</head>
<body>
<div class="paper">

  <div class="header-bar">
    <h1>Unit 7 &nbsp; Standard Test A &nbsp; &#9733;&#9733;</h1>
    <div class="datestamp" id="datestamp"></div>
  </div>

  <div class="name-row">
    <label for="studentName">Student name:</label>
    <input type="text" id="studentName" class="name-input"
      spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="words"
      placeholder="Enter your full name" required>
  </div>

  <form id="testForm" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">

    <!-- SECTION 1: LISTENING -->
    <div class="section-title">Listening</div>
    <div class="q-header">1 &nbsp; Listen to the conversation. Complete the sentences. <span class="marks">(10 marks)</span></div>
    <div class="audio-notice">&#128266; Listen carefully to <strong>track 1.08</strong> played by your teacher, then fill in the blanks.</div>
    <div class="example">Simon started a <u>band</u> a month ago.</div>
    <div class="q">1. Simon plays the <input class="ans" spellcheck="false" autocorrect="off" name="q1_1">.</div>
    <div class="q">2. Simon's <input class="ans" spellcheck="false" autocorrect="off" name="q1_2"> plays the keyboards.</div>
    <div class="q">3. Simon's friend Andy is very <input class="ans" spellcheck="false" autocorrect="off" name="q1_3">.</div>
    <div class="q">4. Simon likes <input class="ans" spellcheck="false" autocorrect="off" name="q1_4"> rock.</div>
    <div class="q">5. Simon's band plays music with lots of <input class="ans" spellcheck="false" autocorrect="off" name="q1_5">.</div>
    <div class="q">6. They can't play a concert yet, because they only know four <input class="ans" spellcheck="false" autocorrect="off" name="q1_6">.</div>
    <div class="q">7. The band hasn't got a <input class="ans" spellcheck="false" autocorrect="off" name="q1_7"> yet.</div>
    <div class="q">8. Simon and his friends are <input class="ans" spellcheck="false" autocorrect="off" name="q1_8"> next Sunday.</div>
    <div class="q">9. Karen would like to <input class="ans" spellcheck="false" autocorrect="off" name="q1_9"> with a band.</div>
    <div class="q">10. Simon and his friends probably won't be <input class="ans" spellcheck="false" autocorrect="off" name="q1_10">.</div>

    <!-- SECTION 2: VOCABULARY -->
    <div class="section-title">Vocabulary</div>
    <div class="q-header">2 &nbsp; Complete the sentences. <span class="marks">(10 marks)</span></div>
    <div class="q">1. Joe's a big <span class="hint">f</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_1"> of heavy metal. He loves it!</div>
    <div class="q">2. Kate plays the guitar in a <span class="hint">b</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_2"> with some friends.</div>
    <div class="q">3. I like that song, but I don't understand the <span class="hint">l</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_3">. They're in Spanish.</div>
    <div class="q">4. Dave's music video had about a hundred <span class="hint">v</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_4"> on its first day.</div>
    <div class="q">5. If you can play the piano, you'll find this electronic <span class="hint">k</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_5"> quite easy to play.</div>
    <div class="q">6. Samba is a type of <span class="hint">t</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_6"> music from Brazil.</div>
    <div class="q">7. I went to a <span class="hint">c</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_7"> last night. There were three different bands.</div>
    <div class="q">8. The <span class="hint">d</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_8"> in that rock band are really loud!</div>
    <div class="q">9. Everyone is buying this song. It's going to be a <span class="hint">h</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_9">!</div>
    <div class="q">10. <span class="hint">R</span><input class="ans ans-sm" spellcheck="false" autocorrect="off" name="q2_10"> is a type of music that started in Jamaica.</div>

    <div class="q-header" style="margin-top:18px">3 &nbsp; Complete the sentences. Use adjectives that match the nouns in the box. <span class="marks">(5 marks)</span></div>
    <div class="word-box">
      <span>confidence</span><span>energy</span><span>fame</span><span>kindness</span><span>success</span><span>talent</span>
    </div>
    <div class="example">Maggie often sings on TV. She's <em>successful</em>.</div>
    <div class="q">1. Mark is very good at the piano. He's <input class="ans" spellcheck="false" autocorrect="off" name="q3_1">.</div>
    <div class="q">2. Alex likes helping other people. He's <input class="ans" spellcheck="false" autocorrect="off" name="q3_2">.</div>
    <div class="q">3. Everyone knows Taylor Swift. She's <input class="ans" spellcheck="false" autocorrect="off" name="q3_3">.</div>
    <div class="q">4. Rebecca isn't scared of playing in front of a big audience. She's <input class="ans" spellcheck="false" autocorrect="off" name="q3_4">.</div>
    <div class="q">5. My brother cycles about five kilometres every day. He's <input class="ans" spellcheck="false" autocorrect="off" name="q3_5">.</div>

    <!-- SECTION 3: LANGUAGE FOCUS -->
    <div class="section-title">Language focus</div>
    <div class="q-header">4 &nbsp; Complete with <em>be going to</em>. <span class="marks">(10 marks)</span></div>
    <div class="example">(our teacher / arrive) &rarr; <em>Our teacher is going to arrive</em> soon.</div>
    <div class="q">1. (you / be) &nbsp; <input class="ans ans-lg" spellcheck="false" autocorrect="off" name="q4_1"> famous.</div>
    <div class="q">2. (we / not / watch) &nbsp; <input class="ans ans-lg" spellcheck="false" autocorrect="off" name="q4_2"> a film tonight.</div>
    <div class="q">3. (I / meet) &nbsp; <input class="ans ans-lg" spellcheck="false" autocorrect="off" name="q4_3"> my cousin tomorrow.</div>
    <div class="q">4. (my parents / buy) &nbsp; <input class="ans ans-lg" spellcheck="false" autocorrect="off" name="q4_4"> a new car.</div>
    <div class="q">5. (Sam / not / come) &nbsp; <input class="ans ans-lg" spellcheck="false" autocorrect="off" name="q4_5"> to the party.</div>

    <div class="q-header" style="margin-top:18px">5 &nbsp; Read the sentences. Choose <em>prediction</em> or <em>plan</em>. <span class="marks">(5 marks)</span></div>
    <div class="example">Our team won't win the match. &nbsp; <strong>prediction</strong> / plan</div>
    <div class="q">1. I think it'll rain this afternoon.
      <div class="radio-row">
        <label><input type="radio" name="q5_1" value="prediction"> prediction</label>
        <span class="sep">/</span>
        <label><input type="radio" name="q5_1" value="plan"> plan</label>
      </div>
    </div>
    <div class="q">2. We're going to have a party at my house tonight.
      <div class="radio-row">
        <label><input type="radio" name="q5_2" value="prediction"> prediction</label>
        <span class="sep">/</span>
        <label><input type="radio" name="q5_2" value="plan"> plan</label>
      </div>
    </div>
    <div class="q">3. I think the maths exam will be difficult.
      <div class="radio-row">
        <label><input type="radio" name="q5_3" value="prediction"> prediction</label>
        <span class="sep">/</span>
        <label><input type="radio" name="q5_3" value="plan"> plan</label>
      </div>
    </div>
    <div class="q">4. I'm going to cook dinner for my parents next Saturday.
      <div class="radio-row">
        <label><input type="radio" name="q5_4" value="prediction"> prediction</label>
        <span class="sep">/</span>
        <label><input type="radio" name="q5_4" value="plan"> plan</label>
      </div>
    </div>
    <div class="q">5. It's a brilliant film. I'm sure you'll enjoy it.
      <div class="radio-row">
        <label><input type="radio" name="q5_5" value="prediction"> prediction</label>
        <span class="sep">/</span>
        <label><input type="radio" name="q5_5" value="plan"> plan</label>
      </div>
    </div>

    <div class="q-header" style="margin-top:18px">6 &nbsp; Write questions with <em>be going to</em>. <span class="marks">(10 marks)</span></div>
    <div class="example">(Tony / buy / a ticket) &rarr; <em>Is Tony going to buy a ticket?</em></div>
    <div class="q">1. (what / you / do) &nbsp; <input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q6_1">?</div>
    <div class="q">2. (where / we / stay) &nbsp; <input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q6_2">?</div>
    <div class="q">3. (your dad / visit the UK / next week) &nbsp; <input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q6_3">?</div>
    <div class="q">4. (your friends / play tennis / tomorrow) &nbsp; <input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q6_4">?</div>
    <div class="q">5. (what / your grandma / cook) &nbsp; <input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q6_5">?</div>

    <!-- SECTION 4: READING -->
    <div class="section-title">Reading</div>
    <div class="q-header">7 &nbsp; Read the text. Then answer the questions. Write complete sentences. <span class="marks">(10 marks)</span></div>
    <div class="passage">
      <h4>Following a dream</h4>
      <p>Zara is an ambitious young musician from Manchester. Her parents loved classical music, and her mum started giving her piano lessons when she was just five years old. Zara was a talented child, and she learned quickly.</p>
      <p>Zara is seventeen now. These days her real passion is electronic music, and her favourite instrument is the keyboard. She sings, too, and she writes her own songs.</p>
      <p>At weekends, Zara usually gets together with a few other musicians and friends. They make music videos and upload them to the Internet. Their videos are very popular &#8211; the last one had ten thousand views on its first day.</p>
      <p>Zara is still at school, but she already knows what she wants to do with her future. &#8220;When I leave school, I'm going to travel around the world and explore different types of music. My ambition is to become a successful musician. It won't be easy!&#8221;</p>
    </div>
    <div class="q">1. When did Zara start having piano lessons?<br><input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q7_1" style="margin-top:5px"></div>
    <div class="q">2. What is Zara's favourite type of music?<br><input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q7_2" style="margin-top:5px"></div>
    <div class="q">3. When does Zara make her music videos?<br><input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q7_3" style="margin-top:5px"></div>
    <div class="q">4. What does Zara want to learn about?<br><input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q7_4" style="margin-top:5px"></div>
    <div class="q">5. What does Zara want to be when she's older?<br><input class="ans ans-xl" spellcheck="false" autocorrect="off" name="q7_5" style="margin-top:5px"></div>

    <!-- SECTION 5: COMMUNICATION -->
    <div class="section-title">Communication</div>
    <div class="q-header">8 &nbsp; Circle the correct answers (a, b or c). <span class="marks">(5 marks)</span></div>
    <div class="dialogue">
      <p><span class="sp">A:</span> You look busy. What are you doing?</p>
      <p><span class="sp">B:</span> There's going to be a party at school, and I'm helping with it. I've got all these snacks to prepare.</p>
      <p><span class="sp">A:</span> Do you <strong>[1]</strong> me to do that?</p>
      <p><span class="sp">B:</span> That <strong>[2]</strong> be great.</p>
      <p><span class="sp">A:</span> <strong>[3]</strong> problem. Can I do anything <strong>[4]</strong> to help?</p>
      <p><span class="sp">B:</span> Well, we need to move the chairs and tables. <strong>[5]</strong> you help with that?</p>
    </div>
    <div class="q">1.
      <div class="options-row">
        <label><input type="radio" name="q8_1" value="a"> a) have</label>
        <label><input type="radio" name="q8_1" value="b"> b) want</label>
        <label><input type="radio" name="q8_1" value="c"> c) like</label>
      </div>
    </div>
    <div class="q">2.
      <div class="options-row">
        <label><input type="radio" name="q8_2" value="a"> a) is</label>
        <label><input type="radio" name="q8_2" value="b"> b) would</label>
        <label><input type="radio" name="q8_2" value="c"> c) can</label>
      </div>
    </div>
    <div class="q">3.
      <div class="options-row">
        <label><input type="radio" name="q8_3" value="a"> a) Any</label>
        <label><input type="radio" name="q8_3" value="b"> b) Isn't</label>
        <label><input type="radio" name="q8_3" value="c"> c) No</label>
      </div>
    </div>
    <div class="q">4.
      <div class="options-row">
        <label><input type="radio" name="q8_4" value="a"> a) else</label>
        <label><input type="radio" name="q8_4" value="b"> b) other</label>
        <label><input type="radio" name="q8_4" value="c"> c) also</label>
      </div>
    </div>
    <div class="q">5.
      <div class="options-row">
        <label><input type="radio" name="q8_5" value="a"> a) Can</label>
        <label><input type="radio" name="q8_5" value="b"> b) Do</label>
        <label><input type="radio" name="q8_5" value="c"> c) Are</label>
      </div>
    </div>

    <!-- SECTION 6: WRITING -->
    <div class="section-title">Writing</div>
    <div class="q-header">9 &nbsp; Write a review of a music video that you like. Write 60&#8211;80 words. <span class="marks">(10 marks)</span></div>
    <div class="writing-guide">
      <strong>Paragraph 1:</strong> Who wrote the music? What kind of music is it? What are the lyrics about? Who can you see in the video?<br>
      <strong>Paragraph 2:</strong> What do you like about this video? Who will enjoy this video? Who won't like it?
    </div>
    <textarea class="writing-box" name="q9" spellcheck="false" autocorrect="off" autocomplete="off"
      data-gramm="false" data-gramm_editor="false"
      placeholder="Write your review here (60-80 words)..."></textarea>

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
<script>
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
      answers[el.name] = el.value.trim();
    }
  });

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  fetch('/test/unit7/submit', {
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
    err.textContent = 'Could not submit -- please tell your teacher. (' + e.message + ')';
    btn.disabled = false;
    btn.textContent = 'Submit test';
  });
}
</script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Unit 7 endpoints (specific routes — must be defined before /{test_id})
# ---------------------------------------------------------------------------

@router.get("/unit7", response_class=HTMLResponse)
async def get_unit7_test():
    return TEST_HTML


class SubmitRequest(BaseModel):
    student_name: str
    answers: Dict[str, Any]


@router.post("/unit7/submit")
async def submit_unit7(body: SubmitRequest):
    name = body.student_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Student name required")
    db = get_db()
    try:
        db.execute(
            "INSERT INTO test_submissions (test_id, student_name, answers, submitted_at) VALUES (?, ?, ?, ?)",
            ("unit7", name, json.dumps(body.answers), datetime.utcnow().isoformat())
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/unit7/submissions")
async def get_unit7_submissions(request: Request):
    _require_auth(request)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, student_name, answers, submitted_at FROM test_submissions "
            "WHERE test_id = ? ORDER BY submitted_at ASC",
            ("unit7",)
        ).fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["answers"] = json.loads(r["answers"])
            result.append(r)
        return result
    finally:
        db.close()


@router.delete("/unit7/submissions")
async def clear_unit7_submissions(request: Request):
    _require_auth(request)
    db = get_db()
    try:
        db.execute("DELETE FROM test_submissions WHERE test_id = ?", ("unit7",))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Dynamic test management — also before /{test_id} catch-all
# ---------------------------------------------------------------------------

def _normalize_answer_key(answer_key: dict, test_data: dict) -> dict:
    """For multiple_choice questions, ensure answer key accepts the letter the student submits.
    If key has text ("discovered"), find matching option letter ("b") and store both.
    """
    q_map = {}  # q_key -> question dict
    for sec in test_data.get("sections", []):
        bn = sec.get("block_num", 0)
        for q in sec.get("questions", []):
            q_map[f"s{bn}_q{q['num']}"] = q

    normalized = {}
    for k, v in answer_key.items():
        q = q_map.get(k)
        if q and q.get("type") == "multiple_choice":
            options = q.get("options") or []
            vals = v if isinstance(v, list) else [v]
            extra = set()
            for ans in vals:
                ans_lower = str(ans).lower().strip()
                for opt in options:
                    if isinstance(opt, (list, tuple)) and len(opt) >= 2:
                        letter, text = str(opt[0]).lower(), str(opt[1]).lower()
                        if ans_lower == text:
                            extra.add(letter)
                        elif ans_lower == letter:
                            extra.add(text)
            merged = list(dict.fromkeys([str(x).lower() for x in vals] + list(extra)))
            normalized[k] = merged
        else:
            normalized[k] = v
    return normalized


@router.post("/upload")
async def upload_test(
    request: Request,
    test_file: UploadFile = File(...),
    answer_key_file: Optional[UploadFile] = File(None),
):
    """Parse a test doc (txt/docx) with AI and save it. Returns {test_id, title, url}."""
    import traceback as _tb
    try:
        return await _upload_test_inner(request, test_file, answer_key_file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Upload error: {e} | {_tb.format_exc()[-600:]}")


async def _upload_test_inner(request, test_file, answer_key_file):
    user_id = _require_auth(request)

    ai_client, model = get_ai_client(user_id)
    if not ai_client:
        raise HTTPException(status_code=400, detail="No AI API key configured. Add one in Settings.")

    # Parse test document
    file_bytes = await test_file.read()
    try:
        test_data = parse_test(file_bytes, test_file.filename or "test.txt", ai_client, model)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse test: {e} | {_tb.format_exc()[-400:]}")

    # Parse answer key if provided
    answer_key: dict = {}
    if answer_key_file and answer_key_file.filename:
        key_bytes = await answer_key_file.read()
        try:
            answer_key = parse_answer_key(key_bytes, answer_key_file.filename, ai_client, model)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse answer key: {e} | {_tb.format_exc()[-400:]}")

    # Normalize answer key: for multiple_choice questions, if key has text answer,
    # also accept the matching letter (student submits "b", key may have "discovered")
    answer_key = _normalize_answer_key(answer_key, test_data)

    # Save to DB
    test_id = uuid.uuid4().hex[:8]
    title = test_data.get("title") or os.path.splitext(test_file.filename or "Untitled Test")[0]
    db = get_db()
    try:
        db.execute(
            "INSERT INTO tests (id, teacher_user_id, title, test_data, answer_key) VALUES (?, ?, ?, ?, ?)",
            (test_id, user_id, title, json.dumps(test_data), json.dumps(answer_key))
        )
        db.commit()
    finally:
        db.close()

    return {"test_id": test_id, "title": title, "url": f"/test/{test_id}"}


@router.get("/list")
async def list_tests(request: Request):
    """Return all tests belonging to the authenticated teacher."""
    user_id = _require_auth(request)
    db = get_db()
    try:
        rows = db.execute(
            """SELECT t.id, t.title, t.created_at,
                      (SELECT COUNT(*) FROM test_submissions WHERE test_id = t.id) as submission_count
               FROM tests t WHERE t.teacher_user_id = ? ORDER BY t.created_at DESC""",
            (user_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Rubric save + AI essay grading — also before /{test_id} catch-all
# ---------------------------------------------------------------------------

class RenameRequest(BaseModel):
    title: str


@router.patch("/{test_id}/title")
async def rename_test(test_id: str, body: RenameRequest, request: Request):
    """Rename a test (teacher only)."""
    user_id = _require_auth(request)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    db = get_db()
    try:
        row = db.execute("SELECT teacher_user_id FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not row or row["teacher_user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Not found")
        db.execute("UPDATE tests SET title = ? WHERE id = ?", (title, test_id))
        db.commit()
        return {"ok": True, "title": title}
    finally:
        db.close()


class RubricRequest(BaseModel):
    rubric: str


@router.put("/{test_id}/rubric")
async def save_rubric(test_id: str, body: RubricRequest, request: Request):
    """Save the essay grading rubric for a test."""
    user_id = _require_auth(request)
    db = get_db()
    try:
        row = db.execute("SELECT teacher_user_id FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not row or row["teacher_user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Not found")
        db.execute("UPDATE tests SET rubric = ? WHERE id = ?", (body.rubric.strip(), test_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/{test_id}/grade-essays")
async def grade_essays(test_id: str, body: RubricRequest, request: Request):
    """Grade all essay answers with AI. Also saves the rubric. Returns {sub_id: {q_key: {score, reason}}}."""
    user_id = _require_auth(request)
    rubric = body.rubric.strip()
    if not rubric:
        raise HTTPException(status_code=400, detail="Rubric is required for AI grading")

    ai_client, model = get_ai_client(user_id)
    if not ai_client:
        raise HTTPException(status_code=400, detail="No AI API key configured. Add one in Settings.")

    db = get_db()
    try:
        test_row = db.execute(
            "SELECT title, test_data FROM tests WHERE id = ? AND teacher_user_id = ?",
            (test_id, user_id)
        ).fetchone()
        if not test_row:
            raise HTTPException(status_code=404, detail="Test not found")

        # Save rubric
        db.execute("UPDATE tests SET rubric = ? WHERE id = ?", (rubric, test_id))
        db.commit()

        sections = json.loads(test_row["test_data"]).get("sections", [])
        essay_keys = [
            f"s{sec['block_num']}_q{q['num']}"
            for sec in sections
            for q in sec.get("questions", [])
            if q.get("type") == "essay"
        ]

        if not essay_keys:
            return {}

        rows = db.execute(
            "SELECT id, student_name, answers, ai_grades FROM test_submissions WHERE test_id = ? ORDER BY submitted_at ASC",
            (test_id,)
        ).fetchall()
        submissions = [dict(r) for r in rows]
    finally:
        db.close()

    results: dict = {}

    for sub in submissions:
        answers = json.loads(sub["answers"])
        existing = json.loads(sub.get("ai_grades") or "{}")
        student_grades: dict = dict(existing)

        for q_key in essay_keys:
            essay_text = (answers.get(q_key) or "").strip()
            if not essay_text:
                student_grades[q_key] = {"score": 0, "reason": "No answer submitted"}
                continue

            prompt = (
                f"You are grading a student essay out of 10.\n"
                f"Rubric: {rubric}\n\n"
                f"Student essay:\n{essay_text}\n\n"
                f"Return ONLY valid JSON with no explanation: {{\"score\": <0-10>, \"reason\": \"<one sentence>\"}}"
            )
            try:
                resp = ai_client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=120,
                )
                raw = (resp.choices[0].message.content or "").strip()
                import re as _re
                raw = _re.sub(r"^```(?:json)?\s*", "", raw)
                raw = _re.sub(r"\s*```$", "", raw)
                grade = json.loads(raw)
                student_grades[q_key] = {"score": int(grade["score"]), "reason": str(grade["reason"])}
            except Exception as e:
                student_grades[q_key] = {"score": -1, "reason": f"Grading error: {e}"}

        # Persist grades back to DB
        db2 = get_db()
        try:
            db2.execute(
                "UPDATE test_submissions SET ai_grades = ? WHERE id = ?",
                (json.dumps(student_grades), sub["id"])
            )
            db2.commit()
        finally:
            db2.close()

        results[sub["id"]] = student_grades

    return results


# ---------------------------------------------------------------------------
# Dynamic test pages — /{test_id} catch-all (must be LAST)
# ---------------------------------------------------------------------------

@router.get("/{test_id}", response_class=HTMLResponse)
async def get_dynamic_test(test_id: str):
    """Serve the test HTML page for students (public, no auth)."""
    db = get_db()
    try:
        row = db.execute("SELECT test_data FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Test not found")
        test_data = json.loads(row["test_data"])
    finally:
        db.close()
    return HTMLResponse(generate_test_html(test_data, test_id))


@router.post("/{test_id}/submit")
async def submit_dynamic_test(test_id: str, body: SubmitRequest):
    """Accept a student submission for a dynamic test (public, no auth)."""
    db = get_db()
    try:
        if not db.execute("SELECT id FROM tests WHERE id = ?", (test_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Test not found")
        name = body.student_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Student name required")
        db.execute(
            "INSERT INTO test_submissions (test_id, student_name, answers, submitted_at) VALUES (?, ?, ?, ?)",
            (test_id, name, json.dumps(body.answers), datetime.utcnow().isoformat())
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/{test_id}/submissions")
async def get_dynamic_submissions(test_id: str, request: Request):
    """Return submissions + answer key for a dynamic test (teacher only)."""
    user_id = _require_auth(request)
    db = get_db()
    try:
        test_row = db.execute(
            "SELECT title, test_data, answer_key, rubric FROM tests WHERE id = ? AND teacher_user_id = ?",
            (test_id, user_id)
        ).fetchone()
        if not test_row:
            raise HTTPException(status_code=404, detail="Test not found")

        rows = db.execute(
            "SELECT id, student_name, answers, submitted_at, ai_grades FROM test_submissions "
            "WHERE test_id = ? ORDER BY submitted_at ASC",
            (test_id,)
        ).fetchall()

        submissions = []
        for row in rows:
            r = dict(row)
            r["answers"] = json.loads(r["answers"])
            r["ai_grades"] = json.loads(r["ai_grades"] or "{}")
            submissions.append(r)

        return {
            "title": test_row["title"],
            "sections": json.loads(test_row["test_data"]).get("sections", []),
            "answer_key": json.loads(test_row["answer_key"]),
            "rubric": test_row["rubric"] or "",
            "submissions": submissions,
        }
    finally:
        db.close()


@router.delete("/{test_id}")
async def delete_test(test_id: str, request: Request):
    """Delete a test and all its submissions (teacher only)."""
    user_id = _require_auth(request)
    db = get_db()
    try:
        row = db.execute("SELECT teacher_user_id FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if row["teacher_user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        db.execute("DELETE FROM test_submissions WHERE test_id = ?", (test_id,))
        db.execute("DELETE FROM tests WHERE id = ?", (test_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()
