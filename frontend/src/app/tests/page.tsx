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
  const [copiedId, setCopiedId] = useState("");
  const testFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);

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
        <p style={s.hint}>Upload your test document (.txt or .docx) and optionally an answer key. The AI will parse it into an interactive test page your students can complete online.</p>

        <div style={s.fileRow}>
          <div style={s.fileGroup}>
            <label style={s.label}>Test document <span style={s.required}>*</span></label>
            <input ref={testFileRef} type="file" accept=".txt,.doc,.docx" style={s.fileInput} />
          </div>
          <div style={s.fileGroup}>
            <label style={s.label}>Answer key <span style={s.optional}>(optional)</span></label>
            <input ref={keyFileRef} type="file" accept=".txt,.doc,.docx,.pdf" style={s.fileInput} />
          </div>
        </div>

        {uploadErr && <div style={s.errMsg}>{uploadErr}</div>}
        {uploadMsg && <div style={s.okMsg}>{uploadMsg}</div>}

        <button style={uploading ? s.btnDisabled : s.btn} onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading & parsing..." : "Upload test"}
        </button>
      </div>

      {/* Tests list */}
      <div style={s.card}>
        <div style={s.listHeader}>
          <h2 style={s.cardTitle}>Your tests</h2>
          <button style={s.btnSmall} onClick={loadTests}>Refresh</button>
        </div>

        {/* Pinned unit7 entry */}
        <div style={s.testRow}>
          <div style={s.testInfo}>
            <div style={s.testTitle}>Unit 7 Standard Test A</div>
            <div style={s.testMeta}>Hardcoded test &nbsp;·&nbsp; <a href="/test-results" style={s.link}>View results</a></div>
          </div>
          <div style={s.testActions}>
            <div style={s.urlRow}>
              <code style={s.urlCode}>{RAILWAY_URL}/test/unit7</code>
              <button style={s.copyBtn} onClick={() => {
                navigator.clipboard.writeText(`${RAILWAY_URL}/test/unit7`);
                setCopiedId("unit7");
                setTimeout(() => setCopiedId(""), 2000);
              }}>
                {copiedId === "unit7" ? "Copied!" : "Copy URL"}
              </button>
            </div>
          </div>
        </div>

        {loading && <p style={{ color: "#888", fontSize: 14, margin: "16px 0" }}>Loading...</p>}
        {error && <p style={{ color: "#c00", fontSize: 14 }}>{error}</p>}
        {!loading && !error && tests.length === 0 && (
          <p style={{ color: "#888", fontSize: 14, margin: "16px 0" }}>No uploaded tests yet.</p>
        )}

        {tests.map(test => (
          <div key={test.id} style={s.testRow}>
            <div style={s.testInfo}>
              <div style={s.testTitle}>{test.title}</div>
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
  btn: { background: "#0066cc", color: "white", border: "none", padding: "10px 28px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  btnDisabled: { background: "#999", color: "white", border: "none", padding: "10px 28px", borderRadius: 6, cursor: "not-allowed", fontWeight: "bold", fontSize: 14 },
  btnSmall: { background: "none", border: "1px solid #ccc", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, color: "#555" },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  testRow: { borderTop: "1px solid #eee", paddingTop: 14, paddingBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  testInfo: { flex: "0 0 auto", minWidth: 200 },
  testTitle: { fontWeight: "bold", fontSize: 15, color: "#111", marginBottom: 3 },
  testMeta: { fontSize: 12, color: "#888" },
  testActions: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" },
  urlRow: { display: "flex", alignItems: "center", gap: 8 },
  urlCode: { fontSize: 11, background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4, padding: "3px 8px", color: "#333", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  copyBtn: { background: "#0066cc", color: "white", border: "none", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" },
  btnRow: { display: "flex", gap: 8 },
  resultsBtn: { background: "#28a745", color: "white", border: "none", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: "bold" },
  deleteBtn: { background: "none", border: "1px solid #e44", color: "#c00", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 13 },
  link: { color: "#0066cc", textDecoration: "underline", cursor: "pointer" },
};
