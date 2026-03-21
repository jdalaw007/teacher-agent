# GDPR Compliance Document
## Teacher Agent — Czech Republic (Grade School)

**Prepared:** 2026-03-19
**Jurisdiction:** EU GDPR (2016/679) + Czech Act No. 110/2019 Coll.
**Supervisory Authority:** ÚOOÚ (Úřad pro ochranu osobních údajů)
**EU AI Act Classification:** High-risk AI system (Annex III — educational evaluation)
**Status:** Pre-deployment compliance preparation

---

## 1. How the App Processes Personal Data

### 1.1 What the app is
An AI-assisted teaching tool used exclusively by teachers. It connects to Google Workspace (Classroom, Drive, Gmail, Calendar), stores student and class data locally in SQLite, and uses OpenAI GPT-4o to power a conversational AI assistant.

### 1.2 Who the data subjects are
| Category | Examples | Risk level |
|---|---|---|
| Students (minors, age 6–15) | Names, emails, grades, submission history, teacher notes | **High** — children's data |
| Teachers | Name, email, Google account, usage patterns | Standard |
| Parents (indirect) | Email content if teacher uses Gmail feature | Standard |

### 1.3 Lawful basis
| Processing activity | Lawful basis | Article |
|---|---|---|
| Core school operations (grades, attendance, assignments) | **Public task** — Education Act No. 561/2004 | Art. 6(1)(e) |
| Teacher account and profile | **Legitimate interests** of the school | Art. 6(1)(f) |
| Optional AI features (conversation memory, strategy logging) | **Consent** from teacher (acting within school's authority) | Art. 6(1)(a) |
| Embedding student content summary into memory | **Public task** — only if strictly within educational purpose | Art. 6(1)(e) |

**Do NOT use consent as the basis for student data that the school is legally required to maintain.** Consent from minors under 15 requires parental consent under Czech law.

---

## 2. Data Map

### 2.1 Data stored locally (SQLite — `backend/data/students.db`)

| Table | Data stored | Identifiable? | Retention |
|---|---|---|---|
| `students` | name, email, class_id, teacher notes, classroom_user_id | **Yes — direct PII** | End of academic year + 1 year |
| `submission_history` | assignment grades, state (late/submitted), timestamps | **Yes — via student_id FK** | End of academic year + 1 year |
| `grader_results` | student_name (raw), AI score, reasoning, feedback | **Yes — direct PII** | End of academic year + 1 year |
| `episodic_memories` | Summaries of teacher conversations (may reference students) | **Indirect** | End of academic year + 1 year |
| `semantic_memories` | Distilled teaching insights | Low | End of academic year + 1 year |
| `chat_messages` | Full conversation history including tool results | **May contain PII** | 90 days after conversation ends |
| `teacher_tokens` | Google OAuth refresh + access tokens | Yes — credential data | Cleared on logout |
| `user_profiles` | Teacher name, school, subjects, API key | Yes — teacher PII | Duration of account |
| `scheduled_posts` | Assignment/announcement content | Low | Until deleted by teacher |
| `strategy_evaluations` | Teaching strategy text, optional class_id | Low | End of academic year + 1 year |

### 2.2 Data stored as flat files

| Location | Contents | Identifiable? |
|---|---|---|
| `backend/data/corpus/{user_id}/{class_id}/` | Uploaded PDFs/text documents (curriculum materials) | Generally no — curriculum content |

### 2.3 Data sent to external processors

| Processor | Data sent | Purpose | Transfer mechanism |
|---|---|---|---|
| **OpenAI** (via API) | Conversation text, tool results including student names/emails/grades | AI response generation (if OpenAI provider selected) | EU-US Data Privacy Framework + OpenAI DPA |
| **OpenAI** (embeddings) | Memory content (may include student references from conversation summaries) | Semantic memory search (if OpenAI provider selected) | EU-US Data Privacy Framework + OpenAI DPA |
| **Google Gemini** (via API) | Pseudonymised conversation text and tool results | AI response generation (if Gemini provider selected) | GDPR adequacy (Google LLC); data stays within Google Workspace DPA |
| **Google** (Classroom API) | Read/write assignments, rosters, submissions | Core functionality | GDPR adequacy (Google Workspace for Education) |
| **Google** (Drive API) | File listing, download for corpus | Document management | GDPR adequacy |
| **Google** (Gmail API) | Email read, archive, label, trash | Gmail feature (if enabled) | GDPR adequacy |
| **Google** (Calendar API) | Event listing | Calendar feature (if enabled) | GDPR adequacy |
| **Railway** (hosting) | Backend application + SQLite database | Hosting | Data processing agreement with Railway |
| **Vercel** (hosting) | Frontend application | Hosting | Data processing agreement with Vercel |

### 2.4 Data flows (current — PRE-REMEDIATION)

```
Teacher asks: "How is Jana Nováková doing?"
  → get_student_data tool called
  → student record fetched: {name: "Jana Nováková", email: "...", grade: 7.5, notes: "..."}
  → FULL RECORD injected into OpenAI prompt  ← GDPR RISK: raw PII to US processor
  → OpenAI response generated
  → Response displayed to teacher
```

### 2.5 Data flows (target — POST-REMEDIATION)

```
Teacher asks: "How is Jana Nováková doing?"
  → Backend resolves "Jana Nováková" → internal_id: "st_7f3a2b"
  → get_student_data tool called with internal_id
  → OpenAI prompt contains: {id: "st_7f3a2b", grade: 7.5, submission_count: 12, late_count: 2}
    (no name, no email, no raw notes sent to OpenAI)
  → OpenAI response references "st_7f3a2b"
  → Backend substitutes "st_7f3a2b" → "Jana Nováková" in final response
  → Response displayed to teacher with real name
```

---

## 3. Security Measures

### 3.1 In place
- [x] Google OAuth 2.0 — no passwords stored
- [x] Stable email-based user_id (not token-based) — prevents ID drift
- [x] Per-teacher data isolation — all queries scoped by `teacher_user_id`
- [x] HTTPS enforced via Railway (backend) and Vercel (frontend)
- [x] OpenAI API key stored per-user in DB, not logged or transmitted to frontend
- [x] Google tokens stored server-side, not exposed to frontend beyond session

### 3.2 Required — not yet implemented
- [ ] **Pseudonymization of student data before OpenAI calls** — highest priority
- [ ] **SEN/health data field isolation** — no SEN fields exist yet; must be designed to never enter prompts
- [ ] **Encryption at rest** — SQLite database is unencrypted on Railway disk
- [ ] **Audit logging** — no record of which teacher accessed which student data, when
- [ ] **Data retention enforcement** — no automated deletion of records past retention period
- [ ] **Right to erasure endpoint** — no API to delete all data for a given student or teacher
- [ ] **Data export endpoint** — no API for data portability (Art. 20 GDPR)
- [ ] **Session token expiry enforcement** — tokens expire at Google but no local session timeout
- [ ] **Rate limiting** — no protection against bulk data extraction

---

## 4. Transparency

### 4.1 Required disclosures (to teachers and schools)
The following must be provided before a school deploys the app:

- Privacy Notice (plain language) covering: who processes data, what is collected, lawful basis, retention periods, data subject rights, DPO contact, third-party processors (OpenAI, Railway, Vercel, Google)
- AI Transparency Statement: that a large language model (GPT-4o by OpenAI) processes conversation content including references to student performance
- Data Processing Agreement between the school (controller) and the app operator (processor)

### 4.2 Required disclosures (to parents/guardians)
Schools are legally required to inform parents that an AI tool is used in the processing of their child's educational data. This is the school's obligation, but the operator must provide the school with materials to fulfill it.

### 4.3 In-app transparency (to be built)
- [ ] Data usage summary accessible in Settings — what is stored, when it is deleted
- [ ] Ability for teacher to delete their own conversation history and memories
- [ ] Clear labeling when AI-generated content is shown vs. factual data

---

## 5. Safeguards

### 5.1 Children's data safeguards
| Safeguard | Status | Notes |
|---|---|---|
| No student-facing features without parental consent flow | Planned | Student avatar feature must include this before launch |
| Student data pseudonymized before LLM calls | **NOT YET DONE** | Highest priority remediation |
| SEN/health data never sent to any AI processor | **NOT YET DONE** | No SEN fields exist yet — must be designed in from scratch |
| Student data access scoped to teacher's own classes only | Done | All queries filter by `teacher_user_id` |
| No student data used to train AI models | Done | OpenAI API zero-training policy + confirmed in DPA |

### 5.2 Data minimization
| Tool / Feature | Current state | Required change |
|---|---|---|
| `get_student_data` | Returns full record including name, email, notes | Return pseudonymized record; strip email and raw notes |
| `get_class_roster` | Returns `{id, name, email}` | Return `{internal_id, display_token}` — backend re-resolves |
| Memory embeddings | May embed conversation summaries containing student names | Strip student names from content before embedding |
| `grader_results` table | Stores `student_name TEXT` directly | Migrate to `student_id FK` + resolve name at display time |
| Conversation summaries sent to OpenAI | May reference students by name | Pseudonymize before summary call |

### 5.3 EU AI Act compliance
The app is classified as **high-risk AI** (Annex III, Category 3: education and vocational training — evaluating learning outcomes and monitoring student behavior). Required:
- [ ] Fundamental Rights Impact Assessment (FRIA) — can be combined with GDPR DPIA
- [ ] Human oversight mechanism — teacher must be able to override or disregard AI outputs
- [ ] Accuracy and robustness documentation
- [ ] Registration in EU database of high-risk AI systems (when operational)
- [ ] Technical documentation per Art. 11 of AI Act

---

## 6. Sign-off Checklist

### 6.1 OpenAI
- [ ] Sign OpenAI Data Processing Addendum (DPA) — contracting entity: **OpenAI Ireland Limited**
  - URL: openai.com/policies/data-processing-addendum
- [ ] Confirm OpenAI EU-US Data Privacy Framework certification covers API use case
- [ ] Confirm API zero-training policy in writing (included in DPA)
- [ ] Enable zero data retention option in API settings if available for your tier
- [ ] Document in ROPA: OpenAI as sub-processor, purpose, data categories, transfer mechanism

### 6.2 Google
- [ ] Confirm Google Workspace for Education DPA covers your use of Classroom/Drive/Gmail APIs
- [ ] Review Google's EU data residency options if required by school policy
- [ ] Confirm OAuth scopes requested match only features actually built and enabled

### 6.3 Railway (backend hosting)
- [ ] Sign Railway Data Processing Agreement
- [ ] Confirm EU data region is selected for backend deployment (EU data residency)
- [ ] Confirm database volume is in EU region (SQLite on Railway volume)

### 6.4 Vercel (frontend hosting)
- [ ] Sign Vercel Data Processing Agreement
- [ ] Note: frontend holds no personal data (API URL only); risk is low
- [ ] Confirm no personal data is logged in Vercel edge logs

### 6.5 School (data controller)
The school is the **data controller**. The app operator is the **data processor**. A formal Data Processing Agreement (Art. 28 GDPR) must be signed with each school before deployment. The DPA must cover:
- [ ] Categories of data processed (students, teachers, submissions, grades)
- [ ] Purpose and duration of processing
- [ ] Sub-processors listed (OpenAI, Railway, Vercel, Google)
- [ ] Teacher obligations (not to input special category data, not to use for non-educational purposes)
- [ ] Breach notification procedure (72-hour window to ÚOOÚ)
- [ ] Data subject rights procedure (school handles requests; operator assists within 30 days)
- [ ] Deletion/return of data on contract termination
- [ ] School's DPO contact details

### 6.6 School DPO (Data Protection Officer)
Czech schools are legally required to have a DPO (Czech Act 110/2019, §14). The DPO must:
- [ ] Review and approve this compliance document before deployment
- [ ] Review and approve the DPIA/FRIA before deployment
- [ ] Be listed as contact in the school's data subject rights process
- [ ] Be notified of any changes to the processing (new features, new sub-processors)

### 6.7 ÚOOÚ (Czech Data Protection Authority)
No prior approval is required from ÚOOÚ for standard deployments. However:
- [ ] DPIA must be completed and available for inspection on request
- [ ] ROPA must be maintained and available for inspection on request
- [ ] If a breach occurs: notify ÚOOÚ within **72 hours** via the online notification system
- [ ] ÚOOÚ may require consultation on the DPIA if high residual risk remains after mitigations

### 6.8 Ministry of Education (MŠMT) / NPI
- [ ] Review MŠMT/NPI guidelines on GenAI use in schools (published 2023/2024)
- [ ] Confirm the tool's use case is consistent with those guidelines
- [ ] No formal sign-off required from MŠMT for a commercial tool used by individual schools

---

## 7. Remediation Priority Order

The following must be completed before any formal school deployment:

| Priority | Task | Reason |
|---|---|---|
| **P0** | Pseudonymize student data before all OpenAI calls | Ongoing unlawful cross-border transfer of children's PII |
| **P0** | Design SEN/health data handling to exclude from AI processing | Art. 9 special category — no lawful basis for sending to OpenAI |
| **P0** | Sign OpenAI DPA | No lawful basis for transfer without DPA |
| ~~**P1**~~ | ~~Implement data retention enforcement (auto-delete)~~ | Done — nightly background task, periods configurable in `retention.py` |
| ~~**P1**~~ | ~~Add audit logging for student data access~~ | Done — `audit_log` table, `GET /audit/log`, `GET /audit/log/student/{id}` |
| ~~**P1**~~ | ~~Add right-to-erasure endpoint~~ | Done — `DELETE /erase/students/{id}` and `DELETE /erase/account` |
| **P1** | Complete combined DPIA + FRIA document | Mandatory pre-deployment for high-risk AI |
| **P2** | Encrypt SQLite at rest on Railway | Security measure; risk is low but expected for children's data |
| ~~**P2**~~ | ~~Add data export endpoint~~ | Done — `GET /export/my-data`, "Download my data" button in Settings |
| ~~**P2**~~ | ~~Add in-app privacy notice and data usage summary~~ | Done — collapsible "Privacy & data use" section in Settings |
| ~~**P3**~~ | ~~Draft school-facing Privacy Notice and DPA template~~ | Done — `legal/school-dpa-en.md` + `legal/school-dpa-cs.md` |
| ~~**P3**~~ | ~~Draft parent-facing information sheet~~ | Done — `legal/parent-notice-en.md` + `legal/parent-notice-cs.md` |

---

## 8. ROPA Entry (Records of Processing Activities)

To be maintained by the operator and provided to each school for inclusion in their own ROPA.

| Field | Value |
|---|---|
| Processing activity name | AI-assisted teaching tool — student performance support |
| Controller | School (each contracting school) |
| Processor | App operator (to be named) |
| DPO contact | School's DPO (per school) |
| Categories of data subjects | Students (minors), teachers |
| Categories of personal data | Name, email, grades, assignment submissions, teacher notes |
| Special categories | SEN/health data if teacher enters it (to be designed out of AI pathway) |
| Purpose | Supporting teachers in class management and educational planning |
| Lawful basis | Public task (Art. 6(1)(e)) — Education Act No. 561/2004 |
| Retention period | Academic year + 1 year for AI-generated data; official school records follow archiving law |
| Recipients / sub-processors | OpenAI Ireland Ltd (AI processing), Railway (hosting), Vercel (hosting), Google (Workspace APIs) |
| Third-country transfers | USA — OpenAI, Railway (EU region configured), Vercel (EU region configured) |
| Transfer mechanism | EU-US Data Privacy Framework (OpenAI); DPA with EU data residency (Railway, Vercel) |
| Security measures | OAuth 2.0, HTTPS, per-user data isolation, pseudonymization (post-remediation) |
| DPIA required? | Yes — mandatory (children's data + high-risk AI) |

---

*This document should be reviewed and updated whenever new features are added, new sub-processors are engaged, or applicable law changes. Next scheduled review: start of each academic year.*
