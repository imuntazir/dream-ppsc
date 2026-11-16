#!/usr/bin/env python3
"""Merge Source A (88 rescued UNVERIFIED items) and Source B (4,052 daily-study
items) into the Dream PPSC question bank.

One-shot audit script for the November 2026 expansion (1,454 -> 5,592).
It asserts the pre-merge bank is exactly the original 1,454, so it is NOT
re-runnable after the merge; kept for reproducibility/audit only.

Rules:
- Existing 1,454 items are kept untouched, in order, unshuffled.
- Dedupe new items by normalised stem (lowercase, punctuation/whitespace stripped)
  against the existing bank AND across sources; keep first occurrence.
- Shuffle options of NEW items only, fixed seed 20261116, remapping answer.
- New IDs continue the existing per-subject prefix scheme from each prefix's
  current max (E, U, I, P, CA, S, C, M, EC).
- Regenerate per-subject JSONs and meta.json from the merged bank.
"""
import json
import random
import re
from collections import Counter, OrderedDict
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent  # project root (Dream PPSC)
DATA = PROJ / "data"
TMP = Path("/tmp/dream-ppsc")
SEED = 20261116

PREFIX = {
    "English": "E",
    "Urdu": "U",
    "Islamiat": "I",
    "Pak Studies": "P",
    "Current Affairs & GK": "CA",
    "Everyday Science": "S",
    "Computer": "C",
    "Math": "M",
    "Economy & Budget": "EC",
}

STILL_DROPPED = ["U55", "U169", "F57", "F62", "F65", "F86", "F103", "F167",
                 "M56", "S97", "S200"]
DROPPED_REASONS = {
    "U55": "no source identifies the san'at for 'Booye gul le gai'",
    "U169": "malformed - note about U168 with no 4 options of its own",
    "F57": "ambiguous - both Drive and Dropbox are cloud storage services",
    "F62": "no confirmation of correct verb form for 'paanch man gehon'",
    "F65": "no author found for 'Gang Shahzadi'",
    "F86": "ambiguous phrasal verb ('balance up' not standard)",
    "F103": "Faiz's core poetic elements ambiguous across exam banks, no consensus",
    "F167": "no official 'Chinese Culture Day 2026' theme exists - dubious recall",
    "M56": "inconsistent/mistyped math (no positive solution)",
    "S97": "no correct option among the four (ozone-depleting substances are CFCs)",
    "S200": "malformed True/False item with no 4 options",
}
DROPPED_SOURCES = {
    "U55": "ppsc-bank-urdu.md", "U169": "ppsc-bank-urdu.md",
    "F57": "ppsc-recent-papers-bank.md", "F62": "ppsc-recent-papers-bank.md",
    "F65": "ppsc-recent-papers-bank.md", "F86": "ppsc-recent-papers-bank.md",
    "F103": "ppsc-recent-papers-bank.md", "F167": "ppsc-recent-papers-bank.md",
    "M56": "ppsc-bank-math.md",
    "S97": "ppsc-bank-science.md", "S200": "ppsc-bank-science.md",
}


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^\w\s]", "", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def norm_opt(s: str) -> str:
    # options may legitimately differ only by punctuation (e.g. "(!)" vs "(?)",
    # "+109 kg" vs "109 kg", "V = IR" vs "V = I/R"), so only case/whitespace
    # are normalised here — punctuation is meaningful.
    return re.sub(r"\s+", " ", s.lower()).strip()


def validate(item, where, strict=True):
    opts = item["options"]
    assert len(opts) == 4, f"{where}: not 4 options"
    assert all(isinstance(o, str) and o.strip() for o in opts), f"{where}: empty option"
    if strict:
        assert len({norm_opt(o) for o in opts}) == 4, f"{where}: duplicate options"
    else:
        # existing bank: a few items legitimately differ only by case
        # (e.g. U177 spelling question); exact duplicates only.
        assert len(set(opts)) == 4, f"{where}: duplicate options"
    assert item["answer"] in (0, 1, 2, 3), f"{where}: answer out of range"
    assert item["q"].strip(), f"{where}: empty stem"
    assert item["subject"] in PREFIX, f"{where}: unknown subject {item['subject']}"


