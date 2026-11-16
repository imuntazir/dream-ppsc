/* Flow test for Muft Tayyari — drives the real app.js with a minimal DOM stub.
   Run: node tools/test_app.js   (from the project root)
   The app code runs in a vm context with a bridge appended to the same script,
   so the test can reach the app's top-level bindings through __MT. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

// ---- DOM stub ----
const els = {};
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', hidden: false, value: '',
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, focus() {}, setSelectionRange() {},
    style: {},
  };
}
const ls = {};
const sandbox = {
  console,
  setInterval, clearInterval, setTimeout, clearTimeout,
  Math, JSON, Date, Object, Array, Promise, RegExp, Error,
  document: {
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
    querySelectorAll: () => [],
    documentElement: { setAttribute() {} },
    addEventListener() {},
    createElement: () => makeEl('x'),
  },
  window: { addEventListener() {}, scrollTo() {} },
  navigator: { onLine: true },
  localStorage: {
    getItem: (k) => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: (k) => { delete ls[k]; },
  },
  fetch: async (url) => {
    const p = path.join(__dirname, '..', url.replace(/^\.\//, ''));
    const text = fs.readFileSync(p, 'utf-8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  },
  confirm: () => true,
  alert: (m) => { console.log('  (alert: ' + m + ')'); },
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf-8');
/* Bridge appended to the SAME script so it can close over the app's
   top-level let bindings, and expose them on the context global. */
const bridge = `
; globalThis.__MT = {
  get QUESTIONS() { return QUESTIONS; },
  get session() { return session; }, set session(v) { session = v; },
  get mock() { return mock; }, set mock(v) { mock = v; },
  get store() { return store; },
  get searchQuery() { return searchQuery; }, set searchQuery(v) { searchQuery = v; },
  go, startPractice, answerOption, nextQuiz, startRevision, startDaily,
  dailyQuestions, computeStats, startMock, mockAnswer, mockNext, mockMark,
  submitMock, toggleTheme, render,
};`;
vm.runInContext(appCode + bridge, sandbox);
const A = sandbox.__MT;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const appHtml = () => els.app.innerHTML;

