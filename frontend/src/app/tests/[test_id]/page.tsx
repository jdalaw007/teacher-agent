"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Question {
  num: number;
  type: string;
  text?: string;
}

interface Section {
  section_title: string;
  block_num: number;
  instruction: string;
  marks: number;
  questions: Question[];
}

interface AiGrade {
  score: number;
  reason: string;
}

interface Submission {
  id: number;
  student_name: string;
  answers: Record<string, string>;
  ai_grades: Record<string, AiGrade>;
  submitted_at: string;
}

interface TestResults {
  title: string;
  sections: Section[];
  answer_key: Record<string, string | string[]>;
  rubric: string;
  submissions: Submission[];
}

function getCorrectAnswers(key: string, answerKey: Record<string, string | string[]>): string[] | null {
  const val = answerKey[key];
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) return val.map(v => v.toLowerCase());
  return [val.toLowerCase()];
}

function checkAnswer(qKey: string, given: string, answerKey: Record<string, string | string[]>): boolean | null {
  const correct = getCorrectAnswers(qKey, answerKey);
  if (!correct) return null;
  return correct.includes((given || "").toLowerCase().trim());
}

function autoScore(answers: Record<string, string>, answerKey: Record<string, string | string[]>): number {
  return Object.keys(answerKey).filter(k => checkAnswer(k, answers[k] || "", answerKey) === true).length;
}

function totalMarks(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.marks, 0);
}

export default function TestResultsPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.test_id as string;

  const [data, setData] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rubric, setRubric] = useState("");
  const [rubricSaved, setRubricSaved] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeErr, setGradeErr] = useState("");
  // ai_grades keyed by submission id
  const [aiGrades, setAiGrades] = useState<Record<number, Record<string, AiGrade>>>({});
  const rubricSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getToken() {
    return localStorage.getItem("token") || "";
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { setError("Not logged in."); setLoading(false); return; }
    fetch(`${API_URL}/test/${testId}/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: TestResults) => {
        setData(d);
        setRubric(d.rubric || "");
        // Seed any existing ai_grades from DB
        const existing: Record<number, Record<string, AiGrade>> = {};
        for (const sub of d.submissions) {
          if (Object.keys(sub.ai_grades).length > 0) existing[sub.id] = sub.ai_grades;
        }
        setAiGrades(existing);
        setLoading(false);
      })
      .catch(e => { setError(`Could not load results: ${e.message}`); setLoading(false); });
  }, [testId]);

  function handleRubricChange(val: string) {
    setRubric(val);
    setRubricSaved(false);
    if (rubricSaveTimer.current) clearTimeout(rubricSaveTimer.current);
    rubricSaveTimer.current = setTimeout(() => saveRubric(val), 1200);
  }

  async function saveRubric(val: string) {
    const token = getToken();
    try {
      await fetch(`${API_URL}/test/${testId}/rubric`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rubric: val }),
      });
      setRubricSaved(true);
    } catch { /* silent */ }
  }

  async function handleGradeAll() {
    if (!rubric.trim()) { setGradeErr("Enter a rubric before grading."); return; }
    setGrading(true);
    setGradeErr("");
    const token = getToken();
    try {
      const r = await fetch(`${API_URL}/test/${testId}/grade-essays`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rubric }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      // Response: {sub_id: {q_key: {score, reason}}}
      const result: Record<string, Record<string, AiGrade>> = await r.json();
      const numericKeyed: Record<number, Record<string, AiGrade>> = {};
      for (const [k, v] of Object.entries(result)) numericKeyed[Number(k)] = v;
      setAiGrades(numericKeyed);
      setRubricSaved(true);
    } catch (e: unknown) {
      setGradeErr(`Grading failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGrading(false);
    }
  }

  if (loading) return <div style={s.page}><p style={{ color: "#888" }}>Loading results...</p></div>;
  if (error) return <div style={s.page}><p style={{ color: "#c00" }}>{error}</p></div>;
  if (!data) return null;

  const autoQ = Object.keys(data.answer_key).length;
  const total = totalMarks(data.sections);
  const hasEssays = data.sections.some(sec =>
    sec.questions.some(q => q.type === "essay")
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div className="no-print">
        <button style={s.backBtn} onClick={() => router.push("/tests")}>&larr; Tests</button>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>{data.title} — Results</h1>
            <p style={s.subtitle}>
              {data.submissions.length} submission{data.submissions.length !== 1 ? "s" : ""}
              {autoQ > 0 && ` · Auto-scored: ${autoQ} marks`}
              {` · Total: ${total} marks`}
            </p>
          </div>
          <button style={s.printBtn} onClick={() => window.print()}>Print all answer sheets</button>
        </div>

        {/* Essay grading rubric */}
        {hasEssays && (
          <div style={s.rubricBox}>
            <div style={s.rubricHeader}>
              <span style={s.rubricLabel}>Essay grading rubric</span>
              {rubricSaved && <span style={s.rubricSaved}>Saved</span>}
            </div>
            <textarea
              style={s.rubricInput}
              value={rubric}
              onChange={e => handleRubricChange(e.target.value)}
              placeholder="Describe how to award marks, e.g. Award marks for: correct grammar, relevant vocabulary, 60-80 words, two clear paragraphs..."
              rows={3}
            />
            {gradeErr && <div style={s.gradeErr}>{gradeErr}</div>}
            <button
              style={grading ? s.gradesBtnDisabled : s.gradesBtn}
              onClick={handleGradeAll}
              disabled={grading}
            >
              {grading ? "Grading essays..." : "Grade all essays with AI"}
            </button>
          </div>
        )}
      </div>

      {data.submissions.length === 0 && (
        <div style={s.empty}>No submissions yet.</div>
      )}

      {data.submissions.map((sub, idx) => (
        <StudentSheet
          key={sub.id}
          sub={sub}
          idx={idx}
          total={data.submissions.length}
          sections={data.sections}
          answerKey={data.answer_key}
          aiGrades={aiGrades[sub.id] || sub.ai_grades}
        />
      ))}
    </div>
  );
}