def main():
    existing = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))
    assert len(existing) == 1454, f"expected 1454 existing, got {len(existing)}"
    for it in existing:
        validate(it, it["id"], strict=False)

    seen_stems = {norm(it["q"]): it["id"] for it in existing}
    existing_ids = {it["id"] for it in existing}
    assert not (existing_ids & set(STILL_DROPPED)), "still-dropped ID present in bank!"

    # current max per prefix
    max_num = {}
    for it in existing:
        m = re.match(r"^([A-Za-z]+)(\d+)$", it["id"])
        prefix, num = m.group(1), int(m.group(2))
        max_num[prefix] = max(max_num.get(prefix, 0), num)

    src_a = json.loads((TMP / "source-a-added.json").read_text(encoding="utf-8"))
    src_b = json.loads((TMP / "source-b-added.json").read_text(encoding="utf-8"))

    # ---- Source A: dedupe vs existing AND vs Source B ----
    b_stems = {norm(it["q"]) for it in src_b}
    a_kept, a_dupes = [], []
    for it in src_a:
        k = norm(it["q"])
        if k in seen_stems:
            a_dupes.append((it.get("bank_id"), "dup of existing " + seen_stems[k]))
        elif k in b_stems:
            a_dupes.append((it.get("bank_id"), "dup of Source B item"))
        else:
            a_kept.append(it)

    # ---- Source B: belt-and-braces re-check vs existing (+ vs kept A) ----
    b_kept, b_dupes = [], []
    for it in src_b:
        k = norm(it["q"])
        if k in seen_stems:
            b_dupes.append(("B", it["q"][:60], "dup of existing " + seen_stems[k]))
        else:
            b_kept.append(it)

    new_items = a_kept + b_kept
    for it in new_items:
        validate(it, it.get("bank_id", it["q"][:40]))

    # ---- Shuffle options of NEW items only, fixed seed ----
    rng = random.Random(SEED)
    for it in new_items:
        correct = it["options"][it["answer"]]
        opts = list(it["options"])
        rng.shuffle(opts)
        it["options"] = opts
        it["answer"] = opts.index(correct)

    # ---- Assign IDs continuing per-subject scheme ----
    counters = dict(max_num)
    for it in new_items:
        prefix = PREFIX[it["subject"]]
        while True:
            counters[prefix] = counters.get(prefix, 0) + 1
            new_id = f"{prefix}{counters[prefix]}"
            if new_id not in STILL_DROPPED:
                break
        assert new_id not in existing_ids, f"ID collision: {new_id}"
        it["id"] = new_id
        existing_ids.add(new_id)

    # ---- Build merged bank (existing first, untouched order) ----
    merged = existing + [
        {"id": it["id"], "subject": it["subject"], "q": it["q"],
         "options": it["options"], "answer": it["answer"],
         "explanation": it.get("explanation"),
         "source": it.get("source", "PPSC bank")}
        for it in new_items
    ]

    # final integrity checks
    assert len(merged) == len({it["id"] for it in merged}), "duplicate IDs"
    # NOTE: the existing bank itself contains a few same-stem groups that are
    # legitimately distinct (E176-E192 spelling items share a generic stem,
    # C108/C109 differ only by ] vs [), so this check covers NEW items only.
    new_stems = [norm(it["q"]) for it in merged[len(existing):]]
    assert len(set(new_stems)) == len(new_stems), "duplicate stems among new items"
    assert not (set(new_stems) & set(seen_stems)), "new stem duplicates existing"
    for it in merged:
        # new items were strictly validated pre-shuffle; existing bank items
        # legitimately differ only by case/punctuation in a few cases (U177 etc.)
        validate(it, it["id"], strict=False)
    assert not any(it["id"] in STILL_DROPPED for it in merged)
    assert not any("UNVERIFIED" in json.dumps(it) for it in merged)

    # ---- Write questions.json ----
    (DATA / "questions.json").write_text(
        json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- Per-subject JSONs ----
    by_subject = OrderedDict()
    for it in merged:
        by_subject.setdefault(it["subject"], []).append(it)
    for subj, items in by_subject.items():
        fname = subj.lower().replace(" & ", "-").replace(" ", "-") + ".json"
        (DATA / fname).write_text(
            json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- meta.json ----
    per_subject = {s: len(v) for s, v in by_subject.items()}
    with_expl = sum(1 for it in merged if it.get("explanation"))
    meta = {
        "total": len(merged),
        "per_subject": per_subject,
        "with_explanation": with_expl,
        "dropped": len(STILL_DROPPED),
        "dropped_detail": [
            {"source": DROPPED_SOURCES[i], "id": i, "reason": DROPPED_REASONS[i]}
            for i in STILL_DROPPED
        ],
        "sources": {
            "original_bank": 1454,
            "source_a_rescued": len(a_kept),
            "source_b_daily_study_days_1_45": len(b_kept),
            "source_c": 0,
        },
        "notes": ("88 of the original 99 UNVERIFIED-flagged items were verified and "
                  "rescued as Source A; 11 remain unverified (see dropped_detail). "
                  "Source B: 45 daily PPSC study JSONs (Days 1-45)."),
    }
    (DATA / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    report = {
        "existing": 1454,
        "source_a_total": len(src_a),
        "source_a_kept": len(a_kept),
        "source_a_dupes": a_dupes,
        "source_b_total": len(src_b),
        "source_b_kept": len(b_kept),
        "source_b_dupes": b_dupes,
        "merged_total": len(merged),
        "per_subject": per_subject,
        "with_explanation": with_expl,
        "seed": SEED,
    }
    (TMP / "merge-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
