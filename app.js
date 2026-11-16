/* Muft Tayyari — free PPSC / FPSC exam preparation.
   Static PWA. All progress lives in localStorage on the user's own device.
   Questions: 1,454 verified past-paper MCQs (data/questions.json). */
'use strict';

const SUBJECTS = [
  { key: 'English', short: 'English', color: '#2563eb' },
  { key: 'Urdu', short: 'Urdu', color: '#7c3aed' },
  { key: 'Islamiat', short: 'Islamiat', color: '#0b6e4f' },
  { key: 'Pak Studies', short: 'Pak Studies', color: '#b45309' },
  { key: 'Current Affairs & GK', short: 'CA & GK', color: '#be185d' },
  { key: 'Everyday Science', short: 'Science', color: '#0891b2' },
  { key: 'Computer', short: 'Computer', color: '#4d7c0f' },
  { key: 'Math', short: 'Math', color: '#dc2626' },
  { key: 'Economy & Budget', short: 'Economy', color: '#6d28d9' },
];
const SUBJECT_BY_KEY = Object.fromEntries(SUBJECTS.map(s => [s.key, s]));
/* Real PPSC Assistant one-paper pattern: 100 MCQs, 90 minutes.
   CA (10) + GK (10) are combined into one bank subject, so 20 here. */
const MOCK_MIX = {
  'English': 20, 'Urdu': 10, 'Islamiat': 10, 'Pak Studies': 10,
  'Current Affairs & GK': 20, 'Everyday Science': 10, 'Computer': 10, 'Math': 10,
};
const MOCK_MINUTES = 90;
const NEGATIVE = 0.25;
const STORE_KEY = 'mt-v1';

let QUESTIONS = [];
let BY_ID = {};
let BY_SUBJECT = {};
let view = 'home';
let session = null;   // active practice / revision / daily quiz
let mock = null;      // active mock test
let searchQuery = '';

/* ---------- utils ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  const r = rnd || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function todayStr(d) {
  const t = d || new Date();
  const y = t.getFullYear(), m = String(t.getMonth() + 1).padStart(2, '0'), dd = String(t.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* ---------- storage ---------- */
function defaultStore() {
  return { attempts: {}, revision: [], mocks: [], daily: {}, dates: [], theme: 'light' };
}
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultStore();
    const s = JSON.parse(raw);
    return Object.assign(defaultStore(), s);
  } catch (e) { return defaultStore(); }
}
let store = loadStore();
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
}
function recordAttempt(qid, correct) {
  const a = store.attempts[qid] || { a: 0, c: 0 };
  a.a += 1; if (correct) a.c += 1;
  store.attempts[qid] = a;
  const d = todayStr();
  if (!store.dates.includes(d)) store.dates.push(d);
  saveStore();
}
function addRevision(qid) {
  if (!store.revision.includes(qid)) { store.revision.push(qid); saveStore(); }
}
function removeRevision(qid) {
  const i = store.revision.indexOf(qid);
  if (i >= 0) { store.revision.splice(i, 1); saveStore(); }
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', store.theme || 'light');
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = (store.theme === 'dark') ? '☀️' : '🌙';
}
function toggleTheme() {
  store.theme = (store.theme === 'dark') ? 'light' : 'dark';
  saveStore(); applyTheme();
}

