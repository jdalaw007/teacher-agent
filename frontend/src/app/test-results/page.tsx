"use client";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Answer key ────────────────────────────────────────────────────────────────
// Sections 1, 2, 3, 5, 8 are auto-scored (35 marks total)
const ANSWER_KEY: Record<string, string[]> = {
  q1_1: ["bass"], q1_2: ["sister"], q1_3: ["talented"], q1_4: ["hard"],
  q1_5: ["energy"], q1_6: ["songs"], q1_7: ["singer", "vocalist"],
  q1_8: ["practising", "practicing"], q1_9: ["sing"], q1_10: ["famous"],
  q2_1: ["fan"], q2_2: ["band"], q2_3: ["lyrics"], q2_4: ["views"],
  q2_5: ["keyboard"], q2_6: ["traditional"], q2_7: ["concert"],
  q2_8: ["drums"], q2_9: ["hit"], q2_10: ["reggae"],
  q3_1: ["talented"], q3_2: ["kind"], q3_3: ["famous"],
  q3_4: ["confident"], q3_5: ["energetic"],
  q5_1: ["prediction"], q5_2: ["plan"], q5_3: ["prediction"],
  q5_4: ["plan"], q5_5: ["prediction"],
  q8_1: ["b"], q8_2: ["b"], q8_3: ["c"], q8_4: ["a"], q8_5: ["a"],
};

// Sections 4, 6, 7 — show key alongside for teacher to mark
const ANSWER_KEY_DISPLAY: Record<string, string> = {
  q4_1: "You're / You are going to be …",
  q4_2: "We aren't / are not going to watch …",
  q4_3: "I'm / I am going to meet …",
  q4_4: "My parents are going to buy …",
  q4_5: "Sam's not / Sam isn't / is not going to come …",
  q6_1: "What are you going to do?",
  q6_2: "Where are we going to stay?",
  q6_3: "Is your dad going to visit the UK next week?",
  q6_4: "Are your friends going to play tennis tomorrow?",
  q6_5: "What's / What is your grandma going to cook?",
  q7_1: "She started having piano lessons when she was five.",
  q7_2: "Her favourite type of music is electronic music.",
  q7_3: "She makes her music videos at weekends.",
  q7_4: "She wants to learn about different types of music.",
  q7_5: "She wants to be a successful musician when she's older.",
};

// Section 8 answer labels for readable display
const Q8_LABELS: Record<string, Record<string, string>> = {
  q8_1: { a: "have", b: "want", c: "like" },
  q8_2: { a: "is", b: "would", c: "can" },
  q8_3: { a: "Any", b: "Isn't", c: "No" },
  q8_4: { a: "else", b: "other", c: "also" },
  q8_5: { a: "Can", b: "Do", c: "Are" },
};

function isCorrect(key: string, value: string): boolean | null {
  const correct = ANSWER_KEY[key];
  if (!correct) return null;
  return correct.some(a => a.toLowerCase() === (value || "").toLowerCase().trim());
}

function autoScore(answers: Record<string, string>) {
  let correct = 0;
  for (const key of Object.keys(ANSWER_KEY)) {
    if (isCorrect(key, answers[key] || "")) correct++;
  }
  return correct; // out of 35
}

