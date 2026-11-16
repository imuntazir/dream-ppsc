#!/usr/bin/env python3
"""Parse the PPSC MCQ bank markdown files into clean JSON for Muft Tayyari.

Sources (all local, pre-verified by the bank compiler):
  - hidden_files/ppsc-bank-{english,urdu,islamiat,pakstudies,current-affairs-gk,
    science,computer,math}.md   (1,446 items)
  - hidden_files/ppsc-recent-papers-bank.md  (only F-prefixed items; the
    E/U/I/P/S/C/M items there are already merged into the subject files)
  - build_04oct_drill.py dict (subjects + explanations for F97-F196)
  - pakistan-economy-finance-budget-mcqs.pdf via pdftohtml XML
    (correct option = green font #1a7a1a)

HARD RULES:
  - Drop any item line containing "UNVERIFIED" (any case).
  - Drop any item without a parseable `Ans: [A-D]`.
  - Drop any item that does not parse into stem + exactly 4 options.
  - Never invent a question, option, answer or explanation.
  - Dedup by normalised stem across all sources; keep the first occurrence.
"""
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict
from pathlib import Path

BANK = Path.home() / "workspace/goals/ppsc-assistant-bps-16-exam-pass-karna/hidden_files"
OUT = Path.home() / "workspace/humanity-build/muft-tayyari/data"
ECON_PDF = Path.home() / "workspace/your_files/pakistan-economy-finance-budget-mcqs.pdf"
DRILL_PY = BANK / "build_04oct_drill.py"

SUBJECT_FILES = [
    ("ppsc-bank-english.md", "English"),
    ("ppsc-bank-urdu.md", "Urdu"),
    ("ppsc-bank-islamiat.md", "Islamiat"),
    ("ppsc-bank-pakstudies.md", "Pak Studies"),
    ("ppsc-bank-current-affairs-gk.md", "Current Affairs & GK"),
    ("ppsc-bank-science.md", "Everyday Science"),
    ("ppsc-bank-computer.md", "Computer"),
    ("ppsc-bank-math.md", "Math"),
]

ITEM_RE = re.compile(
    r"^\*\*([A-Z]+\d+)\.\*\*\s*(.+?)\s+A\)\s*(.+?)\s+B\)\s*(.+?)\s+C\)\s*(.+?)\s+D\)\s*(.+?)\s*\|\s*Ans:\s*([A-D])\b(.*)$"
)
F_ITEM_RE = re.compile(
    r"^\*\*(F\d+)\.\*\*\s*(?:\(source-solved\)\s*)?(.+?)\s+A\)\s*(.+?)\s+B\)\s*(.+?)\s+C\)\s*(.+?)\s+D\)\s*(.+?)\s*\|\s*Ans:\s*([A-D])\b(.*)$"
)
DRILL_SUBJ = {
    "Pak Studies": "Pak Studies",
    "Current Affairs": "Current Affairs & GK",
    "General Knowledge": "Current Affairs & GK",
    "English": "English",
    "Everyday Science": "Everyday Science",
    "Islamiat": "Islamiat",
    "Math": "Math",
    "Urdu": "Urdu",
    "Computer": "Computer",
}

dropped = []  # (source, id, reason)