/* ---------- stats ---------- */
function computeStats() {
  let attempted = 0, correct = 0;
  const per = {};
  for (const s of SUBJECTS) per[s.key] = { a: 0, c: 0 };
  for (const [qid, v] of Object.entries(store.attempts)) {
    const q = BY_ID[qid];
    if (!q) continue;
    attempted += v.a; correct += v.c;
    per[q.subject].a += v.a; per[q.subject].c += v.c;
  }
  // streak: consecutive days ending today (or yesterday if today untouched)
  const dates = new Set(store.dates);
  let streak = 0;
  const d = new Date();
  if (!dates.has(todayStr(d))) d.setDate(d.getDate() - 1);
  while (dates.has(todayStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  const best = store.mocks.reduce((m, x) => Math.max(m, x.score), 0);
  return { attempted, correct, acc: attempted ? Math.round(100 * correct / attempted) : 0, per, streak, best, mocks: store.mocks.length };
}

/* ---------- navigation ---------- */
function go(v) {
  if (mock && mock.active && v !== 'mock') {
    if (!confirm('A mock test is in progress. Leaving now will abandon it. Leave?')) return;
    stopMockTimer();
    mock = null;
  }
  if (session && v !== 'practice' && v !== 'revision' && v !== 'daily') session = null;
  view = v;
  document.querySelectorAll('#mainnav button').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === v);
  });
  window.scrollTo(0, 0);
  render();
}
function render() {
  const app = document.getElementById('app');
  updateRevBadge();
  if (view === 'home') return renderHome(app);
  if (view === 'practice') return renderPractice(app);
  if (view === 'mock') return renderMock(app);
  if (view === 'revision') return renderRevision(app);
  if (view === 'daily') return renderDaily(app);
  if (view === 'search') return renderSearch(app);
}
function updateRevBadge() {
  const b = document.getElementById('revBadge');
  if (!b) return;
  const n = store.revision.length;
  b.hidden = n === 0;
  b.textContent = n;
}

/* ---------- home ---------- */
function renderHome(app) {
  const st = computeStats();
  const subjCards = SUBJECTS.map(s => {
    const n = (BY_SUBJECT[s.key] || []).length;
    const p = st.per[s.key];
    const acc = p.a ? Math.round(100 * p.c / p.a) : null;
    return `<div class="subj-card" onclick="startPractice('${esc(s.key)}')">
      <h3>${esc(s.short)}</h3>
      <div class="count">${n} questions</div>
      <div class="accbar"><div style="width:${acc == null ? 0 : acc}%"></div></div>
      <div class="acc-label">${acc == null ? 'Not attempted yet' : acc + '% correct · ' + p.a + ' attempted'}</div>
    </div>`;
  }).join('');
  app.innerHTML = `
    <div class="hero">
      <h1>Muft Tayyari 🎓</h1>
      <p class="big"><b>${QUESTIONS.length.toLocaleString()}</b> verified past-paper MCQs — free forever.</p>
      <p>Practice subject-wise, take a real 100-question timed mock, revise only what you got wrong, and take the daily challenge. No account, no ads, no fees.</p>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="go('mock')">⏱️ Take a Mock Test</button>
        <button class="btn btn-ghost" style="background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.4)" onclick="go('daily')">📅 Today's Challenge</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${st.attempted}</div><div class="lbl">Questions attempted</div></div>
      <div class="stat"><div class="num">${st.acc}%</div><div class="lbl">Overall accuracy</div></div>
      <div class="stat"><div class="num">${st.streak} 🔥</div><div class="lbl">Day streak</div></div>
      <div class="stat"><div class="num">${st.best > 0 ? st.best.toFixed(2) : '—'}</div><div class="lbl">Best mock score / 100</div></div>
    </div>
    <h2>Practice by subject</h2>
    <div class="subj-grid">${subjCards}</div>
    <div class="card">
      <h3 style="margin-top:0">How the mock works</h3>
      <p class="small">100 questions in 90 minutes, exactly like a PPSC Assistant one-paper test — English 20, Urdu 10, Islamiat 10, Pak Studies 10, Current Affairs &amp; GK 20, Everyday Science 10, Computer 10, Math 10. Correct answer +1, wrong answer −0.25, skipped 0. Your best score is saved on this device.</p>
      <div class="btn-row"><button class="btn btn-primary" onclick="go('mock')">Start a mock test</button></div>
    </div>`;
}

