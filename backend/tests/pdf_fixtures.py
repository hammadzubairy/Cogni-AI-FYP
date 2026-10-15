"""Fixture PDFs for material-upload tests.

Hand-built PDFs (no dependency) plus optional reportlab variants for
oversized / non-PDF-renamed cases used by the security and materials suites.
"""

import io


def build_pdf(pages_lines: list[list[str]]) -> bytes:
    """pages_lines: one list of text lines per page. Each page repeats a
    constant header/footer line so header/footer-stripping can be tested,
    and lines may end with a hyphen to test hyphenated line-break joining."""
    objects = []
    n_pages = len(pages_lines)
    font_obj_num = 3 + n_pages

    objects.append("<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{3 + i} 0 R" for i in range(n_pages))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>")
    for i in range(n_pages):
        content_obj_num = font_obj_num + 1 + i
        objects.append(
            f"<< /Type /Page /Parent 2 0 R "
            f"/Resources << /Font << /F1 {font_obj_num} 0 R >> >> "
            f"/MediaBox [0 0 612 792] /Contents {content_obj_num} 0 R >>"
        )
    objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for lines in pages_lines:
        ops = ["BT", "/F1 11 Tf", "72 740 Td"]
        for j, line in enumerate(lines):
            escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
            if j == 0:
                ops.append(f"({escaped}) Tj")
            else:
                ops.append(f"0 -14 Td ({escaped}) Tj")
        ops.append("ET")
        stream = "\n".join(ops)
        objects.append(f"<< /Length {len(stream.encode())} >>\nstream\n{stream}\nendstream")

    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(buf.tell())
        buf.write(f"{idx} 0 obj\n{obj}\nendobj\n".encode())
    xref_offset = buf.tell()
    total = len(objects) + 1
    buf.write(f"xref\n0 {total}\n".encode())
    buf.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.write(f"{off:010d} 00000 n \n".encode())
    buf.write(f"trailer\n<< /Size {total} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return buf.getvalue()


def sample_multipage_pdf() -> bytes:
    """A 3-page PDF with a repeated header/footer and a hyphenated word
    broken across a line, enough text to clear the scanned-PDF threshold."""
    filler = (
        "This course covers fundamental data structures used throughout "
        "computer science including trees graphs hash tables and queues."
    )
    pages = [
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.1 Hash Tables",
            "A hash table maps keys to array slots using a hash func-",
            "tion, giving O(1) average lookup time for most inputs.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.2 Collisions",
            "When two keys map to the same slot a collision occurs.",
            "Chaining stores a linked list in each slot for lookups.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
        [
            "COURSE NOTES — DATA STRUCTURES",
            "2.3 Open Addressing",
            "Open addressing probes for the next free slot instead of",
            "chaining, using linear or quadratic probing strategies.",
            filler,
            filler,
            "Confidential — do not distribute",
        ],
    ]
    return build_pdf(pages)


def sample_scanned_pdf() -> bytes:
    """A PDF with (almost) no extractable text, mimicking a scanned image."""
    return build_pdf([["x"]])


def oversized_pdf(min_bytes: int = 2 * 1024 * 1024) -> bytes:
    """A valid-looking PDF whose raw size exceeds a typical upload limit."""
    # Pad a tiny valid PDF with whitespace in a stream so pypdf still opens it.
    base = build_pdf([["pad"] * 5])
    pad = b" " * max(0, min_bytes - len(base))
    return base + pad


def non_pdf_named_pdf() -> bytes:
    """Plain text bytes with a .pdf filename — wrong magic bytes."""
    return b"This is not a PDF file at all.\n" * 50


def reportlab_course_pdf() -> bytes:
    """Optional richer multi-page course PDF via reportlab (if installed)."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError:
        return sample_multipage_pdf()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    paragraphs = [
        "Data Structures — Hash Tables",
        "A hash table maps keys to array slots using a hash function, "
        "giving O(1) average lookup time for most inputs. Collisions occur "
        "when two keys map to the same slot and are resolved by chaining "
        "or open addressing with linear or quadratic probing.",
        "Trees and Graphs",
        "AVL trees keep sibling subtree heights within one. Sparse graphs "
        "prefer adjacency lists over matrices for memory. Breadth-first "
        "search uses a queue; depth-first search uses a stack or recursion.",
        "Heaps and Queues",
        "A binary heap supports O(log n) insert and extract-min. Priority "
        "queues order hospital triage by severity rather than FIFO arrival.",
    ]
    for page in range(3):
        y = 750
        c.drawString(72, y, f"COURSE NOTES — PAGE {page + 1}")
        y -= 28
        for para in paragraphs:
            for i in range(0, len(para), 90):
                c.drawString(72, y, para[i : i + 90])
                y -= 14
                if y < 72:
                    break
            y -= 10
        c.showPage()
    c.save()
    return buf.getvalue()
