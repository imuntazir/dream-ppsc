# Dream PPSC

**Free PPSC / FPSC / one-paper exam preparation for Pakistan. No account, no ads, no fees, no tracking.**

**Live demo:** https://imuntazir.github.io/dream-ppsc/ (once GitHub Pages is enabled)

**5,592 verified past-paper MCQs**, a real 100-question timed mock, a wrong-answer revision list, a daily challenge, search across every question, and a progress dashboard — in a single offline-capable web app. Open it once and it keeps working without internet. Your progress stays on your own device (localStorage); nothing is uploaded anywhere.

## Who it helps

Anyone in Pakistan preparing for a one-paper MCQ exam — PPSC Assistant (BPS-16) first of all, plus FPSC, PMS, NTS and other commission posts that use the same 100-question pattern (English, Urdu, Islamiat, Pak Studies, Current Affairs & GK, Everyday Science, Computer, Maths). A student in Lahore with a slow connection can open it once on Wi-Fi and practise offline on the bus.

## Features

- **Practice by subject** — instant feedback after every answer, with an explanation where one is available. Wrong answers go to your Revision list automatically.
- **Mock test** — 100 questions in 90 minutes, exactly like the real PPSC Assistant paper: English 20, Urdu 10, Islamiat 10, Pak Studies 10, Current Affairs & GK 20, Everyday Science 10, Computer 10, Math 10. Scoring: correct +1, wrong −0.25, skipped 0. Question palette, mark-for-review, auto-submit at 00:00, per-subject breakdown and full answer review.
- **Revision** — a queue of everything you ever got wrong. Answer one correctly and it leaves the list.
- **Daily challenge** — 10 questions, one from every subject, the same 10 for everyone each day.
- **Search** — search all 5,592 questions by stem or option.
- **Dashboard** — total attempted, overall accuracy, accuracy by subject, day streak, best mock score.
- **Dark / light mode**, responsive mobile-first layout, installable PWA (works offline after the first load).

## Question bank — 5,592 questions

| Subject | Questions |
|---|---|
| English | 1519 |
| Urdu | 683 |
| Islamiat | 774 |
| Pak Studies | 888 |
| Current Affairs & GK | 646 |
| Everyday Science | 657 |
| Computer | 277 |
| Math | 116 |
| Economy & Budget | 32 |
| **Total** | **5,592** |

4,383 questions carry a short explanation. Every question cites its source in the app.

## Where the questions come from

The bank was compiled from **verified PPSC past papers** — Assistant (BS-16) clubbed papers 24-11-2024 (morning + evening, S&GAD + Punjab Police), the 27-04-2025 clubbed paper (ID-117), the 04-10-2026 Assistant evening paper, the 2018 Livestock paper, plus Sub-Inspector / ASI / Junior Clerk / Excise papers and the standard reference banks (SP Bakshi *Objective General English*, HowTests one-word substitution, HowTests PPSC science/computer/math compilations). The 30 Economy & Budget questions come from Team Axiom's *Pakistan Economy, Finance & Budget* chapter notes (Federal Budgets FY26–FY27, Economic Survey 2025-26, SBP policy rate, IMF programme).

**What was left out, and why:** 99 items were dropped during the original parsing, and every one was listed in `data/meta.json`. In the November 2026 expansion, 88 of those 99 were individually re-verified against citable sources (standard references, Britannica, Wikipedia, official records) and rescued into the bank; 2 more turned out to duplicate questions already in the bank and were dropped as duplicates. Only **11 items remain unverified** and are still excluded — U55, U169, F57, F62, F65, F86, F103, F167, M56, S97, S200 — each with its reason in `data/meta.json` (`dropped_detail`).
- Nothing was invented: no question, option, correct answer or explanation was made up. Items whose answer could not be verified were dropped, not guessed.

**November 2026 expansion (1,454 → 5,592):** +86 rescued items from the originally dropped list (Source A) and +4,052 items from the 45 daily PPSC study sets, Days 1–45 (Source B), each verified when compiled. New items were deduplicated against the existing bank and each other by normalised stem, had their options shuffled with fixed seed `20261116`, and were given IDs continuing the per-subject scheme (see `tools/merge_sources.py` for the merge script and `tools/merge-report.json` for the audit trail). A further web pass for more past-paper MCQs (Source C) was skipped: the sources found were SEO content farms, memory-based papers and a copyrighted commercial book, none offering per-item verifiable answers.

**One data fix worth knowing:** in the source bank, the Pak Studies and Current Affairs & GK files list the correct answer in position A for *every* item (options were reconstructed around the verified answer). Shipping that would make the app gameable — always pick A. So the parser shuffles option order with a fixed seed (`tools/parse_bank.py`); questions, options and correct answers are unchanged, only the presentation order. The app also re-shuffles options at the start of every practice/mock session, so positions vary from attempt to attempt. The shipped answer distribution is A 1,356 / B 1,409 / C 1,423 / D 1,404.

**Freshness warning:** current-affairs answers were verified as of October 2026 (e.g. Field Marshal promotion 20 May 2025, FY26/FY27 budget figures). Office-holders, rates and figures change — check the latest facts before your exam.

## Why this exists (the gap)

Free MCQ banks for PPSC/FPSC already exist (PakMCQs, QuizWing, SmartPrep, OnePaperPreparation) — but they are ad-heavy, crowd-sourced with known errors and no source citation, and none is open source. The best timed-mock site (MockCSS) caps free mocks at 3/month and charges PKR 2,000/month after that. No free site offers a wrong-answer revision system, no Urdu-script question bank, and no installable offline web app. **Dream PPSC** is the free, open-source, offline answer to exactly that: verified questions with sources, unlimited exact-pattern mocks, and revision driven by your own mistakes — starting with PPSC Assistant (BPS-16).

## How to run locally

No build step, no dependencies. Serve the folder with any static server (a plain `file://` open will fail to load `data/questions.json`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

```
index.html            app shell
styles.css            light/dark, mobile-first styles
app.js                the whole app (no framework, no dependencies)
sw.js                 service worker — offline-first
manifest.webmanifest  PWA manifest
icon-192.svg / icon-512.svg
data/
  questions.json      all 5,592 questions (one file, ~1.8 MB)
  <subject>.json      per-subject splits
  meta.json           counts + the full dropped-items list
tools/
  parse_bank.py       the bank parser (reproducible: bank md -> JSON)
```

## How to contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contributions are: corrections to any question (with a citable source), new *verified* past-paper questions, and better explanations. Every new question must cite its paper (post + year) and must not be invented.

## Licence

MIT — see [LICENSE](LICENSE). Free to use, copy, modify and share.
