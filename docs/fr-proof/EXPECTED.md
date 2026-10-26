# FR proof — expected results

Test account: teacher `ayesha.khan@umt.edu.pk` / `Test-Passw0rd!`  
Student (grading): `hamza.ali@umt.edu.pk` / `Test-Passw0rd!`  
Class: `CS-201-A · Data Structures`  
Assets: `docs/fr-proof/assets/fyp-report.pdf`, `docs/fr-proof/assets/devops-lecture1.pptx`  
URL: `https://en.wikipedia.org/wiki/Hash_table`

**Rule for every UI shot:** page must NOT show `Loading…` / `Loading dashboard…` / `Loading materials…` / `Loading exam…` / `Loading submission…` / `Loading results…` / `Loading class…`. Visible content listed below must be present.

---

## E0 — App health

| ID | Expected |
|----|----------|
| E0.1 | `GET /api/health` → `{"status":"ok"}` |
| E0.2 | Frontend `GET /` → HTTP 200 |

---

## E1 — Teacher login + dashboard (UI)

| ID | Expected |
|----|----------|
| E1.1 | After login, URL matches `/app/teacher` |
| E1.2 | Sidebar shows `TEACHER PORTAL` and user name contains `Ayesha` |
| E1.3 | Dashboard finished loading: greeting visible (e.g. `GOOD` / teacher name) **or** class cards / “Needs you” / empty-state text — **not** blank white content area with only chrome |
| E1.4 | Screenshot `ui-01-dashboard.png` captures that loaded state |

---

## E2 — Materials list (FR-04 PDF / PPTX / URL)

| ID | Expected |
|----|----------|
| E2.1 | `/app/teacher/materials` shows heading `Course material` |
| E2.2 | Upload panel has tabs: `Files`, `Paste notes`, `Web link` |
| E2.3 | Table `All my material` lists at least these rows (by name): `fyp-report.pdf` (PDF), `devops-lecture1.pptx` (PPTX), `Wikipedia Hash table` (Web page) |
| E2.4 | PDF row: `chunk_count >= 1`, `word_count >= 1000` |
| E2.5 | PPTX row: `kind=pptx`, `chunk_count >= 1`, `word_count >= 100` |
| E2.6 | URL row: `kind=url`, `chunk_count >= 1`, `word_count >= 300` |
| E2.7 | Screenshots: `ui-02-materials-list.png`, `ui-03-url-tab.png`, `ui-04-files-tab.png` — no loading spinner |

---

## E3 — URL tab UI (FR-04)

| ID | Expected |
|----|----------|
| E3.1 | Clicking `Web link` shows fields `Name (optional)` and `Page URL` |
| E3.2 | `Process material` button visible |

---

## E4 — Exam generation (FR-11)

| ID | Expected |
|----|----------|
| E4.1 | `POST /api/exams/generate` with the three materials returns 2xx and `questions.length == 6` (3 MCQ + 2 Short + 1 Essay) |
| E4.2 | Exam can be published → status live/published |
| E4.3 | UI `/app/teacher/exams/{id}` shows exam title and at least one question stem — **not** `Loading exam…` |
| E4.4 | Screenshot `ui-05-exam-paper.png` |

---

## E5 — Student attempt + teacher review (FR-18, FR-20)

| ID | Expected |
|----|----------|
| E5.1 | Student can start attempt and submit answers |
| E5.2 | Teacher attempt detail: every written question has numeric `similarity` and numeric `ai_probability` |
| E5.3 | UI `/app/teacher/attempts/{id}` shows `Semantic similarity` **or** similarity % and `AI-writing` / likelihood — **not** `Loading submission…` |
| E5.4 | Screenshot `ui-06-attempt-review.png` |
| E5.5 | Results page for the exam loads student row — **not** `Loading results…`; screenshot `ui-07-results.png` |

---

## E6 — Class detail

| ID | Expected |
|----|----------|
| E6.1 | `/app/teacher/classes/{id}` shows class code `CS-201-A` and is not stuck on `Loading class…` |
| E6.2 | Screenshot `ui-08-class-detail.png` |

---

## Pass criteria

- **PASS** only if every E*.* check is met and every listed screenshot exists and does not contain the forbidden loading phrases in page text.
- **FAIL** if any page is blank (only shell chrome) or still shows a loading label after 45s.
- **PARTIAL** allowed only for E2 NLP/embedding *quality* notes (spaCy/MiniLM may be absent); UI and upload/chunk counts must still PASS.
