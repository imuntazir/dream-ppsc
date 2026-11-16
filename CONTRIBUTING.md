# Contributing to Muft Tayyari

Thank you — this project only stays trustworthy if the community checks it.

## The one rule

**Never invent a question, an option, a correct answer or an explanation.**
Every question must come from a real past paper or a citable reference, with
the source named. If an answer cannot be verified, the question does not go in.

## What helps most

1. **Corrections** — a wrong answer or a wrong explanation, with a citable
   source (past paper with post + year, official site, standard textbook).
   Open an issue or a pull request naming the question ID (e.g. `P63`) and
   the source.
2. **New verified questions** — from real PPSC / FPSC / NTS past papers.
   Add them to `tools/parse_bank.py`'s source files in the same one-line
   format (`**ID.** stem A) … B) … C) … D) … | Ans: X | [source]`), then
   re-run the parser so `data/questions.json` regenerates.
3. **Better explanations** — short, one-line, factual. No invented detail.
4. **Code** — the app is vanilla HTML/CSS/JS with no dependencies. Keep it
   that way: no frameworks, no build step, no tracking, no backend.

## Rebuilding the data

```sh
python3 tools/parse_bank.py
```

The parser drops anything flagged UNVERIFIED, anything without a parseable
answer, and any duplicate stem. It prints the kept/dropped counts — check
them before committing. The option shuffle uses a fixed seed so the output
is reproducible.

## Running the app

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Test the flows you touched: start a practice session, answer a few
questions, submit a mock, check the revision list, search, and switch the
theme. The service worker caches aggressively — hard-reload (Ctrl+Shift+R)
after changing `sw.js` or `data/questions.json`.

## Style

- Keep the UI in plain English; question text stays exactly as the source
  gives it (Roman Urdu for Urdu questions).
- No placeholder text, no fake buttons, no dead links. Every visible
  control must work.
