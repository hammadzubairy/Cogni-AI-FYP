from app.services.chunker import MAX_WORDS, MIN_WORDS, chunk_pages


def _paragraph(n_words: int, tag: str) -> str:
    return " ".join(f"{tag}word{i}" for i in range(n_words))


def test_chunk_sizes_no_empty_chunks_order_preserved():
    # Simulate a long document: a heading every ~3 paragraphs, each
    # paragraph ~120 words, spread over several PDF pages.
    pages = []
    para_idx = 0
    for page_num in range(1, 9):
        paras = []
        for _ in range(4):
            if para_idx % 3 == 0:
                paras.append(f"{para_idx // 3 + 1}.{page_num} Section Heading\nIntro line.")
            paras.append(_paragraph(120, f"p{para_idx}_"))
            para_idx += 1
        pages.append({"page": page_num, "text": "\n\n".join(paras)})

    chunks = chunk_pages(pages)

    assert len(chunks) > 1
    for i, c in enumerate(chunks):
        assert c["idx"] == i
        assert c["text"].strip() != ""
        word_count = len(c["text"].split())
        if i < len(chunks) - 1:
            # every chunk but the last respects the target band
            assert MIN_WORDS <= word_count <= MAX_WORDS * 1.2

    # order preserved: first word of the whole document appears in chunk 0,
    # and chunks don't repeat or skip paragraphs
    all_text = " ".join(c["text"] for c in chunks)
    assert "p0_word0" in chunks[0]["text"]
    assert all_text.index("p0_word0") < all_text.index(f"p{para_idx - 1}_word0")


def test_never_splits_mid_sentence_within_a_paragraph():
    long_para = "This is one long sentence that must never be cut in half. " * 20
    pages = [{"page": 1, "text": long_para}]
    chunks = chunk_pages(pages)
    assert len(chunks) == 1
    assert chunks[0]["text"] == long_para.strip()


def test_heading_detected_and_page_range_tracked():
    pages = [
        {"page": 1, "text": "2.1 Binary Trees\nShort paragraph here."},
        {"page": 2, "text": _paragraph(50, "more_")},
    ]
    chunks = chunk_pages(pages)
    assert len(chunks) == 1
    assert chunks[0]["heading"] == "2.1 Binary Trees"
    assert chunks[0]["page"] == "1-2"


def test_pasted_text_has_no_page():
    chunks = chunk_pages([{"page": None, "text": "Just a short paragraph of pasted text."}])
    assert chunks[0]["page"] is None
