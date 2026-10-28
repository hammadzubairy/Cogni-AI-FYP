# Data model

This is the contract for every collection and field used across all phases.
Field names are fixed; do not rename without updating this file first.

## users
`id, name, email (unique, lowercase), password_hash, role, dept_id|null, status (active|inactive|pending_verification), must_change_password, token_version, created_at, created_by|null, last_login_at|null`

Email verification tokens: `email_verifications` — `token_hash` (unique), `user_id`, `expires_at` (TTL), `used`.

## departments
`id, code, name, hod_id|null, policy {min_clo:int, higher_order_pct:int, max_repeats:int}`

## classes
`id, code, name, teacher_id, dept_id, student_ids[], join_code (unique), clos[], section`

## materials
`id, class_id, owner_id|null, name, kind (pdf|text), text, chunks[{idx,page|null,heading|null,text}], created_at`

## exams
`id, title, class_id, teacher_id, kind (Quiz|Midterm|Final), duration_min, status (draft|pending|returned|approved|published|closed), questions[], ai_threshold, released, hod_comment, request_id|null, material_ids[], history[{at,by,text}], created_at`

### question (embedded in `exams.questions[]`)
`qid (uuid), type (string label, e.g. MCQ|Short Questions|Long Questions|custom), format (mcq|written; derived for legacy docs), bloom (Remember|Understand|Apply|Analyze|Evaluate|Create), topic, clo, text, options[]|null, answer_index|null, model_answer, keywords[{label,variants[]}], marks, source_chunk_idx|null`

## attempts
`id, exam_id, student_id, status (in_progress|submitted), started_at, submitted_at|null, answers{qid: int|str}, results{qid:{score,max,similarity,key_points_hit[],key_points_missed[],reason,ai_probability}}, flags{qid: cleared|discuss}, overrides{qid:number}`

## requests
`id, hod_id, teacher_id, class_id, kind, due, note, status (open|submitted|approved), exam_id|null`

## notifications
`id, to_user_id, text, link{page,id}, read, created_at`

## activity_log
`id, at, actor_id, actor_name, role, text`

## settings (single doc)
`approval (all|major|none; "major" means every kind except Quiz), max_upload_mb, ai_threshold_default`