function StudentSheet({ sub, idx, total, sections, answerKey, aiGrades }: {
  sub: Submission;
  idx: number;
  total: number;
  sections: Section[];
  answerKey: Record<string, string | string[]>;
  aiGrades: Record<string, AiGrade>;
}) {
  const score = autoScore(sub.answers, answerKey);
  const autoQ = Object.keys(answerKey).length;
  const totalM = totalMarks(sections);
  const date = new Date(sub.submitted_at + "Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ ...s.sheet, pageBreakAfter: idx < total - 1 ? "always" : "auto" }}>
      <div style={s.sheetHeader}>
        <div>
          <div style={s.studentName}>{sub.student_name}</div>
          <div style={s.sheetMeta}>{date}</div>
        </div>
        <div style={s.scoreBox}>
          {autoQ > 0 && <div style={s.scoreAuto}>Auto: {score}/{autoQ}</div>}
          <div style={s.scoreTotal}>Total: ___/{totalM}</div>
        </div>
      </div>

      {sections.map(section => {
        const qKey = (qNum: number) => `s${section.block_num}_q${qNum}`;
        const sectionScore = section.questions.filter(
          q => checkAnswer(qKey(q.num), sub.answers[qKey(q.num)] || "", answerKey) === true
        ).length;
        const hasAutoScore = section.questions.some(q => answerKey[qKey(q.num)] !== undefined);

        return (
          <div key={section.block_num} style={s.section}>
            <div style={s.sectionHeader}>
              <span style={s.sectionTitle}>{section.block_num}. {section.instruction}</span>
              <span style={s.sectionScore}>
                {hasAutoScore
                  ? `${sectionScore}/${section.marks}`
                  : section.questions.some(q => q.type === "essay") && aiGrades[qKey(section.questions[0]?.num)]
                    ? `AI: ${aiGrades[qKey(section.questions[0]?.num)]?.score ?? "?"}/${section.marks}`
                    : `Teacher marks: ___/${section.marks}`}
              </span>
            </div>

            {section.questions.map(q => {
              const key = qKey(q.num);
              const given = sub.answers[key] || "";
              const isEssay = q.type === "essay";
              const grade = aiGrades[key];

              if (isEssay) {
                return (
                  <div key={q.num} style={s.essayRow}>
                    <div style={s.essayText}>{given || <em style={{ color: "#aaa" }}>No answer</em>}</div>
                    {grade && (
                      <div style={s.aiGradeRow}>
                        <span style={s.aiScore}>AI: {grade.score}/10</span>
                        <span style={s.aiReason}>{grade.reason}</span>
                      </div>
                    )}
                  </div>
                );
              }

              const result = checkAnswer(key, given, answerKey);
              const correct = getCorrectAnswers(key, answerKey);

              return (
                <div key={q.num} style={s.answerRow}>
                  <span style={s.qNum}>Q{q.num}</span>
                  <span style={{
                    ...s.answerVal,
                    color: result === true ? "#1a7a30" : result === false ? "#c00" : "#333",
                  }}>
                    {given || <em style={{ color: "#aaa" }}>—</em>}
                  </span>
                  {result === false && correct && (
                    <span style={s.keyHint}> → {correct.join(" / ")}</span>
                  )}
                  {result === null && correct && (
                    <span style={s.keyHint}>(key: {correct.join(" / ")})</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <div style={s.scoreSummary}>
        {sections.map(sec => (
          <span key={sec.block_num}>{sec.section_title || `Block ${sec.block_num}`}: ___/{sec.marks}</span>
        ))}
        <span style={{ fontWeight: "bold" }}>TOTAL: ___/{totalMarks(sections)}</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: "0 auto", padding: "24px 20px", fontFamily: "Arial, sans-serif", fontSize: 14 },
  backBtn: { background: "none", border: "none", color: "#0066cc", cursor: "pointer", fontSize: 13, padding: "0 0 6px", display: "block" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  pageTitle: { margin: "0 0 4px", fontSize: 22 },
  subtitle: { margin: 0, color: "#555", fontSize: 13 },
  printBtn: { background: "#0066cc", color: "white", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  rubricBox: { background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "18px 22px", marginBottom: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  rubricHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  rubricLabel: { fontWeight: "bold", fontSize: 14 },
  rubricSaved: { fontSize: 12, color: "#1a7a30", background: "#e6f9ee", padding: "2px 8px", borderRadius: 10 },
  rubricInput: { width: "100%", border: "1px solid #ccc", borderRadius: 5, padding: "8px 10px", fontSize: 13, fontFamily: "Arial, sans-serif", resize: "vertical", outline: "none", marginBottom: 10 },
  gradeErr: { color: "#c00", fontSize: 13, marginBottom: 8 },
  gradesBtn: { background: "#6f42c1", color: "white", border: "none", padding: "9px 24px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  gradesBtnDisabled: { background: "#999", color: "white", border: "none", padding: "9px 24px", borderRadius: 6, cursor: "not-allowed", fontWeight: "bold", fontSize: 14 },
  empty: { background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 8, padding: 24, color: "#555", textAlign: "center" },
  sheet: { background: "white", border: "1px solid #ccc", borderRadius: 8, padding: "28px 32px", marginBottom: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  sheetHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 12, marginBottom: 16 },
  studentName: { fontSize: 20, fontWeight: "bold" },
  sheetMeta: { fontSize: 12, color: "#666", marginTop: 3 },
  scoreBox: { textAlign: "right" as const },
  scoreAuto: { fontSize: 13, color: "#555" },
  scoreTotal: { fontSize: 16, fontWeight: "bold", marginTop: 2 },
  section: { marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 12 },
  sectionHeader: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { fontWeight: "bold", fontSize: 13 },
  sectionScore: { fontSize: 12, color: "#555", fontStyle: "italic" },
  answerRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" },
  qNum: { color: "#888", minWidth: 28, fontSize: 12 },
  answerVal: { fontWeight: "bold" },
  keyHint: { color: "#888", fontSize: 11 },
  essayRow: { padding: "6px 0" },
  essayText: { background: "#fafafa", border: "1px solid #ddd", borderRadius: 4, padding: "8px 12px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", minHeight: 48 },
  aiGradeRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 6, padding: "5px 10px", background: "#f3eeff", border: "1px solid #c8aff0", borderRadius: 5 },
  aiScore: { fontWeight: "bold", color: "#6f42c1", fontSize: 13, whiteSpace: "nowrap" },
  aiReason: { fontSize: 12, color: "#555" },
  scoreSummary: { display: "flex", flexWrap: "wrap", gap: "6px 20px", background: "#f8f8f8", border: "1px solid #ddd", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginTop: 8 },
};