/* ---------- practice ---------- */
function renderPractice(app) {
  if (session && session.mode === 'practice') return renderQuiz(app);
  const chips = SUBJECTS.map(s => {
    const n = (BY_SUBJECT[s.key] || []).length;
    return `<button class="chip" onclick="startPractice('${esc(s.key)}')">${esc(s.short)} · ${n}</button>`;
  }).join('');
  app.innerHTML = `
    <h1>📚 Practice</h1>
    <p class="muted">Pick a subject. You get instant feedback after every answer, with an explanation where one is available. Wrong answers go to your Revision list automatically.</p>
    <div class="chip-row">${chips}</div>
    <div class="card">
      <h3 style="margin-top:0">How many questions?</h3>
      <p class="small">Choose a subject above to start a 20-question session, or pick a custom length:</p>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="startPractice(null,10)">10 questions</button>
        <button class="btn btn-ghost" onclick="startPractice(null,20)">20 questions</button>
        <button class="btn btn-ghost" onclick="startPractice(null,30)">30 questions</button>
      </div>
      <p class="small muted">Custom length picks questions from all subjects, mixed.</p>
    </div>`;
}
function startPractice(subject, count) {
  let pool;
  if (subject) {
    pool = (BY_SUBJECT[subject] || []).slice();
    if (!pool.length) return;
    pool = shuffle(pool);
  } else {
    pool = shuffle(QUESTIONS.slice());
  }
  const n = Math.min(count || 20, pool.length);
  const list = pool.slice(0, n).map(prepareQuestion);
  session = {
    mode: 'practice', title: subject ? subject + ' practice' : 'Mixed practice',
    list, idx: 0, answers: {}, correct: 0, done: false,
  };
  view = 'practice';
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'practice'));
  render();
  window.scrollTo(0, 0);
}
function prepareQuestion(q) {
  // Shuffle this question's options for this session so positions vary.
  const order = shuffle([0, 1, 2, 3]);
  return {
    id: q.id, subject: q.subject, q: q.q,
    options: order.map(i => q.options[i]),
    answer: order.indexOf(q.answer),
    explanation: q.explanation, source: q.source,
  };
}