interface Submission {
  id: number;
  student_name: string;
  answers: Record<string, string>;
  submitted_at: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TestResultsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("google_token") || localStorage.getItem("access_token") || "";
    if (!token) { setError("Not logged in."); setLoading(false); return; }
    fetch(`${API_URL}/test/unit7/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { setSubmissions(data); setLoading(false); })
      .catch(e => { setError(`Could not load results: ${e.message}`); setLoading(false); });
  }, []);

  if (loading) return <div style={styles.page}><p style={{ color: "#555" }}>Loading results…</p></div>;
  if (error) return <div style={styles.page}><p style={{ color: "#c00" }}>{error}</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.header} className="no-print">
        <div>
          <h1 style={styles.title}>Unit 7 Test A — Results</h1>
          <p style={styles.subtitle}>{submissions.length} submission{submissions.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Auto-scored: 35 marks &nbsp;·&nbsp; Teacher marks: 40 marks &nbsp;·&nbsp; Total: 75 marks</p>
        </div>
        <button style={styles.printBtn} onClick={() => window.print()}>Print all answer sheets</button>
      </div>

      {submissions.length === 0 && (
        <div style={styles.empty}>No submissions yet. Share the test link with students:<br />
          <code style={{ fontSize: 13, marginTop: 8, display: "block" }}>
            https://teacher-agent-production-56cb.up.railway.app/test/unit7
          </code>
        </div>
      )}

      {submissions.map((sub, idx) => (
        <StudentSheet key={sub.id} sub={sub} idx={idx} total={submissions.length} />
      ))}
    </div>
  );
}

// ── Per-student answer sheet ──────────────────────────────────────────────────
function StudentSheet({ sub, idx, total }: { sub: Submission; idx: number; total: number }) {
  const score = autoScore(sub.answers);
  const date = new Date(sub.submitted_at + "Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ ...styles.sheet, pageBreakAfter: idx < total - 1 ? "always" : "auto" }}>
      <div style={styles.sheetHeader}>
        <div>
          <div style={styles.studentName}>{sub.student_name}</div>
          <div style={styles.sheetMeta}>Unit 7 Standard Test A &nbsp;·&nbsp; {date}</div>
        </div>
        <div style={styles.scoreBox}>
          <div style={styles.scoreAuto}>Auto: {score}/35</div>
          <div style={styles.scoreTotal}>Total: ___/75</div>
        </div>
      </div>

      {/* Section 1 — Listening */}
      <Section title="Listening — Q1" marks={10} autoMarks={score_section(sub.answers, "q1_", 10)}>
        <TwoColGrid keys={range("q1_", 10)} answers={sub.answers} />
      </Section>

      {/* Section 2 — Vocabulary */}
      <Section title="Vocabulary — Q2" marks={10} autoMarks={score_section(sub.answers, "q2_", 10)}>
        <TwoColGrid keys={range("q2_", 10)} answers={sub.answers} />
      </Section>

      {/* Section 3 — Adjectives */}
      <Section title="Vocabulary: Adjectives — Q3" marks={5} autoMarks={score_section(sub.answers, "q3_", 5)}>
        <TwoColGrid keys={range("q3_", 5)} answers={sub.answers} />
      </Section>

      {/* Section 4 — be going to (teacher marks) */}
      <Section title="Language: be going to — Q4" marks={10} teacherMarks>
        <KeyedSection keys={range("q4_", 5)} answers={sub.answers} />
      </Section>

      {/* Section 5 — prediction/plan */}
      <Section title="Language: Prediction / Plan — Q5" marks={5} autoMarks={score_section(sub.answers, "q5_", 5)}>
        <TwoColGrid keys={range("q5_", 5)} answers={sub.answers} />
      </Section>

      {/* Section 6 — Questions (teacher marks) */}
      <Section title="Language: Write Questions — Q6" marks={10} teacherMarks>
        <KeyedSection keys={range("q6_", 5)} answers={sub.answers} />
      </Section>

      {/* Section 7 — Reading (teacher marks) */}
      <Section title="Reading — Q7" marks={10} teacherMarks>
        <KeyedSection keys={range("q7_", 5)} answers={sub.answers} />
      </Section>

      {/* Section 8 — Communication */}
      <Section title="Communication — Q8" marks={5} autoMarks={score_section(sub.answers, "q8_", 5)}>
        <TwoColGrid keys={range("q8_", 5)} answers={sub.answers} q8Labels={Q8_LABELS} />
      </Section>

      {/* Section 9 — Writing */}
      <Section title="Writing — Q9" marks={10} teacherMarks>
        <div style={styles.writingAnswer}>{sub.answers["q9"] || <em style={{ color: "#999" }}>No answer</em>}</div>
      </Section>

      {/* Score summary row */}
      <div style={styles.scoreSummary}>
        <span>Listening: ___/10</span>
        <span>Vocabulary: ___/15</span>
        <span>Language: ___/25</span>
        <span>Reading: ___/10</span>
        <span>Communication: ___/5</span>
        <span>Writing: ___/10</span>
        <span style={{ fontWeight: "bold" }}>TOTAL: ___/75</span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, marks, autoMarks, teacherMarks, children }: {
  title: string; marks: number; autoMarks?: number; teacherMarks?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>{title}</span>
        <span style={styles.sectionScore}>
          {teacherMarks ? `Teacher marks: ___/${marks}` : `${autoMarks}/${marks}`}
        </span>
      </div>
      {children}
    </div>
  );
}

function TwoColGrid({ keys, answers, q8Labels }: {
  keys: string[]; answers: Record<string, string>; q8Labels?: Record<string, Record<string, string>>;
}) {
  return (
    <div style={styles.grid}>
      {keys.map((key, i) => {
        const val = answers[key] || "";
        const correct = isCorrect(key, val);
        let display = val || "—";
        if (q8Labels && q8Labels[key] && val) {
          display = `${val}) ${q8Labels[key][val] || val}`;
        }
        return (
          <div key={key} style={styles.gridCell}>
            <span style={styles.qNum}>Q{i + 1}</span>
            <span style={{ ...styles.answer, color: correct === true ? "#1a7a30" : correct === false ? "#c00" : "#444" }}>
              {display}
            </span>
            {correct === false && ANSWER_KEY[key] && (
              <span style={styles.correctHint}> → {ANSWER_KEY[key].join(" / ")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KeyedSection({ keys, answers }: { keys: string[]; answers: Record<string, string> }) {
  return (
    <div>
      {keys.map((key, i) => (
        <div key={key} style={styles.keyedRow}>
          <span style={styles.qNum}>Q{i + 1}</span>
          <div style={{ flex: 1 }}>
            <div style={styles.studentAns}>{answers[key] || <em style={{ color: "#aaa" }}>No answer</em>}</div>
            <div style={styles.answerKey}>Key: {ANSWER_KEY_DISPLAY[key]}</div>
          </div>
          <span style={styles.teacherMark}>___/2</span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function range(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

function score_section(answers: Record<string, string>, prefix: string, count: number): number {
  let correct = 0;
  for (let i = 1; i <= count; i++) {
    const key = `${prefix}${i}`;
    if (isCorrect(key, answers[key] || "")) correct++;
  }
  return correct;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "24px 20px", fontFamily: "Arial, sans-serif", fontSize: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  title: { margin: 0, fontSize: 22 },
  subtitle: { margin: "4px 0 0", color: "#555", fontSize: 13 },
  printBtn: { background: "#0066cc", color: "white", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "4px 16px" },
  gridCell: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" },
  qNum: { color: "#888", minWidth: 24, fontSize: 12 },
  answer: { fontWeight: "bold" },
  correctHint: { color: "#c00", fontSize: 11 },
  keyedRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 13 },
  studentAns: { fontWeight: "bold", minHeight: 18 },
  answerKey: { fontSize: 11, color: "#888", marginTop: 2 },
  teacherMark: { fontSize: 12, color: "#888", whiteSpace: "nowrap", paddingTop: 2 },
  writingAnswer: { background: "#fafafa", border: "1px solid #ddd", borderRadius: 4, padding: "10px 12px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", minHeight: 60 },
  scoreSummary: { display: "flex", flexWrap: "wrap", gap: "6px 20px", background: "#f8f8f8", border: "1px solid #ddd", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginTop: 8 },
};
