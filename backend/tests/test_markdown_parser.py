"""Tests for the markdown -> test_data parser. Run with: pytest tests/test_markdown_parser.py"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.test_markdown import markdown_to_test_data


def test_minimal_test():
    md = """# My Test

## 1. Vocabulary (5 marks)
> Complete the sentences.

1. Joe's a big f________ of heavy metal.   = fan
2. Kate plays in a b________ with friends.   = band
"""
    out = markdown_to_test_data(md)
    assert out["test_data"]["title"] == "My Test"
    sec = out["test_data"]["sections"][0]
    assert sec["block_num"] == 1
    assert sec["section_title"] == "Vocabulary"
    assert sec["marks"] == 5
    assert sec["instruction"] == "Complete the sentences."
    assert len(sec["questions"]) == 2
    q1 = sec["questions"][0]
    assert q1["type"] == "fill_in_blank_hint"
    assert q1["hint_letter"] == "f"
    assert "________" in q1["text"]
    assert out["answer_key"]["s1_q1"] == ["fan"]
    assert out["answer_key"]["s1_q2"] == ["band"]


def test_multiple_choice():
    md = """## 1. Listening (3 marks)
> Choose the correct option.

1. Mr Jones is a ________.
   - a) builder
   - *b) an archaeologist
   - c) a farmer
"""
    out = markdown_to_test_data(md)
    q = out["test_data"]["sections"][0]["questions"][0]
    assert q["type"] == "multiple_choice"
    assert q["options"] == [["a", "builder"], ["b", "an archaeologist"], ["c", "a farmer"]]
    assert out["answer_key"]["s1_q1"] == ["b"]


def test_binary_choice():
    md = """## 1. Grammar (2 marks)

1. My school is ten minutes (*by / on) car.
2. The train station isn't far - five minutes (by / *on) foot.
"""
    out = markdown_to_test_data(md)
    qs = out["test_data"]["sections"][0]["questions"]
    assert qs[0]["type"] == "binary_choice"
    assert qs[0]["choice_values"] == ["by", "on"]
    assert qs[0]["text"] == "My school is ten minutes ________ car."
    assert out["answer_key"]["s1_q1"] == ["by"]
    assert out["answer_key"]["s1_q2"] == ["on"]


def test_tick():
    md = """## 1. Listening (5 marks)
> Tick the adjectives you hear.

1.
   [ ] small *
   [ ] friendly *
   [ ] clean *
   [ ] dirty
   [ ] modern *
   [ ] dangerous
   [ ] old
   [ ] nice *
"""
    out = markdown_to_test_data(md)
    q = out["test_data"]["sections"][0]["questions"][0]
    assert q["type"] == "tick"
    assert q["tick_items"] == ["small", "friendly", "clean", "dirty", "modern", "dangerous", "old", "nice"]
    assert set(out["answer_key"]["s1_q1"]) == {"small", "friendly", "clean", "modern", "nice"}


def test_match():
    md = """## 1. Vocabulary (5 marks)
> Match 1-5 with a-e.
[match]
- We play basketball there. = sports centre
- It goes over the river. = bridge
- There are a lot of shops. = shopping centre
- Trains go from there. = train station
- We have coffee there. = café
[/match]
"""
    out = markdown_to_test_data(md)
    sec = out["test_data"]["sections"][0]
    assert len(sec["questions"]) == 5
    assert sec["questions"][0]["type"] == "match"
    assert sec["questions"][0]["text"] == "We play basketball there."
    assert sec["match_options"] == [
        ["a", "sports centre"],
        ["b", "bridge"],
        ["c", "shopping centre"],
        ["d", "train station"],
        ["e", "café"],
    ]
    assert out["answer_key"]["s1_q1"] == ["sports centre"]
    assert out["answer_key"]["s1_q5"] == ["café"]


def test_passage_and_short_answer():
    md = """## 1. Reading (10 marks)
> Read the text and answer the questions.
[passage]
Zara is a young musician from Manchester.
She started piano at age five.
[/passage]

1. When did Zara start piano?   = at age five, when she was five
2. Where is Zara from?   = manchester
"""
    out = markdown_to_test_data(md)
    sec = out["test_data"]["sections"][0]
    assert sec["passage"].startswith("Zara is")
    assert "She started" in sec["passage"]
    assert len(sec["questions"]) == 2
    assert sec["questions"][0]["type"] == "short_answer"
    assert out["answer_key"]["s1_q1"] == ["at age five", "when she was five"]
    assert out["answer_key"]["s1_q2"] == ["manchester"]


def test_audio_and_wordbox_and_example():
    md = """## 1. Listening (5 marks)
