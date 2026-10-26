# FR proof run — 23 Oct 2026

## Honest capability status

| FR | Works? | Mode in this run |
|----|--------|------------------|
| FR-04 URL | **Yes** | `trafilatura` live (Wikipedia Hash table → 9 chunks, 5860 words) |
| FR-04 PDF | **Yes** | `fyp-report.pdf` from parent folder → 32 chunks, 20824 words |
| FR-04 PPTX | **Yes** (after installing `python-pptx`) | `DevOps_CloudComputing Lecture1.pptx` → 3 chunks, 1915 words |
| FR-05 NLP | **Partial** | spaCy **not installed** (disk quota earlier) → **regex fallback** still ran |
| FR-06 Semantic chunk | **Partial** | MiniLM **not installed** → paragraph / overlap packing (chunks exist) |
| FR-11 Quality filter | **Yes** | Second LLM pass ran (mock provider); 6 questions generated |
| FR-18 Similarity | **Yes (fallback)** | `similarity` field set (100 on keyword-rich answers); MiniLM absent → overlap floor |
| FR-20 AI detector | **Yes (heuristic)** | `ai_probability` set (11–24); GPTZero not keyed |

## Real files used

- PDF: `/mnt/data/Hammad Fyp/AutoExam FYP Report 1 (FINAL).pdf` → `docs/fr-proof/assets/fyp-report.pdf`
- PPTX: `/mnt/data/linux-home/Downloads/DevOps_CloudComputing Lecture1.pptx` → `docs/fr-proof/assets/devops-lecture1.pptx`
- URL: `https://en.wikipedia.org/wiki/Hash_table`

## Screenshots

See `docs/fr-proof/screenshots/`:

- `11-materials.png` — table with PDF / PPTX / Web page rows
- `12-materials-url-tab.png` — Web link upload UI
- `13-materials-files-tab.png` — Files upload UI
- `16-exam-editor.png` — generated exam
- `17-attempt-review-grading.png` — FR-18/20 grading fields
- `18-exam-results.png` — results

Machine-readable log: `docs/fr-proof/report.json`
