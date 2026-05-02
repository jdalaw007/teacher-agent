"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const RAILWAY_URL = "https://teacher-agent-production-56cb.up.railway.app";

interface TestEntry {
  id: string;
  title: string;
  created_at: string;
  submission_count: number;
}

export default function TestsPage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const [uploadedTestId, setUploadedTestId] = useState("");
  const [validation, setValidation] = useState<{passed:number;failed:number;skipped:number;issues:{q_id:string;problem:string}[];error?:string;round?:number;fixes_applied?:string[];fix_error?:string} | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const testFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState("");
  const [mdTitle, setMdTitle] = useState("");
  const [mdSubmitting, setMdSubmitting] = useState(false);
  const [mdMsg, setMdMsg] = useState("");
  const [mdErr, setMdErr] = useState("");
  const [mdShown, setMdShown] = useState(false);

  useEffect(() => { loadTests(); }, []);

  function getToken() {
    return localStorage.getItem("token") || "";
  }

  function loadTests() {
    const token = getToken();
    if (!token) { setError("Not logged in."); setLoading(false); return; }
    setLoading(true);
    fetch(`${API_URL}/test/list`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => { setTests(data); setLoading(false); })
      .catch(e => { setError(`Could not load tests: ${e.message}`); setLoading(false); });
  }

  async function handleUpload() {
    const testFile = testFileRef.current?.files?.[0];
    if (!testFile) { setUploadErr("Please select a test file."); return; }

    const token = getToken();
    if (!token) { setUploadErr("Not logged in."); return; }

    setUploading(true);
    setUploadErr("");
    setUploadMsg("Parsing test with AI... this may take 20-30 seconds.");

    const formData = new FormData();
    formData.append("test_file", testFile);
    const keyFile = keyFileRef.current?.files?.[0];
    if (keyFile) formData.append("answer_key_file", keyFile);

    try {
      const r = await fetch(`${API_URL}/test/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      const data = await r.json();
      setUploadMsg(`"${data.title}" uploaded successfully.`);
      setUploadedTestId(data.test_id);
      setValidation(data.validation || null);
      if (testFileRef.current) testFileRef.current.value = "";
      if (keyFileRef.current) keyFileRef.current.value = "";
      loadTests();
    } catch (e: unknown) {
      setUploadErr(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      setUploadMsg("");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(testId: string, title: string) {
    if (!confirm(`Delete "${title}" and all its submissions? This cannot be undone.`)) return;
    const token = getToken();
    try {
      const r = await fetch(`${API_URL}/test/${testId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setTests(prev => prev.filter(t => t.id !== testId));
    } catch (e: unknown) {
      alert(`Could not delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function startRename(test: TestEntry) {
    setRenamingId(test.id);
    setRenameValue(test.title);
  }

  async function commitRename(testId: string) {
    const title = renameValue.trim();
    if (!title) { setRenamingId(""); return; }
    const token = getToken();
    try {
      const r = await fetch(`${API_URL}/test/${testId}/title`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setTests(prev => prev.map(t => t.id === testId ? { ...t, title } : t));
    } catch (e: unknown) {
      alert(`Could not rename: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRenamingId("");
    }
  }

  async function handleCreateFromMarkdown() {
    if (!markdown.trim()) { setMdErr("Paste some markdown first."); return; }
    const token = getToken();
    if (!token) { setMdErr("Not logged in."); return; }
    setMdSubmitting(true);
    setMdErr(""); setMdMsg("");
    try {
      const r = await fetch(`${API_URL}/test/from-markdown`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, title: mdTitle.trim() || undefined }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      const data = await r.json();
      setMdMsg(`"${data.title}" created. Test ID: ${data.test_id}`);
      setMarkdown(""); setMdTitle("");
      loadTests();
    } catch (e: unknown) {
      setMdErr(`Could not create: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMdSubmitting(false);
    }
  }

  function copyUrl(testId: string) {
    const url = `${RAILWAY_URL}/test/${testId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(testId);
      setTimeout(() => setCopiedId(""), 2000);
    });
  }

  return (
    <div style={s.page}>
      <button style={s.backBtn} onClick={() => router.push('/dashboard')}>&larr; Dashboard</button>
      <h1 style={s.pageTitle}>Tests</h1>

      {/* Upload card */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Upload a new test</h2>
        <p style={s.hint}>Upload your test as a PDF (recommended) or .docx/.txt file, plus an optional answer key. PDF gives the best results — the AI reads the pages visually, preserving all formatting.</p>

        <div style={s.fileRow}>
          <div style={s.fileGroup}>
            <label style={s.label}>Test document <span style={s.required}>*</span></label>
            <input ref={testFileRef} type="file" accept=".pdf,.txt,.doc,.docx" style={s.fileInput} />
          </div>
          <div style={s.fileGroup}>
            <label style={s.label}>Answer key <span style={s.optional}>(optional)</span></label>
            <input ref={keyFileRef} type="file" accept=".pdf,.txt,.doc,.docx" style={s.fileInput} />
          </div>
        </div>

        {uploadErr && <div style={s.errMsg}>{uploadErr}</div>}
        {uploadMsg && (
          <div style={s.okMsg}>
            {uploadMsg}
            {uploadedTestId && (
              <> &nbsp;·&nbsp; <button style={s.inlineLink} onClick={() => router.push(`/tests/${uploadedTestId}`)}>View results</button></>
            )}
          </div>
        )}
        {validation && (
          <div style={validation.failed === 0 ? s.valOk : s.valWarn}>
            <strong>AI Validation</strong>{validation.round && validation.round > 1 ? ` (auto-fixed in ${validation.round} round${validation.round > 1 ? "s" : ""})` : ""}:{" "}
            {validation.error
              ? `Validator error: ${validation.error}`
              : `${validation.passed} questions OK${validation.failed > 0 ? `, ${validation.failed} still flagged` : ", all clear"}, ${validation.skipped} without key`}
            {validation.fixes_applied && validation.fixes_applied.length > 0 && (
              <div style={{ fontSize: 12, marginTop: 4 }}>Auto-fixed: {validation.fixes_applied.join(", ")}</div>
            )}
            {validation.fix_error && <div style={{ fontSize: 12, marginTop: 4, color: "#c00" }}>{validation.fix_error}</div>}
            {validation.issues && validation.issues.length > 0 && (
              <ul style={s.issueList}>
                {validation.issues.map((issue, i) => (
                  <li key={i}><strong>{issue.q_id}:</strong> {issue.problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button style={uploading ? s.btnDisabled : s.btn} onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading & parsing..." : "Upload test"}
        </button>
      </div>

      {/* Markdown direct entry */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={s.cardTitle}>Or paste markdown directly</h2>
          <button style={s.btnSmall} onClick={() => setMdShown(v => !v)}>{mdShown ? "Hide" : "Show"}</button>
        </div>
        {mdShown && (
          <>
            <p style={s.hint}>
              Build a test by typing it in markdown — no AI parsing, no upload. The format is documented in
              <code> backend/app/services/test_markdown.py</code>. Quick examples:
              <code style={{ display: "block", whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "8px 12px", borderRadius: 4, marginTop: 6, fontSize: 12 }}>{`## 1. Vocabulary (5 marks)
> Complete the sentences.

1. Joe's a big f________ of metal.   = fan
2. (*There's / are) two theatres.

## 2. Listening (5 marks)
> Tick the adjectives you hear.
1.
   [ ] small *
   [ ] modern *
   [ ] dirty`}</code>
            </p>
            <input
              type="text"
              placeholder="Test title (optional, overrides # heading)"
              value={mdTitle}
              onChange={e => setMdTitle(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: "1px solid #ccc", borderRadius: 5, fontSize: 14, marginBottom: 8 }}
            />
            <textarea
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              placeholder="# My Test&#10;&#10;## 1. Block name (10 marks)&#10;> Instruction&#10;&#10;1. Question text   = answer"
              rows={14}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 5, fontSize: 13, fontFamily: "Menlo, Consolas, monospace", resize: "vertical" }}
            />
            {mdErr && <div style={s.errMsg}>{mdErr}</div>}
            {mdMsg && <div style={s.okMsg}>{mdMsg}</div>}
            <button
              style={mdSubmitting ? s.btnDisabled : s.btn}
              onClick={handleCreateFromMarkdown}
              disabled={mdSubmitting}
            >
              {mdSubmitting ? "Creating..." : "Create test from markdown"}
            </button>
          </>
        )}
      </div>

      {/* Tests list */}
      <div style={s.card}>
        <div style={s.listHeader}>
          <h2 style={s.cardTitle}>Your tests</h2>
          <button style={s.btnSmall} onClick={loadTests}>Refresh</button>
        </div>

        {loading && <p style={{ color: "#888", fontSize: 14, margin: "16px 0" }}>Loading...</p>}
        {error && <p style={{ color: "#c00", fontSize: 14 }}>{error}</p>}
        {!loading && !error && tests.length === 0 && (
          <p style={{ color: "#888", fontSize: 14, margin: "16px 0" }}>No uploaded tests yet.</p>
        )}

        {tests.map(test => (
          <div key={test.id} style={s.testRow}>
            <div style={s.testInfo}>
              {renamingId === test.id ? (
                <input
                  style={s.renameInput}
                  value={renameValue}
                  autoFocus
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(test.id)}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(test.id); if (e.key === "Escape") setRenamingId(""); }}
                />
              ) : (
                <div style={s.testTitle} title="Click to rename" onClick={() => startRename(test)}>
                  {test.title} <span style={s.editHint}>✎</span>
                </div>
              )}
              <div style={s.testMeta}>
                {new Date(test.created_at + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                &nbsp;·&nbsp; {test.submission_count} submission{test.submission_count !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={s.testActions}>
              <div style={s.urlRow}>
                <code style={s.urlCode}>{RAILWAY_URL}/test/{test.id}</code>
                <button style={s.copyBtn} onClick={() => copyUrl(test.id)}>
                  {copiedId === test.id ? "Copied!" : "Copy URL"}
                </button>
              </div>
              <div style={s.btnRow}>
                <button style={s.editKeyBtn} onClick={() => router.push(`/tests/${test.id}/answer-key`)}>
                  Edit answer key
                </button>
                <button style={s.resultsBtn} onClick={() => router.push(`/tests/${test.id}`)}>
                  View results
                </button>
                <button style={s.deleteBtn} onClick={() => handleDelete(test.id, test.title)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "28px 20px", fontFamily: "Arial, sans-serif" },
  backBtn: { background: "none", border: "none", color: "#0066cc", cursor: "pointer", fontSize: 13, padding: "0 0 12px", display: "block" },
  pageTitle: { fontSize: 24, margin: "0 0 24px", color: "#111" },
  card: { background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "24px 28px", marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  cardTitle: { fontSize: 17, fontWeight: "bold", margin: "0 0 12px", color: "#111" },
  hint: { fontSize: 13, color: "#666", margin: "0 0 18px", lineHeight: 1.6 },
  fileRow: { display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 },
  fileGroup: { display: "flex", flexDirection: "column", gap: 6, flex: "1 1 260px" },
  label: { fontSize: 13, fontWeight: "bold", color: "#444" },
  required: { color: "#c00" },
  optional: { color: "#888", fontWeight: "normal" },
  fileInput: { fontSize: 13, padding: "6px 0" },
  errMsg: { color: "#c00", fontSize: 13, marginBottom: 10 },
  okMsg: { color: "#1a7a30", fontSize: 13, marginBottom: 10 },
  inlineLink: { background: "none", border: "none", color: "#0066cc", cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 },
  btn: { background: "#0066cc", color: "white", border: "none", padding: "10px 28px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  btnDisabled: { background: "#999", color: "white", border: "none", padding: "10px 28px", borderRadius: 6, cursor: "not-allowed", fontWeight: "bold", fontSize: 14 },
  btnSmall: { background: "none", border: "1px solid #ccc", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, color: "#555" },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  testRow: { borderTop: "1px solid #eee", paddingTop: 14, paddingBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  testInfo: { flex: "0 0 auto", minWidth: 200 },
  testTitle: { fontWeight: "bold", fontSize: 15, color: "#111", marginBottom: 3, cursor: "pointer" },
  editHint: { fontSize: 12, color: "#aaa", marginLeft: 4 },
  renameInput: { fontWeight: "bold", fontSize: 15, color: "#111", border: "1px solid #0066cc", borderRadius: 4, padding: "2px 6px", marginBottom: 3, width: "100%", outline: "none" },
  testMeta: { fontSize: 12, color: "#888" },
  testActions: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" },
  urlRow: { display: "flex", alignItems: "center", gap: 8 },
  urlCode: { fontSize: 11, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4, padding: "3px 8px", color: "#333", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  copyBtn: { background: "#0066cc", color: "white", border: "none", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" },
  btnRow: { display: "flex", gap: 8 },
  resultsBtn: { background: "#28a745", color: "white", border: "none", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: "bold" },
  editKeyBtn: { background: "#6f42c1", color: "white", border: "none", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: "bold" },
  deleteBtn: { background: "none", border: "1px solid #e44", color: "#c00", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 13 },
  link: { color: "#0066cc", textDecoration: "underline", cursor: "pointer" },
  valOk: { background: "#e6f9ee", border: "1px solid #28a745", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#1a7a30", marginBottom: 10 },
  valWarn: { background: "#fff8e1", border: "1px solid #ffc107", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#7a5800", marginBottom: 10 },
  issueList: { margin: "8px 0 0 16px", padding: 0, lineHeight: 1.8 },
};