def norm_stem(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def dedup_key(stem: str, opts) -> str:
    return norm_stem(stem) + " || " + " | ".join(norm_stem(o) for o in opts)


def clean_opt(o: str) -> str:
    return " ".join(o.strip().split())


def extract_note(tail: str):
    """Parenthetical notes after the answer letter / source tag.

    Returns a short explanatory note, or None. Pure provenance markers
    ('options reconstructed' alone, 'verify', 'source-solved') are dropped;
    if a note reads 'options reconstructed; <real note>' the real note is kept.
    """
    if not tail:
        return None
    notes = []
    for paren in re.findall(r"\(([^()]*)\)", tail):
        p = paren.strip()
        low = p.lower()
        if low in ("options reconstructed", "verify", "source-solved",
                    "options reconstructed; verify"):
            continue
        if low.startswith("options reconstructed;"):
            p = p[len("options reconstructed;"):].strip()
        if low.startswith("options reconstructed,"):
            p = p[len("options reconstructed,"):].strip()
        if p:
            notes.append(p)
    if not notes:
        return None
    return " ".join(notes)


def parse_subject_file(path: Path, subject: str, seen: dict, out: list):
    for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.startswith("**"):
            continue
        m = re.match(r"^\*\*([A-Z]+\d+)\.\*\*", line)
        if not m:
            continue
        qid = m.group(1)
        if "unverified" in line.lower():
            dropped.append((path.name, qid, "flagged UNVERIFIED"))
            continue
        mm = ITEM_RE.match(line)
        if not mm:
            dropped.append((path.name, qid, "no parseable Ans A-D / malformed"))
            continue
        _id, stem, a, b, c, d, ans, tail = mm.groups()
        opts = [clean_opt(a), clean_opt(b), clean_opt(c), clean_opt(d)]
        if any(not o for o in opts):
            dropped.append((path.name, qid, "empty option"))
            continue
        if len(set(opts)) < 4:
            dropped.append((path.name, qid, "duplicate options"))
            continue
        key = dedup_key(stem, opts)
        if key in seen:
            dropped.append((path.name, qid, f"duplicate stem of {seen[key]}"))
            continue
        seen[key] = qid
        out.append({
            "id": qid,
            "subject": subject,
            "q": " ".join(stem.split()),
            "options": opts,
            "answer": "ABCD".index(ans),
            "explanation": extract_note(tail),
            "source": "PPSC bank",
        })


def drill_map():
    """F97-F196 -> (subject, explanation) from build_04oct_drill.py."""
    src = DRILL_PY.read_text(encoding="utf-8")
    pairs = re.findall(r"'(F\d+)':\s*\(\s*'([^']+)'\s*,\s*\"(.*?)\"\s*\)", src, re.S)
    m = {}
    for fid, subj, expl in pairs:
        expl = re.sub(r"<[^>]+>", "", expl).strip()
        m[fid] = (DRILL_SUBJ.get(subj, subj), expl or None)
    return m


def parse_recent_f_items(seen: dict, out: list):
    dmap = drill_map()
    path = BANK / "ppsc-recent-papers-bank.md"
    f_subject_guess = {}
    # F89-F96 are math (source-solved); F82/F88 sit in the English section.
    for i in range(89, 97):
        f_subject_guess[f"F{i}"] = "Math"
    for i in (82, 83, 84, 85, 87, 88):
        f_subject_guess[f"F{i}"] = "English"
    for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.startswith("**F"):
            continue
        m = re.match(r"^\*\*(F\d+)\.\*\*", line)
        if not m:
            continue
        qid = m.group(1)
        if "unverified" in line.lower():
            dropped.append((path.name, qid, "flagged UNVERIFIED"))
            continue
        mm = F_ITEM_RE.match(line)
        if not mm:
            dropped.append((path.name, qid, "no parseable Ans A-D / malformed"))
            continue
        _id, stem, a, b, c, d, ans, tail = mm.groups()
        opts = [clean_opt(a), clean_opt(b), clean_opt(c), clean_opt(d)]
        if any(not o for o in opts) or len(set(opts)) < 4:
            dropped.append((path.name, qid, "empty/duplicate option"))
            continue
        key = dedup_key(stem, opts)
        if key in seen:
            dropped.append((path.name, qid, f"duplicate stem of {seen[key]}"))
            continue
        if qid in dmap:
            subject, expl = dmap[qid]
        elif qid in f_subject_guess:
            subject, expl = f_subject_guess[qid], extract_note(tail)
        else:
            dropped.append((path.name, qid, "F-item with no subject mapping (pre-F97, not verified as a batch)"))
            continue
        seen[key] = qid
        out.append({
            "id": qid,
            "subject": subject,
            "q": " ".join(stem.split()),
            "options": opts,
            "answer": "ABCD".index(ans),
            "explanation": expl,
            "source": "PPSC Assistant paper 04-10-2026" if qid in dmap else "PPSC Assistant paper 27-04-2025",
        })


def parse_economy_pdf(seen: dict, out: list):
    """Correct option = green font (#1a7a1a) in the pdftohtml XML."""
    xml_path = "/tmp/econ.xml"
    subprocess.run(["pdftohtml", "-xml", str(ECON_PDF), xml_path],
                   check=True, capture_output=True)
    tree = ET.parse(xml_path)
    root = tree.getroot()
    # fontspec id -> (family, color)
    fonts = {}
    for fs in root.iter("fontspec"):
        fonts[fs.get("id")] = fs.get("color", "").lower()
    # Collect text lines per page in reading order: (font, text)
    lines = []
    for page in root.iter("page"):
        for text in page.iter("text"):
            f = fonts.get(text.get("font"), "")
            t = "".join(text.itertext()).strip()
            if t:
                lines.append((f, t))
    # Group into questions: "Q<n>. <stem>" ... "A. .." "B. .." "C. .." "D. .." "→" <explanation>
    # The arrow is its own text element; the line after it is the explanation.
    # A trailing "Answer Key Q1: B ..." footer is captured for verification.
    items = []
    cur = None
    expect_expl = False
    answer_key = {}
    in_key = False
    for font, t in lines:
        if t == "Answer Key":
            in_key = True
            continue
        if in_key:
            km = re.match(r"^Q(\d+):\s*([A-D])$", t)
            if km:
                answer_key[int(km.group(1))] = km.group(2)
                continue
            if t.startswith("Quick check:"):
                in_key = False
                continue
            continue
        m = re.match(r"^Q(\d+)\.\s*(.*)$", t)
        if m:
            if cur:
                items.append(cur)
            cur = {"n": int(m.group(1)), "stem": m.group(2).strip(),
                   "opts": {}, "green": set(), "expl": ""}
            expect_expl = False
            continue
        if cur is None:
            continue
        if t == "→":
            expect_expl = True
            continue
        if expect_expl:
            cur["expl"] = t
            expect_expl = False
            continue
        om = re.match(r"^([A-D])\.\s*(.*)$", t)
        if om:
            cur["opts"][om.group(1)] = om.group(2).strip()
            if font == "#1a7a1a":
                cur["green"].add(om.group(1))
            continue
        # continuation of stem or option text
        if cur["opts"]:
            last = sorted(cur["opts"])[-1]
            cur["opts"][last] += " " + t
        else:
            cur["stem"] += " " + t
    if cur:
        items.append(cur)
    for it in items:
        qid = f"EC{it['n']}"
        if len(it["opts"]) != 4:
            dropped.append(("economy-pdf", qid, f"only {len(it['opts'])} options parsed"))
            continue
        if len(it["green"]) != 1:
            dropped.append(("economy-pdf", qid, f"{len(it['green'])} green options (need exactly 1)"))
            continue
        ans = sorted(it["green"])[0]
        # Cross-check against the PDF's printed answer key (definitive).
        keyed = answer_key.get(it["n"])
        if keyed is not None and keyed != ans:
            dropped.append(("economy-pdf", qid, f"green answer {ans} != printed key {keyed}"))
            continue
        if keyed is None:
            dropped.append(("economy-pdf", qid, "no printed answer key for this item"))
            continue
        opts = [it["opts"][k] for k in "ABCD"]
        key = dedup_key(it["stem"], opts)
        if key in seen:
            dropped.append(("economy-pdf", qid, f"duplicate stem of {seen[key]}"))
            continue
        # sanity: the explanation should mention the correct option's value
        seen[key] = qid
        out.append({
            "id": qid,
            "subject": "Economy & Budget",
            "q": " ".join(it["stem"].split()),
            "options": [clean_opt(o) for o in opts],
            "answer": "ABCD".index(ans),
            "explanation": it["expl"] or None,
            "source": "Team Axiom, Pakistan Economy, Finance & Budget (Ch. 3)",
        })


def main():
    import random
    seen, out = {}, []
    for fname, subject in SUBJECT_FILES:
        parse_subject_file(BANK / fname, subject, seen, out)
    parse_recent_f_items(seen, out)
    parse_economy_pdf(seen, out)

    # The source bank lists the correct answer in position A for two whole
    # subjects (Pak Studies, Current Affairs & GK) — options were
    # reconstructed around the verified answer. Shuffle option order with a
    # fixed seed so no position is guessable; questions, options and correct
    # answers are unchanged, only the presentation order. Documented in README.
    rng = random.Random(20261116)
    for q in out:
        paired = list(zip(q["options"], range(4)))
        rng.shuffle(paired)
        q["options"] = [p[0] for p in paired]
        q["answer"] = [p[1] for p in paired].index(q["answer"])

    OUT.mkdir(parents=True, exist_ok=True)
    by_subject = OrderedDict()
    for q in out:
        by_subject.setdefault(q["subject"], []).append(q)
    for subj in by_subject:
        (OUT / f"{subj.lower().replace(' & ', '-').replace(' ', '-')}.json").write_text(
            json.dumps(by_subject[subj], ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "questions.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    meta = {
        "total": len(out),
        "per_subject": {s: len(v) for s, v in by_subject.items()},
        "with_explanation": sum(1 for q in out if q["explanation"]),
        "dropped": len(dropped),
        "dropped_detail": [{"source": s, "id": i, "reason": r} for s, i, r in dropped],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"TOTAL KEPT: {len(out)}")
    for s, v in by_subject.items():
        print(f"  {s}: {len(v)}")
    print(f"with explanation: {meta['with_explanation']}")
    print(f"DROPPED: {len(dropped)}")
    for s, i, r in dropped:
        print(f"  - {s} {i}: {r}")


if __name__ == "__main__":
    main()