/* ---------- quiz engine (practice / revision / daily) ---------- */
function renderQuiz(app) {
  const s = session;
  if (!s) return go('home');
  if (s.done) return renderQuizSummary(app);
  const q = s.list[s.idx];
  const answered = Object.prototype.hasOwnProperty.call(s.answers, s.idx);
  const picked = s.answers[s.idx];
  const opts = q.options.map((o, i) => {
    let cls = '';
    if (answered) {
      if (i === q.answer) cls = 'correct';
      else if (i === picked) cls = 'wrong';
      else cls = 'dim';
    }
    return `<button class="opt ${cls}" ${answered ? 'disabled' : ''} onclick="answerOption(${i})"><span class="key">${'ABCD'[i]}</span>${esc(o)}</button>`;
  }).join('');
  let fb = '';
  if (answered) {
    const ok = picked === q.answer;
    fb = `<div class="feedback ${ok ? 'good' : 'bad'}">${ok
      ? '✅ Correct!'
      : '❌ Wrong. The correct answer is <b>' + 'ABCD'[q.answer] + ') ' + esc(q.options[q.answer]) + '</b>.'}</div>`
      + (q.explanation ? `<div class="expl"><b>Why:</b> ${esc(q.explanation)}</div>` : '')
      + `<p class="src">Source: ${esc(q.source || 'PPSC bank')} · Q ${esc(q.id)}</p>`;
  }
  app.innerHTML = `
    <div class="q-meta"><span>${esc(s.title)}</span><span>Question ${s.idx + 1} of ${s.list.length}</span></div>
    <div class="progress"><div style="width:${Math.round(100 * (s.idx + (answered ? 1 : 0)) / s.list.length)}%"></div></div>
    <div class="card">
      <div class="q-meta"><span>${esc(q.subject)}</span><span>${esc(q.id)}</span></div>
      <div class="q-text">${esc(q.q)}</div>
      ${opts}
      ${fb}
      <div class="btn-row">
        ${answered
          ? `<button class="btn btn-primary" onclick="nextQuiz()">${s.idx + 1 === s.list.length ? 'See results ✓' : 'Next question →'}</button>`
          : `<span class="kbd-hint">Tap an answer to check it.</span>`}
        <button class="btn btn-ghost" onclick="endSessionEarly()">End session</button>
      </div>
    </div>`;
}
function answerOption(i) {
  const s = session;
  if (!s || s.done) return;
  if (Object.prototype.hasOwnProperty.call(s.answers, s.idx)) return;
  const q = s.list[s.idx];
  s.answers[s.idx] = i;
  const ok = i === q.answer;
  if (ok) s.correct++;
  recordAttempt(q.id, ok);
  if (!ok) addRevision(q.id); else removeRevision(q.id);
  render();
}
function nextQuiz() {
  const s = session;
  if (!s) return;
  if (s.idx + 1 >= s.list.length) { finishSession(); return; }
  s.idx++;
  render();
}
function endSessionEarly() {
  if (confirm('End this session now? Questions you already answered stay recorded.')) finishSession();
}
function finishSession() {
  const s = session;
  if (!s) return;
  s.done = true;
  if (s.mode === 'daily') {
    store.daily[s.date] = { c: s.correct, t: s.list.length };
    saveStore();
  }
  render();
  window.scrollTo(0, 0);
}
function renderQuizSummary(app) {
  const s = session;
  const total = s.list.length;
  const pct = total ? Math.round(100 * s.correct / total) : 0;
  s.list.forEach((q, i) => { q._picked = s.answers[i]; });
  const wrongList = s.list.filter(q => q._picked !== q.answer);
  const msg = pct >= 80 ? 'Outstanding! 🌟' : pct >= 60 ? 'Good work — keep going! 💪' : pct >= 40 ? 'Getting there — revise the ones below. 📖' : 'Keep practising — every attempt makes the next one easier. 🌱';
  app.innerHTML = `
    <h1>${esc(s.title)} — Results</h1>
    <div class="card" style="text-align:center">
      <div class="score-big">${s.correct} / ${total}</div>
      <p><b>${pct}%</b> correct</p>
      <p>${msg}</p>
      ${wrongList.length ? `<p class="small">${wrongList.length} question${wrongList.length > 1 ? 's' : ''} added to your <b>Revision</b> list.</p>` : '<p class="small">Nothing to revise — a perfect round! 🎉</p>'}
      <div class="btn-row">
        <button class="btn btn-primary" onclick="retrySession()">↻ Try again</button>
        <button class="btn btn-ghost" onclick="go('revision')">🔁 Go to Revision (${store.revision.length})</button>
        <button class="btn btn-ghost" onclick="go('home')">🏠 Home</button>
      </div>
    </div>
    ${wrongList.length ? '<h2>Review your mistakes</h2>' + wrongList.map(q => reviewItem(q, q._picked)).join('') : ''}`;
}
function retrySession() {
  const s = session;
  if (!s) return;
  const fresh = s.list.map(q => {
    const orig = BY_ID[q.id];
    return prepareQuestion(orig);
  });
  session = Object.assign({}, s, { list: shuffle(fresh), idx: 0, answers: {}, correct: 0, done: false });
  render();
}
function reviewItem(q, picked) {
  const opts = q.options.map((o, i) => {
    let cls = '';
    if (i === q.answer) cls = 'correct';
    else if (i === picked) cls = 'wrong';
    else cls = 'dim';
    return `<button class="opt ${cls}" disabled><span class="key">${'ABCD'[i]}</span>${esc(o)}</button>`;
  }).join('');
  return `<div class="review-item ${picked === q.answer ? 'right-q' : 'wrong-q'}">
    <div class="q-meta"><span>${esc(q.subject)}</span><span>${esc(q.id)}</span></div>
    <div class="q-text" style="font-size:16px">${esc(q.q)}</div>
    ${opts}
    ${q.explanation ? `<div class="expl"><b>Why:</b> ${esc(q.explanation)}</div>` : ''}
    <p class="src">Source: ${esc(q.source || 'PPSC bank')}</p>
  </div>`;
}

