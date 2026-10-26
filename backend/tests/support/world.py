"""TEST/DEV fixture world — v7 demo data for pytest and local development.

NOT part of the application package (lives under ``tests/support/``).
Populates departments, users, classes, materials, exams, attempts,
requests, notifications, and activity log.

Usage: python -m tests.support.world [--db NAME] [--force]

Idempotent: always drops and recreates every collection before inserting, so
running it twice in a row produces the same counts. Refuses to run unless
MONGO_DB ends with "_dev" or "_demo", unless --force is passed.
"""

import argparse
import asyncio
import os
import re
import sys
import uuid
from datetime import UTC, datetime, timedelta

from bson import ObjectId
from pymongo import AsyncMongoClient

from app.core.config import settings
from app.core.security import hash_password

TEST_PASSWORD = "Test-Passw0rd!"

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_date(s: str, year: int = 2026) -> datetime:
    """Parse the date formats used in the v7 seed data: '2026-09-10',
    '11 Sep', or '27 Sep 10:12'."""
    s = s.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        y, m, d = (int(p) for p in s.split("-"))
        return datetime(y, m, d, 9, 0, tzinfo=UTC)
    parts = s.split()
    day, month = int(parts[0]), MONTHS[parts[1]]
    hour, minute = 9, 0
    if len(parts) > 2 and ":" in parts[2]:
        hour, minute = (int(p) for p in parts[2].split(":"))
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def K(label: str, *variants: str) -> dict:
    return {"label": label, "variants": list(variants)}