> Listen and complete.
[audio 1.02]
[wordbox] confidence, energy, fame, kindness, success, talent
[example] Maggie sings on TV. She's successful.

1. Mark plays piano. He's ________.   = talented
"""
    out = markdown_to_test_data(md)
    sec = out["test_data"]["sections"][0]
    assert sec["audio_ref"] == "1.02"
    assert sec["word_box"] == ["confidence", "energy", "fame", "kindness", "success", "talent"]
    assert sec["example"] == "Maggie sings on TV. She's successful."


def test_essay():
    md = """## 1. Writing (10 marks)
> Write a review of a music video. 60-80 words.
[guide]
Paragraph 1: Who wrote it?
Paragraph 2: What did you like?
[/guide]

1. [essay]
"""
    out = markdown_to_test_data(md)
    sec = out["test_data"]["sections"][0]
    assert sec["writing_guide"].startswith("Paragraph 1")
    assert sec["questions"][0]["type"] == "essay"


def test_letter_pattern_hint():
    """Comparative-form patterns: 'old - o___r' is fill_in_blank_hint."""
    md = """## 1. Grammar (3 marks)
> Write the comparative form.

1. old - o___r       = older
2. pretty - p______r = prettier
3. good - b___r      = better
"""
    out = markdown_to_test_data(md)
    qs = out["test_data"]["sections"][0]["questions"]
    assert qs[0]["type"] == "fill_in_blank_hint"
    assert qs[0]["hint_letter"] == "o"
    assert out["answer_key"]["s1_q1"] == ["older"]
    assert out["answer_key"]["s1_q3"] == ["better"]


def test_multiline_question_text():
    md = """## 1. Vocabulary (2 marks)

1. The shopping centre has got over 500
   shops. It's really f________ to visit.
   = fun, fantastic
"""
    out = markdown_to_test_data(md)
    q = out["test_data"]["sections"][0]["questions"][0]
    assert "shops" in q["text"]
    # The 'f' hint letter is now stripped from text and stored on hint_letter
    assert "________" in q["text"]
    assert q["hint_letter"] == "f"
    assert out["answer_key"]["s1_q1"] == ["fun", "fantastic"]


def test_multiple_blocks():
    md = """# Whole test

## 1. Listening (5 marks)
> Listen.

1. The cat sat on the m________.   = mat

## 2. Vocabulary (3 marks)
> Pick a word.

1. The dog is ________.
   - *a) friendly
   - b) angry
   - c) tired
"""
    out = markdown_to_test_data(md)
    secs = out["test_data"]["sections"]
    assert len(secs) == 2
    assert secs[0]["block_num"] == 1
    assert secs[1]["block_num"] == 2
    assert out["answer_key"]["s1_q1"] == ["mat"]
    assert out["answer_key"]["s2_q1"] == ["a"]


def test_dialogue_block():
    md = """## 1. Communication (5 marks)
> Choose the correct words.
[dialogue]
A: You look busy. What are you doing?
B: There's going to be a party.
A: Do you [1] me to help?
B: That [2] be great.
[/dialogue]

1.
   - a) have
   - *b) want
   - c) like

2.
   - *a) is
   - b) would
   - c) can
"""
    out = markdown_to_test_data(md)
    sec = out["test_data"]["sections"][0]
    assert "party" in sec["dialogue"]
    assert len(sec["questions"]) == 2
    assert out["answer_key"]["s1_q1"] == ["b"]
    assert out["answer_key"]["s1_q2"] == ["a"]


def test_collapse_adjacent_blanks():
    """AI sometimes writes ________ ________ for multi-word answers — collapse to one."""
    md = """## 1. Grammar (2 marks)