/* ---------- revision ---------- */
function renderRevision(app) {
  if (session && session.mode === 'revision') return renderQuiz(app);
  const n = store.revision.length;
  if (!n) {
    app.innerHTML = `<h1>🔁 Revision</h1>
      <div class="empty"><span class="big-emoji">🎉</span>
      <p><b>Nothing to revise!</b></p>
      <p>Every question you answer wrong is added here automatically.<br>Answer one correctly and it leaves the list.</p>
      <div class="btn-row"><button class="btn btn-primary" onclick="go('practice')">Start practising</button></div></div>`;
    return;
  }
  const sample = store.revision.slice(0, 3).map(id => BY_ID[id]).filter(Boolean)
    .map(q => `<li>${esc(q.q)}</li>`).join('');
  app.innerHTML = `
    <h1>🔁 Revision</h1>
    <div class="card">
      <p><b>${n} question${n > 1 ? 's' : ''}</b> waiting — these are the ones you got wrong before.</p>
      <p class="small muted">Answer one correctly and it leaves the list. Get it wrong and it stays for another round.</p>
      <ul class="small">${sample}</ul>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="startRevision()">Start revision (${n})</button>
        <button class="btn btn-ghost" onclick="clearRevision()">Clear list</button>
      </div>
    </div>`;
}
function startRevision() {
  const ids = shuffle(store.revision.slice());
  const list = ids.map(id => prepareQuestion(BY_ID[id])).filter(q => q);
  if (!list.length) return;
  session = { mode: 'revision', title: 'Revision — your mistakes', list, idx: 0, answers: {}, correct: 0, done: false };
  view = 'revision';
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'revision'));
  render();
  window.scrollTo(0, 0);
}
function clearRevision() {
  if (confirm('Clear the whole revision list? Your attempt history stays, but the wrong-answer queue will be empty.')) {
    store.revision = [];
    saveStore();
    render();
  }
}

/* ---------- daily challenge ---------- */
function dailyQuestions(dateStr) {
  const rnd = mulberry32(hashStr('daily-' + dateStr));
  const mix = { 'English': 2, 'Urdu': 1, 'Islamiat': 1, 'Pak Studies': 1, 'Current Affairs & GK': 1, 'Everyday Science': 1, 'Computer': 1, 'Math': 1, 'Economy & Budget': 1 };
  const list = [];
  for (const [subj, n] of Object.entries(mix)) {
    const pool = shuffle(BY_SUBJECT[subj] || [], rnd).slice(0, n);
    list.push(...pool);
  }
  return shuffle(list, rnd).map(prepareQuestion);
}
function renderDaily(app) {
  if (session && session.mode === 'daily') return renderQuiz(app);
  const d = todayStr();
  const done = store.daily[d];
  const dateNice = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  app.innerHTML = `
    <h1>📅 Daily Challenge</h1>
    <p class="muted">${dateNice} — 10 questions, one from every subject. The same 10 for everyone, every day.</p>
    <div class="card">
      ${done
        ? `<p><b>Done for today!</b> You scored <b>${done.c} / ${done.t}</b>.</p>
           <p class="small">Come back tomorrow for a fresh set of 10.</p>`
        : `<p><b>10 questions</b> — 2 English, 1 each from Urdu, Islamiat, Pak Studies, CA &amp; GK, Science, Computer, Math and Economy.</p>
           <p class="small">Instant feedback after every answer, like practice mode.</p>`}
      <div class="btn-row">
        <button class="btn btn-primary" onclick="startDaily()">${done ? '↻ Play again' : "Start today's challenge"}</button>
        <button class="btn btn-ghost" onclick="go('mock')">Or take a full mock →</button>
      </div>
    </div>`;
}
function startDaily() {
  const d = todayStr();
  session = { mode: 'daily', date: d, title: 'Daily Challenge — ' + d, list: dailyQuestions(d), idx: 0, answers: {}, correct: 0, done: false };
  view = 'daily';
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'daily'));
  render();
  window.scrollTo(0, 0);
}