# =====================================================================
# POOLS — ported verbatim from reference/Cogni.ai-v7.html's POOLS
# =====================================================================
POOLS = {
    "dsa": {
        "name": "Data Structures",
        "clos": ["CLO-1", "CLO-2", "CLO-3", "CLO-4"],
        "qs": [
            {"t": "MCQ", "b": "Remember", "tp": "Hashing", "clo": "CLO-1",
             "q": "Which data structure gives O(1) average-case lookup by key?",
             "o": ["Linked list", "Hash table", "Binary search tree", "Stack"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Trees", "clo": "CLO-2",
             "q": "Why does an AVL tree guarantee O(log n) search time?",
             "o": ["It stores keys in a sorted array", "It keeps the heights of sibling subtrees within 1",
                   "It hashes keys internally", "It limits the number of nodes"], "a": 1},
            {"t": "MCQ", "b": "Apply", "tp": "Heaps", "clo": "CLO-2",
             "q": "After inserting 10, 4, 15, 2 into an empty min-heap, which value is at the root?",
             "o": ["10", "4", "2", "15"], "a": 2},
            {"t": "MCQ", "b": "Remember", "tp": "Graphs", "clo": "CLO-3",
             "q": "Which traversal uses a queue to visit nodes level by level?",
             "o": ["Depth-first search", "Breadth-first search", "In-order traversal", "Post-order traversal"], "a": 1},
            {"t": "MCQ", "b": "Apply", "tp": "Queues", "clo": "CLO-4",
             "q": "A circular queue of size 5 has front = 3 and rear = 1 (inclusive). How many elements does it hold?",
             "o": ["2", "3", "4", "5"], "a": 2},
            {"t": "MCQ", "b": "Understand", "tp": "Hashing", "clo": "CLO-1",
             "q": "What is it called when two keys hash to the same index?",
             "o": ["A collision", "An overflow", "A rehash failure", "A deadlock"], "a": 0},
            {"t": "MCQ", "b": "Analyze", "tp": "Graphs", "clo": "CLO-3",
             "q": "A graph has 10,000 nodes and 20,000 edges. Which representation uses less memory?",
             "o": ["Adjacency matrix", "Adjacency list", "Both use the same", "Incidence matrix"], "a": 1},
            {"t": "Short", "b": "Understand", "tp": "Hashing", "clo": "CLO-1",
             "q": "Explain what a collision is in a hash table and name one way to resolve it.",
             "m": "Two keys map to the same index. Resolve it with chaining (a linked list per slot) or open addressing (linear or quadratic probing).",
             "k": [K("Two keys map to the same index", "same index", "same slot", "same bucket", "same position", "same place"),
                   K("Chaining", "chain", "linked list"),
                   K("Open addressing or probing", "probing", "open addressing")]},
            {"t": "Short", "b": "Analyze", "tp": "Graphs", "clo": "CLO-3",
             "q": "Compare an adjacency list and an adjacency matrix for a sparse social network graph. Which would you pick and why?",
             "m": "Adjacency list. It needs O(V+E) memory instead of O(V²); in a sparse graph most matrix cells would be empty, and a list iterates a node's neighbours directly.",
             "k": [K("Chooses adjacency list", "list"),
                   K("Memory or space argument", "memory", "space"),
                   K("Sparse graph leaves the matrix mostly empty", "sparse", "empty", "few edges", "zeros", "waste"),
                   K("O(V+E) vs O(V²)", "v+e", "v^2", "v²", "v2", "quadratic", "n^2")]},
            {"t": "Short", "b": "Apply", "tp": "Trees", "clo": "CLO-2",
             "q": "Insert 30, 20, 10 into an empty AVL tree. Which rotation is needed, and what is the final root?",
             "m": "A left-left imbalance at 30 needs a single right rotation. The final root is 20, with children 10 and 30.",
             "k": [K("Single right rotation", "right rotation", "rotate right", "ll rotation", "left-left", "left left", "ll case"),
                   K("Final root is 20", "root is 20", "20 is the root", "20 becomes", "root 20", "20 as root"),
                   K("Children 10 and 30", "10 and 30", "10, 30")]},
            {"t": "Essay", "b": "Evaluate", "tp": "Queues", "clo": "CLO-4",
             "q": "A hospital emergency ward must decide the order in which patients are seen. Evaluate whether a FIFO queue or a priority queue is the better design, and justify your answer with trade-offs.",
             "m": "A priority queue ordered by severity. FIFO is simple and fair but unsafe for critical cases. Low-priority patients can starve, so add aging. A heap gives O(log n) insert and remove.",
             "k": [K("Recommends a priority queue", "priority"),
                   K("Orders patients by severity", "severe", "severity", "critical", "serious", "urgent"),
                   K("FIFO fairness trade-off", "fifo", "first come", "first in", "fair"),
                   K("Starvation and aging", "starv", "aging", "ageing", "wait too long", "waiting too long", "wait forever"),
                   K("Heap implementation, O(log n)", "heap", "log n", "logn")]},
            {"t": "Essay", "b": "Evaluate", "tp": "Hashing", "clo": "CLO-1",
             "q": "For a university student-records system, evaluate when you would choose a hash table over a balanced BST.",
             "m": "Hash table for fast exact lookup by roll number, O(1) average. Balanced BST when ordered output or range queries are needed, with guaranteed O(log n). Hashing has a poor worst case when collisions pile up.",
             "k": [K("Hash table O(1) average lookup", "o(1)", "constant", "fast"),
                   K("BST keeps order, range queries", "order", "sorted", "range"),
                   K("BST guaranteed O(log n)", "log n", "logn", "balanced"),
                   K("Hash worst case, collisions", "worst", "collision")]},
        ],
        "chunks": [
            {"p": "Lecture 5 · p. 3", "tp": "Hashing",
             "x": "A hash table maps keys to array slots using a hash function, giving O(1) average lookup. When two keys map to the same slot a collision occurs. Chaining stores a linked list in each slot; open addressing probes for the next free slot using linear or quadratic probing."},
            {"p": "Lecture 5 · p. 9", "tp": "Trees",
             "x": "An AVL tree is a self-balancing binary search tree. The heights of the two child subtrees of any node differ by at most one, so search, insert and delete take O(log n). Inserting 30, 20, 10 creates a left-left imbalance that a single right rotation fixes, making 20 the root."},
            {"p": "Lecture 6 · p. 4", "tp": "Heaps",
             "x": "A binary min-heap keeps the smallest key at the root. Insertion adds the key at the bottom and sifts it up; removal takes the root and sifts the last element down. Both run in O(log n). Heaps are the usual way to build a priority queue."},
            {"p": "Lecture 7 · p. 5", "tp": "Graphs",
             "x": "An adjacency matrix uses V × V cells, which is O(V²) memory even when few edges exist. An adjacency list stores only the edges that exist, O(V+E) memory, and iterates a node's neighbours directly. For sparse graphs such as social networks the list is usually the better choice."},
            {"p": "Lecture 7 · p. 10", "tp": "Graphs",
             "x": "Breadth-first search (BFS) visits nodes level by level using a queue and finds shortest paths in unweighted graphs. Depth-first search (DFS) goes as deep as possible using a stack or recursion and suits cycle detection and topological sorting."},
            {"p": "Lecture 6 · p. 11", "tp": "Queues",
             "x": "A FIFO queue serves items in arrival order. A priority queue serves the highest-priority item first and is usually built on a heap. Low-priority items can starve; aging gradually raises their priority to prevent this."},
        ],
    },
    "sql": {
        "name": "Database Systems",
        "clos": ["CLO-1", "CLO-2", "CLO-3"],
        "qs": [
            {"t": "MCQ", "b": "Remember", "tp": "Joins", "clo": "CLO-1",
             "q": "Which join returns only rows with matching values in both tables?",
             "o": ["LEFT JOIN", "INNER JOIN", "FULL OUTER JOIN", "CROSS JOIN"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Joins", "clo": "CLO-1",
             "q": "A LEFT JOIN from Students to Enrollments returns…",
             "o": ["Only enrolled students", "All students, with NULLs where no enrollment exists",
                   "All enrollments only", "Every student–course combination"], "a": 1},
            {"t": "MCQ", "b": "Remember", "tp": "Aggregation", "clo": "CLO-2",
             "q": "Which clause filters groups after aggregation?",
             "o": ["WHERE", "ORDER BY", "HAVING", "GROUP BY"], "a": 2},
            {"t": "MCQ", "b": "Apply", "tp": "Aggregation", "clo": "CLO-2",
             "q": "Table T has 5 rows; 2 of them are NULL in every column. What does SELECT COUNT(*) FROM T return?",
             "o": ["3", "5", "2", "NULL"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Subqueries", "clo": "CLO-3",
             "q": "Which operator checks whether a subquery returns any rows?",
             "o": ["IN", "EXISTS", "ANY", "LIKE"], "a": 1},
            {"t": "Short", "b": "Understand", "tp": "Aggregation", "clo": "CLO-2",
             "q": "Explain the difference between WHERE and HAVING with a short example.",
             "m": "WHERE filters individual rows before grouping; HAVING filters groups after aggregation, e.g. GROUP BY course HAVING COUNT(*) > 30.",
             "k": [K("WHERE filters rows before grouping", "before", "rows", "individual"),
                   K("HAVING filters groups after aggregation", "after", "aggregat", "groups"),
                   K("Gives an example", "select", "count", "sum", "avg", "group by")]},
            {"t": "Short", "b": "Apply", "tp": "Joins", "clo": "CLO-1",
             "q": "Write a query that lists every course with its number of enrolled students, including courses with zero students.",
             "m": "SELECT c.name, COUNT(e.id) FROM Courses c LEFT JOIN Enrollments e ON e.course_id = c.id GROUP BY c.name;",
             "k": [K("Uses LEFT JOIN", "left join", "left outer"),
                   K("Counts enrolments", "count"),
                   K("Groups by course", "group by")]},
            {"t": "Essay", "b": "Evaluate", "tp": "Subqueries", "clo": "CLO-3",
             "q": "A university needs a report of courses with no enrolled students. Compare LEFT JOIN … IS NULL with NOT EXISTS and justify which you would use.",
             "m": "Both work. NOT EXISTS states the intent directly and avoids the NULL pitfalls of NOT IN; LEFT JOIN … IS NULL is also common. Discuss readability, and that indexes on the join key matter more than the syntax.",
             "k": [K("LEFT JOIN with IS NULL", "is null", "left join"),
                   K("NOT EXISTS", "not exists", "exists"),
                   K("Performance or readability", "perform", "fast", "index", "readab", "clear"),
                   K("NULL pitfalls of NOT IN", "not in", "null")]},
        ],
        "chunks": [
            {"p": "Slide 6", "tp": "Joins",
             "x": "An INNER JOIN returns only rows with matching keys in both tables. A LEFT JOIN returns every row from the left table and fills the right table's columns with NULL where there is no match."},
            {"p": "Slide 9", "tp": "Joins",
             "x": "To list every course with its enrolment count including zero, use Courses LEFT JOIN Enrollments, then GROUP BY course and COUNT the enrolment id rather than COUNT(*)."},
            {"p": "Slide 14", "tp": "Aggregation",
             "x": "WHERE filters individual rows before grouping. GROUP BY forms groups, and aggregate functions such as COUNT, SUM and AVG summarise them. HAVING filters groups after aggregation, for example HAVING COUNT(*) > 30."},
            {"p": "Slide 19", "tp": "Subqueries",
             "x": "EXISTS checks whether a subquery returns any row. NOT EXISTS is often clearer than LEFT JOIN … IS NULL for finding unmatched rows, and avoids the NULL pitfalls of NOT IN."},
        ],
    },
    "os": {
        "name": "Operating Systems",
        "clos": ["CLO-1", "CLO-2", "CLO-3"],
        "qs": [
            {"t": "MCQ", "b": "Remember", "tp": "Scheduling", "clo": "CLO-1",
             "q": "Which scheduling algorithm can starve long jobs?",
             "o": ["First-Come First-Served", "Shortest Job First", "Round Robin", "FIFO"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Scheduling", "clo": "CLO-1",
             "q": "What does a very small time quantum do in Round Robin?",
             "o": ["Makes it behave like FCFS", "Increases context-switch overhead", "Removes all waiting time", "Causes deadlock"], "a": 1},
            {"t": "MCQ", "b": "Remember", "tp": "Processes", "clo": "CLO-2",
             "q": "Which state does a process enter while waiting for I/O?",
             "o": ["Running", "Ready", "Blocked", "Terminated"], "a": 2},
            {"t": "MCQ", "b": "Understand", "tp": "Deadlocks", "clo": "CLO-3",
             "q": "Which of these is NOT a necessary condition for deadlock?",
             "o": ["Mutual exclusion", "Hold and wait", "Preemption", "Circular wait"], "a": 2},
            {"t": "MCQ", "b": "Apply", "tp": "Scheduling", "clo": "CLO-1",
             "q": "Jobs of length 6, 2 and 8 arrive at t = 0. What is the average waiting time under SJF?",
             "o": ["3.33", "5.33", "4.67", "6.00"], "a": 0},
            {"t": "Short", "b": "Understand", "tp": "Processes", "clo": "CLO-2",
             "q": "Explain the difference between a process and a thread.",
             "m": "A process has its own address space and resources. Threads inside a process share memory and resources, so they are lighter to create and switch between.",
             "k": [K("Process has its own address space", "address space", "memory", "own"),
                   K("Threads share resources", "share", "shared"),
                   K("Threads are lighter or faster to switch", "light", "faster", "cheaper", "overhead")]},
            {"t": "Short", "b": "Analyze", "tp": "Deadlocks", "clo": "CLO-3",
             "q": "How does ordering resource requests prevent deadlock?",
             "m": "Give every resource a global number and require requests in increasing order. A cycle of waiting processes becomes impossible, which breaks the circular-wait condition.",
             "k": [K("Breaks circular wait", "circular"),
                   K("Global order or numbering", "order", "number", "sequence"),
                   K("Request in increasing order", "increasing", "ascending", "same order")]},
            {"t": "Essay", "b": "Evaluate", "tp": "Scheduling", "clo": "CLO-1",
             "q": "A university server runs short interactive jobs and long batch jobs. Evaluate Round Robin against a multilevel feedback queue for this mix.",
             "m": "A multilevel feedback queue keeps interactive jobs responsive and pushes CPU-heavy jobs down. Round Robin is fair but the quantum is a trade-off. Aging prevents batch jobs from starving.",
             "k": [K("MLFQ favours short, interactive jobs", "multilevel", "mlfq", "feedback"),
                   K("Response time for interactive users", "response", "interactive"),
                   K("Time-quantum trade-off", "quantum", "time slice"),
                   K("Starvation and aging", "starv", "aging", "ageing")]},
        ],
        "chunks": [
            {"p": "Ch. 5 · p. 3", "tp": "Scheduling",
             "x": "First-Come First-Served runs jobs in arrival order. Shortest Job First minimises average waiting time but can starve long jobs. Round Robin gives each job a time quantum; a very small quantum increases context-switch overhead."},
            {"p": "Ch. 5 · p. 12", "tp": "Scheduling",
             "x": "A multilevel feedback queue moves CPU-heavy jobs to lower-priority queues and keeps interactive jobs responsive. Aging moves long-waiting jobs up to prevent starvation."},
            {"p": "Ch. 3 · p. 6", "tp": "Processes",
             "x": "A process has its own address space. Threads within a process share memory and resources, so creating and switching threads is cheaper. A process waiting for I/O is in the blocked state."},
            {"p": "Ch. 7 · p. 4", "tp": "Deadlocks",
             "x": "Deadlock needs mutual exclusion, hold and wait, no preemption and circular wait. Requesting resources in a fixed global order breaks circular wait and prevents deadlock."},
        ],
    },
    "re": {
        "name": "Software Requirements",
        "clos": ["CLO-1", "CLO-2", "CLO-3"],
        "qs": [
            {"t": "MCQ", "b": "Remember", "tp": "Elicitation", "clo": "CLO-1",
             "q": "Which technique observes users doing their real work?",
             "o": ["Interviews", "Ethnography", "Surveys", "Prototyping"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Specification", "clo": "CLO-2",
             "q": "Which of these is a non-functional requirement?",
             "o": ["Students can submit exams", "The exam page loads within 3 seconds", "Teachers can upload PDFs", "HODs can approve papers"], "a": 1},
            {"t": "MCQ", "b": "Understand", "tp": "Validation", "clo": "CLO-3",
             "q": "What is the main goal of requirements validation?",
             "o": ["Writing code faster", "Checking requirements reflect what stakeholders need", "Designing the database", "Estimating cost"], "a": 1},
            {"t": "MCQ", "b": "Apply", "tp": "Specification", "clo": "CLO-2",
             "q": "Which requirement is testable?",
             "o": ["The system should be fast", "The UI must be user-friendly", "Search returns results within 2 seconds for 95% of queries", "The system should be secure"], "a": 2},
            {"t": "MCQ", "b": "Remember", "tp": "Elicitation", "clo": "CLO-1",
             "q": "A JAD session is mainly…",
             "o": ["A code review", "A facilitated workshop with stakeholders", "A unit-testing technique", "A deployment step"], "a": 1},
            {"t": "Short", "b": "Understand", "tp": "Specification", "clo": "CLO-2",
             "q": "Explain the difference between functional and non-functional requirements, with one example of each.",
             "m": "Functional requirements say what the system does, e.g. teachers can upload PDFs. Non-functional requirements set qualities or constraints, e.g. pages load within 3 seconds.",
             "k": [K("Functional: what the system does", "what the system", "behaviour", "behavior", "function", "feature"),
                   K("Non-functional: quality or constraint", "quality", "performance", "constraint", "how well", "security", "usability"),
                   K("Gives examples", "example", "e.g", "load", "login", "upload")]},
            {"t": "Short", "b": "Analyze", "tp": "Validation", "clo": "CLO-3",
             "q": "Why is a traceability matrix useful during validation?",
             "m": "It links each requirement to design and tests, shows coverage gaps, and makes the impact of a change visible.",
             "k": [K("Links requirements to design and tests", "link", "trace", "map"),
                   K("Shows coverage gaps", "cover", "missing", "missed", "gap"),
                   K("Shows impact of change", "change", "impact")]},
            {"t": "Essay", "b": "Evaluate", "tp": "Elicitation", "clo": "CLO-1",
             "q": "For an exam platform used by teachers, students and HODs, evaluate interviews against prototyping as elicitation techniques.",
             "m": "Interviews give depth on each stakeholder's needs; prototyping gets concrete feedback early and exposes misunderstandings. Stakeholder groups differ, so combine both, weighing cost and time.",
             "k": [K("Interviews give depth", "interview"),
                   K("Prototyping gives early concrete feedback", "prototyp"),
                   K("Different stakeholder groups", "teacher", "student", "hod", "stakeholder"),
                   K("Cost and time trade-off", "cost", "time", "effort")]},
        ],
        "chunks": [
            {"p": "Notes · p. 2", "tp": "Elicitation",
             "x": "Interviews give depth on individual stakeholder needs. Ethnography observes users doing their real work. JAD sessions are facilitated workshops. Prototyping shows users something concrete early and surfaces misunderstandings."},
            {"p": "Notes · p. 5", "tp": "Specification",
             "x": "Functional requirements state what the system does, such as letting teachers upload PDFs. Non-functional requirements state qualities and constraints, such as a page loading within 3 seconds. Good requirements are testable."},
            {"p": "Notes · p. 8", "tp": "Validation",
             "x": "Validation checks that requirements reflect what stakeholders actually need. A traceability matrix links each requirement to design and tests, showing coverage gaps and the impact of changes."},
        ],
    },
}


def build_question(pool_key: str, idx: int) -> dict:
    s = POOLS[pool_key]["qs"][idx]
    chunk_idx = next(
        (i for i, c in enumerate(POOLS[pool_key]["chunks"]) if c["tp"] == s["tp"]), None
    )
    return {
        "qid": str(uuid.uuid4()),
        "type": s["t"],
        "bloom": s["b"],
        "topic": s["tp"],
        "clo": s["clo"],
        "text": s["q"],
        "options": list(s["o"]) if s.get("o") else None,
        "answer_index": s.get("a"),
        "model_answer": s.get("m", ""),
        "keywords": s.get("k", []),
        "marks": 2 if s["t"] == "MCQ" else 5 if s["t"] == "Short" else 10,
        "source_chunk_idx": chunk_idx,
    }


# =====================================================================
# grading — ported from v7's aiProb / gradeWritten / grade
# =====================================================================
AI_MARKERS = [
    "furthermore", "moreover", "it is essential", "robust", "in conclusion",
    "multifaceted", "additionally", "utiliz", "comprehensive", "crucial",
    "paramount", "in summary", "ensures", "facilitates", "it is important to", "overall,",
]


def ai_prob(text: str) -> int:
    txt = (text or "").strip()
    words = [w for w in re.split(r"\s+", txt) if w]
    if len(words) < 8:
        return 4
    low = txt.lower()
    m = sum(1 for k in AI_MARKERS if k in low)
    sents = [s for s in re.split(r"[.!?]+", txt) if s.strip()]
    sents_n = len(sents) or 1
    avg = len(words) / sents_n
    val = 10 + m * 14 + max(0, avg - 14) * 2.2 + (len(txt) % 7)
    return max(3, min(97, round(val)))


def grade_written(q: dict, ans: str | None) -> dict:
    max_marks = q["marks"]
    t = (ans or "").lower()
    words = [w for w in re.split(r"\s+", t) if w]
    if not words:
        return {
            "score": 0, "max": max_marks, "similarity": 0,
            "key_points_hit": [], "key_points_missed": [k["label"] for k in q["keywords"]],
            "reason": "No answer given", "ai_probability": 0,
        }
    hit, miss = [], []
    for k in q["keywords"]:
        (hit if any(v in t for v in k["variants"]) else miss).append(k["label"])
    cov = len(hit) / len(q["keywords"]) if q["keywords"] else 0
    len_f = min(1, len(words) / (70 if q["type"] == "Essay" else 25))
    sim = round((cov * 0.8 + len_f * 0.2) * 100)
    kws = round(cov * 100)
    rub = round(len_f * 10) if cov == 0 else min(100, round(cov * 92 + len_f * 10))
    score = round(max_marks * (0.4 * sim + 0.2 * kws + 0.4 * rub) / 100 * 2) / 2
    reason = "Missing: " + "; ".join(miss) if miss else "Covers every key point"
    return {
        "score": score, "max": max_marks, "similarity": sim,
        "key_points_hit": hit, "key_points_missed": miss,
        "reason": reason, "ai_probability": ai_prob(ans),
    }


def grade_attempt(questions: list[dict], answers: dict) -> dict:
    results = {}
    for q in questions:
        qid = q["qid"]
        a = answers.get(qid)
        if q["type"] == "MCQ":
            ok = a == q["answer_index"]
            if a is None:
                reason = "Not answered"
            elif ok:
                reason = "Correct"
            else:
                reason = f"Chose {'ABCD'[a]}, correct is {'ABCD'[q['answer_index']]}"
            results[qid] = {
                "score": q["marks"] if ok else 0, "max": q["marks"], "similarity": None,
                "key_points_hit": [], "key_points_missed": [],
                "reason": reason, "ai_probability": None,
            }
        else:
            results[qid] = grade_written(q, a)
    return results


def build_attempt(exam: dict, questions: list[dict], mcq_answers: list, written_answers: list, when: str) -> dict:
    answers = {}
    mi = wi = 0
    for q in questions:
        if q["type"] == "MCQ":
            if mi < len(mcq_answers) and mcq_answers[mi] is not None:
                answers[q["qid"]] = mcq_answers[mi]
            mi += 1
        else:
            answers[q["qid"]] = written_answers[wi] if wi < len(written_answers) else ""
            wi += 1
    submitted_at = parse_date(when)
    return {
        "status": "submitted",
        "started_at": submitted_at - timedelta(minutes=exam["duration_min"]),
        "submitted_at": submitted_at,
        "answers": answers,
        "results": grade_attempt(questions, answers),
        "flags": {},
        "overrides": {},
    }


async def main(force: bool = False, db_name: str | None = None) -> None:
    if db_name is not None:
        settings.MONGO_DB = db_name
    db_name = settings.MONGO_DB
    if not force and not db_name.endswith(("_dev", "_demo")):
        print(
            f"Refusing to load fixture world into database {db_name!r}: its name "
            "must end with '_dev' or '_demo' unless --force is passed."
        )
        sys.exit(1)
    print(f"WARNING: this drops and recreates every collection in database {db_name!r}.")

    client = AsyncMongoClient(settings.MONGO_URI)
    db = client[db_name]
    collections = [
        "users", "departments", "classes", "materials", "exams",
        "attempts", "requests", "notifications", "activity_log", "settings",
    ]
    for name in collections:
        await db[name].drop()

    # ---- departments (hod_id filled in after users exist) --------------
    dept_defs = [
        ("cs", "CS", "Computer Science", "h1"),
        ("se", "SE", "Software Engineering", "h2"),
        ("dsc", "DSC", "Data Science", "h3"),
    ]
    policy = {"min_clo": 2, "higher_order_pct": 25, "max_repeats": 2}
    dept_result = await db.departments.insert_many(
        [{"code": code, "name": name, "hod_id": None, "policy": dict(policy)} for _, code, name, _ in dept_defs]
    )
    dept_id = {old: str(oid) for (old, _, _, _), oid in zip(dept_defs, dept_result.inserted_ids)}

    # ---- users -----------------------------------------------------------
    from app.core.roles import with_roles_fields

    # (old_id, name, email, roles_list, dept_key)
    # HOD always includes teacher; t2 is teacher+student for multi-role e2e.
    user_defs = [
        ("a1", "Sadia Rehman", "admin@cogni.pk", ["admin"], None),
        ("a2", "Imran Butt", "imran.butt@cogni.pk", ["admin"], None),
        ("a3", "IT Support Desk", "it.support@cogni.pk", ["admin"], None),
        ("h1", "Prof. Tariq Mehmood", "tariq.mehmood@umt.edu.pk", ["hod", "teacher"], "cs"),
        ("h2", "Dr. Samina Javed", "samina.javed@umt.edu.pk", ["hod", "teacher"], "se"),
        ("h3", "Dr. Kamran Yousaf", "kamran.yousaf@umt.edu.pk", ["hod", "teacher"], "dsc"),
        ("t1", "Dr. Ayesha Khan", "ayesha.khan@umt.edu.pk", ["teacher"], "cs"),
        ("t2", "Mr. Faisal Aziz", "faisal.aziz@umt.edu.pk", ["teacher", "student"], "cs"),
        ("t3", "Dr. Nida Shah", "nida.shah@umt.edu.pk", ["teacher"], "se"),
        ("t4", "Ms. Hira Saleem", "hira.saleem@umt.edu.pk", ["teacher"], "dsc"),
        ("s1", "Hamza Ali", "hamza.ali@umt.edu.pk", ["student"], "cs"),
        ("s2", "Sana Iqbal", "sana.iqbal@umt.edu.pk", ["student"], "cs"),
        ("s3", "Bilal Ahmed", "bilal.ahmed@umt.edu.pk", ["student"], "cs"),
        ("s4", "Usman Tariq", "usman.tariq@umt.edu.pk", ["student"], "cs"),
        ("s5", "Maryam Noor", "maryam.noor@umt.edu.pk", ["student"], "cs"),
        ("s6", "Ali Raza", "ali.raza@umt.edu.pk", ["student"], "se"),
        ("s7", "Zainab Fatima", "zainab.fatima@umt.edu.pk", ["student"], "dsc"),
    ]
    pw_hash = hash_password(TEST_PASSWORD)
    user_result = await db.users.insert_many(
        [
            {
                "name": name,
                "email": email,
                "password_hash": pw_hash,
                **with_roles_fields(roles),
                "dept_id": dept_id[dept] if dept else None,
                "status": "active",
            }
            for _, name, email, roles, dept in user_defs
        ]
    )
    user_id = {old: str(oid) for (old, *_), oid in zip(user_defs, user_result.inserted_ids)}
    user_name = {old: name for old, name, *_ in user_defs}
    name_to_user_id = {name: user_id[old] for old, name, *_ in user_defs}

    for old_dept, hod_old in (("cs", "h1"), ("se", "h2"), ("dsc", "h3")):
        await db.departments.update_one(
            {"_id": dept_result.inserted_ids[[d[0] for d in dept_defs].index(old_dept)]},
            {"$set": {"hod_id": user_id[hod_old]}},
        )

    # ---- classes -----------------------------------------------------------
    class_defs = [
        ("c1", "CS-201-A", "Data Structures", "t1", "cs", "dsa", ["s1", "s2", "s3", "s4", "s5", "s6"], "DSX-4K2"),
        ("c2", "CS-305-B", "Database Systems", "t1", "cs", "sql", ["s1", "s2", "s4", "s7"], "DBS-9Q1"),
        ("c3", "CS-310-A", "Operating Systems", "t2", "cs", "os", ["s1", "s3", "s5"], "OSA-7M3"),
        ("c4", "SE-220-A", "Software Requirements", "t3", "se", "re", ["s2", "s3", "s6"], "SRE-5T6"),
        ("c5", "DS-230-A", "Data Management", "t4", "dsc", "sql", ["s4", "s7"], "DMG-3H9"),
    ]
    class_result = await db.classes.insert_many(
        [
            {
                "code": code, "name": name, "teacher_id": user_id[teacher], "dept_id": dept_id[dept],
                "student_ids": [user_id[s] for s in students], "join_code": join,
                "clos": list(POOLS[pool]["clos"]), "section": "Fall 2026",
            }
            for _, code, name, teacher, dept, pool, students, join in class_defs
        ]
    )
    class_id = {old: str(oid) for (old, *_), oid in zip(class_defs, class_result.inserted_ids)}

    # ---- materials -----------------------------------------------------------
    material_defs = [
        ("m1", "c1", "Lecture 5–7 · Trees, Heaps, Graphs.pdf", "dsa", "pdf"),
        ("m2", "c2", "SQL Joins and Aggregation slides.pdf", "sql", "pdf"),
        ("m3", "c3", "Ch. 5 · CPU Scheduling.pdf", "os", "pdf"),
        ("m4", "c4", "Requirements Engineering notes", "re", "text"),
        ("m5", "c5", "Data Management weeks 1–3.pdf", "sql", "pdf"),
    ]
    material_docs = []
    for _, cls, name, pool, kind in material_defs:
        chunks = [
            {"idx": i, "page": c["p"], "heading": c["tp"], "text": c["x"]}
            for i, c in enumerate(POOLS[pool]["chunks"])
        ]
        material_docs.append({
            "class_id": class_id[cls], "owner_id": None, "name": name, "kind": kind,
            "text": "\n\n".join(c["text"] for c in chunks),
            "chunks": chunks, "created_at": parse_date("12 Sep"),
        })
    material_result = await db.materials.insert_many(material_docs)
    material_id = {old: str(oid) for (old, *_), oid in zip(material_defs, material_result.inserted_ids)}
    class_material = {cls: old for old, cls, *_ in material_defs}

    # ---- exams -----------------------------------------------------------
    exam_defs = [
        ("e1", "Quiz 2: Hashing & Trees", "c1", "t1", "Quiz", 20, "dsa", [0, 5, 1, 2, 7, 9],
         "published", "2026-09-10", True,
         [("11 Sep", "Published to students · Dr. Ayesha Khan"),
          ("17 Sep", "Results released · Dr. Ayesha Khan")]),
        ("e2", "Quiz 3: Graphs & Queues", "c1", "t1", "Quiz", 25, "dsa", [3, 4, 6, 8, 10],
         "published", "2026-09-20", False,
         [("22 Sep", "Published to students · Dr. Ayesha Khan")]),
        ("e3", "Data Structures Midterm", "c1", "t1", "Midterm", 60, "dsa",
         [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11], "pending", "2026-09-25", False,
         [("26 Sep", "Sent to HOD for approval · Dr. Ayesha Khan")]),
        ("e4", "SQL Joins Quiz", "c2", "t1", "Quiz", 25, "sql", [0, 1, 2, 5, 7],
         "published", "2026-09-24", False,
         [("25 Sep", "Published to students · Dr. Ayesha Khan")]),
        ("e5", "CPU Scheduling Quiz", "c3", "t2", "Quiz", 20, "os", [0, 1, 4, 5, 7],
         "draft", "2026-09-27", False, []),
        ("e6", "Requirements Midterm", "c4", "t3", "Midterm", 45, "re", [0, 1, 2, 3, 5, 6, 7],
         "pending", "2026-09-26", False,
         [("27 Sep", "Sent to HOD for approval · Dr. Nida Shah")]),
    ]
    exam_id = {}
    exam_questions = {}
    for old, title, cls, teacher, kind, dur, pool, idx, status, created, released, hist in exam_defs:
        questions = [build_question(pool, i) for i in idx]
        exam_questions[old] = questions
        history = [{"at": parse_date(created), "by": user_id[teacher],
                    "text": "Draft generated from course material · " + user_name[teacher]}]
        for at, text in hist:
            history.append({"at": parse_date(at), "by": user_id[teacher], "text": text})
        doc = {
            "title": title, "class_id": class_id[cls], "teacher_id": user_id[teacher],
            "kind": kind, "duration_min": dur, "status": status, "questions": questions,
            "ai_threshold": 70, "released": released, "hod_comment": "", "request_id": None,
            "material_ids": [material_id[class_material[cls]]], "history": history,
            "created_at": parse_date(created),
        }
        result = await db.exams.insert_one(doc)
        exam_id[old] = str(result.inserted_id)

    # ---- requests -----------------------------------------------------------
    request_defs = [
        ("r1", "h1", "t1", "c1", "Midterm", "2026-10-06",
         "Cover all four CLOs, include at least two graph questions.", "submitted", "e3"),
        ("r2", "h1", "t2", "c3", "Midterm", "2026-10-12",
         "Cover scheduling and deadlocks.", "open", None),
    ]
    request_result = await db.requests.insert_many(
        [
            {
                "hod_id": user_id[hod], "teacher_id": user_id[teacher], "class_id": class_id[cls],
                "kind": kind, "due": parse_date(due), "note": note, "status": status,
                "exam_id": exam_id[exam] if exam else None,
            }
            for _, hod, teacher, cls, kind, due, note, status, exam in request_defs
        ]
    )
    request_id = {old: str(oid) for (old, *_), oid in zip(request_defs, request_result.inserted_ids)}
    await db.exams.update_one(
        {"_id": ObjectId(exam_id["e3"])},
        {"$set": {"request_id": request_id["r1"]}},
    )

    # ---- attempts -----------------------------------------------------------
    attempt_defs = [
        ("e1", "s1", [1, 0, 1, 1],
         ["A collision is when two keys map to the same index in the table. We can fix it with chaining, where each slot keeps a linked list of entries.",
          "It needs a rotation to balance it and 20 becomes the root with 10 and 30 under it."], "15 Sep"),
        ("e1", "s2", [1, 0, 1, 2],
         ["Two keys hash to the same index. It can be resolved with chaining or open addressing such as linear probing.",
          "Left-left case, so one right rotation at 30. The root is 20 with children 10 and 30."], "15 Sep"),
        ("e1", "s3", [1, 2, 1, 2],
         ["Two keys land in the same slot. Linear probing moves to the next free slot.",
          "Rotate right, root is 20."], "15 Sep"),
        ("e1", "s4", [3, 0, 0, 1], ["it is when hash is same. use chaining", "rotation"], "15 Sep"),
        ("e1", "s5", [1, 0, 1, 2],
         ["Collision is when two keys go to the same index. chaining stores a linked list in each slot.",
          "right rotation and 20 becomes root"], "15 Sep"),
        ("e1", "s6", [1, 0, 3, 0], ["", "not sure"], "15 Sep"),
        ("e2", "s2", [1, 2, 1],
         ["An adjacency list is preferable for sparse graphs because it utilizes memory proportional to V+E, whereas a matrix requires O(V^2) space. Furthermore, iterating over neighbours is efficient, and it is essential for large social networks.",
          "A priority queue is the better design because patients with critical conditions must be treated first. Additionally, a FIFO queue is fair but it is crucial to consider severity. The heap implementation ensures efficient insertion. Low-priority patients could starve, so aging should be added."], "24 Sep"),
        ("e2", "s3", [1, 1, 1],
         ["list because it uses less memory",
          "In evaluating the design of an emergency ward queuing system, it is essential to consider multiple dimensions, including fairness, efficiency, and patient outcomes. A priority queue offers a robust framework that ensures critical patients are treated first. Furthermore, while a FIFO queue guarantees fairness, it fails to account for severity. Moreover, aging mechanisms can mitigate starvation. In conclusion, a heap-based priority queue is the comprehensive solution."], "24 Sep"),
        ("e2", "s4", [1, 2, 0],
         ["list, the matrix wastes space when there are few edges",
          "Priority queue is better because in hospital the serious patient must come first. FIFO is fair but a heart attack patient cannot wait behind a small cut. But low priority people may wait too long so we should increase their priority with time."], "24 Sep"),
        ("e2", "s5", [0, 2, 1],
         ["adjacency list since a sparse graph has few edges so memory is less, O(V+E)",
          "I think priority queue. severity decides the order. fifo is simple but not safe."], "25 Sep"),
        ("e4", "s4", [1, 1, 0],
         ["where is for rows and having is for groups after group by",
          "select course, count(*) from courses join enrollments group by course"], "27 Sep"),
    ]
    exam_duration = {old: dur for old, _, _, _, _, dur, *_ in exam_defs}
    attempt_docs = []
    for exam_old, student_old, mcq, written, when in attempt_defs:
        exam_doc = {"duration_min": exam_duration[exam_old]}
        built = build_attempt(exam_doc, exam_questions[exam_old], mcq, written, when)
        attempt_docs.append({"exam_id": exam_id[exam_old], "student_id": user_id[student_old], **built})
    attempt_result = await db.attempts.insert_many(attempt_docs)
    first_attempt_id = str(attempt_result.inserted_ids[0])

    # ---- notifications -----------------------------------------------------------
    notification_defs = [
        ("t1", "Bilal Ahmed submitted Quiz 3: Graphs & Queues · 1 AI-writing flag", "t-results", exam_id["e2"], "24 Sep"),
        ("t1", "Usman Tariq submitted SQL Joins Quiz", "t-results", exam_id["e4"], "27 Sep"),
        ("h1", "Dr. Ayesha Khan sent Data Structures Midterm for approval", "h-review", exam_id["e3"], "26 Sep"),
        ("h2", "Dr. Nida Shah sent Requirements Midterm for approval", "h-review", exam_id["e6"], "27 Sep"),
        ("t2", "Prof. Tariq Mehmood requested a Midterm for CS-310-A, due 12 Oct", "t-create", request_id["r2"], "27 Sep"),
        ("s1", "Results released: Quiz 2: Hashing & Trees", "s-feedback", first_attempt_id, "17 Sep"),
        ("s1", "Quiz 3: Graphs & Queues is now live in CS-201-A", "s-take", exam_id["e2"], "22 Sep"),
        ("s1", "SQL Joins Quiz is now live in CS-305-B", "s-take", exam_id["e4"], "25 Sep"),
        ("a1", "Welcome to the cogni.ai admin console", "a-dash", None, "01 Sep"),
    ]
    await db.notifications.insert_many(
        [
            {
                "to_user_id": user_id[to], "text": text,
                "link": {"page": page, "id": link_id} if link_id else None,
                "read": False, "created_at": parse_date(when),
            }
            for to, text, page, link_id, when in notification_defs
        ]
    )

    # ---- activity log -----------------------------------------------------------
    log_defs = [
        ("27 Sep 10:12", "Dr. Nida Shah", "teacher", "Sent Requirements Midterm to HOD"),
        ("27 Sep 09:40", "Prof. Tariq Mehmood", "hod", "Requested a Midterm from Mr. Faisal Aziz for CS-310-A"),
        ("26 Sep 16:05", "Dr. Ayesha Khan", "teacher", "Sent Data Structures Midterm to HOD"),
        ("01 Sep 09:00", "Sadia Rehman", "admin", "Created departments and imported 17 users"),
    ]
    await db.activity_log.insert_many(
        [
            {"at": parse_date(t), "actor_id": name_to_user_id[who], "actor_name": who, "role": role, "text": text}
            for t, who, role, text in log_defs
        ]
    )

    # ---- settings -----------------------------------------------------------
    await db.settings.insert_one(
        {
            "singleton": True,
            "approval": "major",
            "max_upload_mb": 25,
            "ai_threshold_default": 70,
            "institution_name": "Demo University",
            "current_term": "Fall 2026",
            "student_signup_enabled": True,
            "allowed_email_domains": [],
        }
    )

    # Dropping collections above also drops indexes; recreate them so uniqueness
    # constraints hold for the rest of the process (and for tests that reseed).
    await db.users.create_index("email", unique=True)
    await db.classes.create_index("join_code", unique=True)
    await db.classes.create_index("teacher_id")
    await db.exams.create_index("class_id")
    await db.exams.create_index("status")
    await db.attempts.create_index([("exam_id", 1), ("student_id", 1)], unique=True)
    await db.notifications.create_index([("to_user_id", 1), ("created_at", -1)])
    await db.activity_log.create_index([("at", -1)])

    counts = {}
    for name in collections:
        counts[name] = await db[name].count_documents({})
    for name, count in counts.items():
        print(f"{name}: {count}")

    await client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        dest="db_name",
        default=None,
        help="MongoDB database name (overrides MONGO_DB env / settings)",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.db_name:
        os.environ["MONGO_DB"] = args.db_name
        settings.MONGO_DB = args.db_name
    asyncio.run(main(force=args.force, db_name=args.db_name))