1. She ________ ________ the new pool.   = hasn't seen
2. He has ________. She has ________.    = read
"""
    out = markdown_to_test_data(md)
    qs = out["test_data"]["sections"][0]["questions"]
    # Adjacent blanks collapsed
    assert qs[0]["text"].count("________") == 1, f"Expected 1 blank, got: {qs[0]['text']}"
    # Non-adjacent (separated by sentence) NOT collapsed
    assert qs[1]["text"].count("________") == 2


def test_hint_letter_stripped_from_text():
    """fill_in_blank_hint text should not contain the hint letter — it's rendered as a badge."""
    md = """## 1. Vocabulary (2 marks)

1. Joe is a big f________ of metal.   = fan
"""
    out = markdown_to_test_data(md)
    q = out["test_data"]["sections"][0]["questions"][0]
    assert q["type"] == "fill_in_blank_hint"
    assert q["hint_letter"] == "f"
    # 'f' is gone from the text — the renderer adds it via hint span
    assert "f________" not in q["text"]
    assert "________" in q["text"]


def test_slash_separated_alternatives():
    """AI often writes alternatives with ' / ' instead of ','. Both must work."""
    md = """## 1. Reading (3 marks)
> Complete the sentences.

1. David ________ the new pool.   = hasn't seen / hasn't visited
2. The shop sells ________.   = books, magazines
3. Use and/or correctly.   = and/or
"""
    out = markdown_to_test_data(md)
    assert out["answer_key"]["s1_q1"] == ["hasn't seen", "hasn't visited"]
    assert out["answer_key"]["s1_q2"] == ["books", "magazines"]
    # 'and/or' has no surrounding spaces — should NOT be split
    assert out["answer_key"]["s1_q3"] == ["and/or"]


def test_real_basic_test_excerpt():
    """Realistic excerpt from the English Plus Unit 1 Basic test."""
    md = """## 1. Listening (5 marks)
> Listen and tick the adjectives you hear.

1.
   [ ] small *
   [ ] friendly *
   [ ] clean *
   [ ] dirty
   [ ] modern *
   [ ] dangerous
   [ ] old
   [ ] nice *

## 2. Vocabulary (5 marks)
> Complete the sentences.

1. My brother and I go to the sports c________ on Saturday.   = centre
2. Is there a bus s________ in your town?   = station

## 3. Grammar (2 marks)

1. There (* / are) two theatres.
"""
    # The first ` * ` would be tricky — but it's not a binary choice format.
    # Let me use a more realistic example.
    md = """## 1. Listening (5 marks)
> Listen and tick the adjectives you hear.

1.
   [ ] small *
   [ ] friendly *
   [ ] clean *
   [ ] dirty
   [ ] modern *
   [ ] dangerous
   [ ] old
   [ ] nice *

## 2. Vocabulary (5 marks)
> Complete the sentences.

1. My brother and I go to the sports c________ on Saturday.   = centre
2. Is there a bus s________ in your town?   = station

## 3. Grammar (3 marks)

1. (*There's / are) two theatres.
2. There isn't (*a / any) park near here.
3. There aren't (some / *any) nice shops here.
"""
    out = markdown_to_test_data(md)
    secs = out["test_data"]["sections"]
    assert len(secs) == 3

    # Block 1 - tick
    assert secs[0]["questions"][0]["type"] == "tick"
    assert len(secs[0]["questions"][0]["tick_items"]) == 8
    assert set(out["answer_key"]["s1_q1"]) == {"small", "friendly", "clean", "modern", "nice"}

    # Block 2 - hint fill-ins
    assert secs[1]["questions"][0]["type"] == "fill_in_blank_hint"
    assert secs[1]["questions"][0]["hint_letter"] == "c"
    assert out["answer_key"]["s2_q1"] == ["centre"]
    assert out["answer_key"]["s2_q2"] == ["station"]

    # Block 3 - binary choices
    assert secs[2]["questions"][0]["type"] == "binary_choice"
    assert secs[2]["questions"][0]["choice_values"] == ["There's", "are"]
    assert out["answer_key"]["s3_q1"] == ["There's"]
    assert out["answer_key"]["s3_q3"] == ["any"]


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    passed, failed = 0, []
    for t in tests:
        try:
            t()
            passed += 1
            print(f"PASS  {t.__name__}")
        except AssertionError as e:
            failed.append((t.__name__, str(e) or "AssertionError"))
            print(f"FAIL  {t.__name__}: {e}")
        except Exception as e:
            failed.append((t.__name__, f"{type(e).__name__}: {e}"))
            print(f"ERROR {t.__name__}: {e}")
            traceback.print_exc()
    print(f"\n{passed}/{passed + len(failed)} tests passed.")
    if failed:
        print("Failures:")
        for name, msg in failed:
            print(f"  {name}: {msg}")
        sys.exit(1)