/* ---------- search ---------- */
function renderSearch(app) {
  const q = searchQuery;
  let results = '';
  if (q.trim().length >= 2) {
    const needle = q.trim().toLowerCase();
    const hits = QUESTIONS.filter(x =>
      x.q.toLowerCase().includes(needle) ||
      x.options.some(o => o.toLowerCase().includes(needle))
    ).slice(0, 50);
    results = hits.length
      ? `<p class="small muted">${hits.length} result${hits.length > 1 ? 's' : ''} (showing up to 50)</p>` + hits.map(x => `
        <div class="result-item" onclick="showQuestion('${x.id}')">
          <div class="q-meta"><span>${esc(x.subject)}</span><span>${esc(x.id)}</span></div>
          <div style="font-weight:600">${esc(x.q)}</div>
        </div>`).join('')
      : `<div class="empty">No questions match “${esc(q)}”.</div>`;
  } else if (q.trim()) {
    results = '<p class="muted">Type at least 2 characters to search.</p>';
  }
  app.innerHTML = `
    <h1>🔍 Search questions</h1>
    <p class="muted">Search all ${QUESTIONS.length.toLocaleString()} questions — stems and options.</p>
    <div class="search-box">
      <input id="searchInput" type="search" placeholder="e.g. Zakat, Arshad Nadeem, Ctrl+F7…" value="${esc(q)}" oninput="onSearchInput(this.value)">
      <button class="btn btn-primary" onclick="doSearch()">Search</button>
    </div>
    <div id="searchResults">${results}</div>`;
  const inp = document.getElementById('searchInput');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
function onSearchInput(v) {
  searchQuery = v;
  const needle = v.trim().toLowerCase();
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (needle.length < 2) { box.innerHTML = needle ? '<p class="muted">Type at least 2 characters to search.</p>' : ''; return; }
  const hits = QUESTIONS.filter(x =>
    x.q.toLowerCase().includes(needle) ||
    x.options.some(o => o.toLowerCase().includes(needle))
  ).slice(0, 50);
  box.innerHTML = hits.length
    ? `<p class="small muted">${hits.length} result${hits.length > 1 ? 's' : ''} (showing up to 50)</p>` + hits.map(x => `
      <div class="result-item" onclick="showQuestion('${x.id}')">
        <div class="q-meta"><span>${esc(x.subject)}</span><span>${esc(x.id)}</span></div>
        <div style="font-weight:600">${esc(x.q)}</div>
      </div>`).join('')
    : `<div class="empty">No questions match “${esc(v)}”.</div>`;
}
function doSearch() { render(); }
function showQuestion(id) {
  const q = BY_ID[id];
  if (!q) return;
  const app = document.getElementById('app');
  const opts = q.options.map((o, i) => {
    const cls = i === q.answer ? 'correct' : 'dim';
    return `<button class="opt ${cls}" disabled><span class="key">${'ABCD'[i]}</span>${esc(o)}</button>`;
  }).join('');
  app.innerHTML = `
    <button class="btn btn-ghost" onclick="go('search')">← Back to search</button>
    <div class="card" style="margin-top:12px">
      <div class="q-meta"><span>${esc(q.subject)}</span><span>${esc(q.id)}</span></div>
      <div class="q-text">${esc(q.q)}</div>
      ${opts}
      ${q.explanation ? `<div class="expl"><b>Why:</b> ${esc(q.explanation)}</div>` : ''}
      <p class="src">Source: ${esc(q.source || 'PPSC bank')} · Correct answer: <b>${'ABCD'[q.answer]}</b></p>
      <div class="btn-row"><button class="btn btn-primary" onclick="startPractice('${esc(q.subject)}')">Practice ${esc(q.subject)} →</button></div>
    </div>`;
  window.scrollTo(0, 0);
}

/* ---------- mock test ---------- */
function renderMock(app) {
  if (mock && mock.active) return renderMockTest(app);
  if (mock && mock.result) return renderMockResult(app);
  const mixRows = Object.entries(MOCK_MIX).map(([s, n]) =>
    `<tr><td>${esc(s)}</td><td class="num">${n}</td></tr>`).join('');
  app.innerHTML = `
    <h1>⏱️ Mock Test</h1>
    <p class="muted">A full PPSC Assistant one-paper simulation — 100 questions, 90 minutes, exactly like the real test.</p>
    <div class="card">
      <h3 style="margin-top:0">Paper pattern</h3>
      <table class="breakdown">${mixRows}<tr><td><b>Total</b></td><td class="num"><b>100</b></td></tr></table>
      <p class="small">Scoring: correct <b>+1</b> · wrong <b>−0.25</b> · skipped <b>0</b>. The timer auto-submits at 00:00. You can mark questions for review and jump between them with the palette.</p>
      ${store.mocks.length ? `<p class="small">Your best score so far: <b>${Math.max(...store.mocks.map(m => m.score)).toFixed(2)} / 100</b> (${store.mocks.length} mock${store.mocks.length > 1 ? 's' : ''} taken).</p>` : ''}
      <div class="btn-row"><button class="btn btn-primary" onclick="startMock()">Start mock test — 90:00</button></div>
    </div>
    ${store.mocks.length ? `<h2>Past mocks</h2>` + store.mocks.slice().reverse().slice(0, 5).map(m => `
      <div class="card"><b>${m.score.toFixed(2)} / 100</b> · ${m.correct} right, ${m.wrong} wrong, ${m.skipped} skipped
      <span class="muted">· ${new Date(m.ts).toLocaleDateString('en-GB')} ${new Date(m.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') : ''}`;
}
function buildMockList() {
  const list = [];
  for (const [subj, n] of Object.entries(MOCK_MIX)) {
    const pool = shuffle(BY_SUBJECT[subj] || []).slice(0, n);
    list.push(...pool);
  }
  return shuffle(list).map(prepareQuestion);
}
function startMock() {
  const list = buildMockList();
  if (list.length < 100) {
    alert('Not enough questions to build a full mock (' + list.length + '/100).');
    return;
  }
  mock = {
    active: true, list, idx: 0, answers: {}, marked: new Set(),
    startedAt: Date.now(), totalSec: MOCK_MINUTES * 60, timerId: null, result: null,
  };
  view = 'mock';
  document.querySelectorAll('#mainnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'mock'));
  startMockTimer();
  render();
  window.scrollTo(0, 0);
}
function mockRemaining() {
  if (!mock) return 0;
  return mock.totalSec - Math.floor((Date.now() - mock.startedAt) / 1000);
}
function startMockTimer() {
  stopMockTimer();
  mock.timerId = setInterval(() => {
    const el = document.getElementById('mockTimer');
    const left = mockRemaining();
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle('low', left <= 300);
    }
    if (left <= 0) submitMock(true);
  }, 1000);
}
function stopMockTimer() {
  if (mock && mock.timerId) { clearInterval(mock.timerId); mock.timerId = null; }
}
function renderMockTest(app) {
  const q = mock.list[mock.idx];
  const picked = mock.answers[mock.idx];
  const opts = q.options.map((o, i) => `
    <button class="opt ${picked === i ? 'correct' : ''}" onclick="mockAnswer(${i})"><span class="key">${'ABCD'[i]}</span>${esc(o)}</button>`).join('');
  const palette = mock.list.map((_, i) => {
    const cls = [
      mock.answers[i] !== undefined ? 'answered' : '',
      mock.marked.has(i) ? 'marked' : '',
      i === mock.idx ? 'current' : '',
    ].join(' ');
    return `<button class="${cls}" onclick="mockGoto(${i})">${i + 1}</button>`;
  }).join('');
  const answeredCount = Object.keys(mock.answers).length;
  app.innerHTML = `
    <div class="mockbar">
      <span class="timer" id="mockTimer">${fmtTime(mockRemaining())}</span>
      <span class="small"><b>${answeredCount} / ${mock.list.length}</b> answered · ${mock.marked.size} marked</span>
      <button class="btn btn-danger" style="padding:8px 14px" onclick="submitMock(false)">Submit test</button>
    </div>
    <div class="palette">${palette}</div>
    <div class="card">
      <div class="q-meta"><span>Q ${mock.idx + 1} of ${mock.list.length} · ${esc(q.subject)}</span><span>${esc(q.id)}</span></div>
      <div class="q-text">${esc(q.q)}</div>
      ${opts}
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="mockPrev()" ${mock.idx === 0 ? 'disabled' : ''}>← Previous</button>
        <button class="btn btn-ghost" onclick="mockMark()">${mock.marked.has(mock.idx) ? '★ Unmark' : '☆ Mark for review'}</button>
        <button class="btn btn-primary" onclick="mockNext()">${mock.idx + 1 === mock.list.length ? 'Review & submit' : 'Next →'}</button>
      </div>
      <p class="kbd-hint">Tap an option to answer. You can change it any time before submitting. Wrong answers cost −0.25.</p>
    </div>`;
}
function mockAnswer(i) {
  if (!mock || !mock.active) return;
  mock.answers[mock.idx] = i;
  render();
}
function mockGoto(i) { if (mock && mock.active) { mock.idx = i; render(); } }
function mockPrev() { if (mock && mock.idx > 0) { mock.idx--; render(); } }
function mockNext() {
  if (!mock) return;
  if (mock.idx + 1 >= mock.list.length) { render(); window.scrollTo(0, 0); return; }
  mock.idx++;
  render();
  window.scrollTo(0, 0);
}
function mockMark() {
  if (!mock) return;
  if (mock.marked.has(mock.idx)) mock.marked.delete(mock.idx); else mock.marked.add(mock.idx);
  render();
}
function submitMock(auto) {
  if (!mock || !mock.active) return;
  const unanswered = mock.list.length - Object.keys(mock.answers).length;
  if (!auto && unanswered > 0) {
    if (!confirm(unanswered + ' question' + (unanswered > 1 ? 's' : '') + ' unanswered. Submit anyway?')) return;
  }
  stopMockTimer();
  let correct = 0, wrong = 0, skipped = 0;
  const per = {};
  mock.list.forEach((q, i) => {
    const a = mock.answers[i];
    per[q.subject] = per[q.subject] || { c: 0, t: 0 };
    per[q.subject].t++;
    if (a === undefined) skipped++;
    else if (a === q.answer) { correct++; per[q.subject].c++; }
    else wrong++;
    // record attempts + revision for wrong answers
    if (a !== undefined) {
      recordAttempt(q.id, a === q.answer);
      if (a !== q.answer) addRevision(q.id); else removeRevision(q.id);
    }
  });
  const score = correct - NEGATIVE * wrong;
  const result = {
    ts: Date.now(), correct, wrong, skipped,
    score: Math.round(score * 100) / 100,
    total: mock.list.length, per,
    list: mock.list, answers: mock.answers, auto: !!auto,
  };
  store.mocks.push(result);
  saveStore();
  mock.active = false;
  mock.result = result;
  render();
  window.scrollTo(0, 0);
}
function renderMockResult(app) {
  const r = mock.result;
  const pct = Math.round(100 * r.score / r.total);
  const rows = Object.entries(r.per).map(([s, v]) =>
    `<tr><td>${esc(s)}</td><td class="num">${v.c} / ${v.t}</td><td class="num">${Math.round(100 * v.c / v.t)}%</td></tr>`).join('');
  const verdict = pct >= 70 ? 'Excellent — exam-ready form! 🌟' : pct >= 50 ? 'Good — push the weak subjects below. 💪' : pct >= 35 ? 'Below the line — revise and retake. 📖' : 'Keep practising — the next mock will be better. 🌱';
  app.innerHTML = `
    <h1>⏱️ Mock Results</h1>
    <div class="card" style="text-align:center">
      <div class="score-big">${r.score.toFixed(2)} / 100</div>
      <p><b>${pct}%</b> · ${r.correct} right · ${r.wrong} wrong (−${(NEGATIVE * r.wrong).toFixed(2)}) · ${r.skipped} skipped${r.auto ? ' · auto-submitted at 00:00' : ''}</p>
      <p>${verdict}</p>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="startMock()">↻ Take another mock</button>
        <button class="btn btn-ghost" onclick="go('revision')">🔁 Revise mistakes (${store.revision.length})</button>
        <button class="btn btn-ghost" onclick="go('home')">🏠 Home</button>
      </div>
    </div>
    <div class="card"><h3 style="margin-top:0">Per-subject breakdown</h3>
      <table class="breakdown"><tr><th>Subject</th><th class="num">Correct</th><th class="num">Accuracy</th></tr>${rows}</table>
    </div>
    <h2>Full answer review</h2>
    ${r.list.map((q, i) => reviewItem(q, r.answers[i])).join('')}`;
}

/* ---------- init ---------- */
function init() {
  applyTheme();
  fetch('data/questions.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      QUESTIONS = data;
      BY_ID = Object.fromEntries(data.map(q => [q.id, q]));
      BY_SUBJECT = {};
      for (const q of data) (BY_SUBJECT[q.subject] = BY_SUBJECT[q.subject] || []).push(q);
      render();
    })
    .catch(err => {
      document.getElementById('app').innerHTML =
        `<div class="empty"><span class="big-emoji">⚠️</span><p><b>Could not load the questions.</b></p>
         <p>Check your connection and reload. If you opened this file directly from disk, serve it with a local web server instead.</p>
         <p class="small">${esc(err.message)}</p></div>`;
    });
  window.addEventListener('beforeunload', e => {
    if (mock && mock.active) { e.preventDefault(); e.returnValue = ''; }
  });
}
init();
