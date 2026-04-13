"use client";
import { useEffect, useState } from "react";
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

interface Submission {
  id: number;
  student_name: string;
  answers: Record<string, string>;
  submitted_at: string;
}

interface TestResults {
  title: string;
  sections: Section[];
  answer_key: Record<string, string | string[]>;
  submissions: Submission[];
}

// Normalize answer key entry to array for uniform checking
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
  let score = 0;
  for (const key of Object.keys(answerKey)) {
    if (checkAnswer(key, answers[key] || "", answerKey) === true) score++;
  }
  return score;
}

function totalAutoScoreable(answerKey: Record<string, string | string[]>): number {
  return Object.keys(answerKey).length;
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

  useEffect(() => {
    const token = localStorage.getItem("google_token") || localStorage.getItem("access_token") || "";
    if (!token) { setError("Not logged in."); setLoading(false); return; }
    fetch(`${API_URL}/test/${testId}/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(`Could not load results: ${e.message}`); setLoading(false); });
  }, [testId]);

  if (loading) return <div style={s.page}><p style={{ color: "#888" }}>Loading results...</p></div>;
  if (error) return <div style={s.page}><p style={{ color: "#c00" }}>{error}</p></div>;
  if (!data) return null;

  const autoQ = totalAutoScoreable(data.answer_key);
  const total = totalMarks(data.sections);

  return (
    <div style={s.page}>
      <div style={{ ...s.pageHeader, ...{ className: "no-print" } as object }} className="no-print">
        <div>
          <button style={s.backBtn} onClick={() => router.push("/tests")}>&larr; Tests</button>
          <h1 style={s.pageTitle}>{data.title} — Results</h1>
          <p style={s.subtitle}>
            {data.submissions.length} submission{data.submissions.length !== 1 ? "s" : ""}
            {autoQ > 0 && ` · Auto-scored: ${autoQ} marks`}
            {` · Total: ${total} marks`}
          </p>
        </div>
        <button style={s.printBtn} onClick={() => window.print()}>Print all answer sheets</button>
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
        />
      ))}
    </div>
  );
}

function StudentSheet({ sub, idx, total, sections, answerKey }: {
  sub: Submission;
  idx: number;
  total: number;
  sections: Section[];
  answerKey: Record<string, string | string[]>;
}) {
  const score = autoScore(sub.answers, answerKey);
  const autoQ = totalAutoScoreable(answerKey);
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
        const hasAutoScore = section.questions.some(q => {
          const key = qKey(q.num);
          return answerKey[key] !== undefined;
        });
        const sectionScore = section.questions.filter(q => checkAnswer(qKey(q.num), sub.answers[qKey(q.num)] || "", answerKey) === true).length;

        return (
          <div key={section.block_num} style={s.section}>
            <div style={s.sectionHeader}>
              <span style={s.sectionTitle}>
                {section.block_num}. {section.instruction}
              </span>
              <span style={s.sectionScore}>
                {hasAutoScore
                  ? `${sectionScore}/${section.marks}`
                  : `Teacher marks: ___/${section.marks}`}
              </span>
            </div>

            {section.questions.map(q => {
              const key = qKey(q.num);
              const given = sub.answers[key] || "";
              const result = checkAnswer(key, given, answerKey);
              const correct = getCorrectAnswers(key, answerKey);
              const isEssay = q.type === "essay";

              if (isEssay) {
                return (
                  <div key={q.num} style={s.essayRow}>
                    <div style={s.essayText}>{given || <em style={{ color: "#aaa" }}>No answer</em>}</div>
                  </div>
                );
              }

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
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 },
  backBtn: { background: "none", border: "none", color: "#0066cc", cursor: "pointer", fontSize: 13, padding: "0 0 6px", display: "block" },
  pageTitle: { margin: "0 0 4px", fontSize: 22 },
  subtitle: { margin: 0, color: "#555", fontSize: 13 },
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
  answerRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" },
  qNum: { color: "#888", minWidth: 28, fontSize: 12 },
  answerVal: { fontWeight: "bold" },
  keyHint: { color: "#888", fontSize: 11 },
  essayRow: { padding: "6px 0" },
  essayText: { background: "#fafafa", border: "1px solid #ddd", borderRadius: 4, padding: "8px 12px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", minHeight: 48 },
  scoreSummary: { display: "flex", flexWrap: "wrap", gap: "6px 20px", background: "#f8f8f8", border: "1px solid #ddd", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginTop: 8 },
};
