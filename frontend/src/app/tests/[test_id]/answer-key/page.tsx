"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type AnswerVal = string | string[];

interface QuestionInfo {
  key: string;
  block: number;
  num: number;
  type: string;
  text: string;
  options: [string, string][] | null;
  choice_values: string[] | null;
}

interface AnswerKeyData {
  answer_key: Record<string, AnswerVal>;
  questions: QuestionInfo[];
}

function answerToText(val: AnswerVal | undefined): string {
  if (val === undefined || val === null) return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

function textToAnswer(text: string): string[] {
  return text.split(",").map(s => s.trim()).filter(Boolean);
}

export default function AnswerKeyEditorPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.test_id as string;

  const [data, setData] = useState<AnswerKeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [edits, setEdits] = useState<Record<string, AnswerVal>>({});

  function getToken() {
    return localStorage.getItem("token") || "";
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { setError("Not logged in."); setLoading(false); return; }
    fetch(`${API_URL}/test/${testId}/answer-key`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: AnswerKeyData) => {
        setData(d);
        setEdits({ ...d.answer_key });
        setLoading(false);
      })
      .catch(e => { setError(`Could not load: ${e.message}`); setLoading(false); });
  }, [testId]);

  function setAnswer(key: string, val: AnswerVal) {
    setEdits(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function clearAnswer(key: string) {
    setEdits(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const token = getToken();
    try {
      const r = await fetch(`${API_URL}/test/${testId}/answer-key`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ answer_key: edits }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      const result = await r.json();
      setEdits(result.answer_key);
      if (data) setData({ ...data, answer_key: result.answer_key });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={s.page}><p style={{ color: "#888" }}>Loading…</p></div>;
  if (error) return <div style={s.page}><p style={{ color: "#c00" }}>{error}</p></div>;
  if (!data) return null;

  // Group questions by block
  const blocks: Record<number, QuestionInfo[]> = {};
  for (const q of data.questions) {
    if (!blocks[q.block]) blocks[q.block] = [];
    blocks[q.block].push(q);
  }
  const blockNums = Object.keys(blocks).map(Number).sort((a, b) => a - b);

  return (
    <div style={s.page}>
      <button style={s.backBtn} onClick={() => router.push("/tests")}>&larr; Tests</button>
      <div style={s.headerBar}>
        <div>
          <h1 style={s.pageTitle}>Edit answer key</h1>
          <p style={s.subtitle}>
            Review what the AI parsed and fix anything wrong before students take the test.
            For multiple-choice, click the correct option. For fill-in-blank, type the accepted answers
            (separate alternatives with commas).
          </p>
        </div>
        <div style={s.headerActions}>
          {saved && <span style={s.savedTag}>Saved</span>}
          <button style={saving ? s.saveBtnDisabled : s.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {blockNums.map(bn => (
        <div key={bn} style={s.block}>
          <h2 style={s.blockTitle}>Block {bn}</h2>
          {blocks[bn].map(q => (
            <QuestionEditor
              key={q.key}
              q={q}
              currentVal={edits[q.key]}
              onChange={(v) => setAnswer(q.key, v)}
              onClear={() => clearAnswer(q.key)}
              testId={testId}
              onQuestionUpdated={(updated) => {
                if (!data) return;
                setData({
                  ...data,
                  questions: data.questions.map(qq => qq.key === updated.key ? updated : qq),
                });
              }}
            />
          ))}
        </div>
      ))}

      <div style={s.footer}>
        {saved && <span style={s.savedTag}>Saved</span>}
        <button style={saving ? s.saveBtnDisabled : s.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

const QUESTION_TYPES = [
  { value: "fill_in_blank", label: "Fill in blank" },
  { value: "fill_in_blank_hint", label: "Fill in blank (with hint letter)" },
  { value: "binary_choice", label: "Binary choice (2 options)" },
  { value: "multiple_choice", label: "Multiple choice (a/b/c)" },
  { value: "short_answer", label: "Short answer (full sentence)" },
  { value: "essay", label: "Essay (free writing)" },
];

function QuestionEditor({ q, currentVal, onChange, onClear, testId, onQuestionUpdated }: {
  q: QuestionInfo;
  currentVal: AnswerVal | undefined;
  onChange: (val: AnswerVal) => void;
  onClear: () => void;
  testId: string;
  onQuestionUpdated: (updated: QuestionInfo) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [savingQ, setSavingQ] = useState(false);
  const [editText, setEditText] = useState(q.text || "");
  const [editType, setEditType] = useState(q.type);
  const [editOptions, setEditOptions] = useState<[string, string][]>(q.options || []);
  const [editChoices, setEditChoices] = useState<string[]>(q.choice_values || []);
  const [editHint, setEditHint] = useState("");

  function getToken() { return localStorage.getItem("token") || ""; }

  function startEdit() {
    setEditText(q.text || "");
    setEditType(q.type);
    setEditOptions(q.options ? q.options.map(o => [o[0], o[1]]) : []);
    setEditChoices(q.choice_values ? [...q.choice_values] : []);
    setEditing(true);
  }

  async function saveQuestion() {
    setSavingQ(true);
    const token = getToken();
    const payload: Record<string, unknown> = {
      text: editText,
      type: editType,
    };
    if (editType === "multiple_choice") {
      payload.options = editOptions.filter(o => o[1].trim());
      payload.choice_values = null;
    } else if (editType === "binary_choice") {
      payload.choice_values = editChoices.filter(c => c.trim());
      payload.options = null;
    } else if (editType === "fill_in_blank_hint") {
      payload.hint_letter = editHint;
      payload.options = null;
      payload.choice_values = null;
    } else {
      payload.options = null;
      payload.choice_values = null;
    }

    try {
      const r = await fetch(`${API_URL}/test/${testId}/question/${q.key}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      const result = await r.json();
      onQuestionUpdated({
        ...q,
        text: result.question.text || "",
        type: result.question.type,
        options: result.question.options || null,
        choice_values: result.question.choice_values || null,
      });
      setEditing(false);
    } catch (e: unknown) {
      alert(`Could not save question: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingQ(false);
    }
  }

  function addOption() {
    const nextLetter = String.fromCharCode(97 + editOptions.length);
    setEditOptions([...editOptions, [nextLetter, ""]]);
  }
  function removeOption(idx: number) {
    setEditOptions(editOptions.filter((_, i) => i !== idx));
  }
  function updateOption(idx: number, letter: string, text: string) {
    setEditOptions(editOptions.map((o, i) => i === idx ? [letter, text] : o));
  }
  function addChoice() {
    setEditChoices([...editChoices, ""]);
  }
  function removeChoice(idx: number) {
    setEditChoices(editChoices.filter((_, i) => i !== idx));
  }
  function updateChoice(idx: number, val: string) {
    setEditChoices(editChoices.map((c, i) => i === idx ? val : c));
  }

  const isUnscoreable = q.type === "essay" || q.type === "show_work";
  const hasAnswer = currentVal !== undefined && currentVal !== null &&
    (Array.isArray(currentVal) ? currentVal.length > 0 : String(currentVal).length > 0);

  return (
    <div style={s.qRow}>
      <div style={s.qHeader}>
        <span style={s.qKey}>Q{q.num}</span>
        <span style={s.qType}>{q.type}</span>
        {!isUnscoreable && !hasAnswer && <span style={s.missingTag}>Missing</span>}
        {!editing && (
          <button style={s.editQuestionBtn} onClick={startEdit}>Edit question</button>
        )}
      </div>

      {!editing ? (
        <div style={s.qText}>{q.text || <em style={{ color: "#aaa" }}>(no text)</em>}</div>
      ) : (
        <div style={s.editPanel}>
          <label style={s.editLabel}>Question text</label>
          <textarea
            style={s.editTextarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            placeholder="Use ________ (8 underscores) where the blank goes"
          />

          <label style={s.editLabel}>Type</label>
          <select style={s.editSelect} value={editType} onChange={(e) => setEditType(e.target.value)}>
            {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {editType === "multiple_choice" && (
            <div>
              <label style={s.editLabel}>Options</label>
              {editOptions.map((opt, idx) => (
                <div key={idx} style={s.optionEditRow}>
                  <input
                    style={s.letterInput}
                    value={opt[0]}
                    onChange={(e) => updateOption(idx, e.target.value, opt[1])}
                    maxLength={2}
                  />
                  <span>)</span>
                  <input
                    style={s.optionTextInput}
                    value={opt[1]}
                    onChange={(e) => updateOption(idx, opt[0], e.target.value)}
                    placeholder="Option text"
                  />
                  <button style={s.removeBtn} onClick={() => removeOption(idx)}>✕</button>
                </div>
              ))}
              <button style={s.addBtn} onClick={addOption}>+ Add option</button>
            </div>
          )}

          {editType === "binary_choice" && (
            <div>
              <label style={s.editLabel}>Choices</label>
              {editChoices.map((ch, idx) => (
                <div key={idx} style={s.optionEditRow}>
                  <input
                    style={s.optionTextInput}
                    value={ch}
                    onChange={(e) => updateChoice(idx, e.target.value)}
                    placeholder="Choice text"
                  />
                  <button style={s.removeBtn} onClick={() => removeChoice(idx)}>✕</button>
                </div>
              ))}
              <button style={s.addBtn} onClick={addChoice}>+ Add choice</button>
            </div>
          )}

          {editType === "fill_in_blank_hint" && (
            <div>
              <label style={s.editLabel}>Hint letter (the letter that appears before the blank)</label>
              <input
                style={s.letterInput}
                value={editHint}
                onChange={(e) => setEditHint(e.target.value)}
                maxLength={2}
                placeholder="f"
              />
            </div>
          )}

          <div style={s.editActions}>
            <button style={s.smallSaveBtn} onClick={saveQuestion} disabled={savingQ}>
              {savingQ ? "Saving…" : "Save question"}
            </button>
            <button style={s.cancelBtn} onClick={() => setEditing(false)} disabled={savingQ}>Cancel</button>
          </div>
        </div>
      )}

      {!editing && !isUnscoreable && (
        <>
          {q.type === "multiple_choice" && q.options && (
            <MultipleChoiceEditor options={q.options} value={currentVal} onChange={onChange} />
          )}
          {q.type === "binary_choice" && q.choice_values && (
            <BinaryChoiceEditor choices={q.choice_values} value={currentVal} onChange={onChange} />
          )}
          {(q.type === "fill_in_blank" || q.type === "fill_in_blank_hint" || q.type === "short_answer") && (
            <TextAnswerEditor value={currentVal} onChange={onChange} type={q.type} />
          )}
          {hasAnswer && (
            <button style={s.clearBtn} onClick={onClear}>Clear answer</button>
          )}
        </>
      )}

      {!editing && isUnscoreable && (
        <div style={s.unscoreableNote}>Graded manually by teacher — no answer key needed.</div>
      )}
    </div>
  );
}

function MultipleChoiceEditor({ options, value, onChange }: {
  options: [string, string][];
  value: AnswerVal | undefined;
  onChange: (val: string[]) => void;
}) {
  const current = Array.isArray(value) ? value : value !== undefined ? [String(value)] : [];
  // Determine which letter is "selected" — match either the letter or the text
  const selectedLetter = options.find(([letter, text]) =>
    current.some(c => {
      const cl = String(c).toLowerCase().trim();
      return cl === letter.toLowerCase() || cl === text.toLowerCase();
    })
  )?.[0];

  return (
    <div style={s.optionsRow}>
      {options.map(([letter, text]) => (
        <label key={letter} style={{
          ...s.optionLabel,
          ...(selectedLetter === letter ? s.optionLabelSelected : {}),
        }}>
          <input
            type="radio"
            name={`mc_${letter}_${text}`}
            checked={selectedLetter === letter}
            onChange={() => onChange([letter])}
          />
          <span><strong>{letter})</strong> {text}</span>
        </label>
      ))}
    </div>
  );
}

function BinaryChoiceEditor({ choices, value, onChange }: {
  choices: string[];
  value: AnswerVal | undefined;
  onChange: (val: string[]) => void;
}) {
  const current = Array.isArray(value) ? value[0] : value;
  return (
    <div style={s.optionsRow}>
      {choices.map((ch, i) => (
        <label key={i} style={{
          ...s.optionLabel,
          ...(String(current).toLowerCase().trim() === ch.toLowerCase().trim() ? s.optionLabelSelected : {}),
        }}>
          <input
            type="radio"
            checked={String(current).toLowerCase().trim() === ch.toLowerCase().trim()}
            onChange={() => onChange([ch])}
          />
          <span>{ch}</span>
        </label>
      ))}
    </div>
  );
}

function TextAnswerEditor({ value, onChange, type }: {
  value: AnswerVal | undefined;
  onChange: (val: string[]) => void;
  type: string;
}) {
  const [text, setText] = useState(answerToText(value));
  // Keep local state in sync if value changes externally (e.g., after save)
  useEffect(() => { setText(answerToText(value)); }, [value]);

  const placeholder = type === "short_answer"
    ? "Expected answer (e.g. she started lessons when she was five)"
    : "Accepted answers (comma-separated alternatives, e.g. fame, famous)";

  return (
    <input
      type="text"
      style={s.textInput}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(textToAnswer(e.target.value));
      }}
    />
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "24px 20px", fontFamily: "Arial, sans-serif", fontSize: 14 },
  backBtn: { background: "none", border: "none", color: "#0066cc", cursor: "pointer", fontSize: 13, padding: "0 0 6px", display: "block" },
  headerBar: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" },
  pageTitle: { fontSize: 22, margin: "0 0 6px" },
  subtitle: { margin: 0, color: "#555", fontSize: 13, maxWidth: 600, lineHeight: 1.6 },
  headerActions: { display: "flex", alignItems: "center", gap: 12 },
  saveBtn: { background: "#0066cc", color: "white", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  saveBtnDisabled: { background: "#999", color: "white", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "not-allowed", fontWeight: "bold", fontSize: 14 },
  savedTag: { color: "#1a7a30", background: "#e6f9ee", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: "bold" },
  block: { background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "20px 24px", marginBottom: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  blockTitle: { fontSize: 17, margin: "0 0 14px", borderBottom: "2px solid #111", paddingBottom: 6 },
  qRow: { borderBottom: "1px solid #eee", padding: "12px 0" },
  qHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  qKey: { fontSize: 12, fontWeight: "bold", color: "#0066cc" },
  qType: { fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  missingTag: { fontSize: 11, color: "#c00", background: "#fee", padding: "2px 8px", borderRadius: 8, fontWeight: "bold" },
  qText: { fontSize: 13, color: "#333", marginBottom: 8, lineHeight: 1.5 },
  optionsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  optionLabel: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid #ddd", borderRadius: 18, cursor: "pointer", fontSize: 13, transition: "all 0.15s" },
  optionLabelSelected: { background: "#e6f9ee", border: "2px solid #1a7a30", padding: "5px 11px", fontWeight: "bold" },
  textInput: { width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 5, fontSize: 14, fontFamily: "Arial, sans-serif" },
  unscoreableNote: { fontSize: 12, color: "#888", fontStyle: "italic", padding: "4px 0" },
  clearBtn: { background: "none", border: "1px solid #ccc", color: "#666", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, marginTop: 6 },
  footer: { display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center", marginTop: 16, padding: "16px 0" },
  editQuestionBtn: { background: "none", border: "1px solid #6f42c1", color: "#6f42c1", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, marginLeft: "auto", fontWeight: "bold" },
  editPanel: { background: "#faf8ff", border: "1px solid #d8c8f0", borderRadius: 6, padding: "12px 14px", marginTop: 6 },
  editLabel: { display: "block", fontSize: 12, fontWeight: "bold", color: "#444", marginTop: 8, marginBottom: 4 },
  editTextarea: { width: "100%", padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, fontFamily: "Arial, sans-serif", resize: "vertical" },
  editSelect: { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, marginBottom: 4 },
  optionEditRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 },
  letterInput: { width: 40, padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, fontWeight: "bold", textAlign: "center" },
  optionTextInput: { flex: 1, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 },
  removeBtn: { background: "none", border: "1px solid #ccc", color: "#c00", padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 },
  addBtn: { background: "white", border: "1px dashed #6f42c1", color: "#6f42c1", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, marginTop: 4 },
  editActions: { display: "flex", gap: 8, marginTop: 12 },
  smallSaveBtn: { background: "#6f42c1", color: "white", border: "none", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: "bold" },
  cancelBtn: { background: "none", border: "1px solid #ccc", color: "#666", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12 },
};