(async () => {
  await sleep(50); // let fetch().then() resolve
  console.log('== load ==');
  check('questions loaded (1454)', A.QUESTIONS.length === 1454, 'got ' + A.QUESTIONS.length);
  check('home rendered with hero', appHtml().includes('Muft Tayyari'));
  check('home shows question count', appHtml().includes('1,454'));

  console.log('== practice flow ==');
  A.startPractice('Math');
  check('practice session started', !!A.session && A.session.mode === 'practice');
  check('practice list = 20', A.session.list.length === 20);
  const q0 = A.session.list[0];
  const wrongPick = (q0.answer + 1) % 4;
  A.answerOption(wrongPick);
  check('wrong answer recorded', A.session.correct === 0);
  check('wrong answer added to revision', A.store.revision.includes(q0.id));
  check('feedback rendered', appHtml().includes('Wrong'));
  check('explanation shown when present', q0.explanation ? appHtml().includes('Why:') : true);
  A.nextQuiz();
  const q1 = A.session.list[1];
  A.answerOption(q1.answer);
  check('correct answer recorded', A.session.correct === 1);
  check('correct answer removes from revision (was not there)', !A.store.revision.includes(q1.id));
  while (!A.session.done) {
    const qq = A.session.list[A.session.idx];
    if (A.session.answers[A.session.idx] === undefined) A.answerOption(qq.answer);
    A.nextQuiz();
  }
  check('practice summary rendered', appHtml().includes('Results'));
  check('summary shows score 19/20 (one wrong on purpose)', appHtml().includes('19 / 20'));

  console.log('== revision flow ==');
  const revCount = A.store.revision.length;
  check('revision queue non-empty', revCount > 0, 'count=' + revCount);
  A.go('revision');
  check('revision view lists count', appHtml().includes(String(revCount)));
  A.startRevision();
  check('revision session started', !!A.session && A.session.mode === 'revision');
  const rq = A.session.list[0];
  A.answerOption(rq.answer);
  check('correct revision answer removes from queue', !A.store.revision.includes(rq.id));

  console.log('== mock flow ==');
  A.session = null;
  A.go('mock');
  check('mock intro rendered', appHtml().includes('Paper pattern'));
  A.startMock();
  check('mock started with 100 questions', A.mock && A.mock.list.length === 100);
  const mix = {};
  for (const q of A.mock.list) mix[q.subject] = (mix[q.subject] || 0) + 1;
  check('mock mix English 20', mix['English'] === 20, JSON.stringify(mix));
  check('mock mix CA&GK 20', mix['Current Affairs & GK'] === 20, JSON.stringify(mix));
  check('mock mix Urdu 10', mix['Urdu'] === 10);
  check('mock mix Math 10', mix['Math'] === 10);
  check('mock mix Islamiat 10', mix['Islamiat'] === 10);
  check('mock mix Pak Studies 10', mix['Pak Studies'] === 10);
  check('mock mix Science 10', mix['Everyday Science'] === 10);
  check('mock mix Computer 10', mix['Computer'] === 10);
  A.mockAnswer(A.mock.list[0].answer);
  A.mockNext();
  A.mockAnswer(A.mock.list[1].answer);
  A.mockNext();
  A.mockAnswer((A.mock.list[2].answer + 2) % 4);
  A.submitMock(false);
  check('mock result rendered', appHtml().includes('Mock Results'));
  const res = A.mock.result;
  check('mock scoring: 2 right 1 wrong 97 skipped', res.correct === 2 && res.wrong === 1 && res.skipped === 97, JSON.stringify({ c: res.correct, w: res.wrong, s: res.skipped }));
  check('mock score = 2 - 0.25 = 1.75', res.score === 1.75, 'score=' + res.score);
  check('mock saved to store', A.store.mocks.length === 1);
  check('per-subject breakdown present', appHtml().includes('Per-subject breakdown'));
  check('full review present', appHtml().includes('Full answer review'));

  console.log('== daily challenge ==');
  A.session = null; A.mock = null;
  A.go('daily');
  const d1 = A.dailyQuestions('2026-11-16');
  const d2 = A.dailyQuestions('2026-11-16');
  const d3 = A.dailyQuestions('2026-11-17');
  check('daily = 10 questions', d1.length === 10);
  check('daily deterministic for same date', JSON.stringify(d1.map(q => q.id)) === JSON.stringify(d2.map(q => q.id)));
  check('daily differs across dates', JSON.stringify(d1.map(q => q.id)) !== JSON.stringify(d3.map(q => q.id)));
  const dMix = {};
  for (const q of d1) dMix[q.subject] = (dMix[q.subject] || 0) + 1;
  check('daily has 2 English', dMix['English'] === 2, JSON.stringify(dMix));
  A.startDaily();
  check('daily session started', !!A.session && A.session.mode === 'daily');

  console.log('== search ==');
  A.session = null;
  A.searchQuery = 'Zakat';
  A.go('search');
  check('search finds Zakat questions', appHtml().includes('Zakat'));
  A.searchQuery = 'zzzzqqqx';
  A.go('search');
  check('search no-results message', appHtml().includes('No questions match'));

  console.log('== dashboard stats ==');
  const st = A.computeStats();
  check('stats attempted > 0', st.attempted > 0, 'attempted=' + st.attempted);
  check('stats accuracy 0-100', st.acc >= 0 && st.acc <= 100);
  check('stats streak >= 1 (today active)', st.streak >= 1, 'streak=' + st.streak);
  check('stats best mock = 1.75', st.best === 1.75, 'best=' + st.best);
  A.go('home');
  check('home shows attempted count', appHtml().includes(String(st.attempted)));

  console.log('== theme ==');
  A.toggleTheme();
  check('theme toggles to dark', A.store.theme === 'dark');
  A.toggleTheme();
  check('theme toggles back to light', A.store.theme === 'light');

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
