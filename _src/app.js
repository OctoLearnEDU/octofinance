
/* ============================================================
   OctoFinance — тооцооны хөдөлгүүр
   Бүх мөнгө бүхэл ₮. Цалингийн өдөр = 1 сар (×1).
   ============================================================ */
const CARD = Object.fromEntries(OF.cards.map(c => [c.id, c]));
const PROF = Object.fromEntries(OF.profs.map(p => [p.id, p]));
const DECKS = {
  JB: { n: 'Жижиг боломж', c: '#2E6B34' }, TB: { n: 'Том боломж', c: '#0D3B25' }, AZ: { n: 'Зарлага', c: '#8A1616' },
  ZZ: { n: 'Зах зээл', c: '#0F2D55' }, NB: { n: 'Үндэсний боломж', c: '#1F6B45' }, IE: { n: 'Их эрсдэл', c: '#6E1A14' },
  MO: { n: 'Мөрөөдөл', c: '#5B3A86' }
};
const STOCK = OF.stocks;
const START_PRICES = { APU: 1078, KHAN: 1807, TT: 59850, TNG: 215, GOLD: 476586 };
const MONTHS = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
const PAY1 = OF.board.sq1.map((s, i) => s.type === 'PAY' ? i : -1).filter(i => i >= 0);
const PAY2 = OF.board.sq2.map((s, i) => s.type === 'PAY2' ? i : -1).filter(i => i >= 0);
const COLORS = ['#F2711C', '#2F6FDB', '#1F9D6B', '#B4418E', '#C9962B', '#5B49C9'];
const FLAGS = [
  ['car', 'Машин'], ['fitness', 'Фитнес'], ['health', 'Эрүүл мэндийн даатгал'], ['kasko', 'КАСКО даатгал'],
  ['married', 'Гэрлэсэн'], ['training', 'Сургалт'], ['agroIns', 'Мал, тариалангийн даатгал']
];
// older saved games used the studio's 3.5%; the v81 rule is 10%/сар for app loans (user decision 2026-10-14)
function migrateSettings(st) { st = Object.assign({}, DEFAULT_SETTINGS, st || {}); if (st.loanPct === 3.5) st.loanPct = 10; if (st.reserveMonths === 3) st.reserveMonths = 1; return st; }
const DEFAULT_SETTINGS = {
  payX: 1, firedSkip: 1, loanPct: 10, loanCap: 45, tsagaan: 1500000, l2Rate: 1.5, l2LoanPct: 50,
  taxPct: 10, shortGame: false, shortMins: 100, endAtL1: false, emergencyUnit: 1000000, forceSalePct: 80,
  inflPct: 4, depositPct: 1, reserveMonths: 1, unitsCap: 10000000, skillCap: 2, offerPct: 5,
  reGrowthPct: 6, reFeePct: 5, insPct: 5, personalMax: 4.5, bankRate: 18, bankMonths: 30, bankMaxX: 3
};
const ALIAS = { tourism: ['tour'], tour: ['tourism'], realestate: ['prop', 'apt', 'rent'], agri: ['crops'], cashmere: ['goat'] };

const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const clone = o => JSON.parse(JSON.stringify(o));
const sum = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
const R = n => Math.round(n || 0);
const d6 = () => 1 + Math.floor(Math.random() * 6);
const moy = m => ((m - 1) % 12 + 12) % 12 + 1;   // month of year from game month

/* ---------------- new game / player ---------------- */
function newGame(opts = {}) {
  return {
    v: 2, id: uid('g'), created: Date.now(), startedAt: Date.now(), mode: opts.mode || 'local', room: opts.room || null,
    settings: migrateSettings(opts.settings), prices: Object.assign({}, START_PRICES),
    conds: [], players: [], cur: 0, turns: 0, log: [], feed: [], over: null
  };
}

function houseKind(label) {
  if (/ипотек/i.test(label)) return 'mortgage';
  if (/түрээс/i.test(label)) return 'rent';
  if (/орон байр/i.test(label)) return 'rent';
  return null;
}

function newPlayer(G, profId, name, opts = {}) {
  const pr = PROF[profId];
  const debtNames = new Set(pr.debts.map(d => d.l));
  const exps = pr.exp.filter(e => !debtNames.has(e.l)).map(e => ({ id: uid('e'), l: e.l, v: e.v, kind: /татвар/i.test(e.l) ? 'tax' : (houseKind(e.l) || 'other') }));
  const debts = pr.debts.filter(d => d.bal > 0 || d.pay > 0).map(d => ({
    id: uid('d'), l: d.l, rate: d.rate, monthly: d.monthly, bal: d.bal, orig: d.bal, pay: d.pay,
    kind: d.monthly ? 'bank' : (/ипотек/i.test(d.l) ? 'mortgage' : 'prof'), y: { paid: 0, int: 0, start: d.bal }
  }));
  const hasMortgage = pr.debts.some(d => /ипотек/i.test(d.l) && d.bal > 0);
  const rent = pr.exp.some(e => /түрээс/i.test(e.l) && e.v > 0);
  const P = {
    id: opts.id || uid('p'), name: name || pr.title, color: opts.color || COLORS[G.players.length % COLORS.length],
    profId, salary: pr.salary, salaryPct: 0, childCost: pr.child, kids: 0, exps, debts,
    flags: { car: pr.debts.some(d => /машин/i.test(d.l) && d.bal > 0) || pr.exp.some(e => /машин/i.test(e.l) && e.v > 0) },
    home: hasMortgage ? 'own' : (rent ? 'rent' : 'parents'), ger: false,
    cash: pr.salary, free: pr.cash, pos: 0,   // start: this month's salary in cash; the card's savings sit in a no-term, no-interest savings account (user decision 2026-10-15)
    pos2: 0, level: 1, streak: 0, skip: 0, month: 0,
    assets: [], savings: [], skills: [], pending: [], mods: [], expMods: [], dream: null, out: false, won: false,
    l2: { rate: G.settings.l2Rate }, hist: [], firstPayoff: false, joined: Date.now(), risk: pr.risk || 1, liv0: 0
  };
  P.liv0 = fin(P, G).living;
  return P;
}

/* ---------------- asset helpers ---------------- */
function assetOp(P, a, opts = {}) {
  // operating profit for one month (before loan), with active modifiers
  if (a.kind === 'units') return a.income || 0;
  if (a.kind === 'bond') return R(a.amount * a.rate / 100 / 12);
  if (a.kind === 'deposit') return R(a.amount * a.rate / 100);
  if (a.kind === 'receivable') return R(a.amount * a.rate / 100);
  if (a.kind === 'venture') return a.profit || 0;
  let inc = a.inc || 0, opex = a.opex || 0;
  for (const m of P.mods) {
    if (m.asset !== a.id || opts.stable) continue;
    if (opts.monthly && m.next) continue;   // "next income" modifiers apply only on real income days
    if (m.base === 'inc') inc = inc * (1 + m.pct / 100);
  }
  let op = inc - opex;
  for (const m of P.mods) {
    if (m.asset !== a.id || m.base === 'inc' || opts.stable) continue;
    if (opts.monthly && m.next) continue;
    op = op * (1 + m.pct / 100);
  }
  return R(op * (a.share || 1));
}
function princNext(d) { if (!d || d.bal <= 0 || ['bank', 'l2', 'personal', 'flat'].includes(d.kind)) return 0; return Math.max(0, Math.min(d.bal, d.pay - R(d.bal * d.rate / 1200))); }
function princDown(lines) { return sum((lines || []).filter(x => x.kind === 'loan' && x.from != null), x => Math.max(0, x.from - x.to)); }
function assetLoan(P, a) { return a.loanId ? P.debts.find(d => d.id === a.loanId) : null; }
function seasonal(a) { return a.season && a.season.length && a.season.length < 12; }
function opAvg(P, a, stable) {
  const op = assetOp(P, a, { monthly: true, stable });
  return seasonal(a) ? R(op * a.season.length / 12) : op;
}
function assetValue(P, a) {
  if (a.kind === 'units') return R(a.qty * ((OF._G && OF._G.prices[a.sym]) || a.unitCost));
  if (a.kind === 'bond' || a.kind === 'deposit' || a.kind === 'receivable') return a.amount;
  if (a.kind === 'venture') return a.invest;
  if (a.kind === 'stock' || a.kind === 'metal') return R(a.qty * a.price);
  return a.price || 0;
}

/* ---------------- financial summary ---------------- */
/* Картын «Орлого»-ийг «Ашиг»-ийн оронд бичсэн хуучин худалдан авалтыг засна (2026-10-15) */
function fixGross(P) {
  for (const a of P.assets) {
    if (a.kind !== 'asset' || a.opex || a.grossFixed || !CARD[a.card]) continue;
    const fx = CARD[a.card].fx; if (!fx || !(fx.inc > 0)) continue;
    const pay = a.loanId && fx.loan ? fx.loan.pay : 0, near = (x, y) => Math.abs(x - y) <= Math.max(1000, Math.abs(y) * 0.005);
    const right = fx.inc - fx.opex;
    const wrong = pay ? [fx.inc + pay, right + pay] : [fx.inc];   // зөв нь: орлого − зардал (зээлтэй бол + төлбөр = right)
    if (wrong.some(w => w !== (pay ? right : right) && near(a.inc, w))) { a.inc = fx.inc; a.opex = fx.opex; a.grossFixed = 1; }
  }
}
function finOld(P, G) {
  fixGross(P);
  const L1 = P.level === 1;
  const salary = L1 ? R(P.salary * (1 + (P.salaryPct || 0) / 100)) : 0;
  const skills = L1 ? P.skills.filter(s => s.left <= 0 && s.mode === 'side') : [];
  const sideSkills = sum(skills, s => s.side);
  const activeAssets = P.assets.filter(a => a.active);
  const passiveAssets = P.assets.filter(a => !a.active);
  // Хөрөнгийн орлогыг картын «Ашиг»-аар буюу тухайн хөрөнгийн зээлийн төлбөрийг хассан цэвэр дүнгээр тоолно
  const aPay = a => { const d = a.loanId ? P.debts.find(x => x.id === a.loanId) : null; return d && (d.bal > 0 || d.kind === 'flat') ? debtPay(P, d, G) : 0; };
  const net = (a, st) => opAvg(P, a, st) - aPay(a);
  const side = sideSkills + (L1 ? sum(activeAssets, a => net(a)) : 0);
  const passive = sum(passiveAssets, a => net(a)) + (L1 ? 0 : sum(activeAssets, a => net(a)));
  // R02 ①: only lasting passive income counts — no temporary market boosts, no 12-month bonds
  const stablePassive = sum(passiveAssets.filter(a => a.kind !== 'bond'), a => net(a, true)) + (L1 ? 0 : sum(activeAssets, a => net(a, true)));
  const lines = P.exps.filter(e => e.v && (L1 || e.kind !== 'tax'));
  const tax = L1 ? sum(lines.filter(e => e.kind === 'tax'), e => e.v) : 0;
  const kids = P.kids * P.childCost;
  const loans = P.debts.filter(d => d.bal > 0 || d.kind === 'flat').map(d => ({ d, pay: debtPay(P, d, G) }));
  const loanPay = sum(loans, x => x.pay);
  const assetDebt = d => P.assets.some(a => a.loanId === d.id);
  const livLoans = loans.filter(x => !assetDebt(x.d));          // хөрөнгийн зээл нь тухайн хөрөнгийн ашгаас хасагдсан
  const livLoanPay = sum(livLoans, x => x.pay);
  const ins = P.flags.agroIns ? sum(P.assets.filter(a => insurable(a)), a => Math.max(0, R(opAvg(P, a, true) * (G ? G.settings.insPct : 5) / 100))) : 0;
  const extra = sum(P.expMods, m => m.v || 0);
  const base = sum(lines, e => e.v) + kids + extra + ins;
  const pctUp = sum(P.expMods.filter(m => m.pct), m => m.pct);
  const pctAmt = R((base + livLoanPay) * pctUp / 100);
  const expenses = base + livLoanPay + pctAmt;
  const living = expenses - tax;
  const income = salary + side + passive;
  const cf = income - expenses;
  const deposits = sum(P.assets.filter(a => a.kind === 'deposit'), a => a.amount) + sum(P.savings || [], x => savPrincipal(x)) + (P.free || 0);
  const reserve = P.cash + deposits;
  const rm = G ? G.settings.reserveMonths : 1;
  const badDebt = P.debts.filter(d => (d.kind === 'bank' || d.kind === 'personal') && d.bal > 0);
  const c1 = living > 0 && stablePassive >= living;
  const c2 = reserve >= living * rm;
  const c3 = !badDebt.length;
  return { salary, side, passive, stablePassive, sideSkills, lines, tax, kids, loans, livLoans, livLoanPay, loanPay, ins, extra, pctAmt, expenses, living, income, cf,
    deposits, reserve, reserveNeed: living * rm, badDebt, conds: [c1, c2, c3],
    free: c1 && c2 && c3, gap: Math.max(0, living - stablePassive),
    progress: living > 0 ? Math.min(1, Math.max(0, stablePassive / living)) : 0 };
}
function insurable(a) { return a.kind === 'asset' && (a.tags || []).some(t => ['livestock', 'agri', 'goat', 'dairy', 'crops'].includes(t)); }
function debtPay(P, d, G) {
  if (d.kind === 'bank') return R(d.bal * (G ? G.settings.loanPct : 3.5) / 100);
  if (d.kind === 'personal') return R(d.bal * d.rate / 100);
  if (d.kind === 'l2') return R(d.bal * P.l2.rate / 100);
  return d.bal > 0 ? d.pay : 0;
}

/* ---------------- savings (Хадгаламж) ----------------
   Three term deposits. Money leaves cash on opening and returns only at maturity or cancel;
   principal and interest never count as monthly income. 1 payday = 1 month. */
const SAVE_TYPES = {
  s6: { n: '6 сарын хадгаламж', short: '6 сар', term: 6, rate: 13, early: 1 },
  s12: { n: '12 сарын хадгаламж', short: '12 сар', term: 12, rate: 15, early: 2 },
  c12: { n: '12 сарын нийлмэл хадгаламж', short: 'Нийлмэл', term: 12, rate: 18, early: 3, compound: true }
};
/* Хугацаагүй хадгаламж: no term, no interest; the player moves money in and out whenever they like */
function freeMove(G, P, amt) {   // amt > 0: savings → cash, amt < 0: cash → savings
  amt = R(amt); if (!amt) return 0;
  if (amt > 0) amt = Math.min(amt, P.free || 0); else amt = -Math.min(-amt, Math.max(0, P.cash));
  if (!amt) return 0;
  P.free = (P.free || 0) - amt; P.cash += amt;
  log(G, P, amt > 0 ? 'Хадгаламжаас авлаа' : 'Хадгаламжид хийлээ', amt, null, 'save');
  return amt;
}
function savPrincipal(s) { return s.deps ? sum(s.deps, d => d.amt) : (s.amt || 0); }
// value of the deposit after `el` months under the given rule (exact, not rounded)
function savValue(s, el, rule) {
  const T = SAVE_TYPES[s.type];
  if (rule === 'compound') return sum(s.deps.filter(d => d.m <= el), d => d.amt * Math.pow(1 + T.rate / 1200, el - d.m));
  const r = rule === 'early' || T.compound ? T.early : T.rate;   // early cancel, or a broken compound deposit, earns the low simple rate
  return sum(s.deps.filter(d => d.m <= el), d => d.amt * (1 + r / 100 * (el - d.m) / 12));
}
function savRule(s) { const T = SAVE_TYPES[s.type]; return T.compound ? (s.broken ? 'broken' : 'compound') : 'simple'; }
function savRate(s) { const T = SAVE_TYPES[s.type]; return T.compound && s.broken ? T.early : T.rate; }
function savAtMaturity(s) { const T = SAVE_TYPES[s.type]; const rule = savRule(s); return savValue(s, T.term, rule === 'broken' ? 'simple' : rule); }
// expected payout at maturity if every remaining compound installment is paid
function savProjected(s) {
  const T = SAVE_TYPES[s.type];
  if (!T.compound || s.broken) return savAtMaturity(s);
  const deps = s.deps.concat(Array.from({ length: Math.max(0, T.term - 1 - s.el) }, (_, i) => ({ m: s.el + 1 + i, amt: s.monthly })));
  return savValue(Object.assign({}, s, { deps }), T.term, 'compound');
}
function savIfCancel(s) { return savValue(s, s.el, 'early'); }
function savAccrued(s) { const rule = savRule(s); return savValue(s, s.el, rule === 'broken' ? 'simple' : rule) - savPrincipal(s); }
// projected total for a new deposit (preview before opening)
function savPreview(type, amt, monthly) {
  const T = SAVE_TYPES[type];
  const deps = T.compound ? Array.from({ length: T.term }, (_, m) => ({ m, amt: m ? (monthly == null ? amt : monthly) : amt })) : [{ m: 0, amt }];
  const s = { type, deps, el: 0, broken: false };
  const total = savAtMaturity(s);
  return { total, paid: savPrincipal(s), interest: total - savPrincipal(s) };
}
function openSaving(G, P, type, amt, monthly, from) {   // compound: amt = opening deposit, monthly = each later payday
  // from = 'free': the opening deposit moves straight from the no-term savings, cash is not touched (user 2026-10-19)
  const T = SAVE_TYPES[type];
  amt = R(amt);
  const fromFree = from === 'free';
  if (!T || amt <= 0 || amt > (fromFree ? (P.free || 0) : P.cash)) return null;
  P.savings = P.savings || [];
  const s = { id: uid('v'), type, opened: P.month, el: 0, deps: [{ m: 0, amt }], monthly: T.compound ? R(monthly == null ? amt : monthly) : 0, paid: 1, missed: 0, broken: false, lastPay: P.month };
  P.savings.push(s);
  if (fromFree) { P.free -= amt; log(G, P, `${T.n} нээлээ · хугацаагүй хадгаламжаас ${fmtS(amt)}`, 0, null, 'save'); }
  else { P.cash -= amt; log(G, P, `${T.n} нээлээ`, -amt, null, 'save'); }
  return s;
}
function closeSaving(G, P, id) {
  const s = (P.savings || []).find(x => x.id === id); if (!s) return null;
  const T = SAVE_TYPES[s.type];
  const got = R(savIfCancel(s));
  P.savings = P.savings.filter(x => x.id !== id);
  P.cash += got;
  log(G, P, `${T.n} хугацаанаас өмнө цуцаллаа · жилийн ${T.early}%`, got, null, 'save');
  return got;
}
// one payday for every active deposit; `stamp` guards against counting the same payday twice
function savingsTick(G, P, stamp) {
  const ev = [];
  for (const s of [...(P.savings || [])]) {
    if (s.lastPay >= stamp) continue;
    s.lastPay = stamp;
    const T = SAVE_TYPES[s.type];
    s.el += 1;
    if (T.compound && s.el < T.term) {
      if (P.cash >= s.monthly) { P.cash -= s.monthly; s.deps.push({ m: s.el, amt: s.monthly }); s.paid += 1; ev.push({ k: 'dep', id: s.id, n: T.n, amt: s.monthly, paid: s.paid, broken: s.broken }); log(G, P, `${T.n} · ${s.paid}/12 төлбөр`, -s.monthly, null, 'save'); }
      else { s.missed += 1; const lost = !s.broken; s.broken = true; ev.push({ k: 'miss', id: s.id, n: T.n, amt: s.monthly, lost }); log(G, P, `${T.n} · төлбөр тасарлаа${lost ? ', 18% эрх алдлаа' : ''}`, 0, null, 'save'); }
    }
    if (s.el >= T.term) {
      const total = R(savAtMaturity(s)); const paid = savPrincipal(s);
      P.cash += total;
      P.savings = P.savings.filter(x => x.id !== s.id);
      ev.push({ k: 'done', id: s.id, n: T.n, total, interest: total - paid, rate: savRate(s) });
      log(G, P, `${T.n} хугацаа дууслаа · хүү ${fmt(total - paid)}`, total, null, 'save');
    }
  }
  return ev;
}
// player chooses not to pay this month's compound installment (from the payday screen)
function savSkip(G, P, id) {
  const s = (P.savings || []).find(x => x.id === id); if (!s) return false;
  const d = s.deps.find(x => x.m === s.el && x.m > 0); if (!d) return false;
  s.deps = s.deps.filter(x => x !== d); s.paid -= 1; s.missed += 1; s.broken = true;
  P.cash += d.amt;
  log(G, P, `${SAVE_TYPES[s.type].n} · энэ сарын төлбөр алгасав, 18% эрх алдлаа`, d.amt, null, 'save');
  return true;
}

/* ---------------- log / history ---------------- */
function log(G, P, txt, amt, card, kind) {
  const e = { id: uid('l'), at: Date.now(), pid: P ? P.id : null, who: P ? P.name : '', txt, amt: amt || 0, card: card || null, kind: kind || '', m: P ? P.month : 0, cash: P ? P.cash : null };
  G.log.unshift(e);
  if (G.log.length > 400) G.log.length = 400;
  if (P) { P.hist.unshift(e); if (P.hist.length > 200) P.hist.length = 200; }
  return e;
}
function pay(G, P, amt, txt, card, kind) { P.cash -= R(amt); return log(G, P, txt, -R(amt), card, kind || 'pay'); }
function gain(G, P, amt, txt, card, kind) { P.cash += R(amt); return log(G, P, txt, R(amt), card, kind || 'gain'); }

/* ---------------- loans ---------------- */
function bankDebt(P) {
  let d = P.debts.find(x => x.kind === 'bank');
  if (!d) { d = { id: uid('d'), l: P.v3 ? 'Яаралтай зээл' : 'Аппын зээл', rate: 10, monthly: true, bal: 0, orig: 0, pay: 0, kind: 'bank', y: { paid: 0, int: 0, start: 0 } }; P.debts.push(d); }
  return d;
}
function loanRoom(P, G) {
  // how much more emergency loan the player can take (R10: all loan payments ≤ cap% of salary)
  if (P.level === 2) {
    const lim = R(sum(P.assets, a => Math.max(0, assetValue(P, a) - ((assetLoan(P, a) || {}).bal || 0))) * (G.settings.l2LoanPct + (P.l2.levBoost || 0)) / 100);
    const used = sum(P.debts.filter(d => d.kind === 'l2'), d => d.bal);
    return Math.max(0, Math.floor((lim - used) / G.settings.emergencyUnit) * G.settings.emergencyUnit);
  }
  // Аппын зээл (банк бус) has no limit (user decision 2026-10-14): only the 10%/сар interest bites
  return APP_INF;
}
const APP_INF = 1e15;
function dtiRoomPay(P, G) { return R(P.salary * G.settings.loanCap / 100) - consumerPay(P, G); }
function consumerPay(P, G) { return sum(P.debts.filter(d => d.bal > 0 && (d.kind === 'bank' || d.kind === 'personal' || d.kind === 'bankl' || (d.kind === 'prof' && !/ипотек/i.test(d.l)))), d => debtPay(P, d, G)); }
/* Банкны зээл: lower rate, equal monthly payments (principal + interest) over a fixed term; limited by the same DTI cap.
   GAME VALUE — same terms as the profession cards' car/salary loans (18%/жил, 30 сар). */
function annuityPay(p, ratePct, n) { const r = ratePct / 100 / 12; return r ? R(p * r / (1 - Math.pow(1 + r, -n))) : R(p / n); }
function bankRoom(P, G) {
  if (P.level === 2) return 0;
  const room = dtiRoomPay(P, G);
  if (room <= 0) return 0;
  const per1 = annuityPay(1e6, G.settings.bankRate, G.settings.bankMonths) / 1e6;
  // bank loans: also at most bankMaxX × monthly salary outstanding (GAME VALUE)
  const lim = R(P.salary * G.settings.bankMaxX) - sum(P.debts.filter(d => d.kind === 'bankl'), d => d.bal);
  return Math.max(0, Math.floor(Math.min(room / per1, lim) / G.settings.emergencyUnit) * G.settings.emergencyUnit);
}
function takeBankLoan(G, P, amt) {
  amt = Math.ceil(amt / G.settings.emergencyUnit) * G.settings.emergencyUnit;
  const pay = annuityPay(amt, G.settings.bankRate, G.settings.bankMonths);
  P.debts.push({ id: uid('d'), l: 'Банкны зээл', rate: G.settings.bankRate, monthly: false, bal: amt, orig: amt, pay, n: G.settings.bankMonths, kind: 'bankl', y: { paid: 0, int: 0, start: amt } });
  P.cash += amt;
  return log(G, P, `Банкны зээл авлаа · ${G.settings.bankMonths} сар`, amt, null, 'loan');
}
function takeLoan(G, P, amt) {
  amt = Math.ceil(amt / G.settings.emergencyUnit) * G.settings.emergencyUnit;
  if (P.level === 2) {
    let d = P.debts.find(x => x.kind === 'l2');
    if (!d) { d = { id: uid('d'), l: 'Барьцаат зээл', rate: P.l2.rate * 12, monthly: true, bal: 0, orig: 0, pay: 0, kind: 'l2', y: { paid: 0, int: 0, start: 0 } }; P.debts.push(d); }
    d.bal += amt; d.orig += amt;
  } else {
    const d = bankDebt(P); d.bal += amt; d.orig += amt;
  }
  P.cash += amt;
  return log(G, P, P.level === 2 ? 'Барьцаат зээл авлаа' : 'Аппын зээл авлаа', amt, null, 'loan');
}
/* months left on an equal-payment loan at its current balance and payment (exact, may be fractional) */
function monthsLeftX(d) {
  if (!(d.bal > 0) || !(d.pay > 0)) return 0;
  const r = (d.rate || 0) / 1200;
  if (!r) return d.bal / d.pay;
  const x = 1 - d.bal * r / d.pay;
  return x > 0 ? -Math.log(x) / Math.log(1 + r) : 999;
}
function monthsLeft(d) { return Math.ceil(monthsLeftX(d) - 0.01); }   // ₮ rounding of the payment leaves a hair over the term (24.0001 → 24, 2026-11-11)
/* paying part of an equal-payment loan early keeps the remaining term and lowers the monthly payment (user 2026-10-15) */
function prepayPay(d, amt) {
  const n = monthsLeftX(d), b = Math.max(0, d.bal - amt), r = (d.rate || 0) / 1200;
  if (!(b > 0) || !(n > 0)) return 0;
  return Math.round(r ? b * r / (1 - Math.pow(1 + r, -n)) : b / n);
}
function amortizing(d) { return !(d.kind === 'bank' || d.kind === 'l2' || d.kind === 'personal'); }
function repayLoan(G, P, debtId, amt) {
  const d = P.debts.find(x => x.id === debtId);
  if (!d) return null;
  amt = Math.min(amt, d.bal, P.cash);
  if (amt <= 0) return null;
  if (amortizing(d) && amt < d.bal) d.pay = prepayPay(d, amt);
  d.bal -= amt; P.cash -= amt;
  if (amortizing(d)) logPay(d, { m: P.month, p: amt, pr: amt, i: 0, bal: d.bal, x: 1 });
  const e = log(G, P, `${d.l}: ${amt >= d.bal + amt ? 'бүтэн хаалаа' : 'хэсэгчлэн төллөө'}`, -amt, null, 'repay');
  if (d.bal <= 0) return payoff(G, P, d) || e;
  return e;
}
function payoff(G, P, d) {
  d.bal = 0;
  const msg = { kind: 'payoff', debt: d.l, pay: d.pay, first: !P.firstPayoff };
  P.firstPayoff = true;
  log(G, P, `Өрөөс чөлөөлөгдлөө! ${d.l} хаагдлаа`, 0, null, 'payoff');
  if (d.kind !== 'bank' && d.kind !== 'l2') {
    // card, profession and personal loans and profession loans disappear from expenses
    P.debts = P.debts.filter(x => x.id !== d.id);
    for (const a of P.assets) if (a.loanId === d.id) a.loanId = null;
  }
  return msg;
}
function amortize(P, d, G, off = 0) {
  // one month of an equal-payment loan; returns amount paid
  if (d.bal <= 0) return 0;
  if (d.kind === 'bank' || d.kind === 'l2' || d.kind === 'personal') {
    const p = debtPay(P, d, G); d.y.paid += p; d.y.int += p; return p;
  }
  const r = d.rate / 100 / 12;
  const interest = R(d.bal * r);
  let p = d.pay;
  if (d.bal + interest <= p) { p = d.bal + interest; d.bal = 0; }
  else d.bal = d.bal - (p - interest);
  d.y.paid += p; d.y.int += interest;
  logPay(d, { m: P.month + off, p, pr: p - interest, i: interest, bal: d.bal });
  return p;
}
function bondPayout(G, P, b) {
  const term = b.term || (CARD[b.card] && CARD[b.card].fx.months) || 0;
  const int = R(b.amount * b.rate / 1200 * term);
  P.cash += b.amount;
  log(G, P, `${b.name} · хугацаа дууслаа, үндсэн мөнгө буцлаа`, b.amount, b.card, 'save');
  return { n: b.name, total: b.amount, prin: b.amount, int, bond: true, term };
}
function logPay(d, e) { (d.hist = d.hist || []).push(e); if (d.hist.length > 240) d.hist.shift(); }

/* ---------------- payday ---------------- */
function paydayOld(G, P, opts = {}) {
  const lines = [];
  P.month += 1;
  const m = moy(P.month);
  const f0 = fin(P, G);
  let total = 0;
  const add = (l, v, kind) => { if (v) { lines.push({ l, v: R(v), kind }); total += R(v); } };
  if (P.level === 1) {
    add('Цалин', f0.salary, 'inc');
    for (const s of P.skills) if (s.left <= 0 && s.mode === 'side') add(`Нэмэлт орлого · ${s.name}`, s.side, 'inc');
  }
  // assets
  for (const a of P.assets) {
    if (a.kind === 'units' && a.income) { add(`${a.name}`, a.income, 'inc'); continue; }
    if (a.kind === 'bond') { add(`${a.name} · хүү`, assetOp(P, a), 'inc'); continue; }
    if (a.kind === 'deposit' || a.kind === 'receivable') { const v = assetOp(P, a); add(`${a.name} · хүү`, v, 'inc'); a.months = (a.months || 0) + 1; a.earned = (a.earned || 0) + v; continue; }
    if (a.kind === 'venture') { if (P.level === 2) continue; add(a.name, assetOp(P, a), 'inc'); continue; }
    if (a.kind !== 'asset') continue;
    if (a.wait && a.wait > 0) continue;
    if (seasonal(a) && !a.season.includes(m)) continue;
    const op = assetOp(P, a);
    if (op || a.inc) add(a.name + (seasonal(a) ? ' · улирлын орлого' : ''), op, 'inc');
    // consume "next income" modifiers on this asset
    P.mods.forEach(x => { if (x.asset === a.id && x.next) x.next -= 1; });
  }
  // expenses
  for (const e of P.exps) if (e.v) add(e.l, -e.v, 'exp');
  if (P.kids) add(`Хүүхэд × ${P.kids}`, -P.kids * P.childCost, 'exp');
  for (const x of P.expMods) if (x.v) add(x.l, -x.v, 'exp');
  const payoffs = [];
  for (const d of [...P.debts]) {
    const before = d.bal;
    const p = amortize(P, d, G);
    if (p) lines.push({ l: d.l, v: -p, kind: 'loan', from: before, to: d.bal }), total -= p;
    if (before > 0 && d.bal <= 0 && d.kind !== 'bank' && d.kind !== 'l2' && d.kind !== 'personal') payoffs.push(payoff(G, P, d));
  }
  if (f0.pctAmt) add('Нэмэгдсэн зардал', -f0.pctAmt, 'exp');
  if (f0.ins) add('Мал, тариалангийн даатгал', -f0.ins, 'exp');
  const mult = G.settings.payX || 1;
  const delta = R(total * mult);
  P.cash += delta;
  // timers
  P.mods.forEach(x => { if (x.paydays) x.paydays -= 1; });
  P.mods = P.mods.filter(x => (x.paydays === undefined || x.paydays > 0) && (x.next === undefined || x.next > 0));
  P.skills.forEach(s => { if (s.left > 0) s.left -= 1; });
  for (const a of P.assets) { if (a.blocked) a.blocked -= 1; if (a.wait) a.wait -= 1; }
  const matured = [];
  for (const t of P.pending) { t.left -= 1; if (t.left <= 0) matured.push(t); }
  const bonds = [];
  for (const a of P.assets) if (a.kind === 'bond') { a.left -= 1; if (a.left <= 0) bonds.push(a); }
  const payouts = bonds.map(b => bondPayout(G, P, b));
  P.assets = P.assets.filter(a => !(a.kind === 'bond' && a.left <= 0));
  const sav = savingsTick(G, P, P.month);
  for (const e of sav) if (e.k === 'done') payouts.push({ n: e.n, total: e.total, prin: e.total - e.interest, int: e.interest, rate: e.rate });
  // R07 inflation: every 12th payday living costs rise by inflPct% of the starting amount
  const infl = P.month % 12 === 0 ? inflate(G, P, G.settings.inflPct, 'Инфляц (жил бүр)') : 0;
  const grow = P.month % 12 === 0 ? growAssets(G, P, G.settings.inflPct) : 0;
  // freedom streak
  const f1 = fin(P, G);
  if (P.level === 1) P.streak = f1.free ? P.streak + 1 : 0;
  const report = P.month % 12 === 0 ? yearReport(P) : null;
  const e = log(G, P, `Цалингийн өдөр · ${MONTHS[m - 1]}`, delta, null, 'payday');
  e.lines = lines;
  return { delta, lines, month: P.month, moy: m, matured, payoffs, report, streak: P.streak, conds: f1.conds, infl, grow, canLevel: P.level === 1 && P.streak >= 2, entry: e, sav, payouts };
}
function inflate(G, P, pct, label) {
  const add = R((P.liv0 || fin(P, G).living) * pct / 100);
  let m = P.expMods.find(x => x.infl);
  if (!m) { m = { id: uid('x'), l: 'Инфляц', v: 0, infl: true }; P.expMods.push(m); }
  m.v += add;
  log(G, P, `${label}: амьжиргааны зардал +${fmt(add)}/сар`, 0, null, 'infl');
  return add;
}
/* R07 companion (user 2026-10-15): once a year rents and business revenue rise with inflation, and so do their running costs,
   while equal loan payments stay fixed — so an asset that starts at a monthly loss climbs toward profit over time. */
function growAssets(G, P, pct) {
  let up = 0;
  for (const a of P.assets) {
    if (a.kind !== 'asset' || !(a.inc > 0)) continue;
    const before = assetOp(P, a, { stable: true });
    a.inc = R(a.inc * (1 + pct / 100)); a.opex = R((a.opex || 0) * (1 + pct / 100));
    up += assetOp(P, a, { stable: true }) - before;
  }
  if (up) log(G, P, `Хөрөнгийн орлого инфляцаар өслөө: +${fmt(up)}/сар`, 0, null, 'infl');
  return up;
}
function yearReport(P) {
  const rows = P.debts.concat([]).map(d => ({ l: d.l, paid: d.y.paid, int: d.y.int, down: (d.y.start || 0) - d.bal, bal: d.bal }));
  for (const d of P.debts) d.y = { paid: 0, int: 0, start: d.bal };
  return rows.filter(r => r.paid > 0);
}
function annualIncome(G, P) {
  // Level 2: (passive − expenses) × 12, with 12 months of loan amortization
  const lines = [];
  let total = 0;
  const f = fin(P, G);
  for (const a of P.assets) {
    let op;
    if (a.kind === 'venture') {
      if (a.wait && a.wait > 0) { lines.push({ l: `${a.name} · нээгдэх хүлээлт`, v: 0, kind: 'inc' }); continue; }
      op = assetOp(P, a) * 12;
    } else if (a.kind === 'asset') op = opAvg(P, a) * 12; else op = assetOp(P, a) * 12;
    const mods = P.mods.filter(x => x.asset === a.id && x.next);
    for (const x of mods) { op = op * (1 + x.pct / 100); x.next -= 1; }
    if (op) lines.push({ l: a.name, v: R(op), kind: 'inc' }), total += R(op);
  }
  const allMod = P.mods.find(x => x.all && x.next);
  if (allMod) { const cut = R(total * allMod.pct / 100); lines.push({ l: 'Эдийн засгийн саарал', v: cut, kind: 'exp' }); total += cut; allMod.next -= 1; }
  for (const e of P.exps) if (e.v && e.kind !== 'tax') lines.push({ l: e.l, v: -e.v * 12, kind: 'exp' }), total -= e.v * 12;
  if (f.ins) lines.push({ l: 'Мал, тариалангийн даатгал', v: -f.ins * 12, kind: 'exp' }), total -= f.ins * 12;
  if (P.kids) lines.push({ l: `Хүүхэд × ${P.kids}`, v: -P.kids * P.childCost * 12, kind: 'exp' }), total -= P.kids * P.childCost * 12;
  for (const x of P.expMods) if (x.v) lines.push({ l: x.l, v: -x.v * 12, kind: 'exp' }), total -= x.v * 12;
  if (f.pctAmt) lines.push({ l: 'Нэмэгдсэн зардал', v: -f.pctAmt * 12, kind: 'exp' }), total -= f.pctAmt * 12;
  const payoffs = [];
  for (const d of [...P.debts]) {
    let paid = 0; const from = d.bal;
    for (let i = 0; i < 12 && d.bal > 0; i++) paid += amortize(P, d, G, i + 1);
    if (paid) lines.push({ l: d.l, v: -paid, kind: 'loan', from, to: d.bal }), total -= paid;
    if (from > 0 && d.bal <= 0 && d.kind !== 'l2' && d.kind !== 'bank' && d.kind !== 'personal') payoffs.push(payoff(G, P, d));
  }
  P.month += 12;
  for (const a of P.assets) { if (a.wait) a.wait -= 1; if (a.blocked) a.blocked = 0; if (a.kind === 'deposit' || a.kind === 'receivable') { a.months = (a.months || 0) + 12; a.earned = (a.earned || 0) + assetOp(P, a) * 12; } }
  inflate(G, P, G.settings.inflPct, 'Инфляц (жил)');
  P.mods = P.mods.filter(x => (x.next === undefined || x.next > 0) && !(x.paydays));
  P.cash += total;
  const sav = []; for (let i = 11; i >= 0; i--) sav.push(...savingsTick(G, P, P.month - i));
  const payouts = [];
  for (const a of P.assets) if (a.kind === 'bond') { a.left -= 12; if (a.left <= 0) payouts.push(bondPayout(G, P, a)); }
  P.assets = P.assets.filter(a => !(a.kind === 'bond' && a.left <= 0));
  for (const e of sav) if (e.k === 'done') payouts.push({ n: e.n, total: e.total, prin: e.total - e.interest, int: e.interest, rate: e.rate });
  const ventureRolls = P.assets.filter(a => a.kind === 'venture' && a.special && a.special.t === 'dice');
  const e = log(G, P, 'Жилийн орлого', total, null, 'payday');
  e.lines = lines;
  return { delta: total, lines, payoffs, ventureRolls, report: yearReport(P), entry: e, sav, payouts };
}

/* ---------------- buying ---------------- */
function condActive(G, key) { return G.conds.find(c => c.key === key && (c.paydays === undefined || c.paydays > 0)); }

function quoteAsset(G, P, card, opt) {
  // opt: {mode:'loan'|'cash', share:0..1, rateCut:bool, discount:pct}
  const fx = card.fx;
  const share = opt.share || 1;
  const disc = (opt.discount || 0) / 100;
  const price = R(fx.price * (1 - disc));
  const useLoan = !!fx.loan && opt.mode !== 'cash';
  let down = useLoan ? R(fx.down * (1 - disc)) : price;
  const up = useLoan && condActive(G, 'downUp');
  if (up) down = Math.min(price, down + R(price * up.pct / 100));
  let loan = null;
  if (useLoan) {
    const p = Math.max(0, price - down);
    const rate = Math.max(0, fx.loan.rate - (opt.rateCut ? 2 : 0));
    let pmt = fx.loan.pay;
    if (rate !== fx.loan.rate || p !== fx.loan.p) {
      const base = annuity(fx.loan.p, fx.loan.rate, fx.loan.n) || 1;
      pmt = R(annuity(p, rate, fx.loan.n) * fx.loan.pay / base);
    }
    loan = { p: R(p * share), rate, n: fx.loan.n, pay: R(pmt * share), by: fx.loan.by };
  }
  const inc = R(fx.inc * share), opex = R(fx.opex * share);
  const net = inc - opex - (loan ? loan.pay : 0);
  const q = { price: R(price * share), cash: R(down * share), loan, inc, opex, net, share, season: fx.season };
  return opt.man ? manualQuote(G, card, opt, q) : q;
}
/* Player typed the card's figures by hand (user decision 2026-10-14): total price, down payment,
   monthly loan payment and the monthly net cash flow. Loan rate/term still come from the card. */
function manualQuote(G, card, opt, q0) {
  const fx = card.fx, m = opt.man, share = opt.share || 1;
  const useLoan = !!fx.loan && opt.mode !== 'cash';
  const price = R(m.price || 0);
  const down = useLoan ? Math.min(price, R(m.down || 0)) : price;
  let loan = null, pay = 0;
  if (useLoan) {
    const p = Math.max(0, price - down);
    const rate = Math.max(0, fx.loan.rate - (opt.rateCut ? 2 : 0));
    // monthly loan payment comes from the card's loan (scaled if the typed price/down differ from the card)
    const base = annuity(fx.loan.p, fx.loan.rate, fx.loan.n) || 1;
    pay = m.pay > 0 ? R(m.pay) : (p === fx.loan.p && rate === fx.loan.rate ? fx.loan.pay : R(annuity(p, rate, fx.loan.n) * fx.loan.pay / base));
    loan = { p: R(p * share), rate, n: fx.loan.n, pay: R(pay * share), by: fx.loan.by };
  }
  // the card's printed net is after the loan payment; operating income = net + payment
  const incFull = R((m.net || 0) + (useLoan ? (m.pay > 0 ? R(m.pay) : fx.loan.pay) : 0));   // printed net is after the card's own loan payment
  const inc = R(incFull * share);
  return { price: R(price * share), cash: R(down * share), loan, inc, opex: 0, net: inc - (loan ? loan.pay : 0), share, season: fx.season, incFull, manual: true };
}
function annuity(p, rate, n) {
  if (!p || !n) return 0;
  const r = rate / 100 / 12;
  if (!r) return Math.ceil(p / n);
  return Math.round(p * r / (1 - Math.pow(1 + r, -n)));
}
function buyAsset(G, P, card, opt) {
  const fx = card.fx, q = quoteAsset(G, P, card, opt);
  const a = {
    id: uid('a'), card: card.id, deck: card.deck, name: card.title, kind: 'asset', cls: fx.cls, tags: fx.tags || [],
    price: q.price, cost: q.cash, inc: q.manual ? q.incFull : fx.inc, opex: q.manual ? 0 : fx.opex, share: q.share, season: fx.season, sea: fx.sea || null, passive: fx.passive,
    active: !!fx.active, bought: P.month, partner: opt.partner || null
  };
  if (q.loan && q.loan.p > 0) {
    const d = { id: uid('d'), l: `${card.title} · зээл`, rate: q.loan.rate, bal: q.loan.p, orig: q.loan.p, pay: q.loan.pay, kind: 'card', asset: a.id, y: { paid: 0, int: 0, start: q.loan.p } };
    P.debts.push(d); a.loanId = d.id;
  }
  P.assets.push(a);
  if (fx.ownhome) {
    const h = P.exps.find(e => e.kind === 'rent' && e.v > 0);
    if (h) { a.savedRent = h.v; h.saved = h.v; h.v = 0; }
    P.home = 'own';
  }
  P.cash -= q.cash;
  return log(G, P, `${card.title} авлаа${q.share < 1 ? ` (${Math.round(q.share * 100)}%)` : ''}`, -q.cash, card.id, 'buy');
}
function unitsMax(G, P, sym, price) {
  // R08/R12: one purchase ≤ unitsCap; one company's shares ≤ unitsCap in total (gold: per purchase only)
  let cap = G.settings.unitsCap;
  if (sym !== 'GOLD') cap -= sum(holdings(P, sym), a => R(a.unitCost * a.qty));
  return Math.max(0, Math.floor(Math.min(Math.max(0, P.cash), cap) / price));
}
function isRealEstate(a) { return ['re', 'land', 'home'].includes(a.cls) || (a.tags || []).some(t => ['prop', 'land', 'garage', 'stall', 'apt', 'presale'].includes(t)) && !(a.tags || []).includes('biz'); }
function bankSale(G, P, a) {
  // R11: real estate → price × (1 + 6% × years held) − 5% fee; business → 80% of purchase price
  if (isRealEstate(a)) {
    const yrs = Math.max(0, (P.month - (a.bought || 0)) / 12);
    return { price: R(a.price * (1 + G.settings.reGrowthPct / 100 * yrs) * (1 - G.settings.reFeePct / 100)), how: `банкаар · ${yrs.toFixed(1)} жил эзэмшсэн` };
  }
  return { price: R(a.price * G.settings.forceSalePct / 100), how: `банкинд ${G.settings.forceSalePct}%` };
}
function holdings(P, sym) { return P.assets.filter(a => a.kind === 'units' && a.sym === sym); }
function buyUnits(G, P, sym, qty, price, card) {
  qty = Math.floor(qty);
  if (qty <= 0) return null;
  const cost = R(qty * price);
  let a = holdings(P, sym).find(x => !x.lot);
  if (a) { a.unitCost = R((a.unitCost * a.qty + cost) / (a.qty + qty)); a.qty += qty; a.price += cost; }
  else { a = { id: uid('a'), kind: 'units', sym, name: STOCK[sym].name, qty, unitCost: price, price: cost, income: 0, cls: 'paper', tags: [], card: card ? card.id : null }; P.assets.push(a); }
  P.cash -= cost;
  return log(G, P, `${STOCK[sym].name} ${qty.toLocaleString('en')} ${STOCK[sym].unit} авлаа`, -cost, card ? card.id : null, 'buy');
}
function sellUnits(G, P, assetId, qty, price) {
  const a = P.assets.find(x => x.id === assetId);
  if (!a) return null;
  qty = Math.min(Math.floor(qty), a.qty);
  const got = R(qty * price);
  const basis = R(a.unitCost * qty);
  a.qty -= qty; a.price -= basis;
  if (a.lot && a.income) a.income = R(a.income * a.qty / (a.qty + qty));
  if (a.qty <= 0) P.assets = P.assets.filter(x => x.id !== a.id);
  P.cash += got;
  return log(G, P, `${a.name} ${qty.toLocaleString('en')} ${STOCK[a.sym].unit} зарлаа (${got - basis >= 0 ? 'ашиг' : 'алдагдал'} ${fmt(got - basis)})`, got, null, 'sell');
}
function sellAsset(G, P, assetId, price, why) {
  const a = P.assets.find(x => x.id === assetId);
  if (!a) return null;
  const d = assetLoan(P, a);
  const owe = d ? d.bal : 0;
  const got = R(price) - owe;
  if (d) P.debts = P.debts.filter(x => x.id !== d.id);
  if (a.savedRent) { const h = P.exps.find(e => e.kind === 'rent' && e.saved); if (h) { h.v = h.saved; delete h.saved; } P.home = 'rent'; }
  P.assets = P.assets.filter(x => x.id !== a.id);
  P.mods = P.mods.filter(x => x.asset !== a.id);
  P.cash += got;
  return log(G, P, `${a.name} зарлаа${why ? ' · ' + why : ''}${owe ? ` (зээл ${fmt(owe)} хаав)` : ''}`, got, a.card, 'sell');
}

/* ---------------- expenses & squares ---------------- */
function expenseApplies(P, fx) {
  switch (fx.cond) {
    case 'kids': return P.kids > 0;
    case 'car': return !!P.flags.car;
    case 'ger': return !!P.ger;
    case 'ownhome': return P.home === 'own';
    case 'rent': return P.home === 'rent';
    default: return true;
  }
}
const COND_TEXT = { all: 'Сугалсан хүн төлнө', kids: 'Хүүхэдтэй бол төлнө', car: 'Машинтай бол төлнө', ger: 'Гэрт амьдардаг бол төлнө', ownhome: 'Өөрийн байртай бол төлнө', rent: 'Түрээсэлдэг бол төлнө' };
function addChild(G, P) {
  if (P.kids >= 3) return log(G, P, 'Хүүхэд 3 хүрсэн тул зардал өсөхгүй', 0, null, 'child');
  P.kids += 1;
  return log(G, P, `Хүүхэдтэй боллоо (${P.kids}) · зардал +${fmt(P.childCost * 4)} / 4 сар`, 0, null, 'child');
}
function jobRisk(G, P, roll) {
  // R06: roll ≤ the profession's risk number → one month of salary is lost (pay it); thin reserve → also skip a turn
  const f = fin(P, G);
  if (roll > (P.risk || 1)) return log(G, P, `Ажлын эрсдэл · шоо ${roll}, ажил хэвээр`, 0, null, 'job');
  const amt = f.salary;
  const thin = f.reserve < f.reserveNeed;
  P.cash -= amt; if (thin) P.skip += G.settings.firedSkip;
  return log(G, P, `Ажлаа алдлаа · шоо ${roll} · 1 сарын цалин орохгүй${thin ? ', ажил хайж 1 ээлж өнжинө' : ''}`, -amt, null, 'fired');
}

/* ---------------- level 2 ---------------- */
function enterLevel2(G, P, dreamId) {
  if (P.v3) v3ToL2(G, P);
  P.level = 2; P.pos2 = 0; P.dream = dreamId; P.streak = 0;
  return log(G, P, `Түвшин 2 руу гарлаа · мөрөөдөл: ${CARD[dreamId].title}`, 0, dreamId, 'level');
}
function backToLevel1(G, P) {
  P.level = 1; P.pos = 0; P.streak = 0;
  return log(G, P, 'Түвшин 1 рүү буцлаа', 0, null, 'level');
}
function buyVenture(G, P, card, share) {
  const fx = card.fx;
  const invest = R(fx.invest * share);
  const a = { id: uid('a'), card: card.id, deck: 'NB', name: card.title, kind: 'venture', cls: 'nb', tags: fx.tags || [],
    invest, price: invest, profit: R(fx.profit * share), share, special: fx.special || null, wait: fx.special && fx.special.t === 'wait' ? fx.special.years : 0 };
  P.assets.push(a); P.cash -= invest;
  return log(G, P, `${card.title}${share < 1 ? ` · ${Math.round(share * 100)}%` : ''}`, -invest, card.id, 'buy');
}

/* ---------------- market modifiers ---------------- */
function matchAsset(a, spec) {
  if (a.kind !== 'asset' && a.kind !== 'venture') return false;
  if (spec.cls && !spec.cls.includes(a.cls)) return false;
  const tg = a.tags || [];
  if (spec.tags && !spec.tags.every(t => tg.includes(t))) return false;
  if (spec.tagsAny && !spec.tagsAny.some(t => tg.includes(t))) return false;
  if (spec.needTag && !tg.includes(spec.needTag)) return false;
  if (spec.any && !spec.any.some(t => tg.includes(t))) return false;
  if (!spec.cls && !spec.tags && !spec.tagsAny && !spec.all) return false;
  return true;
}
function addMod(P, a, spec, card, pct) {
  const m = { id: uid('m'), asset: a.id, base: spec.base || 'op', pct: pct !== undefined ? pct : spec.pct, card: card.id };
  if (spec.paydays) m.paydays = spec.paydays;
  if (spec.next) m.next = spec.next;
  if (!spec.paydays && !spec.next) m.paydays = 1;
  P.mods.push(m);
  return m;
}
function permMod(P, a, pct, card) {
  // permanent change of an asset's profit (Their Level-2 shocks)
  if (a.kind === 'venture') a.profit = R(a.profit * (1 + pct / 100));
  else { a.inc = R(a.inc * (1 + pct / 100)); a.opex = R(a.opex * (1 + pct / 100)); }
  a.note = (a.note ? a.note + ' · ' : '') + `${card.id} ${pct > 0 ? '+' : ''}${pct}%`;
}

/* ---------------- money format ---------------- */
function fmt(n, o = {}) {
  n = R(n);
  const s = Math.abs(n).toLocaleString('en-US');
  return (n < 0 ? '−' : (o.sign && n > 0 ? '+' : '')) + s + '₮';
}
function fmtS(n, o = {}) {
  n = R(n); const a = Math.abs(n);
  let s;
  if (a >= 1e9) s = (a / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' тэрбум₮';
  else if (a >= 1e6) s = (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' сая₮';
  else s = a.toLocaleString('en-US') + '₮';
  return (n < 0 ? '−' : (o.sign && n > 0 ? '+' : '')) + s;
}

/* ---------------- totals for leaderboards ---------------- */
function netWorth(P) {
  return P.cash + (P.free || 0) + sum(P.assets, a => assetValue(P, a)) + sum(P.savings || [], x => savPrincipal(x)) - sum(P.debts, d => d.bal);
}
/* ============================================================
   OctoFinance 3.0 — Level 1 engine «Хөрөнгийн шат» (studio v145, app prompt v7, 2026-11-03)
   1 round = 1 year = 3 Орлого; 1 Орлого = 4 months (L1.mpp). All money whole ₮, GAME VALUE.
   Level 2 keeps the previous engine (finOld, annualIncome).
   ============================================================ */
const L1 = {
  mpp: 4, ppy: 3,   // months per Орлого, Орлого per year (prompt v7 §2)
  simpleApr: 12.3, simpleRate: 4.1, endApr: 14.4, endTerm: 3, emergMax: 1e9,   // user 2026-11-03: 12.3% (4.1% per Орлого), end-of-term 14.4% (prompt v7 had 12% / 15%)
  ins: { health: 300000, car: 150000, fit: 300000 }, insTerm: 6,   // user 2026-10-22: health insurance + fitness are one item; 2026-11-03: renewed once every 2 years (6 Орлого)
  emergUnit: 1000000, emergPct: 10, offerPct: 5, skillCap: 2, toolPct: 3, salaryPct: 5, inflPct: 3,
  rental: ['1room', '2room', '3room', 'house'],
  subName: { '1room': '1 өрөө байр', '2room': '2 өрөө байр', '3room': '3 өрөө байр', house: 'Хашаа байшин', retail: 'Худалдааны талбай', office: 'Оффис', garage: 'Гараж', land: 'Газар' },
  btName: { gov: 'Засгийн газрын бонд', bank: 'Банкны бонд', company: 'Компанийн бонд' },
  metalName: { gold: 'Алт', silver: 'Мөнгө' }
};
const L1DECK = { JB: 1, TB: 1, AZ: 1, ZZ: 1, AE: 1 };
DECKS.AE = { n: 'Амьдралын эхлэл', c: '#B8860B' };
const coName = sym => (OF.cos && OF.cos[sym]) || ({ gold: 'Алт', silver: 'Мөнгө' })[sym] || sym;
const isMetalK = k => k === 'gold' || k === 'silver';
const ownOf = (P, k) => isMetalK(k) ? metalsOf(P, k) : holdingsOf(P, k);
const unitOf = k => isMetalK(k) ? 'г' : 'ш';
function sellAny(G, P, k, qty, px, card) { return isMetalK(k) ? sellMetal(G, P, k, qty, px, card) : sellStock(G, P, k, qty, px, card); }
const lc = s => String(s || '').toLowerCase();

/* ---------- new player ---------- */
function newPlayer(G, profId, name, opts = {}) {
  const pr = PROF[profId];
  const exps = pr.exp.map(e => ({ id: uid('e'), l: e.l, v: e.v, kind: /татвар/i.test(e.l) ? 'tax' : (houseKind(e.l) || 'other') }));
  // profession loans: a printed expense line that matches the loan is its payment; it leaves expenses when the loan ends (prompt §3)
  const debts = [];
  for (const d of pr.debts) {
    if (d.monthly || !(d.bal > 0)) continue;
    const key = /ипотек/i.test(d.l) ? /ипотек/i : /машин/i.test(d.l) ? /машин/i : /цалингийн/i.test(d.l) ? /цалингийн зээл/i : null;
    const line = key ? exps.find(e => key.test(e.l) && e.v > 0 && !e.debt) : null;
    const debt = { id: uid('d'), l: d.l, rate: d.rate, bal: d.bal, orig: d.bal, pay: line ? line.v : 0, kind: 'prof', line: line ? line.id : null, y: { paid: 0, int: 0, start: d.bal } };
    if (line) line.debt = debt.id;
    debts.push(debt);
  }
  // the card's printed total (Орлого − Ашиг) is the monthly expense; any gap in the printed lines is shown as its own line
  const gap = R((pr.printed.exp || 0) - sum(exps, e => e.v));
  if (gap) exps.push({ id: uid('e'), l: gap > 0 ? 'Бусад зардал (картын нийтээр)' : 'Картын нийтээр тохируулга', v: gap, kind: 'adj' });
  const P = {
    v3: 1, id: opts.id || uid('p'), name: name || pr.title, color: opts.color || COLORS[G.players.length % COLORS.length],
    profId, salary: pr.salary, salMul: 1, salaryPct: 0, childCost: pr.child, kids: 0, exps, debts,
    car: pr.debts.some(d => /машин/i.test(d.l) && d.bal > 0) || pr.exp.some(e => /машин/i.test(e.l) && e.v > 0),
    flags: {}, home: pr.exp.some(e => /ипотек/i.test(e.l)) ? 'own' : 'rent', ger: false,
    cash: pr.cash, efund: 0, free: 0, infl: 1, ins: { health: 0, car: 0, fit: 0 }, plans: [],
    pos: 0, pos2: 0, level: 1, streak: 0, skip: 0, month: 0, pd: 0, start: null,
    assets: [], savings: [], skills: [], pending: [], mods: [], expMods: [], dream: null, out: false, won: false,
    l2: { rate: G.settings.l2Rate }, hist: [], firstPayoff: false, joined: Date.now(), risk: pr.risk || 1, liv0: 0
  };
  P.flags.car = P.car;
  // R04: one month of living cost is set aside as the emergency fund
  // no emergency fund (user 2026-10-22): the whole starting money is cash
  P.liv0 = fin1(P, G).living;
  return P;
}
/* «Амьдралын эхлэл» card: added to the starting money once */
function applyStart(G, P, cardId) {
  const c = CARD[cardId]; if (!c || P.start) return;
  P.start = cardId; P.cash += c.fx.amt;
  log(G, P, `Амьдралын эхлэл · ${c.title}`, c.fx.amt, c.id, c.fx.amt >= 0 ? 'gain' : 'pay');
}

/* ---------- helpers ---------- */
function salaryOf(P) { return R(P.salary * (P.salMul || 1)); }
function raiseSalary(G, P, pct, why, card) {
  P.salMul = (P.salMul || 1) * (1 + pct / 100);
  P.salaryPct = R(((P.salMul || 1) - 1) * 1000) / 10;
  log(G, P, `${why}: цалин +${pct}% → ${fmt(salaryOf(P))}`, 0, card || null, 'gain');
}
function profMatch(P, names) {
  const t = lc(PROF[P.profId].title);
  return (names || []).some(n => { const x = lc(n).trim(); return x && (t.includes(x) || x.includes(t)); });
}
function hasHealthCover(P) { return P.ins.health > 0 || P.ins.fit > 0; }
function rentals(P) { return P.assets.filter(a => a.kind === 're' && L1.rental.includes(a.sub)); }
function holdingsOf(P, sym) { return P.assets.filter(a => a.kind === 'stock' && a.sym === sym); }
function metalsOf(P, m) { return P.assets.filter(a => a.kind === 'metal' && a.metal === m); }

/* per-payday passive cash and monthly passive (for the freedom check) */
function passiveParts(P) {
  const rows = [];   // {l, m (monthly), p (this payday cash), a}
  for (const a of P.assets) {
    if (a.kind === 're') rows.push({ l: a.name, m: a.net, p: a.net * L1.mpp, a });
    else if (a.kind === 'bond') rows.push({ l: a.name, m: a.net, p: a.skip ? 0 : a.net * L1.mpp, a });
    else if (a.kind === 'stock' && a.div) rows.push({ l: `${coName(a.sym)} · ногдол`, m: a.qty * a.div / L1.mpp, p: a.qty * a.div, a });
    else if (a.kind === 'receivable') rows.push({ l: a.name, m: R(a.amount * a.rate / 100), p: R(a.amount * a.rate / 100) * L1.mpp, a });
  }
  for (const s of P.savings || []) {
    if (s.type === 'simple') rows.push({ l: 'Энгийн хадгаламж', m: s.amt * L1.simpleRate / 100 / L1.mpp, p: s.amt * L1.simpleRate / 100, s });
    else if (s.type === 'card') rows.push({ l: s.name, m: s.amt * s.rate / 100 / L1.mpp, p: s.amt * s.rate / 100, s });
    // end-of-term savings interest is not passive income any more (studio v170 R02/R07)
  }
  return rows;
}

/* «+3%» market cards touch only «Бусад зардал», rent and children (prompt v7 §3, §9) — not loan payments or tax */
function inflOn(e) { return e.kind === 'rent' || (e.kind !== 'tax' && e.kind !== 'mortgage' && !e.debt && /бусад зардал/i.test(e.l)); }
/* the month a profession loan's last payment falls in: ceil(−ln(1 − r·B/P) / ln(1 + r)) counted from game start (prompt v7 §3) */
function loanEndM(P, d) {
  if (d.endM) return d.endM;
  const r = (d.rate || 0) / 1200, B = d.bal, Pm = d.pay;
  let n = !(B > 0) || !(Pm > 0) ? 0 : !r ? Math.ceil(B / Pm) : (r * B >= Pm ? 1e6 : Math.ceil(-Math.log(1 - r * B / Pm) / Math.log(1 + r)));
  d.endM = (P.month || 0) + n; return d.endM;
}
/* one Орлого = 4 months, summed month by month: a loan or instalment ending mid-way is paid only for its remaining months */
function pdSim(P, G, salary, expenses, loans) {
  const M = L1.mpp, m0 = P.month || 0;
  const prof = P.debts.filter(d => d.kind === 'prof' && d.pay > 0 && d.line && P.exps.some(e => e.id === d.line));
  const profAll = sum(prof, d => d.pay), plansAll = sum(P.plans || [], x => x.pay);
  const banks = (loans || []).filter(x => x.d.kind === 'bankl'), bankAll = sum(banks, x => x.pay);
  const base = expenses - profAll - plansAll - bankAll;   // what stays the same every month
  const bal = {}; for (const x of banks) bal[x.d.id] = x.d.bal;
  let cash = 0; const perMonth = [];
  for (let k = 1; k <= M; k++) {
    let e = base;
    for (const d of prof) if (m0 + k <= loanEndM(P, d)) e += d.pay;
    for (const x of P.plans || []) if (k <= x.left) e += x.pay;
    for (const x of banks) if (bal[x.d.id] > 0) { const d = x.d, i = R(bal[d.id] * d.rate / 1200), pr = Math.min(bal[d.id], Math.max(0, d.pay - i)); e += pr + i; bal[d.id] = bal[d.id] - pr < 100 ? 0 : bal[d.id] - pr; }
    perMonth.push(e); cash += salary - e;
  }
  return { cash: R(cash), perMonth };
}
function paydayDelta(P, G, salary, expenses, loans, paydayPassive) { return R(pdSim(P, G, salary, expenses, loans).cash + paydayPassive); }

/* ---------- monthly summary ---------- */
function fin1(P, G) {
  const salary = salaryOf(P);
  const pas = passiveParts(P);
  const passive = R(sum(pas, x => x.m));
  const lines = [];
  for (const e of P.exps) {
    if (!e.v) continue;
    lines.push({ l: e.l, v: inflOn(e) ? R(e.v * (P.infl || 1)) : e.v, kind: e.kind, id: e.id });
  }
  const tax = sum(lines.filter(e => e.kind === 'tax'), e => e.v);
  const kids = R(P.kids * P.childCost * (P.infl || 1));
  const plans = sum(P.plans || [], x => x.pay);
  const loans = P.debts.filter(d => d.kind !== 'prof' && d.bal > 0).map(d => ({ d, pay: debtPay(P, d, G) }));
  const loanPay = sum(loans, x => x.pay);
  const expenses = sum(lines, e => e.v) + kids + plans + loanPay;
  const living = expenses - tax;   // prompt v7 §4 / R02: living cost = monthly expenses − «Татвар ба НДШ» (supersedes the 2026-10-30 «tax included» decision)
  const income = salary + passive;
  const cf = income - expenses;
  const paydayPassive = R(sum(pas, x => x.p));
  const delta = paydayDelta(P, G, salary, expenses, loans, paydayPassive);
  const goal = living * 2;   // studio v170 R02: Level 1 ends when passive ≥ 2 × living cost
  const free = living > 0 && passive >= goal;
  const sav = sum(P.savings || [], s => s.amt);
  return {
    salary, passive, stablePassive: passive, pas, lines, tax, kids, plans, loans, livLoans: loans, loanPay, expenses, living, income, cf, delta, paydayPassive,
    side: 0, sideSkills: 0, ins: 0, extra: 0, pctAmt: 0, deposits: sav, sav, reserve: P.cash + (P.efund || 0) + sav, reserveNeed: 0, badDebt: [],
    conds: [free], free, goal, gap: Math.max(0, goal - passive), progress: goal > 0 ? Math.min(1, Math.max(0, passive / goal)) : 0
  };
}
function fin(P, G) { return P.level === 2 || !P.v3 ? finOld(P, G) : fin1(P, G); }

/* ---------- paying an unexpected cost: emergency fund first, then cash (R09, §5.3) ---------- */
function spend(G, P, amt, txt, card) {
  amt = R(amt); if (!(amt > 0)) return null;
  const fromFund = Math.min(P.efund || 0, amt);
  P.efund -= fromFund;
  P.cash -= amt - fromFund;
  const e = log(G, P, txt + (fromFund ? ` · яаралтай сангаас ${fmtS(fromFund)}` : ''), -amt, card || null, 'pay');
  return e;
}
function spendPreview(P, amt) { const f = Math.min(P.efund || 0, amt); return { fund: f, cash: amt - f }; }

/* ---------- payday ---------- */
function payday1(G, P) {
  const M = L1.mpp, f0 = fin1(P, G), sim = pdSim(P, G, f0.salary, f0.expenses, f0.loans);
  const expSum = R(sum(sim.perMonth, x => x));
  const lines = [{ l: `Цалин × ${M}`, v: f0.salary * M, kind: 'inc' }];
  for (const x of f0.pas) if (x.p) lines.push({ l: x.l, v: R(x.p), kind: 'inc' });
  lines.push({ l: `Сарын зардал × ${M}`, v: -expSum, kind: 'exp' });
  const delta = f0.delta;
  P.cash += delta;
  const m0 = P.month || 0;
  P.month = m0 + M; P.pd = (P.pd || 0) + 1;
  const news = [], decide = [], payoffs = [];
  // profession loans: paid month by month up to their end month (table in prompt v7 §3); a finished loan leaves expenses
  for (const d of P.debts.filter(x => x.kind === 'prof' && x.pay > 0)) {
    const end = loanEndM(P, d);
    for (let k = 1; k <= M && d.bal > 0; k++) { if (m0 + k > end) break; const i = R(d.bal * d.rate / 1200); d.bal = Math.max(0, d.bal - Math.max(0, d.pay - i)); }
    if (P.month >= end) d.bal = 0;
    if (d.bal <= 0) { P.exps = P.exps.filter(e => e.id !== d.line); P.debts = P.debts.filter(x => x.id !== d.id); payoffs.push({ debt: d.l, pay: d.pay, first: !P.firstPayoff }); P.firstPayoff = true; news.push(`${d.l} дууслаа — сард ${fmt(d.pay)} хасагдлаа`); log(G, P, `${d.l} хаагдлаа`, 0, null, 'payoff'); }
  }
  // bank loans (18%/жил, 12 or 24 сар): equal payments every month; the payment leaves expenses at payoff
  for (const d of P.debts.filter(x => x.kind === 'bankl' && x.bal > 0)) {
    for (let k = 0; k < M && d.bal > 0; k++) { const i = R(d.bal * d.rate / 1200); const pr = Math.min(d.bal, Math.max(0, d.pay - i)); d.bal = d.bal - pr < 100 ? 0 : d.bal - pr; logPay(d, { m: m0 + 1 + k, p: pr + i, pr, i, bal: d.bal }); }
    if (d.bal <= 0) { P.debts = P.debts.filter(x => x.id !== d.id); payoffs.push({ debt: d.l, pay: d.pay, first: !P.firstPayoff }); P.firstPayoff = true; news.push(`${d.l} дууслаа — сард ${fmt(d.pay)} хасагдлаа`); log(G, P, `${d.l} хаагдлаа`, 0, null, 'payoff'); }
  }
  // car payments (36 сар = 9 Орлого) and instalments (8 сар = 2 Орлого)
  for (const x of P.plans) x.left -= M;
  for (const x of P.plans.filter(x => x.left <= 0)) news.push(`${x.l} төлөгдөж дууслаа — сард ${fmt(x.pay)} хасагдлаа`);
  P.plans = P.plans.filter(x => x.left > 0);
  // real estate: months owned (bank sale), remaining debt falls with every monthly payment (R12); bonds
  for (const a of P.assets) {
    if (a.kind === 're') { a.months = (a.months || 0) + M; a.debt = Math.max(0, R((a.debt || 0) - a.pay * M)); }
    if (a.kind === 'bond') { a.skip = false; a.left -= 1; if (a.left <= 0) decide.push({ k: 'bond', id: a.id }); }
  }
  // savings
  for (const s of [...(P.savings || [])]) {
    s.el += 1;
    if (s.type === 'end' && s.el >= s.term) { const got = R(s.amt * (1 + L1.endApr / 100)); P.cash += got; P.savings = P.savings.filter(x => x.id !== s.id); news.push(`Хугацааны эцэст хүүтэй хадгаламж дууслаа: +${fmt(got)}`); log(G, P, 'Хадгаламжийн хугацаа дууслаа', got, null, 'save'); }
    else if ((s.type === 'simple' || s.type === 'card') && s.el >= s.term) { P.cash += s.amt; P.savings = P.savings.filter(x => x.id !== s.id); news.push(`${s.type === 'card' ? s.name : 'Энгийн хадгаламж'} дууслаа: +${fmt(s.amt)} буцлаа`); log(G, P, 'Хадгаламжийн хугацаа дууслаа', s.amt, null, 'save'); }
  }
  // insurance / fitness: one year = 3 Орлого
  for (const k of ['health', 'car', 'fit']) if (P.ins[k] > 0) { P.ins[k] -= 1; if (P.ins[k] === 0) decide.push({ k: 'ins', ins: k }); }
  // training: salary rises once the course ends («Хугацаа N Орлого»)
  for (const s of P.skills) if (s.left > 0) { s.left -= 1; if (s.left === 0) { raiseSalary(G, P, s.pct, s.name, s.card); news.push(`${s.name} дууслаа: цалин +${s.pct}%`); } }
  const f1 = fin1(P, G);
  P.streak = f1.free ? 2 : 0;
  const e = log(G, P, `Орлого · ${P.pd}-р`, delta, null, 'payday');
  e.lines = lines;
  return { delta, lines, month: P.month, pd: P.pd, news, decide, payoffs, canLevel: f1.free, won: f1.free, f0, f1, entry: e, sav: [], matured: [], ventureRolls: [] };
}
function payday(G, P, opts) { return P.v3 && P.level === 1 ? payday1(G, P) : paydayOld(G, P, opts); }

/* ---------- emergency loan (§5.3) ---------- */
function emergDebt(P) { return bankDebt(P); }   // kind 'bank', 10%/сар, 1 сая₮ units
function emergLoan(G, P, amt) { return takeLoan(G, P, Math.ceil(amt / L1.emergUnit) * L1.emergUnit); }

/* ---------- savings (§5.1) ---------- */
function openSave1(G, P, type, amt, opt = {}) {
  amt = R(amt); if (!(amt > 0) || amt > P.cash) return null;
  const s = { id: uid('v'), type, amt, el: 0, opened: P.pd || 0 };
  if (type === 'simple') { s.term = Math.max(L1.ppy, opt.term || L1.ppy); s.rate = L1.simpleRate; }
  else if (type === 'end') { s.term = L1.endTerm; }
  else if (type === 'card') { const c = CARD[opt.card]; s.term = c.fx.term; s.rate = c.fx.rate; s.apr = c.fx.apr; s.name = c.title; s.card = c.id; }
  P.savings.push(s); P.cash -= amt;
  log(G, P, `${saveName(s)} нээлээ`, -amt, opt.card || null, 'save');
  return s;
}
function saveName(s) { return s.type === 'simple' ? 'Энгийн хугацаатай хадгаламж' : s.type === 'end' ? 'Хугацааны эцэст хүүтэй хадгаламж' : (s.name || 'Картын хадгаламж'); }
function earlyCost(s) { return 0; }   // no early-withdrawal penalty (user 2026-11-09)
function earlyCost0(s) {
  if (s.type === 'simple') return R(s.amt * L1.simpleRate / 100);          // 4% of the amount (prompt v7 §5.1)
  if (s.type === 'card') return R(s.amt * s.rate / 100);                  // one payday's interest
  return 0;                                                               // end: interest is simply lost
}
function closeSave1(G, P, id) {
  const s = (P.savings || []).find(x => x.id === id); if (!s) return null;
  const pen = earlyCost(s), got = s.amt - pen;
  P.savings = P.savings.filter(x => x.id !== id); P.cash += got;
  log(G, P, `${saveName(s)} эрт авлаа${pen ? ` · торгууль ${fmt(pen)}` : ' · хүүгээ алдлаа'}`, got, null, 'save');
  return got;
}

/* ---------- insurance (§5.2) ---------- */
function buyIns(G, P, k) {
  const price = L1.ins[k]; if (P.cash < price) return false;
  P.cash -= price; P.ins[k] = L1.insTerm;
  log(G, P, `${insName(k)} · 2 жил`, -price, null, 'pay');
  return true;
}
function insName(k) { return k === 'car' ? 'Машины даатгал' : 'Эрүүл мэнд (даатгал + фитнес)'; }

/* ---------- opportunities (§7) ---------- */
function shareOf(o) { return Math.max(0.01, Math.min(1, o.share || 1)); }
function buyRE(G, P, c, o = {}) {
  const fx = c.fx, sh = shareOf(o);
  const down = R(fx.down * sh), cash = down;
  if (P.cash < cash) return null;
  P.cash -= cash;
  const a = { id: uid('a'), kind: 're', card: c.id, name: L1.subName[fx.sub] || c.title, title: c.title, sub: fx.sub, cls: fx.sub === 'garage' ? 're' : 're',
    price: R(fx.price * sh), down, pay: R(fx.pay * sh), net: R(fx.net * sh), debt: R((fx.price - fx.down) * sh), months: 0, share: sh, bought: P.pd || 0, partner: o.partner || null,
    inc: R(fx.net * sh), opex: 0, tags: [fx.sub] };
  P.assets.push(a);
  log(G, P, `${c.title}${sh < 1 ? ` · ${Math.round(sh * 100)}%` : ''} авлаа`, -cash, c.id, 'buy');
  return a;
}
function buyLand(G, P, c, o = {}) {
  const sh = shareOf(o), price = R(c.fx.price * sh); if (P.cash < price) return null;
  P.cash -= price;
  const a = { id: uid('a'), kind: 'land', card: c.id, name: 'Газар', title: c.title, sub: 'land', price, share: sh, bought: P.pd || 0, inc: 0, opex: 0, cls: 'land', tags: ['land'] };
  P.assets.push(a); log(G, P, `${c.title} авлаа`, -price, c.id, 'buy');
  return a;
}
function buyStock(G, P, c, qty, price = c.fx.price) {
  qty = Math.floor(qty); price = R(price) || c.fx.price; const cost = qty * price; if (!(qty > 0) || cost > P.cash) return null;
  P.cash -= cost;
  const a = { id: uid('a'), kind: 'stock', card: c.id, sym: c.fx.sym, name: coName(c.fx.sym), qty, price, div: c.fx.div || 0, bought: P.pd || 0 };
  a.income = R(a.qty * a.div / L1.mpp); a.unitCost = a.price;
  P.assets.push(a); log(G, P, `${coName(c.fx.sym)} ${qty.toLocaleString('en')} ширхэг × ${fmt(price)}`, -cost, c.id, 'buy');
  return a;
}
function sellStock(G, P, sym, qty, price, card) {
  let left = Math.floor(qty), got = 0;
  for (const a of holdingsOf(P, sym)) {
    if (left <= 0) break;
    const k = Math.min(left, a.qty); a.qty -= k; left -= k; got += k * price; a.income = R(a.qty * a.div / L1.mpp);
  }
  P.assets = P.assets.filter(a => !(a.kind === 'stock' && a.qty <= 0));
  P.cash += got; log(G, P, `${coName(sym)} ${(Math.floor(qty) - left).toLocaleString('en')} ширхэг зарлаа × ${fmt(price)}`, got, card || null, 'sell');
  return got;
}
function buyMetal(G, P, c, qty, price = c.fx.price) {
  qty = Math.floor(qty); price = R(price) || c.fx.price; const cost = qty * price; if (!(qty > 0) || cost > P.cash) return null;
  P.cash -= cost;
  const a = { id: uid('a'), kind: 'metal', card: c.id, metal: c.fx.metal, name: L1.metalName[c.fx.metal], qty, price, bought: P.pd || 0, inc: 0, opex: 0 };
  P.assets.push(a); log(G, P, `${a.name} ${qty} ширхэг × ${fmt(price)}`, -cost, c.id, 'buy');
  return a;
}
function sellMetal(G, P, metal, qty, price, card) {
  let left = Math.floor(qty), got = 0;
  for (const a of metalsOf(P, metal)) { if (left <= 0) break; const k = Math.min(left, a.qty); a.qty -= k; left -= k; got += k * price; }
  P.assets = P.assets.filter(a => !(a.kind === 'metal' && a.qty <= 0));
  P.cash += got; log(G, P, `${L1.metalName[metal]} ${(Math.floor(qty) - left)} ширхэг зарлаа × ${fmt(price)}`, got, card || null, 'sell');
  return got;
}
function buyBond(G, P, c, o = {}) {
  const sh = shareOf(o), price = R(c.fx.price * sh); if (P.cash < price) return null;
  P.cash -= price;
  const a = { id: uid('a'), kind: 'bond', card: c.id, name: L1.btName[c.fx.btype], title: c.title, btype: c.fx.btype, price, net: R(c.fx.net * sh), apr: c.fx.apr, left: c.fx.term, term: c.fx.term, share: sh, bought: P.pd || 0,
    amount: price, rate: c.fx.apr };
  P.assets.push(a); log(G, P, `${L1.btName[a.btype]} авлаа`, -price, c.id, 'buy');
  return a;
}
const SK_TOTAL = 3, SK_AT_ONCE = 2;   // 3 skills in a game, at most 2 being learned at once (user 2026-11-09)
function buySkill(G, P, c) {
  if (P.skills.length >= SK_TOTAL || P.skills.filter(s => s.left > 0).length >= SK_AT_ONCE || P.cash < c.fx.cost) return null;
  P.cash -= c.fx.cost;
  const s = { id: uid('k'), card: c.id, name: c.title, pct: c.fx.pct, left: c.fx.left, area: c.fx.area };
  P.skills.push(s); log(G, P, `${c.title} · сургалт`, -c.fx.cost, c.id, 'pay');
  return s;
}

/* ---------- selling (§5.4, R12) ---------- */
function bankSaleRE(P, a) { return R(a.down + a.pay * (a.months || 0)); }      // no gain: down + every paid monthly payment
function sellRE(G, P, id, got, why, card) {
  const a = P.assets.find(x => x.id === id); if (!a) return null;
  P.assets = P.assets.filter(x => x.id !== id); P.cash += got;
  log(G, P, `${a.name} зарлаа${why ? ' · ' + why : ''}`, got, card || null, 'sell');
  return got;
}

/* ---------- market cards (§9): who it touches ---------- */
function zzHits(P, fx) {
  switch (fx.kind) {
    case 'buy': return P.assets.filter(a => a.kind === 're' && a.sub === fx.tags);
    case 'buy_mult': return P.assets.filter(a => a.kind === 'land');
    case 'buy_metal': return metalsOf(P, fx.tags);
    case 'pay_if': {   // prompt v7 §9: rental = any game real estate with a monthly profit (TB or garage); apt = 1–3 rooms; apt_house = + house
      const re = P.assets.filter(a => a.kind === 're');
      return fx.tags === 'apt' ? re.filter(a => ['1room', '2room', '3room'].includes(a.sub)) : fx.tags === 'apt_house' ? re.filter(a => ['1room', '2room', '3room', 'house'].includes(a.sub)) : re; }
    case 'sell_plus': return P.assets.filter(a => a.kind === 're' && a.sub === fx.tags);
    case 'bond_default': return P.assets.filter(a => a.kind === 'bond' && a.btype === fx.tags);
    case 'bond_buy': return P.assets.filter(a => a.kind === 'bond');
    case 'shares_mult': case 'shares_gamble': return holdingsOf(P, fx.tags);
    case 'salary_prof': return profMatch(P, fx.tags) ? [P] : [];
    case 'salary_all': return [P];   // studio 2026-11-11 ZZ-143: every player's salary +5% for good
    case 'infl': return [P];
  }
  return [];
}
function zzPrice(a, fx) {
  if (fx.kind === 'buy') return R(fx.prices[fx.tags] * shareOf(a));
  if (fx.kind === 'buy_mult') return R(a.price * fx.val);
  if (fx.kind === 'sell_plus') return R(a.price + fx.val * shareOf(a));
  if (fx.kind === 'bond_buy') return R(fx.prices[a.btype] * shareOf(a));
  return 0;
}
function sharesMult(G, P, sym, m, card) {
  for (const a of holdingsOf(P, sym)) { const before = a.qty; a.qty = Math.floor(a.qty * m); a.income = R(a.qty * a.div / L1.mpp); log(G, P, `${coName(sym)}: ${before.toLocaleString('en')} → ${a.qty.toLocaleString('en')} ширхэг`, 0, card || null, 'market'); }
  P.assets = P.assets.filter(a => !(a.kind === 'stock' && a.qty <= 0));
}

/* ---------- moving to Level 2: the Level 2 engine is unchanged (prompt §13), so Level 1 holdings are mapped onto its shapes ---------- */
function v3ToL2(G, P) {
  if (P.efund) { P.cash += P.efund; log(G, P, 'Яаралтай сан бэлэн мөнгөнд нэгдлээ', P.efund, null, 'save'); P.efund = 0; }
  for (const e of P.exps) if (e.kind !== 'tax') e.v = R(e.v * (P.infl || 1));
  P.infl = 1;
  for (const s of P.savings || []) {
    const apr = s.type === 'card' ? s.apr : s.type === 'end' ? L1.endApr : L1.simpleApr;
    P.assets.push({ id: uid('a'), kind: 'deposit', name: saveName(s), amount: s.amt, price: s.amt, rate: R(apr / 12 * 100) / 100, months: 0, earned: 0, cls: 'paper', tags: [], card: s.card || null });
  }
  P.savings = [];
  for (const a of P.assets) {
    if (a.kind === 'stock') Object.assign(a, { kind: 'asset', cls: 'paper', inc: R(a.qty * a.div / L1.mpp), opex: 0, price: R(a.qty * a.price), tags: ['stock'] });
    else if (a.kind === 'metal') Object.assign(a, { kind: 'asset', cls: 'paper', inc: 0, opex: 0, price: R(a.qty * a.price), tags: ['metal'] });
    else if (a.kind === 're' || a.kind === 'land') Object.assign(a, { kind: 'asset', cls: 're', inc: a.net || 0, opex: 0 });
  }
}

/* ============================================================
   Studio v146 (2026-11-04): «Нэмэлт орлого» — earned money for N Орлого, never passive (R02, R07, R08);
   «Жижиг бизнес» is a 're' asset with sub 'biz' (cash price, passive monthly profit, bank buys it back at the price paid)
   ============================================================ */
// a business keeps its card title as its name (L1.subName has no 'biz')
function sideOf(P) { return sum((P.sides || []).filter(s => s.left > 0), s => s.inc); }
function buySide(G, P, c) {
  const fx = c.fx; if (P.cash < fx.cost) return null;
  P.cash -= fx.cost; P.sides = P.sides || [];
  const s = { id: uid('s'), card: c.id, name: c.title, inc: fx.inc, left: fx.left };
  P.sides.push(s); log(G, P, `${c.title} · нэмэлт орлого`, -fx.cost, c.id, 'pay');
  return s;
}
const _fin1v146 = fin1;
fin1 = function (P, G) {
  const f = _fin1v146(P, G), side = sideOf(P);
  if (!side) return f;
  f.side = side; f.income += side; f.cf += side;
  f.delta = paydayDelta(P, G, f.salary + side, f.expenses, f.loans, f.paydayPassive);
  return f;
};
const _payday1v146 = payday1;
payday1 = function (G, P) {
  const side = sideOf(P), r = _payday1v146(G, P);
  if (side) {
    r.lines.splice(1, 0, { l: `Нэмэлт орлого × ${L1.mpp}`, v: side * L1.mpp, kind: 'inc' });
    for (const s of P.sides || []) if (s.left > 0) { s.left -= 1; if (!s.left) r.news.push(`${s.name} дууслаа — сард ${fmt(s.inc)} нэмэлт орлого зогслоо`); }
    P.sides = (P.sides || []).filter(s => s.left > 0);
  }
  return r;
};
const _zzHitsv146 = zzHits;
zzHits = function (P, fx) {
  if (fx.kind === 'business_audit') return P.assets.filter(a => a.kind === 're' && a.sub === 'biz');
  const h = _zzHitsv146(P, fx);
  return fx.kind === 'pay_if' ? h.filter(a => a.sub !== 'biz') : h;   // СӨХ, шугам хоолой: only flats/houses/rentals, never a business
};

/* collector cards (studio v170 ZZ-149…152): «buy_mult» on antiques — all antiques, or only saddles / knives */
{ const zh = zzHits; zzHits = function (P, fx) {
  if (fx && fx.kind === 'buy_mult' && ['antique', 'saddle', 'knife'].includes(fx.tags)) return P.assets.filter(a => a.kind === 'antique' && (fx.tags === 'antique' || a.item === fx.tags));
  return zh(P, fx); }; }
/* ============================================================
   UI core: state, storage, rendering helpers, actions
   ============================================================ */
let G = null;                 // current game
const UI = { view: 'home', tab: 'board', sheetTab: 'flow', cardsDeck: 'JB', cardsQ: '', sheetFn: null, undo: [], toastT: 0, setup: null, shTab: 'io', cardsSel: null };
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = (n, cls = 'i') => OF.icons[n] ? `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${OF.icons[n]}</svg>` : `<svg class="${cls}" viewBox="0 0 256 256" aria-hidden="true"></svg>`;
const initials = s => (s || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
function listGames() { return store.get('of2.list', []); }
let saveT = 0;
function save() {
  if (!G) return;
  OF._G = G;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    store.set('of2.g.' + G.id, G);
    const l = listGames().filter(x => x.id !== G.id);
    const cp = me(); l.unshift({ id: G.id, at: Date.now(), mode: G.mode, room: G.room, names: G.players.map(p => p.name).join(', '), profs: G.players.map(p => p.profId), month: cp ? cp.month : 0, cur: cp ? cp.name : '', turns: G.turns, v3: G.players.some(p => p.v3) });
    store.set('of2.list', l.slice(0, 12));
    store.set('of2.last', G.id);
    if (G.mode === 'online') NET.push();
  }, 120);
}
function loadGame(id) {
  const g = store.get('of2.g.' + id, null);
  if (!g) return false;
  G = g; OF._G = G;
  G.settings = migrateSettings(G.settings);
  if (typeof v3Migrate === 'function') v3Migrate(G);
  UI.view = G.mode === 'online' && G.started === false ? 'lobby' : 'game'; UI.tab = 'board'; UI.undo = [];   // a room the admin hasn't started yet reopens in the lobby
  if (G.mode === 'online') NET.join(G.room, G.me, true);
  return true;
}
function deleteGame(id) {
  store.del('of2.g.' + id);
  store.set('of2.list', listGames().filter(x => x.id !== id));
}

/* ---------- who am I ---------- */
function me() { if (!G) return null; if (G.mode === 'online') return G.players.find(p => p.id === G.me) || G.players[0]; return G.players[G.cur] || G.players[0]; }
function canAct(P) { return G.mode !== 'online' || P.id === G.me; }

/* ---------- undo ---------- */
function snap(label) {
  UI.undo.push({ label, g: JSON.stringify(G) });
  if (UI.undo.length > 40) UI.undo.shift();
}
function undo() {
  const u = UI.undo.pop();
  if (!u) return toast('Буцаах үйлдэл алга');
  G = JSON.parse(u.g); OF._G = G;
  save(); render(); closeSheet();
  toast(`Буцаалаа: ${u.label}`);
}

/* ---------- toast ---------- */
function toast(t) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; el.hidden = false;
  clearTimeout(UI.toastT); UI.toastT = setTimeout(() => { el.hidden = true; }, 2600);
}
/* messenger-style banner for other players' moves (user 2026-10-15) */
const NTF_IC = { buy: 'buildings', loan: 'bank', payoff: 'trophy', level: 'trophy', win: 'trophy', card: 'trend-up', xfer: 'coins', pborrow: 'hand-coins', plend: 'hand-coins', prepay: 'hand-coins', invest: 'handshake', out: 'warning-circle', join: 'handshake', cardsale: 'handshake' };
function notify(by, name, txt, kind, onTap) {
  let w = $('#ntfs');
  if (!w) { w = document.createElement('div'); w.id = 'ntfs'; w.className = 'ntf-wrap'; w.setAttribute('role', 'status'); document.body.appendChild(w); }
  const p = (G && G.players || []).find(x => x.id === by);
  const col = (p && p.color) || '#082567';
  const n = document.createElement('div'); n.className = 'ntf' + (kind === 'cardsale' ? ' sale' : kind === 'cardx' ? ' warn' : '');
  n.innerHTML = `<span class="av" style="background:${col}">${esc((name || '?').trim().charAt(0).toUpperCase())}<i>${ic(NTF_IC[kind] || 'bell')}</i></span><span class="tx"><span class="hd"><b></b><small>дөнгөж сая</small></span><span class="msg"></span></span>${onTap ? '<span class="go">Харах</span>' : ''}`;
  n.querySelector('b').textContent = name || 'Тоглогч'; n.querySelector('.msg').textContent = txt;
  const kill = () => { if (n.dataset.gone) return; n.dataset.gone = 1; n.classList.add('out'); setTimeout(() => n.remove(), 350); };
  n.onclick = () => { if (n.dataset.swiped) return; kill(); if (onTap) onTap(); };
  // swipe up to dismiss: any upward drag of ~10px sends it away at once — no speed or distance to hit (user 2026-11-11; first version 2026-11-09)
  let y0 = null;
  const away = () => { if (n.dataset.gone) return; n.dataset.swiped = 1; n.dataset.gone = 1; n.style.transition = 'transform .18s ease, opacity .18s ease'; n.style.transform = 'translateY(-140%)'; n.style.opacity = '0'; setTimeout(() => n.remove(), 200); };
  const start = y => { y0 = y; };
  const move = (y, e) => { if (y0 == null) return; if (y - y0 < -10) { y0 = null; if (e && e.cancelable) e.preventDefault(); away(); } };
  n.addEventListener('touchstart', e => start(e.touches[0].clientY), { passive: true });
  n.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
  n.addEventListener('touchend', () => { y0 = null; });
  n.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') start(e.clientY); });
  n.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') move(e.clientY, e); });
  n.addEventListener('pointerup', () => { y0 = null; });
  w.prepend(n); while (w.children.length > 3) w.lastChild.remove();
  setTimeout(kill, kind === 'cardsale' || kind === 'cardx' ? 8000 : 4200); buzz(kind === 'cardsale' ? [60, 60, 60] : 15);
}
function buzz(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

/* ---------- sheet ---------- */
function openSheet(fn, opts) {
  const sh = $('#sheet');
  const wasOpen = !sh.hidden && !!UI.sheetFn;
  if (!wasOpen) UI.nav = [];
  else if (!(opts && opts.nav) && UI.pre && UI.pre.fn === UI.sheetFn && fn !== UI.sheetFn) {
    if (UI.undo.length === UI.pre.undo) (UI.nav = UI.nav || []).push(UI.pre); else UI.nav = [];
    UI.pre = null;
  }
  UI.sheetFn = fn;
  const modal = !!(opts && opts.modal), changed = sh.classList.contains('modal') !== modal;
  sh.classList.toggle('modal', modal);   // centred pop-up instead of a bottom sheet
  sh.hidden = false;
  drawSheet(wasOpen && !changed ? 'swap' : true);
}
/* update only the parts of the DOM that changed, so unchanged pictures and buttons do not flash (user 2026-10-14) */
/* the field being typed in is never replaced: replacing it closes the phone keyboard and loses keystrokes (user 2026-10-15) */
const isField = x => x && x.nodeType === 1 && /^(INPUT|TEXTAREA)$/.test(x.tagName);
function sameField(a, b) { return isField(a) && isField(b) && (a.id ? a.id === b.id : (a.dataset.in && a.dataset.in === b.dataset.in && a.dataset.k === b.dataset.k)); }
function findField(root, f) { if (sameField(root, f)) return root; if (root.nodeType !== 1) return null; for (const x of root.querySelectorAll('input,textarea')) if (sameField(x, f)) return x; return null; }
function syncField(c, n) { for (const at of [...n.attributes]) if (at.name !== 'value' && c.getAttribute(at.name) !== at.value) c.setAttribute(at.name, at.value); for (const at of [...c.attributes]) if (at.name !== 'value' && !n.hasAttribute(at.name)) c.removeAttribute(at.name); }
/* every <img> decodes before the frame is painted, so a redraw never shows an empty picture for a moment */
function syncImgs(html) { return typeof html === 'string' ? html.replace(/<img(?![^>]*\bdecoding=)/g, '<img decoding="sync"') : html; }
/* warm the decoded-image cache once the app is idle: mascots and card art then appear instantly */
function warmImgs() {
  if (warmImgs.done || !OF.art) return; warmImgs.done = true; const keep = warmImgs.keep = [];
  const urls = Object.entries(OF.art).filter(([k]) => /^(p_|m_|i_)/.test(k)).map(([, u]) => u);
  let i = 0; const step = () => { const t = Date.now(); while (i < urls.length && Date.now() - t < 12) { const im = new Image(); im.src = urls[i++]; keep.push(im); if (im.decode) im.decode().catch(() => {}); } if (i < urls.length) idle(step); };
  const idle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 60);
  setTimeout(() => idle(step), 300);
}
function patchHTML(el, html, depth = 3) {
  const t = document.createElement('template'); t.innerHTML = html;
  const next = [...t.content.childNodes], cur = [...el.childNodes];
  const act = document.activeElement;
  if (isField(act) && el.contains(act)) {
    // keep the focused field alive: patch the branch that holds it, rebuild only its siblings
    const ci = cur.findIndex(c => c === act || (c.nodeType === 1 && c.contains(act)));
    const ni = next.findIndex(n => findField(n, act));
    if (ci >= 0 && ni >= 0) {
      const c = cur[ci], n = next[ni];
      cur.slice(0, ci).forEach(x => x.remove()); cur.slice(ci + 1).forEach(x => x.remove());
      next.slice(0, ni).forEach(x => el.insertBefore(x, c));
      let after = c.nextSibling; next.slice(ni + 1).forEach(x => el.insertBefore(x, after));
      if (c === act) syncField(c, n);
      else if (c.tagName === n.tagName) { syncField(c, n); patchHTML(c, n.innerHTML, depth); }
      return;
    }
  }
  if (depth <= 0 || next.length !== cur.length) { el.innerHTML = html; return; }
  next.forEach((n, i) => {
    const c = cur[i];
    if (n.nodeType !== 1 || c.nodeType !== 1) { if (c.nodeType !== n.nodeType || c.textContent !== n.textContent) el.replaceChild(n, c); return; }
    if (c.outerHTML === n.outerHTML) return;
    const sameShell = c.tagName === n.tagName && c.className === n.className && [...n.attributes].every(a => c.getAttribute(a.name) === a.value) && c.attributes.length === n.attributes.length;
    if (sameShell && n.childNodes.length && !/^(INPUT|TEXTAREA|SELECT|IMG|SVG)$/i.test(n.tagName)) patchHTML(c, n.innerHTML, depth - 1);
    else el.replaceChild(n, c);
  });
}
function drawSheet(first) {
  if (!UI.sheetFn) return;
  const body = $('#sheetBody');
  const y = body.scrollTop;
  const swap = first === 'swap'; if (swap) first = false;
  const html = syncImgs(UI.sheetFn());
  const sx = [...body.querySelectorAll('.skw')].map(e => [e.scrollLeft, e.scrollTop]);   // wheel pickers keep their place on redraw
  if (!first && !swap) patchHTML(body, html); else body.innerHTML = html;
  if (!first && !swap) body.querySelectorAll('.skw').forEach((e, i) => { if (sx[i]) { e.scrollLeft = sx[i][0]; e.scrollTop = sx[i][1]; } });
  if (!first && !swap) body.scrollTop = y; else body.scrollTop = 0;
  body.classList.remove('enter');
  if (swap) { body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap'); }
  if (first) { const panel = $('.sheet-panel'); panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = ''; }
  if (first || swap) { const pf = body.querySelector('[data-fx=pay]'); if (pf) { const v = +pf.dataset.v; setTimeout(() => { if (v > 0) { FX.ping(0); setTimeout(() => FX.ping(2), 120); setTimeout(() => FX.bump && FX.bump(pf), 1150); } FX.count(pf, 0, v, 1100, x => fmt(x, { sign: true })); }, 280); } }
}
function closeSheet() { UI.sheetFn = null; UI.nav = []; FS = {}; const sh = $('#sheet'); if (sh) { sh.hidden = true; sh.classList.remove('modal'); } render(); }
let FS = {};   // flow state of the open sheet

/* ---------- avatars & art ---------- */
const cno = c => c ? `${c.deck}-${c.no || c.id.split('-')[1]}` : '';
const ART = n => (OF.art && OF.art[n]) || '';
function art(n, cls = '', alt = '') { const u = ART(n); return u ? `<img class="${cls}" src="${u}" alt="${esc(alt)}" draggable="false">` : ''; }
function mascot(profId) { return ART('p_' + profId) || ART('m_hello'); }
function avatar(P, cls = 'av') {
  const u = P && mascot(P.profId);
  if (u) return `<span class="${cls}" style="background-image:url(${u})" role="img" aria-label="${esc(P.name)}"></span>`;
  return `<span class="${cls} ini" style="background:var(--navy)">${esc(initials(P.name))}</span>`;
}
function profAv(pr, cls = 'av') { const u = mascot(pr.id); return `<span class="${cls}" style="background-image:url(${u})" role="img" aria-label="${esc(pr.title)}"></span>`; }
function stage(n, anim = 'a-idle', extra = '', cls = '') { return `<div class="stage ${cls}">${extra}<span class="shadow"></span>${art(n, anim)}</div>`; }
function confetti(k = 14) { return `<div class="cf-burst">${Array.from({ length: k }, (_, i) => `<i style="left:${4 + i * (92 / k)}%;background:${i % 2 ? '#082567' : '#F7AA21'};animation-delay:-${((i * 0.31) % 2.4).toFixed(2)}s"></i>`).join('')}</div>`; }
function coins(k = 3) { return Array.from({ length: k }, (_, i) => `<span class="coin-fly" style="left:${28 + i * 20}%;animation-delay:${(i * 0.5).toFixed(2)}s"></span>`).join(''); }
function artFor(c) {
  const fx = c.fx || {}; const t = fx.tags || [];
  if (c.deck === 'AZ') return 'i_expense';
  if (c.deck === 'ZZ') return 'i_market';
  if (c.deck === 'IE') return 'i_risk';
  if (c.deck === 'MO') return 'i_dream';
  if (fx.k === 'units') return /алт|мөнгө|GOLD|SILVER/i.test((fx.sym || '') + c.title) ? 'i_coins' : 'i_market';
  if (fx.k === 'bond' || fx.k === 'deposit' || fx.k === 'cdep') return 'i_bank';
  if (fx.k === 'stock') return 'i_market';
  if (fx.k === 'metal') return 'i_coins';
  if (fx.k === 'scam') return 'i_dice';
  if (fx.k === 're' || fx.k === 'land') return 'i_house';
  if (fx.k === 'skill') return 'i_idea';
  if (fx.k === 'gamble') return 'i_dice';
  if (fx.k === 'lot') return 'i_house';
  if (fx.k === 'venture' || t.includes('business') || /бизнес|дэлгүүр|кофе|үйлчилгээ|салон|цех/i.test(c.title + ' ' + (c.cat || ''))) return 'i_shop';
  if (t.includes('house') || t.includes('rental') || t.includes('land') || /байр|байшин|газар|өрөө|гэр/i.test(c.title + ' ' + (c.cat || ''))) return 'i_house';
  return c.deck === 'TB' ? 'i_shop' : 'i_idea';
}

/* ---------- card rendering ---------- */
function deckColor(d) { return (DECKS[d] || { c: '#13234B' }).c; }
function cardHTML(c, opt = {}) {
  const dk = deckColor(c.deck);
  const fin = c.fin && (c.fin.inc || c.fin.exp) ? c.fin : null;
  const pro = fin ? (fin.pro || '') : '';
  const proNeg = /^[−-]/.test(pro);
  const rows = (c.rows || []).filter(r => r.l || r.v);
  let box = (c.box && c.box.x) || '';
  box = esc(box).replace(/^(Идэвхгүй|Идэвхтэй|Сургамж|Эрсдэл|Шоо[^:]*|Шийдвэр|Зардал|Боломж|Анхаар|Зорилго|Орлогогүй|Эсвэл|A|B)\s*:/gm, '<em>$1:</em>');
  const head = c.box && c.box.h ? `<div class="cinfo"><b>${esc(c.box.h)}</b></div>` : '';
  return `<article class="gcard" style="--dk:${dk}">
    <div class="hd"><span>${esc(DECKS[c.deck].n)}${cardSub(c) ? ' · ' + esc(cardSub(c)) : ''}</span><span class="id">№ ${esc(c.no || c.id.split("-")[1])}</span></div>
    ${opt.noimg ? '' : c.img ? `<div class="img" style="background-image:url(${c.img})" role="img" aria-label="${esc(c.title)}"></div>` : `<div class="art">${art(artFor(c))}</div>`}
    <div class="ttl">${c.img ? '' : `<span class="bub">${ic(c.icon)}</span>`}<div><h3>${esc(c.title)}</h3>${c.desc ? `<p class="desc">${esc(c.desc)}</p>` : ''}${c.scope ? `<span class="scope">${esc(c.scope)}</span>` : ''}</div></div>
    ${rows.length && !opt.norows ? `<div class="rows">${rows.map(r => `<div><small>${esc(r.l)}</small><b>${esc(r.v)}</b></div>`).join('')}</div>` : ''}
    ${fin ? `<div class="fin"><span class="pos">+${esc(String(fin.inc).replace(/^\+/, ''))}</span>−<span class="neg">${esc(fin.exp)}</span>=<span class="tot ${proNeg ? 'neg' : 'pos'}">${esc(pro)}</span>${fin.per || fin.note ? `<small>${esc([fin.per, fin.note].filter(Boolean).join(' · '))}</small>` : ''}</div>` : ''}
    ${c.hi ? `<div class="hi"><small>${esc(c.hi.l)}</small><b class="${c.hi.t === 'neg' ? 'neg' : c.hi.t === 'pos' ? 'pos' : ''}">${esc(c.hi.v)}</b></div>` : ''}
    ${box ? `<div class="cbox">${box}</div>` : ''}${head}
    ${(c.lesson || c.risk || c.basis) && !opt.short ? `<div class="cinfo">${c.risk ? `<span>Эрсдэл: ${esc(c.risk)}</span>` : ''}${c.lesson ? `<span>Сургамж: ${esc(c.lesson)}</span>` : ''}${c.basis ? `<span class="basis">Эх сурвалж: ${esc(c.basis)}</span>` : ''}</div>` : ''}
  </article>`;
}
/* category line; stock and metal cards also name the company / metal (user 2026-10-22) */
function cardSub(c) {
  const fx = c.fx || {};
  if (fx.k === 'stock' && typeof coName === 'function') return `${c.cat || 'Хувьцаа'} · ${coName(fx.sym)}`;
  if (fx.k === 'metal' && typeof L1 !== 'undefined') return `${c.cat || ''}${c.cat ? ' · ' : ''}${L1.metalName[fx.metal] || ''}`;
  return c.cat || '';
}
function cardItem(c, act = 'card', extra = '') {
  const fx = c.fx || {};
  let r = '';
  if (fx.k === 'asset') r = `<span class="${fx.net >= 0 ? 'pos' : 'neg'}">${fmtS(fx.net, { sign: true })}</span><br><span class="mute">${fmtS(fx.loan ? fx.down : fx.price)}</span>`;
  else if (fx.k === 'expense') r = `<span class="neg">${fmtS(-fx.amt)}</span>`;
  else if (fx.k === 'units') r = `${fmt(fx.price)}`;
  else if (fx.k === 'venture') r = `<span class="${fx.profit >= 0 ? 'pos' : 'neg'}">${fmtS(fx.profit, { sign: true })}</span><br><span class="mute">${fmtS(fx.invest)}</span>`;
  else if (fx.k === 'dream' || fx.k === 'dream2') r = fmtS(fx.price);
  else if (fx.k === 'nb') r = fx.special === 'exit2' || fx.special === 'exit3' ? '<span class="mute">Гарц</span>' : `<span class="${fx.net >= 0 ? 'pos' : 'neg'}">${fx.special === 'startup' ? 'Стартап' : fmtS(fx.net, { sign: true })}</span><br><span class="mute">${fmtS(fx.invest)}</span>`;
  else if (fx.k === 're') r = `<span class="${fx.net >= 0 ? 'pos' : 'neg'}">${fmtS(fx.net, { sign: true })}</span><br><span class="mute">${fmtS(fx.down)}</span>`;
  else if (fx.k === 'land' || fx.k === 'bond') r = fmtS(fx.price);
  else if (fx.k === 'stock' || fx.k === 'metal') r = fmt(fx.price);
  else if (fx.k === 'pay' || fx.k === 'need') r = `<span class="neg">${fmtS(-(fx.amt || fx.cash))}</span>`;
  else if (fx.k === 'start') r = `<span class="${fx.amt >= 0 ? 'pos' : 'neg'}">${fmtS(fx.amt, { sign: true })}</span>`;
  else if (fx.k === 'skill' && fx.side === undefined) r = `<span class="pos">+${fx.pct}%</span><br><span class="mute">${fmtS(fx.cost)}</span>`;
  else if (fx.k === 'skill') r = `<span class="pos">${fmtS(fx.side, { sign: true })}</span><br><span class="mute">${fmtS(fx.cost)}</span>`;
  return `<button class="citem" style="--dk:${deckColor(c.deck)}" data-a="${act}" data-id="${c.id}" ${extra}>
    <span class="bub" ${c.img ? `style="background-image:url(${c.img})"` : ''}>${c.img ? '' : ic(c.icon)}</span>
    <span style="min-width:0"><span class="id">№ ${c.no || c.id.split('-')[1]}</span><b>${esc(c.title)}</b><small>${esc(cardSub(c))}</small></span>
    ${fx.k === 'stock' || fx.k === 'metal' ? '' : `<span class="r">${r}</span>`}</button>`;   // stock and metal prices move, so they show only once the card is opened (user 2026-11-04)
}

/* ---------- money input helper ---------- */
function parseAmt(v) { const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10); return isNaN(n) ? 0 : n; }

/* ---------- render ---------- */
function render() {
  const app = $('#app');
  const nav = $('#nav');
  document.body.classList.toggle('home', ['home', 'setup', 'lobby'].includes(UI.view));
  document.body.classList.remove('lob');
  if (UI.view !== 'game') UI._key = UI.view;
  // menus: redraw in place when the same screen updates, images decode synchronously — no blank «refresh» frame (user 2026-11-03)
  const menu = (fn) => { app.className = 'nonav'; nav.hidden = true; const v = $('#view'), html = syncImgs(fn()); if (UI._mk === UI.view && v.childNodes.length) patchHTML(v, html); else v.innerHTML = html; UI._mk = UI.view; v.classList.remove('enter'); };
  if (UI.view === 'lobby') { if (!G) { UI.view = 'home'; return render(); } return menu(vLobby); }
  if (UI.view === 'home') return menu(vHome);
  if (UI.view === 'setup') return menu(vSetup);
  if (UI.view === 'browse') return menu(vBrowse);
  UI._mk = null;
  app.className = ''; nav.hidden = false;
  document.body.classList.toggle('lob', UI.tab === 'board');
  // Хөрөнгө and Зардал open as pop-ups straight from the bottom bar (user 2026-10-14)
  const h3 = !!(G && me() && ((isV3(me()) && me().level === 1) || (me().l7 && me().level === 2)));   // Их тал v7 uses the same home shell (2026-11-04)
  document.body.classList.toggle('h3', h3);
  if (!h3 && (UI.tab === 'stocks' || UI.tab === 'assets' || UI.tab === 'report')) { UI.tab = 'board'; document.body.classList.add('lob'); }
  if (h3) patchHTML(nav, navH3()); else
  patchHTML(nav, [['board', 'house', 'Нүүр'], ['@openAssets', 'buildings', 'Хөрөнгө'], ['@openExp', 'receipt', 'Зардал'], ['players', 'users-three', 'Тоглогчид'], ['hist', 'clock', 'Түүх']]
    .map(([k, i, n]) => k[0] === '@' ? `<button data-a="${k.slice(1)}">${ic(i)}<span>${n}</span></button>` : `<button data-a="tab" data-t="${k}" ${UI.tab === k ? 'aria-current="page"' : ''}>${ic(i)}<span>${n}</span></button>`).join(''));
  const V = { board: vBoard, sheet: vSheet, cards: vCards, hist: vHist, players: vPlayers, rules: vRules, stocks: vStocks, assets: vAssets, report: vReport }[UI.tab];
  // only a change of main tab animates; switching sub-tabs (Хуудас, Карт) redraws in place without the enter flash
  const key = UI.view + ':' + UI.tab;
  const prevCash = UI.tab === 'board' ? UI._cash : null;
  const tabsX = [...document.querySelectorAll('#view .tabs, #view .decks')].map(e => e.scrollLeft);
  const vh = syncImgs(V()); const vw0 = $('#view');
  if (UI._key === key && vw0.childNodes.length) patchHTML(vw0, vh); else vw0.innerHTML = vh;
  document.querySelectorAll('#view .tabs, #view .decks').forEach((e, i) => { if (tabsX[i]) e.scrollLeft = tabsX[i]; });
  const vw = $('#view');
  const changed = UI._key !== key; UI._key = key;
  vw.classList.remove('enter'); if (changed) { void vw.offsetWidth; vw.classList.add('enter'); }
  nav.classList.toggle('enter', changed && !!UI._navT && UI._navT !== UI.tab); UI._navT = UI.tab;
  // a payday celebration that could not play right away (a square's sheet opened on top) is dropped, not replayed later (user 2026-10-15)
  if (UI.celebrate && Date.now() - (UI.celebrate.at || 0) > 2500) UI.celebrate = null;
  const cn = $('.lobby .money');
  if (cn) {
    const now = +cn.dataset.cash; UI._cash = now;
    if (!UI.celebrate && prevCash != null && prevCash !== now) { FX.count(cn, prevCash, now, 700, fmtN); setTimeout(() => FX.bump(cn), 700); }
  }
  if (UI.tab === 'board' && UI.celebrate && !UI.sheetFn) celebrate();
  if (G && !G.over) UI.winHide = 0;
  if (G && G.over && !UI.sheetFn && !UI.winHide) setTimeout(() => openSheet(fWin), 50);   // closed by the player → stays down, a pill brings it back (user 2026-11-04)
  winPill();
}

const fmtN = n => fmt(n).replace(/\s*₮$/, '');   // lobby cash: ₮ is drawn separately, smaller
/* payday celebration on the money card: own mascot jumps, coins fly, cash counts up */
function celebrate() {
  const c = UI.celebrate; UI.celebrate = null;
  const card = $('.lobby'); if (!card) return;
  const img = card.querySelector('.hero .masc'), num = card.querySelector('.nb .money, .h3-amt .money'), pod = card.querySelector('.hero .pod');
  const ncard = card.querySelector('.nb .ncard, .h3-card');
  const up = !(c.delta < 0);
  // a small pill on the cash card says what happened
  if (ncard && c.delta !== undefined) {
    const t = document.createElement('div'); t.className = 'paytag ' + (up ? 'pos' : 'neg');
    t.innerHTML = `<b>${fmt(c.delta, { sign: true })}</b><span>${up ? (me().level === 2 ? 'Жилийн орлого' : 'Орлого орлоо') : 'Алдагдалтай сар'}</span>${(c.payoffs || []).map(p => `<span class="po">${esc(p.debt)} хаагдлаа</span>`).join('')}`;
    ncard.appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
  }
  if (!up) {
    if (num) { num.textContent = fmtN(c.to); FX.bump(num); }
    if (img) img.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px) rotate(-2deg)' }, { transform: 'translateX(5px) rotate(2deg)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 600, easing: 'ease-in-out' });
    return;
  }
  // mascot: one happy jump — crouch, leap with a little twist, land, settle
  // mascot: two happy hops — a big one, then a smaller one (user 2026-10-15)
  if (img) img.animate([
    { transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.1,.88)', offset: .08 },
    { transform: 'translateY(-56px) rotate(-5deg) scale(.94,1.08)', offset: .27 }, { transform: 'translateY(-58px) rotate(4deg) scale(.96,1.05)', offset: .36 },
    { transform: 'translateY(0) scale(1.09,.9)', offset: .52 }, { transform: 'translateY(-24px) rotate(-2deg) scale(.97,1.04)', offset: .67 },
    { transform: 'translateY(0) scale(1.05,.94)', offset: .82 }, { transform: 'translateY(0) scale(1,1)' }], { duration: 1000, easing: 'ease-in-out' });
  // the floor glows gold for a moment
  if (pod) pod.animate([{ background: 'rgba(255,255,255,.08)', boxShadow: '0 0 0 rgba(247,170,33,0)' }, { background: 'rgba(247,170,33,.35)', boxShadow: '0 0 40px 10px rgba(247,170,33,.35)', offset: .3 }, { background: 'rgba(255,255,255,.08)', boxShadow: '0 0 0 rgba(247,170,33,0)' }], { duration: 1000, easing: 'ease-out' });
  // real-looking coins spring out of the mascot, bounce on the floor, then fly into the cash number (user 2026-10-15)
  if (num) num.textContent = fmtN(c.from);
  const done = () => { if (num) { num.textContent = fmtN(c.to); num.animate([{ color: '#7BE0A8' }, { color: '#FFFFFF' }], { duration: 1000 }); FX.bump(num); } };
  if (img && pod && num) { const pr = pod.getBoundingClientRect(); const N = 10;
    setTimeout(() => FX.coinShower(img, pr.top + pr.height * .5, { n: N, minX: pr.left + pr.width * .08, maxX: pr.right - pr.width * .08, to: num, flyAt: 330,
      onHit: (i, n) => { num.textContent = fmtN(Math.round(c.from + (c.to - c.from) * i / n)); FX.bump(num); }, onDone: done }), 100);
  } else done();
  try { FX.ping(0); setTimeout(() => FX.ping(2), 140); } catch (e) { }
}

/* ---------- action dispatch ---------- */
const ACT = {};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) {
    if (e.target.classList.contains('sheet-bg')) closeSheet();
    return;
  }
  const f = ACT[el.dataset.a];
  if (!f) return;
  e.preventDefault();
  // remember where we were, so X can step back to this sheet if the action opens another one
  UI.pre = UI.sheetFn ? { fn: UI.sheetFn, fs: Object.assign({}, FS), modal: $('#sheet').classList.contains('modal'), undo: UI.undo.length } : null;
  f(el.dataset, el, e);
  UI.pre = null;
});
/* money fields: put the thousands commas in while typing, keeping the caret after the same digit (user 2026-10-15) */
function liveGroup(el) {
  if (!el || el.tagName !== 'INPUT' || el.getAttribute('inputmode') !== 'numeric' || el.dataset.raw !== undefined) return;
  const v = el.value, pos = el.selectionStart == null ? v.length : el.selectionStart;
  const digitsBefore = v.slice(0, pos).replace(/[^\d]/g, '').length;
  const d = v.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  const out = d ? Number(d).toLocaleString('en-US') : '';
  if (out === v) return;
  el.value = out;
  let i = 0, seen = 0; while (i < out.length && seen < digitsBefore) { if (/\d/.test(out[i])) seen++; i++; }
  try { el.setSelectionRange(i, i); } catch (er) { }
}
document.addEventListener('input', e => {
  liveGroup(e.target);
  const el = e.target.closest('[data-in]');
  if (!el) return;
  const f = ACT[el.dataset.in];
  if (f) f(el.dataset, el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && UI.sheetFn) ACT.close();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][data-a]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
  if (e.key === 'Enter') { const el = e.target.closest('[data-enter]'); if (el && ACT[el.dataset.enter]) { e.preventDefault(); ACT[el.dataset.enter](el.dataset, el, e); } }
});

ACT.tab = d => { if (d.t === 'stocks' && UI.tab !== 'stocks') UI.sk = {}; UI.tab = d.t; render(); window.scrollTo(0, 0); };
/* X steps back to the sheet this one was opened from (nothing changed in the game since); otherwise it closes (user 2026-10-15) */
ACT.close = () => { const s = (UI.nav || []).pop(); if (s) { FS = s.fs; openSheet(s.fn, { modal: s.modal, nav: true }); } else closeSheet(); };
ACT.undo = () => undo();
ACT.home = () => { UI.sheetFn = null; UI.nav = []; FS = {}; const sh = $('#sheet'); if (sh) { sh.hidden = true; sh.classList.remove('modal'); } UI.view = 'home'; G = null; NET.leave(); render(); };   // close the menu sheet too
/* ============================================================
   Money effects: real 3D coins/notes that burst, fly and land.
   Web Animations API on a fixed overlay; respects reduced motion.
   ============================================================ */
const FX = (() => {
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layer = null, actx = null;
  function L() { if (!layer) { layer = document.createElement('div'); layer.id = 'fxLayer'; document.body.appendChild(layer); } return layer; }
  function sprite(kind, size) {
    const el = document.createElement('img');
    el.src = ART(kind === 'note' ? 'fx_note' : 'fx_coin'); el.className = 'fx-' + kind; el.alt = '';
    el.style.width = size + 'px'; L().appendChild(el); return el;
  }
  function center(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
  function ping(i = 0) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + 0.002, g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      g.connect(actx.destination);
      [1568 + (i % 3) * 60, 2349 + (i % 3) * 90].forEach(f => { const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.24); });
    } catch (e) { }
  }
  // coins shoot up out of `from` like a fountain and fall back with gravity
  function burst(from, { n = 14, notes = 4, spread = 1, dur = 1300 } = {}) {
    if (RM() || !from) return;
    const o = center(from);
    for (let i = 0; i < n + notes; i++) {
      const note = i >= n, size = note ? 54 + Math.random() * 14 : 30 + Math.random() * 16;
      const el = sprite(note ? 'note' : 'coin', size);
      const ang = (-90 + (Math.random() * 2 - 1) * 62 * spread) * Math.PI / 180, v = 360 + Math.random() * 300;
      const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v, gr = 1250, T = (dur + Math.random() * 400) / 1000;
      const spin = (note ? 1 : 3 + Math.random() * 3) * 360 * (Math.random() < .5 ? -1 : 1);
      const frames = [];
      for (let k = 0; k <= 14; k++) {
        const t = T * k / 14, x = vx * t, y = vy * t + gr * t * t / 2;
        const tr = note ? `rotate(${spin * k / 14 * .25}deg) rotateX(${Math.sin(k / 2) * 55}deg)` : `rotateY(${spin * k / 14}deg)`;
        frames.push({ transform: `translate(${o.x - size / 2 + x}px,${o.y - size / 2 + y}px) ${tr}`, opacity: k > 11 ? (14 - k) / 3 : 1 });
      }
      const a = el.animate(frames, { duration: T * 1000, delay: i * 28, easing: 'linear', fill: 'both' });
      a.onfinish = () => el.remove();
    }
  }
  // coins fly in an arc from `from` into `to`; onHit(i) fires as each one lands
  function fly(from, to, { n = 9, notes = 2, stagger = 85, dur = 720, onHit, onDone } = {}) {
    if (!from || !to) { onDone && onDone(); return; }
    if (RM()) { onHit && onHit(n + notes - 1, n + notes); onDone && onDone(); return; }
    const a = center(from), b = center(to), total = n + notes;
    for (let i = 0; i < total; i++) {
      const note = i % 5 === 4 && notes-- > 0, size = note ? 46 : 30 + Math.random() * 8;
      const el = sprite(note ? 'note' : 'coin', size);
      const sx = a.x + (Math.random() * 2 - 1) * a.w * .25, sy = a.y + (Math.random() * 2 - 1) * a.h * .15;
      const ex = b.x - b.w * .3 + Math.random() * b.w * .6, ey = b.y;
      const cx = (sx + ex) / 2 + (Math.random() * 2 - 1) * 60, cy = Math.min(sy, ey) - 50 - Math.random() * 60;
      const frames = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        const x = u * u * sx + 2 * u * t * cx + t * t * ex, y = u * u * sy + 2 * u * t * cy + t * t * ey;
        const sc = k < 3 ? .4 + k * .2 : k > 13 ? 1 - (k - 13) * .22 : 1;
        frames.push({ transform: `translate(${x - size / 2}px,${y - size / 2}px) ${note ? `rotate(${k * 9}deg)` : `rotateY(${k * 50}deg)`} scale(${sc})` });
      }
      const an = el.animate(frames, { duration: dur, delay: i * stagger, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' });
      an.onfinish = () => { el.remove(); bump(to); ping(i); try { navigator.vibrate && navigator.vibrate(8); } catch (e) { } onHit && onHit(i, total); if (i === total - 1) onDone && onDone(); };
    }
  }
  function bump(el) { if (!el || RM()) return; el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }); }
  function count(el, from, to, dur = 900, fmtFn = fmt) {
    if (!el) return;
    if (RM()) { el.textContent = fmtFn(to); return; }
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmtFn(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // realistic coins: a canvas with gravity, flips in 3D (face squashes, rim shows), bounces on the floor, clinks, settles, fades
  function coinShower(from, floorY, { n = 14, life = 2600, minX = 0, maxX = innerWidth, to = null, flyAt = 1250, onHit, onDone } = {}) {
    if (RM() || !from) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    const cv = document.createElement('canvas'); cv.className = 'fx-cv'; cv.width = W * dpr; cv.height = H * dpr; L().appendChild(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const o = center(from), top = o.y - o.h * .1;
    const cs = [];
    for (let i = 0; i < n; i++) {
      const r = 11 + Math.random() * 7, ang = (-90 + (i % 2 ? 1 : -1) * (30 + Math.random() * 34)) * Math.PI / 180, v = 560 + Math.random() * 260;   // fan out left/right so the mascot stays visible
      cs.push({ x: o.x + (Math.random() * 2 - 1) * o.w * .12, y: top, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r,
        phi: Math.random() * Math.PI, w: (14 + Math.random() * 16) * (Math.random() < .5 ? -1 : 1), tilt: (Math.random() * 2 - 1) * .5,
        fy: floorY + (Math.random() * 2 - 1) * 10, bounces: 0, rest: false, t0: i * 35 });
    }
    const gr = 2300; let last = performance.now(), start = last;
    function face(c) {
      const k = Math.cos(c.phi), ry = Math.max(.06, Math.abs(k)) * c.r, th = Math.max(1.4, c.r * .22 * Math.abs(Math.sin(c.phi)) + 1.2);
      g.save(); g.translate(c.x, c.y); g.rotate(c.tilt); if (c.sc) g.scale(c.sc, c.sc);
      // rim (thickness), drawn below the face
      g.fillStyle = '#B7740A'; g.beginPath(); g.ellipse(0, th * .5, c.r, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(-c.r, 0, c.r * 2, th * .5);
      // face with a light that moves as it turns
      const hl = .5 + .5 * k;
      const grd = g.createLinearGradient(-c.r, -ry, c.r, ry);
      grd.addColorStop(0, '#FFF1B8'); grd.addColorStop(.35 * hl + .1, '#FFD452'); grd.addColorStop(.75, '#F2A516'); grd.addColorStop(1, '#C98410');
      g.fillStyle = grd; g.beginPath(); g.ellipse(0, -th * .5, c.r, ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(160,95,5,.55)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -th * .5, c.r * .78, ry * .78, 0, 0, Math.PI * 2); g.stroke();
      if (Math.abs(k) > .35) { g.save(); g.scale(1, Math.abs(k)); g.fillStyle = 'rgba(150,88,4,.75)'; g.font = `800 ${c.r * 1.05}px Manrope,system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₮', 0, (-th * .5) / Math.abs(k) + c.r * .05); g.restore(); }
      // glint
      g.fillStyle = `rgba(255,255,255,${.25 + .5 * Math.max(0, k)})`; g.beginPath(); g.ellipse(-c.r * .35, -th * .5 - ry * .35, c.r * .22, ry * .14, -.5, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    function shadow(c) { const d = Math.max(0, Math.min(1, 1 - (c.fy - c.y) / 260)); g.fillStyle = `rgba(0,0,0,${.22 * d})`; g.beginPath(); g.ellipse(c.x, c.fy + 3, c.r * (.6 + .4 * d), c.r * .22, 0, 0, Math.PI * 2); g.fill(); }
    // after they settle, the coins fly one by one into the cash number and vanish there
    const tb = to ? to.getBoundingClientRect() : null; let hits = 0;
    if (tb) life = flyAt + n * 70 + 700;
    function step(now) {
      const dt = Math.min(.033, (now - last) / 1000); last = now; const el = now - start;
      g.clearRect(0, 0, W, H);
      const fade = !tb && el > life - 500 ? Math.max(0, (life - el) / 500) : 1; g.globalAlpha = fade;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (el < c.t0 || c.gone) continue;
        if (tb && !c.fly && el >= c.t0 + 120 && c.vy > -90) { c.fly = { t: el, x0: c.x, y0: c.y, x1: tb.left + tb.width * (.25 + Math.random() * .5), y1: tb.top + tb.height * .5 }; c.fly.cx = c.x + c.vx * .22; c.fly.cy = Math.min(c.y + c.vy * .22, c.fly.y1 - 40); }   // each coin turns toward the cash at the top of its own arc (never reaches the floor), leaving in the direction it already moves
        if (c.fly) {
          const k = Math.min(1, (el - c.fly.t) / 400), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, u = 1 - e;
          c.x = u * u * c.fly.x0 + 2 * u * e * c.fly.cx + e * e * c.fly.x1; c.y = u * u * c.fly.y0 + 2 * u * e * c.fly.cy + e * e * c.fly.y1;
          c.phi += 14 * dt; c.sc = 1 - .55 * e;
          if (k >= 1) { c.gone = true; hits++; ping(hits); onHit && onHit(hits, n); if (hits === n) onDone && onDone(); }
          continue;
        }
        if (!c.rest) {
          c.vy += gr * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.phi += c.w * dt;
          if (c.y >= c.fy && c.vy > 0) {
            c.y = c.fy; c.bounces++; ping(c.bounces + (c.r > 14 ? 1 : 0));
            c.vy = -c.vy * (.38 - c.bounces * .08); c.vx *= .35; c.w *= .45;
            if (c.bounces >= 3 || Math.abs(c.vy) < 90) { c.rest = true; c.vy = 0; }
          }
          if (c.y > floorY - 140 && (c.x < minX + c.r || c.x > maxX - c.r)) { c.x = Math.max(minX + c.r, Math.min(maxX - c.r, c.x)); c.vx *= -.4; }
        } else { c.x += c.vx * dt; c.vx *= .9; c.phi += (Math.round(c.phi / Math.PI) * Math.PI - c.phi) * .25; }
        shadow(c);
      }
      cs.slice().sort((a, b) => a.y - b.y).forEach(c => { if (el >= c.t0 && !c.gone) face(c); });
      if (el < life && !(tb && hits === n)) requestAnimationFrame(step); else { cv.remove(); if (tb && hits < n) onDone && onDone(); }
    }
    requestAnimationFrame(step);
  }
  return { burst, fly, count, bump, ping, coinShower };
})();
/* ============================================================
   Views: home, setup, join, browse, board, sheet, cards, players, rules
   ============================================================ */
function profSummary(pr) {
  const G0 = newGame(); const P = newPlayer(G0, pr.id, pr.title); const f = fin(P, G0);
  return { P, f };
}

/* ---------- home ---------- */
function vHome() {
  const games = listGames(); const g = games[0];
  const when = t => new Date(t).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cont = g ? `<button class="cont" data-a="loadGame" data-id="${g.id}"><span class="t"><b>Үргэлжлүүлэх</b><small>${esc(g.names || 'Тоглоом')}${g.month ? ' · ' + MONTHS[moy(g.month) - 1] : ''}${g.mode === 'online' ? ' · онлайн ' + esc(g.room) : ''}${g.v3 ? '' : ' · хуучин дүрэм'}</small></span>
      <span class="avs">${(g.profs || []).slice(0, 4).map(id => `<span class="av" style="background-image:url(${mascot(id)})"></span>`).join('')}</span><span class="go">${ic('arrow-right')}</span></button>
      ${games.length > 1 ? `<button class="more" data-a="savedList">Хадгалсан бусад тоглоом (${games.length - 1})</button>` : ''}` : '';
  return `<section class="title">
    <div class="tbar"><span>OctoLearn</span><span class="r"><button data-a="goBrowse" aria-label="Картууд">${ic('identification-card')}</button><button data-a="rulesHome" aria-label="Дүрэм">${ic('newspaper')}</button></span></div>
    <h1>OCTO<br>FINANCE</h1><p class="sub">Цалингаа хөрөнгө болго</p><p class="sub" style="opacity:.6;font-size:12px;margin-top:4px">v3 · Хөрөнгийн шат</p>
    <div class="hero"><span class="pod"></span>${art('m_hello', 'a-idle', 'OctoFinance наймаалж')}</div>
  </section>
  <div class="dock">${cont}
    <button class="bigbtn" data-a="newLocal">Шинэ тоглоом</button>
    <button class="linebtn" data-a="onlineMenu">Онлайнаар тоглох</button>
  </div>`;
}
ACT.savedList = () => openSheet(() => `<div class="shead"><h3>Хадгалсан тоглоом</h3>${X}</div>
  <div class="clist">${listGames().map(g => `<div class="citem"><button data-a="loadGame" data-id="${g.id}" style="display:flex;gap:12px;align-items:center;flex:1;text-align:left;min-width:0"><span class="bub">${ic(g.mode === 'online' ? 'globe' : 'device-mobile')}</span><span style="min-width:0"><b>${esc(g.names || 'Тоглоом')}</b><small>${g.mode === 'online' ? 'Онлайн · ' + esc(g.room) + ' · ' : ''}${new Date(g.at).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span></button>
  <button class="iconbtn" data-a="delGame" data-id="${g.id}" aria-label="Устгах">${ic('trash-2')}</button></div>`).join('')}</div>
  ${listGames().length > 1 ? '<div class="cta"><button class="btn dangerline" data-a="delAll">Бүгдийг устгах</button></div>' : ''}`);
/* delete every saved game at once (user 2026-11-03), after a confirmation */
ACT.delAll = () => openSheet(() => `<div class="shead"><h3>Бүх тоглоомыг устгах уу?</h3></div><p class="mute">Энэ утсанд хадгалсан ${listGames().length} тоглоомын бүх тооцоо устна. Буцаах боломжгүй.</p><div class="cta"><button class="btn" data-a="savedList">Болих</button><button class="btn go dangerfill" data-a="delAllOk">Бүгдийг устгах</button></div>`);
ACT.delAllOk = () => { const keep = G && G.id; for (const g of listGames()) if (g.id !== keep) deleteGame(g.id); closeSheet(); render(); toast('Бүгдийг устгалаа'); };
ACT.newGame = () => {
  UI.setup = { mode: 'online', sel: null,   // no profession picked by default (user 2026-11-03: players started as Багш without noticing)
    name: (UI.setup && UI.setup.name) || '', settings: Object.assign({}, DEFAULT_SETTINGS), join: false, code: '', err: '' };
  UI.view = 'setup'; render(); window.scrollTo(0, 0);
};
ACT.goJoin = () => { closeSheet(); ACT.newGame(); UI.setup.join = true; render(); };
ACT.newOnline = () => { closeSheet(); ACT.newGame(); UI.setup.mode = 'online'; render(); };
ACT.newLocal = () => { ACT.newGame(); UI.setup.mode = 'local'; render(); };
/* «Онлайнаар тоглох» (user 2026-11-03): open a room or join one with a code */
function fOnline() {
  const opt = (a, icn, t, s) => `<button class="on-opt" data-a="${a}"><span class="on-i">${ic2(icn)}</span><span class="on-t"><b>${t}</b><small>${s}</small></span><span class="on-go">${ic2('r:caret-right')}</span></button>`;
  return `<div class="shead"><h3>Онлайнаар тоглох</h3>${X}</div>
  <div class="on-list">${opt('newOnline', 'r:users-three', 'Өрөө нээх', 'Найзууддаа 6 оронтой код өгнө')}${opt('goJoin', 'd:identification-card', 'Кодоор нэгдэх', 'Найзынхаа өрөөний кодыг оруулна')}</div>`;
}
ACT.onlineMenu = () => openSheet(fOnline);
ACT.goBrowse = () => { UI.view = 'browse'; render(); };
ACT.loadGame = d => { if (UI.sheetFn) { UI.sheetFn = null; FS = {}; $('#sheet').hidden = true; } if (loadGame(d.id)) render(); else toast('Тоглоом олдсонгүй'); };
ACT.delGame = d => { openSheet(() => `<div class="shead"><h3>Тоглоомыг устгах уу?</h3></div><p class="mute">Энэ утсанд хадгалсан тоглоомын бүх тооцоо устна.</p><div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="delGameOk" data-id="${d.id}">Устгах</button></div>`); };
ACT.delGameOk = d => { deleteGame(d.id); closeSheet(); render(); toast('Устгалаа'); };
ACT.rulesHome = () => openSheet(() => `<div class="shead"><h3>Дүрэм</h3>${X}</div>${rulesHTML()}`);

/* ---------- setup: pick your character (one player per phone) ---------- */
// Малчин (PR-12) is out of the game (user 2026-11-03); kept in the data so older saved games still load
const PROF_OUT = ['PR-12'];
const PICKABLE = () => OF.profs.filter(p => !PROF_OUT.includes(p.id));
function vSetup() {
  const S = UI.setup; const join = S.join;
  if (!S.sel) return vSetupPick(S, join);
  const pr = PROF[S.sel];
  const { P, f } = profSummary(pr);
  return `<section class="hs${join ? ' j' : ''}">
    <div class="hs-bar"><button class="tb" data-a="home" aria-label="Буцах">${ic('arrow-right')}</button><b>${join ? 'Өрөөнд нэгдэх' : S.mode === 'local' ? 'Шинэ тоглоом' : 'Өрөө нээх'}</b><span class="tb" aria-hidden="true" style="visibility:hidden"></span></div>
    <h1 class="${pr.title.length > 14 ? 'long' : ''}">${esc(pr.title)}</h1><p class="sub">Сарын ашиг ${fmt(f.cf, { sign: true })}</p>
    <div class="hs-stage"><span class="pod"></span><img id="hsImg" class="a-idle" src="${mascot(pr.id)}" alt="${esc(pr.title)}" data-a="hsHop" style="cursor:pointer">
      <button class="arr l" data-a="profStep" data-d="-1" aria-label="Өмнөх мэргэжил">${ic('arrow-right')}</button><button class="arr r" data-a="profStep" data-d="1" aria-label="Дараагийн мэргэжил">${ic('arrow-right')}</button></div>
    <div class="hs-nums"><span>Цалин<b>${fmtS(f.salary)}</b></span><span>Зардал<b>${fmtS(f.expenses)}</b></span><span>Эхлэх мөнгө<b>${fmtS(P.cash + (P.efund || 0))}</b></span></div>
  </section>
  <div class="dock hs-dock">
    <div class="hs-more"><span>${PICKABLE().length} мэргэжил</span><button data-a="profInfo">Дэлгэрэнгүй тоо ›</button></div>
    <div class="hs-strip" id="hsStrip">${PICKABLE().map(p => `<button data-a="profPick" data-id="${p.id}" aria-pressed="${p.id === S.sel}" aria-label="${esc(p.title)}" style="background-image:url(${mascot(p.id)})"></button>`).join('')}</div>
    ${join ? `<input class="hs-inp code" id="jcode" inputmode="numeric" data-raw maxlength="6" placeholder="Өрөөний 6 оронтой код" value="${esc(S.code)}" data-in="scode" aria-label="Өрөөний код">` : ''}
    <input class="hs-inp" id="sname" placeholder="Таны нэр" value="${esc(S.name)}" data-in="sname" maxlength="18" aria-label="Таны нэр">
    ${S.err ? `<p class="hs-err">${esc(S.err)}</p>` : ''}
    ${hsStartBtn(S)}
  </div>`;
}
function hsStartBtn(S) { return S.join ? `<button class="bigbtn hs-go" data-a="joinGo">Нэгдэх</button>` : S.mode === 'local' ? `<button class="bigbtn hs-go" data-a="startGame" data-m="local">Эхлэх</button>` : `<button class="bigbtn hs-go" data-a="startGame" data-m="online">Өрөө нээх</button>`; }
/* nothing picked yet: the stage asks for a profession, the start buttons stay off until one is chosen */
function vSetupPick(S, join) {
  return `<section class="hs${join ? ' j' : ''}">
    <div class="hs-bar"><button class="tb" data-a="home" aria-label="Буцах">${ic('arrow-right')}</button><b>${join ? 'Өрөөнд нэгдэх' : S.mode === 'local' ? 'Шинэ тоглоом' : 'Өрөө нээх'}</b><span class="tb" aria-hidden="true" style="visibility:hidden"></span></div>
    <h1>Мэргэжлээ сонго</h1><p class="sub">Биет картаараа ижил мэргэжлийг доороос дарна</p>
    <div class="hs-stage"><span class="pod"></span><img id="hsImg" class="a-idle hs-q" src="${ART('m_hello')}" alt="" data-a="hsHop" style="cursor:pointer">
      <button class="arr l" data-a="profStep" data-d="-1" aria-label="Өмнөх мэргэжил">${ic('arrow-right')}</button><button class="arr r" data-a="profStep" data-d="1" aria-label="Дараагийн мэргэжил">${ic('arrow-right')}</button></div>
    <div class="hs-nums hs-nums0"><span>Цалин<b>—</b></span><span>Зардал<b>—</b></span><span>Эхлэх мөнгө<b>—</b></span></div>
  </section>
  <div class="dock hs-dock">
    <div class="hs-more hs-ask">${ic('arrow-right')}<span>${PICKABLE().length} мэргэжлээс нэгийг сонго</span></div>
    <div class="hs-strip hs-pulse" id="hsStrip">${PICKABLE().map(p => `<button data-a="profPick" data-id="${p.id}" aria-pressed="false" aria-label="${esc(p.title)}" style="background-image:url(${mascot(p.id)})"></button>`).join('')}</div>
    ${join ? `<input class="hs-inp code" id="jcode" inputmode="numeric" data-raw maxlength="6" placeholder="Өрөөний 6 оронтой код" value="${esc(S.code)}" data-in="scode" aria-label="Өрөөний код">` : ''}
    <input class="hs-inp" id="sname" placeholder="Таны нэр" value="${esc(S.name)}" data-in="sname" maxlength="18" aria-label="Таны нэр">
    ${S.err ? `<p class="hs-err">${esc(S.err)}</p>` : ''}
    <button class="bigbtn hs-go" disabled>Мэргэжлээ сонгоно уу</button>
  </div>`;
}
function settingsHTML(s) {
  return `<div class="switch"><span>Цалингийн өдөр<small>Сарын ашгийг ${s.payX} удаа авна</small></span><span class="pill">× ${s.payX}</span></div>
    <div class="switch"><span>Ажлын эрсдэл<small>Шоо мэргэжлийн тоонд буувал 1 сарын цалин орохгүй; нөөц сан ${s.reserveMonths} сараас бага бол ${s.firedSkip} ээлж өнжинө</small></span></div>
    <div class="switch"><span>Аппын зээл<small>${fmtS(s.emergencyUnit)}-ийн нэгжээр, сарын ${s.loanPct}% хүү, зөвхөн хүүг сар бүр төлнө. Банкны зээл: жилийн ${s.bankRate}%, ${s.bankMonths} сар, үндсэн төлөлт + хүү. Хэрэглээний зээлийн төлбөр цалингийн ${s.loanCap}%-иас хэтрэхгүй.</small></span></div>
    <div class="switch"><span>Хадгаламж<small>6 сар 13% · 12 сар 15% · 12 сарын нийлмэл 18% (жилийн хүү). Эрт цуцалбал 1% / 2% / 3%.</small></span></div>
    <div class="switch"><span>Инфляц<small>Жил бүр амьжиргааны зардал эхлэх дүнгийн ${s.inflPct}%-иар өснө</small></span></div>
    <div class="switch"><span>Эрх чөлөө<small>3 нөхцөл 2 цалингийн өдөр дараалан: идэвхгүй орлого ≥ амьжиргааны зардал, ${s.reserveMonths} сарын нөөц, яаралтай/хувийн зээлгүй</small></span></div>`;
}
function hsSelect(id) {
  const had = UI.setup.sel;
  const hop = () => { const img = $('#hsImg'); if (!img) return; img.classList.remove('a-idle'); void img.offsetWidth; img.classList.add('a-hop'); setTimeout(() => { img.classList.remove('a-hop'); img.classList.add('a-idle'); }, 720); };
  if (had && had === id) return hop();   // second tap on the chosen profession: the mascot hops (user 2026-11-03); switching itself stays still
  UI.setup.sel = id; UI.setup.err = '';
  const strip = $('#hsStrip'), sl = strip ? strip.scrollLeft : 0;
  // switching between professions: patch the page in place instead of re-rendering it (user 2026-11-03: it flashed)
  if ($('#hsImg') && hsPatch(id)) {   // the first pick too: no re-render (user 2026-11-03: it looked like a refresh)
    if (strip) { strip.querySelectorAll('[data-a=profPick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      const b = strip.querySelector('[aria-pressed="true"]'); if (b) strip.scrollTo({ left: b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' }); }
    return;
  }
  render();
  const s2 = $('#hsStrip');
  if (s2) {
    s2.scrollLeft = sl;
    const b = s2.querySelector('[aria-pressed="true"]');
    if (b) s2.scrollTo({ left: b.offsetLeft - s2.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
  }
}
function hsPatch(id) {
  const pr = PROF[id]; if (!pr) return false;
  const { P, f } = profSummary(pr), hs = document.querySelector('section.hs'); if (!hs) return false;
  const h1 = hs.querySelector('h1'), sub = hs.querySelector('p.sub'), img = $('#hsImg'), nums = hs.querySelectorAll('.hs-nums b');
  if (!h1 || !img || nums.length < 3) return false;
  h1.textContent = pr.title; h1.classList.toggle('long', pr.title.length > 14); if (sub) sub.textContent = 'Сарын ашиг ' + fmt(f.cf, { sign: true });
  const src = mascot(pr.id); if (img.getAttribute('src') !== src) { const pre = new Image(); pre.onload = () => { img.src = src; }; pre.src = src; } img.alt = pr.title;
  nums[0].textContent = fmtS(f.salary); nums[1].textContent = fmtS(f.expenses); nums[2].textContent = fmtS(P.cash + (P.efund || 0));
  const err = document.querySelector('.hs-err'); if (err) err.remove();
  // first pick: turn the «choose one» prompt into the normal dock
  const ask = document.querySelector('.hs-more.hs-ask');
  if (ask) { ask.className = 'hs-more'; ask.innerHTML = `<span>${PICKABLE().length} мэргэжил</span><button data-a="profInfo">Дэлгэрэнгүй тоо ›</button>`; }
  const st = $('#hsStrip'); if (st) st.classList.remove('hs-pulse');
  const go = document.querySelector('.hs-go[disabled]'); if (go) go.outerHTML = hsStartBtn(UI.setup);
  img.classList.remove('hs-q'); hs.querySelector('.hs-nums').classList.remove('hs-nums0');
  return true;
}
ACT.profPick = d => hsSelect(d.id);
ACT.hsHop = () => { if (UI.setup && UI.setup.sel) hsSelect(UI.setup.sel); };   // tapping the mascot makes it hop (user 2026-11-03)
ACT.profStep = d => { const ids = PICKABLE().map(p => p.id); const i = ids.indexOf(UI.setup.sel); hsSelect(i < 0 ? ids[+d.d > 0 ? 0 : ids.length - 1] : ids[(i + +d.d + ids.length) % ids.length]); };
ACT.profRand = () => { const ids = PICKABLE().map(p => p.id).filter(x => x !== UI.setup.sel); hsSelect(ids[Math.floor(Math.random() * ids.length)]); };
ACT.sname = (d, el) => { UI.setup.name = el.value; };
ACT.scode = (d, el) => { UI.setup.code = el.value.replace(/\D/g, ''); };
ACT.profInfo = () => { FS = { sel: UI.setup.sel }; openSheet(fProf); };
function fProf() {
  const pr = PROF[FS.sel];
  const { P, f } = profSummary(pr);
  const mismatch = pr.printed && pr.printed.exp && Math.abs(pr.printed.exp - f.expenses) > 1000;
  return `<div class="shead"><h3>${esc(pr.title)}</h3>${X}</div>
  <div class="grid2">
    <div class="kv"><small>Цалин</small><b>${fmtS(f.salary)}</b></div>
    <div class="kv"><small>Сарын нийт зардал</small><b>${fmtS(f.expenses)}</b></div>
    <div class="kv"><small>Сарын ашиг</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmt(f.cf, { sign: true })}</b></div>
    <div class="kv"><small>Эхлэх бэлэн мөнгө</small><b>${fmtS(P.cash + (P.efund || 0))}</b><small>${P.v3 ? (P.efund ? `Үүнээс яаралтай сан ${fmtS(P.efund)}` : '') : `Хуримтлал ${fmtS(P.cash - P.salary)} + эхний цалин ${fmtS(P.salary)}`}</small></div>
  </div>
  <div class="box lines"><div class="sec">Сарын зардал</div>${P.exps.filter(e => e.v).map(e => `<div class="ln"><span>${esc(e.l)}</span><b>${fmt(e.v)}</b></div>`).join('')}
    ${P.debts.some(d => d.bal) ? `<div class="sec">Өрийн үлдэгдэл</div>` : ''}${P.debts.filter(d => d.bal).map(d => `<div class="ln"><span>${esc(d.l)}<span class="sub">${d.monthly ? d.rate + '%/сар' : 'жилийн ' + d.rate + '%'}</span></span><b>${fmtS(d.bal)}</b></div>`).join('')}
    <div class="ln"><span>Хүүхэд бүрт</span><b>+${fmt(pr.child)}</b></div></div>
  ${pr.basis ? `<p class="basis">Цалингийн эх сурвалж: ${esc(pr.basis)}</p>` : ''}
  ${mismatch ? `<div class="alert">${ic('warning-circle')}<span>Картын нэгтгэсэн дүн (${fmtS(pr.printed.exp)}) мөрүүдийн нийлбэртэй таарахгүй байна. Апп мөр бүрээр тооцно.</span></div>` : ''}
  <div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`;
}
ACT.startGame = async d => {
  const S = UI.setup; const mode = (d && d.m) || S.mode;
  if (!S.sel) { S.err = 'Эхлээд мэргэжлээ сонгоно уу'; return render(); }
  const name = (S.name || '').trim() || PROF[S.sel].title;
  const g = newGame({ mode, settings: S.settings });
  g.players.push(newPlayer(g, S.sel, name, { color: COLORS[0] }));
  g.decks = {};
  if (mode === 'online') {
    g.started = false;   // the admin starts it from the lobby (user 2026-11-11)
    const ok = await NET.create(g);
    if (!ok) return;
  }
  G = g; OF._G = G; UI.view = mode === 'online' ? 'lobby' : 'game'; UI.tab = 'board'; UI.undo = [];
  log(G, null, 'Тоглоом эхэллээ', 0, null, 'start');
  save(); render(); window.scrollTo(0, 0);
  if (mode === 'online') setTimeout(() => openSheet(fRole8, { modal: true }), 250);   // ask the admin: play too, or only run the room (user 2026-11-12)
};
/* the room's creator chooses: play like everyone else, or only be the admin (user 2026-11-12: «Админ хийх үү, тоглолтонд орох уу») */
function fRole8() {
  return `<div class="ask8 role8"><span class="ask8-i">${ic2('r:users-three')}</span>
  <h3>Та энэ өрөөнд юу хийх вэ?</h3><p>Өрөө нээсэн хүн админ болно. Тоглоомд орох эсэхээ сонгоно уу.</p>
  <div class="role8-l">
    <button class="role8-o" data-a="role8" data-v="play"><b>Тоглоомд орно</b><small>Бусадтай адил ээлжээр тоглоно. Админ эрх хэвээр.</small></button>
    <button class="role8-o" data-a="role8" data-v="admin"><b>Зөвхөн админ</b><small>Ээлжинд орохгүй. Тоглоомыг эхлүүлж, ээлж, тоглогчдыг удирдана.</small></button>
  </div><p class="role8-n">Дараа нь лобби эсвэл «Ээлжийн дараалал» дээрээс өөрчилж болно.</p></div>`;
}
fRole8._zp = 1;
ACT.role8 = async d => { const out = d.v === 'admin'; closeSheet();
  if (!!G.hostOut !== out) { if (await NET.setOrder((G.order || [G.me]).slice(), out)) { toast(out ? 'Та зөвхөн админ байна' : 'Та тоглоомд орно'); render(); } } else toast(out ? 'Та зөвхөн админ байна' : 'Та тоглоомд орно'); };
ACT.joinGo = async () => {
  const S = UI.setup;
  if (!S.sel) { S.err = 'Эхлээд мэргэжлээ сонгоно уу'; return render(); }
  if (S.code.length !== 6) { S.err = 'Өрөөний 6 оронтой кодоо оруулна уу'; return render(); }
  S.err = '';
  UI.join = { code: S.code, name: S.name, prof: S.sel, err: '' };
  const g = await NET.joinRoom(S.code, (S.name || '').trim(), S.sel);
  if (!g) { S.err = UI.join.err || 'Нэгдэж чадсангүй'; render(); return; }
  G = g; OF._G = G; UI.view = g.started ? 'game' : 'lobby'; UI.tab = 'board'; UI.undo = [];
  if (g.rejoined) { delete g.rejoined; toast(`${me().name} тоглогчоор үргэлжлүүллээ`); } else if (g.started) toast('Тоглоом аль хэдийн эхэлсэн байна');
  save(); render();
};

/* ---------- lobby: share the code, see who joined ---------- */
function vLobby() {
  const ps = G.players;
  return `<section class="hs lobby">
    <div class="hs-bar"><button class="tb" data-a="home" aria-label="Нүүр хуудас">${ic('arrow-right')}</button><b>Өрөө · ${ps.length} тоглогч</b><span class="tb ghost"></span></div>
    <h1 class="lh">Найзуудаа<br>урь</h1>
    <div class="code6">${String(G.room || '').split('').map(c => `<b>${esc(c)}</b>`).join('')}</div>
    <p class="sub">Найзууд «Кодоор нэгдэх» дээр энэ кодыг оруулна</p>
    <div class="lb-share"><button data-a="copyCode">${ic('identification-card')} Код хуулах</button></div>
  </section>
  <div class="dock hs-dock">
    <div class="lb-list">${ps.map(p => `<div class="lb-p">${avatar(p)}<span><b>${esc(p.name)}${p.id === G.me ? ' · та' : ''}</b><small>${esc(PROF[p.profId].title)}</small></span></div>`).join('')}
      <div class="lb-wait">${NET.isHost() ? 'Найзуудаа хүлээж байна…' : 'Админ тоглоомыг эхлүүлэхийг хүлээж байна…'}</div></div>
    ${NET.isHost() ? `<button class="od8-host" data-a="lobbyHostOut" aria-pressed="${!G.hostOut}"><span><b>Би (админ) ээлжинд орно</b><small>${G.hostOut ? 'Ээлжинд орохгүй, зөвхөн удирдана' : 'Бусадтай адил ээлжээр тоглоно'}</small></span><i></i></button>` : ''}
    ${NET.isHost() || G.started ? `<button class="bigbtn" data-a="lobbyGo">Тоглоом эхлүүлэх</button>` : `<button class="bigbtn" disabled aria-disabled="true" style="opacity:.55">Зөвхөн админ эхлүүлнэ</button>`}
  </div>`;
}
ACT.copyCode = async () => { try { await navigator.clipboard.writeText(G.room); toast('Код хууллаа: ' + G.room); } catch (e) { toast('Код: ' + G.room); } };
ACT.lobbyHostOut = async () => { if (await NET.setOrder((G.order || G.players.map(p => p.id)).slice(), !G.hostOut)) render(); };
ACT.lobbyGo = async () => {
  if (G.mode === 'online' && !G.started) { if (!NET.isHost()) return toast('Зөвхөн админ тоглоомыг эхлүүлнэ'); if (!await NET.start()) return; }
  UI.view = 'game'; UI.tab = 'board'; render(); window.scrollTo(0, 0); };

/* ---------- browse (no game) ---------- */
function vBrowse() {
  return `<div class="ptitle"><button class="iconbtn back" data-a="home" aria-label="Буцах">${ic('arrow-right')}</button><h2>Картууд</h2></div>${cardsBody(true)}`;
}

/* ---------- dial ---------- */
function dialSVG(level) {
  const sq = level === 2 ? OF.board.sq2 : OF.board.sq1;
  const n = sq.length, cx = 170, cy = 170, R1 = 162, R0 = level === 2 ? 122 : 112, gap = level === 2 ? .7 : .9;
  const P = me();
  const color = s => s.color || ({ PAY2: '#B8860B', OPP2: '#1F6B45', RISK: '#6E1A14', DREAM: '#5B3A86', TAX: '#4A4A4A', INV: '#0F2D55' }[s.type] || '#13234B');
  const icon = s => ({ PAY: 'coins', OPP: 'sparkle', DOO: 'receipt', MKT: 'chart-line', CHILD: 'baby', TSAGAAN: 'gift', FIRED: 'briefcase', PAY2: 'coins', OPP2: 'flag', RISK: 'lightning', DREAM: 'star', TAX: 'bank', INV: 'handshake' }[s.type] || 'circle-dot');
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  let out = '';
  const pos = level === 2 ? P.pos2 : P.pos;
  sq.forEach((s, i) => {
    const a0 = (-90 + i * 360 / n + gap / 2) * Math.PI / 180, a1 = (-90 + (i + 1) * 360 / n - gap / 2) * Math.PI / 180;
    const d = `M${pt(R1, a0)} A${R1},${R1} 0 0 1 ${pt(R1, a1)} L${pt(R0, a1)} A${R0},${R0} 0 0 0 ${pt(R0, a0)} Z`;
    const am = (a0 + a1) / 2, rm = (R1 + R0) / 2, x = cx + rm * Math.cos(am), y = cy + rm * Math.sin(am);
    const sz = level === 2 ? 15 : 18;
    out += `<g class="sq" data-a="sq" data-i="${i}" role="button" tabindex="0" aria-label="${esc(s.name)}" opacity="${i === pos ? 1 : .9}"><path d="${d}" fill="${color(s)}" ${i === pos ? 'stroke="#fff" stroke-width="2.5"' : ''}/>
      <g transform="translate(${(x - sz / 2).toFixed(1)},${(y - sz / 2).toFixed(1)})" color="#fff"><svg width="${sz}" height="${sz}" viewBox="0 0 256 256" fill="currentColor">${OF.icons[icon(s)] || ''}</svg></g></g>`;
  });
  // tokens: everyone on this level
  const players = G.players.filter(p => !p.out && p.level === level);
  players.forEach((p, k) => {
    const ps = level === 2 ? p.pos2 : p.pos;
    const am = (-90 + (ps + .5) * 360 / n) * Math.PI / 180;
    const off = (k - (players.length - 1) / 2) * 2.2 * Math.PI / 180;
    const rt = R1 + 3 + (p.id === P.id ? 0 : 0);
    const x = cx + rt * Math.cos(am + off), y = cy + rt * Math.sin(am + off);
    const big = p.id === P.id;
    out += `<g class="tok"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 13 : 9}" fill="${p.color}" stroke="#fff" stroke-width="${big ? 3 : 2}"/>
      <text x="${x.toFixed(1)}" y="${(y + (big ? 4.5 : 3.5)).toFixed(1)}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="${big ? 12 : 9}" fill="#fff">${esc(initials(p.name)[0])}</text></g>`;
  });
  return `<svg viewBox="-6 -6 352 352" class="dial" role="group" aria-label="${level === 2 ? 'Түвшин 2 самбар' : 'Түвшин 1 самбар'}">${out}</svg>`;
}

/* ---------- board ---------- */
/* home actions: the player taps what the board square / card says — no dice entry */
/* flat 2D pictures for the action tiles (user 2026-10-15) */
/* each tile wears its printed deck's colour (user 2026-10-15) */
const COLT = { JB: DECKS.JB.c, TB: DECKS.TB.c, AZ: DECKS.AZ.c, ZZ: DECKS.ZZ.c, PAY: '#F7AA21', OPP2: DECKS.NB.c, RISK: DECKS.IE.c, INV: '#082567', DREAM: DECKS.MO.c, PAY2: '#F7AA21' };
function actGrid(P) {
  const L2 = P.level === 2;
  // each tile shows its own 3D picture so the five read apart at a glance (user 2026-10-15)
  const PIC = { JB: 'idea', TB: 'house', AZ: 'expense', ZZ: 'market', PAY: 'coins', OPP2: 'shop', RISK: 'risk', INV: 'bank', DREAM: 'dream', PAY2: 'coins' };
  const tile = (a, k, i, n, cls = '') => `<button class="at ${cls}" data-a="${a}" ${a === 'deckGo' ? `data-k="${k}"` : `data-t="${k}"`}><span class="icol" style="--c:${COLT[k] || '#082567'}">${ic(i)}</span><b>${n}</b></button>`;
  return `<div class="acts">${L2
    ? tile('sqType', 'OPP2', 'flag', 'Үндэсний боломж') + tile('sqType', 'RISK', 'lightning', 'Их эрсдэл') + tile('sqType', 'INV', 'handshake', 'Хөрөнгө оруулагч') + tile('sqType', 'DREAM', 'star', 'Мөрөөдөл') + tile('sqType', 'PAY2', 'coins', 'Жилийн орлого', 'pay')
    : tile('deckGo', 'JB', 'sparkle', 'Жижиг боломж') + tile('deckGo', 'TB', 'buildings', 'Том боломж') + tile('deckGo', 'AZ', 'receipt', 'Зарлага') + tile('deckGo', 'ZZ', 'chart-line-up', 'Зах зээл') + tile('sqType', 'PAY', 'coins', 'Цалин', 'pay')}</div>`;
}
ACT.deckGo = d => { const P = me(); if (!canAct(P)) return; FS = { deck: d.k }; openSheet(fPick); };
ACT.moreSq = () => openSheet(() => { const P = me(); const skip = P.level === 2 ? ['PAY2', 'OPP2', 'RISK', 'INV', 'DREAM'] : ['PAY', 'OPP', 'DOO', 'MKT'];
  return `<div class="shead"><h3>Онцгой нүд</h3>${X}</div><p class="mute" style="font-size:13px">Самбар дээр буусан нүдээ сонгоно уу.</p>
  <div class="box land">${landList(P).filter(([t]) => !skip.includes(t)).map(([t, i, n], k) => `<button data-a="sqPick" data-t="${t}" style="--k:${k}"><span class="tile"><img src="${ART(i)}" alt=""></span>${n}</button>`).join('')}</div>`; });
function landList(P) {
  const lv = P.level; const sqs = lv === 2 ? OF.board.sq2 : OF.board.sq1;
  const LAND = lv === 2
    ? [['PAY2', 'i_coins', 'Жилийн орлого'], ['OPP2', 'i_shop', 'Үндэсний боломж'], ['RISK', 'i_risk', 'Их эрсдэл'], ['INV', 'i_bank', 'Хөрөнгө оруулагч'], ['TAX', 'i_expense', 'Татвар'], ['DREAM', 'i_dream', 'Мөрөөдөл']]
    : [['PAY', 'i_coins', 'Цалин'], ['OPP', 'i_idea', 'Боломж'], ['DOO', 'i_expense', 'Зарлага'], ['MKT', 'i_market', 'Зах зээл'], ['CHILD', 'i_child', 'Хүүхэд'], ['EDU', 'p_PR-01', 'Боловсрол'], ['HEALTH', 'p_PR-02', 'Эрүүл мэнд'], ['MARRY', 'i_tsagaan', 'Гэрлэх'], ['TSAGAAN', 'i_tsagaan', 'Баяр ёслол'], ['FIRED', 'm_fired', 'Халагдлаа']];
  return LAND.filter(([t]) => sqs.some(q => q.type === t));
}
const SVG_EYE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_EYE_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.700 9.700 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const SVG_UP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const SVG_DN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
ACT.hideCash = () => { UI.hideCash = !UI.hideCash; try { localStorage.setItem('of2.hide', UI.hideCash ? '1' : ''); } catch (e) {}
  const P = G && me(); if (P) { P.hideCash = UI.hideCash; save(); }   // the player's own choice travels with his state: Тоглогчид hides his cash on every phone (user 2026-11-11)
  render(); };
/* is this player's cash hidden? my own phone uses my toggle; other players use the flag they set */
function cashHidden(p) { if (!p || !G) return false; if (me() && p.id === me().id) return !!UI.hideCash;
  if (G.mode === 'online' && G.host === G.me) return false;   // the room admin always sees everyone's cash (user 2026-11-12)
  return !!p.hideCash; }
const cashTxt = p => cashHidden(p) ? '••••••' : fmtS(p.cash);
try { UI.hideCash = !!localStorage.getItem('of2.hide'); } catch (e) {}
function vBoard() {
  const P = me(); const f = fin(P, G);
  const v3 = isV3(P);
  const lv = P.level;
  const dream = P.dream ? CARD[P.dream] : null;
  const others = G.players.filter(p => p.id !== P.id);
  const timer = G.settings.shortGame ? Math.max(0, G.settings.shortMins * 60000 - (Date.now() - G.startedAt)) : null;
  const alerts = [];
  if (P.out) alerts.push(`<div class="alert neg">${ic('warning')}<span><b>Дампуурсан</b>Энэ тоглогч тоглоомоос гарсан.</span></div>`);
  if (P.cash < 0 && !P.out) alerts.push(`<div class="alert neg">${ic('warning-circle')}<span><b>Бэлэн мөнгө ${fmt(P.cash)}</b>Зээл авах эсвэл хөрөнгөө зарж нөхнө үү.<span class="row">${P.free > 0 ? `<button class="minibtn go" data-a="freeCover" data-amt="${Math.min(P.free, -P.cash)}">Хадгаламжаас ${fmtS(Math.min(P.free, -P.cash))}</button>` : ''}${v3 ? `<button class="minibtn go" data-a="lackAsk" data-go="pdLoanDone" data-need="0">Зээл авах</button>` : `<button class="minibtn ${P.free > 0 ? '' : 'go'}" data-a="openLoan">Зээл авах</button>`}<button class="minibtn" data-a="openSell">Хөрөнгө зарах</button>${v3 ? '' : '<button class="minibtn" data-a="bankrupt">Дампуурал</button>'}</span></span></div>`);
  if (v3 && P.bkWarn) alerts.push(`<div class="alert neg">${ic('warning')}<span><b>Дампуурлын анхааруулга ${P.bkWarn}/${BK.paydays}</b>Бүх хөрөнгөө зараад ч өрөө төлж чадахгүй байна. Яаралтай зээлээ бууруулна уу.</span></div>`);
  if (v3 && P.bk) alerts.push(`<div class="alert">${ic('warning-circle')}<span><b>Найдваргүй зээлдэгч</b>Цалин −${BK.salCut}% · банкны зээл ${Math.round(BK.bankX * 100)}% · яаралтай зээл ${fmtS(Math.round(salaryOf(P) * BK.emX))} хүртэл</span></div>`);
  if (lv === 1 && !P.v3) alerts.push(`<button class="alert neg edu-tap" data-a="newGame">${ic('warning-circle')}<span><b>Хуучин дүрмийн тоглоом</b>Шинэ дүрмээр тоглохын тулд Шинэ тоглоом эхлүүлнэ</span><em>›</em></button>`);
  if (false && v3 && !P.start && canAct(P)) alerts.push(`<button class="alert edu-tap" data-a="deckGo" data-k="AE">${ic('identification-card')}<span><b>Амьдралын эхлэл</b>Картынхаа дугаарыг оруулна</span><em>№</em></button>`);
  if (P.edu > 0) alerts.push(`<button class="alert ok edu-tap" data-a="eduUse">${ic('dice-5')}<span><b>${v3 ? '2 шоогоор явна' : '3 шоогоор хаяна'} · ${P.edu} ээлж</b>Хаясны дараа дарна</span><em>−1</em></button>`);
  if (v3) for (const a of P.assets.filter(a => a.kind === 'bond' && a.left <= 0)) alerts.push(`<button class="alert edu-tap" data-a="sellOne" data-id="${a.id}">${ic('bank')}<span><b>${esc(a.name)}</b>Хугацаа дууслаа · Сунгах уу?</span><em>›</em></button>`);
  if (P.skip > 0) alerts.push(`<div class="alert">${ic('clock')}<span><b>${P.skip} ээлж өнжинө</b>Ажлаас халагдсан тул шоо хаяхгүй.</span></div>`);
  if (lv === 1 && P.streak >= 2) alerts.push(`<div class="alert ok">${ic('trophy')}<span><b>${v3 ? 'Түвшин 1 дууслаа!' : 'Санхүүгийн эрх чөлөө!'}</b>${v3 ? 'Идэвхгүй орлого зардлын 2 дахинд хүрлээ.' : 'Эрх чөлөөний 3 нөхцөлийг 2 цалингийн өдөр дараалан хангалаа.'}<span class="row"><button class="minibtn go" data-a="levelUp">${G.settings.endAtL1 ? 'Ялалтаа баталгаажуулах' : 'Түвшин 2 руу гарах'}</button></span></span></div>`);
  if (lv === 2 && dream && P.cash >= dream.fx.price) alerts.push(`<div class="alert ok">${ic('star')}<span><b>Мөрөөдлийн мөнгө бүрдлээ</b>Мөрөөдөл нүдэнд буувал ялна.</span></div>`);
  for (const t of P.pending) alerts.push(`<div class="alert">${ic('clock')}<span><b>${esc(t.name)}</b>${t.left > 0 ? `${t.left} цалингийн өдрийн дараа орлого орно` : 'Хугацаа болсон'}${t.left <= 0 ? `<span class="row"><button class="minibtn go" data-a="resolveTrade" data-id="${t.id}">Үр дүнг гаргах</button></span>` : ''}</span></div>`);
  const conds = G.conds.filter(c => !c.paydays || c.paydays > 0);
  for (const c of conds) alerts.push(`<div class="alert">${ic('newspaper')}<span><b>Зах зээлийн нөхцөл · ${esc(c.card)}</b>${esc(c.txt)}</span></div>`);
  const recent = (P.hist || []).slice(0, 5);
  const sqs = lv === 2 ? OF.board.sq2 : OF.board.sq1;
  const here = sqs[lv === 2 ? P.pos2 : P.pos];
  const act = canAct(P) && !P.out;
  const pct = Math.max(0, Math.min(1, lv === 1 ? f.progress : dream ? P.cash / dream.fx.price : 0));
  const R = 22, C = 2 * Math.PI * R;
  const ring = `<svg class="ring" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${R}" class="tr"/><circle cx="26" cy="26" r="${R}" class="fg" style="stroke-dasharray:${C.toFixed(1)};--off:${(C * (1 - pct)).toFixed(1)};--c:${C.toFixed(1)}"/></svg><b>${Math.floor(pct * 100)}%</b>`;
  const yrs = P.month ? Math.floor((P.month - 1) / 12) : 0;
  const mo = P.month || 0, my = Math.floor(mo / 12), mr = mo % 12;   // time played, not a calendar month (user 2026-11-05)
  const mon = my ? (mr ? `${my} жил ${mr} сар` : `${my} жил`) : `${mr} сар`;
  const nAs = P.assets.length;
  if (v3 && lv === 1) return vHome3(P, f, alerts, act, mon);   // new home (user 2026-10-31)
  return `<div class="lobby">
  <div class="res">
    <span class="mo">${mon} · Түвшин ${lv}</span>
    <button class="rbtn" data-a="undo" aria-label="Буцаах" ${UI.undo.length ? '' : 'disabled'}>${ic('rotate-ccw')}</button>
    <button class="rbtn r2" data-a="menu" aria-label="Цэс">${ic('users')}</button>
  </div>
  ${others.length ? (() => { const lead = [...G.players].filter(p => !p.out).sort((a, b) => (b.level - a.level) || ((fin(b, G).progress || 0) - (fin(a, G).progress || 0)) || (fin(b, G).stablePassive - fin(a, G).stablePassive))[0];
    return `<div class="opp"><button class="avs" data-a="tab" data-t="players">${others.slice(0, 4).map(o => `<span style="background-image:url(${mascot(o.profId)})"></span>`).join('')}<small>+${others.length} тоглогч</small></button>${lead ? `<span class="lead">${ic('crown')}1-рт: ${esc(lead.id === P.id ? 'та' : lead.name)}</span>` : ''}</div>`; })() : ''}
  <div class="nb"><div class="ncard">
    <div class="ntop"><button class="lb" data-a="hideCash" aria-label="Дүнг нуух">Бэлэн мөнгө ${UI.hideCash ? SVG_EYE_OFF : SVG_EYE}</button><span class="pill ${f.cf < 0 ? 'neg' : ''}">${f.cf < 0 ? '▼' : '▲'} ${lv === 1 ? fmt(f.cf, { sign: true }) + '/сар' : fmtS(f.cf * 12, { sign: true }) + '/жил'}</span></div>
    <div class="num">${UI.hideCash ? '••••••' : `<b class="money" data-cash="${P.cash}">${fmtN(P.cash)}</b>`}<em>₮</em></div>
    <div class="split"><button class="o" data-a="openInc"><i>${SVG_UP}</i><span><small>Орлого</small><b>${fmtS(f.income)}</b></span></button><button class="w" data-a="openExp"><i>${SVG_DN}</i><span><small>Зардал</small><b>${fmtS(f.expenses)}</b></span></button></div>
    ${v3 && P.efund ? `<div class="nsub"><button data-a="openLoan" data-bt="em" style="grid-column:1/-1">Яаралтай сан <b>${fmtS(P.efund)}</b></button></div>` : ''}
  </div></div>
  <div class="arena">
    ${v3 ? `<div class="side l">
      <button class="sb" data-a="openSave">${ic('piggy-bank')}Хадгаламж${(P.savings || []).length ? `<em>${P.savings.length}</em>` : ''}</button>
      <button class="sb" data-a="openLoan" data-bt="ins">${ic('first-aid-kit')}Даатгал${Object.values(P.ins || {}).filter(x => x > 0).length ? `<em>✓</em>` : ''}</button>
      <button class="sb" data-a="openStocks" ${act ? '' : 'disabled'}>${ic('chart-line-up')}Хувьцаа</button>
    </div>
    <div class="side r">
      <button class="sb" data-a="openAssets">${ic('buildings')}Хөрөнгө${P.assets.length ? `<em>${P.assets.length}</em>` : ''}</button>
      <button class="sb" data-a="openDebts">${ic('hand-coins')}Зээл</button>
      <button class="sb" data-a="moreSq" ${act ? '' : 'disabled'}>${ic('star')}Онцгой</button>
    </div>` : `<div class="side l"><i class="cap">Орлого</i>
      <button class="sb" data-a="openLoan" ${act ? '' : 'disabled'}>${ic('bank')}Банк</button>
      <button class="sb" data-a="openSave">${ic('piggy-bank')}Хадгаламж${(P.savings || []).length + (P.free ? 1 : 0) ? `<em>${(P.savings || []).length + (P.free ? 1 : 0)}</em>` : ''}</button>
      <button class="sb" data-a="prices">${ic('chart-line-up')}Ханш</button>
    </div>
    <div class="side r"><i class="cap">Зарлага</i>
      <button class="sb" data-a="openDebts">${ic('hand-coins')}Зээл</button>
      <button class="sb" data-a="openSell" ${act ? '' : 'disabled'}>${ic('tag')}Зарах</button>
      <button class="sb" data-a="moreSq" ${act ? '' : 'disabled'}>${ic('star')}Онцгой</button>
    </div>`}
    <div class="hero"><span class="pod"></span><img class="masc a-idle" src="${mascot(P.profId)}" alt="" data-a="hop"></div>
    <div class="htag"><b>${esc(PROF[P.profId].title)}</b></div>
  </div>
  <div class="panel">
    ${lv === 2 && !dream ? `<div class="fbar"><div class="fh"><b>Мөрөөдөл сонгоогүй</b></div><button class="minibtn go" data-a="pickDream">Мөрөөдлөө сонгох</button></div>`
      : freeBar(P, f, lv, pct, dream)}
    ${alerts.join('')}
    ${!act ? `<div class="play off">${esc(P.name)}-ийн самбар</div>` : P.skip > 0 ? `<button class="play" data-a="roll">${ic('clock')}Ээлж өнжих · ${P.skip}</button>` : actGrid(P)}
  </div>
  </div>`;
}
/* freedom bar = gauge (%), condition chips, and a battery-cell road the mascot rides toward the goal star */
function freeBarOld(P, f, lv, pct, dream) {
  const p = Math.floor(pct * 100), N = 10, on = Math.floor(pct * N + 1e-9);
  const a = Math.PI * pct, x = 50 - 40 * Math.cos(a), y = 50 - 40 * Math.sin(a);
  const gauge = `<svg class="fg-g" viewBox="0 0 100 56" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" class="tr"/>${pct > 0 ? `<path d="M10 50 A40 40 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="fg"/>` : ''}<text x="50" y="48" text-anchor="middle">${p}%</text></svg>`;
  const chips = lv === 1 ? `<span class="fg-c">${[['Орлого', 0], ['Нөөц', 1], ['Зээлгүй', 2]].map(([n, i]) => `<i class="${f.conds[i] ? 'on' : ''}">${f.conds[i] ? '✓ ' : ''}${n}</i>`).join('')}</span>` : '';
  const sub = lv === 1 ? `Идэвхгүй ${fmtS(f.stablePassive)} / ${fmtS(f.living)}` : `Бэлэн ${fmtS(P.cash)} / ${fmtS(dream.fx.price)}`;
  const cells = Array.from({ length: N }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
  return `<div class="fbar fg" ${lv === 1 ? 'data-a="freeInfo" role="button" tabindex="0"' : ''}>
    <div class="fg-top">${gauge}<div class="fg-t"><b>${lv === 1 ? 'Санхүүгийн эрх чөлөө' : esc(dream.title)}</b>${lv === 1 ? chips : `<small>${sub}</small>`}</div></div>
    <div class="fg-road"><span class="fg-cells">${cells}<span class="fg-me" style="left:clamp(12px, ${(pct * 100).toFixed(1)}%, calc(100% - 12px))"><span style="background-image:url(${mascot(P.profId)})"></span></span></span><span class="fg-goal">★</span></div>
  </div>`;
}
ACT.freeInfo = () => openSheet(fFree);
/* the 3 freedom conditions as one row of ring tiles; sel = selected index (null = display only) */
function freeTiles(P, sel) {
  const f = fin(P, G), rm = G.settings.reserveMonths;
  const pct = (v, need) => need > 0 ? Math.min(1, Math.max(0, v / need)) : 1;
  const C = [
    { t: 'Орлого ≥ зардал', ok: f.conds[0], p: pct(f.stablePassive, f.living), sub: f.conds[0] ? 'Хангасан' : `−${fmtS(f.gap)}` },
    { t: `${rm} сарын нөөц`, ok: f.conds[1], p: pct(f.reserve, f.reserveNeed), sub: f.conds[1] ? 'Хангасан' : `−${fmtS(f.reserveNeed - f.reserve)}` },
    { t: 'Аппын зээлгүй', ok: f.conds[2], p: f.conds[2] ? 1 : 0, sub: f.conds[2] ? 'Хангасан' : `${f.badDebt.length} зээл` }];
  const ring = c => { const r = 19, L = 2 * Math.PI * r; return `<svg viewBox="0 0 46 46" class="fring"><circle cx="23" cy="23" r="${r}" class="tr"/><circle cx="23" cy="23" r="${r}" class="pr" stroke-dasharray="${(L * c.p).toFixed(1)} ${L.toFixed(1)}"/></svg>`; };
  return `<div class="fct">${C.map((c, i) => `<${sel == null ? 'div' : 'button'} class="fct-t ${c.ok ? 'ok' : ''}" ${sel == null ? '' : `data-a="fcSel" data-i="${i}" aria-pressed="${sel === i}"`}>
    <span class="fct-r">${ring(c)}<span>${c.ok ? ic('seal-check') : Math.round(c.p * 100) + '%'}</span></span><b>${c.t}</b><small>${c.sub}</small></${sel == null ? 'div' : 'button'}>`).join('')}</div>
  <div class="fst"><i class="${P.streak >= 1 ? 'on' : ''}"></i><i class="${P.streak >= 2 ? 'on' : ''}"></i><span>3-ууланг 2 цалин дараалан</span></div>`;
}
function fFreeOld() {
  const P = me(); const f = fin(P, G); const rm = G.settings.reserveMonths;
  const bar = (v, need) => `<div class="cbar"><i style="width:${(need > 0 ? Math.min(1, Math.max(0, v / need)) * 100 : 100).toFixed(1)}%"></i></div>`;
  const neg = v => `<b class="neg">−${fmt(v)}</b>`;
  // ① lasting passive income, asset by asset
  const pas = P.assets.filter(a => !a.active && a.kind !== 'bond').map(a => [a.name, opAvg(P, a, true)]).filter(x => x[1]);
  // living cost lines (tax excluded)
  const liv = [];
  for (const e of P.exps) if (e.v && e.kind !== 'tax' && (P.level === 1 || e.kind !== 'tax')) liv.push([e.l, e.v]);
  if (P.kids) liv.push([`Хүүхэд × ${P.kids}`, f.kids]);
  for (const x of P.expMods) if (x.v) liv.push([x.l, x.v]);
  if (f.ins) liv.push(['Мал, тариалангийн даатгал', f.ins]);
  for (const x of f.livLoans) liv.push([x.d.l + (x.d.kind === 'bank' || x.d.kind === 'personal' || x.d.kind === 'l2' ? ' · хүү' : ''), x.pay]);
  if (f.pctAmt) liv.push(['Нэмэгдсэн зардал', f.pctAmt]);
  liv.sort((a, b) => b[1] - a[1]);
  const sav = sum(P.savings || [], x => savPrincipal(x)) + (P.free || 0), dep = sum(P.assets.filter(a => a.kind === 'deposit'), a => a.amount);
  if (FS.fc == null) { const i = f.conds.findIndex(c => !c); FS.fc = i < 0 ? 0 : i; }
  const k = FS.fc;
  const tiles = freeTiles(P, k);
  const lines = (arr, cls) => arr.map(([n, v]) => `<div class="ln"><span>${esc(n)}</span><b class="${cls}">${cls === 'pos' ? fmt(v, { sign: true }) : '−' + fmt(v)}</b></div>`).join('');
  const det = k === 0 ? `<div class="box">
      <div class="sec">Идэвхгүй орлого <b class="pos">+${fmt(f.stablePassive)}</b></div>
      ${pas.length ? lines(pas, 'pos') : '<p class="empty" style="padding:4px 0 8px">Одоогоор алга</p>'}
      <div class="sec" style="margin-top:6px">Амьжиргааны зардал <b class="neg">−${fmt(f.living)}</b></div>
      ${lines(liv, 'neg')}</div>`
    : k === 1 ? `<div class="box">
      <div class="ln"><span>Бэлэн мөнгө</span><b>${fmt(P.cash)}</b></div>
      ${sav || dep ? `<div class="ln"><span>Хадгаламж</span><b>${fmt(sav + dep)}</b></div>` : ''}
      <div class="ln"><span>Хэрэгтэй<span class="sub">Зардал × ${rm} сар</span></span><b>${fmt(f.reserveNeed)}</b></div></div>`
    : `<div class="box">${f.badDebt.length ? f.badDebt.map(d => `<div class="ln"><span>${esc(d.l)}<span class="sub">Хүү ${fmt(debtPay(P, d, G))}/сар</span></span>${neg(d.bal)}</div>`).join('') + `<div class="row" style="margin-top:8px"><button class="minibtn go" data-a="openDebts">Зээл төлөх</button></div>` : '<p class="empty" style="padding:4px 0">Аппын болон хувийн зээл алга</p>'}</div>`;
  return `<div class="shead"><h3>Эрх чөлөө</h3>${X}</div>
  ${tiles}
  ${det}`;
}
ACT.fcSel = d => { FS.fc = +d.i; drawSheet(); };
const PRICE_SYMS = ['APU', 'KHAN', 'TT', 'TNG', 'GOLD'];
ACT.prices = () => openSheet(() => {
  const P = me();
  return `<div class="shead"><h3>Ханш</h3>${X}</div><p class="mute" style="font-size:13px">Сүүлд сугалсан картын үнэ. Карт сугалах бүрт шинэчлэгдэнэ.</p>
  <div class="box">${PRICE_SYMS.map(k => { const st = STOCK[k]; const own = P.assets.filter(a => a.sym === k).reduce((n, a) => n + a.qty, 0); return `<div class="ln"><span>${esc(st.name)}<span class="sub">1 ${esc(st.unit)}${own ? ` · танд ${own.toLocaleString('en-US')} ${esc(st.unit)}` : ''}</span></span><b>${fmt(G.prices[k] || START_PRICES[k])}</b></div>`; }).join('')}</div>`;
});
function logRow(e) {
  return `<div class="ln"><span>${esc(e.txt)}${e.card ? `<span class="sub">${esc(e.card)}${e.who && G.mode === 'online' ? ' · ' + esc(e.who) : ''}</span>` : ''}</span>${e.amt ? `<b class="${e.amt >= 0 ? 'pos' : 'neg'}">${Math.abs(e.amt) >= 1e9 ? fmtS(e.amt, { sign: true }) : fmt(e.amt, { sign: true })}</b>` : ''}</div>`;
}
function nextPlayer() {
  const n = G.players.length;
  for (let k = 1; k <= n; k++) { const p = G.players[(G.cur + k) % n]; if (!p.out) return p; }
  return me();
}
ACT.endTurn = () => {
  let n = G.players.length, guard = 0;
  do {
    G.cur = (G.cur + 1) % n; guard++;
    const p = G.players[G.cur];
    if (!p.out && p.skip > 0) { p.skip -= 1; log(G, p, 'Ээлж өнжлөө', 0, null, 'skip'); toast(`${p.name} ээлж өнжлөө`); continue; }
    if (!p.out) break;
  } while (guard < n * 3);
  G.turns += 1;
  G.conds = G.conds.filter(c => !c.turns);
  save(); render(); window.scrollTo(0, 0);
};
ACT.switchTo = d => { const i = G.players.findIndex(p => p.id === d.id); if (i >= 0) { G.cur = i; save(); render(); window.scrollTo(0, 0); } };
ACT.peek = d => { FS = { pid: d.id }; openSheet(fPeek); };
ACT.menu = () => openSheet(() => `<div class="shead"><h3>Цэс</h3>${X}</div>
  <div class="menu" style="padding:0">
  ${G.mode === 'online' ? `<div class="box center-t"><small class="mute">Өрөөний код</small><div class="code">${esc(G.room)}</div><p class="mute" style="font-size:12px">Найзууд «Өрөөнд нэгдэх» дээр энэ кодыг оруулна.</p></div>` : ''}
  <button class="mbtn" data-a="flagsOpen">${ic('seal-check')}<span><b>Миний нөхцөл</b><small>Мэргэжлийн картаар тогтсон</small></span></button>
  <button class="mbtn" data-a="tab" data-t="rules" onclick="closeSheet()">${ic('newspaper')}<span><b>Дүрэм</b><small>Тоглоомын дүрэм, тохиргоо</small></span></button>
  <button class="mbtn" data-a="tab" data-t="cards" onclick="closeSheet()">${ic('identification-card')}<span><b>Бүх карт</b><small>Картын дугаараар хайх, үзэх</small></span></button>
  <button class="mbtn" data-a="home">${ic('house')}<span><b>Нүүр хуудас</b><small>Тоглоом хадгалагдсан хэвээр үлдэнэ</small></span></button>
  </div>`);
ACT.themeToggle = () => {
  const r = document.documentElement; const cur = r.getAttribute('data-theme');
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.setAttribute('data-theme', dark ? 'light' : 'dark'); store.set('of2.theme', dark ? 'light' : 'dark'); closeSheet();
};
/* room admin only: a player's whole history (user 2026-11-11) */
function histAllBtn(o) { return G.mode === 'online' && NET.isHost() && o.id !== me().id && (o.hist || []).length > 8 ? `<button class="minibtn go" style="margin-top:10px;width:100%" data-a="peekHist" data-id="${o.id}">Бүх түүх (${o.hist.length})</button>` : ''; }
function fPeekHist() {
  const o = G.players.find(p => p.id === FS.pid); if (!o) return head('Түүх');
  return `<div class="shead">${avatar(o)}<h3>${esc(o.name)} · бүх түүх</h3>${X.replace('data-a="close"', 'data-a="peekBack"')}</div>
  <p class="mute" style="font-size:12px;margin:0 0 8px">Зөвхөн өрөөний админд харагдана.</p>
  <div class="box">${(o.hist || []).map(logRow).join('') || '<p class="empty">Одоохондоо алга</p>'}</div>`;
}
ACT.peekHist = d => { if (!(G.mode === 'online' && NET.isHost())) return; FS = { pid: d.id }; openSheet(fPeekHist); };
ACT.peekBack = () => openSheet(fPeek);
function fPeek() {
  const o = G.players.find(p => p.id === FS.pid); const f = fin(o, G);
  return `<div class="shead">${avatar(o)}<h3>${esc(o.name)}</h3>${X}</div>
  <div class="grid2"><div class="kv"><small>Бэлэн мөнгө</small><b>${cashTxt(o)}</b></div><div class="kv"><small>Сарын ашиг</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmtS(f.cf, { sign: true })}</b></div>
  <div class="kv"><small>Идэвхгүй орлого</small><b>${fmtS(f.passive)}</b></div><div class="kv"><small>Нийт зардал</small><b>${fmtS(f.expenses)}</b></div></div>
  <div class="box"><h4>Хөрөнгө <span>${o.assets.length}</span></h4>${o.assets.map(a => `<div class="ln"><span>${esc(a.name)}</span><b>${a.kind === 'units' ? a.qty.toLocaleString('en') + ' ' + STOCK[a.sym].unit : fmtS(opAvg(o, a), { sign: true })}</b></div>`).join('') || '<p class="empty">Хөрөнгөгүй</p>'}</div>
  <div class="box"><h4>Сүүлийн үйлдэл</h4>${o.hist.slice(0, 8).map(logRow).join('') || '<p class="empty">Одоохондоо алга</p>'}${histAllBtn(o)}</div>`;
}

/* ---------- sheet tab ---------- */
function vSheet() {
  const P = me(); const f = fin(P, G);
  const t = UI.shTab || 'io';
  const tabs = [['io', 'Орлого, зардал'], ['as', 'Хөрөнгө'], ['ln', 'Зээл'], ['fl', 'Нөхцөл']];
  let body = '';
  if (t === 'io') {
    body = `<div class="box"><div class="sec">Орлого <span>сар бүр</span></div>
      ${P.level === 1 ? `<div class="ln"><span>Цалин${P.salaryPct ? `<span class="sub">+${P.salaryPct}% нэмэгдсэн</span>` : ''}</span><b class="pos">+${fmt(f.salary)}</b></div>` : ''}
      <div class="ln"><span>Идэвхгүй орлого<span class="sub">${P.assets.filter(a => !a.active).length} хөрөнгө</span></span><b class="${f.passive ? 'pos' : 'mute'}">${f.passive ? fmt(f.passive, { sign: true }) : '0₮'}</b></div>
      ${P.level === 1 ? `<div class="ln"><span>Нэмэлт орлого<span class="sub">${P.skills.filter(s => s.left <= 0 && s.mode === 'side').map(s => s.name).concat(P.assets.filter(a => a.active).map(a => a.name)).map(esc).join(' · ') || 'Ур чадвар, идэвхтэй бизнес'}</span></span><b class="${f.side ? 'pos' : 'mute'}">${f.side ? fmt(f.side, { sign: true }) : '0₮'}</b></div>` : ''}
      <div class="ln tot"><span>Нийт орлого</span><b class="pos">+${fmt(f.income)}</b></div></div>
      <div class="box"><div class="sec">Зардал <span>сар бүр</span></div>
      ${P.exps.filter(e => e.v || e.saved).map(e => `<div class="ln"><span>${esc(e.l)}${e.saved ? '<span class="sub">Өөрийн байртай болсон тул 0</span>' : ''}</span><b class="${e.v ? 'neg' : 'mute'}">${e.v ? '−' + fmt(e.v) : '0₮'}</b></div>`).join('')}
      ${P.kids ? `<div class="ln"><span>Хүүхэд × ${P.kids}</span><b class="neg">−${fmt(f.kids)}</b></div>` : ''}
      ${P.expMods.map(x => `<div class="ln"><span>${esc(x.l)}</span><b class="neg">${x.v ? '−' + fmt(x.v) : '+' + x.pct + '%'}</b></div>`).join('')}
      ${f.ins ? `<div class="ln"><span>Мал, тариалангийн даатгал</span><b class="neg">−${fmt(f.ins)}</b></div>` : ''}
      ${f.livLoans.map(x => `<div class="ln"><span>${esc(x.d.l)}<span class="sub">Зээлийн төлбөр</span></span><b class="neg">−${fmt(x.pay)}</b></div>`).join('')}
      ${f.pctAmt ? `<div class="ln"><span>Нэмэгдсэн зардал</span><b class="neg">−${fmt(f.pctAmt)}</b></div>` : ''}
      <div class="ln tot"><span>Нийт зардал</span><b class="neg">−${fmt(f.expenses)}</b></div></div>
      <div class="box"><div class="ln tot" style="border:0"><span>Сарын ашиг</span><b class="${f.cf >= 0 ? 'pos' : 'neg'} money" style="font-size:20px">${fmt(f.cf, { sign: true })}</b></div>
      <div class="ln"><span>Амьжиргааны зардал<span class="sub">Нийт зардал − татвар, НДШ</span></span><b>${fmt(f.living)}</b></div>
      <div class="ln"><span>Нөөц сан<span class="sub">Бэлэн + хадгаламж · ${G.settings.reserveMonths} сар = ${fmtS(f.reserveNeed)}</span></span><b class="${f.conds[1] ? 'pos' : 'neg'}">${fmtS(f.reserve)}</b></div>
      <p class="mute" style="font-size:12px">Цалингийн өдөр бүр энэ дүнг ${G.settings.payX} удаа авна.${P.level === 2 ? ' Түвшин 2-т жилийн орлого = (идэвхгүй орлого − зардал) × 12.' : ''}</p></div>`;
  } else if (t === 'as') {
    body = P.assets.length || (P.savings || []).length ? P.assets.map(a => assetRow(P, a)).join('') : `<div class="box"><p class="empty">Хөрөнгө алга. Боломж нүдэнд буугаад карт сонгоно уу.</p></div>`;
    if (P.skills.length) body += `<div class="box"><div class="sec">Ур чадвар</div>${P.skills.map(s => `<div class="ln"><span>${esc(s.name)}<span class="sub">${s.left > 0 ? s.left + ' цалингийн өдрийн дараа' : s.mode === 'side' ? 'Нэмэлт орлого' : 'Цалин +' + s.pct + '%'}</span></span><b class="pos">${s.mode === 'side' ? fmt(s.side, { sign: true }) : '+' + s.pct + '%'}</b></div>`).join('')}</div>`;
    if ((P.savings || []).length || P.free) body += `<div class="box"><div class="sec">Хадгаламж <span>${fmtS(sum(P.savings || [], x => savPrincipal(x)) + (P.free || 0))}</span></div>${P.free ? `<div class="ln"><span>Хугацаагүй хадгаламж<span class="sub">Хүүгүй · хүссэн үедээ авна</span></span><b>${fmtS(P.free)}</b></div>` : ''}${(P.savings || []).map(x => `<div class="ln"><span>${esc(SAVE_TYPES[x.type].n)}<span class="sub">${Math.max(0, SAVE_TYPES[x.type].term - x.el)} цалингийн дараа ${fmtS(R(savProjected(x)))} · ${savRate(x)}%</span></span><b>${fmtS(savPrincipal(x))}</b></div>`).join('')}<div class="row" style="margin-top:8px"><button class="minibtn go" data-a="openSave">Хадгаламж нээх</button></div></div>`;
    if (P.pending.length) body += `<div class="box"><div class="sec">Хүлээгдэж буй орлого</div>${P.pending.map(t => `<div class="ln"><span>${esc(t.name)}<span class="sub">${t.left > 0 ? t.left + ' цалингийн өдөр үлдсэн' : 'Хугацаа болсон'}</span></span><b>${fmtS(t.cost)}</b></div>`).join('')}</div>`;
  } else if (t === 'ln') {
    const ds = P.debts.filter(d => d.bal > 0);
    body = (ds.length ? ds.map(d => debtRow(P, d)).join('') : `<div class="box"><p class="empty">Өргүй байна.</p></div>`) +
      `<div class="box"><h4>Аппын зээл <span>${P.level === 2 ? 'хөрөнгийн ' + G.settings.l2LoanPct + '% хүртэл' : fmtS(G.settings.emergencyUnit) + '-ийн нэгжээр'}</span></h4><p class="mute" style="font-size:13px;margin:6px 0 10px">Авч болох: ${roomTxt(P)}</p><button class="minibtn go" data-a="openLoan">Зээл авах</button></div>`;
  } else if (t === 'fl') {
    body = flagsHTML(P);
  } else {
    body = `<div class="box feed">${(P.hist || []).map(logRow).join('') || '<p class="empty">Түүх хоосон</p>'}</div>`;
  }
  const inc = Math.max(1, f.income), ex = f.expenses, tot = Math.max(inc, ex);
  return `<div class="ptitle"><h2>Санхүүгийн хуудас</h2><span class="pill">${esc(PROF[P.profId].title)}</span></div>
  <section class="sum-card"><div><small>${P.level === 1 ? 'Сарын ашиг' : 'Сарын цэвэр урсгал'}</small><div class="money">${fmt(f.cf, { sign: true })}</div>
    <div class="io"><span><i class="dot o"></i>Орлого <b>${fmtS(f.income)}</b></span><span><i class="dot w"></i>Зардал <b>${fmtS(ex)}</b></span></div>
    <div class="iobar"><i class="o" style="width:${(inc / tot * 100).toFixed(1)}%"></i><i class="w" style="width:${(ex / tot * 100).toFixed(1)}%"></i></div></div>
    <img class="masc a-idle" src="${mascot(P.profId)}" alt="" data-a="hop"></section>
  <div class="tabs">${tabs.map(([k, n]) => `<button data-a="shTab" data-t="${k}" aria-pressed="${t === k}">${n}</button>`).join('')}</div>
  <div class="wrap">${body}</div>`;
}
ACT.shTab = d => { UI.shTab = d.t; render(); };
/* Хөрөнгө and Орлого pop-ups replace the old Санхүүгийн хуудас page (user 2026-10-14) */
/* Хөрөнгө pop-up (user 2026-10-19): two-column tiles, flat icons only, minimal text — icon, name, one number.
   Details (loan, months left, sell) open when a tile is tapped. */
const ATILE = { re: ['buildings', 're'], home: ['house', 're'], land: ['plant', 're'], biz: ['storefront', 'biz'], equip: ['car', 'biz'],
  livestock: ['cow', 'agro'], farm: ['plant', 'agro'], units: ['chart-line-up', 'inv'], gold: ['coins', 'inv'], bond: ['bank', 'inv'],
  sav: ['piggy-bank', 'sav'], recv: ['handshake', 'sav'], skill: ['graduation-cap', 'biz'], wait: ['clock', 'inv'], venture: ['briefcase', 'biz'] };
function aTile(k, name, val, tone, attrs) {
  const [icn, c] = ATILE[k] || ATILE.biz;
  const tag = attrs ? 'button' : 'div';
  return `<${tag} class="at-t" ${attrs || ''}><span class="at-ic at-${c}">${ic(icn)}</span><span class="at-n">${esc(name)}</span><b class="${tone || ''}">${val}</b></${tag}>`;
}
function assetTile(P, a) {
  const tap = canAct(P) ? `data-a="sellOne" data-id="${a.id}" data-back="1"` : '';
  if (a.kind === 'units') { const px = G.prices[a.sym] || a.unitCost; return aTile(a.sym === 'GOLD' ? 'gold' : 'units', STOCK[a.sym].name || a.name, fmtS(a.qty * px), '', tap); }
  if (a.kind === 'bond') return aTile('bond', a.name, fmtS(a.amount), '', tap);
  if (a.kind === 'deposit') return aTile('sav', a.name, fmtS(a.amount), '', tap);
  if (a.kind === 'receivable') return aTile('recv', a.name, fmtS(a.amount), '', tap);
  if (a.kind === 'venture') return aTile('venture', a.name, fmtS(a.profit, { sign: true }), a.profit >= 0 ? 'pos' : 'neg', tap);
  const d = assetLoan(P, a); const net = assetOp(P, a, { monthly: true }) - (d ? d.pay : 0);
  return aTile(a.cls || 'biz', a.name, fmtS(net, { sign: true }), net >= 0 ? 'pos' : 'neg', tap);
}
ACT.openAssets = () => openSheet(() => { const P = me();
  const save = canAct(P) ? 'data-a="openSave"' : '';
  const tiles = P.assets.map(a => assetTile(P, a));
  if (P.free) tiles.push(aTile('sav', 'Хугацаагүй хадгаламж', fmtS(P.free), '', save));
  for (const x of P.savings || []) tiles.push(aTile('sav', SAVE_TYPES[x.type].n, fmtS(savPrincipal(x)), '', save));
  for (const sk of P.skills) tiles.push(aTile('skill', sk.name, sk.left > 0 ? `${sk.left} сар` : sk.mode === 'side' ? fmtS(sk.side, { sign: true }) : `+${sk.pct}%`, sk.left > 0 ? '' : 'pos'));
  for (const t of P.pending) tiles.push(aTile('wait', t.name, t.left > 0 ? `${t.left} сар` : 'Болсон'));
  const tot = sum(P.assets, a => assetValue(P, a)) + sum(P.savings || [], x => savPrincipal(x)) + (P.free || 0);
  const pas = fin(P, G).passive;
  return `<div class="shead"><h3>Хөрөнгө</h3>${X}</div>
  <div class="at-top"><b>${fmtS(tot)}</b><span class="${pas >= 0 ? 'pos' : 'neg'}">${fmtS(pas, { sign: true })} / сар</span></div>
  ${tiles.length ? `<div class="at-g">${tiles.join('')}</div>` : `<div class="at-e"><span class="at-ic at-re">${ic('buildings')}</span><b>Хөрөнгө алга</b></div>`}`; }, { modal: true });
ACT.openInc = () => openSheet(() => { const P = me(); const f = fin(P, G);
  const rows = [];
  if (P.level === 1) rows.push(['Цалин', f.salary, P.salaryPct ? `+${P.salaryPct}% нэмэгдсэн` : PROF[P.profId].title]);
  for (const a of P.assets) { const d = a.loanId ? P.debts.find(x => x.id === a.loanId) : null, lp = d && (d.bal > 0 || d.kind === 'flat') ? debtPay(P, d, G) : 0, v = opAvg(P, a) - lp; if (v || lp) rows.push([a.name, v, (a.active ? 'Нэмэлт орлого' : 'Идэвхгүй орлого') + (lp ? ' · зээлийн төлбөр ' + fmtS(lp) + ' хасагдсан' : '')]); }
  for (const s of P.skills.filter(s => s.left <= 0 && s.mode === 'side')) rows.push([s.name, s.side, 'Ур чадвар']);
  return `<div class="shead"><h3>Орлого</h3>${X}</div>
  <div class="svsum"><div><small>Сарын нийт орлого</small><b class="pos">+${fmtS(f.income)}</b></div><div><small>Идэвхгүй</small><b class="pos">+${fmtS(f.stablePassive)}</b></div><div><small>Сарын ашиг</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmtS(f.cf, { sign: true })}</b></div></div>
  <div class="box"><div class="sec">Сар бүр</div>${rows.map(r => `<div class="ln"><span>${esc(r[0])}<span class="sub">${esc(r[2])}</span></span><b class="${r[1] >= 0 ? 'pos' : 'neg'}">${fmt(r[1], { sign: true })}</b></div>`).join('')}</div>
  <p class="mute" style="font-size:12px">Эрх чөлөөнд зөвхөн идэвхгүй орлого тооцогдоно — цалин, нэмэлт орлого орохгүй.</p>`; }, { modal: true });
function assetRow(P, a) {
  const d = assetLoan(P, a);
  let sub = [], right = '';
  if (a.kind === 'units') {
    const px = G.prices[a.sym] || a.unitCost;
    sub.push(`${a.qty.toLocaleString('en')} ${STOCK[a.sym].unit} · дундаж ${fmt(a.unitCost)} · одоо ${fmt(px)}`);
    right = fmtS(a.qty * px);
  } else if (a.kind === 'bond') { sub.push(`${fmtS(a.amount)} · жилийн ${a.rate}% · ${a.left} сар үлдсэн`); right = fmt(assetOp(P, a), { sign: true }); }
  else if (a.kind === 'deposit' || a.kind === 'receivable') { sub.push(`${fmtS(a.amount)} · сарын ${a.rate}% · ${a.months || 0} сар`); right = fmt(assetOp(P, a), { sign: true }); }
  else if (a.kind === 'venture') { sub.push(`Оруулсан ${fmtS(a.invest)}${a.share < 1 ? ' · ' + Math.round(a.share * 100) + '%' : ''}${a.wait ? ' · ' + a.wait + ' жил хүлээнэ' : ''}`); right = fmtS(a.profit, { sign: true }) + '/сар'; }
  else {
    sub.push(`Үнэ ${fmtS(a.price)}${a.share < 1 ? ' · ' + Math.round(a.share * 100) + '% хувь' : ''}`);
    if (d && d.bal > 0) sub.push(`Зээлийн үлдэгдэл ${fmtS(d.bal)} · ${monthsLeft(d)} сар`);
    if (seasonal(a)) sub.push(`Орлого: ${a.season.map(m => m + '-р').join(', ')} сар`);
    if (a.active) sub.push('Идэвхтэй (нэмэлт орлого)');
    if (a.blocked) sub.push(`${a.blocked} цалингийн өдөр зарж болохгүй`);
    const mods = P.mods.filter(m => m.asset === a.id);
    if (mods.length) sub.push(mods.map(m => `${m.card} ${m.pct > 0 ? '+' : ''}${m.pct}%`).join(', '));
    const net = assetOp(P, a, { monthly: true }) - (d ? d.pay : 0);
    right = `<span class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net, { sign: true })}</span>`;
  }
  const tap = canAct(P) && a.kind !== 'receivable';
  const tag = tap ? 'button' : 'div';
  return `<${tag} class="box arow" ${tap ? `data-a="sellOne" data-id="${a.id}" data-back="1"` : ''}><div class="ln" style="border:0;padding:0"><span><b style="white-space:normal">${esc(a.name)}</b>${a.card ? `<span class="sub">${esc(a.card)}</span>` : ''}</span><b>${right}</b></div>
    ${(() => { if (!d || d.bal <= 0 || !a.price) return ''; const eq = Math.max(0, a.price - d.bal), pc = Math.min(1, eq / a.price); return `<div class="ln" style="border:0;padding:6px 0 0;font-size:12px"><span>Таных болсон</span><b>${fmtS(eq)} / ${fmtS(a.price)} · ${Math.round(pc * 100)}%</b></div><div class="prog" style="margin-top:4px"><i style="width:${(pc * 100).toFixed(1)}%"></i></div>`; })()}
    <p class="mute" style="font-size:12px;margin-top:4px">${sub.map(esc).join('<br>')}</p>
  </${tag}>`;
}
function debtRow(P, d) {
  const pct = d.orig ? Math.max(0, Math.min(1, 1 - d.bal / d.orig)) : 0;
  const am = amortizing(d);
  return `<div class="box"><div class="ln" style="border:0;padding:0"><b style="white-space:normal">${esc(d.l)}</b><b>${fmt(debtPay(P, d, G))}<small class="mute" style="font-weight:600">/сар</small></b></div>
    ${am ? `<div class="lbar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
    <div class="ln" style="border:0;padding:6px 0 0;font-size:13px"><span class="pos" style="font-weight:700">${Math.round(pct * 100)}% төлсөн</span><span>Үлдэгдэл <b>${fmtS(d.bal)}</b></span></div>`
    : `<div class="ln" style="border:0;padding:6px 0 0;font-size:13px"><span class="mute">Зөвхөн хүү төлдөг</span><span>Үлдэгдэл <b>${fmtS(d.bal)}</b></span></div>`}
    ${canAct(P) ? `<div class="chips" style="margin-top:12px"><button class="minibtn go" data-a="repayPart" data-id="${d.id}">Төлөх</button>${am ? `<button class="minibtn" data-a="loanHist" data-id="${d.id}">Түүх</button>` : ''}</div>` : ''}</div>`;
}
function flagsHTML(P) {
  // read-only: set from the profession card at start, changed only by game events (cards, squares)
  const yes = (b) => `<b class="${b ? 'pos' : 'mute'}">${b ? 'Тийм' : 'Үгүй'}</b>`;
  return `${isV3(P) ? startCardHTML(P) : ''}<div class="box"><h4>Миний нөхцөл <span>Мэргэжлийн картаар</span></h4>
    <p class="mute" style="font-size:12px;margin:4px 0 6px">Карт таны нөхцөлийг үүгээр шалгана. Гараар өөрчлөхгүй — тоглоомын явцад карт, нүдээр л өөрчлөгдөнө.</p>
    <div class="ln"><span>Мэргэжил</span><b>${esc(PROF[P.profId].title)}</b></div>
    <div class="ln"><span>Орон байр</span><b>${{ own: 'Өөрийн байртай', rent: 'Түрээсэлдэг', parents: 'Эцэг эхтэйгээ' }[P.home] || '—'}</b></div>
    <div class="ln"><span>Хүүхэд<span class="sub">Хүүхэд бүрт ${fmt(P.childCost * 4)} / 4 сар</span></span><b>${P.kids}</b></div>
    ${isV3(P) ? `<div class="ln"><span>Машин</span>${yes(P.flags.car)}</div></div>`   // v3 (user 2026-11-11): only what the cards still check — the old КАСКО / гэрлэсэн / сургалт / мал даатгал / хашаа байшин rows are gone
    : `${FLAGS.map(([k, n]) => `<div class="ln"><span>${n}</span>${yes(P.flags[k])}</div>`).join('')}
    <div class="ln"><span>Хашаа байшин, гэрт амьдардаг</span>${yes(P.ger)}</div></div>`}`;
}
/* «Миний нөхцөл» (user 2026-11-11): the profession card as it was at the start — salary, expenses, profit, starting cash, each expense line, debts, child cost */
function startCardHTML(P) {
  const pr = PROF[P.profId]; if (!pr) return '';
  const { P: Q, f } = profSummary(pr), M = 4;
  // 1 сар (as printed on the card) and 4 сар (one Орлого) side by side (user 2026-11-11); income green, expenses red
  const row = (l, v, cls, sign) => `<div class="sc-r"><span>${l}</span><b class="${cls}">${sign}${fmt(Math.abs(v))}</b><b class="${cls}">${sign}${fmt(Math.abs(v) * M)}</b></div>`;
  return `<div class="box sc0"><h4>${esc(pr.title)} <span>Эхлэх үеийн карт</span></h4>
    <div class="sc-r sc-h"><span></span><small>1 сар</small><small>4 сар</small></div>
    ${row('Цалин', f.salary, 'pos', '+')}
    ${Q.exps.filter(e => e.v).map(e => row(esc(e.l), e.v, 'neg', '−')).join('')}
    <div class="sc-r sc-t">${'<span>Нийт зардал</span>'}<b class="neg">−${fmt(f.expenses)}</b><b class="neg">−${fmt(f.expenses * M)}</b></div>
    <div class="sc-r sc-t"><span>Ашиг</span><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmt(f.cf, { sign: true })}</b><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmt(f.cf * M, { sign: true })}</b></div>
    ${row('Хүүхэд бүрт', pr.child, 'neg', '−')}
    <div class="lines" style="margin-top:8px"><div class="ln"><span>Эхлэх бэлэн мөнгө</span><b>${fmt(Q.cash + (Q.efund || 0))}</b></div>
    ${Q.debts.some(d => d.bal) ? `<div class="sec">Өрийн үлдэгдэл</div>` : ''}${Q.debts.filter(d => d.bal).map(d => `<div class="ln"><span>${esc(d.l)}<span class="sub">${d.monthly ? d.rate + '%/сар' : 'жилийн ' + d.rate + '%'}</span></span><b class="neg">${fmtS(d.bal)}</b></div>`).join('')}</div></div>`;
}
ACT.flagsOpen = () => openSheet(() => `<div class="shead"><h3>Миний нөхцөл</h3>${X}</div>${flagsHTML(me())}`);

/* ---------- cards tab ---------- */
const DECK_ART = { JB: 'i_idea', TB: 'i_house', AZ: 'i_expense', ZZ: 'i_market', NB: 'i_shop', IE: 'i_risk', MO: 'i_dream' };
function vCards() { return `<div class="ptitle"><button class="pback" data-a="tab" data-t="board" aria-label="Буцах"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><h2>Картууд</h2><span class="pill">${OF.cards.filter(c => c.deck !== 'MO').length}</span></div>${cardsBody(false)}`; }
function cardsBody(browse) {
  // only the printed decks (user 2026-11-11): no empty decks, no Мөрөөдөл (dreams live on the Шарк тал board)
  const counts = {}; OF.cards.forEach(c => counts[c.deck] = (counts[c.deck] || 0) + 1);
  const shown = Object.keys(DECKS).filter(k => k !== 'MO' && counts[k] > 0);
  if (!shown.includes(UI.cardsDeck)) UI.cardsDeck = shown[0];
  const dk = UI.cardsDeck; const q = UI.cardsQ.trim().toLowerCase();
  let list = OF.cards.filter(c => c.deck === dk);
  if (q) list = /^\d+$/.test(q) ? list.filter(c => (c.no || c.id.split('-')[1]) === q.padStart(2, '0')) : OF.cards.filter(c => shown.includes(c.deck) && (c.title + ' ' + (c.cat || '') + ' ' + (c.desc || '')).toLowerCase().includes(q));
  return `<div class="wrap">
    <div class="search">${ic('newspaper')}<input id="cardsQ" placeholder="Нэр, дугаар (жишээ: 12)" value="${esc(UI.cardsQ)}" data-in="cardsQ" aria-label="Карт хайх"></div>
    <div class="chips">${shown.map(k => `<button class="chip ${dk === k ? 'dk' : ''}" data-a="cardsDeck" data-k="${k}" aria-pressed="${dk === k}">${DECKS[k].n} ${counts[k] || 0}</button>`).join('')}</div>
    <div class="clist">${list.map(c => cardItem(c, browse ? 'viewCard' : 'useCard')).join('') || '<p class="empty">Олдсонгүй</p>'}</div></div>`;
}
let qT = 0;
ACT.cardsQ = (d, el) => { UI.cardsQ = el.value; clearTimeout(qT); qT = setTimeout(() => { const pos = el.selectionStart; render(); const n = $('#cardsQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 200); };
ACT.cardsDeck = d => { UI.cardsDeck = d.k; render(); };
ACT.viewCard = d => openSheet(() => `<div class="shead"><h3>${esc(cno(CARD[d.id]))}</h3>${X}</div>${cardHTML(CARD[d.id])}${CARD[d.id].basis ? `<p class="mute" style="font-size:12px">Эх сурвалж: ${esc(CARD[d.id].basis)}</p>` : ''}`);
ACT.useCard = d => { const P = me(); if (!canAct(P)) return ACT.viewCard(d); startCard(d.id, { from: 'browse' }); };

/* ---------- players tab ---------- */
/* ---------- Түүх tab (moved to the bottom nav) ---------- */
function vHist() {
  const P = me();
  const h = P.hist || [];
  const inn = sum(h.filter(e => e.amt > 0), e => e.amt), out = sum(h.filter(e => e.amt < 0), e => e.amt);
  return `<div class="ptitle"><h2>Түүх</h2><span class="pill">${esc(P.name)}</span></div>
  <div class="wrap"><div class="svsum"><div><small>Нийт орсон</small><b class="pos">+${fmtS(inn)}</b></div><div><small>Нийт гарсан</small><b class="neg">${fmtS(out)}</b></div><div><small>Үйлдэл</small><b>${h.length}</b></div></div>
  <div class="box feed">${h.map(logRow).join('') || '<p class="empty">Түүх хоосон</p>'}</div></div>`;
}
/* what a player owns, counted, under his name on Тоглогчид (user 2026-11-11: skills, real estate, savings, bonds must be visible) */
function ownLine(p) {
  if (!isV3(p) || p.level !== 1) return '';
  const A = p.assets || [], n = (k, l) => k ? `${l} ${k}` : '';
  const parts = [n(A.filter(a => a.kind === 're' && a.sub !== 'biz' && a.sub !== 'garage').length, 'Үл хөдлөх'), n(A.filter(a => a.kind === 're' && (a.sub === 'biz' || a.sub === 'garage')).length, 'Бизнес'),
    n(A.filter(a => a.kind === 'presale').length, 'Захиалга'), n(A.filter(a => a.kind === 'land').length, 'Газар'), n(A.filter(a => a.kind === 'stock').length, 'Хувьцаа'),
    n(A.filter(a => a.kind === 'bond').length, 'Бонд'), n(A.filter(a => a.kind === 'metal' || a.kind === 'antique').length, 'Алт, эртний эд'),
    n((p.savings || []).length, 'Хадгаламж'), n((p.skills || []).length, 'Ур чадвар'), n((p.sides || []).filter(s => s.left > 0).length, 'Нэмэлт орлого')].filter(Boolean);
  return parts.length ? `<small class="own8">${parts.join(' · ')}</small>` : '';
}
function vPlayers() {
  // rank by the freedom bar (passive ÷ living), the same bar shown on each row (user 2026-10-26); passive income breaks ties
  const prog = p => { const f = fin(p, G); return p.won ? 2 : (f.progress || 0); };
  const rank = [...G.players].sort((a, b) => (!!a.out - !!b.out) || (b.level - a.level) || (prog(b) - prog(a)) || (fin(b, G).passive - fin(a, G).passive));
  return `<div class="ptitle"><h2>Тоглогчид</h2>${G.mode === 'online' ? `<span class="pill">Өрөө ${esc(G.room)}</span>` : ''}</div>
  <div class="wrap">
    ${G.mode === 'online' ? `<div class="box center-t"><small class="mute">Өрөөний код</small><div class="code">${esc(G.room)}</div><p class="mute" style="font-size:12px">${NET.status()}</p>${NET.isHost() ? '<p class="adm8-n">Та өрөөний админ. Ээлжийн дарааллыг тогтоож, хүссэн тоглогчоо хасаж болно.</p>' : ''}</div>` : ''}
    ${rank.map((p, i) => { const f = fin(p, G); return `<div class="rank ${i === 0 ? 'top' : ''}" style="--k:${i}"><span class="n">${i + 1}</span>${avatar(p)}<span style="flex:1;min-width:0"><b>${esc(p.name)}${p.id === me().id ? ' · та' : ''}</b>${G.mode === 'online' && G.host === p.id ? '<em class="adm8">Админ</em>' : ''}${(G.mode === 'online' ? G.turn === p.id : G.players[G.cur] && G.players[G.cur].id === p.id) && G.players.length > 1 ? '<em class="trn8">Ээлж</em>' : ''}<br><small class="mute">${esc(PROF[p.profId].title)} · Түвшин ${p.level}${p.level === 2 && p.l7 && CARD[p.l7.dream] ? ' · мөрөөдөл: ' + esc(CARD[p.l7.dream].title) : ''}${p.out ? ' · гарсан' : ''}${p.won ? ' · ялагч' : ''}</small>
      <span class="mbar"><i style="width:${(f.progress * 100).toFixed(0)}%"></i></span>${ownLine(p)}</span>
      <span style="text-align:right"><b class="money">${cashTxt(p)}</b><br><small class="mute">идэвхгүй ${fmtS(f.passive * (isV3(p) ? 4 : 1))}${isV3(p) ? ' / 4 сар' : ''}</small></span>
      ${NET.isHost() && p.id !== me().id ? `<button class="kick8" data-a="kick8" data-id="${p.id}" aria-label="${esc(p.name)}-г хасах" title="Хасах">${ic2('r:user-minus')}</button>` : ''}<button class="iconbtn" data-a="${G.mode === 'local' ? 'switchTo' : 'peek'}" data-id="${p.id}" aria-label="Харах">${ic('arrow-right')}</button></div>`; }).join('')}

  </div>`;
}

/* ---------- rules tab ---------- */
function rulesHTML() {
  return `<div class="rules">${OF.rules.map(r => `<h3>${esc(r.title)}</h3>${(() => {
    let h = '', ul = false;
    for (const b of r.blocks) {
      if (b.t === 'li') { if (!ul) { h += '<ul>'; ul = true; } h += `<li>${esc(b.x)}</li>`; continue; }
      if (ul) { h += '</ul>'; ul = false; }
      h += b.t === 'h3' ? `<h4>${esc(b.x)}</h4>` : `<p>${esc(b.x)}</p>`;
    }
    return h + (ul ? '</ul>' : '');
  })()}`).join('')}</div>`;
}
function vRules() {
  return `<div class="ptitle"><button class="pback" data-a="tab" data-t="board" aria-label="Буцах"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><h2>Дүрэм</h2></div><div class="wrap">
    ${isV3(me()) ? '' : `<div class="box"><h4>Аппын тооцоо</h4>${settingsHTML(G.settings, 'gset')}</div>
    <div class="alert">${ic('warning-circle')}<span><b>Апп ба хэвлэсэн дүрмийн ялгаа</b>Цалингийн өдөр ×1, халагдвал 1 сарын зардал ба 2 ээлж өнжинө, яаралтай зээл сарын ${G.settings.loanPct}% гэж апп тооцно. Хэвлэсэн дүрэмд өөр тоо байвал студид засна.</span></div>`}
    <div class="box">${rulesHTML()}</div>
    <p class="mute" style="font-size:12px;padding:0 4px 20px">Картын тоо, үнэ, эх сурвалж: OctoFinance студи (${new Date(OF.built).toLocaleDateString('mn-MN')}). Бодит дүнгийн эх сурвалжийг карт бүрийн доор харуулсан.</p></div>`;
}
ACT.gset = d => { snap('Тохиргоо'); G.settings[d.k] = !G.settings[d.k]; if (d.k === 'shortGame') G.startedAt = Date.now(); save(); render(); };

ACT.sqType = d => {
  const P = me(); const sq = P.level === 2 ? OF.board.sq2 : OF.board.sq1;
  const i = sq.findIndex(q => q.type === d.t); if (i >= 0) ACT.sq({ i });
};
ACT.hop = (d, el) => { el.classList.remove('a-idle', 'a-hop'); void el.offsetWidth; el.classList.add('a-hop'); setTimeout(() => { el.classList.remove('a-hop'); el.classList.add('a-idle'); }, 720); };
/* a name is required to start (user 2026-11-04): the header shows the player's own name, the card pill the profession */
['startGame', 'joinGo'].forEach(k => { const f = ACT[k]; ACT[k] = (d, el) => {
  const S = UI.setup || {}, inp = document.getElementById('sname');
  if (S.sel && !(S.name || '').trim()) { if (inp) { inp.classList.remove('err'); void inp.offsetWidth; inp.classList.add('err'); inp.placeholder = 'Нэрээ бичнэ үү'; inp.focus(); } buzz && buzz(20); return; }
  return f(d, el); }; });
const _sname = ACT.sname; ACT.sname = (d, el) => { _sname(d, el); if (el.value.trim()) el.classList.remove('err'); };
/* ============================================================
   Flows: dice, squares, cards, payday, loans, selling, market, level 2
   ============================================================ */
const X = `<button class="x" data-a="close" aria-label="Хаах">${'<svg class="i" viewBox="0 0 256 256" aria-hidden="true"><path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z" fill="currentColor"/></svg>'}</button>`;
const head = (t, crumbs) => `${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<div class="shead"><h3>${t}</h3>${X}</div>`;
function afterBox(P, dCash, dCf, labelCf = 'Нийт сарын ашиг', auto) {
  if (P.v3 && P.level === 1) return '';   // Level 1 v3 has no before/after box (user 2026-10-23)
  const f = fin(P, G);
  const o = auto && dCash < 0 ? loanOpt(P, -dCash) : null;
  const L = o && o.amt > 0 ? o.amt : 0;
  const lr = L ? o.pay * (/Жилийн/.test(labelCf) ? 12 : 1) : 0;
  const cashAfter = P.cash + dCash + L; const cf2 = dCf - lr;
  return `<div class="after"><div><small>Бэлэн мөнгө дараа нь</small><span class="money ${cashAfter < 0 ? 'neg' : ''}">${fmtS(cashAfter)}</span><span class="d ${dCash >= 0 ? 'pos' : 'neg'}">${fmtS(dCash, { sign: true })}${L ? ' · зээл +' + fmtS(L) : ''}</span></div>
    <div><small>${labelCf}</small><span class="money ${f.cf + cf2 < 0 ? 'neg' : 'pos'}">${fmtS(f.cf + cf2, { sign: true })}</span><span class="d ${cf2 >= 0 ? 'pos' : 'neg'}">${cf2 ? fmtS(cf2, { sign: true }) + (labelCf.startsWith('Таны нийт') ? (cf2 > 0 ? ' нэмэгдэнэ' : ' буурна') : '') : 'өөрчлөлтгүй'}${lr ? (o.kind === 'bankl' ? ' · зээл ' : ' · хүү ') + fmtS(-lr, { sign: true }) : ''}</span></div></div>`;
}
const loanRate = P => P.level === 2 ? P.l2.rate : G.settings.loanPct;
/* freedom bar impact: lasting passive income ÷ living cost, before → after (new loan payments raise living cost) */
function freeImpact(P, dPassive, dLiving) {
  if (P.level !== 1) return '';
  const f = fin(P, G);
  const pct = (pa, lv) => lv > 0 ? Math.max(0, Math.min(1, pa / lv)) : 0;
  const a = pct(f.stablePassive, f.living), b = pct(f.stablePassive + (dPassive || 0), f.living + (dLiving || 0));
  const A = Math.floor(a * 100), B = Math.floor(b * 100);
  if (A === B && !dLiving && !dPassive) return '';
  const up = b >= a;
  return `<div class="fimp ${up ? 'up' : 'dn'}"><div class="fh"><span>Эрх чөлөө хүртэл</span><b>${A}% → ${B}%</b></div>
    <div class="ftr"><i class="was" style="width:${(a * 100).toFixed(1)}%"></i><i class="now" style="width:${(b * 100).toFixed(1)}%"></i></div>
    ${dLiving ? `<small>Сарын зардал ${fmtS(f.living)} → ${fmtS(f.living + dLiving)}${dPassive ? ` · идэвхгүй орлого +${fmtS(dPassive)}` : ''}</small>` : dPassive ? `<small>Идэвхгүй орлого +${fmtS(dPassive)}/сар</small>` : ''}</div>`;
}
const roomTxt = P => loanRoom(P, G) >= APP_INF ? 'хязгааргүй' : fmtS(loanRoom(P, G));
/* Auto-loan when cash is short for a purchase or a bill. Two kinds:
   Аппын зээл (kind 'bank') — 10%/сар, only interest is charged monthly, the player repays the principal himself.
   Банкны зээл (kind 'bankl') — lower rate, monthly payment = principal + interest over a fixed term, DTI-limited. */
function loanOptOld(P, need) {
  const lack = need - P.cash; if (lack <= 0) return null;
  const unit = G.settings.emergencyUnit; const amt = Math.ceil(lack / unit) * unit;
  const canB = P.level === 1 && bankRoom(P, G) >= amt, canA = loanRoom(P, G) >= amt;
  let kind = FS.lk;
  if ((kind === 'bankl' && !canB) || (kind === 'bank' && !canA)) kind = null;
  if (!kind) kind = canB ? 'bankl' : canA ? 'bank' : null;
  if (!kind) return { amt: -1, lack, canA, canB };
  const pay = kind === 'bankl' ? annuityPay(amt, G.settings.bankRate, G.settings.bankMonths) : R(amt * loanRate(P) / 100);
  return { amt, kind, pay, lack, canA, canB };
}
function lackLoan(P, need) { const o = loanOpt(P, need); return o ? o.amt : 0; }
const LOAN_NAME = { bank: 'аппын', bankl: 'банкны' };
function payBtn(P, need, a, label, ok = true, extra = '') {
  // v3: the button always reads its own label; when cash is short, pressing it brings up a loan offer to approve (user 2026-10-22)
  if (P.v3 && P.level === 1) { const short = ok && R(need - P.cash) > 0;
    return `<button class="btn go" data-a="${short ? 'lackAsk' : a}" data-go="${a}" data-need="${R(need)}" ${extra} ${ok ? '' : 'disabled'}>${label}</button>`; }
  const o = ok ? loanOpt(P, need) : null;
  if (!ok || (o && o.amt < 0)) return `<button class="btn go" data-a="${a}" ${extra} disabled>${o && o.pick && ok ? 'Зээлээ сонгоно уу' : label}</button>`;
  if (o) return `<button class="btn go two" data-a="loanGo" data-go="${a}" data-lamt="${o.amt}" data-lk="${o.kind}" ${extra}>${label}<small>${fmtS(o.amt)} ${P.level === 2 ? 'барьцаат' : P.v3 ? (o.kind === 'bankl' ? 'банкны' : 'яаралтай') : LOAN_NAME[o.kind]} зээлээр</small></button>`;
  return `<button class="btn go" data-a="${a}" ${extra}>${label}</button>`;
}
ACT.loanGo = d => {
  const P = me(); const amt = +d.lamt; const bankl = d.lk === 'bankl';
  if (!(amt > 0) || (bankl ? bankRoom(P, G) : loanRoom(P, G)) < amt) return toast('Зээл авах эрх хүрэлцэхгүй');
  snap('Зээл'); if (bankl) takeBankLoan(G, P, amt); else takeLoan(G, P, amt);
  if (G.mode === 'online') NET.emit({ t: 'loan', txt: `${fmtS(amt)} ${bankl ? 'банкны' : 'аппын'} зээл авлаа` });
  toast(bankl ? `${fmtS(amt)} банкны зээл · сард ${fmt(annuityPay(amt, G.settings.bankRate, G.settings.bankMonths))}` : `${fmtS(amt)} ${P.v3 ? 'яаралтай' : 'аппын'} зээл · сард ${fmt(R(amt * loanRate(P) / 100))} хүү`);
  ACT[d.go](d);
};
ACT.lkSet = d => { FS.lk = d.k; drawSheet(); };
function shortfallOld(P, need, auto) {
  const lack = need - P.cash; if (lack <= 0) return '';
  const fr = P.free > 0 ? `<div class="alert ok">${ic('piggy-bank')}<span><b>Хадгаламжид ${fmtS(P.free)} байна</b>Зээл авахаас өмнө хадгаламжаасаа авч болно.<span class="row"><button class="minibtn go" data-a="freeCover" data-amt="${Math.min(P.free, lack)}">${fmtS(Math.min(P.free, lack))} авах</button></span></span></div>` : '';
  return fr + shortfall0(P, need, auto);
}
ACT.freeCover = d => { const P = me(); snap('Хадгаламжаас авах'); freeMove(G, P, +d.amt); save(); render(); drawSheet(); toast('Хадгаламжаас авлаа'); };
function shortfall0(P, need, auto) {
  const lack = need - P.cash;
  if (lack <= 0) return '';
  const unit = G.settings.emergencyUnit;
  const amt = Math.ceil(lack / unit) * unit;
  const room = loanRoom(P, G);
  const int = fmt(R(amt * loanRate(P) / 100));
  if (auto) {
    const o = loanOpt(P, need);
    if (o.amt < 0) return `<div class="alert neg">${ic('warning-circle')}<span><b>${fmtS(lack)} дутна</b>Зээл авах эрх хүрэлцэхгүй (банк ${fmtS(bankRoom(P, G))}, апп ${fmtS(room)}). Хөрөнгөө зарах эсвэл алгасна уу.</span></div>`;
    if (P.level === 2) return `<div class="alert">${ic('bank')}<span><b>${fmtS(lack)} дутна — барьцаат зээлээр нөхнө</b>Төлөх товч дарахад ${fmtS(amt)} зээл автоматаар авна (сарын ${loanRate(P)}%).</span></div>`;
    const bp = annuityPay(amt, G.settings.bankRate, G.settings.bankMonths);
    const opt = (k, ok, t, sub) => `<button class="lopt ${o.kind === k ? 'on' : ''}" data-a="lkSet" data-k="${k}" ${ok ? '' : 'disabled'}><b>${t}</b><small>${sub}</small></button>`;
    const fdrop = add => { const f = fin(P, G); if (!(f.living > 0) || !f.stablePassive) return ''; const a1 = Math.floor(Math.min(1, f.stablePassive / f.living) * 100), b1 = Math.floor(Math.min(1, f.stablePassive / (f.living + add)) * 100); return a1 !== b1 ? ` · эрх чөлөө ${a1}% → ${b1}%` : ''; };
    return `<div class="alert">${ic('bank')}<span><b>${fmtS(lack)} дутна — ${fmtS(amt)} зээлээр нөхнө</b>Аль зээлийг авахаа сонгоно уу. Төлөх товч дарахад автоматаар авна.
      <span class="lopts">${opt('bankl', o.canB, 'Банкны зээл', o.canB ? `Сар бүр −${fmt(bp)} (үндсэн төлөлт + хүү) · ${G.settings.bankMonths} сар · нийт хүү −${fmtS(bp * G.settings.bankMonths - amt)}` : `Эрх хүрэлцэхгүй (${fmtS(bankRoom(P, G))})`)}${opt('bank', o.canA, `Аппын зээл · ${loanRate(P)}%`, o.canA ? `Сар бүр −${int} хүү · үндсэн нь буурахгүй · жилд хүү −${fmtS(R(amt * loanRate(P) / 100) * 12)}` : `Эрх хүрэлцэхгүй`)}</span></span></div>`;
  }
  if (room < amt) return `<div class="alert neg">${ic('warning-circle')}<span><b>${fmtS(lack)} дутна</b>Зээл авах эрх хүрэлцэхгүй (${fmtS(room)}). Хөрөнгөө зарах эсвэл алгасна уу.</span></div>`;
  return `<div class="alert">${ic('warning-circle')}<span><b>${fmtS(lack)} дутна</b>Аппын зээл ${fmtS(amt)} авбал хүрнэ (сард зөвхөн хүү ${int}).<span class="row"><button class="minibtn go" data-a="quickLoan" data-amt="${amt}">${fmtS(amt)} зээл авах</button><button class="minibtn" data-a="openLoan" data-bt="bankl">Банкны зээл</button></span></span></div>`;
}
ACT.quickLoan = d => { const P = me(); snap('Зээл'); takeLoan(G, P, +d.amt); save(); drawSheet(); toast(`${fmtS(+d.amt)} зээл авлаа`); };

/* ---------- dice & movement ---------- */
ACT.roll = () => {
  const P = me();
  if (P.skip > 0) {
    snap('Өнжих'); P.skip -= 1; log(G, P, 'Ээлж өнжлөө', 0, null, 'skip'); save(); render();
    return toast(`Ээлж өнжлөө · ${P.skip} үлдсэн`);
  }
  FS = { dice: P.edu > 0 && P.level === 1 && !P.v3 ? 3 : 2, vals: null };
  openSheet(fDice);
};
function fDice() {
  const nd = FS.dice || 1, two = nd > 1;
  const pad = Array.from({ length: nd * 5 + 1 }, (_, i) => nd + i);
  return `${head(two ? nd + ' шоо хэд буув?' : 'Шоо хэд буув?')}
  <div class="dicehero">${art('i_dice', 'a-idle')}</div><p class="mute center-t">Самбар дээр ${two ? nd + ' шоогоо' : 'шоогоо'} хаяад буусан ${two ? 'нийлбэр' : 'тоо'}гоо дарна уу.</p>
  ${nd === 3 ? `<p class="pill" style="margin:0 auto 8px">Боловсрол · 3 шоогоор хаяна · ${me().edu} ээлж үлдсэн</p>` : ''}
  <div class="dicepad">${pad.map(n => `<button data-a="move" data-n="${n}">${n}</button>`).join('')}</div>
  ${FS.pick ? `<div class="sec">Буусан нүдээ шууд сонгох</div><div class="box land">${landList(me()).map(([t, i, n], k) => `<button data-a="sqPick" data-t="${t}" style="--k:${k}"><span class="tile"><img src="${ART(i)}" alt=""></span>${n}</button>`).join('')}</div>`
    : `<button class="linkbtn" data-a="sqPickOpen">Самбар дээрх нүд өөр байна уу? Буусан нүдээ шууд сонгох</button>`}`;
}
ACT.sqPickOpen = () => { FS.pick = true; drawSheet(); };
ACT.sqPick = d => { closeSheet(); ACT.sqType(d); };
ACT.move = d => {
  const P = me(); const n = +d.n;
  snap('Нүүдэл');
  const L2 = P.level === 2;
  const sq = L2 ? OF.board.sq2 : OF.board.sq1;
  const from = L2 ? P.pos2 : P.pos;
  const pays = []; let dreamPass = false;
  for (let k = 1; k <= n; k++) {
    const idx = (from + k) % sq.length;
    if ((L2 ? PAY2 : PAY1).includes(idx)) pays.push(idx);
    if (L2 && k < n && sq[idx].type === 'DREAM') dreamPass = true;
  }
  const to = (from + n) % sq.length;
  if (L2) P.pos2 = to; else P.pos = to;
  log(G, P, `${n} нүд явлаа → ${sq[to].name}`, 0, null, 'move');
  save(); render();
  // paydays crossed (landing on a payday square counts once)
  const go = () => (dreamPass && P.dream && P.cash >= CARD[P.dream].fx.price && sq[to].type !== 'DREAM') ? openSheet(fDreamSq) : landing(to);
  if (pays.length) return runPaydays(pays.length, go);
  go();
};
function runPaydaysOld(k, then) {
  const P = me();
  const res = P.level === 2 ? annualIncome(G, P) : payday(G, P);
  skillTick(P);
  G.conds.forEach(c => { if (c.owner === P.id && c.paydays) c.paydays -= 1; });
  G.conds = G.conds.filter(c => !(c.paydays !== undefined && c.paydays <= 0));
  if (G.settings.shortGame && Date.now() - G.startedAt > G.settings.shortMins * 60000 && !G.over) {
    const best = [...G.players].filter(p => !p.out).sort((a, b) => (b.level - a.level) || (fin(b, G).passive - fin(a, G).passive))[0];
    G.over = { winner: best.id, why: `${G.settings.shortMins} минут дууслаа · хамгийн өндөр идэвхгүй орлого` };
  }
  const next = k > 1 ? () => runPaydays(k - 1, then) : then;
  // a plain payday has no pop-up: the lobby mascot celebrates and the cash counts up (user 2026-10-15).
  // The breakdown opens only when there is something to decide.
  const needSheet = res.canLevel || P.cash < 0 || (res.ventureRolls || []).length || (res.matured || []).length || (res.sav || []).filter(e => e.k !== 'done').length || res.infl || (res.report || []).length;
  buzz(25);
  if ((res.payouts || []).length) { save(); render(); FS = { pay: res, then: next, after: needSheet }; return openSheet(fPayout, { modal: true }); }
  if (needSheet) { save(); render(); FS = { pay: res, then: next }; return openSheet(fPayday, { modal: true }); }
  if (G.mode === 'online' && res.payoffs.some(p => p && p.first)) NET.emit({ t: 'payoff', txt: `анхны өрөө хаалаа: ${res.payoffs[0].debt}` });
  const pt = sum(res.payouts || [], x => x.total);
  UI.celebrate = { at: Date.now(), from: P.cash - res.delta - pt, to: P.cash, delta: res.delta, payoffs: res.payoffs.filter(Boolean), payouts: res.payouts || [] };
  save(); FS = {};
  if (next) next(); else closeSheet();
}
function landing(i) {
  const P = me();
  const s = (P.level === 2 ? OF.board.sq2 : OF.board.sq1)[i];
  if (s.type === 'PAY' || s.type === 'PAY2') { closeSheet(); return; }
  openSquare(s, i);
}
ACT.sq = d => {
  const P = me(); if (!canAct(P)) return toast('Зөвхөн өөрийн самбарыг удирдана');
  const s = (P.level === 2 ? OF.board.sq2 : OF.board.sq1)[+d.i];
  FS = { manual: true };
  openSquare(s, +d.i, true);
};
ACT.sqPay = () => {
  const P = me();
  FS = {};
  openSheet(() => `${head(P.level === 2 ? 'Жилийн орлого авах уу?' : 'Цалингийн өдөр авах уу?')}<p class="mute">${P.level === 2 ? 'Жилийн орлого нүдэнд буусан эсвэл давсан үед.' : 'Цалингийн өдөр нүдэнд буусан эсвэл давсан үед дарна. Шооны тоогоо апп-д оруулбал автоматаар тооцогдоно.'}</p>
    ${afterBox(P, P.level === 2 ? fin(P, G).cf * 12 : fin(P, G).cf * G.settings.payX, 0)}
    <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="payNow">${P.level === 2 ? 'Жилийн орлого авах' : 'Цалин авах'}</button></div>`);
};
ACT.payNow = () => { snap('Цалингийн өдөр'); runPaydays(1, () => closeSheet()); };

function openSquareOld(s, i, manual) {
  const P = me();
  const t = s.type;
  if (t === 'PAY' || t === 'PAY2') return ACT.sqPay();
  if (t === 'OPP') { FS = { sq: s }; return openSheet(fOppPick); }   // Жижиг or Том боломж again (studio v170): the player picks the pile
  if (t === 'DOO') { FS = { deck: 'AZ', sq: s }; return openSheet(fPick); }
  if (t === 'MKT') { FS = { deck: 'ZZ', sq: s }; return openSheet(fPick); }
  if (t === 'OPP2') { FS = { deck: 'NB', sq: s }; return openSheet(fPick); }
  if (t === 'RISK') { FS = { deck: 'IE', sq: s }; return openSheet(fPick); }
  if (t === 'CHILD') return openSheet(() => `${head(s.name)}${stage('i_child', 'a-idle', '', 'sm')}
      ${P.kids < 3 ? `<div class="box" style="text-align:center"><p style="font-size:15px">Хүүхэдтэй боллоо! Орлого бүр таны зардал нэмэгдэнэ:</p><p class="neg" style="font-size:22px;font-weight:800;margin-top:6px">−${fmt(P.childCost * L1.mpp)} / 4 сар</p></div>`
        : `<div class="box" style="text-align:center"><p style="font-size:15px">Танд 3 хүүхэд байгаа тул зардал нэмэгдэхгүй.</p></div>`}
      <div class="cta"><button class="btn go" data-a="childOk">Ойлголоо</button></div>`);
  if (t === 'TSAGAAN') return openSheet(() => `${head(s.name)}${stage('i_tsagaan', 'a-idle', '', 'sm')}<div class="box"><p>Цагаан сар, Наадам, Шинэ жилийн бэлэг, золголт, идээний зардал.</p></div>${afterBox(P, -G.settings.tsagaan, 0, undefined, true)}${shortfall(P, G.settings.tsagaan, true)}<div class="cta">${payBtn(P, G.settings.tsagaan, 'tsagaanOk', fmt(G.settings.tsagaan) + ' төлөх')}</div>`);
  if (t === 'FIRED') { FS = { job: null, sq: s }; return openSheet(fJob); }
  if (t === 'EDU') { FS = { sq: s }; return openSheet(fEdu); }
  if (t === 'HEALTH') { FS = { sq: s, hd: null }; return openSheet(fHealth); }
  if (t === 'MARRY') { FS = { sq: s }; return openSheet(fMarry); }
  if (t === 'TAX') { const amt = R(fin(P, G).passive * 12 * G.settings.taxPct / 100); return openSheet(() => `${head('Татвар')}${stage('i_bank', 'a-idle', '', 'sm')}<div class="box"><p>Жилийн идэвхгүй орлогын ${G.settings.taxPct}%-ийг төлнө.</p><div class="ln"><span>Жилийн идэвхгүй орлого</span><b>${fmt(fin(P, G).passive * 12)}</b></div></div>${afterBox(P, -amt, 0, undefined, true)}${shortfall(P, amt, true)}<div class="cta">${payBtn(P, amt, 'taxOk', fmt(amt) + ' төлөх', true, `data-amt="${amt}"`)}</div>`); }
  if (t === 'DREAM') return openSheet(fDreamSq);
  if (t === 'INV') { FS = { step: 'inv', sel: null, amt: 0, share: 0 }; return openSheet(fInvestor); }
}
/* Боловсролоо дээшлүүлэх (R06): pay 10% of (salary + passive), then 3 turns of rolling twice */
function eduCost(P) { const f = fin(P, G); return R((f.salary + Math.max(0, f.passive)) * 0.1); }
function fEdu() {
  const P = me(); const amt = eduCost(P);
  return `${head(FS.sq ? esc(FS.sq.name) : 'Боловсролоо дээшлүүлэх')}${stage('p_PR-01', 'a-idle', '', 'sm')}
  <div class="box"><p>Сарын орлогынхоо 10%-ийг сургалтад зарцуулбал дараагийн <b>3 ээлж</b> 3 шоогоор хаяна.</p></div>
  ${afterBox(P, -amt, 0, undefined, true)}${shortfall(P, amt, true)}
  <div class="cta"><button class="btn" data-a="close">Үгүй</button>${payBtn(P, amt, 'eduOk', fmt(amt) + ' төлөх', true)}</div>`;
}
ACT.eduOk = () => { const P = me(); const amt = eduCost(P); snap('Боловсрол'); pay(G, P, amt, 'Боловсролоо дээшлүүлэх', null, 'pay'); P.edu = 3; P.flags.training = true; save(); closeSheet(); };
/* each square a player resolves uses up one boosted turn */
function eduTick(P) { if (P && P.edu > 0) P.edu -= 1; }
/* the player taps the lobby banner after each boosted turn: one tap = one turn used (user 2026-10-19) */
ACT.eduUse = () => { const P = me(); if (!canAct(P) || !(P.edu > 0)) return; snap('Боловсрол · ээлж'); P.edu -= 1; save(); render(); toast(P.edu ? `${P.edu} ээлж үлдлээ` : 'Боловсролын ээлж дууслаа'); };
/* Гэрлэх (R06): half of cash and savings, once per player */
function fMarry() {
  const P = me(); const married = P.flags.married;
  const sav = sum(P.savings || [], x => savPrincipal(x)) + sum(P.assets.filter(a => a.kind === 'deposit'), a => a.amount) + (P.free || 0);
  const lose = R(Math.max(0, P.cash) / 2) + R(sav / 2);
  return `${head(FS.sq ? esc(FS.sq.name) : 'Гэрлэх')}${stage('i_tsagaan', 'a-idle', '', 'sm')}
  ${married ? `<div class="box"><p>Та аль хэдийн гэрлэсэн. Юу ч өөрчлөгдөхгүй.</p></div><div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`
    : `<div class="box"><div class="ln"><span>Бэлэн мөнгөний тал</span><b class="neg">−${fmt(R(Math.max(0, P.cash) / 2))}</b></div>${sav ? `<div class="ln"><span>Хадгаламжийн тал</span><b class="neg">−${fmt(R(sav / 2))}</b></div>` : ''}
      <p class="mute" style="font-size:12px;margin-top:6px">Хурим, шинэ гэр бүлийн зардал. Хөрөнгө, орлого хэвээр.</p></div>
    <div class="cta"><button class="btn go" data-a="marryOk">${fmt(lose)} төлөх</button></div>`}`;
}
ACT.marryOk = () => {
  const P = me(); if (P.flags.married) return closeSheet();
  snap('Гэрлэх');
  const c = R(Math.max(0, P.cash) / 2); if (c) pay(G, P, c, 'Гэрлэх · хурим', null, 'pay');
  for (const s of P.savings || []) for (const d of s.deps) d.amt = R(d.amt / 2);
  for (const a of P.assets.filter(a => a.kind === 'deposit')) a.amount = R(a.amount / 2);
  if (P.free) P.free = R(P.free / 2);
  P.flags.married = true; save(); closeSheet(); toast('Гэрлэлээ');
};
/* Эрүүл мэнд (R06, studio 2026-10-15): roll 1 die every landing — 1–2 → 500,000₮ · 3–4 → 1 сая₮ · 5–6 → 2 сая₮ treatment */
const HEALTH_COST = [0, 500000, 500000, 1000000, 1000000, 2000000, 2000000];
function fHealth() {
  const P = me(); const v = FS.hd; const amt = v ? HEALTH_COST[v] : 0;
  return `${head(FS.sq ? esc(FS.sq.name) : 'Эрүүл мэнд')}${stage('p_PR-02', 'a-idle', '', 'sm')}
  <div class="box"><div class="ln"><span>Шоо 1–2</span><b>${fmt(500000)}</b></div><div class="ln"><span>Шоо 3–4</span><b>${fmt(1000000)}</b></div><div class="ln"><span>Шоо 5–6</span><b>${fmt(2000000)}</b></div>
    <p class="mute" style="font-size:12px;margin-top:6px">1 шоо хаяж эмчилгээний зардлаа төлнө.</p></div>
  ${v ? `<div class="dice"><div class="die">${v}</div></div>${afterBox(P, -amt, 0, undefined, true)}${shortfall(P, amt, true)}
    <div class="cta"><button class="btn" data-a="healthRe">Шоо засах</button>${payBtn(P, amt, 'healthOk', fmt(amt) + ' төлөх', true, `data-amt="${amt}"`)}</div>`
    : `<div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="healthDie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.healthDie = d => { FS.hd = +d.n; drawSheet(); };
ACT.healthRe = () => { FS.hd = null; drawSheet(); };
ACT.healthOk = d => { const P = me(); snap('Эрүүл мэнд'); pay(G, P, +d.amt, 'Эрүүл мэнд · эмчилгээ', null, 'pay'); save(); closeSheet(); };
ACT.childOk = () => { const P = me(); snap('Хүүхэд'); addChild(G, P); save(); closeSheet(); };
ACT.tsagaanOk = () => { const P = me(); snap('Баяр ёслол'); pay(G, P, G.settings.tsagaan, 'Баяр ёслол', null, 'pay'); save(); closeSheet(); };
function fJob() {
  const P = me(); const f = fin(P, G); const r = P.risk || 1; const v = FS.job;
  const lose = v && v <= r; const thin = f.reserve < f.reserveNeed;
  return `${head(FS.sq ? esc(FS.sq.name) : 'Ажлын эрсдэл')}${stage(v && !lose ? 'p_' + P.profId : 'm_fired', v && !lose ? 'a-hop' : 'a-fired')}
  <div class="box"><div class="ln"><span>Таны мэргэжил<span class="sub">${esc(PROF[P.profId].riskTxt || '')}</span></span><b>${r === 1 ? 'шоо 1' : 'шоо 1–' + r}</b></div>
    <div class="ln"><span>Нөөц сан<span class="sub">Бэлэн + хадгаламж · хэрэгтэй ${fmtS(f.reserveNeed)}</span></span><b class="${thin ? 'neg' : 'pos'}">${fmtS(f.reserve)}</b></div>
    <p class="mute" style="font-size:12px;margin-top:6px">1 шоо хаяна. ${r === 1 ? '1' : '1–' + r} буувал ажлаа алдаж 1 сарын цалин (${fmtS(f.salary)}) орохгүй. Нөөц сан ${G.settings.reserveMonths} сарын амьжиргааны зардлаас бага бол ажил хайж 1 ээлж өнжинө.</p></div>
  ${v ? `<div class="dice"><div class="die">${v}</div></div><p class="big ${lose ? 'neg' : 'pos'}">${lose ? 'Ажлаа алдлаа' : 'Ажил хэвээр'}</p>
    ${lose ? afterBox(P, -f.salary, 0) + (thin ? `<div class="alert neg">${ic('clock')}<span><b>1 ээлж өнжинө</b>Нөөц сан хүрэлцэхгүй тул ажил хайна.</span></div>` : `<div class="alert ok">${ic('seal-check')}<span><b>Нөөц сан аварлаа</b>Шинэ ажил олох хооронд нөөцөөрөө амьдарна — ээлж өнжихгүй.</span></div>`) + shortfall(P, f.salary) : ''}
    <div class="cta"><button class="btn go" data-a="jobOk">${lose ? fmt(f.salary) + ' төлөх' : 'Үргэлжлүүлэх'}</button></div>`
    : `<div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="jobDie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.jobDie = d => { FS.job = +d.n; drawSheet(); };
ACT.jobOk = () => { const P = me(); snap('Ажлын эрсдэл'); const before = P.skip; jobRisk(G, P, FS.job); save(); closeSheet(); if (P.skip > before) toast('1 ээлж өнжинө'); };
ACT.taxOk = d => { const P = me(); snap('Татвар'); pay(G, P, +d.amt, 'Татвар', null, 'pay'); save(); closeSheet(); };

/* ---------- opportunity: choose deck, then card ---------- */
function fOpp() {
  return `${head('Боломж')}<p class="mute">Жижиг эсвэл Том боломжоос нэгийг сонгож сугална.</p>
  <div class="deckpick">
    <button data-a="oppDeck" data-k="JB"><span class="art">${art('i_idea')}</span><b>Жижиг боломж</b><small>Хадгаламж, хувьцаа, алт, жижиг үл хөдлөх, ур чадвар</small></button>
    <button data-a="oppDeck" data-k="TB"><span class="art">${art('i_house')}</span><b>Том боломж</b><small>Байр, газар, бизнес. Зээлтэй.</small></button>
  </div>`;
}
ACT.oppDeck = d => { FS.deck = d.k; drawSheet2(fPick); };
function drawSheet2(fn) { UI.sheetFn = fn; drawSheet(true); }

function fPick() {
  const dk = FS.deck; const P = me();
  const q = (FS.q || '').trim().toLowerCase();
  let list = OF.cards.filter(c => c.deck === dk);
  if (q) list = list.filter(c => /^\d+$/.test(q) ? (c.no || c.id.split('-')[1]) === q.padStart(2, '0') : c.title.toLowerCase().includes(q));
  if (dk === 'MO' && P.dream) list = list.filter(c => c.id !== P.dream);
  return `${head(DECKS[dk].n, FS.sq ? `<span>${esc(FS.sq.name)}</span>›<b>${DECKS[dk].n}</b>` : '')}
  <p class="mute" style="font-size:13px">Сугалсан картынхаа дугаарыг (№) оруулна уу.${dk === 'MO' && P.level === 1 ? ' Мөрөөдлийн 2 карт сугалж, нэгийг нь сонгоно.' : ''}</p>
  <div class="search">${ic('identification-card')}<input id="pickQ" inputmode="text" placeholder="Дугаар эсвэл нэр" value="${esc(FS.q || '')}" data-in="pickQ" data-enter="pickFirst" aria-label="Картын дугаар"></div>
  <div class="clist">${list.slice(0, 120).map(c => cardItem(c, 'pickCard')).join('') || '<p class="empty">Олдсонгүй</p>'}</div>`;
}
let pqT = 0;
ACT.pickQ = (d, el) => { FS.q = el.value; clearTimeout(pqT); pqT = setTimeout(() => { const pos = el.selectionStart; drawSheet(); const n = $('#pickQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 180); };
ACT.pickFirst = () => { const q = (FS.q || '').trim(); if (!q) return; const c = OF.cards.find(x => x.deck === FS.deck && (x.no || x.id.split('-')[1]) === q.padStart(2, '0')); if (c) startCard(c.id); else toast(`№ ${q} олдсонгүй`); };
ACT.drawRandom = () => {
  G.decks = G.decks || {};
  let pile = G.decks[FS.deck];
  if (!pile || !pile.length) pile = OF.cards.filter(c => c.deck === FS.deck && !(FS.deck === 'MO' && c.id === me().dream)).map(c => c.id).sort(() => Math.random() - .5);
  const id = pile.shift(); G.decks[FS.deck] = pile; save();
  startCard(id);
};
ACT.pickCard = d => startCard(d.id);

/* ---------- start a card ---------- */
function startCardOld(id, extra = {}) {
  const c = CARD[id]; const P = me();
  const k = c.fx.k;
  FS = Object.assign({ card: id, deck: c.deck, mode: c.fx.loan ? 'loan' : 'cash', share: 1, qty: 0, step: 'view' }, extra);
  if (k === 'units') {
    G.prices[c.fx.sym] = c.fx.price;   // the drawn card sets today's price for everyone
    if (G.mode === 'online') NET.emit({ t: 'price', card: id, set: { [c.fx.sym]: c.fx.price } });
  }
  if (k === 'market') return openSheet(fMarket);
  if (k === 'risk') { FS.step = 'risk'; return openSheet(fRisk); }
  if (k === 'dream') return openSheet(fDreamPick);
  openSheet(fCard);
}

function fCard() {
  const c = CARD[FS.card]; const P = me(); const fx = c.fx;
  const k = fx.k;
  let act = '';
  if (k === 'asset') act = actAsset(P, c);
  else if (k === 'units') act = actUnits(P, c);
  else if (k === 'lot') act = actLot(P, c);
  else if (k === 'bond') act = actBond(P, c);
  else if (k === 'skill') act = actSkill(P, c);
  else if (k === 'trade') act = actTrade(P, c);
  else if (k === 'pawn') act = actPawn(P, c);
  else if (k === 'choice') act = actChoice(P, c);
  else if (k === 'gamble') act = actGamble(P, c);
  else if (k === 'expense') act = actExpense(P, c);
  else if (k === 'venture') act = actVenture(P, c);
  else if (k === 'nbexit' || k === 'nbsell2' || k === 'leverage') act = actNBSpecial(P, c);
  return `${head(DECKS[c.deck].n, `<span>${esc(DECKS[c.deck].n)}</span>›<b>№ ${c.no || c.id.split('-')[1]}</b>`)}${cardHTML(c)}${act}`;
}

/* ---- asset (real estate, business) ---- */
function manReady(c) {
  const m = FS.man || {}; const loanMode = !!c.fx.loan && (FS.mode === 'partner' ? (FS.pmode || 'loan') : FS.mode) !== 'cash';
  return m.price > 0 && m.net !== undefined && m.net !== '' && (!loanMode || (m.down > 0 && m.down <= m.price));
}
function manGross(c, loanMode) {
  // «Орлого»-ийг (зардал хасаагүй дүн) «Ашиг»-ийн оронд бичсэн эсэх
  const fx = c.fx, m = FS.man || {}; if (m.net === undefined || m.net === '' || !(fx.inc > 0)) return false;
  const right = fx.inc - fx.opex - (loanMode ? fx.loan.pay : 0);
  const cand = loanMode ? [fx.inc, fx.inc - fx.opex] : [fx.inc];
  return cand.some(w => w !== right && Math.abs(m.net - w) <= Math.max(1000, Math.abs(w) * 0.005));
}
function manCheck(c, loanMode) {
  if (manGross(c, loanMode)) return `<div class="alert neg">${ic('warning-circle')}<span><b>Та «Орлого»-ийг бичсэн байна</b>Картын «Ашиг»-ийг (орлого − зардал${loanMode ? ', зээлийн төлбөр орсон' : ''}) бичнэ үү. Зөвхөн ашиг тань сар бүр нэмэгдэнэ.</span></div>`;
  // compare what was typed with the card, without revealing the card's numbers
  const fx = c.fx, m = FS.man || {};
  const want = loanMode ? [fx.price, fx.down, null, fx.inc - fx.opex - fx.loan.pay] : [fx.price, null, null, fx.inc - fx.opex];
  const got = [m.price, m.down, m.pay, m.net];
  const off = want.some((w, k) => w !== null && Math.abs((got[k] || 0) - w) > Math.max(1000, Math.abs(w) * 0.005));
  return off ? `<p class="mute neg" style="font-size:12px">${ic('warning-circle')} Картан дээрх тоотой зөрж байна — дахин шалгана уу. (Тохиролцсон үнэ бол зүгээр.)</p>` : `<p class="mute pos" style="font-size:12px">${ic('seal-check')} Картын тоотой таарч байна.</p>`;
}
function actAsset(P, c) {
  const fx = c.fx;
  FS.mode = fx.loan ? 'loan' : 'cash';   // one way to buy: the card's own terms (no cash/loan/partner switch)
  // the card number is enough: the app fills in the card's own figures (user 2026-10-15); still editable for a negotiated price
  if (!FS.man || FS.manCard !== c.id) { FS.manCard = c.id; FS.man = { price: fx.price, net: fx.inc - fx.opex - (fx.loan ? fx.loan.pay : 0) }; if (fx.loan) FS.man.down = fx.down; }
  const opt = { mode: FS.mode, share: FS.mode === 'partner' ? FS.share : 1, rateCut: !!FS.rateCut, discount: FS.discount || 0, man: FS.man };
  if (FS.mode === 'partner') opt.mode = FS.pmode || (fx.loan ? 'loan' : 'cash');
  const loanMode = !!fx.loan && opt.mode !== 'cash';
  const ready = manReady(c) && !manGross(c, !!fx.loan && opt.mode !== 'cash');
  const q = ready ? quoteAsset(G, P, c, opt) : null;
  const cutCond = condActive(G, 'rateCut');
  const others = G.players.filter(p => p.id !== P.id && !p.out);
  const dCf = q ? q.inc - q.opex - (q.loan ? q.loan.pay : 0) : 0;
  const dPassive = q && fx.passive && !fx.active ? q.inc - q.opex - (q.loan ? q.loan.pay : 0) : 0;
  const m = FS.man;
  const fld = (k, label, sub, neg) => { const v = m[k]; const has = !(v === undefined || v === '');
    return `<label class="mrow ${has ? 'has' : ''}"><span class="ml">${label}${sub ? ` · ${sub}` : ''}</span><input id="m_${k}" inputmode="numeric" placeholder="${label}" value="${has ? Math.abs(v).toLocaleString('en') : ''}" data-in="manIn" data-k="${k}">${neg ? `<button class="sgn ${v < 0 ? 'on' : ''}" data-a="manSign" data-k="${k}" aria-label="Хасах тэмдэг">${v < 0 ? '−' : '+'}</button>` : ''}</label>`; };
  return `<div class="box" style="display:grid;gap:12px">
    <div class="mlist">
    ${fld('price', 'Нийт үнэ')}
    ${loanMode ? fld('down', 'Урьдчилгаа') : ''}
    ${fld('net', 'Сарын ашиг', '', true)}
    </div>
    ${loanMode && ready ? `<div class="ln"><span>Картын зээл<span class="sub">${fx.loan.rate}% · ${fx.loan.n} сар${fx.loan.by ? ' · ' + esc(fx.loan.by) : ''}</span></span><b>${fmtS(q.loan.p)} · ${fmt(q.loan.pay)}/сар</b></div>` : ''}
    ${manReady(c) ? (manCheck(c, loanMode).includes('pos') ? '' : manCheck(c, loanMode)) : (loanMode && m.price > 0 && m.down > m.price) ? `<p class="mute neg" style="font-size:12px">${ic('warning-circle')} Урьдчилгаа нийт үнээс их байна — нийт үнээ шалгана уу (тэг дутуу байж магадгүй).</p>` : ''}
    ${cutCond && loanMode ? `<div class="switch"><span>Зах зээлийн нөхцөл ${esc(cutCond.card)}: хүү −2%</span><button class="tog" data-a="rateCut" aria-pressed="${!!FS.rateCut}" aria-label="Хүү бууруулах"></button></div>` : ''}
    ${fx.ownhome ? `<p class="mute" style="font-size:12px">${P.home === 'rent' ? 'Байрны түрээс тань зогсож, тэр мөнгө хэмнэгдэнэ.' : 'Та түрээслэдэггүй тул хэмнэлт гарахгүй.'}</p>` : ''}
    ${fx.active ? `<p class="mute" style="font-size:12px">Идэвхтэй орлого: нэмэлт орлогод тооцогдоно, идэвхгүй орлогод орохгүй.</p>` : ''}
    ${q ? `<div class="ln" style="border:0"><span><b>Энэ картын сарын ашиг</b></span><b class="${dCf >= 0 ? 'pos' : 'neg'}">${fmt(dCf, { sign: true })}</b></div>` : ''}
    ${q ? offerHTML(P, q.cash) + afterBox(P, -q.cash - offerFee(q.cash), dCf + (fx.ownhome && P.home === 'rent' ? (P.exps.find(e => e.kind === 'rent' && e.v) || { v: 0 }).v : 0), undefined, true)

      + shortfall(P, q.cash + offerFee(q.cash), true) : ''}
  </div>
  ${fx.ownhome && P.home !== 'rent' ? `<div class="alert neg">${ic('warning-circle')}<span><b>Зөвхөн түрээсэлдэг хүн авна</b>Өөрийн байр эсвэл ипотектэй тул энэ картыг авах боломжгүй (R08).</span></div>` : ''}
  ${G.mode === 'online' && !FS.offerLock && G.players.some(p => p.id !== P.id && !p.out) ? `<button class="linkbtn" data-a="saleOpen">${ic('handshake')} Картаа бусад тоглогчид зарах</button>` : ''}
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${q ? payBtn(P, q.cash + offerFee(q.cash), 'buyAssetOk', 'Худалдаж авах', !(fx.ownhome && P.home !== 'rent')) : `<button class="btn go" disabled>${loanMode && m.price > 0 && m.down > m.price ? 'Үнээ шалгана уу' : 'Тоогоо бичнэ үү'}</button>`}</div>`;
}
ACT.manSign = d => { FS.man = FS.man || {}; FS.manNeg = FS.manNeg || {}; const v = FS.man[d.k]; if (v === undefined || v === 0) FS.manNeg[d.k] = !FS.manNeg[d.k]; else { FS.man[d.k] = -v; FS.manNeg[d.k] = FS.man[d.k] < 0; } drawSheet(); };
ACT.manIn = (d, el) => {
  const raw = String(el.value || ''); const n = parseAmt(raw);
  FS.man = FS.man || {}; const wasNeg = FS.man[d.k] < 0 || (FS.manNeg || {})[d.k];
  FS.man[d.k] = raw.trim() === '' ? undefined : (wasNeg ? -n : n);
  clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const x = $('#m_' + d.k); if (x) { x.focus(); const v = x.value.length; x.setSelectionRange(v, v); } }, 700);
};
/* ---- selling a drawn card to other players (online, user 2026-10-15):
   seller announces → others send a price → seller accepts or declines → the buyer buys it, paying that price to the seller ---- */
UI.sales = {};      // sales other players announced: id → {card, ask, from, name, sent}
UI.mySale = null;   // my open sale: {id, card, ask, bids:[{by,name,amt,st}]}
const PRICE_CHIPS = [100000, 200000, 500000, 1000000];
ACT.saleOpen = () => { UI.mySale = { id: uid('s'), card: FS.card, ask: 0, bids: [], live: false }; FS.saleBack = FS.card; openSheet(fSale); };
ACT.saleAsk = d => { UI.mySale.ask = +d.n; drawSheet(); };
ACT.saleAskIn = (d, el) => { UI.mySale.ask = parseAmt(el.value) || 0; clearTimeout(pqT); pqT = setTimeout(() => drawSheet(), 500); };
ACT.saleGo = () => { const s = UI.mySale; s.live = true; NET.emit({ t: 'cardsale', sale: s.id, card: s.card, ask: s.ask || 0, txt: `${CARD[s.card].title} картаа зарж байна` }); drawSheet(); };
ACT.saleStop = () => { const s = UI.mySale; if (s && s.live) NET.emit({ t: 'cardclose', sale: s.id }); const id = s ? s.card : FS.card; UI.mySale = null; startCard(id); };
ACT.saleNo = d => { const s = UI.mySale; const b = s.bids[+d.i]; b.st = 'no'; NET.emit({ t: 'cardno', to: b.by, sale: s.id }); drawSheet(); };
ACT.saleYes = d => { const s = UI.mySale; const b = s.bids[+d.i];
  NET.emit({ t: 'cardok', to: b.by, sale: s.id, card: s.card, amt: b.amt, txt: `${CARD[s.card].title} картаа зарлаа` });
  log(G, me(), `${CARD[s.card].title} картаа ${b.name}-д ${fmtS(b.amt)}-өөр зарлаа`, 0, s.card, 'skip'); save();
  UI.mySale = null; closeSheet(); toast(`${b.name} картыг авахад ${fmtS(b.amt)} танд орно`); };
function fSale() {
  const s = UI.mySale; if (!s) return head('Карт зарах');
  const c = CARD[s.card];
  if (!s.live) return `${head('Картаа зарах')}<div class="box"><div class="ln" style="border:0;padding:0"><b>${esc(c.title)}</b><span class="mute">№ ${c.no || c.id.split('-')[1]}</span></div></div>
    <div class="box" style="display:grid;gap:8px"><h4>Хүсэж буй үнэ</h4>
      <div class="mlist"><label class="mrow ${s.ask ? 'has' : ''}"><span class="ml">Үнэ</span><input id="saleAsk" inputmode="numeric" placeholder="Үнэ" value="${s.ask ? s.ask.toLocaleString('en') : ''}" data-in="saleAskIn"></label></div>
</div>
    <div class="cta"><button class="btn" data-a="saleStop">Буцах</button><button class="btn go" data-a="saleGo">Бусдад мэдэгдэх</button></div>`;
  const open = s.bids.filter(b => !b.st);
  return `${head('Картаа зарах')}<div class="box"><div class="ln" style="border:0;padding:0"><b>${esc(c.title)}</b><b>${s.ask ? fmtS(s.ask) : 'Үнэ санал болгоно'}</b></div></div>
    <div class="box"><div class="sec">Ирсэн санал</div>
    ${s.bids.length ? s.bids.map((b, i) => `<div class="ln"><span><b>${esc(b.name)}</b></span><span style="display:flex;gap:8px;align-items:center"><b>${fmtS(b.amt)}</b>${b.st === 'no' ? '<span class="mute">Цуцалсан</span>' : `<button class="minibtn" data-a="saleNo" data-i="${i}">Цуцлах</button><button class="minibtn go" data-a="saleYes" data-i="${i}">Зөвшөөрөх</button>`}</span></div>`).join('') : '<p class="empty">Санал хүлээж байна…</p>'}</div>
    <div class="cta"><button class="btn" data-a="saleStop">Зарахаа болих</button></div>`;
}
/* buyer side */
ACT.saleSee = d => { if (!UI.sales[d.id]) return toast('Санал цуцлагдлаа'); FS = { saleIn: d.id, bid: 0 }; openSheet(fSaleIn, { modal: true }); };
ACT.bidSet = d => { FS.bid = +d.n; drawSheet(); };
ACT.bidIn = (d, el) => { FS.bid = parseAmt(el.value) || 0; clearTimeout(pqT); pqT = setTimeout(() => drawSheet(), 500); };
ACT.bidGo = () => { const x = UI.sales[FS.saleIn]; if (!x || !(FS.bid > 0)) return; x.sent = FS.bid; NET.emit({ t: 'cardbid', to: x.from, sale: FS.saleIn, amt: FS.bid, txt: `${fmtS(FS.bid)} санал тавилаа` }); drawSheet(); };
function fSaleIn() {
  const x = UI.sales[FS.saleIn]; if (!x || x.closed) return `${head('Карт зарах санал')}<div class="box"><p style="font-weight:800;text-align:center">${esc(x ? x.closed : 'Санал цуцлагдлаа')}</p></div><div class="cta"><button class="btn" data-a="close">Хаах</button></div>`;
  const c = CARD[x.card];
  const fx = c.fx; const net = fx.k === 'asset' ? fx.inc - fx.opex - (fx.loan ? fx.loan.pay : 0) : null;
  return `${head(esc(x.name) + ' картаа зарж байна')}
    <div class="box"><div class="ln" style="border:0;padding:0"><b style="white-space:normal">${esc(c.title)}</b><span class="mute">№ ${c.no || c.id.split('-')[1]}</span></div>
      ${fx.k === 'asset' ? `<div class="ln"><span>${fx.loan ? 'Урьдчилгаа' : 'Үнэ'}</span><b>${fmtS(fx.loan ? fx.down : fx.price)}</b></div><div class="ln"><span>Сарын ашиг</span><b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net, { sign: true })}</b></div>` : ''}
      ${x.ask ? `<div class="ln tot"><span>Хүсэж буй үнэ</span><b>${fmt(x.ask)}</b></div>` : ''}</div>
    ${x.sent != null ? `<div class="box"><p class="pos" style="font-weight:800">${fmtS(x.sent)} санал илгээлээ · хариу хүлээж байна</p></div><div class="cta"><button class="btn" data-a="close">Хаах</button></div>`
    : `<div class="box" style="display:grid;gap:8px"><h4>Та хэдээр авах вэ?</h4>
      <div class="mlist"><label class="mrow has"><span class="ml">Таны үнэ</span><input id="bidIn" inputmode="numeric" placeholder="Үнээ бичнэ үү" value="${FS.bid ? FS.bid.toLocaleString('en') : ''}" data-in="bidIn"></label></div></div>
    <div class="cta"><button class="btn" data-a="close">Сонирхохгүй</button><button class="btn go" data-a="bidGo" ${FS.bid > 0 ? '' : 'disabled'}>Санал илгээх</button></div>`}`;
}
/* R08 open offer: a card someone else drew and passed on — the taker pays the drawer 5% of the cash paid */
function offerFee(cash) { return FS.offerFrom ? (FS.offerAmt != null ? R(FS.offerAmt) : R(cash * G.settings.offerPct / 100)) : 0; }
function offerHTML(P, cash) {
  const others = G.players.filter(p => p.id !== P.id && !p.out);
  if (FS.offerLock) { const o = G.players.find(x => x.id === FS.offerFrom); return `<div class="box"><div class="ln" style="border:0;padding:0"><span>${esc(o ? o.name : '')}-д картын үнэ<span class="sub">тохиролцсон</span></span><b>${fmt(offerFee(cash))}</b></div></div>`; }
  if (!others.length) return '';
  return `<div class="field"><label>Картыг хэн сугалсан бэ?</label><div class="chips"><button class="chip" data-a="offerFrom" data-id="" aria-pressed="${!FS.offerFrom}">Би</button>${others.map(o => `<button class="chip" data-a="offerFrom" data-id="${o.id}" aria-pressed="${FS.offerFrom === o.id}">${esc(o.name)}</button>`).join('')}</div>
    ${FS.offerFrom ? (() => { const o = others.find(x => x.id === FS.offerFrom); const v = offerFee(cash); const pct = R(cash * G.settings.offerPct / 100);
      return `<div class="box" style="margin-top:10px;display:grid;gap:8px"><h4>${esc(o ? o.name : '')}-д картын үнэ төлөх</h4>
        <div class="mlist"><label class="mrow has"><span class="ml">Үнэ</span><input id="offAmt" inputmode="numeric" value="${v.toLocaleString('en')}" data-in="offAmtIn"></label></div>
        <div class="quick">${[0, 100000, 200000, 500000, 1000000].map(n => `<button class="chip" data-a="offAmtSet" data-n="${n}" aria-pressed="${v === n}">${n ? fmtS(n) : 'Үнэгүй'}</button>`).join('')}</div></div>`; })() : ''}</div>`;
}
ACT.offerFrom = d => { FS.offerFrom = d.id || null; FS.offerAmt = null; drawSheet(); };
ACT.offAmtSet = d => { FS.offerAmt = +d.n; drawSheet(); };
ACT.offAmtIn = (d, el) => { FS.offerAmt = parseAmt(el.value) || 0; clearTimeout(pqT); pqT = setTimeout(() => drawSheet(), 500); };
function payOffer(P, cash, card) {
  const fee = offerFee(cash); if (!fee) return;
  const o = G.players.find(p => p.id === FS.offerFrom);
  pay(G, P, fee, `Карт худалдаж авлаа → ${o ? o.name : ''}`, card.id, 'pay');
  if (G.mode === 'online') NET.emit({ t: 'xfer', to: FS.offerFrom, amt: fee, txt: `${card.title} · картын үнэ` });
  else if (o) gain(G, o, fee, `Картаа зарлаа ← ${P.name}`, card.id, 'gain');
}
ACT.mode = d => { FS.mode = d.m; if (d.m === 'partner' && FS.share === 1) FS.share = .5; drawSheet(); };
ACT.pmode = d => { FS.pmode = d.m; drawSheet(); };
ACT.shareR = (d, el) => { FS.share = +el.value / 100; const l = el.parentElement.querySelector('label'); if (l) l.textContent = `Таны хувь: ${el.value}%`; clearTimeout(pqT); pqT = setTimeout(drawSheet, 250); };
ACT.partnerSel = d => { FS.partner = d.id || null; drawSheet(); };
ACT.rateCut = () => { FS.rateCut = !FS.rateCut; drawSheet(); };
ACT.skipCard = () => { const c = CARD[FS.card]; log(G, me(), `${c.title} — алгаслаа`, 0, c.id, 'skip'); save(); closeSheet(); };
ACT.buyAssetOk = () => {
  const P = me(); const c = CARD[FS.card];
  const opt = { mode: FS.mode === 'partner' ? (FS.pmode || (c.fx.loan ? 'loan' : 'cash')) : FS.mode, share: FS.mode === 'partner' ? FS.share : 1, rateCut: !!FS.rateCut, discount: FS.discount || 0, man: FS.man };
  if (!manReady(c)) return toast('Картан дээрх тоог бичнэ үү');
  if (manGross(c, !!c.fx.loan && opt.mode !== 'cash')) return toast('Картын «Ашиг»-ийг бичнэ үү');
  const q = quoteAsset(G, P, c, opt);
  if (P.cash < q.cash) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title);
  if (c.fx.ownhome && P.home !== 'rent') return toast('Зөвхөн түрээсэлдэг хүн авна');
  if (P.cash < q.cash + offerFee(q.cash)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  buyAsset(G, P, c, Object.assign({}, opt, { partner: FS.partner }));
  payOffer(P, q.cash, c);
  if (FS.mode === 'partner' && FS.partner) {
    const o = G.players.find(p => p.id === FS.partner);
    const o2 = Object.assign({}, opt, { share: 1 - opt.share, partner: P.id });
    buyAsset(G, o, c, o2);
  }
  if (opt.rateCut) G.conds = G.conds.filter(x => x.key !== 'rateCut');
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: `${c.title} авлаа` });
  save(); closeSheet(); buzz(20);
  toast(`${c.title} — таны хөрөнгө боллоо`);
};

/* ---- units: stocks, gold, silver ---- */
function actUnits(P, c) {
  const fx = c.fx; const S = STOCK[fx.sym];
  // price typed by hand from the card (user decision 2026-10-14)
  const price = FS.upx || 0;
  const cardPx = FS.discount ? R(fx.price * (1 - FS.discount / 100)) : fx.price;
  const max = price > 0 ? unitsMax(G, P, fx.sym, price) : 0;
  const qty = FS.qty || 0;
  const held = holdings(P, fx.sym);
  const heldQty = sum(held, a => a.qty);
  return `<div class="box" style="display:grid;gap:12px">
    <div class="mlist"><label class="mrow ${price ? 'has' : ''}"><span class="ml">${esc(S.name)} · 1 ${S.unit}-ийн үнэ</span><input id="upx" inputmode="numeric" placeholder="1 ${S.unit}-ийн үнэ" value="${price ? price.toLocaleString('en') : ''}" data-in="upxIn"></label></div>
    ${price ? (Math.abs(price - cardPx) > Math.max(1, cardPx * 0.005) ? `<p class="mute neg" style="font-size:12px">${ic('warning-circle')} Картан дээрх үнэтэй зөрж байна — дахин шалгана уу.</p>` : `<p class="mute pos" style="font-size:12px">${ic('seal-check')} Картын үнэтэй таарч байна.</p>`) : ''}
    <h4>Хэдийг авах вэ? <span>${price ? 'Нийт ' + fmt(qty * price) : ''}</span></h4>
    <div class="stepper"><button data-a="qty" data-d="-${fx.sym === 'GOLD' ? 1 : 100}" aria-label="Хасах">−</button><input id="qtyIn" inputmode="numeric" value="${qty}" data-in="qtyIn" aria-label="Тоо ширхэг"><button data-a="qty" data-d="${fx.sym === 'GOLD' ? 1 : 100}" aria-label="Нэмэх">+</button></div>
    <div class="quick">${(fx.sym === 'GOLD' ? [1, 2, 5, 10] : [100, 1000, 5000]).map(n => `<button class="chip" data-a="qtySet" data-n="${n}">${n.toLocaleString('en')}</button>`).join('')}<button class="chip" data-a="qtySet" data-n="${max}">Хамгийн их ${max.toLocaleString('en')}</button></div>
    ${afterBox(P, -qty * price, 0)}
    <p class="mute" style="font-size:12px">Нэг удаад ${fmtS(G.settings.unitsCap)} хүртэл${fx.sym !== 'GOLD' ? ', нэг компанид нийт ' + fmtS(G.settings.unitsCap) + ' хүртэл' : ''}. Сар бүрийн орлогогүй. Үнэ нь хэлбэлзэлд ${fx.range && fx.range.length ? fmt(fx.range[0]) + ' – ' + fmt(fx.range[1]) : ''}. Том өсөлт, уналт Зах зээлийн картаар ирнэ.</p>
    ${heldQty ? `<div class="alert ok">${ic('coins')}<span><b>Танд ${heldQty.toLocaleString('en')} ${S.unit} бий</b>Энэ үнээр зарвал ${fmt(heldQty * (price || fx.price))} (${fmt(heldQty * (price || fx.price) - sum(held, a => a.unitCost * a.qty), { sign: true })}).<span class="row">${held.map(a => `<button class="minibtn go" data-a="sellUnitsAll" data-id="${a.id}" data-p="${(price || fx.price)}">${a.qty.toLocaleString('en')} ${S.unit} зарах</button>`).join('')}</span></span></div>` : ''}
  </div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button><button class="btn go" data-a="buyUnitsOk" ${price > 0 && qty > 0 && qty <= max ? '' : 'disabled'}>${!price ? 'Үнээ бичнэ үү' : qty ? qty.toLocaleString('en') + ' ' + S.unit + ' авах' : 'Тоо оруулна уу'}</button></div>`;
}
ACT.qty = d => { FS.qty = Math.max(0, (FS.qty || 0) + +d.d); drawSheet(); };
ACT.qtySet = d => { FS.qty = +d.n; drawSheet(); };
ACT.qtyIn = (d, el) => { FS.qty = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#qtyIn'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 400); };
ACT.upxSet = d => { FS.upx = +d.v; drawSheet(); };
ACT.upxIn = (d, el) => { FS.upx = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#upx'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 700); };
ACT.buyUnitsOk = () => {
  const P = me(); const c = CARD[FS.card]; const price = FS.upx || 0; if (!(price > 0)) return toast('Үнээ бичнэ үү');
  if (FS.qty > unitsMax(G, P, c.fx.sym, price)) return toast(`${fmtS(G.settings.unitsCap)}-ийн хязгаар`);
  snap(c.title); buyUnits(G, P, c.fx.sym, FS.qty, price, c); save(); closeSheet(); toast('Худалдаж авлаа');
};
ACT.sellUnitsAll = d => { const P = me(); const a = P.assets.find(x => x.id === d.id); if (!a) return; snap('Зарах'); sellUnits(G, P, a.id, a.qty, +d.p); save(); drawSheet(); toast('Зарлаа'); };

/* ---- lot: block of shares at a discount ---- */
function actLot(P, c) {
  const fx = c.fx; const cost = fx.qty * fx.unitCost;
  return `<div class="box">${afterBox(P, -cost, fx.income, undefined, true)}${shortfall(P, cost, true)}</div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${payBtn(P, cost, 'buyLotOk', fmtS(cost) + ' төлж авах')}</div>`;
}
ACT.buyLotOk = () => {
  const P = me(); const c = CARD[FS.card]; const fx = c.fx;
  snap(c.title);
  P.assets.push({ id: uid('a'), kind: 'units', lot: true, sym: fx.sym, name: `${STOCK[fx.sym].name} · багц`, qty: fx.qty, unitCost: fx.unitCost, price: fx.qty * fx.unitCost, income: fx.income, cls: 'paper', tags: [], card: c.id });
  P.cash -= fx.qty * fx.unitCost;
  log(G, P, `${c.title} авлаа`, -fx.qty * fx.unitCost, c.id, 'buy'); save(); closeSheet();
};

/* ---- bond ---- */
function actBond(P, c) {
  const fx = c.fx; const amt = FS.qty || 0; const inc = R(amt * fx.rate / 100 / 12);
  return `<div class="box" style="display:grid;gap:12px"><h4>Хэдэн төгрөгөөр авах вэ? <span>${fx.months} сар, жилийн ${fx.rate}%</span></h4>
    <div class="stepper"><button data-a="qty" data-d="-${fx.step}" aria-label="Хасах">−</button><input id="qtyIn" inputmode="numeric" value="${amt.toLocaleString('en')}" data-in="qtyIn" aria-label="Дүн"><button data-a="qty" data-d="${fx.step}" aria-label="Нэмэх">+</button></div>
    <div class="quick">${[1e6, 5e6, 1e7].map(n => `<button class="chip" data-a="qtySet" data-n="${n}">${fmtS(n)}</button>`).join('')}<button class="chip" data-a="qtySet" data-n="${Math.floor(Math.max(0, P.cash) / fx.step) * fx.step}">Бүгд</button></div>
    ${afterBox(P, -amt, inc)}<p class="mute" style="font-size:12px">Сар бүр ${fmt(inc)} идэвхгүй орлого. ${fx.months} сарын дараа ${fmtS(amt)} бүтнээрээ буцна.</p></div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button><button class="btn go" data-a="buyBondOk" ${amt > 0 && amt <= P.cash ? '' : 'disabled'}>Бонд авах</button></div>`;
}
ACT.buyBondOk = () => {
  const P = me(); const c = CARD[FS.card]; const amt = FS.qty;
  snap(c.title);
  P.assets.push({ id: uid('a'), kind: 'bond', name: c.title, amount: amt, price: amt, rate: c.fx.rate, left: c.fx.months, term: c.fx.months, cls: 'paper', tags: [], card: c.id });
  P.cash -= amt; log(G, P, `${c.title} ${fmtS(amt)}`, -amt, c.id, 'buy'); save(); closeSheet();
};

/* ---- skill ---- */
function actSkill(P, c) {
  const fx = c.fx; const mode = FS.smode || 'side';
  const salAdd = fx.salaryPct ? R(P.salary * fx.salaryPct / 100) : 0;
  return `<div class="box" style="display:grid;gap:12px">
    ${fx.salaryPct ? `<div class="seg"><button data-a="smode" data-m="side" aria-pressed="${mode === 'side'}">Нэмэлт орлого</button><button data-a="smode" data-m="salary" aria-pressed="${mode === 'salary'}">Цалин +${fx.salaryPct}%</button></div>` : ''}
    ${afterBox(P, -fx.cost, 0, undefined, true)}
    <p class="mute" style="font-size:12px">${fx.months} цалингийн өдрийн дараа ${mode === 'side' ? `сар бүр ${fmt(fx.side)} нэмэлт орлого` : `цалин ${fmt(salAdd)}-өөр`} нэмэгдэнэ. Нэмэлт орлого идэвхгүй орлогод тооцогдохгүй.</p>
    ${shortfall(P, fx.cost, true)}</div>
  ${P.skills.length >= G.settings.skillCap ? `<div class="alert neg">${ic('warning-circle')}<span><b>${G.settings.skillCap} ур чадвартай байна</b>Нэг тоглогч хамгийн ихдээ ${G.settings.skillCap} ур чадвар эзэмшинэ.</span></div>` : ''}
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${payBtn(P, fx.cost, 'skillOk', 'Сургалтад суух', P.skills.length < G.settings.skillCap)}</div>`;
}
ACT.smode = d => { FS.smode = d.m; drawSheet(); };
ACT.skillOk = () => {
  const P = me(); const c = CARD[FS.card]; const fx = c.fx; const mode = FS.smode || 'side';
  snap(c.title);
  P.skills.push({ id: uid('s'), card: c.id, name: c.title, mode, side: fx.side, pct: fx.salaryPct || 0, left: fx.months });
  P.flags.training = true;
  P.cash -= fx.cost; log(G, P, `${c.title} — сургалт`, -fx.cost, c.id, 'buy'); save(); closeSheet();
};
// skills with salary mode apply when ready (checked after each payday)
function skillTick(P) { for (const s of P.skills) if (s.mode === 'salary' && s.left <= 0 && !s.applied) { P.salaryPct = (P.salaryPct || 0) + s.pct; s.applied = true; } }

/* ---- timed trade / pawn ---- */
function actTrade(P, c) {
  const fx = c.fx;
  const outs = fx.out.map(o => `<div class="ln"><span>Шоо ${o[0] === o[1] ? o[0] : o[0] + '–' + o[1]}</span><b class="${o[2] >= fx.cost ? 'pos' : 'neg'}">${fmtS(o[2])}</b></div>`).join('');
  return `<div class="box"><h4>Үр дүн ${fx.months} цалингийн өдрийн дараа</h4><div class="lines" style="margin-top:6px">${outs}</div></div>
  <div class="box">${afterBox(P, -fx.cost, 0, undefined, true)}${shortfall(P, fx.cost, true)}</div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${payBtn(P, fx.cost, 'tradeOk', fmtS(fx.cost) + ' хөрөнгө оруулах')}</div>`;
}
ACT.tradeOk = () => {
  const P = me(); const c = CARD[FS.card]; const fx = c.fx;
  snap(c.title);
  P.pending.push({ id: uid('t'), card: c.id, name: c.title, cost: fx.cost, left: fx.months, out: fx.out });
  P.cash -= fx.cost; log(G, P, `${c.title}`, -fx.cost, c.id, 'buy'); save(); closeSheet();
};
function actPawn(P, c) {
  const fx = c.fx; const g = G.prices.GOLD; const unit = R(g * fx.pct / 100); const qty = Math.min(fx.max, FS.qty || 1);
  return `<div class="box" style="display:grid;gap:10px"><h4>Алтан эдлэл <span>1 г = ${fmt(unit)} (алтны үнийн ${fx.pct}%)</span></h4>
    <div class="quick">${[1, 2, 3, 4, 5].map(n => `<button class="chip" data-a="qtySet" data-n="${n}" aria-pressed="${qty === n}">${n} г</button>`).join('')}</div>
    ${afterBox(P, -unit * qty, 0, undefined, true)}${shortfall(P, unit * qty, true)}<p class="mute" style="font-size:12px">Дараагийн цалингийн өдөр алтны тухайн үеийн үнийн ${fx.sellPct}%-иар дархан авна.</p></div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${payBtn(P, unit * qty, 'pawnOk', qty + ' г авах')}</div>`;
}
ACT.pawnOk = () => {
  const P = me(); const c = CARD[FS.card]; const fx = c.fx; const qty = Math.min(fx.max, FS.qty || 1); const cost = R(G.prices.GOLD * fx.pct / 100) * qty;
  snap(c.title);
  P.pending.push({ id: uid('t'), card: c.id, name: `${c.title} · ${qty} г`, cost, left: fx.months, pawn: { qty, pct: fx.sellPct } });
  P.cash -= cost; log(G, P, `${c.title} ${qty} г`, -cost, c.id, 'buy'); save(); closeSheet();
};
ACT.resolveTrade = d => { FS = { trade: d.id, vals: null }; openSheet(fTrade); };
function fTrade() {
  const P = me(); const t = P.pending.find(x => x.id === FS.trade);
  if (!t) return `${head('Дууссан')}`;
  if (t.pawn) {
    const got = R(G.prices.GOLD * t.pawn.pct / 100) * t.pawn.qty;
    return `${head(esc(t.name))}<div class="box"><div class="ln"><span>Дархан авах үнэ (${t.pawn.pct}%)</span><b class="pos">${fmt(got)}</b></div><div class="ln"><span>Ашиг</span><b class="${got - t.cost >= 0 ? 'pos' : 'neg'}">${fmt(got - t.cost, { sign: true })}</b></div></div><div class="cta"><button class="btn go" data-a="tradeCash" data-v="${got}">Мөнгөө авах</button></div>`;
  }
  const single = t.out.length === 1 && t.out[0][0] === 1 && t.out[0][1] === 6;
  if (single) return `${head(esc(t.name))}<div class="box"><div class="ln"><span>Зарах үнэ</span><b class="pos">${fmt(t.out[0][2])}</b></div><div class="ln"><span>Ашиг</span><b class="pos">${fmt(t.out[0][2] - t.cost, { sign: true })}</b></div></div><div class="cta"><button class="btn go" data-a="tradeCash" data-v="${t.out[0][2]}">Мөнгөө авах</button></div>`;
  const v = FS.vals ? FS.vals[0] : null;
  const hit = v ? t.out.find(o => v >= o[0] && v <= o[1]) : null;
  return `${head(esc(t.name))}<div class="box lines">${t.out.map(o => `<div class="ln"><span>Шоо ${o[0] === o[1] ? o[0] : o[0] + '–' + o[1]}</span><b>${fmtS(o[2])}</b></div>`).join('')}</div>
  ${v ? `<div class="dice"><div class="die">${v}</div></div><p class="big ${hit[2] >= t.cost ? 'pos' : 'neg'}">${fmtS(hit[2])}</p><div class="cta"><button class="btn go" data-a="tradeCash" data-v="${hit[2]}">Авах</button></div>`
    : `<p class="mute">Шоо хаяад буусан тоогоо дарна уу.</p><div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="tradeDie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.tradeDie = d => { FS.vals = [+d.n || d6()]; drawSheet(); };
ACT.tradeCash = d => {
  const P = me(); const t = P.pending.find(x => x.id === FS.trade);
  snap(t.name);
  P.pending = P.pending.filter(x => x.id !== t.id);
  gain(G, P, +d.v, `${t.name} — үр дүн`, t.card, 'gain'); save(); closeSheet();
};

/* ---- choice / gamble ---- */
function actChoice(P, c) {
  return `<div class="box" style="display:grid;gap:8px">${c.fx.options.map((o, i) => `<button class="mbtn" data-a="choiceOk" data-i="${i}">${ic(o.dice ? 'dice-5' : 'coins')}<span><b>${esc(o.label)}</b><small>${o.cash ? fmtS(o.cash) : o.dice.map(x => `${x[0]}–${x[1]} → ${fmtS(x[2])}`).join(' · ')}</small></span></button>`).join('')}</div>
  <div class="cta"><button class="btn" data-a="skipCard">Хадгалах · одоо зарахгүй</button></div>`;
}
ACT.choiceOk = d => {
  const c = CARD[FS.card]; const o = c.fx.options[+d.i];
  if (o.cash) { const P = me(); snap(c.title); gain(G, P, o.cash, `${c.title} · ${o.label}`, c.id); save(); return closeSheet(); }
  FS.gamble = { cost: 0, out: o.dice, dice: 1, label: o.label }; drawSheet2(fGamble);
};
function actGamble(P, c) {
  const fx = c.fx;
  return `<div class="box lines">${fx.out.map(o => `<div class="ln"><span>${fx.dice === 2 ? '2 шоо' : 'Шоо'} ${o[0] === o[1] ? o[0] : o[0] + '–' + o[1]}</span><b class="${o[2] > fx.cost ? 'pos' : 'neg'}">${fmtS(o[2])}</b></div>`).join('')}</div>
  <div class="box">${afterBox(P, -fx.cost, 0)}${shortfall(P, fx.cost)}</div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Татгалзах</button><button class="btn go" data-a="gambleGo" ${P.cash >= fx.cost ? '' : 'disabled'}>${fmtS(fx.cost)} өгөх</button></div>`;
}
ACT.gambleGo = () => { const c = CARD[FS.card]; FS.gamble = { cost: c.fx.cost, out: c.fx.out, dice: c.fx.dice, label: c.title }; drawSheet2(fGamble); };
function fGamble() {
  const g = FS.gamble; const c = CARD[FS.card];
  const v = FS.vals ? sum(FS.vals) : null;
  const hit = v ? g.out.find(o => v >= o[0] && v <= o[1]) : null;
  const pad = g.dice === 2 ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
  return `${head(esc(g.label))}${v ? `<div class="dice">${FS.vals.map(x => `<div class="die">${x}</div>`).join('')}</div><p class="big ${hit && hit[2] > g.cost ? 'pos' : 'neg'}">${fmtS(hit ? hit[2] : 0)}</p>
    ${c.box && /Сургамж/.test(c.box.x) ? `<div class="alert">${ic('sparkle')}<span>${esc((c.box.x.match(/Сургамж:[^\n]*/) || [''])[0])}</span></div>` : ''}
    <div class="cta"><button class="btn go" data-a="gambleOk" data-v="${hit ? hit[2] : 0}">Үргэлжлүүлэх</button></div>`
    : `<p class="mute">Шоо хаяад буусан тоогоо дарна уу.</p><div class="dicepad">${pad.map(n => `<button data-a="gambleDie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.gambleDie = d => { const g = FS.gamble; if (+d.n) FS.vals = g.dice === 2 ? [Math.min(6, Math.ceil(+d.n / 2)), +d.n - Math.min(6, Math.ceil(+d.n / 2))] : [+d.n]; else FS.vals = g.dice === 2 ? [d6(), d6()] : [d6()]; drawSheet(); };
ACT.gambleOk = d => {
  const P = me(); const g = FS.gamble; const c = CARD[FS.card];
  snap(c.title);
  if (g.cost) pay(G, P, g.cost, `${c.title}`, c.id);
  if (+d.v) gain(G, P, +d.v, `${c.title} — шоо ${sum(FS.vals)}`, c.id); else log(G, P, `${c.title} — шоо ${sum(FS.vals)}, юу ч олсонгүй`, 0, c.id);
  save(); closeSheet();
};

/* ---- expense ---- */
function actExpense(P, c) {
  const fx = c.fx; const ok = expenseApplies(P, fx);
  return `<div class="box" style="display:grid;gap:10px">
    <div class="alert ${ok ? 'neg' : 'ok'}">${ic(ok ? 'receipt' : 'seal-check')}<span><b>${COND_TEXT[fx.cond]}</b>${ok ? 'Таны тэмдэглэгээгээр энэ зардал танд хамаарна.' : 'Таны тэмдэглэгээгээр энэ зардал танд хамаарахгүй.'}</span></div>
    ${ok ? afterBox(P, -fx.amt, 0, undefined, true) + shortfall(P, fx.amt, true) : ''}</div>
  <div class="cta">${ok ? payBtn(P, fx.amt, 'expOk', fmt(fx.amt) + ' төлөх') : `<button class="btn go" data-a="skipCard">Хаах</button>`}</div>`;
}
ACT.expOk = () => { const P = me(); const c = CARD[FS.card]; snap(c.title); pay(G, P, c.fx.amt, c.title, c.id, 'pay'); save(); closeSheet(); };

/* ---------- payday summary ---------- */
function condsHTML(P) {
  const f = fin(P, G);
  const row = (ok, t, sub) => `<div class="cond ${ok ? 'ok' : ''}"><i>${ic(ok ? 'seal-check' : 'circle-dot')}</i><span><b>${t}</b><small>${sub}</small></span></div>`;
  return `<div class="conds">${row(f.conds[0], 'Идэвхгүй орлого ≥ амьжиргааны зардал', `${fmtS(f.stablePassive)} / ${fmtS(f.living)}`)}
    ${row(f.conds[1], `${G.settings.reserveMonths} сарын нөөц сан`, `Бэлэн + хадгаламж ${fmtS(f.reserve)} / ${fmtS(f.reserveNeed)}`)}
    ${row(f.conds[2], 'Аппын, хувийн зээлгүй', f.badDebt.length ? f.badDebt.map(d => esc(d.l) + ' ' + fmtS(d.bal)).join(' · ') : 'Байхгүй')}</div>`;
}
function fPayout() {
  const ps = FS.pay.payouts || []; const tot = sum(ps, x => x.prin + x.int);
  return `<div class="paypop up"><div class="pout-ic">${ic('piggy-bank')}</div>
  <h3>Өгөөжөө авлаа!</h3>
  <p class="paynum pos">+${fmt(tot)}</p></div>
  ${ps.map(x => `<div class="box" style="margin-top:12px"><h4>${esc(x.n)}</h4>
    <div class="ln"><span>Үндсэн мөнгө</span><b>${fmt(x.prin)}</b></div>
    <div class="ln"><span>Ашиг${x.bond ? '<span class="sub">сар бүр авсан</span>' : ''}</span><b class="pos">+${fmt(x.int)}</b></div>
    <div class="ln tot"><span>Нийт</span><b>${fmt(x.prin + x.int)}</b></div></div>`).join('')}
  <div class="cta"><button class="btn go" data-a="poutOk">Авлаа</button></div>`;
}
ACT.poutOk = () => {
  const r = FS.pay, then = FS.then, after = FS.after;
  if (after) { FS = { pay: r, then }; return openSheet(fPayday, { modal: true }); }
  const pt = sum(r.payouts || [], x => x.total);
  UI.celebrate = { at: Date.now(), from: me().cash - r.delta - pt, to: me().cash, delta: r.delta, payoffs: (r.payoffs || []).filter(Boolean) };
  save(); FS = {};
  if (then) then(); else closeSheet();
};
function fPayday() {
  const r = FS.pay; const P = me();
  const up = r.delta >= 0;
  return `<div class="paypop ${up ? 'up' : 'dn'}">${X}
  ${up ? stage('p_' + P.profId, 'a-pay') : stage('p_' + P.profId, 'a-worry')}
  <h3>${up ? (P.level === 2 ? 'Жилийн орлого буулаа!' : 'Цалин буулаа!') : 'Энэ сар алдагдалтай'}</h3>
  <p class="paynum ${up ? 'pos' : 'neg'}" data-fx="pay" data-v="${r.delta}">${fmt(r.delta, { sign: true })}</p>
  <p class="paysub">${P.level === 2 ? 'Жилийн орлого' : MONTHS[moy(r.month || P.month) - 1]} · Бэлэн мөнгө ${fmt(P.cash)}</p></div>
  ${r.payoffs.filter(Boolean).map(p => `<div class="celebrate"><h3>Өрөөс чөлөөлөгдлөө!</h3><p>${esc(p.debt)} хаагдлаа. Сарын ашиг +${fmt(p.pay)}.</p></div>`).join('')}
  ${savPayHTML(r)}
  ${r.grow ? `<div class="alert ok">${ic('trend-up')}<span><b>Хөрөнгийн орлого өслөө</b>Түрээс, борлуулалт инфляцаар өсч, зээлийн төлбөр хэвээр тул сарын ашиг +${fmt(r.grow)} нэмэгдлээ.</span></div>` : ''}
  ${r.infl ? `<div class="alert">${ic('trend-up')}<span><b>Инфляц</b>Жил өнгөрлөө: амьжиргааны зардал +${fmt(r.infl)}/сар болж, эрх чөлөөний босго дээшиллээ.</span></div>` : ''}
  ${P.level === 1 ? freeTiles(P, null) : ''}
  ${r.matured && r.matured.length ? `<div class="alert ok">${ic('clock')}<span><b>Хугацаа болсон</b>${r.matured.map(t => esc(t.name)).join(', ')} — самбар дээрээс үр дүнг гаргана уу.</span></div>` : ''}
  ${r.ventureRolls && r.ventureRolls.length ? `<div class="alert">${ic('dice-5')}<span><b>Стартапын шоо</b>${r.ventureRolls.map(a => esc(a.name)).join(', ')} — Хөрөнгө хэсгээс шоо хаяна уу.<span class="row">${r.ventureRolls.map(a => `<button class="minibtn go" data-a="ventureRoll" data-id="${a.id}">${esc(a.name.slice(0, 18))}…</button>`).join('')}</span></span></div>` : ''}
  ${r.report && r.report.length ? `<div class="box"><h4>Жилийн зээлийн тайлан</h4>${r.report.map(x => `<div class="ln"><span>${esc(x.l)}<span class="sub">Төлсөн ${fmtS(x.paid)} · үүнээс хүүнд ${fmtS(x.int)}</span></span><b>${fmtS(x.down)} багассан</b></div>`).join('')}
    ${(() => { const top = r.report.slice().sort((a, b) => b.int - a.int)[0]; return top ? `<p class="mute" style="font-size:12px;margin-top:6px">Та энэ жил ${esc(top.l)}-д ${fmtS(top.paid)} төллөө. Үүний ${fmtS(top.int)} нь хүүнд явж, өр тань ${fmtS(top.down)}-өөр багаслаа.</p>` : ''; })()}</div>` : ''}
  ${P.cash < 0 ? shortfall(P, 0) : ''}
  ${r.canLevel ? `<div class="alert ok">${ic('trophy')}<span><b>Санхүүгийн эрх чөлөө!</b>Эрх чөлөөний 3 нөхцөлийг 2 цалингийн өдөр дараалан хангалаа.<span class="row"><button class="minibtn go" data-a="levelUp">${G.settings.endAtL1 ? 'Ялалт' : 'Түвшин 2 руу'}</button></span></span></div>` : ''}
  <div class="cta"><button class="btn go" data-a="payDone">Үргэлжлүүлэх</button></div>`;
}
ACT.payDone = () => {
  const r = FS.pay; const then = FS.then;
  if (G.mode === 'online' && r.payoffs.some(p => p && p.first)) NET.emit({ t: 'payoff', txt: `анхны өрөө хаалаа: ${r.payoffs[0].debt}` });
  { const pt = sum(r.payouts || [], x => x.total); if (r.delta + pt > 0) UI.celebrate = { at: Date.now(), from: me().cash - r.delta - pt, to: me().cash, delta: (r.payouts || []).length ? r.delta : undefined, payouts: r.payouts || [] }; }
  FS = {};
  if (then) then(); else closeSheet();
};

/* ---------- loans ---------- */
ACT.openLoan = d => { FS = { amt: G.settings.emergencyUnit, bamt: G.settings.emergencyUnit, bt: (d && d.bt) || null, dep: 1000000, pAmt: 1000000, pRate: 2, pTo: null, pDir: 'borrow', pName: '' }; openSheet(fLoan); };
function fLoan() {
  const P = me();
  const others = G.players.filter(p => p.id !== P.id && !p.out);
  const legacy = P.assets.some(a => a.kind === 'deposit');
  const tabs = (P.level === 1 ? [['bankl', 'Банкны зээл'], ['loan', 'Аппын зээл']] : [['loan', 'Барьцаат зээл']]).concat(legacy ? [['dep', 'Хуучин хадгаламж']] : [], P.level === 1 ? [['pers', 'Хувийн зээл']] : []);
  const bt = FS.bt || (P.level === 1 ? 'bankl' : 'loan');
  return `${head('Банк')}<div class="tabs" style="padding:0">${tabs.map(([k, n]) => `<button data-a="bankTab" data-t="${k}" aria-pressed="${bt === k}">${n}</button>`).join('')}</div>
  ${bt === 'dep' ? depHTML(P) : bt === 'pers' ? persHTML(P, others) : bt === 'bankl' ? banklHTML(P) : P.level === 1 ? appLoanHTML(P) : loanHTML(P)}`;
}
ACT.bankTab = d => { FS.bt = d.t; drawSheet(); };
/* full amortization table in its own pop-up; ‹ back returns to the sheet it was opened from */
ACT.schedOpen = d => { FS.schedBack = UI.sheetFn; FS.sched = { p: +d.p, r: +d.r, pay: +d.pay, n: +d.n, l: d.l || 'Банкны зээл', id: d.id || null }; openSheet(fSched); };
ACT.schedBack = () => ACT.close();
ACT.loanHist = d => { FS.schedBack = UI.sheetFn; FS.hist = d.id; openSheet(fLoanHist); };
function monLabel(m) { const y = Math.floor((m - 1) / 12); return y ? `${y} жил ${moy(m)} сар` : `${moy(m)}-р сар`; }
function fLoanHist() {
  const P = me(); const d = P.debts.find(x => x.id === FS.hist);
  if (!d) return `${head('Түүх')}`;
  const h = d.hist || [];
  const orig = d.orig || d.bal, prin = Math.max(0, orig - d.bal), pc = orig ? Math.min(1, prin / orig) : 0;
  const pp = sum(h, x => x.pr), int = sum(h, x => x.i), tot = pp + int;
  const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px"></i>`;
  const n = v => R(v).toLocaleString('en');
  return `<div class="shead"><h3>${esc(d.l)}</h3>${X.replace('data-a="close"', 'data-a="schedBack"')}</div>
  <div class="box"><div class="sec">Зээл <span>${fmtS(orig)}</span></div>
    <div class="lbar big"><i style="width:${(pc * 100).toFixed(1)}%"></i></div>
    <div class="ln" style="border:0;padding:8px 0 0"><span>${dot('#14915A')}Төлсөн</span><b class="pos">${fmtS(prin)}</b></div>
    <div class="ln" style="border:0;padding:4px 0 0"><span>${dot('#D9DEE8')}Үлдсэн · ${monthsLeft(d)} сар</span><b>${fmtS(d.bal)}</b></div></div>
  ${tot ? `<div class="box"><div class="sec">Таны төлсөн мөнгө <span>${fmtS(tot)}</span></div>
    <div class="lbar big" style="background:#F3B5B5"><i style="width:${(pp / tot * 100).toFixed(1)}%"></i></div>
    <div class="ln" style="border:0;padding:8px 0 0"><span>${dot('#14915A')}Зээлээ бууруулсан</span><b class="pos">${fmtS(pp)}</b></div>
    <div class="ln" style="border:0;padding:4px 0 0"><span>${dot('#F3B5B5')}Хүү</span><b class="neg">${fmtS(int)}</b></div></div>` : ''}
  <div class="box"><div class="sec">Сар бүр</div>
  ${h.length ? `<table class="lc-t" style="font-size:13px"><tr><th>Сар</th><th>Зээлд</th><th>Хүүд</th><th>Үлдэгдэл</th></tr>${h.slice().reverse().map(x => { const y = Math.floor((x.m - 1) / 12); return `<tr><td style="white-space:nowrap">${x.x ? 'Нэмэлт' : (y ? y + 'ж ' : '') + moy(x.m) + 'с'}</td><td class="pos">${n(x.pr)}</td><td class="neg">${x.i ? n(x.i) : '—'}</td><td style="white-space:nowrap">${fmtS(x.bal)}</td></tr>`; }).join('')}</table>` : '<p class="empty">Цалингийн өдөр бүр энд нэмэгдэнэ.</p>'}</div>
  ${d.bal > 0 ? `<button class="linkbtn" data-a="schedOpen" data-id="${d.id}" data-p="${d.bal}" data-r="${d.rate}" data-pay="${d.pay}" data-n="600" data-l="${esc(d.l)}">${ic('receipt')} Бүтэн хуваарь</button>` : ''}`;
}
function fSched() {
  const x = FS.sched; if (!x) return `${head('Хуваарь')}`;
  // one row per Орлого (4 months) — the player pays at each Орлого, not monthly (user 2026-11-11); paid Орлого first (green ✓), then those still to pay
  const P = me(); const d = x.id ? P.debts.find(q => q.id === x.id) : null, M = L1.mpp;
  const done = d ? (d.hist || []) : [];
  let paidRows = '', k = 0, acc = null;
  const flush = (cls, mark) => { if (!acc) return ''; const t = `<tr class="${cls}"><td>${acc.no}</td><td class="${cls ? '' : 'neg'}">${acc.i ? fmt(acc.i) : '—'}</td><td>${fmt(acc.pr)}</td><td>${fmtS(acc.bal)}${mark}</td></tr>`; acc = null; return t; };
  for (const h of done) { if (h.x) { paidRows += flush('sc-paid', '<i>✓</i>'); paidRows += `<tr class="sc-paid"><td>+</td><td>—</td><td>${fmt(h.pr)}</td><td>${fmtS(h.bal)}<i>✓</i></td></tr>`; continue; }
    k++; acc = acc || { no: Math.ceil(k / M), i: 0, pr: 0, bal: 0 }; acc.i += h.i || 0; acc.pr += h.pr || 0; acc.bal = h.bal; if (k % M === 0) paidRows += flush('sc-paid', '<i>✓</i>'); }
  paidRows += flush('sc-paid', '<i>✓</i>');
  const r = x.r / 1200; let bal = d ? d.bal : x.p, ti = 0, rows = '', k0 = Math.ceil(k / M);
  for (let m = 1; m <= 600 && bal > 0; m++) { const int = R(bal * r); let pr = Math.min(bal, x.pay - int); if (pr <= 0) break; if (m >= x.n || bal - pr < 100) pr = bal; bal = Math.max(0, bal - pr); ti += int;
    acc = acc || { no: k0 + Math.ceil(m / M), i: 0, pr: 0, bal: 0 }; acc.i += int; acc.pr += pr; acc.bal = bal; if (m % M === 0 || bal <= 0) rows += flush('', ''); }
  rows += flush('', '');
  const orig = d ? (d.orig || x.p) : x.p;
  return `<div class="shead"><h3>${esc(x.l)} · хуваарь</h3>${X.replace('data-a="close"', 'data-a="schedBack"')}</div>
  <div class="svsum"><div><small>Зээл</small><b>${fmtS(orig)}</b></div><div><small>Орлого бүр</small><b>${fmtS(x.pay * M)}</b></div><div><small>${d ? 'Төлсөн' : 'Нийт хүү'}</small><b class="${d ? 'pos' : 'neg'}">${d ? Math.floor(k / M) + ' Орлого' : fmtS(ti)}</b></div></div>
  <div class="box"><table class="lc-t"><tr><th>Орлого</th><th>Хүү</th><th>Үндсэн</th><th>Үлдэгдэл</th></tr>${paidRows}${paidRows && rows ? '<tr class="sc-now"><td colspan="4">Одоо</td></tr>' : ''}${rows}</table></div>`;
}
/* Loan cost made obvious: what you get, what you pay back, what it costs per month (user 2026-10-14) */
function loanCost(P, amt, kind) {
  const S = G.settings; const f = fin(P, G);
  if (!(amt > 0)) return '';
  let head = '', rows = '', monthly = 0;
  if (kind === 'bankl') {
    const pay = annuityPay(amt, S.bankRate, S.bankMonths), n = S.bankMonths, r = S.bankRate / 1200; monthly = pay;
    const total = pay * n, cost = total - amt;
    head = `<div class="lc-big">Та <b>${fmtS(amt)}</b> авч, <b>${fmtS(total)}</b> буцааж төлнө</div>
      <div class="lc-cost"><span>Сар бүр төлөх · ${n} сар</span><b>${fmt(pay)}<small>/сар</small></b></div>
      <div class="lc-cost soft"><span>${n} сарын турш төлөх нийт хүү</span><b>${fmt(cost)}</b></div>`;
    rows = `<button class="linkbtn" data-a="schedOpen" data-p="${amt}" data-r="${S.bankRate}" data-pay="${pay}" data-n="${n}">${ic('receipt')} Сар бүрийн төлбөрийн хуваарь харах</button>`;
  } else {
    const rate = loanRate(P), int = R(amt * rate / 100); monthly = int;
    head = `<div class="lc-big">Та <b>${fmtS(amt)}</b> авна. Буцааж төлөх хүртэл сар бүр <b class="neg">${fmt(int)}</b> хүү төлнө</div>
      <div class="lc-cost"><span>Үндсэн зээл сар бүр буурах уу?</span><b class="neg">Үгүй</b></div>
      <div class="lc-cost soft"><span>6 сар байлгавал нийт хүү</span><b>${fmt(int * 6)}</b></div>
      <div class="lc-cost soft"><span>12 сар байлгавал нийт хүү</span><b>${fmt(int * 12)}</b></div>`;
    rows = int * 12 > amt ? `<p class="mute neg" style="font-size:12px">1 жил байлгавал авсан мөнгөнөөсөө их хүү төлнө. Боломжтой болмогц буцааж төлөөрэй.</p>` : '';
  }
  return `<div class="lc">${head}${rows}
    <div class="lc-cf"><span>Сарын ашиг</span><b>${fmt(f.cf, { sign: true })} → <em class="${f.cf - monthly < 0 ? 'neg' : ''}">${fmt(f.cf - monthly, { sign: true })}</em></b></div>
    <div class="lc-cf mute"><span>Бэлэн мөнгө (зээлийн мөнгө)</span><b>${fmtS(P.cash)} → ${fmtS(P.cash + amt)}</b></div></div>`;
}
function loanHTML(P) {
  const room = loanRoom(P, G); const unit = G.settings.emergencyUnit;
  const amt = Math.min(FS.amt, room);
  const rate = P.level === 2 ? P.l2.rate : G.settings.loanPct;
  return `<div class="box"><p class="mute" style="font-size:13px">${P.level === 2 ? `Хөрөнгөө барьцаалж (үнэ − үлдэгдэл зээл)-ийн ${G.settings.l2LoanPct + (P.l2.levBoost || 0)}% хүртэл, сарын ${rate}%. Хүүг Жилийн орлогоос хасна.` : `${fmtS(unit)}-ийн нэгжээр, сарын ${rate}%-ийн хүүтэй. Хүү сарын зардалд нэмэгдэнэ, хүссэн үедээ 1 сая₮-өөр төлнө. Хязгааргүй — гэхдээ хүү нь сар бүр таны ашгийг иднэ.`}</p>
    <div class="ln"><span>Авч болох дээд дүн</span><b>${roomTxt(P)}</b></div>
    ${P.level === 1 ? `<p class="mute" style="font-size:12px;margin-top:6px">Аппын зээлтэй үед эрх чөлөөний 3-р нөхцөл хангагдахгүй. Үндсэн зээл сар бүрийн төлөлтөөр буурахгүй — та өөрөө буцааж төлнө.</p>` : ''}</div>
  ${room > 0 ? `<div class="box" style="display:grid;gap:10px"><div class="stepper"><button data-a="lamt" data-d="-1" aria-label="Хасах">−</button><input id="nAmt" inputmode="numeric" data-in="numIn" data-f="amt" value="${amt.toLocaleString('en')}" aria-label="Зээлийн дүн"><button data-a="lamt" data-d="1" aria-label="Нэмэх">+</button></div>
    ${P.level === 1 ? loanCost(P, amt, 'bank') : afterBox(P, amt, -R(amt * rate / 100))}</div>
    <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="loanOk">${fmtS(amt)} авах</button></div>`
    : `<div class="alert neg">${ic('warning-circle')}<span><b>Зээл авах эрхгүй</b>Хөрөнгөө ${G.settings.forceSalePct}%-иар зарж мөнгө олно уу.<span class="row"><button class="minibtn go" data-a="openSell">Хөрөнгө зарах</button></span></span></div>`}`;
}
/* Simple loan views (user 2026-10-14): one line of terms, the amount, ONE big number = monthly payment */
function simpleLoan(P, kind, amt, room) {
  const S = G.settings; const bank = kind === 'bankl';
  const pay = bank ? annuityPay(amt, S.bankRate, S.bankMonths) : R(amt * loanRate(P) / 100);
  const terms = bank ? `Жилийн ${S.bankRate}% · ${S.bankMonths} сар · ${fmtS(room)} хүртэл` : `Сарын ${loanRate(P)}% · хязгааргүй`;
  const sub = bank ? `${S.bankMonths} сарын дараа зээл хаагдана · нийт ${fmtS(pay * S.bankMonths)} төлнө` : `Үндсэн зээл буурахгүй — өөрөө буцааж төлнө`;
  const a = bank ? 'bamt' : 'lamt', ok = bank ? 'bankOk' : 'loanOk';
  if (!(room > 0)) {
    const cap = R(P.salary * G.settings.loanCap / 100), used = consumerPay(P, G);
    const bl = sum(P.debts.filter(d => d.kind === 'bankl'), d => d.bal), blMax = R(P.salary * G.settings.bankMaxX);
    const why = used >= cap
      ? `Зээлийн сарын төлбөр ${fmtS(used)} нь цалингийн ${G.settings.loanCap}% (${fmtS(cap)})-иас давсан. Аппын зээлээ хаавал эрх нээгдэнэ.`
      : `Банкны зээлийн үлдэгдэл ${fmtS(bl)} нь хязгаартаа (${fmtS(blMax)}) хүрсэн.`;
    return `<p class="lterms">${terms}</p><div class="alert neg">${ic('warning-circle')}<span><b>Банк зээл олгохгүй</b>${why}</span></div>`;
  }
  return `<p class="lterms">${terms}</p>
  <div class="stepper"><button data-a="${a}" data-d="-1" aria-label="Хасах">−</button><input id="n_${a}" inputmode="numeric" data-in="numIn" data-f="${bank ? 'bamt' : 'amt'}" value="${amt.toLocaleString('en')}" aria-label="Зээлийн дүн"><button data-a="${a}" data-d="1" aria-label="Нэмэх">+</button></div>
  <div class="lbig"><small>${bank ? 'Сар бүр төлөх (үндсэн + хүү)' : 'Сар бүр төлөх хүү'}</small><b>${fmt(pay)}</b><span>${sub}</span>
    ${bank ? `<button class="linkbtn" data-a="schedOpen" data-p="${amt}" data-r="${S.bankRate}" data-pay="${pay}" data-n="${S.bankMonths}">Хуваарь харах</button>` : ''}</div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="${ok}">${fmtS(amt)} авах</button></div>`;
}
function banklHTML(P) { const room = bankRoom(P, G); return simpleLoan(P, 'bankl', Math.max(0, Math.min(FS.bamt || G.settings.emergencyUnit, room)), room); }
function appLoanHTML(P) { return simpleLoan(P, 'bank', Math.max(G.settings.emergencyUnit, FS.amt || G.settings.emergencyUnit), APP_INF); }
ACT.bamt = d => { const room = bankRoom(me(), G); const u = G.settings.emergencyUnit; FS.bamt = Math.max(u, Math.min(room, (FS.bamt || u) + +d.d * u)); drawSheet(); };
ACT.bankOk = () => { const P = me(); const amt = Math.min(FS.bamt || 0, bankRoom(P, G)); if (amt <= 0) return; snap('Банкны зээл'); takeBankLoan(G, P, amt); if (G.mode === 'online') NET.emit({ t: 'loan', txt: `${fmtS(amt)} банкны зээл авлаа` }); save(); render(); closeSheet(); toast(`${fmtS(amt)} банкны зээл авлаа`); };
/* R11 deposit: 1%/month, counts as passive income and as reserve; early withdrawal (<12 months) returns half the interest earned */
function depHTML(P) {
  const deps = P.assets.filter(a => a.kind === 'deposit');
  const amt = Math.min(FS.dep || 0, Math.max(0, P.cash));
  const rate = G.settings.depositPct;
  return `<div class="box"><p class="mute" style="font-size:13px">Жилийн 12% (сарын ${rate}%) хүүтэй. Хүү сар бүр идэвхгүй орлогод орж, нөөц санд тооцогдоно. 12 сар хүрээгүй авбал авсан хүүгийн талыг буцааж суутгана.</p></div>
  ${deps.map(a => { const early = (a.months || 0) < 12; const claw = early ? R((a.earned || 0) / 2) : 0; return `<div class="box"><div class="ln"><span>${esc(a.name)}<span class="sub">${a.months || 0} сар · хүү авсан ${fmtS(a.earned || 0)}${early ? ' · эрт авбал −' + fmtS(claw) : ''}</span></span><b>${fmtS(a.amount)}</b></div><div class="row" style="margin-top:8px"><button class="minibtn" data-a="depOut" data-id="${a.id}">${fmtS(a.amount - claw)} авах</button></div></div>`; }).join('')}
  <div class="box" style="display:grid;gap:10px"><h4>Шинэ хадгаламж <span>сард +${fmt(R(amt * rate / 100))}</span></h4>
    <div class="stepper"><button data-a="damt" data-d="-500000" aria-label="Хасах">−</button><input id="nDep" inputmode="numeric" data-in="numIn" data-f="dep" value="${amt.toLocaleString('en')}" aria-label="Хадгаламжийн дүн"><button data-a="damt" data-d="500000" aria-label="Нэмэх">+</button></div>
    <div class="quick">${[1e6, 5e6, 1e7].map(n => `<button class="chip" data-a="dset" data-n="${n}">${fmtS(n)}</button>`).join('')}<button class="chip" data-a="dset" data-n="${Math.floor(Math.max(0, P.cash) / 100000) * 100000}">Бүгд</button></div>
    ${afterBox(P, -amt, R(amt * rate / 100))}</div>
  <div class="cta"><button class="btn" data-a="close">Хаах</button><button class="btn go" data-a="depIn" ${amt > 0 ? '' : 'disabled'}>${fmtS(amt)} хадгалах</button></div>`;
}
/* every amount box can be typed by hand (user 2026-10-19); the −/+ buttons still step. Limits are applied when the action is confirmed. */
ACT.numIn = (d, el) => {
  let v = d.dec ? parseFloat(String(el.value).replace(',', '.')) || 0 : parseAmt(el.value);
  if (d.max) v = Math.min(+d.max, v);
  FS[d.f] = Math.max(0, v); drawSheet();
};
ACT.damt = d => { FS.dep = Math.max(0, (FS.dep || 0) + +d.d); drawSheet(); };
ACT.dset = d => { FS.dep = +d.n; drawSheet(); };
ACT.depIn = () => {
  const P = me(); const amt = Math.min(FS.dep, P.cash); if (amt <= 0) return;
  snap('Хадгаламж');
  P.assets.push({ id: uid('a'), kind: 'deposit', name: 'Хадгаламж', amount: amt, price: amt, rate: G.settings.depositPct, months: 0, earned: 0, cls: 'paper', tags: [], card: null });
  P.cash -= amt; log(G, P, `Хадгаламж нээлээ`, -amt, null, 'save'); save(); drawSheet(); toast('Хадгаламж нээлээ');
};
ACT.depOut = d => {
  const P = me(); const a = P.assets.find(x => x.id === d.id); if (!a) return;
  snap('Хадгаламж');
  const claw = (a.months || 0) < 12 ? R((a.earned || 0) / 2) : 0;
  P.assets = P.assets.filter(x => x.id !== a.id);
  P.cash += a.amount - claw;
  log(G, P, `Хадгаламж хаалаа${claw ? ` · эрт авсан тул хүү −${fmtS(claw)}` : ''}`, a.amount - claw, null, 'save'); save(); drawSheet();
};
/* R11 personal loan between players: ≤ 4.5%/month, interest-only, the app records both sides.
   The tab is always there (user 2026-10-15): borrow or lend; online the friend is picked and their phone is updated,
   offline the friend's name is typed and each player records their own side. */
function persParty(others) {
  const o = others.find(p => p.id === FS.pTo);
  return o ? { id: o.id, name: o.name } : ((FS.pName || '').trim() ? { id: null, name: FS.pName.trim() } : null);
}
function persHTML(P, others) {
  const lend = FS.pDir === 'lend';
  const amt = FS.pAmt || 0; const rate = FS.pRate || 0; const int = R(amt * rate / 100); const dti = dtiRoomPay(P, G);
  const party = persParty(others);
  const over = !lend && int > dti, short = lend && amt > P.cash;
  const ok = party && amt > 0 && !over && !short;
  return `<div class="seg" style="margin-bottom:10px"><button data-a="pDir" data-k="borrow" aria-pressed="${!lend}">Зээл авах</button><button data-a="pDir" data-k="lend" aria-pressed="${lend}">Зээл өгөх</button></div>
  <div class="field"><label>${lend ? 'Хэнд зээлэх вэ?' : 'Хэнээс зээлэх вэ?'}</label>
    ${others.length ? `<div class="chips">${others.map(o => `<button class="chip" data-a="pTo" data-id="${o.id}" aria-pressed="${FS.pTo === o.id}">${esc(o.name)}</button>`).join('')}</div>` : ''}
    ${G.mode === 'online' && others.length ? '' : `<input class="inp" data-in="pName" value="${esc(FS.pName || '')}" placeholder="Найзын нэр" autocomplete="off" ${others.length ? 'style="margin-top:8px"' : ''}>`}</div>
  <div class="box" style="display:grid;gap:10px"><div class="stepper"><button data-a="pamt" data-d="-1000000" aria-label="Хасах">−</button><input id="nPAmt" inputmode="numeric" data-in="numIn" data-f="pAmt" value="${amt.toLocaleString('en')}" aria-label="Дүн"><button data-a="pamt" data-d="1000000" aria-label="Нэмэх">+</button></div>
    <label class="mute" style="font-size:12px;font-weight:700;margin-bottom:-4px">Сарын хүү, %</label>
    <div class="stepper"><button data-a="prate" data-d="-0.5" aria-label="Хүү бууруулах">−</button><input id="nPRate" inputmode="decimal" data-in="numIn" data-f="pRate" data-dec="1" data-max="${G.settings.personalMax}" value="${rate}" aria-label="Сарын хүү, %"><button data-a="prate" data-d="0.5" aria-label="Хүү нэмэх">+</button></div>
    ${afterBox(P, lend ? -amt : amt, lend ? int : -int)}
    ${over ? `<p class="mute neg" style="font-size:12px">Хэрэглээний зээлийн ${G.settings.loanCap}%-ийн хязгаараас хэтэрнэ.</p>` : ''}
    ${short ? `<p class="mute neg" style="font-size:12px">Бэлэн мөнгө хүрэлцэхгүй.</p>` : ''}
    ${party && !party.id ? `<p class="mute" style="font-size:12px">${esc(party.name)} өөрийн утсандаа «${lend ? 'Зээл авах' : 'Зээл өгөх'}» гэж мөн бүртгэнэ.</p>` : ''}</div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="persOk" id="persOk" ${ok ? '' : 'disabled'}>Бүртгэх</button></div>`;
}
ACT.pDir = d => { FS.pDir = d.k; drawSheet(); };
ACT.pName = (d, el) => { FS.pName = el.value; FS.pTo = null; clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = document.querySelector('[data-in=pName]'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 600); };
ACT.pTo = d => { FS.pTo = FS.pTo === d.id ? null : d.id; FS.pName = ''; drawSheet(); };
ACT.pamt = d => { FS.pAmt = Math.max(1000000, (FS.pAmt || 0) + +d.d); drawSheet(); };
ACT.prate = d => { FS.pRate = Math.max(0, Math.min(G.settings.personalMax, (FS.pRate || 0) + +d.d)); drawSheet(); };
ACT.persOk = () => {
  const P = me(); const others = G.players.filter(p => p.id !== P.id && !p.out);
  const party = persParty(others); if (!party) return;
  const amt = FS.pAmt, rate = FS.pRate, id = uid('d'), o = party.id ? G.players.find(p => p.id === party.id) : null;
  const linked = !!o && G.mode === 'online';
  if (FS.pDir === 'lend') {
    if (amt > P.cash) return;
    snap('Хувийн зээл өгөв');
    P.assets.push({ id: uid('a'), kind: 'receivable', name: `Хувийн зээл · ${party.name}`, amount: amt, price: amt, rate, debtId: id, months: 0, earned: 0, cls: 'paper', tags: [], card: null, linked });
    pay(G, P, amt, `Хувийн зээл олгов → ${party.name} (сарын ${rate}%)`, null, 'loan');
    if (linked) NET.emit({ t: 'pborrow', to: o.id, amt, rate, id, txt: `хувийн зээл өглөө ${fmtS(amt)}` });
    else if (o) personalBorrow(G, o, { id, amt, rate, by: P.id }, P.name);
  } else {
    snap('Хувийн зээл');
    P.debts.push({ id, l: `Хувийн зээл · ${party.name}`, rate, monthly: true, bal: amt, orig: amt, pay: 0, kind: 'personal', lender: o ? o.id : null, y: { paid: 0, int: 0, start: amt } });
    gain(G, P, amt, `Хувийн зээл ← ${party.name} (сарын ${rate}%)`, null, 'loan');
    if (linked) NET.emit({ t: 'plend', to: o.id, amt, rate, id, txt: `хувийн зээл ${fmtS(amt)}` });
    else if (o) personalLend(G, o, { id, amt, rate }, P.name);
  }
  save(); closeSheet(); toast('Хувийн зээл бүртгэгдлээ');
};
/* the lender offered the loan: record the debt on the borrower's side */
function personalBorrow(G, B, e, name) {
  B.debts.push({ id: e.id, l: `Хувийн зээл · ${name}`, rate: e.rate, monthly: true, bal: e.amt, orig: e.amt, pay: 0, kind: 'personal', lender: e.by, y: { paid: 0, int: 0, start: e.amt } });
  gain(G, B, e.amt, `Хувийн зээл ← ${name} (сарын ${e.rate}%)`, null, 'loan');
}
/* offline: the lender records money the friend handed back */
function recvLinked(a) { return a.linked === undefined ? G.mode === 'online' : a.linked; }
function fRecv() {
  const P = me(); const a = P.assets.find(x => x.id === FS.asset); if (!a) return '';
  const amt = Math.min(FS.ramt || a.amount, a.amount);
  return `${head(esc(a.name))}<div class="box"><div class="ln"><span>Үлдэгдэл</span><b>${fmtS(a.amount)}</b></div><div class="ln"><span>Сарын хүү ${a.rate}%</span><b class="pos">+${fmt(assetOp(P, a))}</b></div></div>
  <div class="box" style="display:grid;gap:10px"><label class="mute" style="font-size:13px">Буцааж авсан дүн</label>
    <div class="stepper"><button data-a="recvAmt" data-d="-1000000" aria-label="Хасах">−</button><input id="nRecv" inputmode="numeric" data-in="numIn" data-f="ramt" value="${amt.toLocaleString('en')}" aria-label="Дүн"><button data-a="recvAmt" data-d="1000000" aria-label="Нэмэх">+</button></div>
    ${afterBox(P, amt, -R(amt * a.rate / 100))}</div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="recvOk">${fmtS(amt)} авсан</button></div>`;
}
ACT.recvAmt = d => { const a = me().assets.find(x => x.id === FS.asset); FS.ramt = Math.max(Math.min(1000000, a.amount), Math.min(a.amount, (FS.ramt || a.amount) + +d.d)); drawSheet(); };
ACT.recvOk = () => {
  const P = me(); const a = P.assets.find(x => x.id === FS.asset); if (!a) return;
  const amt = Math.min(FS.ramt || a.amount, a.amount);
  snap('Хувийн зээл буцаав');
  a.amount -= amt; a.price = a.amount; if (a.amount <= 0) P.assets = P.assets.filter(x => x.id !== a.id);
  gain(G, P, amt, `${a.name} · буцааж авлаа`, null, 'gain');
  save(); closeSheet(); toast('Бүртгэгдлээ');
};
function personalLend(G, L, e, name) {
  L.assets.push({ id: uid('a'), kind: 'receivable', name: `Хувийн зээл · ${name}`, amount: e.amt, price: e.amt, rate: e.rate, debtId: e.id, months: 0, earned: 0, cls: 'paper', tags: [], card: null, linked: G.mode === 'online' });
  pay(G, L, e.amt, `Хувийн зээл олгов → ${name} (сарын ${e.rate}%)`, null, 'loan');
}
function personalRepaid(G, L, e, name) {
  const a = L.assets.find(x => x.kind === 'receivable' && x.debtId === e.id);
  if (a) { a.amount -= e.amt; a.price = a.amount; if (a.amount <= 0) L.assets = L.assets.filter(x => x.id !== a.id); }
  gain(G, L, e.amt, `Хувийн зээл буцаалаа ← ${name}`, null, 'gain');
}
function afterRepay(P, debtId, amt) {
  const d = P.debts.find(x => x.id === debtId) || {};
  if (d.kind !== 'personal' || !amt) return;
  if (G.mode === 'online') NET.emit({ t: 'prepay', to: d.lender, id: d.id, amt, txt: 'хувийн зээл төллөө' });
  else { const L = G.players.find(p => p.id === d.lender); if (L) personalRepaid(G, L, { id: d.id, amt }, P.name); }
}
ACT.lamt = d => { const unit = G.settings.emergencyUnit; FS.amt = Math.max(unit, Math.min(loanRoom(me(), G), FS.amt + +d.d * unit)); drawSheet(); };
ACT.loanOk = () => { const P = me(); const amt = Math.min(FS.amt, loanRoom(P, G)); if (!amt) return; snap('Зээл'); takeLoan(G, P, amt); P.l2.levBoost = 0; save(); closeSheet(); toast(`${fmtS(amt)} зээл авлаа`); };
ACT.repayFull = d => { const P = me(); const debt = P.debts.find(x => x.id === d.id); if (!debt) return; snap('Зээл хаах'); const amt0 = Math.min(debt.bal, P.cash); afterRepay(P, d.id, amt0); const r = repayLoan(G, P, d.id, debt.bal); save(); render(); if ((UI.sheetFn === fDebts || UI.sheetFn === fExp) && !(r && r.kind === 'payoff')) drawSheet();
  if (UI.sheetFn === fRepay && !(r && r.kind === 'payoff')) { const back = FS.back; FS = {}; if (back === 'exp') openSheet(fExp, { modal: true }); else if (back) openSheet(fDebts); else closeSheet(); }
  if (r && r.kind === 'payoff') { FS = { pay: { delta: 0, lines: [], payoffs: [r], streak: P.streak }, then: null }; openSheet(() => `${head('Өр хаагдлаа')}<div class="celebrate"><h3>Өрөөс чөлөөлөгдлөө!</h3><p>${esc(r.debt)} хаагдлаа. Сарын ашиг +${fmt(r.pay)}.</p></div><div class="cta"><button class="btn go" data-a="close">Сайн байна</button></div>`); } };
ACT.repayPart = d => { const back = UI.sheetFn === fDebts ? 'debts' : UI.sheetFn === fExp ? 'exp' : null; FS = { debt: d.id, amt: 100000, back }; openSheet(fRepay); };
function fRepay() {
  const P = me(); const debt = P.debts.find(x => x.id === FS.debt);
  const step = debt.kind === 'bank' || debt.kind === 'l2' || debt.kind === 'personal' ? G.settings.emergencyUnit : 100000;
  const amt = Math.min(FS.amt, debt.bal, Math.max(0, P.cash));
  const newPay = debt.kind === 'bank' || debt.kind === 'personal' ? R((debt.bal - amt) * (debt.kind === 'bank' ? G.settings.loanPct : debt.rate) / 100) : debt.kind === 'l2' ? debtPay(P, debt, G) : (amt >= debt.bal ? 0 : prepayPay(debt, amt));
  return `${head('Хэсэгчлэн төлөх')}<div class="box"><div class="ln"><span>${esc(debt.l)}</span><b>${fmtS(debt.bal)}</b></div></div>
  <div class="box" style="display:grid;gap:10px"><div class="stepper"><button data-a="ramt" data-d="-${step}" aria-label="Хасах">−</button><input id="nRepay" inputmode="numeric" data-in="numIn" data-f="amt" value="${amt.toLocaleString('en')}" aria-label="Төлөх дүн"><button data-a="ramt" data-d="${step}" aria-label="Нэмэх">+</button></div>
  ${afterBox(P, -amt, debtPay(P, debt, G) - newPay)}
  <p class="mute" style="font-size:12px">${debt.kind === 'bank' || debt.kind === 'personal' ? 'Сарын хүү шууд буурна.' : debt.kind === 'l2' ? 'Үлдэгдэл буурна.' : `Хугацаа хэвээр (${monthsLeft(debt)} сар), сарын төлбөр буурна.`}</p></div>
  ${P.cash >= debt.bal ? `<button class="minibtn" data-a="repayFull" data-id="${debt.id}" style="justify-self:start">Бүтэн хаах · ${fmt(debt.bal)}</button>` : ''}
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="repayOk" ${amt > 0 ? '' : 'disabled'}>${fmt(amt)} төлөх</button></div>`;
}
ACT.ramt = d => { const P = me(); const debt = P.debts.find(x => x.id === FS.debt); FS.amt = Math.max(+d.d > 0 ? 0 : 100000, Math.min(debt.bal, FS.amt + +d.d)); if (FS.amt <= 0) FS.amt = Math.abs(+d.d); drawSheet(); };
ACT.repayOk = () => { const P = me(); snap('Зээл төлөх'); const amt = Math.min(FS.amt, P.cash); const back = FS.back; afterRepay(P, FS.debt, amt); repayLoan(G, P, FS.debt, amt); save(); render(); if (back === 'exp') { FS = {}; openSheet(fExp, { modal: true }); } else if (back) { FS = {}; openSheet(fDebts); } else closeSheet(); };

/* ---------- selling ---------- */
ACT.openSell = () => { FS = {}; openSheet(fSellList); };
function fSellList() {
  const P = me();
  return `${head('Хөрөнгө зарах')}
  <p class="mute" style="font-size:13px">Байр, газар, зогсоол, лангууг хүссэн үедээ банкаар; бизнесийг банкинд ${G.settings.forceSalePct}%-иар эсвэл Зах зээлийн «Худалдан авагч» картаар зарна. Хувьцаа, алтыг тэр нэртэй карт гарсан ээлжид. Ур чадвар зарагдахгүй.</p>
  ${P.assets.map(a => `<button class="citem" data-a="sellOne" data-id="${a.id}"><span class="bub" style="background:var(--ink2)">${ic(a.kind === 'units' ? 'coins' : a.kind === 'bond' || a.kind === 'deposit' ? 'piggy-bank' : 'buildings')}</span><span style="min-width:0"><b>${esc(a.name)}</b><small>${a.kind === 'units' ? a.qty.toLocaleString('en') + ' ' + STOCK[a.sym].unit : fmtS(a.price)}</small></span><span class="r">${ic('tag')}</span></button>`).join('') || '<p class="empty">Зарах хөрөнгө алга.</p>'}
  ${P.cash < 0 && !P.assets.length && loanRoom(P, G) <= 0 ? `<div class="alert neg">${ic('warning')}<span><b>Өрөө төлөх боломжгүй</b><span class="row"><button class="minibtn go" data-a="bankrupt">Дампуурал зарлах</button></span></span></div>` : ''}`;
}
ACT.sellOne = d => { const a = me().assets.find(x => x.id === d.id); if (a && a.kind === 'deposit') return ACT.openLoan({ bt: 'dep' }); const back = d.back ? UI.sheetFn : null; FS = { asset: d.id, price: null, how: 'force', back }; openSheet(fSellOne, { modal: !!back }); };
/* after a sale opened from the Хөрөнгө pop-up, go back to it */
function sellDone() { const b = FS.back; FS = {}; if (b) { render(); openSheet(b, { modal: true }); } else closeSheet(); }
function fSellOne() {
  const P = me(); const a = P.assets.find(x => x.id === FS.asset);
  if (!a) return `${head('Зарсан')}`;
  if (a.kind === 'units') {
    const px = FS.price || 0; const qty = FS.qty === undefined ? a.qty : FS.qty;
    const unit = STOCK[a.sym] ? STOCK[a.sym].unit : 'ширхэг'; const gainV = R((px - a.unitCost) * qty);
    return `${head('Зарах · ' + esc(a.name))}<div class="box" style="display:grid;gap:10px">
      <div class="field"><label for="sp">Зарах үнэ (1 ${unit}) <span class="mute" style="font-weight:600">· картан дээрх үнийг бичнэ</span></label><input id="sp" inputmode="numeric" placeholder="Үнэ бичнэ үү" value="${px ? px.toLocaleString('en') : ''}" data-in="sellPrice"></div>
      <div class="field"><label for="sq">Хэдийг зарах вэ? (${a.qty.toLocaleString('en')} байна)</label><input id="sq" inputmode="numeric" value="${qty}" data-in="sellQty"></div>
      ${px ? `<div class="ln"><span>${gainV >= 0 ? 'Ашиг' : 'Алдагдал'}<span class="sub">Авсан дундаж үнэ ${fmt(a.unitCost)} × ${qty.toLocaleString('en')}</span></span><b class="${gainV >= 0 ? 'pos' : 'neg'}">${fmt(gainV, { sign: true })}</b></div>
      ${afterBox(P, R(qty * px), a.lot && a.income ? -R(a.income * qty / a.qty) : 0)}` : ''}
      <p class="mute" style="font-size:12px">Дүрмээр хувьцаа, алтыг тэр нэртэй карт гарсан ээлжид л зарна.</p></div>
      <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="sellUnitsOk" ${qty > 0 && qty <= a.qty && px > 0 ? '' : 'disabled'}>${px ? fmtS(R(qty * px)) + ' зарах' : 'Үнээ бичнэ үү'}</button></div>`;
  }
  if (a.kind === 'bond') {
    if (a.left > 0) return `${head(esc(a.name))}<div class="alert neg">${ic('clock')}<span><b>Түгжээтэй</b>Бонд ${a.left} цалингийн өдрийн дараа бүтнээрээ буцна (R12).</span></div><div class="cta"><button class="btn" data-a="close">Хаах</button></div>`;
    return `${head('Бонд буцаах · ' + esc(a.name))}${afterBox(P, a.amount, -assetOp(P, a))}<div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="sellBondOk">${fmtS(a.amount)} буцааж авах</button></div>`;
  }
  if (a.kind === 'receivable' && !recvLinked(a)) { FS.asset = a.id; return fRecv(); }
  if (a.kind === 'receivable') return `${head(esc(a.name))}<p class="mute">Хувийн зээлийг зээлдэгч төлөхөд буцаж орно.</p><div class="cta"><button class="btn" data-a="close">Хаах</button></div>`;
  const d = assetLoan(P, a);
  const bank = bankSale(G, P, a);
  const price = FS.how === 'custom' ? (FS.price || 0) : bank.price;
  const opDrop = -(opAvg(P, a) - (d ? d.pay : 0));
  return `${head('Зарах · ' + esc(a.name))}
  ${a.blocked ? `<div class="alert neg">${ic('warning')}<span><b>Одоо зарж болохгүй</b>Газрын маргаан: ${a.blocked} цалингийн өдөр.</span></div>` : ''}
  <div class="seg"><button data-a="sellHow" data-k="force" aria-pressed="${FS.how !== 'custom'}">Банкаар</button><button data-a="sellHow" data-k="custom" aria-pressed="${FS.how === 'custom'}">Тоглогчид тохирсон үнээр</button></div>
  ${FS.how !== 'custom' ? `<p class="mute" style="font-size:12px">${isRealEstate(a) ? `Үл хөдлөх: авсан үнэ × (1 + ${G.settings.reGrowthPct}% × эзэмшсэн жил) − ${G.settings.reFeePct}% зуучлал (${esc(bank.how)}).` : `Бизнесийг банкинд авсан үнийн ${G.settings.forceSalePct}%-иар. Зах зээлийн «Худалдан авагч» картаар илүү үнээр зарж болно.`}</p>` : ''}
  ${FS.how === 'custom' ? `<div class="field"><label for="sp">Зарах үнэ (бусад тоглогчтой тохирсон)</label><input id="sp" inputmode="numeric" value="${FS.price ? FS.price.toLocaleString('en') : ''}" data-in="sellPrice" placeholder="₮"></div>` : ''}
  <div class="box"><div class="ln"><span>Авсан үнэ</span><b>${fmt(a.price)}</b></div><div class="ln"><span>Зарах үнэ</span><b>${fmt(price)}</b></div>${d ? `<div class="ln"><span>Зээлийн үлдэгдэл хаагдана</span><b class="neg">${fmt(-d.bal)}</b></div>` : ''}<div class="ln tot"><span>Гарт орох</span><b class="${price - (d ? d.bal : 0) >= 0 ? 'pos' : 'neg'}">${fmt(price - (d ? d.bal : 0), { sign: true })}</b></div></div>
  ${afterBox(P, price - (d ? d.bal : 0), opDrop)}
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="sellOk" data-p="${price}" ${a.blocked || !price ? 'disabled' : ''}>Зарах</button></div>`;
}
ACT.sellHow = d => { FS.how = d.k; drawSheet(); };
ACT.sellPrice = (d, el) => { FS.price = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#sp'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
// every price this stock/metal can show on a card (opportunity cards, their price range, market news), low → high
function symPrices(sym) {
  const v = new Set();
  for (const c of OF.cards) { const fx = c.fx || {};
    if (fx.k === 'units' && fx.sym === sym) { v.add(fx.price); (fx.range || []).forEach(x => v.add(x)); }
    if (fx.kind === 'stock' && (fx.tags || [])[0] === sym && fx.val) v.add(fx.val); }
  return [...v].filter(x => x > 0).sort((a, b) => a - b);
}
ACT.sellPxSet = d => { FS.price = +d.v; drawSheet(); };
ACT.sellQty = (d, el) => { FS.qty = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#sq'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 400); };
ACT.sellOk = d => { const P = me(); const a = P.assets.find(x => x.id === FS.asset); snap('Зарах'); sellAsset(G, P, a.id, +d.p, FS.how === 'custom' ? 'тохирсон үнээр' : bankSale(G, P, a).how); save(); sellDone(); toast('Зарлаа'); };
ACT.sellUnitsOk = () => { const P = me(); const a = P.assets.find(x => x.id === FS.asset); const qty = FS.qty === undefined ? a.qty : FS.qty; snap('Зарах'); if (!(FS.price > 0)) return; sellUnits(G, P, a.id, qty, FS.price); save(); sellDone(); toast('Зарлаа'); };
ACT.sellBondOk = () => { const P = me(); const a = P.assets.find(x => x.id === FS.asset); snap('Бонд'); P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, a.amount, `${a.name} буцаалаа`, a.card, 'sell'); save(); sellDone(); };

/* ---------- bankruptcy ---------- */
ACT.bankrupt = () => openSheet(() => `${head('Дампуурал')}${stage('m_worry', 'a-worry')}<p>${me().level === 2 ? 'Түвшин 2-т өрөө нөхөж чадахгүй бол Түвшин 1 рүү буцна.' : 'Зээлээ дээд хэмжээгээр авч, хөрөнгөө зараад ч өрөө төлж чадахгүй бол тоглоомоос гарна.'}</p><div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="bankruptOk">${me().level === 2 ? 'Түвшин 1 рүү буцах' : 'Тоглоомоос гарах'}</button></div>`);
ACT.bankruptOk = () => {
  const P = me(); snap('Дампуурал');
  if (P.level === 2) { backToLevel1(G, P); P.cash = Math.max(0, P.cash); }
  else { P.out = true; log(G, P, 'Дампуурч тоглоомоос гарлаа', 0, null, 'out'); if (G.mode === 'online') NET.emit({ t: 'out', txt: 'дампуурлаа' }); }
  save(); closeSheet();
};

/* ---------- level 2 ---------- */
ACT.levelUp = () => {
  const P = me();
  if (G.settings.endAtL1) { snap('Ялалт'); P.won = true; G.over = { winner: P.id, why: 'Түвшин 1-ээс анх гарлаа' }; log(G, P, 'Санхүүгийн эрх чөлөөнд хүрч ялалаа!', 0, null, 'win'); if (G.mode === 'online') NET.emit({ t: 'win', txt: 'ялалаа' }); save(); return openSheet(fWin); }
  FS = { deck: 'MO', q: '' }; openSheet(fPick);
};
ACT.pickDream = () => { FS = { deck: 'MO', q: '' }; openSheet(fPick); };
function fDreamPick() {
  const c = CARD[FS.card]; const P = me();
  return `${head('Мөрөөдөл')}${P.level === 1 ? `<div class="winbox" style="padding:0">${stage('m_free', 'a-free', confetti())}<p class="kicker">Санхүүгийн эрх чөлөө</p></div>` : ''}${cardHTML(c)}<p class="mute" style="font-size:13px">${P.level === 1 ? 'Мөрөөдлийн 2 карт сугалж нэгийг сонгоно. Их талд «Эхлүүлэх урьдчилгаа»-г бэлнээр төлж мөрөөдлөө анх эхлүүлсэн тоглогч ялна. Цалин зогсож, орлого тань хөрөнгийн идэвхгүй орлого болно.' : 'Мөрөөдлөө солих.'}</p>
  <div class="cta"><button class="btn" data-a="close">Буцах</button><button class="btn go" data-a="dreamOk">${P.level === 1 ? 'Түвшин 2 руу гарах' : 'Сонгох'}</button></div>`;
}
ACT.dreamOk = () => {
  const P = me(); snap('Түвшин 2');
  if (P.level === 1) enterLevel2(G, P, FS.card); else P.dream = FS.card;
  if (G.mode === 'online') NET.emit({ t: 'level', txt: `Түвшин 2 руу гарлаа · ${CARD[FS.card].title}` });
  save(); closeSheet(); buzz(40); toast('Түвшин 2 · Их тал');
};
function fDreamSq() {
  const P = me(); const c = P.dream ? CARD[P.dream] : null;
  if (!c) return `${head('Мөрөөдөл')}<p>Мөрөөдлөө сонгоогүй байна.</p><div class="cta"><button class="btn go" data-a="pickDream">Сонгох</button></div>`;
  const ok = P.cash >= c.fx.price;
  return `${head('Мөрөөдөл')}${cardHTML(c)}<div class="box"><div class="ln"><span>Бэлэн мөнгө</span><b>${fmtS(P.cash)}</b></div><div class="ln"><span>Эхлүүлэх урьдчилгаа<span class="sub">${c.fx.total ? 'Нийт өртөг ' + fmtS(c.fx.total) + '-ийн 12%' : ''}</span></span><b>${fmtS(c.fx.price)}</b></div>${ok ? '' : `<div class="ln"><span>Дутуу</span><b class="neg">${fmtS(c.fx.price - P.cash)}</b></div>`}</div>
  <p class="mute" style="font-size:12px">Урьдчилгааг бэлнээр төлж мөрөөдлөө эхлүүлсэн анхны тоглогч ялна. Үлдсэнийг таны идэвхгүй орлого цаашид санхүүжүүлнэ.</p>
  <div class="cta"><button class="btn" data-a="close">Хаах</button><button class="btn go" data-a="winOk" ${ok ? '' : 'disabled'}>Мөрөөдлөө эхлүүлэх</button></div>`;
}
ACT.winOk = () => {
  const P = me(); const c = CARD[P.dream]; snap('Ялалт');
  pay(G, P, c.fx.price, `Мөрөөдлөө эхлүүлэв: ${c.title}`, c.id, 'win'); P.won = true;
  G.over = { winner: P.id, why: c.title };
  if (G.mode === 'online') NET.emit({ t: 'win', txt: `мөрөөдлөө эхлүүлэв: ${c.title}` });
  save(); openSheet(fWin);
};
function fWin() {
  if (!G || !G.over) { setTimeout(closeSheet, 0); return ''; }
  const w = G.players.find(p => p.id === G.over.winner);
  const rank = [...G.players].sort((a, b) => (b.won - a.won) || (b.level - a.level) || ((fin(b, G).progress || 0) - (fin(a, G).progress || 0)) || (fin(b, G).passive - fin(a, G).passive));
  return `<div class="winbox">${stage(w ? 'm_free' : 'm_hello', 'a-free', confetti())}<h2>${w ? esc(w.name) + ' ялалаа!' : 'Тоглоом дууслаа'}</h2><p class="mute">${esc(G.over.why || '')}</p></div>
  ${rank.map((p, i) => { const f = fin(p, G); return `<div class="rank"><span class="n">${i + 1}</span>${avatar(p)}<span style="flex:1;min-width:0"><b>${esc(p.name)}</b><br><small class="mute">Идэвхгүй ${fmtS(f.passive)} · ${p.l7 && p.level === 2 ? 'төсөл ' + p.l7.proj.length : 'хөрөнгө ' + p.assets.length} · цэвэр хөрөнгө ${fmtS(netWorth(p))}</small></span></div>`; }).join('')}
  <div class="box"><h4>Энэ тоглоом юу заасан бэ?</h4>${(OF.rules.find(r => r.id === 'R15') || { blocks: [] }).blocks.map(b => `<p style="font-size:13px;margin-top:6px">${esc(b.x)}</p>`).join('')}</div>
  <div class="cta"><button class="btn" data-a="close">Тоглоомоо харах</button><button class="btn go" data-a="home">Нүүр хуудас</button></div>`;
}

/* ---- Level 2: national opportunity ---- */
function actVenture(P, c) {
  const fx = c.fx;
  const maxP = fx.partners || 0;
  const share = FS.share || 1;
  const invest = R(fx.invest * share), profit = R(fx.profit * share);
  const sp = fx.special;
  return `<div class="box" style="display:grid;gap:12px">
    ${maxP ? `<div class="field"><label>Хамтрагч (${maxP} хүртэл) — хөрөнгө оруулалтаа хувааж, ашгаа хувиар хуваана</label><div class="chips">${[1, 2, 3, 4].slice(0, maxP + 1).map(k => `<button class="chip" data-a="vshare" data-v="${1 / k}" aria-pressed="${Math.abs(share - 1 / k) < .01}">${k === 1 ? 'Ганцаараа' : k + ' хүн · ' + Math.round(100 / k) + '%'}</button>`).join('')}</div></div>` : ''}
    <div class="grid2"><div class="kv"><small>Таны хөрөнгө оруулалт</small><b>${fmtS(invest)}</b></div><div class="kv"><small>Сарын ашиг</small><b class="${profit >= 0 ? 'pos' : 'neg'}">${fmtS(profit, { sign: true })}</b></div></div>
    ${sp && sp.t === 'wait' ? `<p class="mute" style="font-size:12px">Эхний ${sp.years} удаагийн Жилийн орлогод ашиг 0.</p>` : ''}
    ${sp && sp.t === 'dice' ? `<p class="mute" style="font-size:12px">Жилийн орлого авах бүрт шоо хаяна.</p>` : ''}
    ${afterBox(P, -invest, profit * 12, 'Жилийн орлого дараа нь', true)}${shortfall(P, invest, true)}</div>
  <div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button>${payBtn(P, invest, 'ventureOk', 'Хөрөнгө оруулах')}</div>`;
}
ACT.vshare = d => { FS.share = +d.v; drawSheet(); };
ACT.ventureOk = () => { const P = me(); const c = CARD[FS.card]; snap(c.title); buyVenture(G, P, c, FS.share || 1); if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: c.title }); save(); closeSheet(); };
ACT.ventureRoll = d => { FS = { va: d.id, vals: null }; openSheet(fVentureRoll); };
function fVentureRoll() {
  const P = me(); const a = P.assets.find(x => x.id === FS.va);
  if (!a) return `${head('Дууссан')}`;
  const v = FS.vals ? FS.vals[0] : null;
  const hit = v ? a.special.out.find(o => v >= o[0] && v <= o[1]) : null;
  let res = '';
  if (v) {
    if (!hit) res = 'Өөрчлөлтгүй — хувь хэвээр.';
    else if (hit[2] === 'sell') res = `Компани зарагдлаа: ${fmtS(R(hit[3] * a.share))} авна.`;
    else if (hit[2] === 'sellx') res = `Хувь ${hit[3]} дахин өсөж зарагдлаа: ${fmtS(a.invest * hit[3])}.`;
    else if (hit[2] === 'lose') res = 'Дампуурлаа — хувь 0.';
    else if (hit[2] === 'half') res = 'Хувийн үнэ хагас болж буурлаа.';
  }
  return `${head(esc(a.name))}${v ? `<div class="dice"><div class="die">${v}</div></div><p class="center-t" style="font-weight:800">${res}</p><div class="cta"><button class="btn go" data-a="ventureApply">Үргэлжлүүлэх</button></div>` : `<div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="vdie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.vdie = d => { FS.vals = [+d.n || d6()]; drawSheet(); };
ACT.ventureApply = () => {
  const P = me(); const a = P.assets.find(x => x.id === FS.va); const v = FS.vals[0];
  const hit = a.special.out.find(o => v >= o[0] && v <= o[1]);
  snap(a.name);
  if (hit) {
    if (hit[2] === 'sell') { P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, R(hit[3] * a.share), `${a.name} зарагдлаа`, a.card); }
    else if (hit[2] === 'sellx') { P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, a.invest * hit[3], `${a.name} IPO`, a.card); }
    else if (hit[2] === 'lose') { P.assets = P.assets.filter(x => x.id !== a.id); log(G, P, `${a.name} дампуурлаа`, 0, a.card); }
    else if (hit[2] === 'half') { a.invest = R(a.invest / 2); a.price = a.invest; log(G, P, `${a.name} хувь хагас болов`, 0, a.card); }
  } else log(G, P, `${a.name} — шоо ${v}, хэвээр`, 0, a.card);
  save(); closeSheet();
};
function actNBSpecial(P, c) {
  const fx = c.fx;
  if (fx.k === 'leverage') return `<div class="box"><p>Энэ ээлжинд хөрөнгийнхөө ${fx.pct}% хүртэл зээл авч болно.</p></div><div class="cta"><button class="btn sm" data-a="skipCard">Алгасах</button><button class="btn go" data-a="levOk">Зээлийн эрх нээх</button></div>`;
  const list = P.assets.filter(a => a.kind === 'venture' && (fx.k === 'nbexit' ? a.profit > 0 : (a.tags || []).some(t => fx.tagsAny.includes(t))));
  return `<div class="box">${list.map(a => { const price = fx.k === 'nbexit' ? a.profit * 12 * fx.mult : a.invest * fx.mult; return `<div class="ln"><span>${esc(a.name)}<span class="sub">${fx.k === 'nbexit' ? `Жилийн ашиг ${fmtS(a.profit * 12)} × ${fx.mult}` : `Оруулсан ${fmtS(a.invest)} × ${fx.mult}`}</span></span><button class="minibtn go" data-a="nbSell" data-id="${a.id}" data-p="${price}">${fmtS(price)}</button></div>`; }).join('') || '<p class="empty">Тохирох хувь эзэмшээгүй байна.</p>'}</div>
  <div class="cta"><button class="btn" data-a="skipCard">Хаах</button></div>`;
}
ACT.levOk = () => { const P = me(); P.l2.levBoost = CARD[FS.card].fx.pct - G.settings.l2LoanPct; save(); FS = { amt: G.settings.emergencyUnit }; drawSheet2(fLoan); };
ACT.nbSell = d => { const P = me(); const a = P.assets.find(x => x.id === d.id); snap('Зарах'); P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, +d.p, `${a.name} зарлаа · ${FS.card}`, FS.card, 'sell'); save(); closeSheet(); };

/* ---- investor square: L2 player buys into a L1 player's business ---- */
function fInvestor() {
  const P = me();
  const l1 = G.players.filter(p => p.level === 1 && !p.out && p.id !== P.id);
  return `${head('Хөрөнгө оруулагч')}<p class="mute" style="font-size:13px">Түвшин 1-ийн тоглогчийн бизнест хамтрагч болж болно. Үнэ, хувийг хоёулаа тохирно.</p>
  ${G.mode === 'local' ? `<div class="chips">${l1.map(o => `<button class="chip" data-a="invSel" data-id="${o.id}" aria-pressed="${FS.sel === o.id}">${esc(o.name)}</button>`).join('') || '<p class="empty">Түвшин 1-д тоглогч алга.</p>'}</div>` : ''}
  <div class="field"><label for="invA">Оруулах мөнгө</label><input id="invA" inputmode="numeric" value="${FS.amt ? FS.amt.toLocaleString('en') : ''}" data-in="invA" placeholder="₮"></div>
  <div class="field"><label for="invS">Танд сар бүр орох ашиг</label><input id="invS" inputmode="numeric" value="${FS.share ? FS.share.toLocaleString('en') : ''}" data-in="invS" placeholder="₮"></div>
  <div class="cta"><button class="btn" data-a="close">Алгасах</button><button class="btn go" data-a="invOk" ${FS.amt > 0 && FS.share > 0 && FS.amt <= P.cash && (G.mode !== 'local' || FS.sel) ? '' : 'disabled'}>Тохиролцлоо</button></div>`;
}
ACT.invSel = d => { FS.sel = d.id; drawSheet(); };
ACT.invA = (d, el) => { FS.amt = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#invA'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
ACT.invS = (d, el) => { FS.share = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#invS'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
ACT.invOk = () => {
  const P = me(); snap('Хөрөнгө оруулагч');
  const o = G.players.find(p => p.id === FS.sel);
  P.assets.push({ id: uid('a'), kind: 'venture', name: `${o ? o.name : 'Түвшин 1'}-ийн бизнест хувь`, invest: FS.amt, price: FS.amt, profit: FS.share, share: 1, cls: 'nb', tags: [], card: null });
  P.cash -= FS.amt; log(G, P, 'Хөрөнгө оруулагч боллоо', -FS.amt, null, 'buy');
  if (o) { o.cash += FS.amt; o.expMods.push({ id: uid('x'), l: `${P.name}-д ногдох ашиг`, v: FS.share }); log(G, o, `${P.name} хөрөнгө оруулав`, FS.amt, null, 'gain'); }
  if (G.mode === 'online') NET.emit({ t: 'invest', txt: `хөрөнгө оруулагч боллоо (${fmtS(FS.amt)})` });
  save(); closeSheet();
};

/* ---------- Хадгаламж (savings) screen ---------- */
ACT.openSave = () => { FS = { sv: null, sAmt: 1000000, cancel: null }; openSheet(fSave); };
ACT.fMode = d => { const P = me(); FS.fv = d.m; FS.fAmt = d.m === 'out' ? (P.free || 0) : Math.max(0, Math.floor(P.cash / 100000) * 100000); drawSheet(); };
ACT.fCancel = () => { FS.fv = null; drawSheet(); };
ACT.fStep = d => { FS.fAmt = Math.max(0, (FS.fAmt || 0) + +d.d); drawSheet(); };
ACT.fSet = d => { FS.fAmt = +d.n; drawSheet(); };
ACT.fAmtIn = (d, el) => { FS.fAmt = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#fAmtIn'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
ACT.fOk = () => { const P = me(); const a = FS.fAmt || 0; snap('Хадгаламж'); freeMove(G, P, FS.fv === 'in' ? -a : a); FS.fv = null; save(); render(); drawSheet(); };
function savCard(P, s) {
  const T = SAVE_TYPES[s.type]; const left = Math.max(0, T.term - s.el);
  const rate = savRate(s); const lost = T.compound && s.broken; const tap = canAct(P);
  const seg = Array.from({ length: T.term }, (_, i) => `<i class="${i < s.el ? 'on' : ''}"></i>`).join('');
  return `<${tap ? 'button' : 'div'} class="box svc svk" ${tap ? `data-a="savDet" data-id="${s.id}"` : ''}>
    <div class="svh"><span><b>${T.n}</b><small>${fmt(savPrincipal(s))}${T.compound ? ` · сар бүр ${fmtS(s.monthly)}` : ''}${lost ? ' · тасарсан' : ''}</small></span><em class="${lost ? 'neg' : ''}">${rate}%</em></div>
    <div class="svseg">${seg}</div>
    <div class="svend"><span><b>${left ? left : 0}</b> ${left ? 'цалингийн дараа' : 'дууслаа'}</span><b class="pos">${fmt(R(savProjected(s)))}</b></div>
  </${tap ? 'button' : 'div'}>`;
}
/* full savings detail, opened by tapping a compact card */
function savDetail(P, s) {
  const T = SAVE_TYPES[s.type]; const acc = R(savAccrued(s)); const left = T.term - s.el;
  const rate = savRate(s); const lost = T.compound && s.broken;
  return `${head(T.n, '<span>Хадгаламж</span>›<b>Дэлгэрэнгүй</b>')}
  <div class="box svc"><div class="svh"><span><b>${s.el}/${T.term} сар</b><small>${left} цалингийн өдөр үлдсэн</small></span><em class="${lost ? 'neg' : ''}">${rate}%</em></div>
    <div class="track"><i style="width:${(s.el / T.term * 100).toFixed(1)}%"></i></div>
    <div class="ln"><span>Байршуулсан</span><b>${fmt(savPrincipal(s))}</b></div>
    <div class="ln"><span>Тооцоолсон хүү<span class="sub">${lost ? 'Төлбөр тасарсан тул жилийн 3%-иар' : `Жилийн ${rate}%${T.compound ? ', сар бүр нийлмэл' : ''}`}</span></span><b class="pos">+${fmt(acc)}</b></div>
    ${T.compound ? `<div class="ln"><span>Сар бүрийн төлбөр<span class="sub">${s.paid}/12 төлсөн${s.missed ? ' · ' + s.missed + ' сар тасалсан' : ''}</span></span><b>${fmt(s.monthly)}</b></div>
      <div class="ln"><span>18%-ийн эрх</span><b class="${lost ? 'neg' : 'pos'}">${lost ? 'Алдсан' : 'Хүчинтэй'}</b></div>` : ''}
    <div class="ln tot"><span>${left} цалингийн дараа авах</span><b>${fmt(R(savProjected(s)))}</b></div></div>
  <div class="cta"><button class="btn" data-a="savBack">Буцах</button>${canAct(P) ? `<button class="btn" data-a="savCancel" data-id="${s.id}">Цуцлах</button>` : ''}</div>`;
}
function fSave() {
  const P = me(); const list = P.savings || [];
  if (FS.cancel) {
    const s = list.find(x => x.id === FS.cancel); if (!s) { FS.cancel = null; return fSave(); }
    const T = SAVE_TYPES[s.type]; const got = R(savIfCancel(s)); const full = R(savProjected(s));
    return `${head('Хадгаламж цуцлах', '<span>Хадгаламж</span>›<b>Цуцлах</b>')}
    <div class="box"><p style="font-size:14px"><b>${T.n}</b> — ${s.el}/${T.term} сар болсон.</p>
      <div class="ln"><span>Байршуулсан</span><b>${fmt(savPrincipal(s))}</b></div>
      <div class="ln"><span>Хүү<span class="sub">Эрт цуцалбал жилийн ${T.early}%, ${s.el} сараар</span></span><b class="pos">+${fmt(got - savPrincipal(s))}</b></div>
      <div class="ln tot"><span>Одоо буцааж авах</span><b>${fmt(got)}</b></div>
      <p class="mute" style="font-size:12px;margin-top:6px">Хугацаагаа дуусгавал ${fmt(full)} авах байсан — ${fmt(full - got)} алдана.</p></div>
    <div class="cta"><button class="btn" data-a="savBack">Болих</button><button class="btn go" data-a="savCancelOk" data-id="${s.id}">${fmtS(got)} авах</button></div>`;
  }
  if (FS.svDet) { const s = list.find(x => x.id === FS.svDet); if (s) return savDetail(P, s); FS.svDet = null; }
  if (FS.sv) {
    const T = SAVE_TYPES[FS.sv]; const amt = Math.max(0, FS.sAmt || 0); const mon = Math.max(0, FS.sMon == null ? amt : FS.sMon);
    const pv = savPreview(FS.sv, amt, mon);
    const fromFree = FS.sFrom === 'free' && P.free > 0; const srcMax = fromFree ? P.free : Math.max(0, P.cash);
    const okAmt = amt > 0 && amt <= srcMax && (!T.compound || mon > 0);
    const srcSeg = P.free > 0 ? `<div class="box" style="display:grid;gap:8px"><h4>Хаанаас</h4><div class="seg"><button data-a="sFrom" data-k="free" aria-pressed="${fromFree}">Хугацаагүй хадгаламж<br><small>${fmtS(P.free)}</small></button><button data-a="sFrom" data-k="cash" aria-pressed="${!fromFree}">Бэлэн мөнгө<br><small>${fmtS(Math.max(0, P.cash))}</small></button></div></div>` : '';
    const step = (k, v, d, label, chips, all) => `<div class="box" style="display:grid;gap:10px"><h4>${label}${k === 'sAmt' ? ` <span>жилийн ${T.rate}%</span>` : ''}</h4>
      <div class="stepper"><button data-a="sAmt" data-k="${k}" data-d="-${d}" aria-label="Хасах">−</button><input id="${k}In" inputmode="numeric" value="${v.toLocaleString('en')}" data-in="sAmtIn" data-k="${k}" aria-label="${label}"><button data-a="sAmt" data-k="${k}" data-d="${d}" aria-label="Нэмэх">+</button></div>
      <div class="quick">${chips.map(n => `<button class="chip" data-a="sSet" data-k="${k}" data-n="${n}">${fmtS(n)}</button>`).join('')}${all ? `<button class="chip" data-a="sSet" data-k="${k}" data-n="${Math.floor(srcMax / 100000) * 100000}">Бүгд</button>` : ''}</div></div>`;
    return `${head(T.n, '<span>Хадгаламж</span>›<b>Нээх</b>')}
    ${srcSeg}
    ${T.compound ? step('sAmt', amt, 500000, 'Нээх дүн', [1e6, 5e6, 1e7], true) + step('sMon', mon, 100000, 'Сар бүр нэмэх дүн', [200000, 500000, 1e6], false)
      : step('sAmt', amt, 500000, 'Хадгалуулах дүн', [1e6, 5e6, 1e7], true)}
    <div class="box"><div class="ln"><span>${T.compound ? 'Нийт байршуулах (12 удаа)' : 'Байршуулах'}</span><b>${fmt(pv.paid)}</b></div>
      <div class="ln"><span>Хүүгийн ашиг</span><b class="pos">+${fmt(R(pv.interest))}</b></div>
      <div class="ln tot"><span>${T.term} сарын дараа авах</span><b>${fmt(R(pv.total))}</b></div>
      <p class="mute" style="font-size:12px;margin-top:6px">${T.compound
        ? `${fmt(amt)}-ийг одоо хийнэ. Дараагийн 11 цалингийн өдөр бүр ${fmt(mon)} автоматаар хасна. Нэг ч сар тасалбал 18%-ийн эрх бүрмөсөн алдагдаж, жилийн 3%-иар бодно. Хугацаанаас өмнө цуцалбал мөн 3%.`
        : `Нэг удаа байршуулна. ${T.term} цалингийн өдрийн дараа үндсэн мөнгө, хүүгээ хамт авна. Хугацаанаас өмнө цуцалбал жилийн ${T.early}%-иар бодно.`}
        Хадгаламжийн мөнгө, хүү сарын ашигт орохгүй.</p></div>
    ${fromFree ? `<div class="box"><div class="ln"><span>Хугацаагүй хадгаламж дараа нь</span><b>${fmtS(Math.max(0, P.free - amt))}</b></div><p class="mute" style="font-size:12px;margin-top:4px">Бэлэн мөнгө өөрчлөгдөхгүй.</p></div>` : afterBox(P, -amt, 0)}
    ${amt > srcMax ? `<div class="alert neg">${ic('warning-circle')}<span><b>${fromFree ? 'Хугацаагүй хадгаламж' : 'Бэлэн мөнгө'} хүрэлцэхгүй</b>${fromFree ? 'Дүнгээ багасгах эсвэл бэлэн мөнгөнөөс хийнэ.' : 'Хадгаламжийг зээлээр нээх боломжгүй.'}</span></div>` : ''}
    <div class="cta"><button class="btn" data-a="savBack">Буцах</button><button class="btn go" data-a="savOpenOk" ${okAmt ? '' : 'disabled'}>${fmtS(amt)} хадгалах</button></div>`;
  }
  const tot = sum(list, x => savPrincipal(x)); const int = sum(list, x => R(savAccrued(x)));
  const fv = FS.fv, fa = Math.max(0, FS.fAmt || 0), fmax = fv === 'in' ? Math.max(0, P.cash) : (P.free || 0);
  const freeBox = `<div class="box svfree"><div class="svh"><span><b>Хугацаагүй хадгаламж</b><small>Хүүгүй · хүссэн үедээ авна</small></span><em>${fmtS(P.free || 0)}</em></div>
    ${fv ? `<div class="stepper" style="margin-top:10px"><button data-a="fStep" data-d="-1000000" aria-label="Хасах">−</button><input id="fAmtIn" inputmode="numeric" value="${fa.toLocaleString('en')}" data-in="fAmtIn" aria-label="Дүн"><button data-a="fStep" data-d="1000000" aria-label="Нэмэх">+</button></div>
      <div class="quick" style="margin-top:8px"><button class="chip" data-a="fSet" data-n="${Math.floor(fmax / 100000) * 100000}">Бүгд</button></div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="minibtn" data-a="fCancel">Болих</button><button class="minibtn go" data-a="fOk" ${fa > 0 && fa <= fmax && canAct(P) ? '' : 'disabled'}>${fv === 'in' ? fmtS(fa) + ' хийх' : fmtS(fa) + ' авах'}</button></div>`
    : canAct(P) ? `<div class="row" style="margin-top:10px;gap:8px"><button class="minibtn go" data-a="fMode" data-m="out" ${P.free > 0 ? '' : 'disabled'}>Бэлэн мөнгө рүү авах</button><button class="minibtn" data-a="fMode" data-m="in" ${P.cash > 0 ? '' : 'disabled'}>Хадгаламжид хийх</button></div>` : ''}</div>`;
  return `${head('Хадгаламж')}
  ${freeBox}
  <div class="svsum"><div><small>Нийт хадгалуулсан</small><b>${fmtS(tot)}</b></div><div><small>Тооцоологдсон хүү</small><b class="pos">+${fmtS(int)}</b></div><div><small>Идэвхтэй</small><b>${list.length}</b></div></div>
  <div class="svopts">${Object.entries(SAVE_TYPES).map(([k, T]) => `<div class="svo"><em>${T.rate}%</em><b>${T.short}</b><small>${T.compound ? 'Сар бүр тогтмол хийнэ<br>Тасалбал 3%' : `${T.term} сарын хугацаа<br>Эрт цуцалбал ${T.early}%`}</small><button class="minibtn go" data-a="savNew" data-t="${k}" ${canAct(P) ? '' : 'disabled'}>Нээх</button></div>`).join('')}</div>
  <div class="sec" style="margin-top:14px">Миний хадгаламж</div>
  ${list.map(x => savCard(P, x)).join('') || '<div class="box"><p class="empty">Идэвхтэй хадгаламж алга.</p></div>'}
  <p class="mute" style="font-size:12px;margin-top:8px">Жилийн хүү. 1 цалингийн өдөр = 1 сар. Хадгалсан мөнгө нөөц санд тооцогдоно, харин сарын ашигт орохгүй.</p>`;
}
ACT.savNew = d => { FS.sv = d.t; FS.sAmt = 1000000; FS.sMon = SAVE_TYPES[d.t].compound ? 500000 : null; FS.sFrom = me().free > 0 ? 'free' : 'cash'; drawSheet(); };
ACT.sFrom = d => { FS.sFrom = d.k; drawSheet(); };
ACT.savBack = () => { if (FS.cancel && FS.svDet) FS.cancel = null; else { FS.sv = null; FS.cancel = null; FS.svDet = null; } drawSheet(); };
ACT.savDet = d => { FS.svDet = d.id; drawSheet(); };
const sKey = d => d.k === 'sMon' ? 'sMon' : 'sAmt';
ACT.sAmt = d => { const k = sKey(d); const cur = k === 'sMon' && FS.sMon == null ? (FS.sAmt || 0) : (FS[k] || 0); FS[k] = Math.max(0, cur + +d.d); drawSheet(); };
ACT.sSet = d => { FS[sKey(d)] = +d.n; drawSheet(); };
ACT.sAmtIn = (d, el) => { const k = sKey(d); FS[k] = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#' + k + 'In'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
ACT.savOpenOk = () => {
  const P = me(); const amt = FS.sAmt || 0; const from = FS.sFrom === 'free' && P.free > 0 ? 'free' : 'cash';
  if (!(amt > 0) || amt > (from === 'free' ? P.free : P.cash)) return toast(from === 'free' ? 'Хугацаагүй хадгаламж хүрэлцэхгүй' : 'Бэлэн мөнгө хүрэлцэхгүй');
  snap('Хадгаламж');
  const s = openSaving(G, P, FS.sv, amt, FS.sMon, from); if (!s) return;
  save(); FS.sv = null; drawSheet(); buzz(15); toast(`${SAVE_TYPES[s.type].n} нээлээ`);
};
ACT.savCancel = d => { FS.cancel = d.id; drawSheet(); };
ACT.savCancelOk = d => { const P = me(); snap('Хадгаламж цуцлах'); const got = closeSaving(G, P, d.id); FS.cancel = null; save(); drawSheet(); if (got != null) toast(`${fmtS(got)} буцаан авлаа`); };
function savPayHTML(r) {
  const ev = (r.sav || []).filter(e => e.k !== 'done'); if (!ev.length) return '';
  return `<div class="box"><div class="sec">Хадгаламж <span>сарын ашигт орохгүй</span></div>${ev.map(e => e.k === 'dep'
    ? `<div class="ln"><span>${esc(e.n)}<span class="sub">${e.paid}/12 төлбөр${e.broken ? ' · 3%' : ''}</span></span><b>−${fmt(e.amt)}</b></div>${!e.skipped ? `<div class="row" style="margin:-2px 0 6px"><button class="minibtn" data-a="savSkip" data-id="${e.id}">Энэ сар хийхгүй${e.broken ? '' : ' (18% эрх алдана)'}</button></div>` : ''}`
    : e.k === 'miss' ? `<div class="ln"><span>${esc(e.n)}<span class="sub">${e.skipped ? 'Энэ сар алгаслаа' : 'Мөнгө хүрэлцээгүй'}${e.lost ? ' — 18%-ийн эрх алдлаа, жилийн 3%-иар бодно' : ''}</span></span><b class="neg">${e.skipped ? '' : 'Тасарсан'}</b></div>`
    : `<div class="ln"><span>${esc(e.n)} дууслаа<span class="sub">Жилийн ${e.rate}% · хүү +${fmt(e.interest)}</span></span><b class="pos">+${fmt(e.total)}</b></div>`).join('')}</div>`;
}
ACT.savSkip = d => {
  const P = me(); if (!savSkip(G, P, d.id)) return;
  const e = (FS.pay.sav || []).find(x => x.id === d.id && x.k === 'dep');
  if (e) { e.k = 'miss'; e.skipped = true; e.lost = !e.broken; }
  save(); drawSheet(); render();
};

/* ---------- Зардал (expense tracker) ---------- */
ACT.openExp = () => openSheet(fExp, { modal: true });
function fExpOld() {
  const P = me(); const f = fin(P, G);
  const rows = [];
  for (const e of P.exps) if (e.v && (P.level === 1 || e.kind !== 'tax')) rows.push([e.l, e.v, e.kind === 'tax' ? 'Цалингаас суутгана' : e.kind === 'rent' ? 'Байр' : 'Тогтмол']);
  if (P.kids) rows.push([`Хүүхэд × ${P.kids}`, f.kids, 'Тогтмол']);
  for (const x of P.expMods) if (x.v) rows.push([x.l, x.v, x.infl ? 'Жил бүр өснө' : 'Нэмэгдсэн']);
  if (f.ins) rows.push(['Мал, тариалангийн даатгал', f.ins, 'Даатгал']);
  for (const x of f.livLoans) rows.push([x.d.l, x.pay, (x.d.kind === 'bank' || x.d.kind === 'personal' || x.d.kind === 'l2' ? `Зөвхөн хүү · үлдэгдэл ${fmtS(x.d.bal)}` : `Үлдэгдэл ${fmtS(x.d.bal)}`), x.d.bal > 0 ? x.d.id : null]);
  for (const x of f.loans) if (!f.livLoans.includes(x) && x.d.bal > 0) rows.push([x.d.l, x.pay, `Хөрөнгийн ашгаас төлөгддөг · үлдэгдэл ${fmtS(x.d.bal)}`, x.d.id]);
  if (f.pctAmt) rows.push(['Нэмэгдсэн зардал', f.pctAmt, `+${sum(P.expMods.filter(m => m.pct), m => m.pct)}%`]);
  rows.sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...rows.map(r => r[1]));
  // one-off spending since the last payday
  const since = []; for (const h of P.hist || []) { if (h.kind === 'payday') break; if (h.amt < 0 && h.kind !== 'save' && h.kind !== 'repay') since.push(h); }
  const comp = (P.savings || []).filter(s => SAVE_TYPES[s.type].compound && s.el < 11);
  const bank = P.debts.find(d => d.kind === 'bank' && d.bal > 0);
  const ds = P.debts.filter(d => d.bal > 0);
  return `${head('Зардал')}
  <div class="svsum"><div><small>Сарын нийт зардал</small><b class="neg">−${fmtS(f.expenses)}</b></div><div><small>Орлого</small><b class="pos">+${fmtS(f.income)}</b></div><div><small>Сарын ашиг</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmtS(f.cf, { sign: true })}</b></div></div>
  <div class="box"><div class="sec">Сар бүр <span>их нь дээрээ</span></div>
    ${rows.map(r => `<div class="xrow"><span><b>${esc(r[0])}</b><small>${esc(r[2])}</small></span><span style="display:flex;align-items:center;gap:8px;flex:none"><em class="${r[4] ? 'mute' : 'neg'}">−${fmt(r[1])}</em>${r[3] && canAct(P) ? `<button class="minibtn go" data-a="repayPart" data-id="${r[3]}">Төлөх</button>` : ''}</span><i style="width:${(r[1] / top * 100).toFixed(1)}%"></i></div>`).join('') || '<p class="empty">Зардалгүй</p>'}</div>
  ${bank ? `<div class="alert">${ic('bank')}<span><b>${esc(bank.l)} ${fmtS(bank.bal)}</b>Сар бүр зөвхөн хүү ${fmt(debtPay(P, bank, G))} төлж байна. 1 сая₮ буцаавал сард ${fmt(R(G.settings.emergencyUnit * G.settings.loanPct / 100))} хэмнэнэ.${canAct(P) && P.cash >= G.settings.emergencyUnit ? `<span class="row"><button class="minibtn go" data-a="expRepay" data-id="${bank.id}">1 сая₮ буцаах</button></span>` : ''}</span></div>` : ''}
  ${comp.length ? `<div class="box"><div class="sec">Хадгаламж руу сар бүр <span>зардал биш</span></div>${comp.map(s => `<div class="ln"><span>${esc(SAVE_TYPES[s.type].n)}<span class="sub">${s.paid}/12</span></span><b>${fmt(s.monthly)}</b></div>`).join('')}</div>` : ''}
  <div class="box"><div class="sec">Цалингийн өдрөөс хойш <span>нэг удаагийн</span></div>
    ${since.map(h => `<div class="ln"><span>${esc(h.txt)}</span><b class="neg">${fmt(h.amt)}</b></div>`).join('') || '<p class="empty">Энэ сард нэг удаагийн зардал алга.</p>'}
    ${since.length ? `<div class="ln tot"><span>Нийт</span><b class="neg">${fmt(sum(since, h => h.amt))}</b></div>` : ''}</div>`;
}
ACT.expRepay = d => { const P = me(); snap('Зээл төлөх'); repayLoan(G, P, d.id, G.settings.emergencyUnit); save(); drawSheet(); render(); toast('1 сая₮ буцаалаа'); };

/* ---------- Зээл (all debts in one place: pay off, or take an emergency loan) ---------- */
ACT.openDebts = () => { FS = {}; openSheet(fDebts); };
function fDebtsOld() {
  const P = me(); const f = fin(P, G);
  const ds = P.debts.filter(d => d.bal > 0);
  const tot = sum(ds, d => d.bal);
  return `${head('Зээл')}
  <div class="svsum"><div><small>Нийт өр</small><b class="neg">${fmtS(tot)}</b></div><div><small>Сар бүр төлөх</small><b class="neg">${fmtS(f.loanPay)}</b></div><div><small>Зээлийн тоо</small><b>${ds.length}</b></div></div>
  ${ds.length ? ds.map(d => debtRow(P, d)).join('') : '<div class="box"><p class="empty">Өргүй байна.</p></div>'}
  <div class="box"><h4>Зээл авах</h4>${P.level === 1 ? `<div class="ln"><span>Банкны зээл<span class="sub">Жилийн ${G.settings.bankRate}% · сар бүр үндсэн төлөлт + хүү · ${fmtS(bankRoom(P, G))} хүртэл</span></span><button class="minibtn go" data-a="openLoan" data-bt="bankl" ${canAct(P) && bankRoom(P, G) > 0 ? '' : 'disabled'}>Авах</button></div>` : ''}
    <div class="ln"><span>${P.level === 1 ? 'Аппын зээл' : 'Барьцаат зээл'}<span class="sub">Сарын ${loanRate(P)}% · зөвхөн хүү · ${P.level === 1 ? 'хязгааргүй' : fmtS(loanRoom(P, G)) + ' хүртэл'}</span></span><button class="minibtn go" data-a="openLoan" data-bt="loan" ${canAct(P) && loanRoom(P, G) > 0 ? '' : 'disabled'}>Авах</button></div></div>`;
}
/* ============================================================
   Market (Зах зээл) and Level-2 risk (Их эрсдэл) cards
   ============================================================ */
function affected(spec, level) {
  const P = me();
  if (spec.who === 'self' || spec.who === 'me') return [P];
  if (G.mode === 'online') return [P];            // other phones apply it to themselves
  return G.players.filter(p => !p.out && (!level || p.level === level));
}
function matching(P, spec) { return P.assets.filter(a => matchAsset(a, spec)); }
function sellPrice(P, a, spec) {
  if (spec.t === 'sellx') return R(assetOp(P, a, { monthly: true }) * spec.mult);
  return R(a.price * spec.pct / 100);
}
function done(key) { FS.done = FS.done || {}; return FS.done[key]; }
function mark(key) { FS.done = FS.done || {}; FS.done[key] = true; }

function zParts(fx) {
  const a = [fx];
  if (fx.tags2) a.push(Object.assign({}, fx, { tags: fx.tags2, val: fx.val2, tags2: null }));
  return a;
}
function fMarket() {
  const c = CARD[FS.card]; const fx = c.fx;
  FS.autoTxt = FS.autoTxt || {}; zAuto();
  const parts = fx.kind ? zParts(fx) : fx.t === 'multi' ? fx.parts.map(p => Object.assign({ who: fx.who }, p)) : [fx];
  const body = parts.map((p, i) => fx.kind ? zPart(c, p, i) : marketPart(c, p, i)).join('');
  const none = fx.kind && !['stock', 'infl', 'rate_cut', 'tight'].includes(fx.kind) && affected(fx).every(P => !zList(P, fx).length && !(fx.tags2 && zList(P, { tags: fx.tags2 }).length));
  return `${head(FS.incoming ? 'Зах зээлийн мэдээ' : 'Зах зээл', FS.incoming ? `<span>${esc(FS.from || '')} сугаллаа</span>` : `<span>Зах зээл</span>›<b>№ ${c.no || c.id.split('-')[1]}</b>`)}${cardHTML(c)}
  <div class="pill" style="justify-self:start">${fx.who === 'all' ? 'Бүх тоглогчид нөлөөлнө' : 'Сугалсан хүнд'}</div>
  ${body}${none && !FS.incoming ? `<p class="mute" style="font-size:12px">Хэнд ч хамаарахгүй бол картыг хаяад дахин сугална (нэг ээлжид 3 хүртэл удаа).</p>` : ''}<div class="cta">${fx.kind === 'stock' && !FS.incoming && !done('price') ? `<button class="btn go" disabled>Эхлээд шинэ үнээ оруулна уу</button>` : `<button class="btn go" data-a="mDone">Дууслаа</button>`}</div>`;
}
ACT.mDone = () => {
  const c = CARD[FS.card];
  if (!FS.incoming && G.mode === 'online' && c.fx.who === 'all') { const sym = c.fx.kind === 'stock' && done('price') ? c.fx.tags[0] : null; NET.emit(Object.assign({ t: 'card', card: c.id }, sym ? { set: { [sym]: G.prices[sym] } } : {})); }
  if (!FS.done || !Object.keys(FS.done).length) log(G, me(), `${c.title}`, 0, c.id, 'market');
  save(); closeSheet();
};

function marketPart(c, s, pi) {
  const ps = affected(s);
  const who = P => ps.length > 1 ? `<div class="sec">${esc(P.name)}</div>` : '';
  const key = (P, x = '') => `${pi}:${P.id}:${x}`;
  switch (s.t) {
    case 'sell': case 'sellx': return ps.map(P => {
      const list = (s.cls ? P.assets.filter(a => a.kind === 'asset' && s.cls.includes(a.cls)) : matching(P, s));
      if (!list.length) return `<div class="box">${who(P)}<p class="empty">Тохирох хөрөнгө алга.</p></div>`;
      if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">Зарсан</p></div>`;
      return `<div class="box">${who(P)}${list.map(a => { const pr = sellPrice(P, a, s); const d = assetLoan(P, a); return `<div class="ln"><span>${esc(a.name)}<span class="sub">Авсан ${fmtS(a.price)}${d ? ' · зээл ' + fmtS(d.bal) : ''} → гарт ${fmtS(pr - (d ? d.bal : 0))}</span></span><button class="minibtn go" data-a="mSell" data-p="${P.id}" data-id="${a.id}" data-v="${pr}" data-k="${key(P)}" ${a.blocked ? 'disabled' : ''}>${fmtS(pr)}</button></div>`; }).join('')}
        <p class="mute" style="font-size:12px;margin-top:6px">Зарахгүй бол «Дууслаа» дарна.</p></div>`;
    }).join('');
    case 'mod': {
      return ps.map(P => {
        let list = matching(P, s);
        if (!list.length) return `<div class="box">${who(P)}<p class="empty">Танд хамаарах хөрөнгө алга.</p></div>`;
        if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">Хэрэгжсэн · ${list.length} хөрөнгө</p></div>`;
        const ins = s.insured !== undefined;
        const pct = ins && P.flags.agroIns ? s.insured : s.pct;
        const dur = s.next ? `дараагийн ${s.next > 1 ? s.next + ' ' : ''}орлого орох өдөр` : `дараагийн ${s.paydays} цалингийн өдөр`;
        return `<div class="box">${who(P)}
          ${s.pick ? `<p class="mute" style="font-size:12px">Нэгийг сонгоно:</p>` : ''}
          ${list.map(a => { const op = assetOp(P, a, { monthly: true }); const base = s.base === 'inc' ? R(a.inc * (a.share || 1)) : op; const dlt = R(base * pct / 100);
            return `<div class="ln"><span>${esc(a.name)}<span class="sub">${s.base === 'inc' ? 'Түрээс' : 'Ашиг'} ${fmtS(base)} → ${fmtS(base + dlt)} · ${dur}</span></span>${s.pick ? `<button class="minibtn go" data-a="mMod" data-p="${P.id}" data-id="${a.id}" data-pi="${pi}" data-pct="${pct}" data-k="${key(P)}">Сонгох</button>` : `<b class="${dlt >= 0 ? 'pos' : 'neg'}">${fmt(dlt, { sign: true })}</b>`}</div>`; }).join('')}
          ${ins ? `<div class="switch"><span>Мал, тариалангийн даатгалтай<small>Даатгалтай бол ${s.insured}%</small></span><button class="tog" data-a="mIns" data-p="${P.id}" aria-pressed="${!!P.flags.agroIns}" aria-label="Даатгал"></button></div>` : ''}
          ${s.pick ? '' : `<div class="row" style="margin-top:8px"><button class="minibtn go" data-a="mModAll" data-p="${P.id}" data-pi="${pi}" data-pct="${pct}" data-k="${key(P)}">Хэрэгжүүлэх</button></div>`}</div>`;
      }).join('');
    }
    case 'per': return ps.map(P => {
      const list = matching(P, s);
      if (!list.length) return `<div class="box">${who(P)}<p class="empty">Танд хамаарах хөрөнгө алга.</p></div>`;
      const amt = list.reduce((t, a) => t + (s.amtTB !== undefined ? (a.deck === 'TB' ? s.amtTB : s.amtJB) : s.amt), 0);
      if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">${fmt(amt, { sign: true })} тооцогдсон</p></div>`;
      return `<div class="box">${who(P)}${list.map(a => `<div class="ln"><span>${esc(a.name)}</span><b class="${(s.amtTB !== undefined ? 1 : s.amt) >= 0 ? 'pos' : 'neg'}">${fmt(s.amtTB !== undefined ? (a.deck === 'TB' ? s.amtTB : s.amtJB) : s.amt, { sign: true })}</b></div>`).join('')}
        <div class="row" style="margin-top:8px"><button class="minibtn go" data-a="mCash" data-p="${P.id}" data-v="${amt}" data-k="${key(P)}">${fmt(amt, { sign: true })}</button></div></div>`;
    }).join('');
    case 'payif': case 'block': return ps.map(P => {
      const list = matching(P, s);
      if (!list.length) return `<div class="box">${who(P)}<p class="empty">Танд хамаарах хөрөнгө алга — төлөхгүй.</p></div>`;
      if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">Тооцогдсон</p></div>`;
      return `<div class="box">${who(P)}<p class="mute" style="font-size:12px">Нэгийг сонгоно:</p>${list.map(a => `<div class="ln"><span>${esc(a.name)}</span><button class="minibtn go" data-a="${s.t === 'block' ? 'mBlock' : 'mPayIf'}" data-p="${P.id}" data-id="${a.id}" data-pi="${pi}" data-k="${key(P)}">Сонгох</button></div>`).join('')}
        ${shortfall(P, s.amt)}</div>`;
    }).join('');
    case 'price': {
      const syms = Object.keys(s.set);
      return `<div class="box"><h4>Шинэ үнэ</h4>${syms.map(k => `<div class="ln"><span>${esc(STOCK[k].name)}</span><b>${fmt(s.set[k])} / ${STOCK[k].unit}</b></div>`).join('')}
        ${done('price') ? '' : `<div class="row" style="margin-top:8px"><button class="minibtn go" data-a="mPrice" data-pi="${pi}">Үнийг шинэчлэх</button></div>`}</div>` +
        (done('price') ? ps.map(P => {
          const hs = P.assets.filter(a => a.kind === 'units' && syms.includes(a.sym));
          return `<div class="box">${who(P) || `<div class="sec">Таны эзэмшил</div>`}${hs.map(a => `<div class="ln"><span>${esc(a.name)} · ${a.qty.toLocaleString('en')} ${STOCK[a.sym].unit}<span class="sub">Дундаж ${fmt(a.unitCost)} → ${fmt(s.set[a.sym])} · ${fmt((s.set[a.sym] - a.unitCost) * a.qty, { sign: true })}</span></span><button class="minibtn go" data-a="mSellUnits" data-p="${P.id}" data-id="${a.id}" data-v="${s.set[a.sym]}">Бүгдийг зарах</button></div>`).join('') || '<p class="empty">Эзэмшилгүй</p>'}
            ${s.buy ? syms.map(k => `<div class="row" style="margin-top:8px"><button class="minibtn" data-a="mBuyUnits" data-p="${P.id}" data-sym="${k}" data-v="${s.set[k]}">${esc(STOCK[k].name)} энэ үнээр авах</button></div>`).join('') : ''}</div>`;
        }).join('') : '');
    }
    case 'dividend': return ps.map(P => {
      const qty = sum(P.assets.filter(a => a.kind === 'units' && a.sym === s.sym), a => a.qty);
      const amt = R(qty * s.per / 1);
      const per1000 = s.per * 1000;
      if (!qty) return `<div class="box">${who(P)}<p class="empty">${esc(STOCK[s.sym].name)} хувьцаагүй.</p></div>`;
      const total = R(Math.floor(qty / 1000) * per1000 + (qty % 1000) * s.per);
      if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">${fmt(total, { sign: true })} авсан</p></div>`;
      return `<div class="box">${who(P)}<div class="ln"><span>${qty.toLocaleString('en')} ширхэг × ${fmt(s.per)}</span><button class="minibtn go" data-a="mCash" data-p="${P.id}" data-v="${total}" data-k="${key(P)}">${fmt(total, { sign: true })}</button></div></div>`;
    }).join('');
    case 'refi': return ps.map(P => {
      const ds = P.debts.filter(d => d.kind === 'card' && d.bal > 0 && P.assets.some(a => a.loanId === d.id && a.deck === 'TB'));
      if (!ds.length) return `<div class="box">${who(P)}<p class="empty">Том боломжийн зээлгүй байна.</p></div>`;
      if (done(key(P))) return `<div class="box">${who(P)}<p class="pos" style="font-weight:800">Хүү буурлаа</p></div>`;
      return `<div class="box">${who(P)}${ds.map(d => { const np = refiPay(d, d.rate - s.cut); return `<div class="ln"><span>${esc(d.l)}<span class="sub">${d.rate}% → ${d.rate - s.cut}% · сарын төлбөр ${fmt(d.pay)} → ${fmt(np)}</span></span><button class="minibtn go" data-a="mRefi" data-p="${P.id}" data-id="${d.id}" data-pi="${pi}" data-k="${key(P)}" ${P.cash >= s.cost ? '' : 'disabled'}>${fmt(s.cost)} төлөх</button></div>`; }).join('')}</div>`;
    }).join('');
    case 'cond': return done('cond') ? `<div class="box"><p class="pos" style="font-weight:800">Нөхцөл идэвхжлээ</p></div>` : `<div class="box"><p>${s.key === 'downUp' ? `Дараагийн ${s.paydays} цалингийн өдөр зээлээр авахад урьдчилгаа +${s.pct}%.` : 'Энэ ээлжид авах Том боломжийн зээлийн хүүг 2 нэгжээр бууруулж болно.'}</p><div class="row" style="margin-top:8px"><button class="minibtn go" data-a="mCond" data-pi="${pi}">Идэвхжүүлэх</button></div></div>`;
    case 'pay': return ps.map(P => done(key(P)) ? `<div class="box">${who(P)}<p class="pos" style="font-weight:800">Төлсөн</p></div>` : `<div class="box">${who(P)}<div class="ln"><span>Нэг удаа төлнө</span><button class="minibtn go" data-a="mCash" data-p="${P.id}" data-v="${-s.amt}" data-k="${key(P)}">${fmt(s.amt)} төлөх</button></div></div>`).join('');
    case 'discount': return ps.map(P => {
      const f = fin(P, G); const ok = P.cash >= f.expenses * s.reserveMonths;
      return `<div class="box">${who(P)}<div class="alert ${ok ? 'ok' : 'neg'}">${ic(ok ? 'seal-check' : 'warning-circle')}<span><b>${ok ? 'Нөөцтэй байна' : 'Нөөц хүрэлцэхгүй'}</b>${s.reserveMonths} сарын зардал ${fmtS(f.expenses * s.reserveMonths)} · бэлэн ${fmtS(P.cash)}${ok ? `<span class="row"><button class="minibtn go" data-a="mDiscount" data-pct="${s.pct}">Жижиг боломж ${s.pct}% хямд</button></span>` : ''}</span></div></div>`;
    }).join('');
  }
  return '';
}
/* ---- studio market cards: {kind, tags, val, n, who, one} ---- */
function zMatch(a, tags) {
  if (!tags || !tags.length) return false;
  const tg = a.tags || [];
  return tags.some(t => tg.includes(t) || (ALIAS[t] || []).some(x => tg.includes(x)));
}
function zList(P, s) {
  if (s.kind === 'refi') return P.debts.filter(d => d.kind === 'card' && d.bal > 0 && P.assets.some(a => a.loanId === d.id && a.deck === 'TB'));
  if (s.kind === 'div' || s.kind === 'stock') return P.assets.filter(a => a.kind === 'units' && a.sym === (s.tags || [])[0]);
  return P.assets.filter(a => (a.kind === 'asset' || a.kind === 'venture') && a.cls !== 'home' && zMatch(a, s.tags));
}
function seasonOp(P, a, base) {
  // one season's (year's) profit before loan, for seasonal assets (R10); card figures are monthly averages
  const per = base === 'inc' ? R((a.inc || 0) * (a.share || 1)) : assetOp(P, a, { monthly: true, stable: true });
  return R(per * 12);
}
const isSea = a => !!(a.sea && a.sea.length) || seasonal(a);
function zEffect(P, a, s) {
  let v = s.val;
  if (v < 0 && P.flags.agroIns && insurable(a)) v = v / 2;    // insured livestock / crops lose half (R11)
  return v;
}
function zPart(c, s, pi) {
  const ps = affected(s);
  const who = P => ps.length > 1 ? `<div class="sec">${esc(P.name)}</div>` : '';
  const key = (P, x = '') => `${pi}:${P.id}:${x}`;
  const ok = (P, t) => `<div class="box">${who(P)}<p class="${/(^|· )[−-]/.test(t) ? 'neg' : 'pos'}" style="font-weight:800">${t}</p></div>`;
  const empty = (P, t) => `<div class="box">${who(P)}<p class="empty">${t || 'Танд хамаарах хөрөнгө алга.'}</p></div>`;
  const base = s.kind === 'temp_inc' ? 'inc' : 'op';
  switch (s.kind) {
    case 'temp_inc': case 'temp': return ps.map(P => {
      const list = zList(P, s);
      if (!list.length) return empty(P);
      if (done(key(P))) return ok(P, FS.autoTxt[key(P)] || 'Хэрэгжсэн');
      return `<div class="box">${who(P)}<p class="mute" style="font-size:12px">${s.one ? 'Нэг хөрөнгөө сонгоно:' : ''}</p>
        ${list.map(a => { const v = zEffect(P, a, s); const sea = isSea(a);
          const b = sea ? seasonOp(P, a, base) : base === 'inc' ? R((a.inc || 0) * (a.share || 1)) : assetOp(P, a, { monthly: true });
          const dl = R(b * v);
          return `<div class="ln"><span>${esc(a.name)}<span class="sub">${sea ? `Улирлын ${base === 'inc' ? 'орлого' : 'ашиг'} ${fmtS(b)} → нэг удаа бэлнээр` : `${base === 'inc' ? 'Түрээс' : 'Ашиг'} ${fmtS(b)} → ${fmtS(b + dl)} · ${s.n} цалингийн өдөр`}${v !== s.val ? ' · даатгалтай' : ''}</span></span><button class="minibtn go" data-a="zMod" data-p="${P.id}" data-id="${a.id}" data-pi="${pi}" data-k="${key(P)}">${fmt(dl, { sign: true })}</button></div>`; }).join('')}
        ${list.some(insurable) && s.val < 0 ? `<div class="switch"><span>Мал, тариалангийн даатгалтай<small>Хохирол хагас. Сар бүр ашгийн ${G.settings.insPct}%.</small></span><button class="tog" data-a="mIns" data-p="${P.id}" aria-pressed="${!!P.flags.agroIns}" aria-label="Даатгал"></button></div>` : ''}</div>`;
    }).join('');
    case 'buy': return ps.map(P => {
      const list = zList(P, s);
      if (!list.length) return empty(P);
      if (done(key(P))) return ok(P, 'Зарсан');
      return `<div class="box">${who(P)}${list.map(a => { const pr = R(a.price * s.val); const d = assetLoan(P, a); return `<div class="ln"><span>${esc(a.name)}<span class="sub">Авсан ${fmtS(a.price)} × ${Math.round(s.val * 100)}%${d ? ' · зээл ' + fmtS(d.bal) : ''} → гарт ${fmtS(pr - (d ? d.bal : 0))}</span></span><button class="minibtn go" data-a="mSell" data-p="${P.id}" data-id="${a.id}" data-v="${pr}" data-k="${key(P)}" ${a.blocked ? 'disabled' : ''}>${fmtS(pr)}</button></div>`; }).join('')}
        <p class="mute" style="font-size:12px;margin-top:6px">Зарахгүй бол «Дууслаа». Өөр тоглогчид ч санал болгож болно.</p></div>`;
    }).join('');
    case 'cash': return ps.map(P => {
      const list = zList(P, s);
      if (!list.length) return empty(P, s.val < 0 ? 'Хамаарах хөрөнгө алга — төлөхгүй.' : null);
      if (done(key(P))) return ok(P, FS.autoTxt[key(P)] || 'Тооцогдсон');
      return `<div class="box">${who(P)}<p class="mute" style="font-size:12px">Нэг хөрөнгөө сонгоно:</p>${list.map(a => `<div class="ln"><span>${esc(a.name)}</span><button class="minibtn go" data-a="mCash" data-p="${P.id}" data-v="${s.val}" data-k="${key(P)}">${fmt(s.val, { sign: true })}</button></div>`).join('')}${s.val < 0 ? shortfall(P, -s.val) : ''}</div>`;
    }).join('');
    case 'stock': {
      const sym = s.tags[0]; const S = STOCK[sym];
      const px = FS.zpx || 0;
      const head2 = done('price') ? `<div class="box"><h4>Шинэ үнэ</h4><div class="ln"><span>${esc(S.name)}</span><b>${fmt(G.prices[sym])} / ${S.unit}</b></div></div>`
        : `<div class="box"><h4>Шинэ үнэ <span>картан дээрх үнийг бичнэ</span></h4>
          <div class="mlist"><label class="mrow ${px ? 'has' : ''}"><span class="ml">${esc(S.name)} · 1 ${S.unit}</span><input id="zpx" inputmode="numeric" placeholder="Үнэ" value="${px ? px.toLocaleString('en') : ''}" data-in="zpxIn"></label></div>
          <div class="row" style="margin-top:8px"><button class="minibtn go" data-a="zPrice" data-pi="${pi}" ${px > 0 ? '' : 'disabled'}>Үнийг шинэчлэх</button></div></div>`;
      if (!done('price')) return head2;
      const pv = G.prices[sym];
      return head2 + ps.map(P => {
        const hs = zList(P, s);
        return `<div class="box">${who(P) || `<div class="sec">Таны эзэмшил</div>`}${hs.map(a => `<div class="ln"><span>${esc(a.name)} · ${a.qty.toLocaleString('en')} ${S.unit}<span class="sub">Дундаж ${fmt(a.unitCost)} → ${fmt(pv)} · ${fmt((pv - a.unitCost) * a.qty, { sign: true })}</span></span><button class="minibtn go" data-a="mSellUnits" data-p="${P.id}" data-id="${a.id}" data-v="${pv}">Бүгдийг зарах</button></div>`).join('') || '<p class="empty">Эзэмшилгүй</p>'}
          ${s.buy && !FS.incoming && P.id === me().id ? `<div class="row" style="margin-top:8px"><button class="minibtn" data-a="mBuyUnits" data-p="${P.id}" data-sym="${sym}" data-v="${pv}">Энэ үнээр ${fmtS(G.settings.unitsCap)} хүртэл авах</button></div>` : ''}</div>`;
      }).join('');
    }
    case 'div': return ps.map(P => {
      const qty = sum(zList(P, s), a => a.qty);
      if (!qty) return empty(P, `${esc(STOCK[s.tags[0]].name)} хувьцаагүй.`);
      const total = R(qty * s.val);
      if (done(key(P))) return ok(P, `${fmt(total, { sign: true })} авсан`);
      return `<div class="box">${who(P)}<div class="ln"><span>${qty.toLocaleString('en')} ширхэг × ${fmt(s.val)}</span><button class="minibtn go" data-a="mCash" data-p="${P.id}" data-v="${total}" data-k="${key(P)}">${fmt(total, { sign: true })}</button></div></div>`;
    }).join('');
    case 'infl': return ps.map(P => {
      const add = R((P.liv0 || fin(P, G).living) * s.val);
      if (done(key(P))) return ok(P, `Зардал +${fmt(add)}/сар`);
      return `<div class="box">${who(P)}<div class="ln"><span>Амьжиргааны зардал байнга<span class="sub">Эхлэх дүнгийн ${Math.round(s.val * 100)}%</span></span><button class="minibtn go" data-a="zInfl" data-p="${P.id}" data-pi="${pi}" data-k="${key(P)}">+${fmt(add)}/сар</button></div></div>`;
    }).join('');
    case 'rate_cut': case 'tight': return done('cond') ? `<div class="box"><p class="pos" style="font-weight:800">Нөхцөл идэвхжлээ</p></div>` : `<div class="box"><p>${s.kind === 'tight' ? `Дараагийн ${s.n} цалингийн өдөр зээлээр авахад урьдчилгаа үнийн +${Math.round(s.val * 100)} нэгж хувь.` : `Дараагийн ${s.n} цалингийн өдөр зээлээр авах Том боломжийн жилийн хүү ${Math.round(-s.val * 100)} нэгж хувиар бага.`}</p><div class="row" style="margin-top:8px"><button class="minibtn go" data-a="zCond" data-pi="${pi}">Идэвхжүүлэх</button></div></div>`;
    case 'refi': return ps.map(P => {
      const ds = zList(P, s).filter(d => !d.refi);
      if (!ds.length) return empty(P, 'Хүү бууруулаагүй Том боломжийн зээлгүй байна.');
      if (done(key(P))) return ok(P, 'Хүү буурлаа');
      const cut = Math.round(-s.val * 100);
      return `<div class="box">${who(P)}${ds.map(d => { const np = refiPay(d, d.rate - cut); return `<div class="ln"><span>${esc(d.l)}<span class="sub">${d.rate}% → ${d.rate - cut}% · сарын төлбөр ${fmt(d.pay)} → ${fmt(np)}</span></span><button class="minibtn go" data-a="zRefi" data-p="${P.id}" data-id="${d.id}" data-pi="${pi}" data-k="${key(P)}" ${P.cash >= s.cost ? '' : 'disabled'}>${fmt(s.cost)} төлөх</button></div>`; }).join('')}</div>`;
    }).join('');
  }
  return '';
}
function zSpec(pi) { return zParts(CARD[FS.card].fx)[pi]; }
// apply a ±% card to one asset (used by the auto pass and by a manual pick)
function zApplyMod(P, a, s, c) {
  const v = zEffect(P, a, s); const base = s.kind === 'temp_inc' ? 'inc' : 'op';
  if (isSea(a)) {
    const dl = R(seasonOp(P, a, base) * v);
    if (dl >= 0) gain(G, P, dl, `${c.title} · ${a.name}`, c.id, 'market'); else pay(G, P, -dl, `${c.title} · ${a.name}`, c.id, 'market');
    return `${esc(a.name)} · ${fmt(dl, { sign: true })}`;
  }
  P.mods.push({ id: uid('m'), asset: a.id, base, pct: v * 100, paydays: s.n || 1, card: c.id });
  log(G, P, `${c.title}: ${a.name} ${v > 0 ? '+' : ''}${Math.round(v * 100)}% · ${s.n} цалингийн өдөр`, 0, c.id, 'market');
  return `${esc(a.name)} · ${v > 0 ? '+' : ''}${Math.round(v * 100)}% · ${s.n || 1} цалингийн өдөр`;
}
/* Market cards apply themselves (user 2026-10-15): everything except a stock/gold price (typed by hand)
   and real decisions (sell offers, paid refinancing). A "1 asset" card picks the asset that helps the player most. */
function zAuto() {
  if (FS.autoDone) return; FS.autoDone = true;
  const c = CARD[FS.card]; const fx = c.fx; if (!fx.kind) return;
  const parts = zParts(fx); let any = false;
  const todo = [];
  parts.forEach((s, pi) => affected(s).forEach(P => {
    const k = `${pi}:${P.id}:`;
    if (s.kind === 'temp' || s.kind === 'temp_inc') {
      const list = zList(P, s); if (!list.length) return;
      const base = s.kind === 'temp_inc' ? 'inc' : 'op';
      const eff = a => { const b = isSea(a) ? seasonOp(P, a, base) : base === 'inc' ? R((a.inc || 0) * (a.share || 1)) : assetOp(P, a, { monthly: true }); return b * zEffect(P, a, s); };
      const pick = s.one ? [list.slice().sort((x, y) => eff(y) - eff(x))[0]] : list;
      todo.push(() => { FS.autoTxt[k] = pick.map(a => zApplyMod(P, a, s, c)).join('<br>'); mark(k); });
    } else if (s.kind === 'cash') {
      if (!zList(P, s).length) return;
      todo.push(() => { if (s.val >= 0) gain(G, P, s.val, c.title, c.id, 'market'); else pay(G, P, -s.val, c.title, c.id, 'market'); FS.autoTxt[k] = fmt(s.val, { sign: true }); mark(k); });
    } else if (s.kind === 'div') {
      const qty = sum(zList(P, s), a => a.qty); if (!qty) return;
      const total = R(qty * s.val);
      todo.push(() => { gain(G, P, total, c.title, c.id, 'market'); FS.autoTxt[k] = `${fmt(total, { sign: true })} авлаа`; mark(k); });
    } else if (s.kind === 'infl') {
      todo.push(() => { const add = R((P.liv0 || fin(P, G).living) * s.val); inflate(G, P, s.val * 100, c.title); FS.autoTxt[k] = `Зардал +${fmt(add)}/сар`; mark(k); });
    }
  }));
  parts.forEach((s, pi) => { if ((s.kind === 'rate_cut' || s.kind === 'tight') && !done('cond')) todo.push(() => {
    if (s.kind === 'tight') G.conds.push({ id: uid('c'), key: 'downUp', pct: Math.round(s.val * 100), paydays: s.n, owner: me().id, card: FS.card, txt: `Зээлээр хөрөнгө авбал урьдчилгаа +${Math.round(s.val * 100)} нэгж хувь · ${s.n} цалингийн өдөр` });
    else G.conds.push({ id: uid('c'), key: 'rateCut', cut: Math.round(-s.val * 100), paydays: s.n, owner: me().id, card: FS.card, txt: `Том боломжийн зээлийн хүү −${Math.round(-s.val * 100)} нэгж · ${s.n} цалингийн өдөр` });
    mark('cond'); }); });
  if (!todo.length) return;
  snap('Зах зээл · ' + c.title); FS.autoTxt = FS.autoTxt || {};
  todo.forEach(f => f()); save();
}
ACT.zMod = d => {
  const P = PL(d.p); const s = zSpec(+d.pi); const a = P.assets.find(x => x.id === d.id); const c = CARD[FS.card];
  snap('Зах зээл');
  FS.autoTxt[d.k] = zApplyMod(P, a, s, c);
  mark(d.k); save(); drawSheet();
};
ACT.zpxIn = (d, el) => { FS.zpx = parseAmt(el.value); clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const n = $('#zpx'); if (n) { n.focus(); const v = n.value.length; n.setSelectionRange(v, v); } }, 500); };
ACT.zPrice = d => { const s = zSpec(+d.pi); if (!(FS.zpx > 0)) return; snap('Үнэ'); G.prices[s.tags[0]] = FS.zpx; mark('price'); if (!FS.incoming) log(G, me(), CARD[FS.card].title, 0, FS.card, 'market'); save(); drawSheet(); };
ACT.zInfl = d => { const P = PL(d.p); const s = zSpec(+d.pi); snap('Инфляц'); inflate(G, P, s.val * 100, CARD[FS.card].title); mark(d.k); save(); drawSheet(); };
ACT.zCond = d => {
  const s = zSpec(+d.pi); snap('Нөхцөл');
  if (s.kind === 'tight') G.conds.push({ id: uid('c'), key: 'downUp', pct: Math.round(s.val * 100), paydays: s.n, owner: me().id, card: FS.card, txt: `Зээлээр хөрөнгө авбал урьдчилгаа +${Math.round(s.val * 100)} нэгж хувь · ${s.n} цалингийн өдөр` });
  else G.conds.push({ id: uid('c'), key: 'rateCut', cut: Math.round(-s.val * 100), paydays: s.n, owner: me().id, card: FS.card, txt: `Том боломжийн зээлийн хүү −${Math.round(-s.val * 100)} нэгж · ${s.n} цалингийн өдөр` });
  mark('cond'); save(); drawSheet();
};
ACT.zRefi = d => { const P = PL(d.p); const s = zSpec(+d.pi); const debt = P.debts.find(x => x.id === d.id); const cut = Math.round(-s.val * 100); snap('Хүү бууруулах'); debt.pay = refiPay(debt, debt.rate - cut); debt.rate -= cut; debt.refi = true; pay(G, P, s.cost, `${CARD[FS.card].title} · ${debt.l}`, FS.card, 'market'); mark(d.k); save(); drawSheet(); };

function refiPay(d, rate) {
  // keep the remaining term, recompute the equal payment
  const r0 = d.rate / 100 / 12;
  let n = r0 ? Math.ceil(-Math.log(1 - r0 * d.bal / d.pay) / Math.log(1 + r0)) : Math.ceil(d.bal / d.pay);
  if (!isFinite(n) || n <= 0) n = 120;
  return annuity(d.bal, Math.max(0, rate), n);
}
const PL = id => G.players.find(p => p.id === id);
ACT.mSell = d => { const P = PL(d.p); snap('Зарах'); sellAsset(G, P, d.id, +d.v, CARD[FS.card].id); mark(d.k); save(); drawSheet(); };
ACT.mIns = d => { const P = PL(d.p); P.flags.agroIns = !P.flags.agroIns; save(); drawSheet(); };
ACT.mMod = d => { const P = PL(d.p); const s = partSpec(+d.pi); const a = P.assets.find(x => x.id === d.id); snap('Зах зээл'); addMod(P, a, s, CARD[FS.card], +d.pct); log(G, P, `${CARD[FS.card].title}: ${a.name} ${+d.pct > 0 ? '+' : ''}${d.pct}%`, 0, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mModAll = d => { const P = PL(d.p); const s = partSpec(+d.pi); snap('Зах зээл'); const list = matching(P, s); list.forEach(a => addMod(P, a, s, CARD[FS.card], +d.pct)); log(G, P, `${CARD[FS.card].title}: ${list.length} хөрөнгө ${+d.pct > 0 ? '+' : ''}${d.pct}%`, 0, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mCash = d => { const P = PL(d.p); snap('Зах зээл'); const v = +d.v; if (v >= 0) gain(G, P, v, CARD[FS.card].title, FS.card, 'market'); else pay(G, P, -v, CARD[FS.card].title, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mPayIf = d => { const P = PL(d.p); const s = partSpec(+d.pi); const a = P.assets.find(x => x.id === d.id); snap('Зах зээл'); pay(G, P, s.amt, `${CARD[FS.card].title} · ${a.name}`, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mBlock = d => { const P = PL(d.p); const s = partSpec(+d.pi); const a = P.assets.find(x => x.id === d.id); snap('Зах зээл'); a.blocked = s.paydays; pay(G, P, s.amt, `${CARD[FS.card].title} · хуулийн зардал`, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mPrice = d => { const s = partSpec(+d.pi); snap('Үнэ'); Object.assign(G.prices, s.set); mark('price'); if (!FS.incoming) log(G, me(), `${CARD[FS.card].title}`, 0, FS.card, 'market'); save(); drawSheet(); };
ACT.mSellUnits = d => { const P = PL(d.p); const a = P.assets.find(x => x.id === d.id); snap('Зарах'); sellUnits(G, P, a.id, a.qty, +d.v); save(); drawSheet(); };
ACT.mBuyUnits = d => { FS.buySym = d.sym; FS.buyPrice = +d.v; FS.buyFor = d.p; FS.qty = 0; FS.back = UI.sheetFn; drawSheet2(fBuyAtPrice); };
function fBuyAtPrice() {
  const P = PL(FS.buyFor); const S = STOCK[FS.buySym]; const price = FS.buyPrice; const max = unitsMax(G, P, FS.buySym, price); const qty = FS.qty || 0;
  return `${head(`${esc(S.name)} авах`)}<div class="box" style="display:grid;gap:10px"><div class="ln"><span>1 ${S.unit}</span><b>${fmt(price)}</b></div>
    <div class="stepper"><button data-a="qty" data-d="-100" aria-label="Хасах">−</button><input id="qtyIn" inputmode="numeric" value="${qty}" data-in="qtyIn" aria-label="Тоо"><button data-a="qty" data-d="100" aria-label="Нэмэх">+</button></div>
    <div class="quick"><button class="chip" data-a="qtySet" data-n="${max}">Хамгийн их ${max.toLocaleString('en')}</button></div>${afterBox(P, -qty * price, 0)}</div>
    <div class="cta"><button class="btn" data-a="buyBack">Буцах</button><button class="btn go" data-a="buyAtOk" ${qty > 0 && qty <= max ? '' : 'disabled'}>Авах</button></div>`;
}
ACT.buyBack = () => drawSheet2(FS.back || fMarket);
ACT.buyAtOk = () => { const P = PL(FS.buyFor); snap('Авах'); buyUnits(G, P, FS.buySym, FS.qty, FS.buyPrice, CARD[FS.card]); save(); drawSheet2(FS.back || fMarket); };
ACT.mRefi = d => { const P = PL(d.p); const s = partSpec(+d.pi); const debt = P.debts.find(x => x.id === d.id); snap('Хүү бууруулах'); const np = refiPay(debt, debt.rate - s.cut); debt.rate -= s.cut; debt.pay = np; pay(G, P, s.cost, `${CARD[FS.card].title} · ${debt.l}`, FS.card, 'market'); mark(d.k); save(); drawSheet(); };
ACT.mCond = d => { const s = partSpec(+d.pi); snap('Нөхцөл'); G.conds.push({ id: uid('c'), key: s.key, pct: s.pct, cut: s.cut, paydays: s.paydays, turns: s.turns, owner: me().id, card: FS.card, txt: s.key === 'downUp' ? `Зээлээр хөрөнгө авбал урьдчилгаа +${s.pct}% · ${s.paydays} цалингийн өдөр` : 'Том боломжийн зээлийн хүү −2% · энэ ээлжид' }); mark('cond'); save(); drawSheet(); };
ACT.mDiscount = d => { const pct = +d.pct; FS = { deck: 'JB', discount: pct }; drawSheet2(fPickDiscount); };
function fPickDiscount() { return fPick().replace(/data-a="pickCard"/g, 'data-a="pickCardDisc"').replace('data-a="drawRandom"', 'data-a="drawRandomDisc"'); }
ACT.pickCardDisc = d => { const disc = FS.discount; startCard(d.id, { discount: disc }); };
ACT.drawRandomDisc = () => { const disc = FS.discount; ACT.drawRandom(); FS.discount = disc; drawSheet(); };
function partSpec(pi) { const fx = CARD[FS.card].fx; return fx.t === 'multi' ? Object.assign({ who: fx.who }, fx.parts[pi]) : fx; }

/* ---------- Level 2 risk ---------- */
function fRisk() {
  const c = CARD[FS.card]; const s = c.fx;
  const P = me();
  const l2 = G.mode === 'online' ? [P] : G.players.filter(p => !p.out && p.level === 2);
  const selfOnly = ['payLargest', 'bribe', 'pay', 'lifestyle', 'dice'].includes(s.t);
  const ps = selfOnly ? [P] : l2;
  const who = Q => ps.length > 1 ? `<div class="sec">${esc(Q.name)}</div>` : '';
  const k = Q => `r:${Q.id}`;
  const ventures = (Q, spec) => Q.assets.filter(a => a.kind === 'venture' && (spec.all || (spec.tagsAny || []).some(t => (a.tags || []).includes(t))));
  let body = ps.map(Q => {
    if (done(k(Q))) return `<div class="box">${who(Q)}<p class="pos" style="font-weight:800">Тооцогдсон</p></div>`;
    switch (s.t) {
      case 'mod': case 'perm': {
        const list = ventures(Q, s);
        if (!list.length) return `<div class="box">${who(Q)}<p class="empty">Хамаарах хувь эзэмшээгүй.</p></div>`;
        const reserveOk = s.reserveYears && Q.cash >= fin(Q, G).expenses * 12 * s.reserveYears;
        return `<div class="box">${who(Q)}${list.map(a => `<div class="ln"><span>${esc(a.name)}<span class="sub">${s.t === 'perm' ? 'Байнга' : 'Дараагийн Жилийн орлогод'}</span></span><b class="neg">${s.pct}%</b></div>`).join('')}
          ${reserveOk ? `<div class="alert ok">${ic('seal-check')}<span>1 жилийн зардлын нөөцтэй тул хохирохгүй.</span></div>` : ''}
          <div class="row" style="margin-top:8px"><button class="minibtn go" data-a="rApply" data-p="${Q.id}" data-safe="${reserveOk ? 1 : 0}">Хэрэгжүүлэх</button></div></div>`;
      }
      case 'fx': {
        const ex = ventures(Q, s);
        const bonus = sum(ex, a => a.profit) * s.bonusMonths;
        return `<div class="box">${who(Q)}${ex.length ? `<div class="ln"><span>Экспортын картууд нэг удаа +1 сарын ашиг</span><b class="pos">${fmt(bonus, { sign: true })}</b></div>` : `<div class="ln"><span>Экспортын карт алга: зардал байнга +${s.elseExpPct}%</span><b class="neg">+${s.elseExpPct}%</b></div>`}
          <div class="row" style="margin-top:8px"><button class="minibtn go" data-a="rApply" data-p="${Q.id}">Хэрэгжүүлэх</button></div></div>`;
      }
      case 'per': {
        const list = ventures(Q, s);
        if (!list.length) return `<div class="box">${who(Q)}<p class="empty">Хамаарах карт алга.</p></div>`;
        return `<div class="box">${who(Q)}<div class="ln"><span>${list.length} карт × ${fmtS(-s.amt)}</span><button class="minibtn go" data-a="rApply" data-p="${Q.id}">${fmtS(s.amt * list.length)}</button></div></div>`;
      }
      case 'payLargest': {
        const big = Q.assets.filter(a => a.kind === 'venture').sort((a, b) => b.invest - a.invest)[0];
        const amt = big ? R(big.invest * s.pct / 100) : 0;
        return `<div class="box">${who(Q)}<div class="ln"><span>${big ? esc(big.name) : 'Хөрөнгө оруулалтгүй'}<span class="sub">${s.pct}%</span></span><button class="minibtn go" data-a="rApply" data-p="${Q.id}" ${amt ? '' : 'disabled'}>${fmtS(amt)} төлөх</button></div></div>`;
      }
      case 'orpay': case 'orperm': {
        const list = ventures(Q, s);
        if (!list.length) return `<div class="box">${who(Q)}<p class="empty">Хамаарах карт алга.</p></div>`;
        const lose = s.t === 'orpay' ? sum(list, a => a.profit) * s.loseMonths : 0;
        return `<div class="box">${who(Q)}<div class="chips"><button class="minibtn" data-a="rApply" data-p="${Q.id}" data-opt="a">${s.t === 'orpay' ? `1 сарын ашиг алдах (${fmtS(lose)})` : `Ашиг байнга ${s.pct}%`}</button><button class="minibtn go" data-a="rApply" data-p="${Q.id}" data-opt="b" ${Q.cash >= s.pay ? '' : 'disabled'}>${fmtS(s.pay)}-өөр ${s.t === 'orpay' ? 'хамгаалалт' : 'сургалт'}</button></div></div>`;
      }
      case 'startup': {
        const list = Q.assets.filter(a => a.kind === 'venture' && (a.tags || []).includes('startup'));
        if (!list.length) return `<div class="box">${who(Q)}<p class="empty">Стартапын хувьгүй.</p></div>`;
        return `<div class="box">${who(Q)}${list.map(a => `<div class="ln"><span>${esc(a.name)}<span class="sub">Шоо 1–3 → хувиа алдана</span></span><span class="chips">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip" data-a="rStart" data-p="${Q.id}" data-id="${a.id}" data-n="${n}">${n}</button>`).join('')}</span></div>`).join('')}</div>`;
      }
      case 'l2rate': return `<div class="box">${who(Q)}<div class="ln"><span>Түвшин 2-ын зээлийн хүү</span><b>${Q.l2.rate}% → ${s.rate}%/сар</b></div><div class="row" style="margin-top:8px"><button class="minibtn go" data-a="rApply" data-p="${Q.id}">Хэрэгжүүлэх</button></div></div>`;
      case 'dice': {
        const has = Q.assets.some(a => a.kind === 'venture' && a.share < 1);
        if (!has) return `<div class="box">${who(Q)}<p class="empty">Хамтарсан төсөлгүй.</p></div>`;
        return `<div class="box">${who(Q)}<p class="mute" style="font-size:13px">Шоо: 1–2 → 30 сая₮ хуулийн зардал; 3–6 → эвлэрнэ.</p><div class="dicepad" style="margin-top:8px">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="rDice" data-p="${Q.id}" data-n="${n}">${n}</button>`).join('')}</div></div>`;
      }
      case 'bribe': return `<div class="box">${who(Q)}<div style="display:grid;gap:8px"><button class="mbtn" data-a="rApply" data-p="${Q.id}" data-opt="a">${ic('hand')}<span><b>A · Татгалзана</b><small>Хамгийн том төслийн ашиг дараагийн Жилийн орлогод 0</small></span></button>
        <button class="mbtn" data-a="rBribe" data-p="${Q.id}">${ic('warning')}<span><b>B · 20 сая₮ өгнө</b><small>Шоо 1–4 бол илчлэгдэж 150 сая₮ торгууль. Хээл хахууль бол гэмт хэрэг.</small></span></button></div></div>`;
      case 'pay': { const amt = Q.flags.health ? s.insured : s.amt; return `<div class="box">${who(Q)}<div class="ln"><span>${Q.flags.health ? 'Эрүүл мэндийн даатгалтай' : 'Даатгалгүй'}</span><button class="minibtn go" data-a="rCash" data-p="${Q.id}" data-v="${-amt}">${fmtS(amt)} төлөх</button></div></div>`; }
      case 'lifestyle': return `<div class="box">${who(Q)}<div class="chips"><button class="minibtn" data-a="rApply" data-p="${Q.id}" data-opt="a">Зардал байнга +${fmtS(s.exp)}</button><button class="minibtn go" data-a="rApply" data-p="${Q.id}" data-opt="b" ${Q.cash >= s.buy ? '' : 'disabled'}>${fmtS(s.buy)}-өөр машин, байр (+${fmtS(s.buyExp)}/сар)</button></div></div>`;
    }
    return '';
  }).join('');
  if (!ps.length) body = `<div class="box"><p class="empty">Түвшин 2-т тоглогч алга.</p></div>`;
  return `${head('Их эрсдэл', `<span>Их эрсдэл</span>›<b>№ ${c.no || c.id.split('-')[1]}</b>`)}${cardHTML(c)}${body}<div class="cta"><button class="btn go" data-a="rDone">Дууслаа</button></div>`;
}
ACT.rDone = () => { const c = CARD[FS.card]; if (!FS.incoming && G.mode === 'online' && !['payLargest', 'bribe', 'pay', 'lifestyle', 'dice'].includes(c.fx.t)) NET.emit({ t: 'card', card: c.id }); if (!FS.done) log(G, me(), c.title, 0, c.id, 'risk'); save(); closeSheet(); };
ACT.rCash = d => { const Q = PL(d.p); snap('Их эрсдэл'); pay(G, Q, -(+d.v), CARD[FS.card].title, FS.card, 'risk'); mark(`r:${Q.id}`); save(); drawSheet(); };
ACT.rDice = d => { const Q = PL(d.p); const v = +d.n; snap('Их эрсдэл'); if (v <= 2) pay(G, Q, 30000000, `${CARD[FS.card].title} · шоо ${v}`, FS.card, 'risk'); else log(G, Q, `${CARD[FS.card].title} · шоо ${v}, эвлэрлээ`, 0, FS.card, 'risk'); mark(`r:${Q.id}`); save(); drawSheet(); };
ACT.rStart = d => { const Q = PL(d.p); const a = Q.assets.find(x => x.id === d.id); const v = +d.n; snap('Стартап'); if (v <= 3) { Q.assets = Q.assets.filter(x => x.id !== a.id); log(G, Q, `${a.name} — шоо ${v}, хувиа алдлаа`, 0, FS.card, 'risk'); } else log(G, Q, `${a.name} — шоо ${v}, хэвээр`, 0, FS.card, 'risk'); save(); drawSheet(); };
ACT.rBribe = d => { const Q = PL(d.p); FS.bribe = Q.id; FS.vals = null; drawSheet2(fBribe); };
function fBribe() {
  const Q = PL(FS.bribe); const v = FS.vals;
  return `${head('B · 20 сая₮ өгнө')}${v ? `<div class="dice"><div class="die">${v}</div></div><p class="big ${v <= 4 ? 'neg' : ''}">${v <= 4 ? 'Илчлэгдлээ: 150 сая₮ торгууль' : 'Илчлэгдсэнгүй'}</p><div class="cta"><button class="btn go" data-a="bribeOk">Үргэлжлүүлэх</button></div>` : `<div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="bribeDie" data-n="${n}">${n}</button>`).join('')}</div>`}`;
}
ACT.bribeDie = d => { FS.vals = +d.n || d6(); drawSheet(); };
ACT.bribeOk = () => {
  const Q = PL(FS.bribe); const v = FS.vals; snap('Хээл хахууль');
  pay(G, Q, 20000000, 'Хээл хахууль өгсөн', FS.card, 'risk');
  if (v <= 4) {
    pay(G, Q, 150000000, 'Илчлэгдэж торгуулсан', FS.card, 'risk');
    const big = Q.assets.filter(a => a.kind === 'venture').sort((a, b) => b.invest - a.invest)[0];
    if (big) Q.mods.push({ id: uid('m'), asset: big.id, pct: -100, next: 1, card: FS.card });
  }
  mark(`r:${Q.id}`); save(); drawSheet2(fRisk);
};
ACT.rApply = d => {
  const Q = PL(d.p); const c = CARD[FS.card]; const s = c.fx; snap('Их эрсдэл');
  const vs = Q.assets.filter(a => a.kind === 'venture' && (s.all || (s.tagsAny || []).some(t => (a.tags || []).includes(t))));
  switch (s.t) {
    case 'mod': if (+d.safe) { log(G, Q, `${c.title}: нөөцтэй тул хохирсонгүй`, 0, c.id, 'risk'); break; }
      if (s.all) Q.mods.push({ id: uid('m'), all: true, pct: s.pct, next: s.next, card: c.id });
      else vs.forEach(a => Q.mods.push({ id: uid('m'), asset: a.id, pct: s.pct, next: s.next, card: c.id }));
      log(G, Q, `${c.title}`, 0, c.id, 'risk'); break;
    case 'perm': vs.forEach(a => permMod(Q, a, s.pct, c)); log(G, Q, `${c.title}: ашиг байнга ${s.pct}%`, 0, c.id, 'risk'); break;
    case 'fx': if (vs.length) gain(G, Q, sum(vs, a => a.profit) * s.bonusMonths, c.title, c.id, 'risk'); else { Q.expMods.push({ id: uid('x'), l: `${c.id} · ханшийн нөлөө`, pct: s.elseExpPct }); log(G, Q, `${c.title}: зардал +${s.elseExpPct}%`, 0, c.id, 'risk'); } break;
    case 'per': pay(G, Q, -s.amt * vs.length, c.title, c.id, 'risk'); break;
    case 'payLargest': { const big = Q.assets.filter(a => a.kind === 'venture').sort((a, b) => b.invest - a.invest)[0]; pay(G, Q, R(big.invest * s.pct / 100), c.title, c.id, 'risk'); break; }
    case 'orpay': if (d.opt === 'b') pay(G, Q, s.pay, `${c.title} · хамгаалалт`, c.id, 'risk'); else pay(G, Q, sum(vs, a => a.profit) * s.loseMonths, `${c.title} · ашиг алдсан`, c.id, 'risk'); break;
    case 'orperm': if (d.opt === 'b') pay(G, Q, s.pay, `${c.title} · сургалт`, c.id, 'risk'); else { vs.forEach(a => permMod(Q, a, s.pct, c)); log(G, Q, `${c.title}: ашиг ${s.pct}%`, 0, c.id, 'risk'); } break;
    case 'l2rate': Q.l2.rate = s.rate; log(G, Q, `${c.title}: зээлийн хүү ${s.rate}%/сар`, 0, c.id, 'risk'); break;
    case 'bribe': { const big = Q.assets.filter(a => a.kind === 'venture').sort((a, b) => b.invest - a.invest)[0]; if (big) Q.mods.push({ id: uid('m'), asset: big.id, pct: -100, next: 1, card: c.id }); log(G, Q, `${c.title}: татгалзлаа`, 0, c.id, 'risk'); break; }
    case 'lifestyle': if (d.opt === 'b') { pay(G, Q, s.buy, `${c.title}: машин, байр`, c.id, 'risk'); Q.expMods.push({ id: uid('x'), l: 'Тансаг машин, байрны зардал', v: s.buyExp }); } else { Q.expMods.push({ id: uid('x'), l: 'Тансаг амьдралын зардал', v: s.exp }); log(G, Q, `${c.title}: зардал +${fmtS(s.exp)}`, 0, c.id, 'risk'); } break;
  }
  mark(`r:${Q.id}`); save(); drawSheet();
};
/* ============================================================
   OctoFinance 3.0 — Level 1 screens (app prompt v3, studio v116)
   Level 2 and games saved before v3 keep the old screens (dispatchers below).
   ============================================================ */
const isV3 = P => !!(P && P.v3 && P.level === 1);

/* ---------- dispatchers ---------- */
function startCard(id, extra = {}) { const c = CARD[id]; return c && isV3(me()) && L1DECK[c.deck] ? startCard1(id, extra) : startCardOld(id, extra); }
function openSquare(s, i, manual) { return isV3(me()) ? openSquare1(s, i, manual) : openSquareOld(s, i, manual); }
function runPaydays(k, then) { return isV3(me()) ? runPaydays1(k, then) : runPaydaysOld(k, then); }
function loanOpt(P, need) { return isV3(P) ? loanOpt1(P, need) : loanOptOld(P, need); }
function shortfall(P, need, auto) { return isV3(P) ? shortfall1(P, need) : shortfallOld(P, need, auto); }
function fFree() { return isV3(me()) ? fFree1() : fFreeOld(); }
function freeBar(P, f, lv, pct, dream) { return isV3(P) ? freeBar1(P, f) : freeBarOld(P, f, lv, pct, dream); }
function fExp() { return isV3(me()) ? fExp1() : fExpOld(); }
function fDebts() { return isV3(me()) ? fDebts1() : fDebtsOld(); }
const v3Act = (name, fn) => { const old = ACT[name]; ACT[name] = (d, el) => isV3(me()) ? fn(d, el) : old && old(d, el); };

/* ---------- small building blocks ---------- */
const cnoS = c => `№ ${c.no || c.id.split('-')[1]}`;
const others1 = P => G.players.filter(p => p.id !== P.id && !p.out);
const PL1 = id => G.players.find(p => p.id === id);
function stepper(f, v, step, label) {
  return `<div class="stepper"><button data-a="stp" data-f="${f}" data-d="-${step}" aria-label="Хасах">−</button><input id="n_${f}" inputmode="numeric" data-in="numIn" data-f="${f}" value="${(v || 0).toLocaleString('en')}" aria-label="${label || 'Дүн'}"><button data-a="stp" data-f="${f}" data-d="${step}" aria-label="Нэмэх">+</button></div>`;
}
const chips = (f, list, lab = n => fmtS(n)) => `<div class="quick">${list.map(n => `<button class="chip" data-a="setF" data-f="${f}" data-n="${n}" aria-pressed="${FS[f] === n}">${lab(n)}</button>`).join('')}</div>`;
ACT.stp = d => { FS[d.f] = Math.max(0, (FS[d.f] || 0) + +d.d); drawSheet(); };
ACT.setF = d => { FS[d.f] = +d.n; drawSheet(); };
ACT.setS = d => { FS[d.f] = d.s; drawSheet(); };
const seg = (f, opts) => `<div class="seg">${opts.map(([v, t]) => `<button data-a="setS" data-f="${f}" data-s="${v}" aria-pressed="${String(FS[f]) === String(v)}">${t}</button>`).join('')}</div>`;
const dicePad = (a, extra = '') => `<div class="dicepad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-a="${a}" data-n="${n}" ${extra}>${n}</button>`).join('')}</div>`;
const sm = t => `<p class="mute" style="font-size:12px">${t}</p>`;
const okNote = t => `<div class="alert ok">${ic('seal-check')}<span><b>${t}</b></span></div>`;
/* where an unexpected cost comes from: emergency fund first, then cash (§5.3) */
function payPrev(P, amt) {
  if (loanOpt1(P, amt)) return '';   // money short: the loan box says what happens instead
  if (!(P.efund > 0)) return cashPrev(P, -amt, 0);
  const f = Math.min(Math.max(0, P.efund || 0), amt), c = amt - f;
  return `<div class="after"><div><small>Яаралтай сан</small><span class="money">${fmtS((P.efund || 0) - f)}</span><span class="d ${f ? 'neg' : ''}">${f ? '−' + fmtS(f) : 'өөрчлөлтгүй'}</span></div>
    <div><small>Бэлэн мөнгө</small><span class="money ${P.cash - c < 0 ? 'neg' : ''}">${fmtS(P.cash - c)}</span><span class="d ${c ? 'neg' : ''}">${c ? '−' + fmtS(c) : 'өөрчлөлтгүй'}</span></div></div>`;
}
function cashPrev(P, dCash, dMonth) {
  // exact ₮, the result in navy (red only when it is below zero), only the change is coloured (user 2026-10-23: rounded сая and a red balance misled)
  return '';   // the before/after box is gone (user 2026-10-23: «ямар ч хэрэг алга»)
  const f = fin1(P, G), c1 = P.cash + dCash, m1 = f.cf + dMonth;
  const big = (v, s) => `<span class="money ${v < 0 ? 'neg' : ''}">${fmt(v, s ? { sign: true } : undefined)}</span>`;
  const dl = d => `<span class="d ${d < 0 ? 'neg' : d > 0 ? 'pos' : ''}">${d ? fmt(d, { sign: true }) : 'өөрчлөлтгүй'}</span>`;
  const was = v => `<small style="margin-top:2px">одоо ${v}</small>`;
  return `<div class="after"><div><small>Бэлэн мөнгө</small>${big(c1)}${dl(dCash)}${dCash ? was(fmt(P.cash)) : ''}</div>
    <div><small>Сарын ашиг</small>${big(m1, 1)}${dl(dMonth)}${dMonth ? was(fmt(f.cf, { sign: true })) : ''}</div></div>`;
}
/* shortage: fund → cash → savings → emergency loan (1 сая₮ units, 10%/сар) */
/* money short: a real loan offer — bank loan (24 сар) or emergency loan, for exactly the missing amount (user 2026-10-22) */
function loanOpt1(P, need) {
  const lack = R(need - P.cash - (FS.fund ? Math.max(0, P.efund || 0) : 0)); if (lack <= 0) return null;
  const canB = bankRoom1(P, 24) >= lack;
  // nothing is borrowed until the player picks a loan (user 2026-10-22)
  const kind = FS.lk === 'bank' ? 'bank' : FS.lk === 'bankl' && canB ? 'bankl' : null;
  if (!kind) return { amt: -1, kind: null, pay: 0, lack, canA: true, canB, pick: true };
  const pay = kind === 'bankl' ? annuityPay(lack, G.settings.bankRate, 24) : R(lack * G.settings.loanPct / 100);
  return { amt: lack, kind, pay, lack, canA: true, canB };
}
function shortfall1() { return ''; }   // no box on the screen any more: the loan offer pops up when the player presses pay (user 2026-10-22)
/* ---- loan offer pop-up: shown on top of the open screen, nothing is borrowed until «Зөвшөөрөх» ---- */
let LKQ = null;
function lackOpen(d, need) { const P = me(); LKQ = { d: Object.assign({}, d), need: R(need), k: bankRoom1(P, 24) >= R(need - P.cash) ? 'bankl' : 'bank' }; lkDraw(); buzz(10); }
function lkDraw() {
  let el = document.getElementById('lkpop');
  if (!LKQ) { if (el) el.remove(); return; }
  const P = me(), S = G.settings, lack = R(LKQ.need - P.cash);
  if (lack <= 0) { const q = LKQ; LKQ = null; lkDraw(); return ACT[q.d.go](q.d); }
  const canB = bankRoom1(P, 24) >= lack, canE = emRoom1(P) >= lack;
  if (!canB && LKQ.k === 'bankl') LKQ.k = canE ? 'bank' : '';
  if (!canE && LKQ.k === 'bank') LKQ.k = canB ? 'bankl' : '';
  const bp = annuityPay(lack, S.bankRate, 24), ep = R(lack * S.loanPct / 100);
  const sv = (P.savings || []).map(s => `<button class="minibtn" data-a="lkSv" data-id="${s.id}">${esc(saveName(s).split(' ')[0])}-аас +${fmtS(s.amt - earlyCost(s))}</button>`).join('');
  if (!el) { el = document.createElement('div'); el.id = 'lkpop'; el.className = 'lkpop'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lkpop-bg" data-a="lkNo"></div><div class="lkpop-card" role="dialog" aria-label="Зээлийн санал">
    <div class="lack-h">${ic('hand-coins')}<span><b>Мөнгө хүрэлцэхгүй</b><small>${fmt(lack)} дутна · зээл авах уу?</small></span></div>
    <div class="seg pick sk2">
      <button data-a="lkPick" data-k="bankl" aria-pressed="${LKQ.k === 'bankl'}" ${canB ? '' : 'disabled'}>Банкны зээл<br><small>${canB ? `сард ${fmtS(bp)} · 24 сар` : 'олгохгүй'}</small></button>
      <button data-a="lkPick" data-k="bank" aria-pressed="${LKQ.k === 'bank'}" ${canE ? '' : 'disabled'}>Яаралтай зээл<br><small>${canE ? `сард ${fmtS(ep)} хүү` : 'хязгаар хүрсэн'}</small></button></div>
    ${sv ? `<div class="row" style="margin-top:8px;gap:6px">${sv}</div>` : ''}
    <div class="cta"><button class="btn" data-a="lkNo">Болих</button><button class="btn go" data-a="lkYes" ${LKQ.k ? '' : 'disabled'}>${LKQ.k ? 'Зөвшөөрөх' : 'Зээл олгохгүй'}</button></div></div>`;
}
ACT.lackAsk = d => lackOpen(d, +d.need);
ACT.pdLoanDone = () => { save(); render(); drawSheet(); };   // payday below zero: the same loan offer, exact amount (user 2026-10-23)
ACT.lkPick = d => { if (LKQ) { LKQ.k = d.k; lkDraw(); } };
ACT.lkNo = () => { LKQ = null; lkDraw(); };
ACT.lkSv = d => { const P = me(); snap('Хадгаламжаас авах'); closeSave1(G, P, d.id); save(); render(); drawSheet(); lkDraw(); };
ACT.lkYes = () => { if (!LKQ || !LKQ.k) return; const q = LKQ, P = me(), lack = R(q.need - P.cash); LKQ = null; lkDraw();
  if (lack <= 0) return ACT[q.d.go](q.d);
  ACT.loanGo(Object.assign({}, q.d, { lamt: lack, lk: q.k })); };

/* ---------- start a Level 1 card ---------- */
function startCard1(id, extra = {}) {
  const c = CARD[id]; const P = me();
  if (c.deck === 'ZZ') return zzOpen(id, extra);
  // AZ cards with two choices start with nothing picked (user 2026-10-26: people paid the first, dearer option without seeing the second)
  FS = Object.assign({ card: id, deck: c.deck, share: 0.5, co: '0', partners: [], qty: 0, amt: 0, opt: azChoice(c) ? '' : '0', fund: c.deck === 'AZ' }, extra);
  if (c.fx.k === 'cdep') FS.amt = 1000000;
  if (c.fx.k === 'stock' || c.fx.k === 'metal') FS.px = c.fx.price;   // the card's price, locked on the card screen
  if (c.fx.k === 'stock' || c.fx.k === 'metal') { const k = c.fx.k === 'stock' ? c.fx.sym : c.fx.metal; FS.prevPx = (G.lastPx || {})[k] || 0; setPx(k, c.fx.price, extra.incoming ? '' : me().name); }
  if (c.fx.k === 'stock' && G.mode === 'online' && !extra.incoming && !extra.offerLock) { NET.emit({ t: 'card', card: id }); FS.told = 1; }
  // gold / silver cards tell the new price too (user 2026-10-31)
  if (c.fx.k === 'metal' && G.mode === 'online' && !extra.incoming && !extra.offerLock && FS.prevPx !== c.fx.price) { NET.emit({ t: 'stockpx', sym: c.fx.metal, px: c.fx.price, prev: FS.prevPx || 0, txt: `${coName(c.fx.metal)} ${fmt(c.fx.price)}` }); FS.told = 1; }
  openSheet(fCard1);
}
function fCard1() {
  const c = CARD[FS.card]; const P = me(); const k = c.fx.k;
  const A = { stock: actStock1, metal: actMetal1, cdep: actCdep1, skill: actSkill1, side: actSide1, scam: actScam1, bond: actOpp1, re: actOpp1, land: actOpp1,
    pay: actPay1, want: actWant1, car: actCar1, need: actNeed1, tool: actTool1, ins: actIns1, start: actStart1, antique: actAntique1, lottery: actLottery1, presale: actPresale1, misfortune: actMisfortune1 }[k];
  const compact = k === 'stock' || k === 'metal';
  if (cpOn(P)) return cardPage(P, c, compact, A);
  return `${head(DECKS[c.deck].n, `<span>${esc(DECKS[c.deck].n)}</span>›<b>${cnoS(c)}</b>`)}${compact ? unitHead(c) : cardHTML(c, { short: true, norows: azChoice(c) && azApplies(P, c.fx.cond) })}${A ? A(P, c) : '<div class="cta"><button class="btn go" data-a="close">Хаах</button></div>'}`;
}
/* ---- selling a drawn card (user 2026-10-26): every Жижиг/Том боломж card except stocks and metals ---- */
const canSellCard = (P, c) => !!c && (c.deck === 'JB' || c.deck === 'TB') && !['stock', 'metal', 'lottery'].includes(c.fx.k) && !FS.offerLock && !FS.paid && others1(P).length > 0 && canAct(P);
const saleBtn = (P, c) => '';   // cards are sold from Тоглогчид (user 2026-11-09)
/* one phone: pick the buyer and the price, the card opens on the buyer's profile; back to the seller when it closes */
ACT.saleLocal = () => { FS.sl = { to: null, amt: 0, card: FS.card }; openSheet(fSaleL, { modal: true }); };
function fSaleL() {
  const P = me(), x = FS.sl, c = CARD[x.card], os = others1(P);
  return `${head('Картаа зарах')}<div class="box"><div class="ln" style="border:0;padding:0"><b style="white-space:normal">${esc(c.title)}</b><span class="mute">${cnoS(c)}</span></div></div>
  <div class="box" style="display:grid;gap:10px"><h4>Хэнд?</h4><div class="chips">${os.map(o => `<button class="chip" data-a="slTo" data-id="${o.id}" aria-pressed="${x.to === o.id}">${esc(o.name)}</button>`).join('')}</div>
    <div class="skf" style="grid-template-columns:1fr;margin-top:0"><label class="mrow has"><span class="ml">Картын үнэ</span><input id="n_sl" inputmode="numeric" placeholder="0" value="${x.amt ? x.amt.toLocaleString('en') : ''}" data-in="slAmt"></label></div></div>
  <div class="cta"><button class="btn" data-a="slBack">Буцах</button><button class="btn go" data-a="slGo" ${x.to ? '' : 'disabled'}>${x.to ? `${esc(PL1(x.to).name)}-д ${x.amt ? fmtS(x.amt) + '-өөр ' : ''}зарах` : 'Хэнд зарахаа сонгоно уу'}</button></div>`;
}
ACT.slTo = d => { FS.sl.to = d.id; drawSheet(); };
ACT.slAmt = (d, el) => { FS.sl.amt = parseAmt(el.value) || 0; clearTimeout(pqT); pqT = setTimeout(drawSheet, 400); };
ACT.slBack = () => { const id = FS.sl.card; startCard(id); };
ACT.slGo = () => { const P = me(), x = FS.sl; if (!x.to) return; const i = G.players.findIndex(p => p.id === x.to); if (i < 0) return;
  log(G, P, `${CARD[x.card].title} картаа ${PL1(x.to).name}-д ${x.amt ? fmtS(x.amt) + '-өөр ' : ''}зарахаар санал болголоо`, 0, x.card, 'skip');
  UI.saleRet = G.cur; G.cur = i; save(); render(); toast(`${PL1(x.to).name}-ийн ээлж: карт нээгдлээ`);
  startCard(x.card, { offerFrom: P.id, offerAmt: x.amt, offerLock: true }); };
{ const cs0 = closeSheet; closeSheet = function () { if (UI.saleRet != null && G && G.mode !== 'online') { G.cur = UI.saleRet; UI.saleRet = null; save(); } return cs0.apply(this, arguments); }; }
const azChoice = c => c.deck === 'AZ' && ['want', 'tool', 'car', 'need'].includes(c.fx.k);
const pickFirst = () => `<div class="cta"><button class="btn go" disabled>Сонголтоо хийнэ үү</button></div>`;
const skipBtn = (t = 'Татгалзах') => `<button class="btn sm" data-a="skipCard">${t}</button>`;

/* ---- stocks: units × card price; every JB card of that company asks holders «Энэ үнээр зарах уу?» ---- */
function stockSellRows(c, ps) {
  const fx = Object.assign({}, c.fx, { price: FS.px || c.fx.price });
  if (G && cpOn(me())) {   // card page (user 2026-11-04): one clear «sell» line per holder, then a green «sold» state right where they tapped
    const out = ps.map(Q => { const k = 'ss:' + Q.id, dn = FS.done && FS.done[k], q = sum(holdingsOf(Q, fx.sym), a => a.qty);
      const nm = Q.id === me().id ? 'Танд' : esc(Q.name) + '-д';
      if (dn) return `<div class="ss2 done"><span class="ss2-i">${ic2('f:check-circle')}</span><span class="ss2-t"><b>${(dn.q || 0).toLocaleString('en')} ш зарлаа</b><small>Бэлэн мөнгө ${fmtS(Q.cash)}</small></span><em>+${fmtS(dn.v || 0)}</em></div>`;
      if (!q) return '';
      return `<div class="ss2"><span class="ss2-t"><b>${nm} ${q.toLocaleString('en')} ш байна</b><small>${fmt(fx.price)} × ${q.toLocaleString('en')}</small></span><button class="ss2-b" data-a="stockSell" data-p="${Q.id}" data-k="${k}">Зарах +${fmtS(q * fx.price)}</button></div>`; }).join('');
    return out;
  }
  const rows = ps.map(Q => { const q = sum(holdingsOf(Q, fx.sym), a => a.qty); if (!q) return '';
    const k = 'ss:' + Q.id;
    return `<div class="ln"><span>${ps.length > 1 || Q.id !== me().id ? esc(Q.name) + ' · ' : ''}${q.toLocaleString('en')} ш</span>${FS.done && FS.done[k] ? '<b class="pos">Зарсан</b>' : `<button class="minibtn go" data-a="stockSell" data-p="${Q.id}" data-k="${k}">${fmtS(q * fx.price)} зарах</button>`}</div>`; }).join('');
  return rows ? `<div class="box"><div class="sec">Энэ үнээр зарах уу? <span>${fmt(fx.price)} / ш</span></div>${rows}</div>` : '';
}
ACT.stockSell = d => { const Q = PL1(d.p); const c = CARD[FS.card]; const q = sum(holdingsOf(Q, c.fx.sym), a => a.qty); if (!q) return;
  const px = FS.px || c.fx.price; snap('Хувьцаа зарах'); sellStock(G, Q, c.fx.sym, q, px, c.id); FS.done = FS.done || {}; FS.done[d.k] = { q, v: q * px }; save(); render(); drawSheet(); buzz(25); toast(`${coName(c.fx.sym)} ${q.toLocaleString('en')} ш зарлаа · +${fmtS(q * px)}`); };
function pxField(c) {
  const v = FS.px || 0;
  return `<div class="mlist"><label class="mrow ${v ? 'has' : ''}"><span class="ml">${esc(c.fx.k === 'stock' ? coName(c.fx.sym) : L1.metalName[c.fx.metal])} · 1 ширхэгийн үнэ</span><input id="n_px" inputmode="numeric" placeholder="Үнэ" value="${v ? v.toLocaleString('en') : ''}" data-in="numIn" data-f="px"></label></div>`;
}
/* stock / metal card on one screen (user 2026-10-22): company + printed price, two fields side by side, one total line */
function unitHead(c) {
  const fx = c.fx, nm = fx.k === 'stock' ? coName(fx.sym) : L1.metalName[fx.metal];
  // online: tapping the company box sends the card's price to everyone again (user 2026-10-30)
  const tell = (fx.k === 'stock' || fx.k === 'metal') && !FS.incoming && !FS.offerLock;   // shown in every mode (user 2026-10-30: «байхгүй байна»)
  return `<div class="box uh${tell ? ' tap' : ''}" ${tell ? 'data-a="cardTell" role="button"' : ''}>${tell ? `<div class="uh-tell">${ic('trend-up')} ${FS.told ? 'Бусдад мэдэгдсэн · дахин илгээх' : 'Үнийг бусдад мэдэгдэх'}</div>` : ''}<div class="ln" style="border:0;padding:0"><span><b style="font-size:17px">${esc(nm)}</b><span class="sub">${esc(c.title)}</span></span><b style="font-size:20px">${fmt(fx.price)}</b></div>
    <div class="ln" style="padding:6px 0 0;border:0"><span class="mute" style="font-size:12px">${fx.k === 'stock' ? (fx.div ? `Ногдол ашиг ${fmt(fx.div)} / ширхэг · Орлого бүр` : 'Ногдолгүй') : 'Орлогогүй · Зах зээлийн картаар зарна'}</span></div></div>`;
}
function unitTell(c) {   // «Үнийг бусдад мэдэгдэх» as one small chip (user 2026-11-03: too much text)
  const tell = !FS.incoming && !FS.offerLock; if (!tell) return '';
  return `<button class="cp-fb r cp-tell" data-a="cardTell">${ic('trend-up')}<span>${FS.told ? 'Мэдэгдсэн' : 'Бусдад мэдэгдэх'}</span></button>`;
}
function cashBar(P, c) {   // buyers see their cash and what is left (user 2026-11-07)
  const qty = FS.qty || 0, px = FS.px || c.fx.price || 0, cost = qty * px, left = P.cash - cost - offerFee(cost);
  return `<div class="cashx"><span><small>Бэлэн мөнгө</small><b>${fmt(P.cash)}</b></span>${cost ? `<span class="r"><small>Авсны дараа</small><b class="${left < 0 ? 'neg' : ''}">${fmt(left)}</b></span>` : ''}</div>`;
}
function unitFields(c, metal) {
  if (G && cpOn(me())) { const qty = FS.qty || 0;   // page: the price is already on the card, only the amount is typed
    return `${cashBar(me(), c)}<div class="cp-qbox"><label class="cp-qty"><span>Хэдэн ширхэг авах вэ${metal && c.fx.max ? ` <i class="${qty > c.fx.max ? 'neg' : ''}">· ${c.fx.max} хүртэл</i>` : ''}</span><input id="n_qty" inputmode="numeric" placeholder="0" value="${qty ? qty.toLocaleString('en') : ''}" data-in="numIn" data-f="qty"></label>
    ${chips('qty', metal ? (c.fx.max >= 100 ? [10, 20, 50, 100] : [1, 2, 5, 10]) : [100, 1000, 5000, 10000], n => n.toLocaleString('en'))}</div>`; }
  const px = FS.px || 0, qty = FS.qty || 0;
  // a drawn card fixes the price (user 2026-10-22): shown locked, only the amount is typed
  return `${cashBar(me(), c)}<div class="skf" style="margin-top:0"><div class="mrow has lock"><span class="ml">1 ширхэгийн үнэ · картын</span><b>${fmt(c.fx.price)}</b></div>
    <label class="mrow has"><span class="ml">Ширхэг</span><input id="n_qty" inputmode="numeric" placeholder="0" value="${qty ? qty.toLocaleString('en') : ''}" data-in="numIn" data-f="qty"></label></div>
  ${chips('qty', metal ? (c.fx.max >= 100 ? [10, 20, 50, 100] : [1, 2, 5, 10]) : [100, 1000, 5000, 10000], n => n.toLocaleString('en')).replace('class="quick"', 'class="quick" style="margin-top:8px"')}
  ${metal && c.fx.max ? `<p class="mute" style="font-size:12px;margin-top:6px">Нэг картаар ${c.fx.max} хүртэл зоос${qty > c.fx.max ? ` · <b class="neg">${c.fx.max}-аас их болохгүй</b>` : ''}</p>` : ''}`;
}
function unitTotal(P, c, cost, fee) {
  const div = c.fx.k === 'stock' ? (c.fx.div || 0) * (FS.qty || 0) : 0;
  if (G && cpOn(me()) && !(FS.qty > 0) && !FS.offerLock) return '';
  return `<div class="ln tot" style="margin-top:6px"><span>Нийт${div ? `<span class="sub">ногдол Орлого бүр +${fmt(div)}</span>` : ''}</span><b>${cost ? fmt(cost + fee) : '—'}</b></div>
  ${FS.offerLock ? offerHTML(P, cost) : ''}`;
}
ACT.cardTell = () => { const c = CARD[FS.card]; if (!c || (c.fx.k !== 'stock' && c.fx.k !== 'metal')) return; const sym = c.fx.sym || c.fx.metal;
  if (G.mode !== 'online') { const P = me();
    if (G.players.some(Q => Q.id !== P.id && !Q.out && isV3(Q) && sum(ownOf(Q, sym), x => x.qty) > 0)) { const back = FS.card; FS = { pxq: { sym, px: c.fx.price, back }, done: {} }; return openSheet(fStockLocal, { modal: true }); }
    return toast(G.players.length > 1 ? 'Энэ хувьцаатай өөр тоглогч алга' : 'Өөр тоглогч алга'); }
  if (G.players.length < 2) return toast('Өрөөнд өөр тоглогч алга');
  NET.emit({ t: 'stockpx', sym, px: c.fx.price, prev: FS.prevPx || 0, txt: `${coName(sym)} ${fmt(c.fx.price)}` }); FS.told = 1; drawSheet(); buzz(15); toast('Бусдад мэдэгдлээ'); };
ACT.offerOpen = () => { FS.offerOpen = true; drawSheet(); };
function actStock1(P, c) {
  const px = FS.px || 0, qty = FS.qty || 0, cost = qty * px, fee = offerFee(cost);
  const holders = G.mode === 'online' ? [P] : G.players.filter(p => !p.out && isV3(p));
  const sell = stockSellRows(c, holders), pg = cpOn(P);
  return `${pg ? sell : ''}${unitFields(c, false)}${unitTotal(P, c, cost, fee)}${pg ? '' : sell}${cost ? shortfall(P, cost + fee) : ''}
  <div class="cta">${pg && FS.done && Object.keys(FS.done).length ? '<button class="btn" data-a="close">Хаах</button>' : skipBtn()}${payBtn(P, cost + fee, 'stockOk', !px ? 'Үнээ бичнэ үү' : qty ? 'Авах' : 'Тоо оруулна уу', qty > 0 && px > 0)}</div>`;
}
ACT.stockOk = () => { const P = me(); const c = CARD[FS.card]; const cost = (FS.qty || 0) * (FS.px || 0); if (!(FS.qty > 0) || !(FS.px > 0) || P.cash < cost + offerFee(cost)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title); buyStock(G, P, c, FS.qty, FS.px); payOffer(P, cost, c); if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: `${coName(c.fx.sym)} ${FS.qty.toLocaleString('en')} ш авлаа` }); save(); closeSheet(); buzz(20); };
/* a new price for a company (JB card or typed on the Хувьцаа screen): holders are asked «Зарах уу?», everyone else gets a small note (user 2026-10-26) */
UI.pxQ = [];
function stockAsk(sym, px, from, cardId, prev) {
  const was = prev || (G.lastPx || {})[sym] || 0;
  const who = (G.players.find(p => p.id === from) || {}).name || '';
  setPx(sym, px, who, was);
  // every player sees «өслөө / унлаа» (user 2026-10-30); a holder also gets the sell button
  const q = { sym, px, prev: was !== px ? was : 0, from: who, card: cardId };
  if (UI.sheetFn && UI.sheetFn !== fStockAsk) { UI.pxQ = UI.pxQ.filter(x => x.sym !== sym).concat(q); notify(from, who, `${coName(sym)} ${fmt(px)}${pxMove(q)}`, 'cardsale', () => { UI.pxQ = UI.pxQ.filter(x => x !== q); pxOpen(q); }); return; }
  pxOpen(q);
}
const pxMove = q => !q.prev ? '' : q.px > q.prev ? ` · өслөө +${Math.round((q.px / q.prev - 1) * 100)}%` : ` · унлаа −${Math.round((1 - q.px / q.prev) * 100)}%`;
function pxOpen(q) { FS = { pxq: q, done: {} }; openSheet(fStockAsk, { modal: true }); buzz([50, 40, 50]); }
function fStockAsk() {
  const q = FS.pxq, P = me(); if (!q) return '';
  const hs = ownOf(P, q.sym), held = sum(hs, a => a.qty), cost = sum(hs, a => a.qty * (a.unitCost || a.price)), avg = held ? R(cost / held) : 0;
  const got = held * q.px, gain = got - cost, sold = FS.done.sold;
  const up = q.prev && q.px > q.prev, dn = q.prev && q.px < q.prev;
  return `${head(held || sold ? 'Зарах уу?' : isMetalK(q.sym) ? 'Үнэт металлын мэдээ' : 'Хувьцааны мэдээ', `<span>${esc(q.from)}${q.card ? ' сугаллаа' : ' мэдэгдлээ'}</span>`)}
  <div class="box"><div class="ln" style="border:0;padding:0"><b style="font-size:17px">${esc(coName(q.sym))}</b><b style="font-size:20px">${fmt(q.px)}</b></div>
    ${q.prev ? `<div class="ln" style="border:0;padding:6px 0 0"><span class="mute">өмнө ${fmt(q.prev)}</span><b class="${up ? 'pos' : dn ? 'neg' : ''}">${up ? '▲ өслөө' : '▼ унлаа'} ${pxMove(q).replace(/^ · (өслөө|унлаа) /, '')}</b></div>` : ''}</div>
  ${sold ? `<div class="alert ok">${ic('seal-check')}<span><b>Зарлаа · +${fmt(sold)}</b></span></div><div class="cta"><button class="btn go" data-a="close">Хаах</button></div>`
  : held ? `<div class="box"><div class="ln"><span>Танд</span><b>${held.toLocaleString('en')} ${unitOf(q.sym)}</b></div><div class="ln"><span>Авсан үнэ</span><b>${fmt(avg)}</b></div>
    <div class="ln tot"><span>${gain >= 0 ? 'Ашиг' : 'Алдагдал'}</span><b class="${gain >= 0 ? 'pos' : 'neg'}">${fmt(gain, { sign: true })}</b></div></div>
  <div class="cta"><button class="btn" data-a="close">Үгүй</button><button class="btn go" data-a="pxSell">+${fmt(got)} зарах</button></div>`
  : `<div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`}`;
}
ACT.pxSell = () => { const q = FS.pxq, P = me(), held = sum(ownOf(P, q.sym), a => a.qty); if (!held || !canAct(P)) return;
  snap(coName(q.sym) + ' зарах'); sellAny(G, P, q.sym, held, q.px, q.card); FS.done.sold = held * q.px; save(); render(); drawSheet(); buzz(15); };
/* one phone: the other players who hold that company are listed with a sell button */
function fStockLocal() {
  const q = FS.pxq, ps = G.players.filter(p => !p.out && isV3(p) && p.id !== me().id && sum(ownOf(p, q.sym), a => a.qty) > 0);
  return `${head('Бусад нь зарах уу?')}<div class="box"><div class="ln" style="border:0;padding:0"><b style="font-size:17px">${esc(coName(q.sym))}</b><b style="font-size:20px">${fmt(q.px)}</b></div></div>
  <div class="box">${ps.map(Q => { const hs = ownOf(Q, q.sym), h = sum(hs, a => a.qty), cost = sum(hs, a => a.qty * (a.unitCost || a.price)), g = h * q.px - cost, k = 'l:' + Q.id;
    return `<div class="ln"><span>${esc(Q.name)} · ${h.toLocaleString('en')} ${unitOf(q.sym)}<span class="sub ${g >= 0 ? 'pos' : 'neg'}">${g >= 0 ? 'ашиг' : 'алдагдал'} ${fmt(g, { sign: true })}</span></span>${FS.done[k] ? '<b class="pos">Зарсан</b>' : `<button class="minibtn go" data-a="pxSellL" data-p="${Q.id}" data-k="${k}">+${fmtS(h * q.px)} зарах</button>`}</div>`; }).join('') || '<p class="empty">Зарах хүн алга</p>'}</div>
  <div class="cta"><button class="btn go" data-a="close">Дуусгах</button></div>`;
}
ACT.pxSellL = d => { const q = FS.pxq, Q = PL1(d.p), h = sum(ownOf(Q, q.sym), a => a.qty); if (!h) return; snap(coName(q.sym) + ' зарах'); sellAny(G, Q, q.sym, h, q.px, null); FS.done[d.k] = 1; save(); render(); drawSheet(); buzz(15); };
/* a prompt that came while another screen was open shows up once that screen closes */
{ const cs1 = closeSheet; closeSheet = function () { const r = cs1.apply(this, arguments); if (UI.pxQ && UI.pxQ.length && G && G.mode === 'online') { const q = UI.pxQ.shift(); setTimeout(() => pxOpen(q), 250); } return r; }; }

/* ---- gold, silver: units, no income, sold only through a market card ---- */
function actMetal1(P, c) {
  const px = FS.px || 0, qty = FS.qty || 0, cost = qty * px, fee = offerFee(cost);
  return `${unitFields(c, true)}${unitTotal(P, c, cost, fee)}${cost ? shortfall(P, cost + fee) : ''}
  <div class="cta">${skipBtn()}${payBtn(P, cost + fee, 'metalOk', !px ? 'Үнээ бичнэ үү' : qty ? 'Авах' : 'Тоо оруулна уу', qty > 0 && px > 0 && !(c.fx.max && qty > c.fx.max))}</div>`;
}
ACT.metalOk = () => { const P = me(); const c = CARD[FS.card]; const cost = (FS.qty || 0) * (FS.px || 0); if (c.fx.max && FS.qty > c.fx.max) return toast(`Нэг картаар ${c.fx.max} хүртэл`); if (!(FS.qty > 0) || !(FS.px > 0) || P.cash < cost + offerFee(cost)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title); buyMetal(G, P, c, FS.qty, FS.px); payOffer(P, cost, c); save(); closeSheet(); buzz(20); };

/* ---- card deposit (16 / 18 / 20%, paid every payday, 8 paydays) ---- */
function actCdep1(P, c) {
  const fx = c.fx, amt = FS.amt || 0, per = R(amt * fx.rate / 100);
  return `<div class="box" style="display:grid;gap:10px"><h4>Дүн <span>Орлого бүр ${fx.rate}%</span></h4>${stepper('amt', amt, 1000000)}${chips('amt', [1e7, 2e7, 5e7, 1e8])}
    <div class="ln"><span>Орлого бүр</span><b class="pos">+${fmt(per)}</b></div><div class="ln"><span>Хугацаа</span><b>${fx.term} Орлого (${R(fx.term / L1.ppy)} жил)</b></div>
    ${sm(`Эрт авбал −${fmt(per)}`)}</div>
  ${FS.offerLock ? offerHTML(P, 0) : ''}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, amt + offerFee(0), 'cdepOk', fmtS(amt) + ' хадгалах', amt > 0)}</div>`;
}
ACT.cdepOk = () => { const P = me(); const c = CARD[FS.card]; if (!(FS.amt > 0) || FS.amt + offerFee(0) > P.cash) return; snap(c.title); openSave1(G, P, 'card', FS.amt, { card: c.id }); payOffer(P, 0, c); save(); closeSheet(); buzz(15); };

/* ---- training: pay now, salary rises after N paydays (max 2) ---- */
function actSkill1(P, c) {
  const fx = c.fx, wip = P.skills.filter(s => s.left > 0).length, full = P.skills.length >= SK_TOTAL || wip >= SK_AT_ONCE;
  return `${cpOn(P) ? '' : `<div class="box"><div class="ln"><span>Төлбөр</span><b>${fmt(fx.cost)}</b></div><div class="ln"><span>${fx.left} Орлогын дараа</span><b class="pos">цалин +${fx.pct}%</b></div>
    <div class="ln"><span>Цалин</span><b>${fmtS(salaryOf(P))} → ${fmtS(R(salaryOf(P) * (1 + fx.pct / 100)))}</b></div></div>`}
  ${full ? `<div class="alert neg">${ic('warning-circle')}<span><b>${P.skills.length >= SK_TOTAL ? `Та ${SK_TOTAL} ур чадвар эзэмшсэн байна` : `Нэг дор ${SK_AT_ONCE} сургалтад сууж байна`}</b>${P.skills.length >= SK_TOTAL ? '' : 'Нэгийгээ төгссөний дараа дараагийнхад сууна.'}</span></div>` : shortfall(P, fx.cost)}
  ${FS.offerLock ? offerHTML(P, 0) : ''}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, fx.cost + offerFee(0), 'skillOk1', 'Сургалтад суух', !full)}</div>`;
}
ACT.skillOk1 = () => { const P = me(); const c = CARD[FS.card]; if (P.cash < c.fx.cost + offerFee(0)) return toast('Бэлэн мөнгө хүрэлцэхгүй'); snap(c.title); buySkill(G, P, c); payOffer(P, 0, c); save(); closeSheet(); };

/* ---- risk / scam: pay, roll, win back only on the printed numbers ---- */
function actScam1(P, c) {
  const fx = c.fx, rng = fx.win[0] === fx.win[1] ? fx.win[0] : fx.win.join('–');
  if (FS.paid) {
    const v = FS.die;
    if (!v) return `<div class="box"><h4>Шоо хэд буув?</h4></div>${dicePad('scamDie')}`;
    const won = v >= fx.win[0] && v <= fx.win[1];
    return `<div class="dice"><div class="die">${v}</div></div><p class="big ${won ? 'pos' : 'neg'}">${won ? '+' + fmt(fx.back) : 'Юу ч үгүй'}</p>
      <div class="cta"><button class="btn go" data-a="scamOk">Үргэлжлүүлэх</button></div>`;
  }
  return `<div class="box"><div class="ln"><span>Оруулах</span><b class="neg">−${fmt(fx.cost)}</b></div><div class="ln"><span>Шоо ${rng}</span><b class="pos">+${fmt(fx.back)}</b></div><div class="ln"><span>Бусад</span><b>0₮</b></div></div>
  ${FS.offerLock ? offerHTML(P, 0) : ''}<div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, fx.cost + offerFee(0), 'scamGo', fmtS(fx.cost) + ' оруулах')}</div>`;
}
ACT.scamGo = () => { const P = me(); const c = CARD[FS.card]; if (P.cash < c.fx.cost + offerFee(0)) return; snap(c.title); pay(G, P, c.fx.cost, c.title, c.id, 'buy'); payOffer(P, 0, c); FS.paid = true; FS.die = null; save(); render(); drawSheet(); };
ACT.scamDie = d => { FS.die = +d.n; drawSheet(); };
ACT.scamOk = () => { const P = me(); const c = CARD[FS.card]; const v = FS.die; const won = v >= c.fx.win[0] && v <= c.fx.win[1];
  if (won) gain(G, P, c.fx.back, `${c.title} · шоо ${v}`, c.id, 'gain'); else log(G, P, `${c.title} · шоо ${v}, юу ч үгүй`, 0, c.id, 'gain'); save(); closeSheet(); };

/* ---- real estate, land, bonds: buy alone or together (2–4 players by share), or take someone's open offer ---- */
function oppCost(c, sh) { const fx = c.fx; return R((fx.k === 're' ? fx.down : fx.price) * sh); }
function buyOpp(G, P, c, o) { const k = c.fx.k; return k === 're' ? buyRE(G, P, c, o) : k === 'land' ? buyLand(G, P, c, o) : buyBond(G, P, c, o); }
function coShares() { return { me: 1, each: 0 }; /* co-buying removed (user 2026-11-02) */ const n = (FS.partners || []).length; return FS.co === '1' && n ? { me: FS.share, each: R((1 - FS.share) / n * 1000) / 1000 } : { me: 1, each: 0 }; }
function coHTML(P, c) {
  return '';   // «Хамтарч авах» removed entirely (user 2026-11-02: not in the game rules)
  const os = others1(P); if (!os.length || FS.offerLock) return '';
  const S = coShares(), pc = Math.round(S.me * 100);
  return `<div class="box" style="display:grid;gap:10px">${seg('co', [['0', 'Ганцаараа'], ['1', 'Хамтарч']])}
    ${FS.co === '1' ? `<div class="chips">${os.map(o => `<button class="chip" data-a="coP" data-id="${o.id}" aria-pressed="${FS.partners.includes(o.id)}">${esc(o.name)}</button>`).join('')}</div>
      <label class="mute" style="font-size:12px;font-weight:700">Таны хувь: ${pc}%</label>
      <input type="range" min="10" max="90" step="5" value="${pc}" data-in="coShare" aria-label="Таны хувь">
      ${FS.partners.length ? FS.partners.map(id => { const o = PL1(id); const need = oppCost(c, S.each); return `<div class="ln"><span>${esc(o.name)} · ${Math.round(S.each * 100)}%</span><b class="${G.mode !== 'online' && o.cash < need ? 'neg' : ''}">${fmtS(need)}</b></div>`; }).join('') : sm('Хамтрагчаа сонгоно уу')}` : ''}</div>`;
}
ACT.coP = d => { const a = FS.partners || []; FS.partners = a.includes(d.id) ? a.filter(x => x !== d.id) : a.length < 3 ? a.concat(d.id) : a; drawSheet(); };
ACT.coShare = (d, el) => { FS.share = +el.value / 100; clearTimeout(pqT); pqT = setTimeout(drawSheet, 200); };
function actOpp1(P, c) {
  const fx = c.fx, S = coShares(), cost = oppCost(c, S.me), fee = offerFee(cost);
  const net = R((fx.net || 0) * S.me);
  const rows = fx.k === 're' ? `<div class="ln"><span>Урьдчилгаа</span><b>${fmt(cost)}</b></div><div class="ln"><span>Үлдэгдэл өр</span><b>${fmtS(R((fx.price - fx.down) * S.me))}</b></div><div class="ln"><span>4 сарын ашиг</span><b class="pos">+${fmt(net * 4)}</b></div>`
    : fx.k === 'bond' ? `<div class="ln"><span>Үнэ</span><b>${fmt(cost)}</b></div><div class="ln"><span>4 сарын ашиг</span><b class="pos">+${fmt(net * 4)}</b></div><div class="ln"><span>Хугацаа</span><b>${fx.term} Орлого</b></div>`
    : `<div class="ln"><span>Үнэ</span><b>${fmt(cost)}</b></div><div class="ln"><span>Орлого</span><b>0₮</b></div>`;
  const partOk = FS.co !== '1' || (FS.partners.length && (G.mode === 'online' || FS.partners.every(id => PL1(id).cash >= oppCost(c, S.each))));
  return `${cpOn(P) ? '' : `<div class="box">${rows}</div>`}${coHTML(P, c)}${FS.offerLock ? offerHTML(P, cost) : ''}
  ${cashPrev(P, -cost - fee, net)}${shortfall(P, cost + fee)}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, cost + fee, 'oppOk', FS.co === '1' ? 'Хамтарч авах' : 'Авах', partOk)}</div>`;
}
ACT.oppOk = () => {
  const P = me(); const c = CARD[FS.card]; const S = coShares(); const cost = oppCost(c, S.me);
  if (P.cash < cost + offerFee(cost)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title);
  buyOpp(G, P, c, { share: S.me, partner: FS.co === '1' ? FS.partners.join(',') : null });
  payOffer(P, cost, c);
  if (FS.co === '1') for (const id of FS.partners) {
    const o = PL1(id);
    if (G.mode === 'online') NET.emit({ t: 'cobuy', to: id, card: c.id, share: S.each, txt: `${c.title} · хамтарч авах санал` });
    else if (o.cash >= oppCost(c, S.each)) buyOpp(G, o, c, { share: S.each, partner: P.id });
  }
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: `${c.title} авлаа` });
  save(); closeSheet(); buzz(20); toast(FS.co === '1' && G.mode === 'online' ? 'Хамтрагчийн хариуг хүлээж байна' : `${c.title} — таны хөрөнгө`);
};
/* partner side of a joint purchase: confirms before paying (§11) */
function fCobuy() {
  const e = FS.cob, c = CARD[e.card], P = me(), cost = oppCost(c, e.share);
  return `${head('Хамтарч авах санал', `<span>${esc(FS.from)}</span>`)}${cardHTML(c, { short: true })}
  <div class="box"><div class="ln"><span>Таны хувь</span><b>${Math.round(e.share * 100)}%</b></div><div class="ln"><span>Төлөх</span><b>${fmt(cost)}</b></div>${c.fx.net ? `<div class="ln"><span>4 сарын ашиг</span><b class="pos">+${fmt(R(c.fx.net * e.share) * 4)}</b></div>` : ''}</div>
  ${shortfall(P, cost)}<div class="cta"><button class="btn" data-a="cobuyNo">Татгалзах</button>${payBtn(P, cost, 'cobuyOk', 'Авах')}</div>`;
}
ACT.cobuyOk = () => { const P = me(); const e = FS.cob; const c = CARD[e.card]; if (P.cash < oppCost(c, e.share)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title); buyOpp(G, P, c, { share: e.share, partner: e.by }); NET.emit({ t: 'cobuyok', to: e.by, txt: `${c.title} · хамтарч авлаа` }); save(); closeSheet(); };
ACT.cobuyNo = () => { const e = FS.cob; NET.emit({ t: 'cobuyno', to: e.by, txt: `${CARD[e.card].title} · хамтрахаас татгалзлаа` }); closeSheet(); };

/* ---------- Зарлага (AZ) ---------- */
function azApplies(P, cond) { const car = !!(P.car || P.flags.car); return cond === 'kids' ? P.kids > 0 : cond === 'car' ? car : cond === 'nocar' ? !car : true; }
function azNo(P, c) {
  return `<div class="alert ok">${ic('seal-check')}<span><b>Танд хамаарахгүй</b>${esc(c.scope || '')}</span></div><div class="cta"><button class="btn go" data-a="skipCard">Хаах</button></div>`;
}
const azPayCta = (P, amt, label) => `${payPrev(P, amt)}${shortfall(P, amt)}<div class="cta">${payBtn(P, amt, 'azPay', label || fmt(amt) + ' төлөх', amt > 0, `data-amt="${amt}"`)}</div>`;
ACT.azPay = d => { const P = me(); const c = CARD[FS.card]; const amt = +d.amt; snap(c.title);
  const o = c.fx.opts ? c.fx.opts[+FS.opt] : null;
  spend(G, P, amt, c.title + (o ? ' · ' + o.l.replace(/^[АБ]\.\s*/, '') : ''), c.id);
  if (c.fx.k === 'tool' && +FS.opt === 0 && profMatch(P, c.fx.profs)) raiseSalary(G, P, c.fx.pct, c.title, c.id);
  save(); closeSheet(); };
function actPay1(P, c) { return azApplies(P, c.fx.cond) ? azPayCta(P, c.fx.amt) : azNo(P, c); }
function optSeg(c, val) { return `<div class="box azpick" style="display:grid;gap:8px"><h4>Аль нэгийг сонгоно</h4>${seg('opt', c.fx.opts.map((o, i) => [String(i), `${esc(o.l.replace(/^[АБ]\.\s*/, ''))}<br><small>${val(o)}</small>`])).replace('class="seg"', 'class="seg pick sk2"')}</div>`; }
function actWant1(P, c) { if (!azApplies(P, c.fx.cond)) return azNo(P, c); if (FS.opt === '') return optSeg(c, o => fmtS(o.amt)) + pickFirst(); const o = c.fx.opts[+FS.opt]; return optSeg(c, o => fmtS(o.amt)) + azPayCta(P, o.amt); }
function actTool1(P, c) {
  if (!azApplies(P, c.fx.cond)) return azNo(P, c);
  if (FS.opt === '') return optSeg(c, o => fmtS(o.amt)) + pickFirst();
  const o = c.fx.opts[+FS.opt], up = +FS.opt === 0 && profMatch(P, c.fx.profs);
  return optSeg(c, o => fmtS(o.amt)) + (up ? okNote(`${esc(PROF[P.profId].title)}: цалин +${c.fx.pct}%`) : '') + azPayCta(P, o.amt);
}
function actIns1(P, c) {
  if (!azApplies(P, c.fx.cond)) return azNo(P, c);
  const cov = c.fx.ins === 'car' ? P.ins.car > 0 : hasHealthCover(P), amt = cov ? c.fx.disc : c.fx.base;
  const nm = c.fx.ins === 'car' ? 'Машины даатгал' : 'Эрүүл мэнд (даатгал + фитнес)';
  return (cov ? okNote(`${nm} · ${fmt(c.fx.base)} → ${fmt(amt)}`) : `<div class="alert neg">${ic('warning-circle')}<span><b>${c.fx.ins === 'car' ? 'Машины даатгалгүй' : 'Даатгал, фитнесгүй'}</b></span></div>`) + azPayCta(P, amt);
}
function actNeed1(P, c) {
  if (!azApplies(P, c.fx.cond)) return azNo(P, c);
  const fx = c.fx;
  const body = `<div class="box azpick" style="display:grid;gap:8px"><h4>Аль нэгийг сонгоно</h4>${seg('opt', [['0', `Бэлнээр<br><small>${fmtS(fx.cash)}</small>`], ['1', `Хуваан<br><small>${fmtS(fx.pay)} × ${fx.months} сар</small>`]]).replace('class="seg"', 'class="seg pick sk2"')}</div>`;
  if (FS.opt === '') return body + pickFirst();
  if (+FS.opt === 0) return body + azPayCta(P, fx.cash);
  return body + cashPrev(P, 0, -fx.pay) + `<div class="cta"><button class="btn go" data-a="azPlan">Сард ${fmt(fx.pay)} · ${fx.months} сар</button></div>`;
}
ACT.azPlan = () => { const P = me(); const c = CARD[FS.card]; snap(c.title);
  P.plans.push({ id: uid('n'), kind: 'inst', l: c.title, pay: c.fx.pay, left: c.fx.months, card: c.id });
  log(G, P, `${c.title} · сард ${fmt(c.fx.pay)} × ${c.fx.months} сар`, 0, c.id, 'pay'); save(); closeSheet(); };
function actCar1(P, c) {
  if (!azApplies(P, c.fx.cond)) return azNo(P, c);   // «Машингүй хүнд» only
  if (FS.opt === '') return optSeg(c, o => `${fmtS(o.price)} · ${fmtS(o.pay * 4)} / 4 сар`) + pickFirst();
  const o = c.fx.opts[+FS.opt];
  return optSeg(c, o => `${fmtS(o.price)} · ${fmtS(o.pay * 4)} / 4 сар`) + cashPrev(P, 0, -o.pay) + sm(`Урьдчилгаагүй · ${c.fx.months} сар`) + `<div class="cta"><button class="btn go" data-a="azCar">Сард ${fmt(o.pay)} · ${c.fx.months} сар</button></div>`;
}
ACT.azCar = () => { if (FS.opt === '') return; const P = me(); const c = CARD[FS.card]; const o = c.fx.opts[+FS.opt]; snap(c.title);
  P.plans.push({ id: uid('n'), kind: 'car', l: o.l.replace(/^[АБ]\.\s*/, ''), pay: o.pay, left: c.fx.months, card: c.id });
  P.car = true; P.flags.car = true;
  log(G, P, `${c.title} · ${o.l} · сард ${fmt(o.pay)} × ${c.fx.months} сар`, 0, c.id, 'buy'); save(); closeSheet(); toast('Өөрийн машинтай боллоо'); };
/* Амьдралын эхлэл: added once to the starting cash */
function actStart1(P, c) {
  if (P.start) return `${okNote(`Оруулсан: ${esc(CARD[P.start].title)}`)}<div class="cta"><button class="btn go" data-a="close">Хаах</button></div>`;
  return cashPrev(P, c.fx.amt, 0) + `<div class="cta"><button class="btn go" data-a="startOk">${c.fx.amt ? fmtS(c.fx.amt, { sign: true }) : 'Хэрэгжүүлэх'}</button></div>`;
}
ACT.startOk = () => { const P = me(); snap('Амьдралын эхлэл'); applyStart(G, P, FS.card); save(); closeSheet(); };

/* ---------- Зах зээл (ZZ): every player it touches, on every phone ---------- */
function zzWho(fx) { const P = me(); if (fx.who === 'me' || G.mode === 'online') return [P]; return G.players.filter(p => !p.out && isV3(p)); }
function zzOpen(id, o = {}) {
  const c = CARD[id], fx = c.fx;
  FS = Object.assign({ card: id, done: {}, fund: true }, o);
  if (!o.incoming && G.mode === 'online' && fx.who === 'all' && fx.kind !== 'shares_gamble') NET.emit({ t: 'card', card: id });
  zzAuto(c, o.roll);
  openSheet(fZZ1);
}
function zzAuto(c, roll) {
  const fx = c.fx, ps = zzWho(fx);
  if (!['shares_mult', 'salary_prof', 'salary_all', 'infl', 'bond_default'].includes(fx.kind) && !(fx.kind === 'shares_gamble' && roll)) return;
  if (!ps.some(P => zzHits(P, fx).length)) return;
  snap(c.title);
  for (const P of ps) {
    const hits = zzHits(P, fx); if (!hits.length) continue;
    if (fx.kind === 'shares_mult') sharesMult(G, P, fx.tags, fx.val, c.id);
    else if (fx.kind === 'shares_gamble') sharesMult(G, P, fx.tags, roll <= 3 ? 0.5 : 2, c.id);
    else if (fx.kind === 'salary_prof' || fx.kind === 'salary_all') raiseSalary(G, P, R(fx.val * 100), c.title, c.id);
    else if (fx.kind === 'infl') { P.infl = (P.infl || 1) * (1 + fx.val); log(G, P, `${c.title}: сарын зардал +${R(fx.val * 100)}%`, 0, c.id, 'market'); }
    else if (fx.kind === 'bond_default') for (const a of hits) a.skip = true;
  }
  FS.applied = true; FS.roll = roll || FS.roll; save();
}
function zzRows(P, c) {
  const fx = c.fx, hits = zzHits(P, fx), D = FS.done;
  if (!hits.length) return '';
  const sell = a => { const pr = zzPrice(a, fx), got = fx.kind === 'buy' || fx.kind === 'sell_plus' ? pr - (a.debt || 0) : pr, k = 'z:' + a.id;
    // page layout: spell the sale out — what the buyer pays, the loan that is paid off, what reaches you (user 2026-11-02: «ойлгомжгүй»)
    if (cpOn(me())) return `<div class="zs"><div class="zs-h"><b>Таны ${esc(a.name.toLowerCase())}</b>${a.share < 1 ? `<span>${Math.round(a.share * 100)}%</span>` : ''}</div>
      <div class="zs-r"><span>Худалдан авагч төлнө</span><b>${fmt(pr)}</b></div>${a.debt && got !== pr ? `<div class="zs-r"><span>Банкны зээлээ хаана</span><b class="neg">−${fmt(a.debt)}</b></div>` : ''}
      <div class="zs-r t"><span>Танд орно</span><b class="pos">+${fmt(got)}</b></div>
      ${D[k] ? '<div class="zs-done">Зарсан</div>' : `<button class="zs-go" data-a="zzSell" data-p="${P.id}" data-id="${a.id}" data-v="${got}" data-k="${k}">Зарах</button>`}</div>`;
    return `<div class="ln"><span>${esc(a.name)}${a.share < 1 ? ` · ${Math.round(a.share * 100)}%` : ''}<span class="sub">${fmtS(pr)}${a.debt ? ' − өр ' + fmtS(a.debt) : ''}</span></span>${D[k] ? '<b class="pos">Зарсан</b>' : `<button class="minibtn go" data-a="zzSell" data-p="${P.id}" data-id="${a.id}" data-v="${got}" data-k="${k}">${cpOn(me()) ? 'Зарах · ' : ''}+${fmtS(got)}</button>`}</div>`; };
  switch (fx.kind) {
    case 'buy': case 'sell_plus': case 'bond_buy': case 'buy_mult': return hits.map(sell).join('');
    case 'buy_metal': { const q = sum(hits, a => a.qty), k = 'm:' + P.id; return `<div class="ln"><span>${L1.metalName[fx.tags]} ${q} ш × ${fmt(fx.val)}</span>${D[k] ? '<b class="pos">Зарсан</b>' : `<button class="minibtn go" data-a="zzMetal" data-p="${P.id}" data-k="${k}">+${fmtS(q * fx.val)}</button>`}</div>`; }
    case 'pay_if': return D.paid ? '<p class="pos" style="font-weight:800">Төллөө</p>' : `${payPrev(P, fx.val)}${shortfall(P, fx.val)}<div class="row" style="margin-top:8px">${payBtn(P, fx.val, 'zzPay', fmt(fx.val) + ' төлөх')}</div>`;
    case 'bond_default': return hits.map(a => { const v = D['b:' + a.id]; return `<div class="ln" style="flex-wrap:wrap"><span>${esc(a.name)}<span class="sub">Энэ цалин ашиггүй · шоо 1–2 бол устна</span></span>${v ? `<b class="${v <= 2 ? 'neg' : 'pos'}">${v} · ${v <= 2 ? 'Устлаа' : 'Үлдлээ'}</b>` : ''}</div>${v ? '' : dicePad('zzBond', `data-p="${P.id}" data-id="${a.id}"`)}`; }).join('');
    case 'shares_mult': case 'shares_gamble': return hits.length ? hits.map(a => `<div class="ln"><span>${esc(coName(a.sym))}</span><b>${a.qty.toLocaleString('en')} ш</b></div>`).join('') : '';
    case 'salary_prof': case 'salary_all': return `<div class="ln"><span>Цалин +${R(fx.val * 100)}%</span><b class="pos">${fmtS(salaryOf(P))}</b></div>`;
    case 'infl': return `<div class="ln"><span>Зардал +${R(fx.val * 100)}% · 4 сар</span><b class="neg">${fmtS(fin1(P, G).expenses * 4)}</b></div>`;
  }
  return '';
}
function fZZ1() {
  const c = CARD[FS.card], fx = c.fx, ps = zzWho(fx);
  const anyone = G.players.some(p => !p.out && isV3(p) && zzHits(p, fx).length && (fx.who !== 'me' || p.id === me().id));
  const gamble = fx.kind === 'shares_gamble' && !FS.roll && !FS.incoming;
  let blocks = ps.map(P => { const r = zzRows(P, c); return r ? `<div class="box">${ps.length > 1 ? `<div class="sec">${esc(P.name)}</div>` : ''}${r}</div>` : ''; }).join('');
  if (cpOn(me())) {   // market page v4 (2026-11-02): mascot on top, the news as one plain offer, then what it means for you
    const who = FS.incoming ? `${esc(FS.from || '')} сугаллаа` : '';
    const goes = blocks.match(/<button class="zs-go"[^>]*>Зарах<\/button>/g) || [];
    let cta;
    if (goes.length === 1) { blocks = blocks.replace(goes[0], ''); cta = `<button class="btn" data-a="zzDone">Зарахгүй</button>${goes[0].replace('class="zs-go"', 'class="btn go"')}`; }
    else cta = blocks.includes('zs-go') ? '<button class="btn" data-a="zzDone">Зарахгүй</button>' : `<button class="btn go" data-a="zzDone" ${gamble && anyone ? 'disabled' : ''}>Дууслаа</button>`;
    const dice = `${gamble && anyone ? `<p class="zn-dq">Шоо хэд буув? <span>1–3 бол тал нь, 4–6 бол 2 дахин</span></p>${dicePad('zzRoll')}` : ''}${FS.roll && fx.kind === 'shares_gamble' ? `<div class="dice"><div class="die">${FS.roll}</div></div><p class="big ${FS.roll <= 3 ? 'neg' : 'pos'}">${FS.roll <= 3 ? '× 0.5' : '× 2'}</p>` : ''}`;
    const scope = (c.scope || '').trim(), owns = /buy|sell_plus/.test(fx.kind) && scope;
    const none = !anyone ? `<div class="zn-none"><b>Хэнд ч хамаарахгүй.</b>${FS.incoming ? '' : ' Дахин сугална уу.'}</div>`
      : `<div class="zn-none">${owns ? `Танд ${esc(scope.toLowerCase())} байхгүй.` : 'Танд хамаарахгүй.'}</div>`;
    return zzPage4(c, `${dice}${blocks ? `<div class="zn-you">${ps.length > 1 || blocks.includes('class="zs"') ? '' : '<div class="zn-lb">Танд</div>'}${blocks}</div>` : none}<div class="cta">${cta}</div>`, who);
  }
  return `${head(FS.incoming ? 'Зах зээлийн мэдээ' : 'Зах зээл', FS.incoming ? `<span>${esc(FS.from || '')} сугаллаа</span>` : `<span>Зах зээл</span>›<b>${cnoS(c)}</b>`)}${cardHTML(c, { short: true })}
  ${gamble && anyone ? `<div class="box"><h4>Шоо хэд буув? <span>1–3 ×0.5 · 4–6 ×2</span></h4></div>${dicePad('zzRoll')}` : ''}
  ${FS.roll && fx.kind === 'shares_gamble' ? `<div class="dice"><div class="die">${FS.roll}</div></div><p class="big ${FS.roll <= 3 ? 'neg' : 'pos'}">${FS.roll <= 3 ? '× 0.5' : '× 2'}</p>` : ''}
  ${blocks || (anyone ? '' : `<div class="alert">${ic('rotate-ccw')}<span><b>Хэнд ч хамаарахгүй</b>${FS.incoming ? '' : 'Дахин сугална уу (3 хүртэл)'}</span></div>`)}
  <div class="cta"><button class="btn go" data-a="zzDone" ${gamble && anyone ? 'disabled' : ''}>Дууслаа</button></div>`;
}
ACT.zzSell = d => { const P = PL1(d.p); const c = CARD[FS.card]; const a = P.assets.find(x => x.id === d.id); if (!a) return;
  snap('Зарах'); sellRE(G, P, a.id, +d.v, c.title, c.id); FS.done[d.k] = 1; save(); render(); drawSheet(); buzz(20); };
ACT.zzMetal = d => { const P = PL1(d.p); const c = CARD[FS.card]; const q = sum(metalsOf(P, c.fx.tags), a => a.qty);
  snap('Зарах'); sellMetal(G, P, c.fx.tags, q, c.fx.val, c.id); FS.done[d.k] = 1; save(); render(); drawSheet(); buzz(20); };
ACT.zzPay = () => { const P = me(); const c = CARD[FS.card]; snap(c.title); spend(G, P, c.fx.val, c.title, c.id); FS.done.paid = 1; save(); render(); drawSheet(); };
ACT.zzBond = d => { const P = PL1(d.p); const c = CARD[FS.card]; const a = P.assets.find(x => x.id === d.id); const v = +d.n; snap('Бонд');
  if (v <= 2) { P.assets = P.assets.filter(x => x.id !== a.id); log(G, P, `${a.name} · шоо ${v}, бонд устлаа`, 0, c.id, 'market'); } else log(G, P, `${a.name} · шоо ${v}, бонд үлдлээ`, 0, c.id, 'market');
  FS.done['b:' + a.id] = v; save(); render(); drawSheet(); };
ACT.zzRoll = d => { const c = CARD[FS.card]; const v = +d.n; zzAuto(c, v); FS.roll = v; if (G.mode === 'online') NET.emit({ t: 'card', card: c.id, roll: v }); render(); drawSheet(); };
ACT.zzDone = () => { const c = CARD[FS.card]; if (!FS.applied && !Object.keys(FS.done || {}).length) log(G, me(), c.title, 0, c.id, 'market'); save(); closeSheet(); };

/* ---------- squares ---------- */
function openSquare1(s, i, manual) {
  const t = s.type;
  if (t === 'PAY') return ACT.sqPay();
  if (t === 'FIRED') { FS = { sq: s, job: null, fund: true }; return openSheet(fFired1); }
  if (t === 'HEALTH') { FS = { sq: s, hd: null, fund: true }; return openSheet(fHealth1); }
  if (t === 'EDU') { FS = { sq: s }; return openSheet(fEdu1); }
  return openSquareOld(s, i, manual);
}
/* Орлого popup v2 (user 2026-11-03: «бүхэлдээ… дизайн»): a navy payslip card like the home cash card, the mascot popping out of it,
   then the breakdown as icon rows */
function fPayAsk1() {
  const P = me(), f = fin1(P, G), M = L1.mpp, ex = f.salary * M + f.paydayPassive - f.delta, up = f.delta >= 0;
  const after = P.cash + f.delta;
  const row = (icn, bg, fg, l, sub, v, cls) => `<div class="ps-r"><span class="ps-i" style="background:${bg};color:${fg}">${ic2(icn)}</span><span class="ps-t"><b>${l}</b><small>${sub}</small></span><em class="${cls}">${v}</em></div>`;
  return `<div class="ps">
  <div class="ps-card ${up ? '' : 'neg'}">
    <div class="h3-deco"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="r1"></i><i class="d1"></i></div>
    <button class="ps-x" data-a="close" aria-label="Хаах">${X.match(/<svg[\s\S]*<\/svg>/)[0]}</button>
    <small class="ps-lb">${M} сарын орлого</small>
    <b class="ps-amt">${fmt(f.delta, { sign: true }).replace('₮', '')}<span>₮</span></b>
    <span class="ps-chip">Бэлэн мөнгө → ${fmtS(after)}</span>
    <img class="ps-oct" src="${ART(up ? 'm_pay' : 'm_worry')}" alt="">
  </div>
  <div class="ps-list">
    ${row('r:wallet', '#E6F4EC', '#13804B', 'Цалин', `${fmtS(f.salary)} × ${M} сар`, '+' + fmt(f.salary * M), 'pos')}
    ${f.paydayPassive ? row('r:chart-line-up', '#E5EEFB', '#1F4FB0', 'Идэвхгүй орлого', 'хөрөнгө, хадгаламж', '+' + fmt(f.paydayPassive), 'pos') : ''}
    ${row('r:receipt', '#FCE9E7', '#C2412D', 'Зардал', ex === f.expenses * M ? `${fmtS(f.expenses)} × ${M} сар` : `${M} сарын нийлбэр`, '−' + fmt(ex), 'neg')}
  </div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="payNow">Орлого авах</button></div>
  </div>`;
}
fPayAsk1._zp = 1;
v3Act('sqPay', () => { FS = {}; UI.cpNext = null; openSheet(fPayAsk1); });
const FIRED_SKIP = 2, FIRED_MONTHS = 1;   // fired (dice 1–3): sit out 2 turns (user 2026-11-09) and lose 1 month's salary (user 2026-11-11: «1 сар хэвээр»)
function fFired1() {
  const P = me(), r = 3, v = FS.job, amt = salaryOf(P) * FIRED_MONTHS, lose = v && v <= r;   // 1–3 → 1 month's salary
  return `${head(esc(FS.sq.name))}${stage(v && !lose ? 'p_' + P.profId : 'm_fired', v && !lose ? 'a-hop' : 'a-fired', '', 'sm')}
  <div class="box"><div class="ln"><span><span style="white-space:nowrap">Шоо 1–3</span><span class="sub">${FIRED_MONTHS} сарын цалингаа алдаж, ${FIRED_SKIP} ээлж өнжинө</span></span><b class="neg" style="white-space:nowrap">−${fmt(amt)}</b></div><div class="ln"><span style="white-space:nowrap">Шоо 4–6</span><b>Юу ч болохгүй</b></div></div>
  ${!v ? dicePad('jobDie1') : `<div class="dice"><div class="die">${v}</div></div><p class="big ${lose ? 'neg' : 'pos'}">${lose ? `${FIRED_MONTHS} сарын цалингаа алдаж, ${FIRED_SKIP} ээлж өнжинө` : 'Халагдсангүй'}</p>
    ${lose ? `${payPrev(P, amt)}${shortfall(P, amt)}<div class="cta">${payBtn(P, amt, 'firedOk', fmt(amt) + ' хасах', true, `data-amt="${amt}"`)}</div>` : `<div class="cta"><button class="btn go" data-a="firedOk" data-amt="0">Үргэлжлүүлэх</button></div>`}`}`;
}
ACT.jobDie1 = d => { FS.job = +d.n; drawSheet(); };
ACT.firedOk = d => { const P = me(); snap('Халагдлаа');
  if (+d.amt) { spend(G, P, +d.amt, `Халагдлаа · шоо ${FS.job} · ${FIRED_SKIP} ээлж өнжинө`, null); P.skip = (P.skip || 0) + FIRED_SKIP; toast(`${FIRED_SKIP} ээлж өнжинө`); } else log(G, P, `Халагдлаа · шоо ${FS.job}, юу ч болсонгүй`, 0, null, 'job');
  save(); closeSheet(); };
function fHealth1() {
  const P = me(), v = FS.hd, amt = v ? HEALTH_COST[v] : 0;
  return `${head(esc(FS.sq.name))}<div class="box"><div class="ln"><span>Шоо 1–2</span><b>${fmt(500000)}</b></div><div class="ln"><span>Шоо 3–4</span><b>${fmt(1000000)}</b></div><div class="ln"><span>Шоо 5–6</span><b>${fmt(2000000)}</b></div></div>
  ${v ? `<div class="dice"><div class="die">${v}</div></div>${payPrev(P, amt)}${shortfall(P, amt)}<div class="cta"><button class="btn" data-a="healthRe">Шоо засах</button>${payBtn(P, amt, 'health1Ok', fmt(amt) + ' төлөх', true, `data-amt="${amt}"`)}</div>` : dicePad('healthDie')}`;
}
ACT.health1Ok = d => { const P = me(); snap('Эрүүл мэнд'); spend(G, P, +d.amt, `Эрүүл мэнд · шоо ${FS.hd}`, null); save(); closeSheet(); };
function fEdu1() {
  const P = me(), amt = eduCost(P);
  return `${head(esc(FS.sq.name))}${stage('p_PR-01', 'a-idle', '', 'sm')}
  <div class="box"><div class="ln"><span>Орлого (4 сар) × 10%</span><b class="neg">−${fmt(amt)}</b></div><div class="ln"><span style="white-space:nowrap">Дараагийн 3 ээлж</span><b>2 шоогоор явна</b></div></div>
  ${cashPrev(P, -amt, 0)}${shortfall(P, amt)}<div class="cta"><button class="btn" data-a="close">Үгүй</button>${payBtn(P, amt, 'eduOk', fmt(amt) + ' төлөх')}</div>`;
}

/* ---------- payday ---------- */
function runPaydays1(k, then) {
  const P = me();
  const res = payday1(G, P);
  const bkNow = bkCheck(P);   // 3 paydays in a row where selling everything still leaves the emergency loan unpaid (user 2026-10-26)
  if (bkNow) { const info = bankrupt1(G, P); const next0 = k > 1 ? () => runPaydays1(k - 1, then) : then; save(); render(); FS = { bk: info, then: next0 }; return openSheet(fBankrupt1, { modal: true }); }
  // a negative payday is covered from the emergency fund first (§5.3)
  if (P.cash < 0 && P.efund > 0) { const f = Math.min(P.efund, -P.cash); P.efund -= f; P.cash += f; res.news.push(`Яаралтай сангаас ${fmt(f)} авлаа`); }
  if (res.won && !P.l1won) { P.l1won = P.pd; log(G, P, 'Түвшин 1 дууслаа! Идэвхгүй орлого зардлын 2 дахинд хүрлээ', 0, null, 'level'); if (G.mode === 'online') NET.emit({ t: 'level', txt: 'Түвшин 1 дууслаа!' }); res.first = true; }
  const next = k > 1 ? () => runPaydays1(k - 1, then) : then;
  buzz(25);
  if (G.mode === 'online' && res.payoffs.some(p => p.first)) NET.emit({ t: 'payoff', txt: `анхны өрөө хаалаа: ${res.payoffs[0].debt}` });
  if (res.first || res.decide.length || res.news.length || P.cash < 0) { save(); render(); FS = { pay: res, then: next, pdDone: {} }; return openSheet(fPay1, { modal: true }); }
  UI.celebrate = { at: Date.now(), from: P.cash - res.delta, to: P.cash, delta: res.delta, payoffs: res.payoffs };
  save(); FS = {};
  if (next) next(); else closeSheet();
}
function pdKey(x) { return x.k === 'bond' ? 'b:' + x.id : 'i:' + x.ins; }
function fPay1() {
  const r = FS.pay, P = me(), up = r.delta >= 0, D = FS.pdDone;
  const dec = r.decide.map(x => {
    const k = pdKey(x), done = D[k];
    if (x.k === 'pre') return preRow(P, x.id, done, 'pd');   // presale «Ашиглалтад орох шоо» (prompt v8 §7)
    if (x.k === 'bond') { const a = P.assets.find(z => z.id === x.id); if (!a && !done) return '';
      return `<div class="box"><div class="ln"><span><b>${esc(a ? a.name : 'Бонд')}</b><span class="sub">Хугацаа дууслаа</span></span>${done ? `<b class="pos">${done === 'renew' ? 'Сунгалаа' : 'Буцааж авлаа'}</b>` : ''}</div>
        ${done ? '' : `<div class="row" style="gap:8px;margin-top:8px"><button class="minibtn" data-a="pdBond" data-id="${x.id}" data-k="renew">Сунгах</button><button class="minibtn go" data-a="pdBond" data-id="${x.id}" data-k="back">+${fmtS(a.price)} авах</button></div>`}</div>`; }
    return `<div class="box"><div class="ln"><span><b>${insName(x.ins)}</b><span class="sub">2 жил дууслаа · Сунгах уу?</span></span>${done ? `<b class="${done === 'yes' ? 'pos' : 'mute'}">${done === 'yes' ? 'Сунгалаа' : 'Үгүй'}</b>` : ''}</div>
      ${done ? '' : `<div class="row" style="gap:8px;margin-top:8px"><button class="minibtn" data-a="pdIns" data-k="${x.ins}" data-y="0">Үгүй</button><button class="minibtn go" data-a="pdIns" data-k="${x.ins}" data-y="1" ${P.cash >= L1.ins[x.ins] ? '' : 'disabled'}>${fmtS(L1.ins[x.ins])} сунгах</button></div>`}</div>`;
  }).join('');
  const left = r.decide.filter(x => !D[pdKey(x)]).length;
  return `<div class="paypop ${up ? 'up' : 'dn'}">${X}${stage('p_' + P.profId, up ? 'a-pay' : 'a-worry')}
  <h3>${r.first ? 'Түвшин 1 дууслаа!' : up ? 'Орлого орлоо!' : 'Алдагдалтай'}</h3>
  <p class="paynum ${up ? 'pos' : 'neg'}" data-fx="pay" data-v="${r.delta}">${fmt(r.delta, { sign: true })}</p>
  <p class="paysub">${r.pd}-р Орлого · ${L1.mpp} сар · Бэлэн ${fmtS(P.cash)}</p></div>
  ${r.first ? `<div class="celebrate"><h3>Санхүүгийн эрх чөлөө</h3><p>Идэвхгүй ${fmtS(r.f1.passive)} ≥ 2 × зардал ${fmtS(r.f1.goal)}</p></div>` : ''}
  ${P.bkWarn ? `<div class="alert neg">${ic('warning')}<span><b>Дампуурлын анхааруулга ${P.bkWarn}/${BK.paydays}</b>Бүх хөрөнгөө зараад ч өрөө төлж чадахгүй байна. ${BK.paydays - P.bkWarn} Орлогын дотор засахгүй бол дампуурна.</span></div>` : ''}
  ${r.payoffs.map(p => `<div class="alert ok">${ic('trophy')}<span><b>${esc(p.debt)} хаагдлаа</b>Сард +${fmt(p.pay)}</span></div>`).join('')}
  ${r.news.filter(n => !/хаагдлаа|дууслаа — сард/.test(n) || !r.payoffs.length).map(n => `<div class="alert">${ic('newspaper')}<span>${esc(n)}</span></div>`).join('')}
  ${dec}
  ${P.cash < 0 ? `<div class="alert neg">${ic('warning-circle')}<span><b>Бэлэн мөнгө ${fmt(P.cash)}</b><span class="row"><button class="minibtn go" data-a="lackAsk" data-go="pdLoanDone" data-need="0">Зээл авах</button></span></span></div>` : ''}
  <div class="cta">${r.first ? `<button class="btn" data-a="payDone1" ${left ? 'disabled' : ''}>Дараа</button><button class="btn go" data-a="levelUp" ${left ? 'disabled' : ''}>${G.settings.endAtL1 ? 'Ялалт' : 'Түвшин 2'}</button>` : `<button class="btn go" data-a="payDone1" ${left ? 'disabled' : ''}>${left ? left + ' шийдвэр үлдлээ' : 'Үргэлжлүүлэх'}</button>`}</div>`;
}
ACT.pdBond = d => { const P = me(); const a = P.assets.find(x => x.id === d.id); if (!a) return; snap('Бонд');
  if (d.k === 'renew') { a.left = a.term; log(G, P, `${a.name} сунгалаа`, 0, a.card, 'save'); }
  else { P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, a.price, `${a.name} · үнээ буцааж авлаа`, a.card, 'sell'); }
  if (FS.pdDone) FS.pdDone['b:' + d.id] = d.k; save(); render(); drawSheet(); };
ACT.pdIns = d => { const P = me(); snap('Даатгал'); if (+d.y && !buyIns(G, P, d.k)) return toast('Бэлэн мөнгө хүрэлцэхгүй'); FS.pdDone['i:' + d.k] = +d.y ? 'yes' : 'no'; save(); render(); drawSheet(); };
ACT.payDone1 = () => { const r = FS.pay; if (r.decide.some(x => !FS.pdDone[pdKey(x)])) return; ACT.payDone(); };

/* ---------- Эрх чөлөө (one condition, §4) ---------- */
function freeBar1(P, f) {
  const pct = f.progress, p = Math.floor(pct * 100), N = 10, on = Math.floor(pct * N + 1e-9);
  const a = Math.PI * pct, x = 50 - 40 * Math.cos(a), y = 50 - 40 * Math.sin(a);
  const gauge = `<svg class="fg-g" viewBox="0 0 100 56" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" class="tr"/>${pct > 0 ? `<path d="M10 50 A40 40 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="fg"/>` : ''}<text x="50" y="48" text-anchor="middle">${p}%</text></svg>`;
  return `<div class="fbar fg" data-a="freeInfo" role="button" tabindex="0">
    <div class="fg-top">${gauge}<div class="fg-t"><b>Санхүүгийн эрх чөлөө</b><small>Идэвхгүй орлого ${fmtS(f.passive * 4)} / ${fmtS(f.goal * 4)} · 4 сар</small></div></div>
    <div class="fg-road"><span class="fg-cells">${Array.from({ length: N }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}<span class="fg-me" style="left:clamp(12px, ${(pct * 100).toFixed(1)}%, calc(100% - 12px))"><span style="background-image:url(${mascot(P.profId)})"></span></span></span><span class="fg-goal">★</span></div></div>`;
}
function fFree1() {
  const P = me(), f = fin1(P, G);
  const pas = f.pas.filter(x => x.m).map(x => `<div class="ln"><span>${esc(x.l)}</span><b class="pos">+${fmt(R(x.m * 4))}</b></div>`).join('') || '<p class="empty" style="padding:4px 0 8px">Одоогоор алга</p>';
  const liv = livRows(P, f).filter(r => r.kind !== 'tax').map(r => `<div class="ln"><span>${esc(r.l)}</span><b class="neg">−${fmt(r.v * 4)}</b></div>`).join('');
  return `${head('Санхүүгийн эрх чөлөө')}
  <div class="svsum"><div><small>Идэвхгүй орлого / 4 сар</small><b class="pos">${fmtS(f.passive * 4)}</b></div><div><small>2 × амьжиргаа / 4 сар</small><b class="neg">${fmtS(f.goal * 4)}</b></div><div><small>Дутуу</small><b>${f.free ? '✓' : fmtS(f.gap * 4)}</b></div></div>
  <p class="mute" style="font-size:13px">Идэвхгүй орлого 4 сарын амьжиргааны зардлын 2 дахин нугалсан орлоготой болоход (${fmtS(f.living * 4)} × 2) хүрмэгц та санхүүгийн эрх чөлөөнд хүрч Шарк тоглогч болно.</p>
  <div class="box"><div class="sec">Идэвхгүй орлого <span>4 сар</span></div>${pas}<div class="sec" style="margin-top:6px">Амьжиргааны зардал <span>татвараас бусад · 4 сар</span></div>${liv}</div>`;
}
/* every monthly cost line (prompt §3) */
function livRows(P, f) {
  const rows = f.lines.filter(e => e.kind !== 'adj').map(e => { const d = P.debts.find(x => x.line === e.id && x.bal > 0);
    return { l: e.l, v: e.v, kind: e.kind, sub: e.kind === 'tax' ? 'Цалингаас' : d ? `Үлдэгдэл ${fmtS(d.bal)}` : '', id: d ? d.id : null }; });
  if (P.kids) rows.push({ l: `Хүүхэд × ${P.kids}`, v: f.kids, sub: '' });
  for (const x of P.plans) rows.push({ l: x.l, v: x.pay, sub: `${x.left} сар үлдсэн`, kind: x.kind });
  for (const x of f.loans) rows.push({ l: x.d.l, v: x.pay, sub: x.d.kind === 'bankl' ? `${Math.ceil(monthsLeft(x.d) / L1.mpp)} Орлого үлдсэн · үлдэгдэл ${fmtS(x.d.bal)}` : `Хүү · үлдэгдэл ${fmtS(x.d.bal)}`, id: x.d.id, kind: 'loan' });
  return rows;
}
function fExp1() {
  const P = me(), f = fin1(P, G), rows = livRows(P, f).sort((a, b) => b.v - a.v), top = Math.max(1, ...rows.map(r => r.v));
  const since = []; for (const h of P.hist || []) { if (h.kind === 'payday') break; if (h.amt < 0 && !['save', 'repay', 'buy'].includes(h.kind)) since.push(h); }
  return `${head('Зардал')}
  <div class="svsum"><div><small>Зардал / 4 сар</small><b class="neg">−${fmtS(f.expenses * 4)}</b></div><div><small>Орлого / 4 сар</small><b class="pos">+${fmtS(f.income * 4)}</b></div><div><small>Ашиг / 4 сар</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmtS(f.cf * 4, { sign: true })}</b></div></div>
  <div class="box"><div class="sec">4 сар бүр</div>${rows.map(r => `<div class="xrow"><span><b>${esc(r.l)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span style="display:flex;align-items:center;gap:8px;flex:none"><em class="neg">−${fmt(r.v * 4)}</em>${r.id && canAct(P) ? `<button class="minibtn go" data-a="expPay" data-id="${r.id}">Төлөх</button>` : ''}</span><i style="width:${(r.v / top * 100).toFixed(1)}%"></i></div>`).join('')}</div>
  ${P.infl > 1.0001 ? sm(`Зах зээл: зардал +${Math.round((P.infl - 1) * 1000) / 10}%`) : ''}
  <div class="box"><div class="sec">Цалингаас хойш <span>нэг удаа</span></div>${since.map(h => `<div class="ln"><span>${esc(h.txt)}</span><b class="neg">${fmt(h.amt)}</b></div>`).join('') || '<p class="empty">Алга</p>'}</div>`;
}

/* ---------- Банк: savings (3 kinds), insurance, emergency fund and loan, personal loans (§5) ---------- */
v3Act('openLoan', d => { const bt = d && d.bt; FS = { bt: bt === 'ins' || (bt === 'em' && me().efund > 0) ? bt : 'sav', sv: null, sAmt: 1000000, sYears: 1, eAmt: 1000000, lAmt: 1000000, pAmt: 1000000, pRate: 2, pTo: null, pDir: 'borrow', pName: '' }; openSheet(fBank1); });
v3Act('openSave', () => ACT.openLoan({ bt: 'sav' }));
function fBank1() {
  const P = me(), bt = FS.bt;
  const tabs = [['sav', 'Хадгаламж'], ['ins', 'Даатгал']].concat(P.efund > 0 ? [['em', 'Яаралтай сан']] : []);
  const body = bt === 'ins' ? insHTML1(P) : bt === 'em' ? emHTML1(P) : savHTML1(P);
  return `${head(bt === 'ins' ? 'Даатгал' : bt === 'em' ? 'Яаралтай сан' : 'Хадгаламж')}${P.efund > 0 ? `<div class="tabs" style="padding:0">${tabs.map(([k, n]) => `<button data-a="bankTab" data-t="${k}" aria-pressed="${bt === k}">${n}</button>`).join('')}</div>` : ''}${body}`;
}
function savRow1(s) {
  const per = s.type === 'simple' ? R(s.amt * L1.simpleRate / 100) : s.type === 'card' ? R(s.amt * s.rate / 100) : 0;
  return `<button class="box svc svk" data-a="sv1Out" data-id="${s.id}"><div class="svh"><span><b>${esc(saveName(s))}</b><small>${fmt(s.amt)} · ${s.el}/${s.term} Орлого</small></span><em>${per ? '+' + fmtS(per) : '+' + fmtS(R(s.amt * L1.endApr / 100))}</em></div>
    <div class="svseg">${Array.from({ length: s.term }, (_, i) => `<i class="${i < s.el ? 'on' : ''}"></i>`).join('')}</div></button>`;
}
function savHTML1(P) {
  const list = P.savings || [];
  if (FS.svOut) {
    const s = list.find(x => x.id === FS.svOut); if (!s) { FS.svOut = null; return savHTML1(P); }
    const pen = earlyCost(s);
    return `<div class="box"><div class="ln"><span>${esc(saveName(s))}</span><b>${fmt(s.amt)}</b></div>${pen ? `<div class="ln"><span>${s.type === 'end' ? 'Хүүгээ алдана' : 'Торгууль'}</span><b class="neg">−${fmt(pen)}</b></div>` : ''}<div class="ln tot"><span>Авах</span><b>${fmt(s.amt - pen)}</b></div></div>
    <div class="cta"><button class="btn" data-a="setS" data-f="svOut" data-s="">Болих</button><button class="btn go" data-a="sv1OutOk" data-id="${s.id}" ${canAct(P) ? '' : 'disabled'}>Эрт авах</button></div>`;
  }
  if (FS.sv) {
    const t = FS.sv, amt = FS.sAmt || 0, yrs = Math.max(1, FS.sYears || 1);
    const per = R(amt * L1.simpleRate / 100), endInt = R(amt * L1.endApr / 100);
    return `<div class="box" style="display:grid;gap:10px"><h4>${t === 'simple' ? 'Энгийн хугацаатай' : 'Хугацааны эцэст хүүтэй'} <span>жилийн ${t === 'simple' ? L1.simpleApr : L1.endApr}%</span></h4>
      ${stepper('sAmt', amt, 1000000)}${chips('sAmt', [1e7, 2e7, 5e7, 1e8])}
      ${t === 'simple' ? `<label class="mute" style="font-size:12px;font-weight:700">Хугацаа</label>${chips('sYears', [1, 2, 3], n => n + ' жил')}` : ''}
      <div class="ln"><span>${t === 'simple' ? 'Орлого бүр' : '1 жилийн (3 Орлогын) дараа'}</span><b class="pos">+${fmt(t === 'simple' ? per : endInt)}</b></div>
      ${sm(t === 'simple' ? `Эрт авбал −${fmt(per)}` : 'Эрт авбал хүүгээ алдана')}</div>
    ${cashPrev(P, -amt, R(t === 'simple' ? per / L1.mpp : 0))}
    <div class="cta"><button class="btn" data-a="setS" data-f="sv" data-s="">Буцах</button>${payBtn(P, amt, 'sv1Ok', fmtS(amt) + ' хадгалах', amt > 0 && canAct(P))}</div>`;
  }
  return `<div class="svopts" style="grid-template-columns:1fr 1fr">
    <div class="svo"><em>${L1.simpleApr}%</em><b>Энгийн</b><small>Орлого бүр дээр ${L1.simpleRate}%</small><small class="svn ok">Идэвхгүй орлогод тооцогдоно</small><button class="minibtn go" data-a="setS" data-f="sv" data-s="simple" ${canAct(P) ? '' : 'disabled'}>Нээх</button></div>
    <div class="svo"><em>${L1.endApr}%</em><b>Эцэст нь</b><small>1 жилийн дараа нэг удаа</small><small class="svn">Идэвхгүй орлогод тооцогдохгүй</small><button class="minibtn go" data-a="setS" data-f="sv" data-s="end" ${canAct(P) ? '' : 'disabled'}>Нээх</button></div></div>
  ${list.length ? `<div class="sec" style="margin-top:14px">Миний хадгаламж <span>${fmtS(sum(list, s => s.amt))}</span></div>${list.map(savRow1).join('')}` : ''}
  `;
}
ACT.sv1Ok = () => { const P = me(); if (!(FS.sAmt > 0) || FS.sAmt > P.cash) return; snap('Хадгаламж'); const s = openSave1(G, P, FS.sv, FS.sAmt, { term: Math.min(3, Math.max(1, FS.sYears || 1)) * L1.ppy }); FS.sv = null; save(); render(); drawSheet(); if (s) toast(saveName(s) + ' нээлээ'); };
ACT.sv1Out = d => { if (!canAct(me())) return; FS.svOut = d.id; drawSheet(); };
ACT.sv1OutOk = d => { const P = me(); snap('Хадгаламж эрт авах'); const got = closeSave1(G, P, d.id); FS.svOut = null; save(); render(); drawSheet(); if (got != null) toast(`+${fmtS(got)}`); };
function insHTML1(P) {
  const row = (k, show) => !show ? '' : `<div class="box"><div class="ln"><span><b>${insName(k)}</b><span class="sub">${fmt(L1.ins[k])} / 2 жил${k === 'car' ? ' · Замын осол' : ' · Даатгалын 4 карт'}</span></span>${P.ins[k] > 0 ? `<b class="pos">${P.ins[k]} Орлого үлдсэн</b>` : `<button class="minibtn go" data-a="insBuy" data-k="${k}" ${canAct(P) && P.cash >= L1.ins[k] ? '' : 'disabled'}>Авах</button>`}</div></div>`;
  return row('health', 1) + row('fit', P.ins.fit > 0) + row('car', P.ins.car > 0);   // car insurance is gone (prompt v8 §5.2); an old one only shows until it ends
}
ACT.insBuy = d => { const P = me(); snap(insName(d.k)); if (!buyIns(G, P, d.k)) return toast('Бэлэн мөнгө хүрэлцэхгүй'); save(); render(); drawSheet(); buzz(15); };
function emHTML1(P) {
  const d = P.debts.find(x => x.kind === 'bank' && x.bal > 0), u = L1.emergUnit, ea = FS.eAmt || 0, la = Math.max(u, FS.lAmt || u);
  return `${!(P.efund > 0) ? '' : `<div class="box" style="display:grid;gap:10px"><div class="ln" style="border:0;padding:0"><span><b>Яаралтай сан</b><span class="sub">Гэнэтийн зардал эхлээд эндээс</span></span><b>${fmt(P.efund || 0)}</b></div>
    ${stepper('eAmt', ea, 500000)}
    <div class="row" style="gap:8px"><button class="minibtn" data-a="fund1" data-d="-1" ${canAct(P) && ea > 0 && ea <= (P.efund || 0) ? '' : 'disabled'}>Бэлэн рүү</button><button class="minibtn go" data-a="fund1" data-d="1" ${canAct(P) && ea > 0 && ea <= P.cash ? '' : 'disabled'}>Санд хийх</button></div></div>`}
  <div class="box" style="display:grid;gap:10px"><div class="ln" style="border:0;padding:0"><span><b>Яаралтай зээл</b><span class="sub">1 сая₮-өөр · сарын ${G.settings.loanPct}% хүү</span></span><b class="${d ? 'neg' : ''}">${fmt(d ? d.bal : 0)}</b></div>
    ${d ? `<div class="ln"><span>Сар бүр хүү</span><b class="neg">−${fmt(debtPay(P, d, G))}</b></div>` : ''}
    <div class="stepper"><button data-a="stp" data-f="lAmt" data-d="-${u}" aria-label="Хасах">−</button><input id="n_lAmt" inputmode="numeric" data-in="numIn" data-f="lAmt" value="${la.toLocaleString('en')}" aria-label="Зээлийн дүн"><button data-a="stp" data-f="lAmt" data-d="${u}" aria-label="Нэмэх">+</button></div>
    <div class="ln"><span>Сар бүр нэмэгдэх хүү</span><b class="neg">−${fmt(R(Math.ceil(la / u) * u * G.settings.loanPct / 100))}</b></div>
    <div class="row" style="gap:8px">${d ? `<button class="minibtn" data-a="emRepay" ${canAct(P) && P.cash >= Math.min(d.bal, u) ? '' : 'disabled'}>${fmtS(Math.min(d.bal, Math.ceil(la / u) * u))} төлөх</button>` : ''}<button class="minibtn go" data-a="emLoan" ${canAct(P) ? '' : 'disabled'}>${fmtS(Math.ceil(la / u) * u)} авах</button></div></div>`;
}
ACT.fund1 = d => { const P = me(); const a = FS.eAmt || 0; if (!(a > 0)) return; snap('Яаралтай сан');
  if (+d.d > 0) { if (a > P.cash) return; P.cash -= a; P.efund += a; log(G, P, 'Яаралтай санд хийлээ', -a, null, 'save'); }
  else { if (a > P.efund) return; P.efund -= a; P.cash += a; log(G, P, 'Яаралтай сангаас авлаа', a, null, 'save'); }
  save(); render(); drawSheet(); };
ACT.emLoan = () => { const P = me(); const amt = UI.sheetFn === fDebts1 || UI.sheetFn === fDebts ? Math.floor(FS.lAmt || 0) : Math.ceil(Math.max(L1.emergUnit, FS.lAmt || 0) / L1.emergUnit) * L1.emergUnit; if (!(amt > 0)) return; if (amt > emRoom1(P)) return toast('Яаралтай зээлийн хязгаар хүрсэн'); snap('Яаралтай зээл'); if (UI.sheetFn === fDebts1 || UI.sheetFn === fDebts) { const d = bankDebt(P); d.bal += amt; d.orig += amt; P.cash += amt; log(G, P, 'Яаралтай зээл авлаа', amt, null, 'loan'); } else takeLoan(G, P, amt); if (G.mode === 'online') NET.emit({ t: 'loan', txt: `${fmtS(amt)} яаралтай зээл авлаа` }); save(); if (UI.sheetFn === fDebts1 || UI.sheetFn === fDebts) closeSheet(); else { render(); drawSheet(); } toast(`+${fmtS(amt)} · Орлого бүр ${fmt(R(amt * G.settings.loanPct / 100) * L1.mpp)} хүү`); };
ACT.emRepay = () => { const P = me(); const d = P.debts.find(x => x.kind === 'bank' && x.bal > 0); if (!d) return; const amt = Math.min(d.bal, Math.ceil(Math.max(L1.emergUnit, FS.lAmt || 0) / L1.emergUnit) * L1.emergUnit, Math.floor(P.cash / L1.emergUnit) * L1.emergUnit || d.bal);
  if (amt > P.cash) return toast('Бэлэн мөнгө хүрэлцэхгүй'); snap('Зээл төлөх'); repayLoan(G, P, d.id, amt); save(); render(); drawSheet(); toast(`${fmtS(amt)} төллөө`); };

/* ---------- Зээл: all debts; profession loans paid in full drop their expense line ---------- */
/* Зээл: only for taking an emergency loan (user 2026-10-22); repaying is in the Зардал list */
/* Зээл: only for taking a loan (user 2026-10-22) — bank loan (18%/жил, 12 or 24 сар by the player's choice, equal payments) or emergency loan (10%/сар, interest only) */
function bankRoom1(P, n) {
  const room = dtiRoomPay(P, G); if (room <= 0) return 0;
  const per1 = annuityPay(1e6, G.settings.bankRate, n) / 1e6;
  const lim = R(P.salary * G.settings.bankMaxX) - sum(P.debts.filter(d => d.kind === 'bankl'), d => d.bal);
  return Math.max(0, Math.floor(Math.min(room / per1, lim) * (P.bk ? BK.bankX : 1) / 1000) * 1000);
}
function fDebts1() {
  // as simple as Хувьцаа (user 2026-10-22): type, amount in сая₮, term, one result line
  const P = me(), u = L1.emergUnit, S = G.settings, bank = FS.lt !== 'em', n = +FS.lTerm || 24;
  const room = bank ? bankRoom1(P, n) : emRoom1(P), la = Math.floor(FS.lAmt || 0);
  const pay = la ? (bank ? annuityPay(la, S.bankRate, n) : R(la * S.loanPct / 100)) : 0;
  const over = la > room;
  const ok = canAct(P) && la > 0 && !over;
  return `${head('Зээл авах')}${P.bk ? `<div class="alert neg">${ic('warning-circle')}<span><b>Найдваргүй зээлдэгч</b>Банкны зээл ${Math.round(BK.bankX * 100)}% · яаралтай зээл ${fmtS(salaryOf(P) * BK.emX)} хүртэл</span></div>` : ''}
  ${seg('lt', [['bank', `Банкны зээл<br><small>жилийн ${S.bankRate}%</small>`], ['em', `Яаралтай зээл<br><small>Орлого бүр ${S.loanPct * L1.mpp}% хүү</small>`]]).replace('class="seg"', 'class="seg pick sk2"')}
  <div class="skf"><label class="mrow has"><span class="ml">Дүн${room < APP_INF ? ` · ${fmtS(room)} хүртэл` : ''}</span><input id="n_lAmt" inputmode="numeric" placeholder="0" value="${la ? la.toLocaleString('en') : ''}" data-in="numIn" data-f="lAmt"></label>
    <div class="mrow has"><span class="ml">Хугацаа</span>${bank ? `<span class="lterm">${[24, 48].map(m => `<button data-a="setS" data-f="lTerm" data-s="${m}" aria-pressed="${n === m}">${m / L1.mpp} Орлого</button>`).join('')}</span>` : '<b class="lterm-em">Зөвхөн хүү</b>'}</div></div>
  <div class="ln tot" style="margin-top:10px"><span>Орлого бүр төлөх<span class="sub">${la ? `${bank ? `${n / L1.mpp} удаа (${n} сар) · нийт ${fmtS(pay * n)}` : `зөвхөн хүү · 1 жил байлгавал нийт ${fmtS(la + pay * 12)}`}` : 'Нэг Орлого = 4 сар'}</span></span><b class="${pay ? 'neg' : ''}">${pay ? '−' + fmt(pay * L1.mpp) : '—'}</b></div>
  ${la ? (() => { const d0 = fin1(P, G).delta, cut = pay * L1.mpp, d1 = d0 - cut; return `<div class="ln-note"><span class="ln-ni">${ic('warning-circle')}</span><div><b>Санамж</b><p>Зээл авбал Орлого бүрийн ашиг тань <em>${fmt(cut)}</em>-өөр буурна.</p>${d1 < 0 ? '<p>Орлого бүр мөнгө тань хасагдаж эхэлнэ.</p>' : ''}</div></div>`; })() : ''}
  ${la ? `<button class="linkbtn" data-a="schedOpen" data-p="${la}" data-r="${S.bankRate}" data-pay="${pay}" data-n="${n}" data-l="Банкны зээл"${bank ? '' : ' style="visibility:hidden" tabindex="-1" aria-hidden="true"'}>${ic('receipt')} Төлбөрийн график</button>` : ''}
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="loanTake" ${ok ? '' : 'disabled'}>${over ? `${fmtS(room)} хүртэл` : la ? fmtS(la) + ' авах' : 'Дүнгээ бичнэ үү'}</button></div>`;
}
ACT.loanTake = () => { FS.lAmt = Math.floor(FS.lAmt || 0); if (!(FS.lAmt > 0)) return; if (FS.lt === 'em') return ACT.emLoan();
  const P = me(), n = +FS.lTerm || 24, amt = Math.min(FS.lAmt, bankRoom1(P, n)); if (!(amt > 0)) return;
  const pay = annuityPay(amt, G.settings.bankRate, n);
  snap('Банкны зээл');
  P.debts.push({ id: uid('d'), l: `Банкны зээл · ${n / L1.mpp} Орлого`, rate: G.settings.bankRate, monthly: false, bal: amt, orig: amt, pay, n, kind: 'bankl', y: { paid: 0, int: 0, start: amt } });
  P.cash += amt; log(G, P, `Банкны зээл авлаа · ${n / L1.mpp} Орлого`, amt, null, 'loan');
  if (G.mode === 'online') NET.emit({ t: 'loan', txt: `${fmtS(amt)} банкны зээл авлаа` });
  save(); closeSheet(); toast(`+${fmtS(amt)} · Орлого бүр ${fmt(pay * L1.mpp)} · ${n / L1.mpp} удаа`); };
ACT.expPay = d => { const P = me(), debt = P.debts.find(x => x.id === d.id); if (!debt) return;
  if (debt.kind !== 'prof') return ACT.repayPart(d);
  FS = { debt: debt.id, pp: 0 }; openSheet(fProfPay, { modal: true }); };
/* profession loan paid in parts (user 2026-10-23): balance falls, the term stays, so the monthly payment falls by the same share — DERIVED */
function fProfPay() {
  const P = me(), debt = P.debts.find(x => x.id === FS.debt); if (!debt) return `${head('Төлсөн')}`;
  const line = P.exps.find(e => e.id === debt.line), m0 = line ? line.v : 0;
  const max = Math.max(0, Math.min(debt.bal, P.cash)), amt = Math.min(Math.floor(FS.pp || 0), debt.bal);
  const full = amt >= debt.bal, m1 = full ? 0 : R(m0 * (debt.bal - amt) / debt.bal);
  const ok = canAct(P) && amt > 0 && amt <= P.cash;
  return `${head(esc(debt.l))}
  <div class="box"><div class="ln"><span>Үлдэгдэл</span><b>${fmt(debt.bal)}</b></div><div class="ln" style="border:0"><span>Сар бүр</span><b class="neg">−${fmt(m0)}</b></div></div>
  <div class="skf" style="grid-template-columns:1fr"><label class="mrow has"><span class="ml">Төлөх дүн · ${fmtS(max)} хүртэл</span><input id="n_pp" inputmode="numeric" placeholder="0" value="${amt ? amt.toLocaleString('en') : ''}" data-in="numIn" data-f="pp"></label></div>
  ${amt ? `<div class="pb">
    <div class="pb-top"><div><small>Сар бүрийн төлөлт</small><b>${full ? '0₮' : fmt(m1)}<span>болно</span></b></div><em>${full ? 'Зээл хаагдана' : `−${fmt(m0 - m1)}`}</em></div>
    <div class="pb-r"><small>Одоо</small><div class="pb-t"><i style="width:100%"></i></div><b>${fmt(m0)}</b></div>
    <div class="pb-r go"><small>Дараа</small><div class="pb-t"><i style="width:${m0 ? Math.max(full ? 0 : 3, Math.round(m1 / m0 * 100)) : 0}%"></i></div><b>${fmt(m1)}</b></div>
  </div>` : ''}
  ${amt && amt <= P.cash ? cashPrev(P, -amt, m0 - m1) : ''}
  <button class="pp-full" data-a="profPayoff" data-id="${debt.id}" ${canAct(P) && P.cash >= debt.bal ? '' : 'disabled'}>${ic('seal-check')}<span><b>Бүтэн хаах · ${fmt(debt.bal)}</b><small>${P.cash >= debt.bal ? `Сар бүр −${fmt(m0)} хасагдана` : `Бэлэн мөнгө ${fmtS(debt.bal - P.cash)} дутна`}</small></span></button>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="profPart" ${ok ? '' : 'disabled'}>${amt > P.cash ? `${fmtS(max)} хүртэл` : amt ? fmtS(amt) + ' төлөх' : 'Дүнгээ бичнэ үү'}</button></div>`;
}
ACT.profPart = () => { const P = me(), debt = P.debts.find(x => x.id === FS.debt); if (!debt) return;
  const amt = Math.min(Math.floor(FS.pp || 0), debt.bal); if (!(amt > 0) || amt > P.cash) return;
  if (amt >= debt.bal) return ACT.profPayoff({ id: debt.id });
  const line = P.exps.find(e => e.id === debt.line), m0 = line ? line.v : 0, m1 = R(m0 * (debt.bal - amt) / debt.bal);
  snap('Зээл төлөх'); P.cash -= amt; debt.bal = R(debt.bal - amt); debt.pay = m1; if (line) line.v = m1;
  log(G, P, `${debt.l}: ${fmtS(amt)} төллөө`, -amt, null, 'repay');
  save(); render(); FS = {}; openSheet(fExp, { modal: true }); buzz(15); toast(`Сар бүр ${fmt(m0)} → ${fmt(m1)}`); };
ACT.profPayoff = d => { const P = me(); const debt = P.debts.find(x => x.id === d.id); if (!debt || P.cash < debt.bal) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  const line = P.exps.find(e => e.id === debt.line); snap('Зээл хаах');
  P.cash -= debt.bal; log(G, P, `${debt.l}: бүтэн хаалаа`, -debt.bal, null, 'repay');
  P.debts = P.debts.filter(x => x.id !== debt.id); if (line) P.exps = P.exps.filter(e => e.id !== line.id);
  const first = !P.firstPayoff; P.firstPayoff = true; if (G.mode === 'online' && first) NET.emit({ t: 'payoff', txt: `анхны өрөө хаалаа: ${debt.l}` });
  save(); render();
  openSheet(() => `${head('Өр хаагдлаа')}<div class="celebrate"><h3>Өрөөс чөлөөлөгдлөө!</h3><p>${esc(debt.l)} · сард +${fmt(line ? line.v : 0)}</p></div><div class="cta"><button class="btn go" data-a="close">Сайн байна</button></div>`); };

/* ---------- Хөрөнгө: tiles → detail (bank sale, sell to a player) ---------- */
v3Act('openAssets', () => openSheet(fAssets1, { modal: true }));
v3Act('openDebts', () => { FS = { lAmt: 0, lt: 'bank', lTerm: '24' }; openSheet(fDebts1); });
v3Act('openSell', () => openSheet(fAssets1, { modal: true }));
v3Act('sellOne', d => { const a = me().assets.find(x => x.id === d.id); if (a && a.kind === 'receivable') { FS = { asset: d.id }; return openSheet(fRecv); } FS = { asset: d.id, conf: null, to: null, px: 0 }; openSheet(fAsset1, { modal: true }); });
function aVal1(P, a) {
  if (a.kind === 're') return [a.sub === 'garage' ? 'equip' : 're', fmtS(a.net * 4, { sign: true }) + ' / 4 сар', a.net >= 0 ? 'pos' : 'neg'];
  if (a.kind === 'land') return ['land', fmtS(a.price), ''];
  if (a.kind === 'stock') return ['units', a.qty.toLocaleString('en') + ' ш', ''];
  if (a.kind === 'metal') return ['gold', a.qty + ' ш', ''];
  if (a.kind === 'antique') return ['gold', fmtS(a.price), ''];
  if (a.kind === 'bond') return ['bond', a.left > 0 ? fmtS(a.net * 4, { sign: true }) + ' / 4 сар' : 'Дууслаа', a.left > 0 ? 'pos' : 'neg'];
  if (a.kind === 'receivable') return ['recv', fmtS(a.amount), ''];
  return ['biz', fmtS(assetValue(P, a)), ''];
}
function fAssets1() {
  const P = me(), f = fin1(P, G), tap = id => canAct(P) ? `data-a="sellOne" data-id="${id}"` : '';
  const tiles = P.assets.map(a => { const [k, v, t] = aVal1(P, a); return aTile(k, a.name, v, t, tap(a.id)); });
  for (const s of P.savings || []) tiles.push(aTile('sav', saveName(s), fmtS(s.amt), '', 'data-a="openSave"'));
  if (P.efund) tiles.push(aTile('sav', 'Яаралтай сан', fmtS(P.efund), '', 'data-a="openLoan" data-bt="em"'));
  const sk = P.skills.map((s, i) => `<div class="skl ${s.left > 0 ? 'wip' : 'ok'}"><span class="skl-i">${ic('graduation-cap')}</span><span class="skl-t"><small>Ур чадвар ${i + 1}/${SK_TOTAL}</small><b>${esc(s.name)}</b></span><em>${s.left > 0 ? `сурч байна · ${s.left * 4} сар` : `цалин +${s.pct}%`}</em></div>`).join('');   // skills below other assets, own style (user 2026-11-07)
  for (const x of P.plans) tiles.push(aTile(x.kind === 'car' ? 'equip' : 'wait', x.l, `${x.left} сар`, 'neg'));
  const tot = sum(P.assets, a => assetValue(P, a)) + sum(P.savings || [], s => s.amt) + (P.efund || 0);
  return `<div class="shead"><h3>Хөрөнгө</h3>${X}</div>
  <div class="at-top"><b>${fmtS(tot)}</b><span class="pos">${fmtS(f.passive * 4, { sign: true })} / 4 сар</span></div>
  ${tiles.length ? `<div class="at-g">${tiles.join('')}</div>` : `<div class="at-e"><span class="at-ic at-re">${ic('buildings')}</span><b>Хөрөнгө алга</b></div>`}
  ${sk ? `<div class="skl-h">Ур чадвар</div><div class="skl-l">${sk}</div>` : ''}`;
}
function fAsset1() {
  const P = me(), a = P.assets.find(x => x.id === FS.asset);
  if (!a) return `${head('Хөрөнгө')}<div class="cta"><button class="btn go" data-a="openAssets">Буцах</button></div>`;
  const c = CARD[a.card], held = (P.pd || 0) - (a.bought || 0);
  const L = (l, v, cls = '') => `<div class="ln"><span>${l}</span><b class="${cls}">${v}</b></div>`;
  let rows = (c ? L('Карт', `${c.deck} ${cnoS(c)}`) : '') + L('Эзэмшсэн', `${held} цалин`);
  if (a.share && a.share < 1) rows += L('Хувь', Math.round(a.share * 100) + '%');
  if (a.kind === 're') rows += L('Авсан үнэ', fmtS(a.price)) + L('Урьдчилгаа', fmtS(a.down)) + L('Үлдэгдэл өр', fmtS(a.debt), 'neg') + L('4 сарын ашиг', fmt(a.net * 4, { sign: true }), 'pos');
  else if (a.kind === 'land') rows += L('Авсан үнэ', fmtS(a.price));
  else if (a.kind === 'stock' || a.kind === 'metal') rows += L('Ширхэг', a.qty.toLocaleString('en')) + L('Авсан үнэ', fmt(a.price) + ' / ш') + (a.div ? L('Ногдол ашиг / Орлого', fmt(a.qty * a.div), 'pos') : '');
  else if (a.kind === 'bond') rows += L('Үнэ', fmtS(a.price)) + L('4 сарын ашиг', fmt(a.net * 4, { sign: true }), 'pos') + L('Үлдсэн', a.left > 0 ? `${a.left} цалин` : 'Дууслаа');
  const os = others1(P);
  let act = '';
  if (FS.conf === 'bank') { const got = bankSaleRE(P, a);
    act = `<div class="box">${L('Урьдчилгаа', fmt(a.down))}${L(`Төлсөн сарын төлөлт × ${a.months || 0}`, fmt(R(a.pay * (a.months || 0))))}${L('Банк өрийг хаана', fmtS(a.debt))}<div class="ln tot"><span>Танд</span><b class="pos">+${fmt(got)}</b></div></div>
      <div class="cta"><button class="btn" data-a="setS" data-f="conf" data-s="">Болих</button><button class="btn go" data-a="reBankOk">Банкинд зарах</button></div>`; }
  else if (FS.conf === 'person') {
    act = `<div class="box" style="display:grid;gap:10px"><h4>Хэнд?</h4><div class="chips">${os.map(o => `<button class="chip" data-a="setS" data-f="to" data-s="${o.id}" aria-pressed="${FS.to === o.id}">${esc(o.name)}</button>`).join('')}</div>
      <h4>Үнэ</h4>${stepper('px', FS.px || 0, 1000000, 'Үнэ')}${a.kind === 're' ? sm(`Өр ${fmtS(a.debt)} худалдан авагч руу шилжинэ`) : ''}</div>
      <div class="cta"><button class="btn" data-a="setS" data-f="conf" data-s="">Болих</button><button class="btn go" data-a="aSellOk" ${FS.to && FS.px > 0 ? '' : 'disabled'}>${G.mode === 'online' ? 'Санал илгээх' : 'Зарах'}</button></div>`;
  } else if (canAct(P)) {
    const b = [];
    // no bank sale for any asset (prompt v8 §5.6): only a Зах зээл card or another player
    if (a.kind === 'bond' && a.left <= 0) b.push(`<button class="btn" data-a="pdBond" data-id="${a.id}" data-k="renew">Сунгах</button><button class="btn go" data-a="pdBond" data-id="${a.id}" data-k="back">+${fmtS(a.price)} авах</button>`);
    if (os.length && !a.offer && !['stock', 'land', 'metal', 're', 'presale'].includes(a.kind)) b.push(   // stocks, land, business and real estate: no sale to players (user 2026-11-09: «зөвхөн зах зээлийн картаар»)
      `<button class="btn${a.kind === 'stock' || a.kind === 'metal' ? '' : ' go'}" data-a="setS" data-f="conf" data-s="person">Хүнд зарах</button>`);
    // stocks and metals sell from the Хувьцаа screen at the price the player types (user 2026-10-23)
    if (a.kind === 'stock') b.push(`<button class="btn go" data-a="skSellFrom" data-k="${a.sym}">Хувьцаа хэсэгт зарах</button>`);   // any time at the last price (user 2026-11-09)
    act = (a.kind === 're' ? sm('Зөвхөн Зах зээлийн картаар зарна') : a.kind === 'land' ? sm('Зах зээлийн картаар үнэ нь өснө') : a.kind === 'antique' ? sm('Зах зээлийн цуглуулагчийн картаар эсвэл өөр тоглогчид зарна') : a.kind === 'presale' ? sm(a.ready ? 'Ашиглалтад орсон' : `Баригдаж буй · ${a.wait} Орлого үлдсэн · урьдчилгаа ${fmtS(a.down)}`) : '')
      + (a.offer ? sm('Санал илгээсэн · хариу хүлээж байна') : '') + (b.length ? `<div class="cta">${b.join('')}</div>` : '');
  }
  return `<div class="shead"><h3>${esc(a.name)}</h3>${X.replace('data-a="close"', 'data-a="openAssets"')}</div>${c && c.title !== a.name ? sm(esc(c.title)) : ''}<div class="box">${rows}</div>${act}`;
}
ACT.reBankOk = () => { const P = me(); const a = P.assets.find(x => x.id === FS.asset); if (!a) return; snap('Банкинд зарах'); sellRE(G, P, a.id, bankSaleRE(P, a), 'банкинд'); save(); render(); openSheet(fAssets1, { modal: true }); toast('Зарлаа'); };
/* asset → player: offline both sides change on this phone; online the buyer confirms on their phone (§11) */
function assetMove(a, B) { const x = clone(a); x.id = uid('a'); x.bought = B.pd || 0; x.offer = null; if (x.kind === 're') { x.down = x.px || x.down; x.months = 0; } delete x.px; return x; }
ACT.aSellOk = () => {
  const P = me(), a = P.assets.find(x => x.id === FS.asset), B = PL1(FS.to), px = FS.px || 0; if (!a || !B || !(px > 0)) return;
  if (G.mode === 'online') { snap('Санал'); a.offer = B.id; NET.emit({ t: 'aoffer', to: B.id, a, px, txt: `${a.name} · ${fmtS(px)}-өөр зарах санал` }); save(); FS.conf = null; drawSheet(); return toast('Санал илгээлээ'); }
  if (B.cash < px) return toast(`${B.name}-д бэлэн мөнгө хүрэлцэхгүй`);
  snap('Хүнд зарах');
  const x = assetMove(Object.assign({}, a, { px }), B); B.assets.push(x); B.cash -= px; log(G, B, `${a.name} авлаа ← ${P.name}`, -px, a.card, 'buy');
  P.assets = P.assets.filter(z => z.id !== a.id); P.cash += px; log(G, P, `${a.name} зарлаа → ${B.name}`, px, a.card, 'sell');
  save(); render(); openSheet(fAssets1, { modal: true }); toast('Зарлаа');
};
function fAoffer() {
  const e = FS.aoff, a = e.a, P = me();
  return `${head('Худалдах санал', `<span>${esc(FS.from)}</span>`)}<div class="box"><div class="ln"><span><b>${esc(a.name)}</b></span><b>${fmt(e.px)}</b></div>${a.kind === 're' ? `<div class="ln"><span>Сарын ашиг</span><b class="pos">+${fmt(a.net)}</b></div><div class="ln"><span>Өр шилжинэ</span><b class="neg">${fmtS(a.debt)}</b></div>` : ''}${a.qty ? `<div class="ln"><span>Ширхэг</span><b>${a.qty.toLocaleString('en')}</b></div>` : ''}</div>
  ${shortfall(P, e.px)}<div class="cta"><button class="btn" data-a="aoffNo">Татгалзах</button>${payBtn(P, e.px, 'aoffOk', 'Авах')}</div>`;
}
ACT.aoffOk = () => { const P = me(), e = FS.aoff; if (P.cash < e.px) return toast('Бэлэн мөнгө хүрэлцэхгүй'); snap('Худалдаж авах');
  P.assets.push(assetMove(Object.assign({}, e.a, { px: e.px }), P)); P.cash -= e.px; log(G, P, `${e.a.name} авлаа ← ${FS.from}`, -e.px, e.a.card, 'buy');
  NET.emit({ t: 'aok', to: e.by, aid: e.a.id, px: e.px, txt: `${e.a.name} худалдаж авлаа` }); save(); closeSheet(); };
ACT.aoffNo = () => { const e = FS.aoff; NET.emit({ t: 'ano', to: e.by, aid: e.a.id, txt: `${e.a.name} · татгалзлаа` }); closeSheet(); };

/* ---------- Наймаа: hand money to another player (user 2026-10-19: one simple «pay money» place) ---------- */
ACT.openXfer = () => { FS = { xd: 'give', to: null, xName: '', xAmt: 1000000 }; openSheet(fXfer); };
function fXfer() {
  const P = me(), os = others1(P), online = G.mode === 'online', amt = FS.xAmt || 0;
  const party = FS.to ? PL1(FS.to) : null, name = party ? party.name : (FS.xName || '').trim();
  const give = FS.xd !== 'take';
  return `${head('Мөнгө шилжүүлэх')}
  ${online ? '' : `<div class="box">${seg('xd', [['give', 'Өгөх'], ['take', 'Авах']])}</div>`}
  <div class="box" style="display:grid;gap:10px"><h4>${give ? 'Хэнд?' : 'Хэнээс?'}</h4>${os.length ? `<div class="chips">${os.map(o => `<button class="chip" data-a="setS" data-f="to" data-s="${o.id}" aria-pressed="${FS.to === o.id}">${esc(o.name)}</button>`).join('')}</div>` : `<input class="inp" data-in="xName" value="${esc(FS.xName || '')}" placeholder="Найзын нэр" autocomplete="off">`}
    ${stepper('xAmt', amt, 100000)}${chips('xAmt', [100000, 500000, 1e6, 5e6])}</div>
  ${cashPrev(P, give ? -amt : amt, 0)}
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="xferOk" ${name && amt > 0 && (!give || amt <= P.cash) ? '' : 'disabled'}>${give ? fmtS(amt) + ' өгөх' : fmtS(amt) + ' авсан'}</button></div>
  ${canAct(P) && P.assets.length && os.length ? `<button class="linkbtn" data-a="openAssets">${ic('tag')} Хөрөнгөө хүнд зарах</button>` : ''}`;
}
ACT.xName = (d, el) => { FS.xName = el.value; clearTimeout(pqT); pqT = setTimeout(drawSheet, 500); };
ACT.xferOk = () => {
  const P = me(), amt = FS.xAmt || 0, o = FS.to ? PL1(FS.to) : null, name = o ? o.name : (FS.xName || '').trim(), give = FS.xd !== 'take';
  if (!name || !(amt > 0) || (give && amt > P.cash)) return;
  snap('Мөнгө шилжүүлэх');
  if (give) { pay(G, P, amt, `Шилжүүлэг → ${name}`, null, 'pay'); if (o && G.mode === 'online') NET.emit({ t: 'xfer', to: o.id, amt, txt: 'Шилжүүлэг' }); else if (o) gain(G, o, amt, `Шилжүүлэг ← ${P.name}`, null, 'gain'); }
  else { gain(G, P, amt, `Шилжүүлэг ← ${name}`, null, 'gain'); if (o) pay(G, o, amt, `Шилжүүлэг → ${P.name}`, null, 'pay'); }
  save(); closeSheet(); toast('Бүртгэлээ');
};

/* ---------- online events for Level 1 ---------- */
function l1Handle(e, name) {
  if (e.t === 'stockpx') { if (e.by !== G.me) stockAsk(e.sym, e.px, e.by, null, e.prev); return true; }
  if (!['cobuy', 'cobuyok', 'cobuyno', 'aoffer', 'aok', 'ano'].includes(e.t)) return false;
  if (e.to !== G.me) return true;
  const P = me();
  if (e.t === 'cobuy') { const go = () => { FS = { cob: e, from: name }; openSheet(fCobuy, { modal: true }); }; notify(e.by, name, e.txt, 'cardsale', go); if (!UI.sheetFn) setTimeout(go, 0); }
  else if (e.t === 'aoffer') { const go = () => { FS = { aoff: e, from: name }; openSheet(fAoffer, { modal: true }); }; notify(e.by, name, e.txt, 'cardsale', go); if (!UI.sheetFn) setTimeout(go, 0); }
  else if (e.t === 'aok') { const a = P.assets.find(x => x.id === e.aid); if (a) { P.assets = P.assets.filter(x => x.id !== a.id); gain(G, P, e.px, `${a.name} зарлаа → ${name}`, a.card, 'sell'); save(); } notify(e.by, name, e.txt, 'xfer'); }
  else if (e.t === 'ano') { const a = P.assets.find(x => x.id === e.aid); if (a) { a.offer = null; save(); } notify(e.by, name, e.txt, 'cardx'); }
  else notify(e.by, name, e.txt, e.t === 'cobuyno' ? 'cardx' : 'buy');
  return true;
}
function l1Incoming(q) {
  const P = me(), c = CARD[q.card];
  if (!c || !L1DECK[c.deck] || !isV3(P)) return false;
  if (c.deck === 'ZZ') { zzOpen(q.card, { incoming: true, from: q.from, roll: q.roll }); return true; }
  // every player sees a stock card someone drew and closes it with «Ойлголоо» (user 2026-10-22); holders can sell at its price
  if (c.fx.k === 'stock') { stockAsk(c.fx.sym, c.fx.price, q.by, q.card); return true; }
  return false;
}

/* ---------- bankruptcy (user 2026-10-26) ---------- */
// DESIGN ASSUMPTION — game values, not data: 3 paydays, salary −10%, bank loan room ×50%, emergency loan up to 1 month's salary
const BK = { paydays: 3, salCut: 10, bankX: 1, emX: 1 };   // prompt v7 §5.8: 3 Орлого, salary −10%; no «найдваргүй зээлдэгч» limits
function emRoom1(P) { return Math.max(0, L1.emergMax - sum(P.debts.filter(d => d.kind === 'bank'), d => d.bal)); }   // app loan ≤ 1 тэрбум₮ (§5.3)
function liqOf(P, a) {
  if (a.kind === 're') return bankSaleRE(P, a);
  const px = k => (G.lastPx && G.lastPx[k]) || a.unitCost || a.price;   // the last price seen in this game, else what was paid
  if (a.kind === 'stock') return R(a.qty * px(a.sym));
  if (a.kind === 'metal') return R(a.qty * px(a.metal));
  if (a.kind === 'bond') return R(a.price || 0);
  return R((a.price || a.amt || 0) * 0.8);
}
function liqAll(P) { return sum(P.assets, a => liqOf(P, a)) + sum(P.savings || [], s => s.amt - earlyCost(s)); }
function bkCheck(P) {
  const em = sum(P.debts.filter(d => d.kind === 'bank'), d => d.bal), bank = sum(P.debts.filter(d => d.kind === 'bankl'), d => d.bal);
  const sinking = (P.cash < 0 || em > 0) && P.cash + liqAll(P) - em - bank <= 0;
  P.bkWarn = sinking ? (P.bkWarn || 0) + 1 : 0;
  return P.bkWarn >= BK.paydays;
}
function bankrupt1(G, P) {
  const sold = liqAll(P), nA = P.assets.length + (P.savings || []).length;
  const debts = P.debts.filter(d => d.kind !== 'prof' && d.bal > 0), owed = sum(debts, d => d.bal) + sum(P.plans || [], x => x.pay * Math.max(0, x.left)) + Math.max(0, -P.cash);
  const sal0 = salaryOf(P);
  P.assets = []; P.savings = []; P.plans = [];
  P.debts = P.debts.filter(d => d.kind === 'prof');
  P.cash = 0; P.bkWarn = 0;
  P.bkN = (P.bkN || 0) + 1; P.bk = null;
  P.salMul = (P.salMul || 1) * (1 - BK.salCut / 100);
  const info = { sold, nA, owed, sal0, sal1: salaryOf(P) };
  log(G, P, `Дампуурлаа · ${nA} хөрөнгө зарагдаж, ${fmtS(owed)} өр хаагдлаа · цалин −${BK.salCut}%`, 0, null, 'out');
  if (G.mode === 'online') NET.emit({ t: 'out', txt: 'дампуурлаа' });
  return info;
}
function fBankrupt1() {
  const x = FS.bk, P = me();
  return `<div class="winbox">${stage('m_worry', 'a-worry')}<h2>Та дампуурлаа</h2><p class="mute">${BK.paydays} Орлого дараалан бүх хөрөнгөө зараад ч өрөө төлж чадсангүй</p></div>
  <div class="box"><div class="ln"><span>Зарагдсан хөрөнгө<span class="sub">${x.nA} хөрөнгө</span></span><b>${fmt(x.sold)}</b></div><div class="ln"><span>Хаагдсан өр</span><b>${fmt(x.owed)}</b></div><div class="ln tot"><span>Бэлэн мөнгө</span><b>0₮</b></div></div>
  <div class="box"><div class="ln"><span>Цалин −${BK.salCut}%</span><b class="neg">${fmt(x.sal0)} → ${fmt(x.sal1)}</b></div><div class="ln"><span>Мэргэжлийн зээл</span><b>хэвээр</b></div></div>
  <div class="cta"><button class="btn go" data-a="bkGo">Дахин эхлэх</button></div>`;
}
ACT.bkGo = () => { const t = FS.then; FS = {}; save(); render(); if (t) t(); else closeSheet(); };

/* ---------- start: «Амьдралын эхлэл» card number right after choosing a profession (§10) ---------- */
function aeAsk() { return; /* «Амьдралын эхлэл» removed (user 2026-10-31) */ if (G && isV3(me()) && !me().start) setTimeout(() => { FS = { deck: 'AE' }; openSheet(fPick); }, 120); }
{ const sg = ACT.startGame, jg = ACT.joinGo;
  ACT.startGame = async d => { await sg(d); aeAsk(); };
  ACT.joinGo = async () => { await jg(); aeAsk(); }; }
/* «Түвшин 1 дууслаа!» → Level 2 (dream pick) or the win screen */
v3Act('levelUp', () => {
  const P = me();
  if (G.settings.endAtL1) { snap('Ялалт'); P.won = true; G.over = { winner: P.id, why: 'Түвшин 1 дууслаа' }; log(G, P, 'Түвшин 1 дууслаа — ялалаа!', 0, null, 'win'); if (G.mode === 'online') NET.emit({ t: 'win', txt: 'Түвшин 1 дууслаа — ялалаа' }); save(); return openSheet(fWin); }
  FS = { deck: 'MO', q: '' }; openSheet(fPick);
});

/* the emergency fund was removed (user 2026-10-22): games saved with it get the money back as cash */
function v3Migrate(G) {
  let ch = 0;
  for (const P of G.players) if (P.v3 && P.efund > 0 && (G.mode !== 'online' || P.id === G.me)) { P.cash += P.efund; log(G, P, 'Яаралтай сан бэлэн мөнгөнд нэгдлээ', P.efund, null, 'save'); P.efund = 0; ch = 1; }
  if (ch) save();
}

/* Орлого pop-up (v3): only salary and passive income — Level 1 has no active/side income */
v3Act('openInc', () => openSheet(() => { const P = me(), f = fin1(P, G);
  return `<div class="shead"><h3>Орлого</h3>${X}</div>
  <div class="svsum"><div><small>Орлого / 4 сар</small><b class="pos">+${fmtS(f.income * 4)}</b></div><div><small>Цалин / 4 сар</small><b>${fmtS(f.salary * 4)}</b></div><div><small>Идэвхгүй орлого</small><b class="pos">+${fmtS(f.passive * 4)}</b></div></div>
  <div class="box"><div class="ln"><span>Цалин${P.salMul > 1.0001 ? `<span class="sub">+${Math.round((P.salMul - 1) * 1000) / 10}%</span>` : ''}</span><b>${fmt(f.salary * 4)}</b></div>
    ${f.pas.filter(x => x.m).map(x => `<div class="ln"><span>${esc(x.l)}</span><b class="pos">+${fmt(R(x.m * 4))}</b></div>`).join('')}</div>`; }, { modal: true }));

/* ---------- Хувьцаа: pick a company (or gold/silver), type the price and amount yourself (user 2026-10-22) ---------- */
const STK1 = () => Object.keys(OF.cos || {}).map(k => ({ k, n: OF.cos[k], m: false })).concat([{ k: 'gold', n: 'Алт', m: true }, { k: 'silver', n: 'Мөнгө', m: true }]);
/* dividend per share: the JB card at that price, else the cards' own ratio for that company (2% of price on every dividend card) — DERIVED */
function divFor(sym, px) {
  const cs = OF.cards.filter(c => c.fx && c.fx.k === 'stock' && c.fx.sym === sym);
  const hit = cs.find(c => c.fx.price === px); if (hit) return hit.fx.div || 0;
  const ref = cs.find(c => c.fx.div > 0); return ref ? R(px * ref.fx.div / ref.fx.price) : 0;
}
function lastPx(sym) {
  const v = G.lastPx && G.lastPx[sym]; if (v) return v;
  const ps = OF.cards.filter(c => c.fx && ((c.fx.k === 'stock' && c.fx.sym === sym) || (c.fx.k === 'metal' && c.fx.metal === sym))).map(c => c.fx.price);
  return ps.length ? Math.min(...ps) : 0;
}
ACT.skSellFrom = d => { const P = me(), m = ['gold', 'silver'].includes(d.k); FS = { sk: d.k, px: 0, sm: 'sell', qty: m ? sum(metalsOf(P, d.k), a => a.qty) : sum(holdingsOf(P, d.k), a => a.qty) }; openSheet(fStocks1, { modal: true }); setTimeout(() => skCenter(false), 30); };
v3Act('openStocks', () => { const k0 = (OF.cos ? Object.keys(OF.cos)[0] : 'gold'); FS = { sk: k0, px: 0, qty: 0 }; openSheet(fStocks1, { modal: true }); setTimeout(() => skCenter(false), 30); });
/* the picker is an up-down wheel: scroll it, the row that stops in the middle band is chosen (user 2026-10-22) */
function skCenter(smooth) { const w = document.querySelector('#sheet .skw'); const b = w && w.querySelector(`[data-k="${FS.sk}"]`); if (b) w.scrollTo({ top: b.offsetTop - (w.clientHeight - b.offsetHeight) / 2, behavior: smooth ? 'smooth' : 'auto' }); }
let skT = 0;
document.addEventListener('scroll', e => {
  const w = e.target; if (!w || !w.classList || !w.classList.contains('skw') || UI.sheetFn !== fStocks1) return;
  clearTimeout(skT); skT = setTimeout(() => {
    const mid = w.scrollTop + w.clientHeight / 2; let best = null, bd = 1e9;
    for (const b of w.querySelectorAll('[data-k]')) { const d = Math.abs(b.offsetTop + b.offsetHeight / 2 - mid); if (d < bd) { bd = d; best = b; } }
    if (best && best.dataset.k !== FS.sk) { FS.sk = best.dataset.k; FS.px = 0; FS.qty = 0; skClear(); drawSheet(); skCenter(true); }
  }, 90);
}, true);
/* a new company starts with empty fields — the typed field keeps its text on redraw, so it is cleared here (user 2026-10-22) */
function skClear() { const a = document.activeElement; if (a && a.blur) a.blur(); for (const id of ['n_px', 'n_qty']) { const e = document.getElementById(id); if (e) e.value = ''; } }
ACT.skPick = d => { FS.sk = d.k; FS.px = 0; FS.qty = 0; skClear(); drawSheet(); skCenter(true); };
function fStocks1() {
  const P = me(), list = STK1(), it = list.find(x => x.k === FS.sk) || list[0], metal = it.m;
  const hq = x => x.m ? sum(metalsOf(P, x.k), a => a.qty) : sum(holdingsOf(P, x.k), a => a.qty);
  const held = hq(it), px = FS.px || 0, qty = FS.qty || 0, tot = px * qty;
  const div = metal ? 0 : divFor(it.k, px);
  const canBuy = canAct(P) && px > 0 && qty > 0, canSell = canAct(P) && px > 0 && qty > 0 && qty <= held;
  // one mode at a time, one button (user 2026-10-23: side-by-side Зарах/Авах got pressed by mistake)
  const sell = FS.sm === 'sell', tell = FS.sm === 'tell', prev = (G.lastPx || {})[it.k] || 0;
  if (tell) return fStockTell(P, list, it, hq, px, prev);
  const cta = sell
    ? `<button class="btn sell" data-a="skOk" data-s="sell" ${canSell ? '' : 'disabled'}>${!held ? 'Танд энэ хувьцаа алга' : qty > held ? `${held.toLocaleString('en')} ш хүртэл` : tot ? `+${fmt(tot)} зарах` : 'Зарах'}</button>`
    : `<button class="btn go" data-a="skOk" data-s="buy" ${canBuy ? '' : 'disabled'}>${tot ? `${fmt(tot)} авах` : 'Авах'}</button>`;
  return `<div class="shead"><h3>Хувьцаа</h3>${X}</div>
  ${skModes(FS.sm)}
  <div class="skwrap ${metal ? 'off' : ''}"><div class="skw">${list.filter(x => !x.m).map(x => { const h = hq(x); return `<button data-a="skPick" data-k="${x.k}" aria-pressed="${x.k === it.k}" class="${x.m ? 'mt' : ''}"><b>${esc(x.n)}</b>${h ? `<small>${h.toLocaleString('en')} ш</small>` : ''}</button>`; }).join('')}</div><i class="skband"></i></div>
  <div class="skm">${list.filter(x => x.m).map(x => { const h = hq(x); return `<button data-a="skPick" data-k="${x.k}" aria-pressed="${x.k === it.k}">${esc(x.n)}${h ? ` · ${h} ш` : ''}</button>`; }).join('')}</div>
  <div class="skf"><label class="mrow has"><span class="ml">1 ширхэгийн үнэ</span><input id="n_px" inputmode="numeric" placeholder="0" value="${px ? px.toLocaleString('en') : ''}" data-in="numIn" data-f="px"></label>
    <div class="mrow has"><span class="ml">Ширхэг${held ? ` <button class="lnk" data-a="setF" data-f="qty" data-n="${held}">${held.toLocaleString('en')}</button>` : ''}</span><input id="n_qty" inputmode="numeric" placeholder="0" value="${qty ? qty.toLocaleString('en') : ''}" data-in="numIn" data-f="qty"></div></div>
  <div class="ln tot" style="margin-top:10px"><span>${sell ? 'Танд орох' : 'Нийт төлөх'}${!sell && div && qty ? `<span class="sub">ногдол Орлого бүр +${fmt(div * qty)} · эрх чөлөөнд сард +${fmt(R(div * qty / L1.mpp))}</span>` : ''}</span><b class="${sell && tot ? 'pos' : ''}">${tot ? (sell ? '+' : '') + fmt(tot) : '—'}</b></div>
  <div class="cta">${cta}</div>`;
}
const skModes = m => `<div class="seg pick skmode sk3"><button data-a="skMode" data-s="buy" aria-pressed="${m !== 'sell' && m !== 'tell'}">Авах</button><button data-a="skMode" data-s="sell" aria-pressed="${m === 'sell'}">Зарах</button><button data-a="skMode" data-s="tell" aria-pressed="${m === 'tell'}">Үнэ мэдэгдэх</button></div>`;
/* «Үнэ мэдэгдэх»: the player who drew a stock card picks the company and types the new price; everyone sees it rise or fall (user 2026-10-30) */
function fStockTell(P, list, it, hq, px, prev) {
  const up = prev && px > prev, dn = prev && px && px < prev, pct = prev && px ? Math.round(Math.abs(px / prev - 1) * 100) : 0;
  const ok = canAct(P) && px > 0 && px !== prev && G.players.length > 1;
  return `<div class="shead"><button class="sk2back" data-a="sk2List">‹ Бүх хувьцаа</button>${X}</div><h3 class="sk2t">Үнэ мэдэгдэх</h3>
  <div class="skwrap"><div class="skw">${list.map(x => { const h = hq(x); return `<button data-a="skPick" data-k="${x.k}" aria-pressed="${x.k === it.k}"><b>${esc(x.n)}</b>${h ? `<small>${h.toLocaleString('en')} ${unitOf(x.k)}</small>` : ''}</button>`; }).join('')}</div><i class="skband"></i></div>
  <div class="skf" style="grid-template-columns:1fr"><label class="mrow has"><span class="ml">Шинэ үнэ · 1 ${it.m ? 'грамм' : 'ширхэг'}</span><input id="n_px" inputmode="numeric" placeholder="0" value="${px ? px.toLocaleString('en') : ''}" data-in="numIn" data-f="px"></label></div>
  <div class="ln tot" style="margin-top:10px"><span>Өмнөх үнэ<span class="sub">${prev ? 'энэ тоглоомд сүүлд гарсан' : 'энэ тоглоомд хараахан гараагүй'}</span></span><b>${prev ? fmt(prev) : '—'}</b></div>
  ${px && prev && px !== prev ? `<div class="ln"><span>Өөрчлөлт</span><b class="${up ? 'pos' : 'neg'}">${up ? '▲ өслөө +' : '▼ унлаа −'}${pct}%</b></div>` : ''}
  <div class="cta"><button class="btn go" data-a="skTell" ${ok ? '' : 'disabled'}>${G.players.length < 2 ? 'Өөр тоглогч алга' : px && px === prev ? 'Үнэ өөрчлөгдөөгүй' : 'Бусдад мэдэгдэх'}</button></div>`;
}
ACT.skTell = () => { const P = me(), it = STK1().find(x => x.k === FS.sk) || STK1()[0], px = FS.px || 0; if (!it || !(px > 0)) return;
  const prev = (G.lastPx || {})[it.k] || 0; setPx(it.k, px, P.name); save();
  log(G, P, `${it.n} · 1 ширхэг ${fmt(px)}${prev ? ` (өмнө ${fmt(prev)})` : ''}`, 0, null, 'market');
  FS.px = 0; skClear(); render();
  if (G.mode === 'online') { NET.emit({ t: 'stockpx', sym: it.k, px, prev, txt: `${it.n} ${fmt(px)}` }); drawSheet(); return toast('Бусдад мэдэгдлээ'); }
  if (G.players.some(Q => Q.id !== P.id && !Q.out && isV3(Q) && sum(ownOf(Q, it.k), a => a.qty) > 0)) { FS = { pxq: { sym: it.k, px }, done: {} }; return openSheet(fStockLocal, { modal: true }); }
  drawSheet(); toast('Энэ хувьцаатай өөр тоглогч алга'); };
ACT.skMode = d => { const P = me(), it = STK1().find(x => x.k === FS.sk); FS.sm = d.s;
  if (d.s === 'tell' && it && it.m) { FS.sk = STK1().find(x => !x.m).k; FS.px = 0; skClear(); drawSheet(); return setTimeout(() => skCenter(false), 30); }
  const held = it ? (it.m ? sum(metalsOf(P, it.k), a => a.qty) : sum(holdingsOf(P, it.k), a => a.qty)) : 0;
  if (d.s === 'sell' && held && !(FS.qty > 0)) { FS.qty = held; const e = document.getElementById('n_qty'); if (e) e.value = held.toLocaleString('en'); }
  drawSheet(); };
ACT.skOk = d => {
  const P = me(), it = STK1().find(x => x.k === FS.sk), px = FS.px || 0, qty = Math.floor(FS.qty || 0), buy = d.s !== 'sell';
  if (!(px > 0 && qty > 0)) return;
  if (buy) {
    if (qty * px > P.cash) return lackOpen(Object.assign({}, d, { go: 'skOk' }), qty * px);
    snap(it.n + ' авах'); P.cash -= qty * px;
    if (it.m) P.assets.push({ id: uid('a'), kind: 'metal', card: null, metal: it.k, name: it.n, qty, price: px, bought: P.pd || 0, inc: 0, opex: 0 });
    else { const div = divFor(it.k, px); P.assets.push({ id: uid('a'), kind: 'stock', card: null, sym: it.k, name: it.n, qty, price: px, div, bought: P.pd || 0, income: R(qty * div / L1.mpp), unitCost: px }); }
    log(G, P, `${it.n} ${qty.toLocaleString('en')} ш × ${fmt(px)}`, -qty * px, null, 'buy');
  } else {
    const held = it.m ? sum(metalsOf(P, it.k), a => a.qty) : sum(holdingsOf(P, it.k), a => a.qty); if (qty > held) return;
    snap(it.n + ' зарах'); if (it.m) sellMetal(G, P, it.k, qty, px, null); else sellStock(G, P, it.k, qty, px, null);
  }
  const was = (G.lastPx || {})[it.k]; setPx(it.k, px, P.name);
  FS.qty = 0; FS.px = 0; skClear(); save(); render(); drawSheet(); buzz(15); toast(buy ? 'Авлаа' : 'Зарлаа');
  // a new price on the Хувьцаа screen reaches the other holders the same way a drawn card does (user 2026-10-26)
  if (!it.m && was !== px) {
    if (G.mode === 'online') NET.emit({ t: 'stockpx', sym: it.k, px, prev: was || 0, txt: `${it.n} ${fmt(px)}` });
    else if (G.players.some(Q => Q.id !== P.id && !Q.out && isV3(Q) && sum(holdingsOf(Q, it.k), a => a.qty) > 0)) { FS = { pxq: { sym: it.k, px }, done: {} }; openSheet(fStockLocal, { modal: true }); }
  }
};

/* the pay buttons take the chosen loan for exactly the missing amount */
v3Act('loanGo', d => {
  const P = me(), amt = R(+d.lamt); if (!(amt > 0)) return;
  if (d.lk !== 'bankl' && amt > emRoom1(P)) return toast('Яаралтай зээлийн хязгаар хүрсэн');
  snap('Зээл');
  if (d.lk === 'bankl' && bankRoom1(P, 24) >= amt) { const pay = annuityPay(amt, G.settings.bankRate, 24);
    P.debts.push({ id: uid('d'), l: 'Банкны зээл · 24 сар', rate: G.settings.bankRate, monthly: false, bal: amt, orig: amt, pay, n: 24, kind: 'bankl', y: { paid: 0, int: 0, start: amt } });
    P.cash += amt; log(G, P, 'Банкны зээл авлаа · 24 сар', amt, null, 'loan'); toast(`+${fmtS(amt)} банкны зээл · сард ${fmt(pay)}`); }
  else { const db = bankDebt(P); db.bal += amt; db.orig += amt; P.cash += amt; log(G, P, 'Яаралтай зээл авлаа', amt, null, 'loan'); toast(`+${fmtS(amt)} яаралтай зээл · сард ${fmt(R(amt * G.settings.loanPct / 100))} хүү`); }
  if (G.mode === 'online') NET.emit({ t: 'loan', txt: `${fmtS(amt)} зээл авлаа` });
  ACT[d.go](d);
});

/* ============================================================
   Home screen v3 (user 2026-10-31, approved mock v13): light premium layout.
   Navy cash card with the big mascot · one alert line · "my money" row · 4 deck cards · special squares · Цалин.
   One screen, no scroll. Level 2 and old-rule games keep the previous lobby.
   ============================================================ */
const ic2 = (n, cls = 'i2') => { const s = OF.icons2 && OF.icons2[n]; return `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${s || ''}</svg>`; };
function alertBrief(html) {
  const t = document.createElement('div'); t.innerHTML = html; const a = t.firstElementChild; if (!a) return null;
  const b = a.querySelector('b'), sp = a.querySelector(':scope>span');
  let sub = ''; if (sp) { const c = sp.cloneNode(true); c.querySelectorAll('b,.row').forEach(x => x.remove()); sub = c.textContent.trim(); }
  const data = {}; if (a.tagName === 'BUTTON') for (const k in a.dataset) data[k] = a.dataset[k];
  return { title: b ? b.textContent.trim() : '', sub, tone: a.classList.contains('neg') ? 'neg' : a.classList.contains('ok') ? 'ok' : '', data, plain: a.tagName === 'BUTTON' };
}
ACT.alertsOpen = () => openSheet(() => `${head('Мэдэгдэл')}<div class="h3-alist">${(UI.h3alerts || []).join('') || '<p class="empty">Мэдэгдэл алга</p>'}</div>`);
function vHome3(P, f, alerts, act, mon) {
  alerts = alerts.filter(h => !h.includes('data-k="AE"'));   // no «Амьдралын эхлэл» line on the home (user 2026-10-31); the card opens at game start
  UI.h3alerts = alerts;
  const pct = Math.max(0, Math.min(100, Math.floor(f.progress * 100)));
  const neg = f.cf < 0, hide = UI.hideCash;
  if (!!P.hideCash !== !!hide && canAct(P)) { P.hideCash = !!hide; setTimeout(save, 0); }   // a hide set before this was synced reaches the other phones too
  const m = mascot(P.profId);
  // one alert line: the first alert, plus a count; a single tappable alert keeps its own action
  let al = '';
  if (alerts.length) {
    const a = alertBrief(alerts[0]) || { title: '', sub: '', tone: '', data: {} };
    const direct = alerts.length === 1 && a.plain && a.data.a;
    const attrs = direct ? Object.entries(a.data).map(([k, v]) => `data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${esc(v)}"`).join(' ') : 'data-a="alertsOpen"';
    const icn = a.tone === 'neg' ? 'd:warning-circle' : a.tone === 'ok' ? 'd:trophy' : 'd:identification-card';
    al = `<button class="h3-al ${a.tone}" ${attrs}><span class="ai">${ic2(icn)}</span><span class="tx"><b>${esc(a.title)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>${alerts.length > 1 ? `<em>+${alerts.length - 1}</em>` : ''}<span class="cr">${ic2('b:caret-right')}</span></button>`;
  }
  const Q = (a, icn, n, badge, extra = '') => `<button data-a="${a}" ${extra}><span class="ci">${ic2(icn)}</span><small>${n}</small>${badge ? `<em>${badge}</em>` : ''}</button>`;
  const nIns = Object.values(P.ins || {}).filter(x => x > 0).length;
  const quick = Q('openSave', 'r:piggy-bank', 'Хадгаламж', (P.savings || []).length || '')
    + Q('openLoan', 'r:shield-check', 'Даатгал', nIns ? '✓' : '', 'data-bt="ins"')
    + Q('openStocks', 'r:chart-line-up', 'Хувьцаа', '')
    + Q('openDebts', 'r:hand-coins', 'Зээл', '');
  const D = (k, icn, n, bg, c) => `<button class="h3-c" data-a="deckGo" data-k="${k}" style="--bg:${bg};--fg:${c}" ${act ? '' : 'disabled'}><span class="ti">${ic2(icn)}</span><b>${n}</b></button>`;
  const decks = D('JB', 'r:sparkle', 'Жижиг<br>боломж', '#C9EBAF', '#347A0F') + D('TB', 'r:buildings', 'Том<br>боломж', '#B9E6C8', '#0E7A3A')   // two piles again (studio v170)
    + D('AZ', 'r:receipt', 'Зарлага', '#F9CCC5', '#B2301D') + D('ZZ', 'r:newspaper-clipping', 'Зах<br>зээл', '#C8DBFA', '#184CB1');
  // the board's special squares, each its own button (user 2026-10-31: no more «Онцгой» picker)
  const SP = { FIRED: ['r:user-minus', 'Халагдлаа', '#FCE9E7', '#C2412D'], CHILD: ['r:baby', 'Хүүхэд', '#FFF1DA', '#C77F00'], EDU: ['r:graduation-cap', 'Боловсрол', '#E5EEFB', '#1F4FB0'] };   // no «Эрүүл мэнд» button (user 2026-10-31, again 2026-11-03), even though board v145 has the square
  const sqs = OF.board.sq1;
  const spec = Object.keys(SP).filter(t => sqs.some(q => q.type === t)).map(t => { const [icn, n, bg, c] = SP[t];
    return `<button data-a="sqType" data-t="${t}" ${act ? '' : 'disabled'}><span class="ti" style="background:${bg};color:${c}">${ic2(icn)}</span><b>${n}</b></button>`; }).join('');
  const pay = !act ? `<div class="h3-wait"><span class="av" style="background-image:url(${m})"></span><b>${esc(P.name)}-ийн самбар</b></div>`
    : P.skip > 0 ? `<button class="h3-pay skip" data-a="roll"><span class="ti">${ic2('f:hourglass-medium')}</span><b>Ээлж өнжих · ${P.skip}</b><span class="go">${ic2('b:arrow-right')}</span></button>`
    : `<button class="h3-pay" data-a="sqType" data-t="PAY"><span class="ti">${ic2('r:coins')}</span><b>Орлого</b><span class="go">${ic2('r:arrow-right')}</span></button>`;
  return `<div class="lobby h3">
  <div class="h3-h"><span class="h3-fp">${(OF.flatp && OF.flatp[P.profId]) || ''}</span><div class="h3-who"><small>${ic2('r:clock-counter-clockwise')}${esc(mon)} · Түвшин 1</small><b>${esc(PROF[P.profId].title)}</b></div>
    <button class="h3-ib" data-a="undo" aria-label="Буцаах" ${UI.undo.length ? '' : 'disabled'}>${ic2('r:arrow-u-up-left')}</button>
    <button class="h3-ib" data-a="menu" aria-label="Цэс">${ic2('r:list')}</button></div>
  <div class="h3-card"><div class="h3-deco"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="r1"></i><i class="d1"></i></div>
    <div class="hero h3-hero"><span class="pod h3-pod"></span><img class="masc h3-oct a-idle" src="${m}" alt="" data-a="hop"></div>${(P.name || '').trim() && P.name.trim() !== PROF[P.profId].title ? `<span class="h3-job">${esc(P.name)}</span>` : ''}
    <div class="h3-two" style="--n:${Math.max(String(fmtN(Math.abs(f.delta))).length + 1, String(fmtN(P.cash)).length)}">
      <span class="h3-lab2"><button class="h3-lab" data-a="hideCash" aria-label="Дүнг нуух">Бэлэн мөнгө ${ic2(hide ? 'r:eye-slash' : 'r:eye')}</button>${P.efund ? `<button class="h3-fund" data-a="openLoan" data-bt="em">Сан ${fmtS(P.efund)}</button>` : ''}</span>
      <div class="h3-m"><b class="money" data-cash="${P.cash}">${hide ? '••••••' : fmtN(P.cash)}</b><span>₮</span></div>
      <i class="h3-sep"></i>
      <span class="h3-lab2">Ашиг · 4 сар</span>
      <div class="h3-m pr ${f.delta < 0 ? 'neg' : ''}"><b>${hide ? '••••••' : fmt(f.delta, { sign: true }).replace('₮', '')}</b><span>₮</span></div>
    </div>
  </div>
  ${frGauge(P, f)}
  ${al}
  <div class="h3-q">${quick}</div>
  <div class="h3-sec">Нүдэн дээр буувал</div>
  <div class="h3-d">${decks}</div>
  <div class="h3-x" style="--n:${Math.max(1, spec.split('</button>').length - 1)}">${spec}</div>
  ${pay}
  </div>`;
}
/* bottom bar for the v3 home: Нүүр · Хөрөнгө · Тайлан (user 2026-11-04: Тайлан ↔ Хувьцаа, then Тайлан ↔ Хөрөнгө) · Хөрөнгө · Тоглогчид · Түүх (2026-10-31: Тайлан ↔ Хөрөнгө swapped) (Хувьцаа moved here 2026-10-31) (user 2026-10-31: no duplicate Хөрөнгө / Зардал) */
function navH3() {
  return [['board', 'f:house', 'Нүүр'], ['assets', 'r:wallet', 'Хөрөнгө'], ['report', 'r:receipt', 'Зардал'], ['players', 'r:users-three', 'Тоглогчид'], ['hist', 'r:clock-counter-clockwise', 'Түүх']]
    .map(([k, i, n]) => { const icn = ic2(k === 'board' && UI.tab !== 'board' ? 'r:house' : i, 'i');
      return k[0] === '@' ? `<button data-a="${k.slice(1)}">${icn}<span>${n}</span></button>` : `<button data-a="tab" data-t="${k}" ${UI.tab === k ? 'aria-current="page"' : ''}>${icn}<span>${n}</span></button>`; }).join('');
}
/* Тайлан: income, expenses and the monthly profit on one sheet */
function incRows(P, f) {
  const rows = [];
  if (P.level === 1) rows.push([PROF[P.profId].title + ' · цалин', f.salary, P.salaryPct ? `+${P.salaryPct}% нэмэгдсэн` : '']);
  for (const a of P.assets) { const d = a.loanId ? P.debts.find(x => x.id === a.loanId) : null, lp = d && (d.bal > 0 || d.kind === 'flat') ? debtPay(P, d, G) : 0, v = opAvg(P, a) - lp; if (v || lp) rows.push([a.name, v, (a.active ? 'Нэмэлт орлого' : 'Идэвхгүй орлого') + (lp ? ' · зээлийн төлбөр ' + fmtS(lp) + ' хасагдсан' : '')]); }
  for (const s of P.skills.filter(s => s.left <= 0 && s.mode === 'side')) rows.push([s.name, s.side, 'Ур чадвар']);
  return rows;
}
const RPC = ['#082567', '#F7AA21', '#E0604A', '#4C7BE0', '#2BA58C', '#8A6FD8', '#C77F00', '#A3ACC2'];
function rpDonut(rows, tot) {   // expense donut: each slice a share of the month's spending, total in the middle
  const R = 50, C = 2 * Math.PI * R; let off = 0;
  const segs = rows.map((r, i) => { const len = tot ? r.v / tot * C : 0, gap = rows.length > 1 ? Math.min(2.5, len / 3) : 0;
    const el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${RPC[i % RPC.length]}" stroke-width="14" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return el; }).join('');
  return `<div class="rp-dn"><svg viewBox="0 0 140 140" aria-hidden="true"><circle r="${R}" cx="70" cy="70" fill="none" stroke="#E8ECF3" stroke-width="14"/>${segs}</svg><div class="rp-dc"><b>${fmtS(tot)}</b></div></div>`;
}
function fReport1() {   // report v4 (user 2026-11-02): one number, then income, spending (donut over a roomy legend), freedom — generous spacing
  const P = me(), f = fin1(P, G), inc = incRows(P, f), exp = livRows(P, f).sort((a, b) => b.v - a.v);
  const I = Math.max(0, f.income), E = Math.max(0, f.expenses), left = f.cf;
  const free = f.goal > 0 ? Math.min(100, Math.round(f.passive / f.goal * 100)) : 0;
  return `${head('Зардал')}<div class="rp">
  <section class="rp-hero neg">
    <small>4 сар бүрийн зардал</small>
    <b>−${fmt(E * 4)}</b>
  </section>
  ${(() => { const pay = exp.filter(r => r.id); return pay.length ? `<section class="rp-card"><h4 class="rp-t">Төлөх боломжтой зээл</h4>${pay.map(r => { const d = P.debts.find(x => x.id === r.id), n = payoffMonths(P, d);
      return `<div class="rp-row rp-loan" role="button" data-a="loanInfo" data-id="${r.id}"><span><b>${esc(r.l)}</b><small>${esc(r.sub || '')}</small></span><button class="rp-paybtn" data-a="expPay" data-id="${r.id}" ${canAct(P) ? '' : 'disabled'}>Төлөх</button></div>`; }).join('')}</section>` : ''; })()}
  <section class="rp-card"><h4 class="rp-t">Зардлууд</h4>
    ${exp.length ? exp.map(r => r.id ? `<button class="rp-row rp-tap" data-a="loanInfo" data-id="${r.id}"><span>${esc(r.l)}</span><b class="neg">−${fmtS(r.v * 4)}</b></button>` : `<div class="rp-row"><span>${esc(r.l)}</span><b class="neg">−${fmtS(r.v * 4)}</b></div>`).join('') + `<div class="rp-row rp-tot"><span>Нийт · 4 сар</span><b class="neg">−${fmtS(E * 4)}</b></div>` : '<p class="empty">Алга</p>'}</section>

  </div>`;
}
ACT.openReport = () => { if (isV3(me())) openSheet(fReport1);   // slides up from the bottom like Хадгаламж / Даатгал (user 2026-11-04)
  else ACT.openExp(); };

/* ============================================================
   Хувьцаа v2 (user 2026-10-31): every company with its latest price and ▲/▼ since the price before;
   tap a company to sell any time at that price. Buying stays on the Жижиг боломж card only.
   ============================================================ */
function setPx(sym, px, who, prev) {
  const L = G.lastPx = G.lastPx || {}, old = prev || L[sym] || 0;
  if (old && old !== px) { (G.prevPx = G.prevPx || {})[sym] = old; (G.pxBy = G.pxBy || {})[sym] = who || ''; }
  L[sym] = px;
}
const SKC = ['#FFF1DA:#C77F00', '#E5EEFB:#1F4FB0', '#FCE9E7:#C2412D', '#EEEAFB:#5B3FC4', '#E6F4EC:#1E8A57', '#EEF2FA:#082567', '#FFF1DA:#B87400', '#EEF1F7:#5A6785'];
const skAbbr = (n, m) => m ? (n === 'Алт' ? 'Au' : 'Ag') : (n.split(/\s+/).length > 1 ? n.split(/\s+/).slice(0, 2).map(w => w[0]).join('') : n.slice(0, 2)).toUpperCase();
function skInfo(P, x, i) {
  const own = x.m ? metalsOf(P, x.k) : holdingsOf(P, x.k), held = sum(own, a => a.qty);
  const px = (G.lastPx || {})[x.k] || 0, prev = (G.prevPx || {})[x.k] || 0;
  const cost = sum(own, a => a.qty * (a.unitCost || a.price || 0));
  const [bg, fg] = SKC[i % SKC.length].split(':');
  return { x, held, px, prev, cost, val: held * px, bg, fg, ab: skAbbr(x.n, x.m) };
}
const skCh = s => !s.px || !s.prev ? '<span class="ch eq">—</span>' : s.px > s.prev ? `<span class="ch up">▲ ${Math.round((s.px / s.prev - 1) * 100)}%</span>` : s.px < s.prev ? `<span class="ch dn">▼ ${Math.round((1 - s.px / s.prev) * 100)}%</span>` : '<span class="ch eq">0%</span>';
/* Хувьцаа is a page in the bottom bar (user 2026-10-31: a page like Тоглогчид, not a pop-up); «Үнэ мэдэгдэх» still opens as a sheet */
const SKS = () => UI.sk = UI.sk || {};
function fStocks1() {   // the sheet: only the «Үнэ мэдэгдэх» form now
  const P = me(), it = STK1().find(x => x.k === FS.sk) || STK1()[0]; FS.sk = it.k;
  const hq = x => sum(ownOf(P, x.k), a => a.qty); return fStockTell(P, STK1(), it, hq, FS.px || 0, (G.lastPx || {})[it.k] || 0);
}
function vStocks() {
  const P = me(), S = SKS(), list = STK1().map((x, i) => skInfo(P, x, i));
  if (S.det) { const s = list.find(v => v.x.k === S.det); if (s) return `<div class="sk2 page">${stockDet(P, s, S)}</div>`; S.det = null; }
  const mine = list.filter(s => s.held), tot = sum(mine, s => s.val), gain = sum(mine.filter(s => s.px), s => s.val - s.cost);
  const row = s => `<button class="row" data-a="sk2Open" data-k="${s.x.k}"><span class="lg" style="background:${s.bg};color:${s.fg}">${esc(s.ab)}</span><span class="nm"><b>${esc(s.x.n)}</b>${s.held ? `<small class="own">Танд ${s.held.toLocaleString('en')} ${s.x.m ? 'г' : 'ш'}${s.px ? ' · ' + fmt(s.val) : ''}</small>` : `<small>${s.px ? 'Танд алга' : 'Үнэ гараагүй'}</small>`}</span><span class="px"><b>${s.px ? fmt(s.px) : '—'}</b>${skCh(s)}</span></button>`;
  return `<div class="sk2 page"><button class="back" data-a="tab" data-t="board">‹ Нүүр</button><div class="ptitle"><h2>Хувьцаа</h2></div><p class="sub">Сүүлд гарсан үнэ · хүссэн үедээ зарна</p>
  ${mine.length ? `<div class="sum"><div><small>Миний хувьцаа</small><b>${fmt(tot)}</b></div><div class="r"><small>${mine.length} компани</small><b class="${gain < 0 ? 'neg' : ''}">${gain < 0 ? '▼' : '▲'} ${fmt(gain, { sign: true })}</b></div></div>` : ''}
  <div class="list">${list.filter(s => !s.x.m).sort((a, b) => (!!b.held - !!a.held) || (!!b.px - !!a.px)).map(row).join('')}</div>
  <div class="sec">Үнэт металл</div>
  <div class="list">${list.filter(s => s.x.m).map(row).join('')}</div>
  ${canAct(P) ? `<button class="tell" data-a="sk2Tell">Карт сугалсан бол · Үнэ мэдэгдэх</button>` : ''}</div>`;
}
function stockDet(P, s, S) {
  const unit = s.x.m ? 'г' : 'ш', held = s.held, qty = Math.min(held, Math.max(0, Math.floor(S.qty || 0))), who = (G.pxBy || {})[s.x.k];
  const avg = held ? R(s.cost / held) : 0, got = qty * s.px, can = canAct(P) && held > 0 && qty > 0 && s.px > 0;
  return `<button class="back" data-a="sk2List">‹ Бүх хувьцаа</button>
  <div class="det"><div class="top"><span class="lg big" style="background:${s.bg};color:${s.fg}">${esc(s.ab)}</span><span class="nm"><b>${esc(s.x.n)}</b><small>1 ${s.x.m ? 'граммын' : 'ширхэгийн'} одоогийн үнэ</small></span></div>
  <div class="pxl"><span class="big">${s.px ? fmt(s.px) : '—'}</span>${skCh(s)}</div>
  <small class="was">${s.prev ? `Өмнө ${fmt(s.prev)}${who ? ' · ' + esc(who) : ''}` : s.px ? 'Энэ тоглоомд анх гарсан үнэ' : 'Энэ тоглоомд үнэ гараагүй'}</small>
  ${held ? `<div class="kv"><div><small>Танд</small><b>${held.toLocaleString('en')} ${unit}</b></div><div><small>Дундаж авсан үнэ</small><b>${avg ? fmt(avg) : '—'}</b></div></div>
  <div class="qty"><button data-a="sk2Q" data-d="-1" ${qty > 0 ? '' : 'disabled'}>−</button><label><input id="skQty" inputmode="numeric" data-in="sk2In" value="${qty ? qty.toLocaleString('en') : ''}" placeholder="0"><small>зарах ${unit === 'г' ? 'грамм' : 'ширхэг'}</small></label><button data-a="sk2Q" data-d="1" ${qty < held ? '' : 'disabled'}>+</button></div>
  <div class="chips">${[[.25, '25%'], [.5, '50%'], [1, 'Бүгд']].map(([f, n]) => { const v = Math.max(1, Math.floor(held * f)); return `<button data-a="sk2Set" data-n="${v}" class="${qty === v ? 'on' : ''}">${n}</button>`; }).join('')}</div>
  <button class="sell" data-a="sk2Sell" ${can ? '' : 'disabled'}>${!s.px ? 'Үнэ гараагүй' : qty ? `+${fmt(got)} зарах` : 'Ширхэгээ сонгоно уу'}</button>`
  : `<div class="none">Танд энэ ${s.x.m ? 'металл' : 'хувьцаа'} алга.<br>Боломжийн картаар авна.</div>`}</div>`;
}
const skStep = h => h >= 100 ? Math.pow(10, Math.floor(Math.log10(h)) - 1) : 1;
const skHeld = (P, k) => sum(['gold', 'silver'].includes(k) ? metalsOf(P, k) : holdingsOf(P, k), a => a.qty);
function skGo(det) { if (UI.sheetFn) closeSheet(); const P = me(); UI.sk = det ? { det, qty: skHeld(P, det) } : {}; UI.tab = 'stocks'; render(); window.scrollTo(0, 0); }
v3Act('openStocks', () => skGo(null));
v3Act('skSellFrom', d => skGo(d.k));
ACT.sk2Open = d => { UI.sk = { det: d.k, qty: skHeld(me(), d.k) }; render(); window.scrollTo(0, 0); };
ACT.sk2List = () => { if (UI.sheetFn === fStocks1) return closeSheet(); UI.sk = {}; render(); };
ACT.sk2Tell = () => { FS = { sm: 'tell', sk: STK1().find(x => !x.m).k, px: 0 }; openSheet(fStocks1, { modal: true }); setTimeout(() => skCenter(false), 30); };
ACT.sk2Set = d => { SKS().qty = +d.n; render(); };
ACT.sk2Q = d => { const S = SKS(), held = skHeld(me(), S.det); S.qty = Math.max(0, Math.min(held, Math.floor(S.qty || 0) + (+d.d) * skStep(held))); render(); };
ACT.sk2In = (d, el) => { const S = SKS(); S.qty = Math.min(skHeld(me(), S.det), parseAmt(el.value)); render(); };
ACT.sk2Sell = () => {
  const P = me(), S = SKS(), it = STK1().find(x => x.k === S.det); if (!it || !canAct(P)) return;
  const held = skHeld(P, it.k), qty = Math.min(held, Math.floor(S.qty || 0)), px = (G.lastPx || {})[it.k] || 0;
  if (!(qty > 0 && px > 0)) return;
  snap(it.n + ' зарах');
  if (it.m) sellMetal(G, P, it.k, qty, px, null); else sellStock(G, P, it.k, qty, px, null);
  if (G.mode === 'online') NET.emit({ t: 'buy', txt: `${it.n} ${qty.toLocaleString('en')} ${it.m ? 'г' : 'ш'} заралаа` });
  S.qty = skHeld(P, it.k); save(); render(); buzz(15); toast(`+${fmtS(qty * px)} · зарлаа`);
};

/* freedom on the home card: half-circle gauge + battery road the little mascot rides to the goal (user 2026-10-31: «өмнөх шиг хагас дугуй») */
function frGauge(P, f) {
  const pr = Math.max(0, Math.min(1, f.progress || 0)), p = Math.floor(pr * 100);
  const a = Math.PI * pr, x = 50 - 40 * Math.cos(a), y = 50 - 40 * Math.sin(a);
  const g = `<svg viewBox="0 0 100 56" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" class="tr"/>${pr > 0 ? `<path d="M10 50 A40 40 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="fg"/>` : ''}<text x="50" y="49" text-anchor="middle">${p}%</text></svg>`;
  // its own white card under the cash card, like the old app's gauge (user 2026-10-31)
  return `<button class="h3-frc" data-a="freeInfo">${g}<span class="r"><b>Санхүүгийн эрх чөлөө</b><small>Идэвхгүй орлого ${fmtS(f.passive * 4)} / ${fmtS(f.goal * 4)}</small><span class="bar"><i style="width:${p}%"></i><span class="me" style="left:clamp(8px, ${p}%, calc(100% - 8px))"><span class="dot"></span></span><span class="st">★</span></span></span></button>`;
}

/* Хөрөнгө is a page in the bottom bar too (user 2026-10-31: «хөрөнгийг доошоо»); Тайлан moved up to the home row */
function vAssets() { return `<div class="as2 page">${fAssets1().replace(/<div class="shead">[\s\S]*?<\/div>/, '<div class="ptitle"><h2>Хөрөнгө</h2></div>')}</div>`; }
v3Act('openAssets', () => { if (me().level !== 1) return openSheet(fAssets1, { modal: true }); if (UI.sheetFn) closeSheet(); UI.tab = 'assets'; render(); window.scrollTo(0, 0); });

/* ============================================================
   Card page v3 (user 2026-11-02, mock card10): a product-style page — the card's 3D picture on a soft tint,
   title, price with a monthly pill, the description, a «Нөхцөл» list, and a navy bottom bar (Татгалзах · Авах).
   No bank-loan row (user). Level 1 new-rule games only.
   ============================================================ */
const cpOn = P => isV3(P) && P.level === 1;
function cpArt(c) {
  if (c.deck !== 'ZZ') return artFor(c);
  const s = (c.scope || '') + ' ' + c.title;
  if (/байр|байшин|газар|талбай|оффис|гараж|зогсоол|түрээс|СӨХ|шугам|ипотек/i.test(s)) return 'i_house';
  if (/бонд/i.test(s)) return 'i_bank';
  return 'i_market';
}
/* market card page: the headline offer in one line — «<what> авна · <price>» — so it never reads like something to buy */
function zzOffer(c) {
  const fx = c.fx, hi = c.hi || {}, sc = (c.scope || '').trim(), k = fx.kind;
  if (k === 'buy' || k === 'buy_metal') return { l: `${sc} авна`, s: k === 'buy' ? 'Нэг бүрийг' : 'Нэг ширхэгийг', v: hi.v, t: 'pos' };
  if (k === 'buy_mult') return { l: `${sc} авна`, s: 'Авсан үнийн', v: hi.v, t: 'pos' };
  if (k === 'sell_plus') return { l: `${sc.replace(/тай хүн бүрт$/, '')} авна`, s: 'Авсан үнээс', v: hi.v, t: 'pos' };
  if (k === 'shares_mult') return { l: `${coName(fx.tags)} хувьцаа`, s: 'Хувьцааны тоо', v: hi.v, t: hi.t };
  if (k === 'pay_if') return { l: fx.tags === 'rental' ? 'Түрээсийн байртай бол төлнө' : (hi.l || 'Төлөх'), s: sc, v: hi.v, t: 'neg' };
  if (k === 'salary_prof') return { l: 'Цалин нэмэгдэнэ', s: [].concat(fx.tags || []).join(', '), v: hi.v, t: 'pos' };
  if (k === 'salary_all') return { l: 'Цалин нэмэгдэнэ', s: 'Бүх тоглогч', v: hi.v, t: 'pos' };
  if (hi.v) return { l: hi.l, s: sc, v: hi.v, t: hi.t };
  return null;   // dice / bond cards: their rows are the offer
}
function zzMascot(c) {
  const k = c.fx.kind, o = zzOffer(c);
  if (o && o.t === 'neg' || k === 'infl' || k === 'pay_if') return 'm_worry';
  if (/^(buy|buy_mult|sell_plus)$/.test(k)) return 'm_key';
  if (k === 'salary_prof' || k === 'salary_all') return 'm_pay';
  return 'm_invest';
}
function zzObj(c) {   // the thing the card is about, shown next to the mascot
  const k = c.fx.kind;
  if (/^(buy|buy_mult|sell_plus|pay_if)$/.test(k)) return 'i_house';
  if (k === 'buy_metal') return 'i_coins';
  if (/^bond/.test(k)) return 'i_bank';
  if (/^shares/.test(k)) return 'i_market';
  if (k === 'salary_prof' || k === 'salary_all') return 'i_coins';
  if (k === 'infl') return 'i_expense';
  return 'i_market';
}
function zzPage4(c, act, who) {
  const o = zzOffer(c), rows = (c.rows || []).filter(r => r.l || r.v);
  const offer = o ? `<div class="zn-of"><div><span>${esc(o.s || '')}</span><b>${esc(o.l)}</b></div><em class="${o.t === 'neg' ? 'neg' : o.t === 'pos' ? 'pos' : ''}">${esc(o.v)}</em></div>`
    : rows.length ? `<div class="zn-of list">${rows.map(r => `<div><span>${esc(r.l)}</span><b>${esc(r.v)}</b></div>`).join('')}</div>` : '';
  return `<div class="zn">
  <div class="zn-top"><button class="cp-fb l zx" data-a="close" aria-label="Хаах">${X.match(/<svg[\s\S]*<\/svg>/)[0]}</button><span class="zn-no">Зах зээл <b>№${esc(c.no || c.id.split('-')[1])}</b>${who ? ` · ${who}` : ''}</span><img src="${ART(zzMascot(c))}" alt=""></div>
  <div class="zn-body"><h2>${esc(c.title)}</h2>${c.desc ? `<p class="zn-desc">${esc(c.desc)}</p>` : ''}${offer}${act}</div></div>`;
}
const CP_TINT = { JB: '#EDF5E4', TB: '#E6F1EA', AZ: '#F6ECEA', ZZ: '#E8EEF7', AE: '#EEF2FA' };
function cardPage(P, c, compact, A, who) {
  const fx = c.fx || {}, k = fx.k, L = [];
  let price = '', pill = '', hiBox = '';
  if (k === 're' && (fx.sub === 'biz' || fx.sub === 'auto')) { price = fmt(fx.price); pill = `+${fmtS(fx.net * 4)} / 4 сар`;   // «Жижиг бизнес»: cash price only, no loan (studio v146)
    L.push(['Үнэ (бэлнээр)', fmt(fx.price)], ['4 сарын ашиг', '+' + fmt(fx.net * 4), 'g']); }
  else if (k === 'side') { price = fmt(fx.cost); pill = `+${fmtS(fx.inc * 4)} / 4 сар`;   // «Нэмэлт орлого» (studio v146)
    L.push(['Сар бүр нэмэлт орлого', '+' + fmt(fx.inc), 'g'], ['Хугацаа', `${fx.left} Орлого (${R(fx.left / L1.ppy)} жил)`]); }
  else if (k === 're') { price = fmt(fx.price); pill = `+${fmtS(fx.net * 4)} / 4 сар`;
    L.push(['Урьдчилгаа', fmt(fx.down)], ['4 сарын төлөлт', '−' + fmt(fx.pay * 4)], ['4 сарын ашиг', '+' + fmt(fx.net * 4), 'g']); }
  else if (k === 'land') { price = fmt(fx.price); }
  else if (compact) { price = fmt(fx.price) + '<small> / ширхэг</small>'; pill = k === 'stock' ? (fx.div ? `Ногдол ашиг ${fmt(fx.div)}` : 'Ногдол ашиггүй') : 'Орлогогүй'; }
  else if (k === 'bond') { price = fmt(fx.price); pill = `+${fmtS(fx.net * 4)} / 4 сар`; L.push(['4 сарын ашиг', '+' + fmt(fx.net * 4), 'g'], ['Хугацаа', `${fx.term} Орлого (${R(fx.term / L1.ppy)} жил)`]); }
  else if (c.deck === 'ZZ') {   // market card on the same page as Том боломж: the offer as the price, its name as the pill, who + rows as conditions
    if (c.hi && c.hi.v) { price = esc(c.hi.v); pill = esc(c.hi.l); }
    if (c.scope) L.push(['Хэнд', /хүн|сугалсан|бүрт|хүнд/i.test(c.scope) ? c.scope : c.scope + ' эзэмшигчид']);
    for (const r of (c.rows || []).filter(r => r.l || r.v)) L.push([r.l, r.v, '']);
  }

  else if (!compact) {
    const hide = azChoice(c) && azApplies(P, fx.cond);
    if (!hide) for (const r of (c.rows || []).filter(r => r.l || r.v)) L.push([r.l, r.v, r.t === 'pos' ? 'g' : r.t === 'neg' ? 'r' : '']);
    if (k === 'skill') L.push(['Цалин', `${fmtS(salaryOf(P))} → ${fmtS(R(salaryOf(P) * (1 + fx.pct / 100)))}`, 'g']);   // one list, no repeated box (user 2026-11-04)
    if (c.hi && c.hi.v) { price = esc(c.hi.v); }
  }
  const sell = '';   // cards are sold from Тоглогчид (user 2026-11-09)
  const box = c.box && c.box.x && !compact && c.deck !== 'ZZ' ? `<p class="cp-note">${esc(c.box.x)}</p>` : '';
  return `<div class="cp-stage" style="background:${CP_TINT[c.deck] || '#EEF2FA'}"><button class="cp-fb l zx" data-a="close" aria-label="Хаах">${X.match(/<svg[\s\S]*<\/svg>/)[0]}</button>${sell || (compact ? unitTell(c) : '')}<img src="${ART(cpArt(c))}" alt=""></div>
  <div class="cp-body">
    <div class="cp-r1"><h2>${esc(compact ? (k === 'stock' ? coName(fx.sym) : L1.metalName[fx.metal]) : c.title)}</h2><span class="cp-src">${esc(DECKS[c.deck].n)} <b>№${esc(c.no || c.id.split('-')[1])}</b>${who ? `<br>${who}` : ''}</span></div>
    ${price ? `<div class="cp-r2"><span class="cp-pr ${c.hi && c.hi.t === 'neg' && (!pill || c.deck === 'ZZ') ? 'neg' : c.deck === 'ZZ' ? 'pos' : ''}">${price}</span>${pill ? `<span class="cp-pill">${pill}</span>` : ''}</div>` : c.scope && c.deck !== 'ZZ' ? `<div class="cp-scope">${esc(c.scope)}</div>` : ''}
    ${compact ? `<p class="cp-news">${ic('newspaper')}<span>${esc(c.title)}</span></p>` : c.desc ? `<p class="cp-desc">${esc(c.desc)}</p>` : ''}
    ${hiBox}
    ${L.length ? `${c.deck === 'ZZ' ? '' : '<div class="cp-lb">Нөхцөл</div>'}<div class="cp-kv">${L.map(([l, v, t]) => `<div><span>${esc(l)}</span><b class="${t || ''}">${esc(v)}</b></div>`).join('')}</div>` : ''}
    ${box}
    <div class="cp-act">${A ? A(P, c) : '<div class="cta"><button class="btn go" data-a="close">Хаах</button></div>'}</div>
  </div>`;
}
/* the sheet becomes a full page while a card is open */
{ const ds = drawSheet; drawSheet = function () { const r = ds.apply(this, arguments); const sh = document.getElementById('sheet'); if (sh) { const on = !!G && cpOn(me()), az = UI.sheetFn === fCard1;   // every drawn card opens as a centred popup (user 2026-11-03: «бүх картуудаа popup-аар»)
    sh.classList.toggle('cp', UI.sheetFn === fCard1 && on && !az); sh.classList.toggle('zpop', (UI.sheetFn === fZZ1 || az || !!(UI.sheetFn && UI.sheetFn._zp)) && on); } return r; };
  const cs = closeSheet; closeSheet = function () { const sh = document.getElementById('sheet'); if (sh) sh.classList.remove('cp', 'zpop'); return cs.apply(this, arguments); }; }

/* special squares and the payday screen use the same page (user 2026-11-02: «адилхан бүгдийг нь») */
const CP_SQ = { FIRED: ['m_fired', '#F6ECEA'], CHILD: ['i_child', '#FBF1E2'], EDU: ['p_PR-01', '#E8EEF7'], HEALTH: ['p_PR-02', '#E6F1EA'], PAY: ['i_coins', '#FDF3DF'] };
function pageify(html, t) {
  const [img, tint] = CP_SQ[t] || ['i_coins', '#EEF2FA'];
  let title = '';
  html = html.replace(/^\s*(<div class="crumbs">[\s\S]*?<\/div>)?\s*<div class="shead"><h3>([\s\S]*?)<\/h3>[\s\S]*?<\/div>/, (m, a, h) => { title = h; return ''; });
  html = html.replace(/<div class="stage[^"]*">[\s\S]*?<\/div>/, '');
  const sq = (OF.board.sq1.find(q => q.type === t) || {});
  return `<div class="cp-stage" style="background:${tint}"><button class="cp-fb l zx" data-a="close" aria-label="Хаах">${X.match(/<svg[\s\S]*<\/svg>/)[0]}</button><img src="${ART(img)}" alt=""></div>
  <div class="cp-body"><div class="cp-r1"><h2>${title}</h2><span class="cp-src">${t === 'PAY' ? 'Самбар' : 'Онцгой нүд'}</span></div>
  ${sq.desc && t !== 'PAY' ? `<p class="cp-desc">${esc(sq.desc)}</p>` : ''}<div class="cp-act">${html}</div></div>`;
}
{ const os = openSheet; openSheet = function (fn, opts) {
    const t = UI.cpNext; UI.cpNext = null;
    if (t && G && cpOn(me()) && !(opts && opts.modal)) { const w = () => pageify(fn(), t); w._cp = t; w._zp = 1; return os.call(this, w, opts); }   // squares open as popups too (user 2026-11-03)
    return os.apply(this, arguments); };
  const sq1 = openSquare1; openSquare1 = function (s) { UI.cpNext = CP_SQ[s.type] && s.type !== 'PAY' ? s.type : null; try { return sq1.apply(this, arguments); } finally { UI.cpNext = null; } };
  const ds = drawSheet; drawSheet = function () { const r = ds.apply(this, arguments); const sh = document.getElementById('sheet'); if (sh && UI.sheetFn && UI.sheetFn._cp && !UI.sheetFn._zp) sh.classList.add('cp'); return r; }; }

/* Зах зээл page v2 (user 2026-11-02: «тэр чигт нь соль»): no big picture — a news headline, the offer as one clear line,
   then «Танд» with what this means for you and the button to act. */
function zzPage(P, c, compact, A, who) {
  // only the essentials (user 2026-11-02): headline, one figure, your assets with «Зарах», the button
  const sc = c.scope || '';
  const whom = !sc ? '' : /хүн|сугалсан|бүрт|хүнд/i.test(sc) ? sc : sc + ' эзэмшигчид';
  const rows = (c.rows || []).filter(r => r.l || r.v);
  const h = A(P, c), mine = /class="ln|data-a="(zzPay|lackAsk)"|zzRoll|class="dice/.test(h);
  return `<div class="zm">
  <div class="zm-top"><button class="zm-ib" data-a="close" aria-label="Буцах">${ic2('b:caret-right')}</button><span>Зах зээл · №${esc(c.no || c.id.split('-')[1])}${who ? ' · ' + who : ''}</span></div>
  <h2>${esc(c.title)}</h2>
  ${c.hi && c.hi.v ? `<div class="zm-fig"><b class="${c.hi.t === 'neg' ? 'neg' : 'pos'}">${esc(c.hi.v)}</b><small>${esc(c.hi.l)}${whom ? ' · ' + esc(whom) : ''}</small></div>`
    : rows.length ? `<div class="zm-rows">${rows.map(r => `<div><span>${esc(r.l)}</span><b>${esc(r.v)}</b></div>`).join('')}</div>${whom ? `<small class="zm-who">${esc(whom)}</small>` : ''}` : ''}
  <div class="zm-me ${mine ? '' : 'none'}">${h}</div>
  </div>`;
}

/* Хувьцаа as a bottom sheet like Хадгаламж / Даатгал (user 2026-11-04): rounded top, not a full page */
function fSk1() {
  const h = vStocks().replace('<button class="back" data-a="tab" data-t="board">‹ Нүүр</button>', '').replace('<div class="ptitle"><h2>Хувьцаа</h2></div>', '').replace('class="sk2 page"', 'class="sk2 insheet"');
  return (UI.sk && UI.sk.det ? '' : head('Хувьцаа')) + h;
}
skGo = function (det) { const P = me(); UI.sk = det ? { det, qty: skHeld(P, det) } : {}; if (UI.sheetFn && UI.sheetFn !== fSk1) closeSheet(); if (UI.tab === 'stocks') UI.tab = 'board';
  if (UI.sheetFn === fSk1) drawSheet(); else openSheet(fSk1); };
v3Act('openStocks', () => skGo(null));
v3Act('skSellFrom', d => skGo(d.k));
['sk2Open', 'sk2List', 'sk2Set', 'sk2Q', 'sk2In', 'sk2Sell'].forEach(k => { const f = ACT[k]; ACT[k] = (d, el) => { const inS = UI.sheetFn === fSk1; const r = f(d, el); if (inS && UI.sheetFn === fSk1) { drawSheet(); const b = document.querySelector('#sheet .sheet-body'); if (b && (k === 'sk2Open' || k === 'sk2List')) b.scrollTop = 0; } return r; }; });

/* Тайлан is a page in the bottom bar like Хөрөнгө (user 2026-11-04) */
function vReport() { return `<div class="rp2 page">${fReport1().replace(/<div class="shead">[\s\S]*?<\/div>/, '<div class="ptitle"><h2>Зардал</h2></div>')}</div>`; }
v3Act('openReport', () => { if (UI.sheetFn) closeSheet(); UI.tab = 'report'; render(); window.scrollTo(0, 0); });

/* how long until a loan closes, in months, years and Орлого (user 2026-11-04) — DERIVED from balance, rate and payment */
function payoffMonths(P, d) {
  if (!d || !(d.bal > 0)) return 0;
  if (d.kind === 'prof') return Math.max(0, loanEndM(P, d) - (P.month || 0));
  if (d.kind === 'bank' || d.kind === 'personal' || d.kind === 'l2') return null;   // interest-only: no end date
  if (!(d.pay > 0)) return null;
  const n = monthsLeft(d); return n > 6000 ? null : n;
}
function termTxt(n) { const y = Math.floor(n / 12), m = n % 12; return (y ? `${y} жил` : '') + (y && m ? ' ' : '') + (m || !y ? `${m} сар` : ''); }
function termRow(P, d) {
  const n = payoffMonths(P, d);
  if (n === null) return `<div class="ln" style="border:0"><span>Хаагдах хугацаа</span><b>Хугацаагүй · хүүгээ төлнө</b></div>`;
  if (!n) return '';
  const o = Math.ceil(n / L1.mpp);
  return `<div class="ln" style="border:0"><span>Хаагдах хүртэл<span class="sub">${o} Орлогын дараа</span></span><b>${termTxt(n)}</b></div>`;
}

/* tapping a loan row (not «Төлөх») shows only how long it runs (user 2026-11-04) */
function fLoanInfo() {
  const P = me(), d = P.debts.find(x => x.id === FS.debt); if (!d) return head('Зээл');
  const line = d.line ? P.exps.find(e => e.id === d.line) : null, m = line ? line.v : (d.kind === 'bank' || d.kind === 'personal' ? R(d.bal * (d.kind === 'bank' ? G.settings.loanPct : d.rate) / 100) : d.pay || 0);
  const n = payoffMonths(P, d);
  return `${head(esc(d.l))}<div class="li-box">
    ${n === null ? `<div class="li-big"><b>Хугацаагүй</b><small>Зөвхөн хүүгээ төлнө</small></div>` : `<div class="li-big"><small>Хаагдах хүртэл</small><b>${termTxt(n)}</b><span>${Math.ceil(n / L1.mpp)} Орлогын дараа</span></div>`}
    <div class="li-row"><span>Үлдэгдэл</span><b>${fmt(d.bal)}</b></div>
    <div class="li-row"><span>Орлого бүр (4 сар)</span><b class="neg">−${fmt(m * L1.mpp)}</b></div></div>`;
}
ACT.loanInfo = d => { FS = { debt: d.id }; openSheet(fLoanInfo); };

/* ============================================================
   Studio v146 (2026-11-04): «Нэмэлт орлого» cards and the «Татварын шалгалт» market card for «Жижиг бизнес»
   ============================================================ */
function actSide1(P, c) {
  const fx = c.fx;
  return `${cpOn(P) ? '' : `<div class="box"><div class="ln"><span>Төлбөр</span><b>${fmt(fx.cost)}</b></div><div class="ln"><span>Сар бүр нэмэлт орлого</span><b class="pos">+${fmt(fx.inc)}</b></div>
    <div class="ln"><span>Хугацаа</span><b>${fx.left} Орлого</b></div></div>`}${shortfall(P, fx.cost)}
  ${FS.offerLock ? offerHTML(P, 0) : ''}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, fx.cost + offerFee(0), 'sideOk1', 'Авах')}</div>`;
}
ACT.sideOk1 = () => { const P = me(); const c = CARD[FS.card]; if (P.cash < c.fx.cost + offerFee(0)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title); buySide(G, P, c); payOffer(P, 0, c); save(); closeSheet(); buzz(15); toast(`Сар бүр +${fmt(c.fx.inc)} · ${c.fx.left} Орлого`); };
const _zzRows146 = zzRows;
zzRows = function (P, c) {
  const fx = c.fx;
  if (fx.kind !== 'business_audit') return _zzRows146(P, c);
  const hits = zzHits(P, fx), D = FS.done; if (!hits.length) return '';
  return hits.map(a => { const v = D['t:' + a.id];
    return `<div class="ln" style="flex-wrap:wrap"><span>${esc(a.title || a.name)}<span class="sub">Шоо 1–2 бол 1 сарын ашиг (${fmt(a.net)}) алдана</span></span>${v ? `<b class="${v <= 2 ? 'neg' : 'pos'}">${v} · ${v <= 2 ? '−' + fmtS(a.net) : 'Юу ч болохгүй'}</b>` : ''}</div>${v ? '' : dicePad('zzAudit', `data-p="${P.id}" data-id="${a.id}"`)}`; }).join('');
};
ACT.zzAudit = d => { const P = PL1(d.p); const c = CARD[FS.card]; const a = P.assets.find(x => x.id === d.id); if (!a) return; const v = +d.n; snap('Татварын шалгалт');
  if (v <= 2) { P.cash -= a.net; log(G, P, `${a.title || a.name} · шоо ${v}, 1 сарын ашиг алдлаа`, -a.net, c.id, 'market'); } else log(G, P, `${a.title || a.name} · шоо ${v}, юу ч болсонгүй`, 0, c.id, 'market');
  FS.done['t:' + a.id] = v; save(); render(); drawSheet(); };
/* the report and the home lists show side income as its own line (not passive) */
const _incRows146 = incRows;
incRows = function (P, f) { const rows = _incRows146(P, f); for (const s of (P.sides || []).filter(s => s.left > 0)) rows.push([s.name, s.inc, `Нэмэлт орлого · ${s.left} Орлого үлдсэн`]); return rows; };
/* another player's sheet (online «Харах»): assets AND savings, emergency fund, training, side income (user 2026-11-04: savings were missing) */
const _fPeek146 = fPeek;
fPeek = function () {
  const o = G.players.find(p => p.id === FS.pid); if (!o || !isV3(o)) return _fPeek146();
  const f = fin1(o, G), rows = [];
  for (const a of o.assets) { const [, v, t] = aVal1(o, a); rows.push([a.title && a.sub === 'biz' ? a.title : a.name, v, t]); }
  for (const s of o.savings || []) rows.push([saveName(s), fmtS(s.amt), '']);
  if (o.efund) rows.push(['Яаралтай сан', fmtS(o.efund), '']);
  for (const s of o.skills || []) rows.push([s.name, s.left > 0 ? `${s.left} Орлого үлдсэн` : `цалин +${s.pct}%`, s.left > 0 ? '' : 'pos']);
  for (const s of (o.sides || []).filter(s => s.left > 0)) rows.push([s.name, `+${fmtS(s.inc * 4)} / 4 сар`, 'pos']);
  return `<div class="shead">${avatar(o)}<h3>${esc(o.name)}</h3>${X}</div>
  <div class="grid2"><div class="kv"><small>Бэлэн мөнгө</small><b>${cashTxt(o)}</b></div><div class="kv"><small>Ашиг / 4 сар</small><b class="${f.cf >= 0 ? 'pos' : 'neg'}">${fmtS(f.cf * 4, { sign: true })}</b></div>
  <div class="kv"><small>Идэвхгүй орлого</small><b>${fmtS(f.passive * 4)}</b></div><div class="kv"><small>Зардал / 4 сар</small><b>${fmtS(f.expenses * 4)}</b></div></div>
  <div class="box"><h4>Хөрөнгө, хадгаламж <span>${rows.length}</span></h4>${rows.map(r => `<div class="ln"><span>${esc(r[0])}</span><b class="${r[2]}">${r[1]}</b></div>`).join('') || '<p class="empty">Хөрөнгөгүй</p>'}</div>
  <div class="box"><h4>Сүүлийн үйлдэл</h4>${o.hist.slice(0, 8).map(logRow).join('') || '<p class="empty">Одоохондоо алга</p>'}${histAllBtn(o)}</div>`;
};

/* Боломж square: pick the pile first — Жижиг or Том боломж (studio v170, R06/R08) */
function fOppPick() {
  const B = (k, icn, n, sub, bg, fg) => `<button class="opk" data-a="oppDeck" data-k="${k}" style="--bg:${bg};--fg:${fg}"><span class="ti">${ic2(icn)}</span><span class="tx"><b>${n}</b><small>${sub}</small></span>${ic2('b:caret-right')}</button>`;
  return `${head('Боломж')}<p class="mute" style="font-size:13px">Аль багцаас сугалсан бэ?</p>
  <div class="opks">${B('JB', 'r:sparkle', 'Жижиг боломж', 'Хувьцаа, жижиг бизнес, сургалт, гараж, газар', '#C9EBAF', '#347A0F')}${B('TB', 'r:buildings', 'Том боломж', 'Байр, байшин, бонд', '#B9E6C8', '#0E7A3A')}</div>`;
}
ACT.oppDeck = d => { FS = { deck: d.k, q: '', sq: FS.sq }; openSheet(fPick); };

/* «Эртний эдлэл» (studio v170): one piece at the card price, no income, sold only by a ZZ collector card (×3, ×8, ×10) */
function actAntique1(P, c) {
  const cost = c.fx.price, fee = offerFee(cost);
  return `${cpOn(P) ? '' : `<div class="box"><div class="ln"><span>Үнэ · 1 ширхэг</span><b>${fmt(cost)}</b></div><div class="ln"><span>Орлого</span><b>0₮</b></div></div>`}${FS.offerLock ? offerHTML(P, cost) : ''}
  ${cashPrev(P, -cost - fee, 0)}${shortfall(P, cost + fee)}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, cost + fee, 'antiqueOk', 'Авах', true)}</div>`;
}
ACT.antiqueOk = () => {
  const P = me(), c = CARD[FS.card], cost = c.fx.price;
  if (P.cash < cost + offerFee(cost)) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title);
  P.cash -= cost; P.assets.push({ id: uid('a'), kind: 'antique', card: c.id, item: c.fx.item, name: c.title, price: cost, qty: 1, bought: P.pd || 0, inc: 0, opex: 0 });
  log(G, P, c.title, -cost, c.id, 'buy'); payOffer(P, cost, c);
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: c.title });
  save(); closeSheet(); buzz(20);
};

/* ============================================================
   Түвшин 2 «Их тал» — prompt v7 §14 (user 2026-11-04: «Түвшин 2 яагаад огт нэг ч шинэчлэгдээгүй байгаа юм бэ»)
   Replaces the old Level 2 (collateral loans, «идэвхгүй − зардал», return to Level 1) for v3 games.
   State: P.l7 = { b, dp, dream, proj: [{uid,id,title,cat,pct,paid,net,sp?,wait?,win?,pay?}], skip, yr }
   ============================================================ */
const T9 = 1e9;
/* always тэрбум₮ with thousands commas, like the studio board (user 2026-11-11 «студитэй тулга»; earlier «их наяд» dropped) */
const tb9 = a => { const v = +(a / T9).toFixed(4); return v >= 1000 ? Math.round(v).toLocaleString('en') : String(v); };
const fmtB = (n, o = {}) => { n = Math.round(n || 0); const a = Math.abs(n); if (a && a < 1e7) return fmtS(n, o);
  const s = !a ? '0₮' : tb9(a) + ' тэрбум₮'; return (n < 0 ? '−' : (o.sign && n > 0 ? '+' : '')) + s; };
const fmtBn = n => { const a = Math.abs(Math.round(n || 0)); return (n < 0 ? '−' : '') + tb9(a); };
const is7 = P => !!(P && P.l7 && P.level === 2);
/* «Шарк тал» (studio 2026-11-09 R13). Win 2 = «Орлогоо 4 дахин өсгөх» (studio 2026-11-10): projects' monthly profit ≥ 3 × passive income (b).
   The earlier app-only cash goal (1 их наяд₮, user 2026-11-04) is kept behind W2CASH until the user confirms which one stays. */
const W2CASH = false, GOAL7 = 1000 * 1e9, W2X = 3;   // studio 2026-11-10: «Орлогоо 4 дахин» = projects' profit ≥ 3 × passive
const CAP7 = 40;   // starting capital = passive × 40 (studio R13)
/* dream shares (studio R13): another player may buy one 20% share of your dream → your price rises 40%, the holder gets that 40% when you fulfil it.
   Kept on the holder's own state (P.l7.sh) so it syncs online with the player; G.l7d is read for older saves. */
const dShare = id => { for (const q of (G && G.players) || []) { const v = q.l7 && q.l7.sh && q.l7.sh[id]; if (v) return { pid: q.id, name: q.name, paid: v }; } return (G.l7d || {})[id] || null; };
const dBase = id => CARD[id] ? CARD[id].fx.price : 0;
const dPrice = id => Math.round(dBase(id) * (dShare(id) ? 1.4 : 1));
const dp7 = P => dPrice(P.l7.dream);
const L7 = {
  live: q => q.sp !== 'startup' && !(q.sp === 'wait' && q.wait > 0),       // projects that earn this year
  P: P => P.l7.proj.filter(L7.live).reduce((s, q) => s + q.net, 0),         // monthly profit of all projects
  w2: P => P.l7.b > 0 ? L7.P(P) / (W2X * P.l7.b) : 0,                         // Win 2 progress: P ÷ 2b
  inc: P => P.l7.b + L7.P(P),                                              // b + P (monthly)
  n: (P, cats) => cats ? P.l7.proj.filter(q => cats.includes(q.cat)).length : P.l7.proj.length,
  pctTxt: q => q.pct === 100 ? 'Бүтэн' : q.pct + '%',
  win: w => w[0] === w[w.length - 1] ? String(w[0]) : w.join('–'),
};

/* ---------- transition (§14.1) ---------- */
function enter7(G, P, dreamId) {
  const b = Math.round(fin1(P, G).passive * 1000), cap = b * CAP7, c = CARD[dreamId];
  P.l7 = { b, dp: c.fx.price, dream: dreamId, proj: [], skip: 0, yr: 0, l1: { cash: P.cash, passive: Math.round(b / 1000) } };
  P.cash = Math.round(P.cash * 1000) + cap;
  P.level = 2; P.pos2 = 0; P.dream = dreamId; P.streak = 0;
  log(G, P, `Шарк тал руу гарлаа · гарааны капитал ${fmtB(cap)} · мөрөөдөл: ${c.title}`, cap, dreamId, 'level');
}
function prev7(P) {   // what the move to Их тал will give — shown on the dream card before confirming
  const pas = fin1(P, G).passive, b = Math.round(pas * 1000), cash = Math.round(P.cash * 1000) + b * CAP7;
  return `<div class="box l7-pre">
    <div class="ln"><span>Идэвхгүй орлого<span class="sub">сая → тэрбум</span></span><b>${fmtS(pas)} → ${fmtB(b)}</b></div>
    <div class="ln"><span>Бэлэн мөнгө<span class="sub">сая → тэрбум</span></span><b>${fmtS(P.cash)} → ${fmtB(P.cash * 1000)}</b></div>
    <div class="ln"><span>Гарааны капитал<span class="sub">идэвхгүй орлого × ${CAP7}</span></span><b class="pos">+${fmtB(b * CAP7)}</b></div>
    <div class="ln tot"><span>Шарк талын бэлэн мөнгө</span><b>${fmtB(cash)}</b></div></div>
  <p class="mute" style="font-size:12px">Цалин, зардал, Түвшин 1-ийн зээл, хүүхэд, даатгал Шарк талд тооцогдохгүй. Түвшин 1-ийн хөрөнгө түгжигдэнэ. Шарк талд зээл байхгүй, Түвшин 1 рүү буцахгүй.</p>`;
}
v3Act('levelUp', () => {
  const P = me();
  if (G.settings.endAtL1) { snap('Ялалт'); return win7(P, 'Түвшин 1 дууслаа'); }
  FS = { deck: 'MO', q: '' }; openSheet(fPick);
});
function fDream7() {
  const c = CARD[FS.card], P = me();
  return `${head('Мөрөөдөл', `<span>Мөрөөдөл</span>›<b>№ ${esc(c.no || c.id.split('-')[1])}</b>`)}
  <div class="winbox" style="padding:0">${stage('m_free', 'a-free', confetti())}<p class="kicker">Түвшин 1 дууслаа</p></div>
  ${cardHTML(c)}
  <p class="mute" style="font-size:13px">Мөрөөдлөө аппаас шууд сонгоно — сонгосноо өөрчлөхгүй. Өөрийн мөрөөдлийн нүдэнд буух эсвэл давахдаа ${fmtB(c.fx.price)} бэлнээр төлж чадвал ялна.</p>
  ${prev7(P)}
  <div class="cta"><button class="btn" data-a="dream7Back">Өөр мөрөөдөл</button><button class="btn go" data-a="dream7Ok">Шарк тал руу гарах</button></div>`;
}
ACT.dream7Back = () => { FS = { deck: 'MO', q: '' }; openSheet(fPick); };
ACT.dream7Ok = () => {
  const P = me(); if (P.level !== 1) return closeSheet();
  snap('Шарк тал'); enter7(G, P, FS.card);
  if (G.mode === 'online') NET.emit({ t: 'level', txt: `Шарк тал руу гарлаа · ${CARD[FS.card].title}` });
  FS = {}; UI.tab = 'board'; save(); closeSheet(); render(); buzz([60, 40, 120]);
  setTimeout(() => openSheet(fShark8, { modal: true }), 120);
};
/* «Та Шарк боллоо!» (user 2026-11-09: «LVL2-т орох үед сүртэй угтдаг») */
function fShark8() {
  const P = me(), L = P.l7, c = CARD[L.dream], cap = L.b * CAP7;
  return `<div class="sk8">${confetti()}<div class="sk8-glow"></div>
    <img class="sk8-m a-free" src="${mascot(P.profId)}" alt="">
    <p class="sk8-k">Түвшин 1 дууслаа</p><h2>Та Шарк боллоо!</h2>
    <p class="sk8-s">Санхүүгийн эрх чөлөөнд хүрлээ. Одоо сая биш, тэрбумаар тоглоно. Шарк талд 2 шоо зэрэг хаяж явна.</p>
    <div class="sk8-kv"><div><small>Бэлэн мөнгө</small><b>${fmtB(P.cash)}</b></div><div><small>Гарааны капитал</small><b>+${fmtB(cap)}</b></div><div><small>Идэвхгүй орлого</small><b>${fmtB(L.b * 12)} / жил</b></div></div>
    <div class="sk8-w"><small>Ялах 2 зам</small><p><b>1.</b> Мөрөөдлөө биелүүлэх — ${esc(c.title)} · ${fmtB(dp7(P))}</p><p><b>2.</b> Төслүүдийн ашгийг идэвхгүй орлогын 3 дахинд хүргэх</p></div>
    <button class="sk8-go" data-a="close">Шарк тал руу орох</button></div>`;
}
fShark8._zp = 1;
{ const sc0 = startCard;
  startCard = function (id, extra) {
    const c = CARD[id], P = me();
    if (c && P && P.v3 && c.deck === 'MO' && P.level === 1) { FS = { card: id, deck: 'MO' }; return openSheet(fDream7); }
    if (c && c.deck === 'MO') { FS = Object.assign({ card: id, deck: 'MO' }, extra || {}); return openSheet(fDreamPick); }
    return sc0(id, extra);
  }; }

/* ---------- money, wins, shortfall ---------- */
{ const f0 = fin;
  fin = function (P, G2) {
    if (!is7(P)) return f0(P, G2);
    const p = L7.P(P), b = P.l7.b, i = b + p;
    return { salary: 0, passive: i, stablePassive: i, income: i, expenses: 0, living: 0, cf: i, delta: i * 12, progress: Math.min(1, Math.max(0, W2CASH ? P.cash / GOAL7 : L7.w2(P))),
      free: true, conds: [true], gap: 0, pas: [], lines: [], loans: [], livLoans: [], loanPay: 0, tax: 0, kids: 0, plans: [], paydayPassive: 0 };
  }; }
{ const nw0 = netWorth; netWorth = P => is7(P) ? P.cash + P.l7.proj.reduce((s, q) => s + q.paid, 0) : nw0(P); }
/* each player finishes on their own; the game goes on for the others (user 2026-11-09: «бүх тоглогч өөрсдийгөө дуусгана») */
function win7(P, why) {
  if (P.won) return;
  const rank = G.players.filter(q => q.won).length + 1;
  P.won = true; P.fin = { rank, why, at: Date.now() }; UI.winHide = 0; UI.cardTurn = 1;   // closing the finish screen hands the turn on
  log(G, P, `${rank}-р байрт дууслаа · ${why}`, 0, null, 'win');
  if (G.mode === 'online') NET.emit({ t: 'win', txt: `${rank}-р байрт дууслаа · ${why}`, rank });
  allDone8();
  save(); setTimeout(() => openSheet(fWin), 60);
}
function allDone8() { const live = G.players.filter(q => !q.out); if (!G.over && live.length && live.every(q => q.won)) { const w = live.slice().sort((a, b) => (a.fin ? a.fin.rank : 99) - (b.fin ? b.fin.rank : 99))[0]; G.over = { winner: w.id, why: 'Бүх тоглогч дууслаа' }; } }
function check7(P) {
  if (!is7(P)) return false;
  if (W2CASH ? P.cash >= GOAL7 : (P.l7.b > 0 && L7.P(P) >= W2X * P.l7.b)) { win7(P, W2CASH ? `${fmtB(GOAL7)} хуримтлууллаа` : 'Орлогоо 4 дахин өсгөлөө'); return true; }
  return false;
}
function done7(P) {
  FS = {}; save(); closeSheet(); render();
  if (check7(P)) return;
  if (P.cash < 0 && P.l7.proj.length) setTimeout(() => openSheet(fSell7), 80);
}
const sellVal7 = q => Math.round(q.paid * .5);
function fSell7() {
  const P = me(), L = P.l7;
  return `${head('Мөнгө дутлаа')}
  <div class="l7-big neg"><small>Бэлэн мөнгө</small><b>${fmtB(P.cash)}</b></div>
  <p class="mute" style="font-size:13px">Шарк талд зээл байхгүй. Нэг төслөө банкинд оруулсан үнийн 50%-иар зарж нөхнө — төсөл дахин эзэнгүй болно.${L.proj.length ? '' : ' Зарах төсөл алга — дараагийн Жилийн орлогоор нөхөгдөнө.'}</p>
  <div class="l7-list">${L.proj.map(q => `<div class="l7-pj"><span><b>${esc(q.title)}</b><small>${L7.pctTxt(q)} · оруулсан ${fmtB(q.paid)}${L7.live(q) && q.net ? ' · жилийн ' + fmtB(12 * q.net, { sign: true }) : ''}</small></span><button class="minibtn go" data-a="sell7Go" data-u="${q.uid}">Зарах +${fmtB(sellVal7(q))}</button></div>`).join('')}</div>
  <div class="cta"><button class="btn go" data-a="close">${P.cash < 0 && L.proj.length ? 'Дараа' : 'Болсон'}</button></div>`;
}
ACT.sell7 = () => openSheet(fSell7);
ACT.sell7Go = d => {
  const P = me(), L = P.l7, q = L.proj.find(x => x.uid === d.u); if (!q) return;
  snap('Төсөл зарлаа'); const v = sellVal7(q);
  L.proj = L.proj.filter(x => x !== q); P.cash += v;
  log(G, P, `${q.title} төслөө 50%-иар зарлаа`, v, q.id, 'sell');
  save(); render(); if (P.cash < 0 && L.proj.length) drawSheet(); else closeSheet();
};

/* ---------- squares (studio 2026-11-09 «Шарк тал»: 40 squares — 4 Жилийн орлого, 14 Шарк боломж, 4 алдагдал, 3 мөрий, 15 мөрөөдөл) ---------- */
const SQ7 = t => OF.board.sq2.filter(s => s.type === t);
ACT.sq7 = d => {
  const P = me(); if (!is7(P) || !canAct(P)) return;
  const t = d.t;
  FS = { rolls: {}, q: '', dsel: t === 'DREAM' && d.own ? P.l7.dream : '' };
  openSheet({ PAY2: fPay7, SHARK: fShark7, LOSS: fLoss7, GAMBLE: fGamble7, DREAM: fDreamSq7 }[t]);
};
const card7 = (c, crumb) => `${head(DECKS[c.deck].n, `<span>${esc(crumb)}</span>›<b>№ ${esc(c.no || c.id.split('-')[1])}</b>`)}${cardHTML(c)}`;
const B9 = v => Math.round((v || 0) * T9);   // studio squares are written in тэрбум

/* PAY2 «Жилийн орлого»: (b + P) × 12 */
function fPay7() {
  const P = me(), L = P.l7, p = L7.P(P), y = (L.b + p) * 12;
  return `${head('Жилийн орлого')}
  <div class="l7-big pos"><small>Энэ жил авах</small><b>+${fmtB(y)}</b></div>
  <div class="box"><div class="ln"><span>Идэвхгүй орлого<span class="sub">${fmtB(L.b)} × 12</span></span><b>${fmtB(L.b * 12)}</b></div>
  <div class="ln"><span>Төслүүдийн ашиг<span class="sub">${fmtB(p)} × 12</span></span><b class="${p < 0 ? 'neg' : ''}">${fmtB(p * 12, { sign: p < 0 })}</b></div></div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="pay7Ok">Авах +${fmtB(y)}</button></div>`;
}
ACT.pay7Ok = () => {
  const P = me(), L = P.l7, y = L7.inc(P) * 12;
  snap('Жилийн орлого'); P.cash += y; L.yr = (L.yr || 0) + 1;
  log(G, P, 'Жилийн орлого', y, null, 'pay');
  buzz(30); toast('Жилийн орлого +' + fmtB(y)); done7(P);
};

/* SHARK «Шарк боломж»: the project printed on the square, bought whole and in cash; one owner per project */
const shOwners = id => (G.players || []).filter(q => q.l7 && (q.l7.proj || []).some(x => x.id === id));
/* the first buyer is paid when someone else buys the same project (user 2026-11-09: «2 дахь тоглогч нь 50 тэрбум эхний авсан тоглогчдоо өгөөд тэр төслийг нэмж худалдаж авдаг»).
   App reading: the next buyer pays the project price to the bank AND 50 тэрбум₮ to the first buyer; both then own the project. */
const SH_FEE = 50 * T9;
const shOwner = id => { const os = shOwners(id); return os.find(q => q.l7.proj.some(x => x.id === id && x.first)) || os[0] || null; };
function fShark7() {
  const P = me(), list = SQ7('SHARK'), q = String(FS.q || ''), s = q.length === 2 ? list.find(x => x.no === q) : null;
  if (!s) {
    const key = k => `<button class="np-k" data-a="sh7Key" data-k="${k}">${k}</button>`;
    return `${head('Шарк боломж')}
    <div class="np"><p class="np-h">Нүдэн дээрх төслийн дугаарыг оруулна уу</p>
      <div class="np-d ${q ? '' : 'empty'}"><span>№</span><b>${q || '––'}</b></div><small class="np-r">01 – ${String(list.length).padStart(2, '0')}</small>
      <div class="np-g">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}<button class="np-k np-del" data-a="sh7Key" data-k="del" aria-label="Устгах">⌫</button>${key(0)}<button class="np-k np-go" data-a="sh7Go" ${q ? '' : 'disabled'}>Харах</button></div></div>`;
  }
  /* the first buyer may buy the same project again for its price; anyone else pays 50 тэрбум₮ «зөвлөгөө» to the first buyer on top (user 2026-11-09) */
  const pr = s.proj, net = B9(pr.profit), own = shOwner(s.id), first = own && own.id === P.id, fee = own && !first ? SH_FEE : 0, nMine = P.l7.proj.filter(x => x.id === s.id).length;
  const cost = B9(pr.invest) + fee, p0 = L7.P(P), can = P.cash >= cost, mine = false;
  const w2 = P.l7.b > 0 ? Math.min(1, (p0 + net) / (W2X * P.l7.b)) : 0;
  return `${head('Шарк боломж', `<span>Шарк боломж</span>›<b>№ ${s.no}</b>`)}
  <div class="sh7"><span class="sh7-i">${ic2('r:globe-hemisphere-east')}</span><b>${esc(s.name)}</b>
    <div class="sh7-kv"><div><small>Хөрөнгө оруулалт</small><b>${fmtB(B9(pr.invest))}</b></div><div><small>Жилийн ашиг</small><b class="pos">+${fmtB(net * 12)}</b></div></div></div>
  ${mine ? '' : `${nMine ? `<div class="alert">${ic('info')}<span><b>Танд энэ төсөл ${nMine} байна</b>Дахин авбал жилийн ашиг нь дахин нэмэгдэнэ.</span></div>` : ''}
      ${fee ? `<div class="alert">${ic('info')}<span><b>Энэ төслийг ${esc(own.name)} анх авсан</b>Түүнээс зөвлөгөө авсан гэж ${fmtB(fee)}-ийг ${esc(own.name)} авна. Үүний дараа та ч энэ төслийг авна.</span></div>` : ''}
      <div class="box">${fee ? `<div class="ln"><span>Төслийн үнэ<span class="sub">банкинд</span></span><b>${fmtB(B9(pr.invest))}</b></div><div class="ln"><span>Зөвлөгөөний төлбөр<span class="sub">${esc(own.name)} авна</span></span><b>${fmtB(fee)}</b></div>` : ''}<div class="ln"><span>Бэлэн мөнгө</span><b class="${P.cash < cost ? 'neg' : ''}">${fmtB(P.cash)} → ${fmtB(P.cash - cost)}</b></div>
      <div class="ln"><span>Төслүүдийн жилийн ашиг</span><b class="pos">${fmtB(p0 * 12)} → ${fmtB((p0 + net) * 12)}</b></div>
      <div class="ln"><span>Орлогоо 4 дахин өсгөх<span class="sub">төслийн ашиг ÷ 3 × идэвхгүй орлого</span></span><b>${Math.floor(w2 * 100)}%</b></div></div>
      ${P.cash < cost ? `<p class="mute" style="font-size:12px">Бүтнээр нь бэлнээр авна — Шарк талд зээл байхгүй.</p>` : ''}`}
  <div class="cta"><button class="btn" data-a="sh7No">${mine ? 'Хаах' : 'Авахгүй'}</button>${mine ? '' : `<button class="btn go" data-a="sh7Ok" data-id="${s.id}" ${can ? '' : 'disabled'}>${P.cash < cost ? 'Мөнгө хүрэхгүй' : 'Авах −' + fmtB(cost)}</button>`}</div>`;
}
ACT.sh7Key = d => { let q = String(FS.q || ''); if (d.k === 'del') q = q.slice(0, -1); else if (q.length < 2) q += d.k; FS.q = q;
  if (q.length === 2) { if (SQ7('SHARK').some(x => x.no === q)) UI.cardTurn = 1; else { toast(`№ ${q} олдсонгүй`); FS.q = ''; } } drawSheet(); };
ACT.sh7Go = () => { const q = String(FS.q || '').padStart(2, '0'); if (!FS.q) return;   // one digit is enough: 4 → № 04 (user 2026-11-09)
  if (SQ7('SHARK').some(x => x.no === q)) { FS.q = q; UI.cardTurn = 1; } else { toast(`№ ${q} олдсонгүй`); FS.q = ''; } drawSheet(); };
ACT.sh7No = () => { FS = {}; closeSheet(); render(); };
ACT.sh7Ok = d => {
  const P = me(), s = SQ7('SHARK').find(x => x.id === d.id); if (!s) return;
  const O0 = shOwner(s.id), O = O0 && O0.id !== P.id ? O0 : null, fee = O ? SH_FEE : 0, price = B9(s.proj.invest), cost = price + fee; if (P.cash < cost) return toast('Бэлэн мөнгө хүрэхгүй');
  snap(s.name);
  P.l7.proj.push({ uid: uid('pj'), id: s.id, no: s.no, title: s.name, cat: 'Шарк', pct: 100, paid: price, net: B9(s.proj.profit), first: !O0 });
  P.cash -= cost; log(G, P, `Шарк боломж № ${s.no} · ${s.name}${O ? ` · ${O.name}-д зөвлөгөө ${fmtB(fee)}` : ''}`, -cost, null, 'buy');
  if (O) { if (G.mode === 'online') NET.emit({ t: 'xfer', to: O.id, amt: fee, txt: `${s.name} — зөвлөгөөний төлбөр` });
    else { O.cash += fee; log(G, O, `${s.name} · ${P.name} зөвлөгөө авч төслийг авлаа, танд +${fmtB(fee)}`, fee, null, 'gain'); } }
  if (G.mode === 'online') NET.emit({ t: 'buy', txt: `Шарк боломж № ${s.no} · ${s.name} авлаа` });
  buzz(20); toast(s.name); done7(P);
};

/* LOSS (4 squares), each with its own share of cash (user 2026-11-09: 20, 40, 50, 50%); nothing when cash is 0 or below */
const lossPct = x => (x.fx && x.fx.val) || 0.5;
function fLoss7() {
  const P = me(), list = SQ7('LOSS'), s = list.find(x => x.id === FS.lid);
  if (!s) return `${head('Алдагдал')}<p class="mute" style="font-size:13px">Аль нүдэнд буусан бэ?</p>
    <div class="l7-list">${list.map(x => { const a = P.cash > 0 ? Math.floor(P.cash * lossPct(x)) : 0;
      return `<button class="l7-pj pick" data-a="loss7Sel" data-id="${x.id}"><span><b>${esc(x.name)}</b><small>Бэлэн мөнгөний ${Math.round(lossPct(x) * 100)}%</small></span><em class="neg">−${fmtB(a)}</em></button>`; }).join('')}</div>
    <div class="cta"><button class="btn go" data-a="close">Болих</button></div>`;
  const pc = lossPct(s), amt = P.cash > 0 ? Math.floor(P.cash * pc) : 0;
  return `${head('Алдагдал', `<span>Алдагдал</span>›<b>${esc(s.name)}</b>`)}
  <div class="l7-big neg"><small>Бэлэн мөнгөнийхөө ${Math.round(pc * 100)}%</small><b>−${fmtB(amt)}</b></div>
  ${amt ? '' : `<p class="mute" style="font-size:13px">Бэлэн мөнгө 0 эсвэл хасах тул юу ч болохгүй.</p>`}
  <p class="mute" style="font-size:12px">Төслүүд хэвээр үлдэнэ.</p>
  <div class="cta"><button class="btn" data-a="loss7Sel" data-id="">Буцах</button><button class="btn go" data-a="loss7Ok">${amt ? 'Төлөх −' + fmtB(amt) : 'Ойлголоо'}</button></div>`;
}
ACT.loss7Sel = d => { FS.lid = d.id || ''; drawSheet(); };
ACT.loss7Ok = () => { const P = me(), s = SQ7('LOSS').find(x => x.id === FS.lid); if (!s) return;
  const pc = lossPct(s), amt = P.cash > 0 ? Math.floor(P.cash * pc) : 0;
  if (amt) { snap(s.name); P.cash -= amt; log(G, P, `${s.name} · бэлэн мөнгөний ${Math.round(pc * 100)}%`, -amt, null, 'risk'); } done7(P); };

/* the gamble square drawn like on the board (user 2026-11-09: «самбар дээрхтэй адил дүүргэлттэй») */
const gsq = (x, win, big) => `<${big ? 'div' : 'button'} class="gsq ${big ? 'big' : ''}" ${big ? '' : `data-a="gm7Sel" data-id="${x.id}"`} style="--c:${x.color || '#C2502B'}">
  <span class="gi">${ic2('r:dice-five')}</span><b>${esc(x.name)}</b>
  <span class="gl"><em>${fmtB(B9(x.fx.stake))}</em> тавиад</span><span class="gl">шоо <em>${win(x)}</em> буувал</span><span class="gl"><em>${fmtB(B9(x.fx.payout))}</em> авна</span></${big ? 'div' : 'button'}>`;
/* GAMBLE «Мөрий» (3 squares): stake the square's amount, roll; the payout comes back when the die hits (the stake is in it) */
function fGamble7() {
  const P = me(), list = SQ7('GAMBLE'), s = list.find(x => x.id === FS.gid), r = FS.r;
  const win = x => x.fx.win.length > 1 ? `${x.fx.win[0]}–${x.fx.win[x.fx.win.length - 1]}` : String(x.fx.win[0]);
  if (!s) return `${head('Мөрий')}<p class="mute" style="font-size:13px">Аль нүдэнд буусан бэ? Хүсвэл мөнгөө тавиад 1 шоо хаяна.</p>
    <div class="gsq-g">${list.map(x => gsq(x, win)).join('')}</div>
    <div class="cta"><button class="btn go" data-a="close">Тавихгүй</button></div>`;
  const st = B9(s.fx.stake), po = B9(s.fx.payout), hit = r && s.fx.win.includes(r), res = r ? (hit ? po - st : -st) : 0;
  return `${head('Мөрий', `<span>Мөрий</span>›<b>${esc(s.name)}</b>`)}
  <div class="gsq-one">${gsq(s, win, true)}</div>
  <div class="box"><div class="ln"><span>Тавих</span><b class="neg">−${fmtB(st)}</b></div><div class="ln"><span>Шоо ${win(s)} буувал авах</span><b class="pos">+${fmtB(po)}</b></div><div class="ln"><span>Бэлэн мөнгө</span><b>${fmtB(P.cash)}</b></div></div>
  ${P.cash < st ? `<p class="mute" style="font-size:13px">Бэлэн мөнгө хүрэхгүй — тавих боломжгүй.</p>`
    : !r ? `<p class="zn-dq">Шоо хэд буув?</p>${dicePad('gm7Die')}`
    : `<div class="dice"><div class="die">${r}</div></div><div class="l7-big ${hit ? 'pos' : 'neg'}"><small>${hit ? 'Хожлоо' : 'Алдлаа'}</small><b>${fmtB(res, { sign: true })}</b></div><p class="mute" style="font-size:12px">Хожил нэг удаагийн орлого — төслийн ашигт нэмэгдэхгүй.</p>`}
  <div class="cta">${r ? '<button class="btn" data-a="gm7Re">Шоо засах</button>' : '<button class="btn" data-a="gm7Sel" data-id="">Буцах</button>'}<button class="btn go" data-a="gm7Ok" ${r ? '' : 'disabled'}>${r ? fmtB(res, { sign: true }) : 'Шоогоо оруул'}</button></div>`;
}
ACT.gm7Sel = d => { FS.gid = d.id || ''; FS.r = 0; drawSheet(); };
ACT.gm7Die = d => { FS.r = +d.n; drawSheet(); };
ACT.gm7Re = () => { FS.r = 0; drawSheet(); };
ACT.gm7Ok = () => {
  const P = me(), s = SQ7('GAMBLE').find(x => x.id === FS.gid), r = FS.r; if (!s || !r) return;
  const st = B9(s.fx.stake), po = B9(s.fx.payout); if (P.cash < st) return;
  const res = s.fx.win.includes(r) ? po - st : -st;
  snap(s.name); P.cash += res; log(G, P, `${s.name} · ${fmtB(st)} тавив · шоо ${r}`, res, null, res < 0 ? 'risk' : 'gain'); done7(P);
};

/* DREAM «Мөрөөдөл» (studio v170): 15 dream squares — your own: fulfil and win; another one: buy its single 20% share */
function fDreamSq7() {
  const P = me(), L = P.l7, sel = FS.dsel;
  if (!sel) {
    const ids = OF.cards.filter(c => c.deck === 'MO').map(c => c.id).sort((x, y) => (x === L.dream ? -1 : y === L.dream ? 1 : 0));
    const row = id => { const c = CARD[id], sh = dShare(id), mine = id === L.dream, owner = G.players.filter(q => q.l7 && q.l7.dream === id && q.id !== P.id).map(q => q.name).join(', ');
      const st = mine ? (P.cash >= dPrice(id) ? 'Биелүүлж болно' : 'Таны мөрөөдөл') : sh ? (sh.pid === P.id ? 'Таны хувь' : esc(sh.name) + ' хувьтай') : 'Хувь авах · ' + fmtB(dBase(id) * .2);
      return `<button class="l7-pj pick ${mine ? 'own' : ''}" data-a="dSel7" data-id="${id}"><span><b>№${esc(c.no || id.split('-')[1])} · ${esc(c.title)}</b><small>${fmtB(dPrice(id))}${sh ? ' (+40%)' : ''}${owner ? ' · эзэн: ' + esc(owner) : ''}</small></span><em class="${mine ? 'pos' : ''}">${st}</em></button>`; };
    return `${head('Мөрөөдөл')}<p class="mute" style="font-size:13px">Аль мөрөөдлийн нүдэнд буусан бэ?</p><div class="l7-list">${ids.map(row).join('')}</div>`;
  }
  const c = CARD[sel], sh = dShare(sel), back = '<button class="btn" data-a="dSel7" data-id="">Буцах</button>';
  if (sel === L.dream) {
    const ok = P.cash >= dp7(P);
    return `${card7(c, 'Мөрөөдөл')}
    <div class="box"><div class="ln"><span>Бэлэн мөнгө</span><b>${fmtB(P.cash)}</b></div><div class="ln"><span>Мөрөөдлийн үнэ${sh ? '<span class="sub">' + esc(sh.name) + ' хувь авсан тул +40%</span>' : ''}</span><b>${fmtB(dp7(P))}</b></div>${ok ? '' : `<div class="ln"><span>Дутуу</span><b class="neg">${fmtB(dp7(P) - P.cash)}</b></div>`}</div>
    ${ok ? `<p class="l7-q">Мөрөөдлөө биелүүлэх үү?</p>` : `<p class="mute" style="font-size:13px">Мөрөөдлийн үнийг бүтнээр нь бэлнээр төлөхөд ялна.</p>`}
    <div class="cta">${back}${ok ? `<button class="btn go" data-a="dream7Win">Биелүүлэх −${fmtB(dp7(P))}</button>` : ''}</div>`;
  }
  const cost = Math.round(dBase(sel) * .2), gain = Math.round(dBase(sel) * .4), can = !sh && P.cash >= cost;
  return `${card7(c, 'Мөрөөдөл')}
  <div class="box"><div class="ln"><span>Хувийн төлбөр<span class="sub">үнийн 20% · банкинд</span></span><b class="neg">−${fmtB(cost)}</b></div>
  <div class="ln"><span>Эзэн нь биелүүлбэл танд</span><b class="pos">+${fmtB(gain)}</b></div><div class="ln"><span>Мөрөөдлийн үнэ</span><b>${fmtB(dBase(sel))} → ${fmtB(Math.round(dBase(sel) * 1.4))}</b></div></div>
  <p class="mute" style="font-size:13px">${sh ? `Энэ мөрөөдлийн хувийг ${esc(sh.name)} авсан. Нэг мөрөөдөлд нэг л хувь.` : 'Хэн ч биелүүлэхгүй бол хувийн мөнгөө алдана. Нэг мөрөөдөлд нэг л хувь.'}</p>
  <div class="cta">${back}<button class="btn go" data-a="dShareOk" ${can ? '' : 'disabled'}>${sh ? 'Хувь зарагдсан' : P.cash < cost ? 'Мөнгө хүрэхгүй' : 'Хувь авах −' + fmtB(cost)}</button></div>`;
}
ACT.dSel7 = d => { FS.dsel = d.id || ''; drawSheet(); };
ACT.dShareOk = () => {
  const P = me(), id = FS.dsel; if (!id || id === P.l7.dream || dShare(id)) return;
  const cost = Math.round(dBase(id) * .2); if (P.cash < cost) return toast('Бэлэн мөнгө хүрэхгүй');
  snap('Мөрөөдлийн хувь'); P.cash -= cost; P.l7.sh = Object.assign({}, P.l7.sh, { [id]: cost });
  log(G, P, `Мөрөөдлийн хувь: ${CARD[id].title}`, -cost, id, 'buy');
  if (G.mode === 'online') NET.emit({ t: 'buy', card: id, txt: `${CARD[id].title} — мөрөөдлийн хувь авлаа` });
  toast('Хувь авлаа'); done7(P);
};
ACT.dream7Win = () => {
  const P = me(), L = P.l7, id = L.dream, price = dp7(P); if (P.cash < price) return;
  snap('Мөрөөдөл'); P.cash -= price; log(G, P, `Мөрөөдөл: ${CARD[id].title}`, -price, id, 'buy');
  const sh = dShare(id), H = sh && G.players.find(q => q.id === sh.pid);
  if (H && H.id !== P.id) { const g = Math.round(dBase(id) * .4);
    if (G.mode === 'online') NET.emit({ t: 'xfer', to: H.id, amt: g, txt: `${CARD[id].title} — мөрөөдлийн хувийн +40%` });
    else { H.cash += g; log(G, H, `${P.name} мөрөөдлөө биелүүлж, хувийн +40% орлоо`, g, id, 'gain'); } }
  FS = {}; closeSheet(); render(); win7(P, 'Мөрөөдлөө биелүүллээ: ' + CARD[id].title);
};


/* ---------- Их тал home ---------- */
function gauge7(pr, title, sub, a) {
  pr = Math.max(0, Math.min(1, pr || 0)); const p = Math.floor(pr * 100), an = Math.PI * pr, x = 50 - 40 * Math.cos(an), y = 50 - 40 * Math.sin(an);
  return `<button class="l7-g" data-a="${a}"><svg viewBox="0 0 100 56" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" class="tr"/>${pr > 0 ? `<path d="M10 50 A40 40 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" class="fg"/>` : ''}<text x="50" y="49" text-anchor="middle">${p}%</text></svg><b>${title}</b><small>${sub}</small></button>`;
}
function vHome7(P) {   // concept A «Тэрбумтан» (user 2026-11-05: «эхнийх нь зүгээр»): dark navy, gold money
  const L = P.l7, p = L7.P(P), inc = L.b + p, act = canAct(P) && !P.out, hide = UI.hideCash, _hs = (!!P.hideCash !== !!hide && canAct(P)) ? (P.hideCash = !!hide, setTimeout(save, 0)) : 0, m = mascot(P.profId), dc = CARD[L.dream];
  const pd = Math.max(0, Math.min(1, P.cash / dp7(P))), pg = Math.max(0, Math.min(1, W2CASH ? P.cash / GOAL7 : L7.w2(P)));
  const al = P.cash < 0 ? `<button class="x7-al" data-a="sell7"><span class="ai">${ic2('d:warning-circle')}</span><span class="tx"><b>Бэлэн мөнгө ${fmtB(P.cash)}</b><small>${L.proj.length ? 'Төслөө 50%-иар зарж нөхнө' : 'Дараагийн Жилийн орлогоор нөхөгдөнө'}</small></span>${ic2('b:caret-right')}</button>` : '';
  const T = (t, icn, n, bg, fg) => `<button class="x7-t" data-a="sq7" data-t="${t}" ${act ? '' : 'disabled'}><span class="ic" style="background:${bg};color:${fg}">${ic2(icn)}</span><b>${n}</b></button>`;
  const nP = L.proj.length;
  const pay = !act ? `<div class="x7-wait"><span class="av" style="background-image:url(${m})"></span><b>${esc(P.name)}-ийн самбар</b></div>`
    : `<button class="x7-pay" data-a="sq7" data-t="PAY2"><span class="ic">${ic2('r:coins')}</span>Жилийн орлого<span class="go">${ic2('r:arrow-right')}</span></button>`;
  return `<div class="x7">
  <div class="x7-top"><span class="fp">${(OF.flatp && OF.flatp[P.profId]) || ''}</span><div class="who"><small>${ic2('r:crown')}${L.yr ? 'Шарк тал · ' + (L.yr + 1) + ' дэх жил' : 'Түвшин 2 · Шарк тал'}</small><b>${esc(PROF[P.profId].title)}</b></div>
    <button class="x7-ib" data-a="undo" aria-label="Буцаах" ${UI.undo.length ? '' : 'disabled'}>${ic2('r:arrow-u-up-left')}</button>
    <button class="x7-ib" data-a="menu" aria-label="Цэс">${ic2('r:list')}</button></div>
  <div class="x7-hero"><span class="rg"></span><img class="masc a-idle" src="${m}" alt="" data-a="hop">${(P.name || '').trim() && P.name.trim() !== PROF[P.profId].title ? `<span class="nm">${esc(P.name)}</span>` : ''}
    <button class="lab" data-a="hideCash" aria-label="Дүнг нуух">Бэлэн мөнгө ${ic2(hide ? 'r:eye-slash' : 'r:eye')}</button>
    <div class="amt full ${P.cash < 0 && !hide ? 'neg' : ''}" style="--n:${(hide ? '••••••' : fmt(P.cash)).length}">${hide ? '••••••' : fmt(P.cash)}</div>
    <button class="cf ${inc < 0 ? 'neg' : ''}" data-a="inc7">${ic2(inc < 0 ? 'b:trend-down' : 'b:trend-up')}${fmtB(inc * 12, { sign: true })} / жил</button></div>
  ${al}
  <button class="x7-w" data-a="${pd >= 1 ? 'sq7" data-t="DREAM" data-own="1' : 'dream7Info'}"><span class="l"><b>Мөрөөдөл · ${esc(dc.title)}</b><em>${Math.floor(pd * 100)}%</em></span><small>${fmtBn(Math.max(0, P.cash))} / ${fmtB(dp7(P))}${pd >= 1 ? ' · Мөрөөдөл нүдэнд очвол ялна' : ''}</small><span class="bar"><i style="width:${(pd * 100).toFixed(1)}%"></i></span></button>
  <button class="x7-w" data-a="goal7"><span class="l"><b>${W2CASH ? 'Мөнгөн зорилго' : 'Орлогоо 4 дахин өсгөх'}</b><em>${Math.floor(pg * 100)}%</em></span><small>${W2CASH ? `${fmtB(Math.max(0, P.cash)).replace('₮', '')} / ${fmtB(GOAL7)}` : `Төслийн ашиг ${fmtB(p * 12).replace('₮', '')} / ${fmtB(W2X * L.b * 12)} жилд`}</small><span class="bar"><i style="width:${(pg * 100).toFixed(1)}%"></i></span></button>
  <div class="x7-sec">Нүдэн дээр буувал</div>
  <div class="x7-tiles">${T('SHARK', 'r:globe-hemisphere-east', 'Шарк боломж', '#173F2E', '#6FD39B')}${T('DREAM', 'r:star', 'Мөрөөдөл', '#2E2257', '#C6A6FF')}${T('LOSS', 'r:lightning', 'Алдагдал', '#4A1D1A', '#FF8A73')}${T('GAMBLE', 'r:dice-five', 'Мөрий', '#3B3218', '#F7C766')}
    <button class="x7-t pj" data-a="tab" data-t="assets"><b>${nP ? nP + ' төсөл' : 'Төсөл алга'}</b><small>${nP ? fmtB(p * 12, { sign: true }) + ' / жил' : 'Шарк боломжоос авна'}</small></button></div>
  ${pay}
  </div>`;
}
ACT.dream7Info = () => openSheet(() => { const P = me(), L = P.l7, c = CARD[L.dream];
  return `${head('Ялалт 1 · Мөрөөдөл')}${cardHTML(c)}<div class="box"><div class="ln"><span>Бэлэн мөнгө</span><b>${fmtB(P.cash)}</b></div><div class="ln"><span>Мөрөөдлийн үнэ</span><b>${fmtB(dp7(P))}</b></div></div><p class="mute" style="font-size:13px">Мөрөөдөл нүдэнд буух эсвэл давах үед бэлэн мөнгө үнээс их бол биелүүлж ялна.</p><div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`; });
ACT.inc7 = () => openSheet(() => { const P = me(), L = P.l7, p = L7.P(P);
  return `${head('Жилийн орлого')}<div class="box"><div class="ln"><span>Идэвхгүй орлого<span class="sub">Түвшин 1-ээс · өөрчлөгдөхгүй</span></span><b>${fmtB(L.b * 12)}</b></div><div class="ln"><span>Төслүүдийн жилийн ашиг</span><b class="${p < 0 ? 'neg' : 'pos'}">${fmtB(p * 12, { sign: true })}</b></div><div class="ln tot"><span>Нийт жилийн орлого</span><b>${fmtB((L.b + p) * 12)}</b></div></div>
  <p class="mute" style="font-size:13px">Жилийн орлого нүдэнд буух эсвэл давах бүрт ${fmtB((L.b + p) * 12)} орно.</p><div class="cta"><button class="btn" data-a="close">Хаах</button><button class="btn go" data-a="tab" data-t="assets">Төслүүд</button></div>`; });

/* projects page (bottom bar «Төслүүд») */
function vProj7() {
  const P = me(), L = P.l7, p = L7.P(P);
  const row = q => { const tag = q.sp === 'startup' ? `Стартап · шоо ${L7.win(q.win)} → +${fmtB(q.pay)}` : q.sp === 'wait' && q.wait > 0 ? `Ашиг ${q.wait} жилийн дараа эхэлнэ` : '';
    return `<div class="l7-pj big"><span><b>${q.no ? '№ ' + esc(q.no) + ' · ' : ''}${esc(q.title)}</b><small>${q.cat === 'Шарк' ? 'Бүтэн' : esc(q.cat) + ' · ' + L7.pctTxt(q)} · оруулсан ${fmtB(q.paid)}</small>${tag ? `<small class="tg">${tag}</small>` : ''}</span><em class="${q.sp === 'startup' || (q.sp === 'wait' && q.wait > 0) ? '' : q.net < 0 ? 'neg' : 'pos'}">${q.sp === 'startup' ? '—' : fmtB(q.net * 12, { sign: true })}<small>/ жил</small></em></div>`; };
  const nL1 = P.assets.length + (P.savings || []).length;
  return `<div class="as2 page l7p"><div class="ptitle"><h2>Төслүүд</h2></div>
  <div class="l7-sum"><div><small>Идэвхгүй орлого</small><b>${fmtB(L.b * 12)}</b></div><div><small>Төслийн ашиг</small><b class="${p < 0 ? 'neg' : 'pos'}">${fmtB(p * 12, { sign: true })}</b></div><div><small>Жилийн нийт</small><b>${fmtB((L.b + p) * 12)}</b></div></div>
  ${L.proj.length ? `<div class="l7-list">${L.proj.map(row).join('')}</div>` : `<div class="box"><p class="empty">Төсөл алга. «Шарк боломж» нүдэнд буухад авна.</p></div>`}
  ${P.cash < 0 && L.proj.length ? `<button class="btn go" style="width:100%;margin-top:12px" data-a="sell7">Төсөл зарж мөнгө нөхөх</button>` : ''}
  ${(() => { const mine = Object.keys(Object.assign({}, Object.fromEntries(Object.entries(G.l7d || {}).filter(([, v]) => v.pid === P.id)), L.sh || {})).map(id => [id, dShare(id)]).filter(([, v]) => v); return mine.length ? `<div class="ptitle" style="margin-top:18px"><h2 style="font-size:18px">Мөрөөдлийн хувь</h2></div><div class="l7-list">${mine.map(([id, v]) => `<div class="l7-pj big"><span><b>${esc(CARD[id].title)}</b><small>Төлсөн ${fmtB(v.paid)} · эзэн нь биелүүлбэл</small></span><em class="pos">+${fmtB(dBase(id) * .4)}</em></div>`).join('')}</div>` : ''; })()}
  ${nL1 ? `<p class="mute l7-lock">${ic2('r:shield-check')} Түвшин 1-ийн ${nL1} хөрөнгө, хадгаламж түгжигдсэн — зарахгүй, татахгүй. Идэвхгүй орлого нь хэвээр орно.</p>` : ''}
  </div>`;
}

/* ---------- wiring into the shell ---------- */
function mig7(P) {   // a v3 save that entered the old Level 2: start Их тал from its Level 1 passive income
  if (!P || !P.v3 || P.level !== 2 || P.l7) return;
  const lv = P.level; P.level = 1; const b = Math.round(fin1(P, G).passive * 1000); P.level = lv;
  const d = P.dream && CARD[P.dream] && CARD[P.dream].deck === 'MO' ? P.dream : (OF.cards.find(c => c.deck === 'MO') || {}).id;
  P.l7 = { b, dp: CARD[d].fx.price, dream: d, proj: [], skip: 0, yr: 0 }; P.dream = d; save();
}
{ const vb0 = vBoard; vBoard = function () { const P = me(); if (P) mig7(P); return is7(P) ? vHome7(P) : vb0(); }; }
{ const va0 = vAssets; vAssets = function () { return is7(me()) ? vProj7() : va0(); }; }
{ const vr0 = vReport; vReport = function () { return is7(me()) ? vProj7() : vr0(); }; }
{ const nh0 = navH3; navH3 = function () {
  if (!is7(me())) return nh0();
  return [['board', 'f:house', 'Нүүр'], ['assets', 'r:briefcase', 'Төслүүд'], ['players', 'r:users-three', 'Тоглогчид'], ['hist', 'r:clock-counter-clockwise', 'Түүх']]
    .map(([k, i, n]) => `<button data-a="tab" data-t="${k}" ${UI.tab === k ? 'aria-current="page"' : ''}>${ic2(k === 'board' && UI.tab !== 'board' ? 'r:house' : i, 'i')}<span>${n}</span></button>`).join(''); }; }

/* win screen can be put down to look back at the game (user 2026-11-04: «түр доошлуулаад өөрийгөө яаж баяжсаныг хармаар байсан») */
{ const cs0 = closeSheet; closeSheet = function () { if (UI.sheetFn === fWin && G && (G.over || (me() && me().won))) UI.winHide = 1; return cs0.apply(this, arguments); }; }
function winPill() {
  let el = document.getElementById('winPill');
  const P = G && me(), on = !!(G && (G.over || (P && P.won)) && UI.winHide && UI.view === 'game' && !UI.sheetFn);
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'winPill'; el.dataset.a = 'winShow'; document.body.appendChild(el); }
  el.innerHTML = `${ic2('d:trophy')}<span>${P && P.won && P.fin ? `Та ${P.fin.rank}-р байрт дууссан` : G.over ? 'Тоглоом дууссан' : ''}</span>`;
}
ACT.winShow = () => { UI.winHide = 0; openSheet(fWin); winPill(); };
{ const os0 = openSheet; openSheet = function () { const r = os0.apply(this, arguments); winPill(); return r; }; }

ACT.goal7 = () => openSheet(() => { const P = me(), L = P.l7, p = L7.P(P);
  if (!W2CASH) return `${head('Ялалт 2 · Орлогоо 4 дахин өсгөх')}<div class="l7-big"><small>Төслүүдийн жилийн ашиг</small><b>${fmtB(p * 12)}</b></div>
  <div class="box"><div class="ln"><span>Зорилго<span class="sub">идэвхгүй орлогын 3 дахин · жилд</span></span><b>${fmtB(W2X * L.b * 12)}</b></div><div class="ln"><span>Үлдсэн</span><b>${fmtB(Math.max(0, (W2X * L.b - p) * 12))}</b></div></div>
  <p class="mute" style="font-size:13px">Шарк боломжоор авсан төслүүдийн жилийн ашиг идэвхгүй орлогын (жилд ${fmtB(L.b * 12)}) 3 дахинд хүрмэгц ялна. Тэгэхэд нийт орлого тань 4 дахин өснө. Эсвэл өөрийн мөрөөдлөө биелүүлж ялна.</p><div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`;
  return `${head('Ялалт 2 · Мөнгөн зорилго')}<div class="l7-big"><small>Бэлэн мөнгө</small><b>${fmtB(P.cash)}</b></div><div class="box"><div class="ln"><span>Зорилго</span><b>${fmtB(GOAL7)}</b></div><div class="ln"><span>Үлдсэн</span><b>${fmtB(Math.max(0, GOAL7 - P.cash))}</b></div></div>
  <p class="mute" style="font-size:13px">Бэлэн мөнгө ${fmtB(GOAL7)} хүрмэгц шууд ялна. Эсвэл Мөрөөдөл нүдэнд мөрөөдлөө худалдаж аваад ялна.</p><div class="cta"><button class="btn go" data-a="close">Ойлголоо</button></div>`; });

/* dark «Тэрбумтан» theme while the player is in Их тал: nav always, page background on Нүүр / Төслүүд */
{ const r7 = render; render = function () { const P = G && me(), on = !!(P && is7(P) && UI.view === 'game');
  document.body.classList.toggle('l7', on); document.body.classList.toggle('l7d', on);
  return r7.apply(this, arguments); }; }

/* ============================================================
   Prompt v8 / studio v194 (user 2026-11-07 «Заа гялалзуул»): Level 1 changes on top of v3
   lottery · presale · auto business · simple Зарлага · Хоршоо дампуурлаа · Зарлагын тайлан · ZZ new kinds · no car insurance
   ============================================================ */

/* ---------- Зарлагын тайлан: what each player paid on Зарлага, by category ---------- */
const AZCATS = ['Өдөр тутам', 'Ёс заншил', 'Хүсэл', 'Зайлшгүй зардал', 'Даатгал', 'Их азгүйтэл'];
function azRec(P, c, amt) {
  if (!c || c.deck !== 'AZ' || !(amt > 0)) return;
  const cat = c.cat || c.fx.cat || 'Бусад';
  P.azr = P.azr || {}; P.azc = P.azc || {};
  P.azr[cat] = (P.azr[cat] || 0) + R(amt); P.azc[c.id] = (P.azc[c.id] || 0) + R(amt);
}
const azTotal = P => Object.values(P.azr || {}).reduce((s, v) => s + v, 0);
function azReport(P, big) {
  const tot = azTotal(P); if (!tot) return big ? `<div class="box"><p class="empty">Зарлагад одоогоор юу ч төлөөгүй.</p></div>` : '';
  const top = Object.entries(P.azc || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const pas = is7(P) ? P.l7.b / 1000 : fin1(P, G).passive, months = pas > 0 ? Math.round(tot / pas) : 0;
  return `<section class="azr"><div class="azr-h"><b>Зарлагын тайлан</b><em>${fmt(tot)}</em></div>
  ${AZCATS.filter(k => (P.azr || {})[k]).map(k => `<div class="ln"><span>${k}</span><b>${fmt(P.azr[k])}</b></div>`).join('')}
  ${top.length ? `<div class="azr-s">Хамгийн их төлсөн</div>${top.map(([id, v]) => `<div class="ln"><span>№${esc(CARD[id].no)} · ${esc(CARD[id].title)}</span><b class="neg">−${fmtS(v)}</b></div>`).join('')}` : ''}
  ${months ? `<p class="azr-n">Энэ мөнгө ${months} сарын идэвхгүй орлоготой тэнцэнэ.</p>` : ''}</section>`;
}
{ const ap0 = ACT.azPay; ACT.azPay = (d, el) => { const P = me(), c = CARD[FS.card]; const n0 = (G.log || []).length; ap0(d, el); azRec(P, c, +d.amt); save(); }; }
{ const ac0 = ACT.azCar; ACT.azCar = (d, el) => { const P = me(), c = CARD[FS.card]; const o = c && c.fx.opts && c.fx.opts[+FS.opt || 0]; ac0(d, el); if (o) { azRec(P, c, o.price); save(); } }; }
{ const vh0 = vHist; vHist = function () { const h = vh0(), P = me(); return P && P.v3 ? h.replace(/(<div class="ptitle">[\s\S]*?<\/div>)/, `$1${azReport(P)}`) : h; }; }
{ const fw0 = fWin; fWin = function () { const h = fw0(), P = me(); if (!P || !P.v3) return h; const tot = azTotal(P); if (!tot) return h;
  const pas = is7(P) ? P.l7.b / 1000 : fin1(P, G).passive, months = pas > 0 ? Math.round(tot / pas) : 0;
  return h.replace('<div class="cta">', `<div class="box azr-end"><b>Та Зарлагад нийт ${fmt(tot)} зарцуулсан.</b>${months ? `<span>Энэ мөнгө ${months} сарын идэвхгүй орлоготой тэнцэнэ.</span>` : ''}</div><div class="cta">`); }; }

/* ---------- AZ: one «Төлөх» button, nothing to choose (prompt v8 §8) ---------- */
actCar1 = function (P, c) {
  FS.opt = '0'; const o = c.fx.opts[0];
  return `${cashPrev(P, 0, -o.pay)}${sm(`Урьдчилгаагүй · сар бүр ${fmt(o.pay)} × ${c.fx.months} сар`)}<div class="cta"><button class="btn go" data-a="azCar">Төлөх</button></div>`;
};
function actMisfortune1(P, c) {
  const k = c.fx.pct || .5, lc = P.cash > 0 ? R(P.cash * k) : 0, ls = sum(P.savings || [], s => R(s.amt * k));
  return `<div class="box mis"><div class="ln"><span>Бэлэн мөнгө</span><b class="neg">${lc ? '−' + fmt(lc) : '0₮'}</b></div><div class="ln"><span>Аппын хадгаламж</span><b class="neg">${ls ? '−' + fmt(ls) : '0₮'}</b></div><div class="ln tot"><span>Нийт алдагдал</span><b class="neg">−${fmt(lc + ls)}</b></div></div>
  ${lc + ls ? '' : sm('Бэлэн мөнгө, хадгаламж алга — юу ч алдахгүй.')}
  <div class="cta"><button class="btn go" data-a="misOk">${lc + ls ? 'Төлөх' : 'Ойлголоо'}</button></div>`;
}
ACT.misOk = () => {
  const P = me(), c = CARD[FS.card], k = c.fx.pct || .5;
  snap(c.title);
  const lc = P.cash > 0 ? R(P.cash * k) : 0; P.cash -= lc;
  let ls = 0; for (const s of P.savings || []) { const x = R(s.amt * k); s.amt -= x; ls += x; }
  log(G, P, `${c.title} · бэлэн ба хадгаламжийн ${R(k * 100)}%`, -(lc + ls), c.id, 'pay');
  azRec(P, c, lc + ls);
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: `${c.title} — ${fmtS(lc + ls)} алдлаа` });
  save(); closeSheet(); buzz([40, 60, 40]);
};

/* ---------- JB-134 «И-баримтын сугалаанд хожлоо!»: one button, golden screen ---------- */
function actLottery1(P, c) {
  return `<div class="cta"><button class="btn go gold" data-a="lotOk">Хожлоо авах +${fmtS(c.fx.amt)}</button></div>`;
}
ACT.lotOk = () => {
  const P = me(), c = CARD[FS.card];
  snap(c.title); gain(G, P, c.fx.amt, c.title, c.id, 'gain');
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: `🎉 ${P.name} сугалаанд ${fmtS(c.fx.amt)} хожлоо!` });
  save(); closeSheet(); buzz([30, 40, 30, 40, 80]); toast(`🎉 +${fmtS(c.fx.amt)}`);
};
{ const fc0 = fCard1; fCard1 = function () {
  const c = CARD[FS.card], h = fc0();
  if (!c) return h;
  if (c.fx.k === 'lottery') return h.replace(/class="cp-stage"( style="[^"]*")?/, 'class="cp-stage lot"').replace('<div class="cp-body">', `<div class="lot-cf">${confetti()}</div><div class="cp-body">`);
  if (c.fx.k === 'misfortune') return h.replace(/class="cp-stage"( style="[^"]*")?/, 'class="cp-stage mis"');
  return h;
}; }

/* ---------- Урьдчилсан захиалга (TB presale, prompt v8 §7) ---------- */
const preV = a => R(a.area * a.post_m2);
const preG = a => preV(a) - a.price;
const preR = a => a.price - a.down;
function actPresale1(P, c) {
  const fx = c.fx, V = R(fx.area * fx.post_m2), G0 = V - fx.price;
  return `${cpOn(P) ? '' : `<div class="box"><div class="ln"><span>Захиалгын үнэ</span><b>${fmt(fx.price)}</b></div><div class="ln"><span>Одоо төлөх 50%</span><b class="neg">−${fmt(fx.down)}</b></div></div>`}
  <div class="box pre-box"><div class="ln"><span>Ашиглалтад орсны дараах үнэ<span class="sub">${fx.area} м² × ${fmtS(fx.post_m2)}</span></span><b>${fmtS(V)}</b></div>
  <div class="ln"><span>Шууд зарах</span><b class="pos">+${fmtS(R(G0 / 2))}</b></div><div class="ln"><span>Бүтэн төлөөд зарах</span><b class="pos">+${fmtS(G0)}</b></div></div>
  ${sm(`${fx.wait} Орлогын дараа шоо: ${fx.delay_on.join('–')} буувал 1 жил хойшилно. Хүлээх хугацаанд ашиг, идэвхгүй орлого байхгүй.`)}
  ${cashPrev(P, -fx.down, 0)}${shortfall(P, fx.down)}
  <div class="cta">${skipBtn()}${saleBtn(P, c)}${payBtn(P, fx.down, 'preOk', 'Захиалах')}</div>`;
}
ACT.preOk = () => {
  const P = me(), c = CARD[FS.card], fx = c.fx;
  if (P.cash < fx.down) return toast('Бэлэн мөнгө хүрэлцэхгүй');
  snap(c.title);
  P.cash -= fx.down;
  P.assets.push({ id: uid('a'), kind: 'presale', card: c.id, name: c.title, sub: fx.sub, area: fx.area, pre_m2: fx.pre_m2, post_m2: fx.post_m2,
    price: fx.price, down: fx.down, wait: fx.wait, delayOn: fx.delay_on, mort: false, ready: false, bought: P.pd || 0, inc: 0, opex: 0 });
  log(G, P, `${c.title} · захиаллаа`, -fx.down, c.id, 'buy'); payOffer(P, fx.down, c);
  if (G.mode === 'online') NET.emit({ t: 'buy', card: c.id, txt: c.title });
  save(); closeSheet(); buzz(20);
};
/* payday: count down, then the «Ашиглалтад орох шоо» */
{ const pd0 = payday1; payday1 = function (G2, P) {
  const r = pd0(G2, P);
  for (const a of P.assets.filter(x => x.kind === 'presale' && !x.ready)) { a.wait -= 1; if (a.wait <= 0) r.decide.push({ k: 'pre', id: a.id }); }
  return r;
}; }
{ const pk0 = pdKey; pdKey = x => x.k === 'pre' ? 'p:' + x.id : pk0(x); }
function preRow(P, id, done, ctx) {
  const a = P.assets.find(x => x.id === id);
  if (!a) return done ? `<div class="box"><div class="ln"><span><b>Урьдчилсан захиалга</b></span><b class="pos">${done === 'sold' ? 'Зарлаа' : 'Шийдсэн'}</b></div></div>` : '';
  const V = preV(a), Gn = preG(a), R0 = preR(a);
  const head = `<div class="ln"><span><b>${esc(a.name)}</b><span class="sub">${a.ready ? 'Ашиглалтад орлоо — заавал зарна' : 'Ашиглалтад орох шоо хэд буув?'}${a.mort ? ' · ипотектой' : ''}</span></span>${done === 'delay' ? '<b class="neg">1 жил хойшиллоо</b>' : ''}</div>`;
  if (done === 'delay') return `<div class="box">${head}</div>`;
  if (!a.ready) return `<div class="box">${head}${sm(`${a.delayOn.join('–')} → 1 жил хойшилно · бусад → ашиглалтад орно`)}${dicePad('preDie', `data-id="${a.id}" data-p="${P.id}" data-c="${ctx || 'pd'}"`)}</div>`;
  const short = !a.mort && P.cash < R0;
  return `<div class="box">${head}
    <div class="ln"><span>Шууд зарах<span class="sub">үлдэгдлээ төлөхгүй · ${fmtS(a.down)} + ${fmtS(R(Gn / 2))}</span></span><button class="minibtn go" data-a="preSell" data-id="${a.id}" data-p="${P.id}" data-k="d" data-c="${ctx || 'pd'}">+${fmtS(a.down + R(Gn / 2))}</button></div>
    <div class="ln"><span>Бүтэн төлөөд зарах<span class="sub">үлдэгдэл ${fmtS(R0)} төлж ${fmtS(V)}-өөр${short ? ' · дутууг аппын зээлээр' : ''}</span></span><button class="minibtn go" data-a="preSell" data-id="${a.id}" data-p="${P.id}" data-k="f" data-c="${ctx || 'pd'}">+${fmtS(V - R0)}</button></div></div>`;
}
ACT.preDie = d => {
  const P = PL1(d.p) || me(), a = P.assets.find(x => x.id === d.id); if (!a) return;
  snap('Ашиглалтад орох шоо'); const n = +d.n;
  if ((a.delayOn || [1, 2]).includes(n)) { a.wait = 3; log(G, P, `${a.name} · шоо ${n} — 1 жил хойшиллоо`, 0, a.card, 'market'); if (d.c === 'pd' && FS.pdDone) FS.pdDone['p:' + a.id] = 'delay'; }
  else { a.ready = true; log(G, P, `${a.name} · шоо ${n} — ашиглалтад орлоо`, 0, a.card, 'market'); }
  save(); render(); drawSheet();
};
ACT.preSell = d => {
  const P = PL1(d.p) || me(), a = P.assets.find(x => x.id === d.id); if (!a) return;
  const V = preV(a), Gn = preG(a), R0 = preR(a);
  snap('Захиалга зарах');
  let got;
  if (d.k === 'd') got = a.down + R(Gn / 2);
  else { if (!a.mort && P.cash < R0) emergLoan(G, P, R0 - P.cash); got = V - R0; }
  P.assets = P.assets.filter(x => x !== a); P.cash += got;
  log(G, P, `${a.name} · ${d.k === 'd' ? 'шууд зарлаа' : 'бүтэн төлөөд зарлаа'}`, got, a.card, 'sell');
  if (d.c === 'pd' && FS.pdDone) FS.pdDone['p:' + a.id] = 'sold'; else if (FS.done) FS.done['ps:' + a.id] = 1;
  save(); render(); drawSheet(); buzz(25);
};
{ const av0 = aVal1; aVal1 = (P, a) => a.kind === 'presale' ? ['re', a.ready ? 'Ашиглалтад орсон' : `Баригдаж буй · ${a.wait} Орлого`, ''] : av0(P, a); }
{ const lq0 = liqOf; liqOf = (P, a) => a.kind === 'presale' ? a.down : lq0(P, a); }

/* ---------- Зах зээл: new kinds (prompt v8 §9) ---------- */
const rental7 = P => P.assets.filter(a => a.kind === 're' && a.net > 0 && !['biz', 'auto'].includes(a.sub));
{ const zh = zzHits; zzHits = function (P, fx) {
  if (!fx) return [];
  const pre = P.assets.filter(a => a.kind === 'presale' && !a.ready);
  switch (fx.kind) {
    case 'buy_mult': if (fx.tags === 'auto') return P.assets.filter(a => a.kind === 're' && a.sub === 'auto');
      if (fx.tags === 'business') return P.assets.filter(a => a.kind === 're' && a.sub === 'biz'); break;   // studio 2026-11-11 ZZ-142/144: small businesses (Жижиг боломж), automated ones excluded
    case 'business_audit': return P.assets.filter(a => a.kind === 're' && (a.sub === 'biz' || a.sub === 'auto'));
    case 'biz_profit': return P.assets.filter(a => a.kind === 're' && a.sub === 'biz');
    case 'pay_if': if (fx.tags === 'rental') return rental7(P).slice(0, 1); if (fx.tags === 'apt_house') return P.assets.filter(a => a.kind === 're' && ['1room', '2room', '3room'].includes(a.sub)).slice(0, 1); break;
    case 'pay_rent_months': { const r = rental7(P).sort((x, y) => y.net - x.net); return r.slice(0, 1); }
    case 'presale_buyout': case 'presale_complete': case 'presale_m2': case 'presale_mortgage': case 'presale_risk': case 'presale_extra': case 'presale_delay': return pre;
  }
  return zh(P, fx);
}; }
{ const za0 = zzAuto; zzAuto = function (c, roll) {
  const fx = c.fx;
  if (['presale_m2', 'presale_mortgage', 'presale_delay', 'biz_profit'].includes(fx.kind)) {
    const ps = zzWho(fx); if (!ps.some(P => zzHits(P, fx).length)) return;
    snap(c.title);
    for (const P of ps) for (const a of zzHits(P, fx)) {
      if (fx.kind === 'presale_m2') a.post_m2 += fx.val;
      if (fx.kind === 'presale_mortgage') a.mort = true;
      if (fx.kind === 'presale_delay') a.wait += 3 * (fx.val || 1);
      if (fx.kind === 'biz_profit') a.net = R(a.net * (1 + fx.val));
    }
    for (const P of ps) if (zzHits(P, fx).length) log(G, P, c.title, 0, c.id, 'market');
    FS.applied = true; save(); return;
  }
  return za0(c, roll);
}; }
{ const zr0 = zzRows; zzRows = function (P, c) {
  const fx = c.fx, D = FS.done || {}, hits = zzHits(P, fx);
  switch (fx.kind) {
    case 'biz_profit': return hits.map(a => `<div class="ln"><span>${esc(a.name)}</span><b class="pos">+${fmt(a.net * 4)} / 4 сар</b></div>`).join('');
    case 'pay_rent_months': { const a = hits[0]; if (!a) return ''; const amt = R(a.net * fx.val);
      return `<div class="ln"><span>${esc(a.name)}<span class="sub">сарын ашиг ${fmt(a.net)} × ${fx.val}</span></span><b class="neg">−${fmt(amt)}</b></div>${D.paid ? '<p class="pos" style="font-weight:800">Төллөө</p>' : `<div class="row" style="margin-top:8px">${payBtn(P, amt, 'zzRent', fmt(amt) + ' төлөх', true, `data-amt="${amt}"`)}</div>`}`; }
    case 'presale_buyout': return hits.map(a => { const k = 'ps:' + a.id, v = a.down + fx.val;
      return `<div class="ln"><span>${esc(a.name)}<span class="sub">урьдчилгаа ${fmtS(a.down)} + ${fmtS(fx.val)}</span></span>${D[k] ? '<b class="pos">Зарсан</b>' : `<button class="minibtn go" data-a="preBuy" data-p="${P.id}" data-id="${a.id}" data-v="${v}">+${fmtS(v)}</button>`}</div>`; }).join('');
    case 'presale_complete': return hits.map(a => { a.ready = true; return preRow(P, a.id, D['ps:' + a.id] ? 'sold' : '', 'zz'); }).join('') + P.assets.filter(a => a.kind === 'presale' && a.ready && !hits.includes(a)).map(a => preRow(P, a.id, '', 'zz')).join('');
    case 'presale_m2': return hits.map(a => `<div class="ln"><span>${esc(a.name)}<span class="sub">1 м² ${fmtS(a.post_m2)}</span></span><b>${fmtS(preV(a))}</b></div>`).join('');
    case 'presale_mortgage': return hits.map(a => `<div class="ln"><span>${esc(a.name)}</span><b class="pos">Ипотектой</b></div>`).join('');
    case 'presale_delay': return hits.map(a => `<div class="ln"><span>${esc(a.name)}</span><b class="neg">${a.wait} Орлого үлдсэн</b></div>`).join('');
    case 'presale_risk': return hits.map(a => { const v = D['pr:' + a.id];
      return `<div class="ln" style="flex-wrap:wrap"><span>${esc(a.name)}<span class="sub">1 → цуцлагдаж ${fmtS(R(a.down / 2))} буцна · 2–3 → 1 жил хойшилно</span></span>${v ? `<b class="${v === 1 ? 'neg' : v <= 3 ? 'neg' : 'pos'}">${v} · ${v === 1 ? 'Цуцлагдлаа' : v <= 3 ? 'Хойшиллоо' : 'Хэвээр'}</b>` : ''}</div>${v ? '' : dicePad('preRisk', `data-p="${P.id}" data-id="${a.id}"`)}`; }).join('');
    case 'presale_extra': return hits.map(a => { const v = D['px:' + a.id], amt = R(a.price * fx.val);
      return `<div class="ln" style="flex-wrap:wrap"><span>${esc(a.name)}</span>${v ? `<b>${v === 'A' ? '−' + fmtS(amt) : '1 жил хойшиллоо'}</b>` : ''}</div>${v ? '' : `<div class="row" style="gap:8px;margin:6px 0 10px"><button class="minibtn" data-a="preExtra" data-p="${P.id}" data-id="${a.id}" data-k="A">А · −${fmtS(amt)}</button><button class="minibtn" data-a="preExtra" data-p="${P.id}" data-id="${a.id}" data-k="B">Б · 1 жил хойшлуулах</button></div>`}`; }).join('');
  }
  return zr0(P, c);
}; }
ACT.zzRent = d => { const P = me(), c = CARD[FS.card], amt = +d.amt; snap(c.title); spend(G, P, amt, c.title, c.id); FS.done.paid = 1; save(); render(); drawSheet(); };
ACT.preBuy = d => { const P = PL1(d.p), a = P && P.assets.find(x => x.id === d.id); if (!a) return; snap('Захиалга зарах'); P.assets = P.assets.filter(x => x !== a); P.cash += +d.v; log(G, P, `${a.name} · захиалгаа зарлаа`, +d.v, a.card, 'sell'); FS.done['ps:' + a.id] = 1; save(); render(); drawSheet(); buzz(20); };
ACT.preRisk = d => { const P = PL1(d.p), a = P && P.assets.find(x => x.id === d.id); if (!a) return; const n = +d.n; snap('Захиалгын эрсдэл');
  if (n === 1) { P.assets = P.assets.filter(x => x !== a); const back = R(a.down / 2); P.cash += back; log(G, P, `${a.name} · цуцлагдлаа`, back, a.card, 'market'); }
  else if (n <= 3) { a.wait += 3; log(G, P, `${a.name} · 1 жил хойшиллоо`, 0, a.card, 'market'); }
  FS.done['pr:' + d.id] = n; save(); render(); drawSheet(); };
ACT.preExtra = d => { const P = PL1(d.p), a = P && P.assets.find(x => x.id === d.id); if (!a) return; const c = CARD[FS.card]; snap(c.title);
  if (d.k === 'A') spend(G, P, R(a.price * c.fx.val), `${a.name} · нэмэлт төлбөр`, c.id); else { a.wait += 3; log(G, P, `${a.name} · 1 жил хойшлууллаа`, 0, c.id, 'market'); }
  FS.done['px:' + d.id] = d.k; save(); render(); drawSheet(); };

/* ---------- stocks: sell any time at the last price set in the game (user 2026-11-09, back to the earlier rule) ---------- */
{ const vs0 = vStocks; vStocks = function () {
  const P = me(), h = vs0(), metals = P && P.assets.some(a => a.kind === 'metal');
  let o = h;
  if (!metals) o = o.replace(/<div class="sec">Үнэт металл<\/div>\s*<div class="list">[\s\S]*?<\/div>(?=\s*(?:<button class="tell"|<\/div>$))/, '');
  return o;
}; }

/* ---------- card picker by number only (user 2026-11-07): JB / TB / AZ / ZZ show no card list ---------- */
const NUMDK = { JB: 1, TB: 1, AZ: 1, ZZ: 1 };   // dreams are chosen from the list in the app, not drawn (user 2026-11-09)
const cardNo = c => c.no || c.id.split('-')[1];
{ const fp0 = fPick; fPick = function () {
  const dk = FS.deck; if (!NUMDK[dk]) return fp0();
  const n = OF.cards.filter(c => c.deck === dk).length, q = FS.q && /^\d+$/.test(FS.q) ? FS.q : '';
  const key = k => `<button class="np-k" data-a="npKey" data-k="${k}">${k}</button>`;
  return `${head(DECKS[dk].n, FS.sq ? `<span>${esc(FS.sq.name)}</span>›<b>${DECKS[dk].n}</b>` : '')}
  <div class="np">
    <p class="np-h">Сугалсан картынхаа дугаарыг оруулна уу</p>
    <div class="np-d ${q ? '' : 'empty'}" aria-live="polite"><span>№</span><b>${q || '––'}</b></div>
    <small class="np-r">01 – ${String(n).padStart(2, '0')}</small>
    <div class="np-g">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}<button class="np-k np-del" data-a="npKey" data-k="del" aria-label="Устгах">⌫</button>${key(0)}<button class="np-k np-go" data-a="npGo" ${q ? '' : 'disabled'}>Харах</button></div>
  </div>`;
}; }
const npOpen = c => { FS.q = ''; UI.cardTurn = 1; return FS.discount != null && ACT.pickCardDisc ? ACT.pickCardDisc({ id: c.id }) : startCard(c.id); };
const npFind = q => OF.cards.find(x => x.deck === FS.deck && cardNo(x) === String(q).padStart(2, '0'));
ACT.npKey = d => { let q = /^\d+$/.test(FS.q || '') ? FS.q : '';
  if (d.k === 'del') q = q.slice(0, -1); else if (q.length < 2) q += d.k;
  FS.q = q;
  if (q.length === 2) { const c = npFind(q); if (c) return npOpen(c); toast(`№ ${q} олдсонгүй`); FS.q = ''; }
  drawSheet(); };
ACT.npGo = () => { const q = FS.q || ''; if (!q) return; const c = npFind(q); FS.q = ''; if (c) npOpen(c); else { toast(`№ ${q} олдсонгүй`); drawSheet(); } };
document.addEventListener('keydown', e => { if (!document.querySelector('#sheet .np') || e.target.closest('input,textarea')) return;
  if (/^[0-9]$/.test(e.key)) ACT.npKey({ k: e.key }); else if (e.key === 'Backspace') ACT.npKey({ k: 'del' }); else if (e.key === 'Enter') ACT.npGo(); });

/* ---------- Санхүүгийн эрх чөлөө popup (user 2026-11-07): progress + every income/expense line, 1 сар and 4 сар ---------- */
function fFree8() {
  const P = me(), f = fin1(P, G), M = L1.mpp, inc = incRows(P, f), exp = livRows(P, f);
  const p = Math.floor(Math.max(0, Math.min(1, f.progress || 0)) * 100);
  const I = sum(inc, x => x[1]), E = sum(exp, x => x.v), adj = R(f.delta - (I - E) * M);
  const amt = (v, x4) => `${v < 0 ? '−' : '+'}${fmtS(Math.abs(x4 ? v * M : v))}`;
  const row = (l, sub, v) => `<div class="fz-r"><span class="fz-l"><b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="fz-1 ${v < 0 ? 'neg' : 'pos'}">${amt(v)}</span><span class="fz-4 ${v < 0 ? 'neg' : 'pos'}">${amt(v, 1)}</span></div>`;
  return `<div class="fz">
  <div class="fz-h"><h3>Санхүүгийн эрх чөлөө</h3>${X}</div>
  <section class="fz-hero">
    <div class="fz-pc"><b>${p}%</b>${f.free ? '<em>Хүрлээ!</em>' : ''}</div>
    <div class="fz-bar"><i style="width:${p}%"></i><span>★</span></div>
    <div class="fz-kv"><div><small>Идэвхгүй орлого</small><b>${fmtS(f.passive * M)}</b></div><div><small>Зорилго</small><b>${fmtS(f.goal * M)}</b></div><div><small>Дутуу</small><b>${f.free ? '0₮' : fmtS(f.gap * M)}</b></div></div>
  </section>
  <p class="fz-note">Идэвхгүй орлого 4 сарын амьжиргааны зардлын 2 дахин нугалсан орлоготой болоход та санхүүгийн эрх чөлөөнд хүрч Шарк тоглогч болно.</p>
  <div class="fz-cols"><span></span><span>1 сар</span><span>4 сар</span></div>
  <div class="fz-sum">
    ${row('Цалингийн орлого', '', f.income - f.passive)}
    ${row('Идэвхгүй орлого', '', f.passive)}
    ${row('Нийт зардал', '', -f.expenses)}
  </div>
  <h4 class="fz-s">Орлого</h4>
  ${inc.map(x => row(x[0], x[2], x[1])).join('') || '<p class="empty">Алга</p>'}
  <h4 class="fz-s">Зардал</h4>
  ${exp.map(x => row(x.l, x.sub, -x.v)).join('') || '<p class="empty">Алга</p>'}
  ${adj ? `<div class="fz-r"><span class="fz-l"><b>Бусад</b><small>Орлого бүрт нэг удаа</small></span><span class="fz-1"></span><span class="fz-4 ${adj < 0 ? 'neg' : 'pos'}">${amt(adj)}</span></div>` : ''}
  <div class="fz-r fz-t"><span class="fz-l"><b>Ашиг</b></span><span class="fz-1 ${I - E < 0 ? 'neg' : 'pos'}">${amt(I - E)}</span><span class="fz-4 ${f.delta < 0 ? 'neg' : 'pos'}">${amt(f.delta)}</span></div>
</div>`;
}
fFree8._zp = 1;
fFree1 = fFree8;
ACT.freeInfo = () => isV3(me()) ? openSheet(fFree8, { modal: true }) : openSheet(fFree);

/* ---------- Боловсрол: 10% of the money received at one Орлого (salary × 4 + passive), user 2026-11-07 ---------- */
{ const ec0 = eduCost; eduCost = function (P) {
  if (P.level !== 1) return ec0(P);
  const f = fin1(P, G); return R((f.salary * L1.mpp + Math.max(0, f.paydayPassive || 0)) * 0.1);
}; }

/* ---------- confirm popup: undo and kick ask first (user 2026-11-07) ---------- */
function fAsk8() {
  const q = UI.ask8 || {};
  return `<div class="ask8"><span class="ask8-i ${q.danger ? 'dg' : ''}">${ic2(q.icon || 'r:arrow-u-up-left')}</span>
  <h3>${esc(q.t || '')}</h3>${q.sub ? `<p>${esc(q.sub)}</p>` : ''}
  <div class="ask8-b"><button class="btn" data-a="close">Үгүй</button><button class="btn ${q.danger ? 'dg8' : 'go'}" data-a="ask8Ok">${esc(q.ok || 'Тийм')}</button></div></div>`;
}
fAsk8._zp = 1;
function ask8(o) { UI.ask8 = o; openSheet(fAsk8, { modal: true }); }
ACT.ask8Ok = () => { const fn = UI.ask8 && UI.ask8.fn; UI.ask8 = null; closeSheet(); if (fn) fn(); };
ACT.undo = () => {
  if (!UI.undo.length) return toast('Буцаах үйлдэл алга');
  const u = UI.undo[UI.undo.length - 1];
  ask8({ t: 'Та үйлдлээ буцаахдаа итгэлтэй байна уу?', sub: `Буцаах үйлдэл: ${u.label}`, ok: 'Тийм, буцаах', fn: () => undo() });
};
ACT.kick8 = d => {
  const p = G.players.find(x => x.id === d.id); if (!p || !NET.isHost()) return;
  ask8({ t: `${p.name}-г тоглоомоос хасах уу?`, sub: 'Тэр тоглогчийн тоглоом энэ өрөөнөөс хасагдана.', ok: 'Хасах', danger: 1, icon: 'r:user-minus',
    fn: async () => { if (await NET.kick(p.id)) { toast(`${p.name} хасагдлаа`); render(); } } });
};

/* ---------- selling a drawn card from Тоглогчид (user 2026-11-09): pick the card by number, the buyer and the agreed price ---------- */
const csCard = x => { const no = String(x.no || '').padStart(2, '0'); return x.no ? OF.cards.find(c => c.deck === x.dk && cardNo(c) === no) : null; };
const csOk = c => !!c && (c.deck === 'JB' || c.deck === 'TB') && !['stock', 'metal', 'lottery'].includes(c.fx.k);
{ const vp0 = vPlayers; vPlayers = function () {
  const h = vp0(), P = me();
  if (!G || !P || !isV3(P) || P.level !== 1 || !others1(P).length || P.out) return h;
  const btn = `<button class="cs8-open" data-a="csOpen">${ic2('r:handshake')}<span><b>Карт зарах</b><small>Сугалсан картаа өөр тоглогчид тохиролцсон үнээр зарна</small></span>${ic2('r:caret-right')}</button>`;
  const i = h.indexOf('<div class="rank');
  return i < 0 ? h + btn : h.slice(0, i) + btn + h.slice(i);
}; }
ACT.csOpen = () => { if (!canAct(me())) return toast('Таны ээлж биш байна'); FS = { cs: { dk: 'JB', no: '', to: null, amt: 0 } }; openSheet(fCs8, { modal: true }); };
function fCs8() {
  const P = me(), x = FS.cs, c = csCard(x), os = others1(P), ok = csOk(c);
  if (x.sent) { const B = PL1(x.to);
    return `${head('Карт зарах')}<div class="cs8-wait">${ic2('r:hourglass-medium')}<b>${esc(B ? B.name : '')}-д санал илгээлээ</b><small>${esc(c.title)} · ${fmt(x.amt)}</small><p>Тэр картаа нээж авбал мөнгө танд орно. Санал очоогүй бол дахин илгээнэ үү.</p></div>
    <div class="cta"><button class="btn" data-a="csAgain8">Дахин илгээх</button><button class="btn go" data-a="close">Хаах</button></div>`; }
  return `${head('Карт зарах')}
  <p class="cs8-p">Сугалсан картаа өөр тоглогчид зарна. Үнээ тохиролцоод доор оруулна уу.</p>
  <div class="cs8-f"><label>Карт</label>
    <div class="chips">${[['JB', 'Жижиг боломж'], ['TB', 'Том боломж']].map(([k, n]) => `<button class="chip" data-a="csDk" data-k="${k}" aria-pressed="${x.dk === k}">${n}</button>`).join('')}</div>
    <label class="mrow has cs8-no"><span class="ml">№</span><input id="csNo" inputmode="numeric" maxlength="2" placeholder="00" value="${esc(x.no)}" data-in="csNo"></label>
    ${c ? `<div class="cs8-card ${ok ? '' : 'bad'}"><b>${esc(c.title)}</b><small>${ok ? `${DECKS[c.deck].n} · № ${cardNo(c)}` : 'Энэ картыг зарахгүй'}</small></div>` : x.no ? '<div class="cs8-card bad"><small>Ийм дугаартай карт алга</small></div>' : ''}
  </div>
  <div class="cs8-f"><label>Хэнд</label><div class="chips">${os.map(o => `<button class="chip" data-a="csTo" data-id="${o.id}" aria-pressed="${x.to === o.id}">${esc(o.name)}</button>`).join('')}</div></div>
  <div class="cs8-f"><label>Тохиролцсон үнэ</label><label class="mrow has"><span class="ml">Үнэ</span><input id="csAmt" inputmode="numeric" placeholder="0" value="${x.amt ? x.amt.toLocaleString('en') : ''}" data-in="csAmt"></label></div>
  <div class="cta"><button class="btn" data-a="close">Болих</button><button class="btn go" data-a="csGo" ${ok && x.to ? '' : 'disabled'}>${!ok ? 'Картаа сонгоно уу' : !x.to ? 'Хэнд зарахаа сонгоно уу' : G.mode === 'online' ? 'Санал илгээх' : `${esc(PL1(x.to).name)}-д зарах`}</button></div>`;
}
const csKeep = id => { clearTimeout(pqT); pqT = setTimeout(() => { drawSheet(); const e = $('#' + id); if (e) { e.focus(); const n = e.value.length; e.setSelectionRange(n, n); } }, 350); };
ACT.csDk = d => { FS.cs.dk = d.k; drawSheet(); };
ACT.csTo = d => { FS.cs.to = d.id; drawSheet(); };
ACT.csNo = (d, el) => { FS.cs.no = String(el.value || '').replace(/\D/g, '').slice(0, 2); csKeep('csNo'); };
ACT.csAmt = (d, el) => { FS.cs.amt = parseAmt(el.value) || 0; csKeep('csAmt'); };
ACT.csGo = () => { const P = me(), x = FS.cs, c = csCard(x); if (!csOk(c) || !x.to) return;
  const B = PL1(x.to);
  if (G.mode === 'online') { NET.emit({ t: 'csell', to: x.to, card: c.id, amt: x.amt, txt: `${c.title} картаа ${x.amt ? fmtS(x.amt) + '-өөр ' : ''}зарах санал` }); x.sent = true; log(G, P, `${c.title} картаа ${B.name}-д зарах санал илгээлээ`, 0, c.id, 'skip'); save(); return drawSheet(); }
  FS.sl = { to: x.to, amt: x.amt, card: c.id }; ACT.slGo(); };
/* buyer (online) */
function fCsIn() {
  const e = FS.csin, c = CARD[e.card];
  return `${head('Карт зарах санал')}<div class="cs8-wait">${ic2('r:handshake')}<b>${esc(FS.from)} картаа зарж байна</b><small>${esc(c.title)} · ${DECKS[c.deck].n} № ${cardNo(c)}</small><p>Тохиролцсон үнэ <b>${fmt(e.amt || 0)}</b>. Картаа нээгээд авах эсэхээ шийднэ.</p></div>
  <div class="cta"><button class="btn" data-a="csNo8">Татгалзах</button><button class="btn go" data-a="csYes8">Карт нээх</button></div>`;
}
function csShow8(id) { const q = UI.csq || []; const i = id ? q.findIndex(x => x.e.id === id) : 0; if (i < 0 || !q[i]) return;
  if (!id && UI.sheetFn) return; const x = q.splice(i, 1)[0]; FS = { csin: x.e, from: x.name }; openSheet(fCsIn, { modal: true }); }
{ const cs3 = closeSheet; closeSheet = function () { const r = cs3.apply(this, arguments); if ((UI.csq || []).length) setTimeout(() => { if (!UI.sheetFn) csShow8(); }, 700); return r; }; }
ACT.csAgain8 = () => { const P = me(), x = FS.cs, c = csCard(x); if (!c || !x.to) return;
  NET.emit({ t: 'csell', to: x.to, card: c.id, amt: x.amt, txt: `${c.title} картаа ${x.amt ? fmtS(x.amt) + '-өөр ' : ''}зарах санал` }); toast('Саналаа дахин илгээлээ'); };
ACT.csYes8 = () => { const e = FS.csin; NET.emit({ t: 'csellok', to: e.by, txt: `${CARD[e.card].title} картыг нээлээ` }); startCard(e.card, { offerFrom: e.by, offerAmt: e.amt || 0, offerLock: true }); };
ACT.csNo8 = () => { const e = FS.csin; NET.emit({ t: 'csellno', to: e.by, txt: `${CARD[e.card].title} · авахаас татгалзлаа` }); closeSheet(); };
{ const lh0 = l1Handle; l1Handle = function (e, name) {
  if (!['csell', 'csellok', 'csellno'].includes(e.t)) return lh0(e, name);
  if (e.to !== G.me) return true;
  if (e.t === 'csell') { e.by = e.by || e.from;
    // the offer waits until the buyer's open window closes (user 2026-11-12: «Карт зарах хүсэлт нөгөө хүндээ очихгүй байна» — it used to be only an 8-second notification)
    UI.csq = (UI.csq || []).filter(q => !(q.e.by === e.by && q.e.card === e.card)); UI.csq.push({ e, name });
    notify(e.by, name, e.txt, 'cardsale', () => csShow8(e.id)); if (!UI.sheetFn) setTimeout(() => csShow8(), 0); }
  else notify(e.by, name, e.txt, e.t === 'csellno' ? 'cardx' : 'buy');
  return true;
}; }

/* ---------- whose turn it is (user 2026-11-09: «Хэний ээлж вэ гэдгийг харуулдаг болмоор байна») ----------
   Online: the room doc keeps `order` and `turn`; the player whose turn it is hands it on, the host may skip someone.
   One phone: the board shown is the turn; «Дараагийнх» moves to the next player. */
function turnBar(dark) {
  if (!G || G.over || !me()) return '';
  if (G.mode === 'online') {
    if (!G.turn || !G.order) return '';
    const T = G.players.find(p => p.id === G.turn); if (!T) return '';
    const mine = T.id === G.me;
    const btn = mine ? `<button data-a="turn8">Ээлжээ дуусгах</button>` : G.host === G.me ? `<button class="sec" data-a="turn8">Алгасуулах</button>` : '';
    return `<div class="tb8 ${mine ? 'me' : ''} ${dark ? 'dk' : ''}" role="status"><span class="av" style="background-image:url(${mascot(T.profId)})"></span><span class="tx"><small>Одоо ээлж</small><b>${mine ? 'Таны ээлж' : esc(T.name)}</b></span>${btn}</div>`;
  }
  if (G.players.filter(p => !p.out).length < 2) return '';
  const P = me(), nx = nextPlayer();
  return `<div class="tb8 me ${dark ? 'dk' : ''}" role="status"><span class="av" style="background-image:url(${mascot(P.profId)})"></span><span class="tx"><small>Одоо ээлж</small><b>${esc(P.name)}</b></span><button data-a="endTurn">Дараагийнх · ${esc(nx.name)}</button></div>`;
}
ACT.turn8 = () => {
  const T = G.players.find(p => p.id === G.turn), nxId = NET.nextInOrder(), N = G.players.find(p => p.id === nxId); if (!T || !N) return;
  const go = () => NET.passTurn().then(ok => { if (ok) { toast(`Ээлж: ${N.name}`); render(); } });
  if (G.turn === G.me) return go();
  ask8({ t: 'Ээлжийг алгасуулах уу?', sub: `${T.name} → ${N.name}. Ээлж дараагийн тоглогч руу шилжинэ.`, ok: 'Алгасуулах', icon: 'r:hourglass-medium', fn: go });
};
{ const h0 = vHome3; vHome3 = function () { const h = h0.apply(this, arguments), i = h.indexOf('<div class="h3-card">'); return i < 0 ? h : h.slice(0, i) + turnBar(false) + h.slice(i); }; }
{ const h0 = vHome7; vHome7 = function () { const h = h0.apply(this, arguments), i = h.indexOf('<div class="x7-hero">'); return i < 0 ? h : h.slice(0, i) + turnBar(true) + h.slice(i); }; }

/* ---------- turn order set by the host (user 2026-11-09: «ээлжийн дарааллыг админ шийддэг») ---------- */
const ordIds = () => { const ids = G.players.filter(p => !p.out).map(p => p.id);
  if (G.mode !== 'online') return ids;
  const o = (G.order || []).filter(id => ids.includes(id)); return o.concat(ids.filter(id => !o.includes(id))).filter(id => !(G.hostOut && id === G.host)); };
const ordCan = () => G.mode !== 'online' || G.host === G.me;
{ const vp1 = vPlayers; vPlayers = function () {
  const h = vp1(); if (!G || G.players.filter(p => !p.out).length < 2 || (G.mode === 'online' && !G.order)) return h;
  const names = ordIds().map(id => esc((G.players.find(p => p.id === id) || {}).name || '')).join(' → ');
  const btn = `<button class="od8-open" data-a="ordOpen">${ic2('r:list')}<span><b>Ээлжийн дараалал</b><small>${names}</small></span>${ordCan() ? '<em>Засах</em>' : ''}</button>`;
  const i = h.indexOf('<div class="rank');
  return i < 0 ? h + btn : h.slice(0, i) + btn + h.slice(i);
}; }
ACT.ordOpen = () => { FS = { ord: ordIds(), out: !!G.hostOut }; openSheet(fOrd8, { modal: true }); };
ACT.ordHost = () => { FS.out = !FS.out; FS.ord = FS.out ? FS.ord.filter(id => id !== G.host) : (FS.ord.includes(G.host) ? FS.ord : [G.host].concat(FS.ord)); drawSheet(); };
function fOrd8() {
  const o = FS.ord, can = ordCan(), cur = G.mode === 'online' ? G.turn : (G.players[G.cur] || {}).id;
  return `<div class="pfw"><div class="shead"><h3>Ээлжийн дараалал</h3>${X}</div>
  <p class="cs8-p">${can ? 'Сумаар дээш, доош зөөж дарааллаа тохируулна.' : 'Дарааллыг өрөөний админ тохируулна.'}</p>
  ${G.mode === 'online' && can ? `<button class="od8-host" data-a="ordHost" aria-pressed="${!FS.out}"><span><b>Би (админ) ээлжинд орно</b><small>${FS.out ? 'Одоо: ээлжинд орохгүй, зөвхөн удирдана' : 'Одоо: бусадтай адил ээлжээр тоглоно'}</small></span><i></i></button>` : ''}
  <div class="od8-l">${o.map((id, i) => { const p = G.players.find(x => x.id === id); return `<div class="od8-r ${id === cur ? 'on' : ''}"><span class="n">${i + 1}</span><span class="av" style="background-image:url(${mascot(p.profId)})"></span><b>${esc(p.name)}${id === cur ? '<em class="trn8">Ээлж</em>' : ''}</b>${can ? `<button data-a="ordMv" data-i="${i}" data-d="-1" aria-label="Дээш" ${i ? '' : 'disabled'}>${ic2('b:caret-right')}</button><button class="dn" data-a="ordMv" data-i="${i}" data-d="1" aria-label="Доош" ${i < o.length - 1 ? '' : 'disabled'}>${ic2('b:caret-right')}</button>` : ''}</div>`; }).join('')}</div>
  <div class="cta">${can ? `<button class="btn" data-a="close">Болих</button><button class="btn go" data-a="ordSave">Хадгалах</button>` : `<button class="btn go" data-a="close">Хаах</button>`}</div></div>`;
}
fOrd8._zp = 1;
ACT.ordMv = d => { const o = FS.ord, i = +d.i, j = i + (+d.d); if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; drawSheet(); };
ACT.ordSave = async () => { const o = FS.ord.slice();
  if (G.mode === 'online') { if (await NET.setOrder(o, FS.out)) { toast('Дараалал хадгалагдлаа'); closeSheet(); render(); } return; }
  const curId = (G.players[G.cur] || {}).id;
  G.players = o.map(id => G.players.find(p => p.id === id)).concat(G.players.filter(p => !o.includes(p.id)));
  G.cur = Math.max(0, G.players.findIndex(p => p.id === curId)); save(); toast('Дараалал хадгалагдлаа'); closeSheet(); render(); };

/* dream picker: the player chooses the dream straight from the list (user 2026-11-09: «Мөрөөдлөө сугалахгүй апп дээрээ шууд сонгоно») */
{ const fp1 = fPick; fPick = function () {
  if (FS.deck !== 'MO') return fp1();
  const list = OF.cards.filter(c => c.deck === 'MO');
  return `${head('Мөрөөдлөө сонгоно уу')}
  <p class="cs8-p">Шарк талд биелүүлэх мөрөөдлөө сонгоно. Бусад тоглогчтой ижил мөрөөдөл сонгож болно. Сонгосноо дараа нь өөрчлөхгүй.</p>
  <div class="l7-list md8">${list.map(c => `<button class="l7-pj pick" data-a="pickCard" data-id="${c.id}"><span><b>№${esc(cardNo(c))} · ${esc(c.title)}</b><small>${fmtB(c.fx.price)}${(() => { const w = ((G && G.players) || []).filter(q => q.l7 && q.l7.dream === c.id).map(q => q.name); return w.length ? ' · сонгосон: ' + esc(w.join(', ')) : ''; })()}</small></span><em>${ic2('b:caret-right')}</em></button>`).join('')}</div>`;
}; }

/* ---------- the turn passes by itself once an entered card is done (user 2026-11-09: «ээлж ямар нэгэн карт оруулсан тохиолдолд шууд солигддог») ----------
   A card entered by number (Жижиг/Том боломж, Зарлага, Зах зээл, Шарк боломж) marks the turn; when its sheet closes and nothing else opens, the turn moves on. */
function autoPass() {
  if (!UI.cardTurn || UI.sheetFn || !G || G.over) return;
  UI.cardTurn = 0;
  if (G.mode === 'online') {
    if (!G.order || !G.order.includes(G.me)) return;
    // acting claims the turn (user 2026-11-12: «үйлдэл хийгээд байхад ээлж өөрчлөгдөхгүй»): someone forgot «Ээлжээ дуусгах», the next player
    // drew his card anyway → the turn moves on from the one who acted, not from the stale holder
    const was = G.turn; if (G.turn !== G.me) G.turn = G.me;
    const N = G.players.find(p => p.id === NET.nextInOrder()); if (!N || N.id === G.me) { G.turn = was; return; }
    NET.passTurn(true).then(ok => { if (ok) { toast(`Ээлж: ${N.name}`); render(); } else { G.turn = was; render(); } });
  } else if (G.players.filter(p => !p.out).length > 1) { ACT.endTurn(); toast(`Ээлж: ${me().name}`); }
}
{ const cs1 = closeSheet; closeSheet = function () { const r = cs1.apply(this, arguments); if (UI.cardTurn) setTimeout(autoPass, 450); return r; }; }
/* online: taking Орлого / Жилийн орлого also ends the turn (user 2026-11-12: «ямар нэг үйлдэл хийх үед автоматаар ээлжээ дуусгадаг»).
   If the player only passed over Орлого and then lands on a card, entering that card claims the turn back (autoPass). One phone keeps the button. */
{ const pn0 = ACT.payNow; ACT.payNow = function () { if (G && G.mode === 'online') UI.cardTurn = 1; return pn0.apply(this, arguments); }; }
{ const p70 = ACT.pay7Ok; ACT.pay7Ok = function () { if (G && G.mode === 'online') UI.cardTurn = 1; return p70.apply(this, arguments); }; }

/* ---------- joining a running game needs the admin's yes (user 2026-11-12) ---------- */
function fJoinWait8() {
  const w = UI.jw || {};
  return `<div class="ask8"><span class="ask8-i">${ic2('r:hourglass-medium')}</span>
  <h3>Админ зөвшөөрөхийг хүлээж байна</h3><p>Тоглоом эхэлчихсэн байна. Өрөөний админ таныг (${esc(w.name || '')}) оруулахыг зөвшөөрмөгц тоглоом руу орно.</p>
  <div class="cta"><button class="btn" style="flex:1;width:100%" data-a="jwCancel">Болих</button></div></div>`;
}
fJoinWait8._zp = 1;
ACT.jwCancel = () => { if (UI.jw && UI.jw.cancel) UI.jw.cancel(); else closeSheet(); };
function reqShow8(pid) { const q = UI.jq || []; const x = pid ? q.find(r => r.pid === pid) : q[0]; if (!x) return; FS = { req: x }; openSheet(fReq8, { modal: true }); }
function fReq8() {
  const x = FS.req || {}, pr = PROF[x.prof];
  return `<div class="ask8"><span class="ask8-i">${ic2('r:users-three')}</span>
  <h3>${esc(x.name || 'Тоглогч')} тоглоомд нэгдэх гэж байна</h3><p>${pr ? esc(pr.title) + ' · ' : ''}Тоглоом эхэлсэн тул таны зөвшөөрөл хэрэгтэй. Зөвшөөрвөл ээлжийн дарааллын төгсгөлд орно.</p>
  <div class="cta"><button class="btn" data-a="req8" data-v="no">Татгалзах</button><button class="btn go" data-a="req8" data-v="ok">Зөвшөөрөх</button></div></div>`;
}
fReq8._zp = 1;
ACT.req8 = async d => { const x = FS.req; if (!x) return; const ok = d.v === 'ok'; closeSheet();
  if (await NET.answerReq(G.room, x.pid, ok)) toast(ok ? `${x.name} нэгдлээ` : `${x.name}-г оруулсангүй`);
  setTimeout(() => { if (!UI.sheetFn && (UI.jq || []).some(r => r.pid !== x.pid)) { UI.jq = UI.jq.filter(r => r.pid !== x.pid); reqShow8(); } }, 700); };

/* ---------- finishing one by one (user 2026-11-09) ---------- */
fWin = function () {
  if (!G) { setTimeout(closeSheet, 0); return ''; }
  const P = me(), fin8 = G.players.filter(p => p.won && p.fin).sort((a, b) => a.fin.rank - b.fin.rank), wo = UI.winOther;
  if (!(P && P.won) && !G.over && !wo) { setTimeout(closeSheet, 0); return ''; }
  const rest = G.players.filter(p => !p.won).sort((a, b) => (b.level - a.level) || ((fin(b, G).progress || 0) - (fin(a, G).progress || 0)));
  const rows = fin8.map(p => `<div class="rank"><span class="n">${p.fin.rank}</span>${avatar(p)}<span style="flex:1;min-width:0"><b>${esc(p.name)}${p.id === P.id ? ' · та' : ''}</b><br><small class="mute">${esc(p.fin.why)}</small></span><em class="trn8" style="background:#F7AA21;color:#082567">Дууссан</em></div>`).join('')
    + rest.map(p => `<div class="rank"><span class="n">–</span>${avatar(p)}<span style="flex:1;min-width:0"><b>${esc(p.name)}</b><br><small class="mute">Тоглож байна · ${p.level === 2 ? 'Шарк тал' : 'Түвшин 1'}</small></span></div>`).join('');
  const mine = !wo && P.won && P.fin, W = wo && G.players.find(p => p.id === wo.pid);
  const title = wo ? `${esc(wo.name)} ${wo.rank ? wo.rank + '-р байрт ' : ''}дууслаа!` : mine ? `Та ${P.fin.rank}-р байрт дууслаа!` : 'Тоглоом дууслаа';
  const sub = wo ? (wo.why || '') : mine ? P.fin.why : (G.over && G.over.why) || '';
  return `<div class="winbox">${wo && W ? `<div class="stage"><img class="masc a-free" src="${mascot(W.profId)}" alt="" style="height:170px">${confetti()}</div>` : stage('m_free', 'a-free', confetti())}<h2>${title}</h2><p class="mute">${esc(sub)}</p></div>
  ${rest.length ? `<p class="mute" style="font-size:13px">Бусад тоглогч тоглоомоо үргэлжлүүлж, өөрсдийгөө дуусгана.</p>` : ''}
  <div class="box">${rows}</div>
  <div class="box"><h4>Энэ тоглоом юу заасан бэ?</h4>${(OF.rules.find(r => r.id === 'R15') || { blocks: [] }).blocks.map(b => `<p style="font-size:13px;margin-top:6px">${esc(b.x)}</p>`).join('')}</div>
  <div class="cta">${wo && !(P && P.won) ? `<button class="btn go" data-a="close">Тоглоомоо үргэлжлүүлэх</button>` : `<button class="btn" data-a="close">Тоглоомоо харах</button><button class="btn go" data-a="home">Нүүр хуудас</button>`}</div>`;
};
{ const cs2 = closeSheet; closeSheet = function () { if (UI.sheetFn === fWin) UI.winOther = null; return cs2.apply(this, arguments); }; }
{ const lh1 = l1Handle; l1Handle = function (e, name) {
  if (e.t !== 'win') return lh1(e, name);
  /* everyone sees the finish screen of each player who finishes, with the place (user 2026-11-09: «2рт 3рт ... хүн тус бүрт гарч ирнэ») */
  const why = String(e.txt || '').replace(/^\d+-р байрт дууслаа · /, '');
  const show = () => { UI.winOther = { pid: e.by, name, rank: e.rank || 0, why }; UI.winHide = 0; openSheet(fWin); };
  notify(e.by, name, e.txt, 'win', show);
  setTimeout(() => { allDone8(); store.set('of2.g.' + G.id, G); if (!UI.sheetFn) { show(); } }, 1500); return true;
}; }
/* players who finished are skipped in the turn order */
ACT.endTurn = () => {
  const n = G.players.length; let guard = 0;
  do {
    G.cur = (G.cur + 1) % n; guard++;
    const p = G.players[G.cur];
    if (!p.out && !p.won && p.skip > 0) { p.skip -= 1; log(G, p, 'Ээлж өнжлөө', 0, null, 'skip'); toast(`${p.name} ээлж өнжлөө`); continue; }
    if (!p.out && !p.won) break;
  } while (guard < n * 3);
  G.turns += 1; G.conds = G.conds.filter(c => !c.turns);
  save(); render(); window.scrollTo(0, 0);
};
nextPlayer = function () { const n = G.players.length; for (let k = 1; k <= n; k++) { const p = G.players[(G.cur + k) % n]; if (!p.out && !p.won) return p; } return me(); };

/* ---------- squares also hand the turn on once done (user 2026-11-09: «Боловсрол дээр буухад ... эд нарыг ч бас»).
   Орлого / Жилийн орлого are left out: they are also taken when passing over, before the square the player lands on. ---------- */
{ const sqt0 = ACT.sqType; ACT.sqType = d => { const r = sqt0(d); if (d && d.t !== 'PAY' && d.t !== 'PAY2') UI.cardTurn = 1; return r; }; }
{ const sq70 = ACT.sq7; ACT.sq7 = d => { const r = sq70(d); if (d && d.t !== 'PAY2' && !(d.t === 'DREAM' && d.own)) UI.cardTurn = 1; return r; }; }

/* ---------- sitting out turns (Халагдлаа: 2 ээлж) ----------
   One phone: endTurn already skips and counts down. Online: when the turn reaches a player who must sit out, their own phone counts one down and hands the turn on. */
function onMyTurn8() {
  const P = me(); if (!P || !(P.skip > 0) || G.mode !== 'online') return;
  setTimeout(() => { if (G.turn !== G.me || !(P.skip > 0)) return;
    P.skip -= 1; log(G, P, `Ээлж өнжлөө · ${P.skip} үлдсэн`, 0, null, 'skip'); save();
    toast(`Ээлж өнжлөө · ${P.skip} үлдсэн`); NET.emit({ t: 'note', txt: `Ээлж өнжлөө · ${P.skip} үлдсэн` });
    NET.passTurn(true).then(() => render()); }, 900);
}
{ const tb0 = turnBar; turnBar = function (dark) {
  let h = tb0(dark); if (!h) return h;
  const sk = G.players.filter(p => p.skip > 0 && !p.won).map(p => `${esc(p.name)} · ${p.skip} ээлж өнжинө`);
  return sk.length ? h + `<p class="tb8-sk">${ic2('f:hourglass-medium')}${sk.join(' · ')}</p>` : h;
}; }
/* ============================================================
   Online room: one document per player under rooms/<code>/players/<pid>.
   Each player writes only their own document (state + last events);
   everyone subscribes to the room's players collection.
   ============================================================ */
const NET = (() => {
  let db = null, user = null, ready = null, unsub = null, roomUnsub = null, pushT = 0, seen = new Set(), queue = [], st = 'Холбогдоогүй', joinedAt = 0;
  async function init() {
    if (ready) return ready;
    ready = (async () => {
      try {
        if (!window.claude || !window.claude.use) return null;
        db = await window.claude.use('db');
        try { user = await window.claude.use('user'); } catch (e) { user = null; }
        return db;
      } catch (e) { return null; }
    })();
    return ready;
  }
  const code6 = () => String(Math.floor(100000 + Math.random() * 900000));
  function slim(P) { const p = JSON.parse(JSON.stringify(P)); p.hist = (p.hist || []).slice(0, 200); return p; }   // full history (≤200, as kept locally) so the room admin can read it (user 2026-11-11)
  function myDoc(code, pid) { return db.doc(`rooms/${code}/players/${pid}`); }
  function noDb() {
    toast('Онлайн өрөө энэ харагдацад ажиллахгүй байна. claude.ai дээр нэвтэрч, хуудсыг Contributor эрхтэй хуваалцсан эсэхийг шалгана уу.');
    return null;
  }
  let busy = false;
  const NOWRITE = 'Таны эрх зөвхөн харах (Viewer) байна, тиймээс өрөөнд бичиж чадахгүй. Аппын эзэмшигч Share цэснээс танд Contributor эрх өгөх хэрэгтэй.';
  async function canWrite() { try { const u = user || await window.claude.use('user'); const c = u && u.can ? await u.can('data.write') : null; return c !== false; } catch (e) { return true; } }
  const errMsg = (e, pre) => (e && (e.code === 'invalid_argument' || e.code === 'not_permitted' || e.code === 'not_granted')) ? NOWRITE : pre + (e && (e.code || e.message) || e);
  async function create(g) {
    if (busy) return null;
    if (!await init()) return noDb();
    if (!await canWrite()) { toast(NOWRITE); return null; }
    busy = true;
    try {
      let code = code6();
      for (let k = 0; k < 4; k++) { const s = await db.doc(`rooms/${code}`).get(); if (!s.exists) break; code = code6(); }
      await db.doc(`rooms/${code}`).set({ code, created: Date.now(), settings: g.settings, v: 2, host: g.players[0].id, kicked: [], order: [g.players[0].id], turn: g.players[0].id, started: false });   // only the admin starts the game (user 2026-11-11)
      g.room = code; g.me = g.players[0].id; g.mode = 'online'; g.host = g.me; g.kicked = []; g.order = [g.me]; g.turn = g.me;
      await myDoc(code, g.me).set({ pid: g.me, name: g.players[0].name, at: Date.now(), state: slim(g.players[0]), ev: [] });
      subscribe(code, g.me);
      return true;
    } catch (e) { toast(errMsg(e, 'Өрөө нээж чадсангүй: ')); return null; } finally { busy = false; }
  }
  let healT = 0;
  /* join request while a game runs (user 2026-11-12): rooms/<code>/reqs/<pid> {pid, name, prof, at, st: 'wait' | 'ok' | 'no'} */
  function askIn(code, P) {
    return new Promise(async res => {
      const ref = db.doc(`rooms/${code}/reqs/${P.id}`); let un = null, fin = false;
      const end = ok => { if (fin) return; fin = true; try { un && un(); } catch (e) { } UI.jw = null; if (UI.sheetFn === fJoinWait8) closeSheet(); res(ok); };
      UI.jw = { name: P.name, cancel: async () => { try { await ref.delete(); } catch (e) { } end(false); } };
      try { await ref.set({ pid: P.id, name: P.name, prof: P.profId, at: Date.now(), st: 'wait' }); }
      catch (e) { UI.join.err = errMsg(e, 'Хүсэлт илгээж чадсангүй: '); return end(false); }
      openSheet(fJoinWait8, { modal: true });
      try { un = ref.onSnapshot(sn => { const x = sn.exists ? sn.data() : null;
        if (!x) return end(false);
        if (x.st === 'ok') { try { ref.delete(); } catch (e) { } end(true); }
        else if (x.st === 'no') { try { ref.delete(); } catch (e) { } UI.join.err = 'Админ таныг оруулахаас татгалзлаа'; toast('Админ татгалзлаа'); end(false); } }, () => {}); }
      catch (e) { UI.join.err = 'Хүсэлтийг хянаж чадсангүй'; end(false); }
    });
  }
  let reqUn = null; const reqSeen = new Set();
  function watchReqs(code) {
    if (reqUn) { try { reqUn(); } catch (e) { } reqUn = null; }
    if (!G || G.host !== G.me) return;
    try { reqUn = db.collection(`rooms/${code}/reqs`).onSnapshot(snap => {
      if (!G || G.room !== code || G.host !== G.me) return;
      const live = snap.docs.map(d => d.data()).filter(x => x && x.st === 'wait');
      UI.jq = live;
      live.forEach(x => { if (reqSeen.has(x.pid)) return; reqSeen.add(x.pid);
        notify(x.pid, x.name, 'Тоглоомд нэгдэх хүсэлт илгээлээ', 'cardsale', () => reqShow8(x.pid)); buzz([60, 60, 60]); });
      if (live.length && !UI.sheetFn) reqShow8();
      if (UI.sheetFn === fReq8 && !live.some(x => x.pid === (FS.req || {}).pid)) closeSheet();
    }, () => {}); } catch (e) { reqUn = null; }
  }
  async function answerReq(code, pid, ok) { try { await db.doc(`rooms/${code}/reqs/${pid}`).update({ st: ok ? 'ok' : 'no' }); return true; } catch (e) { toast(errMsg(e, 'Хариу илгээж чадсангүй: ')); return false; } }
  async function joinRoom(code, name, prof) {
    if (busy) return null;
    if (!await init()) return noDb();
    if (!await canWrite()) { UI.join.err = NOWRITE; return null; }
    busy = true;
    try {
      const r = await db.doc(`rooms/${code}`).get();
      if (!r.exists) { UI.join.err = `${code} кодтой өрөө олдсонгүй. Кодоо шалгана уу.`; return null; }
      const room = r.data();
      const g = newGame({ mode: 'online', room: code, settings: room.settings });
      let others = await db.collection(`rooms/${code}/players`).get();
      // same name again (new phone, cleared browser) → continue as that player instead of a second copy that never gets the turn (2026-11-12)
      const nm = String(name || '').trim().toLowerCase(), kicked0 = room.kicked || [];
      const old = nm && others.docs.map(d => d.data() || {}).find(x => x.pid && x.state && !kicked0.includes(x.pid) && String(x.name || '').trim().toLowerCase() === nm);
      if (old) {
        g.players = others.docs.map(d => d.data() || {}).filter(x => x.state && !kicked0.includes(x.pid)).map(x => x.state);
        g.me = old.pid; g.room = code; g.decks = {}; g.host = room.host || null; g.kicked = kicked0;
        g.order = room.order || null; g.turn = room.turn || null; g.started = room.started !== false; g.hostOut = !!room.hostOut;
        others.docs.forEach(d => ((d.data() || {}).ev || []).forEach(e => seen.add(e.id)));
        if (g.order && !g.order.includes(g.me) && !(g.hostOut && g.me === g.host)) { g.order = g.order.concat(g.me); try { await db.doc(`rooms/${code}`).update({ order: g.order }); } catch (e) { } }
        subscribe(code, g.me); g.rejoined = 1;
        return g;
      }
      const P = newPlayer(g, prof, name || PROF[prof].title);
      P.color = COLORS[others.size % COLORS.length];
      // the game is already running → the room admin must let a new player in (user 2026-11-12: «тоглолтын дундаас … заавал админ зөвшөөрдөг»)
      if (room.started !== false && room.host) {
        busy = false;
        const ok = await askIn(code, P);
        busy = true;
        if (!ok) return null;
        others = await db.collection(`rooms/${code}/players`).get();
        const r2 = (await db.doc(`rooms/${code}`).get()).data() || room; room.order = r2.order; room.turn = r2.turn; room.kicked = r2.kicked; room.hostOut = r2.hostOut;
      }
      g.players.push(P); g.me = P.id; g.room = code; g.decks = {}; g.host = room.host || null; g.kicked = room.kicked || [];
      g.order = room.order || null; g.turn = room.turn || null; g.started = room.started !== false; g.hostOut = !!room.hostOut;   // rooms made before 2026-11-11 have no flag: already running
      others.docs.forEach(d => { const x = d.data(); if (x && x.state && !g.kicked.includes(x.pid)) g.players.push(x.state); (x.ev || []).forEach(e => seen.add(e.id)); });
      await myDoc(code, P.id).set({ pid: P.id, name: P.name, at: Date.now(), state: slim(P), ev: [] });
      try {   // join the turn order (user 2026-11-09: «Хэний ээлж вэ»); rooms opened before this get an order from the players already there
        const order = (g.order && g.order.length ? g.order : others.docs.map(d => (d.data() || {}).pid).filter(Boolean)).filter(x => !g.kicked.includes(x) && !(g.hostOut && x === g.host));
        if (!order.includes(P.id)) order.push(P.id);
        g.order = order; g.turn = g.turn && order.includes(g.turn) ? g.turn : order[0];
        await db.doc(`rooms/${code}`).update({ order, turn: g.turn });
      } catch (e) { }
      log(g, P, 'Өрөөнд нэгдлээ', 0, null, 'start');
      subscribe(code, P.id);
      return g;
    } catch (e) { UI.join.err = errMsg(e, 'Нэгдэж чадсангүй: '); return null; } finally { busy = false; }
  }
  async function join(code, pid) {
    if (!await init()) { st = 'Офлайн'; return; }
    subscribe(code, pid);
  }
  function subscribe(code, pid) {
    if (unsub) unsub();
    setTimeout(() => watchReqs(code), 0);
    joinedAt = Date.now() - 1000;
    st = 'Холбогдож байна…';
    if (roomUnsub) roomUnsub();
    roomUnsub = null;
    try { const rref = db.doc(`rooms/${code}`); if (typeof rref.onSnapshot === 'function') roomUnsub = rref.onSnapshot(s => {   // host and kicked list (user 2026-11-07)
      if (!G || G.room !== code) return;
      const r = s.exists ? s.data() : {};
      if (r.host) G.host = r.host;
      G.kicked = r.kicked || [];
      if (r.order) G.order = r.order;
      G.hostOut = !!r.hostOut;   // the admin may stay out of the turns (user 2026-11-11)
      if (r.started === true && !G.started) { G.started = true; store.set('of2.g.' + G.id, G); if (UI.view === 'lobby') { UI.view = 'game'; UI.tab = 'board'; toast('Админ тоглоомыг эхлүүллээ'); try { buzz(60); } catch (e) { } render(); window.scrollTo(0, 0); } }
      if (r.turn && r.turn !== G.turn) { const was = G.turn; G.turn = r.turn; store.set('of2.g.' + G.id, G);
        if (was && r.turn === G.me) { const P0 = G.players.find(p => p.id === G.me); if (P0 && P0.skip > 0) toast('Ээлж өнжинө'); else { toast('Таны ээлж'); try { buzz(60); } catch (e) { } } if (typeof onMyTurn8 === 'function') onMyTurn8(); }
        if (!UI.sheetFn) render(); }
      if (G.kicked.includes(G.me)) return kickedOut();
      // self-heal (2026-11-12, «Amyus-ын ээлжээ дуусгах гарч ирэхгүй»): two phones joining at once could overwrite each other's order and leave one out of the turns for good
      { const P0 = G.players.find(p => p.id === G.me);
        if (r.order && P0 && !P0.out && !P0.won && !r.order.includes(G.me) && !(r.hostOut && G.me === r.host) && !healT) {
          healT = setTimeout(async () => { healT = 0; try { const cur = (await db.doc(`rooms/${code}`).get()).data() || {}; const o = (cur.order || []).slice();
            if (!o.includes(G.me) && !(cur.hostOut && G.me === cur.host) && !(cur.kicked || []).includes(G.me)) { o.push(G.me); await db.doc(`rooms/${code}`).update({ order: o, turn: cur.turn && o.includes(cur.turn) ? cur.turn : o[0] }); } } catch (e) { } }, 600 + Math.random() * 900); } }
      // the turn sits on someone who is no longer in the room → the admin moves it on
      if (r.turn && G.host === G.me && r.order && !G.players.some(p => p.id === r.turn) && !healT) { healT = setTimeout(async () => { healT = 0; try { await passTurn(true); } catch (e) { } }, 1200); }
      const n0 = G.players.length; G.players = G.players.filter(p => !G.kicked.includes(p.id));
      if (G.players.length !== n0) { store.set('of2.g.' + G.id, G); if (!UI.sheetFn) render(); }
    }, () => {}); } catch (e) { roomUnsub = null; }   // never let this stop the players subscription below
    unsub = db.collection(`rooms/${code}/players`).onSnapshot(snap => {
      if (!G || G.room !== code) return;
      st = `Холбогдсон · ${snap.size} тоглогч`;
      let changed = false;
      snap.docs.forEach(d => {
        const x = d.data(); if (!x || !x.state || x.pid === G.me || (G.kicked || []).includes(x.pid)) return;
        const i = G.players.findIndex(p => p.id === x.pid);
        if (i < 0) { G.players.push(x.state); changed = true; log(G, null, `${x.name} нэгдлээ`, 0, null, 'join'); if (Date.now() - joinedAt > 3000) setTimeout(() => notify(x.pid, x.name, 'Тоглоомд нэгдлээ', 'join'), 0); }
        else if (JSON.stringify(G.players[i]) !== JSON.stringify(x.state)) { G.players[i] = x.state; changed = true; }
        for (const e of (x.ev || []).slice().reverse()) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (e.at < joinedAt - 120000) continue;   // old news from before we arrived
          handle(e, x.name); changed = true;
        }
      });
      if (changed) { store.set('of2.g.' + G.id, G); if (!UI.sheetFn) render(); else if (UI.tab === 'players') { } }
      flush();
    }, err => { st = 'Холболт тасарлаа'; if (!UI.sheetFn) render(); });
  }
  function handle(e, name) {
    if (typeof l1Handle === 'function' && l1Handle(e, name)) return;
    if (e.t === 'price') { Object.assign(G.prices, e.set || {}); return; }
    const txt = e.txt || (e.card ? CARD[e.card].title : '');
    G.log.unshift({ id: e.id, at: e.at, pid: e.by, who: name, txt, amt: 0, card: e.card || null, kind: 'remote' });
    if (e.t === 'xfer') { if (e.to === G.me) { const P = me(); gain(G, P, e.amt, `${e.txt || 'Шилжүүлэг'} ← ${name}`, null, 'gain'); notify(e.by, name, `Танд ${fmtS(e.amt)} шилжүүллээ`, 'xfer'); } return; }
    if (e.t === 'plend') { if (e.to === G.me) personalLend(G, me(), e, name); return; }
    if (e.t === 'pborrow') { if (e.to === G.me) { personalBorrow(G, me(), e, name); notify(e.by, name, `${fmtS(e.amt)} зээллээ`, 'pborrow'); } return; }
    if (e.t === 'prepay') { if (e.to === G.me) personalRepaid(G, me(), e, name); return; }
    if (e.t === 'cardsale') { UI.sales[e.sale] = { card: e.card, ask: e.ask || 0, from: e.by, name }; notify(e.by, name, `Карт зарж байна: ${CARD[e.card].title}${e.ask ? ' · ' + fmtS(e.ask) : ''}`, 'cardsale', () => ACT.saleSee({ id: e.sale })); if (!UI.sheetFn) ACT.saleSee({ id: e.sale }); return; }
    if (e.t === 'cardclose') { const x = UI.sales[e.sale]; if (x) { x.closed = `${name} саналаа цуцаллаа`; if (x.sent != null || (UI.sheetFn === fSaleIn && FS.saleIn === e.sale)) notify(e.by, name, 'Саналаа цуцаллаа', 'cardx'); } if (UI.sheetFn === fSaleIn && FS.saleIn === e.sale) drawSheet(); return; }
    if (e.t === 'cardbid') { const s = UI.mySale; if (e.to === G.me && s && s.id === e.sale) { s.bids.push({ by: e.by, name, amt: e.amt }); notify(e.by, name, `${fmtS(e.amt)} санал тавилаа`, 'cardsale'); if (UI.sheetFn === fSale) drawSheet(); } return; }
    if (e.t === 'cardno') { if (e.to === G.me) { const x = UI.sales[e.sale]; if (x) x.sent = null; notify(e.by, name, 'Таны саналаас татгалзлаа', 'cardx'); if (UI.sheetFn === fSaleIn) drawSheet(); } return; }
    if (e.t === 'cardok') { const x = UI.sales[e.sale];
      if (x && e.to !== G.me) x.closed = `${name} картаа өөр тоглогчид зарлаа`; else delete UI.sales[e.sale];
      if (e.to === G.me) { notify(e.by, name, `Зөвшөөрлөө · ${fmtS(e.amt)}`, 'cardsale'); startCard(e.card, { offerFrom: e.by, offerAmt: e.amt, offerLock: true }); }
      else if (UI.sheetFn === fSaleIn && FS.saleIn === e.sale) drawSheet();
      return; }
    if (e.t === 'card' && e.card) { if (e.set) Object.assign(G.prices, e.set); queue.push({ card: e.card, from: name, set: e.set || null, roll: e.roll || null, by: e.by }); notify(e.by, name, `${CARD[e.card].deck === 'ZZ' ? 'Зах зээл' : 'Карт'}: ${CARD[e.card].title}`, 'card'); }
    else if (e.t === 'win') { G.over = { winner: e.by, why: txt }; notify(e.by, name, txt, 'win'); }
    else notify(e.by, name, txt, e.t);
  }
  function flush() {
    if (!queue.length || UI.sheetFn || !G) return;
    const q = queue.shift();
    const c = CARD[q.card];
    if (typeof l1Incoming === 'function' && l1Incoming(q)) return;
    if (c.fx.k === 'market') { FS = { card: q.card, incoming: true, from: q.from }; if (q.set) { Object.assign(G.prices, q.set); FS.done = { price: true }; } openSheet(fMarket); }
    else if (c.fx.k === 'risk' && me().level === 2) { FS = { card: q.card, incoming: true, from: q.from, step: 'risk' }; openSheet(fRisk); }
    else flush();
  }
  const emitted = [];
  function emit(e) {
    if (!G || G.mode !== 'online') return;
    const ev = Object.assign({ id: uid('e'), at: Date.now(), by: G.me }, e);
    seen.add(ev.id);
    emitted.unshift(ev); if (emitted.length > 30) emitted.length = 30;
    push(true);
  }
  function push(now) {
    if (!db || !G || G.mode !== 'online') return;
    clearTimeout(pushT);
    pushT = setTimeout(async () => {
      const P = G.players.find(p => p.id === G.me); if (!P || (G.kicked || []).includes(G.me)) return;
      try { await myDoc(G.room, G.me).set({ pid: P.id, name: P.name, at: Date.now(), state: slim(P), ev: emitted }); st = 'Холбогдсон'; }
      catch (err) { st = err.code === 'invalid_argument' ? 'Бичих эрхгүй — хуудсыг Contributor эрхтэй хуваалцуулна уу' : 'Хадгалж чадсангүй'; }
    }, now ? 50 : 400);
  }
  function leave() { if (unsub) unsub(); if (roomUnsub) roomUnsub(); if (reqUn) { try { reqUn(); } catch (e) { } } unsub = null; roomUnsub = null; reqUn = null; queue = []; }
  function kickedOut() { const id = G && G.id; leave(); if (id) { try { deleteGame(id); } catch (e) { } } ACT.home(); setTimeout(() => toast('Өрөөний эзэн таныг тоглоомоос хаслаа'), 300); }
  async function kick(pid) {   // only the room's host (user 2026-11-07)
    if (!db || !G || G.mode !== 'online' || G.host !== G.me || pid === G.me) return false;
    const kicked = [...new Set([...(G.kicked || []), pid])];
    try { await db.doc(`rooms/${G.room}`).update({ kicked, host: G.host }); }
    catch (e) { toast(errMsg(e, 'Хасаж чадсангүй: ')); return false; }
    try { await myDoc(G.room, pid).delete(); } catch (e) { }
    G.kicked = kicked; G.players = G.players.filter(p => p.id !== pid); store.set('of2.g.' + G.id, G);
    if (G.turn === pid) await passTurn(true);
    return true;
  }
  async function start() {   // the admin starts the game for everyone in the room (user 2026-11-11)
    if (!db || !G || G.mode !== 'online' || G.host !== G.me) return false;
    try { await db.doc(`rooms/${G.room}`).update({ started: true }); G.started = true; store.set('of2.g.' + G.id, G); return true; }
    catch (e) { toast(errMsg(e, 'Эхлүүлж чадсангүй: ')); return false; }
  }
  async function setOrder(order, hostOut) {   // the host decides the turn order (user 2026-11-09) and whether he takes turns himself (2026-11-11)
    if (!db || !G || G.mode !== 'online' || G.host !== G.me) return false;
    hostOut = hostOut === undefined ? !!G.hostOut : !!hostOut;
    if (hostOut) order = order.filter(id => id !== G.host); else if (!order.includes(G.host)) order = [G.host].concat(order);
    if (!order.length && G.started !== false) { toast('Ээлжинд дор хаяж 1 тоглогч байх ёстой'); return false; }   // before the start an admin-only room may have nobody in the turns yet
    const turn = G.turn && order.includes(G.turn) ? G.turn : (order[0] || null);
    try { await db.doc(`rooms/${G.room}`).update({ order, turn, hostOut }); G.order = order; G.turn = turn; G.hostOut = hostOut; store.set('of2.g.' + G.id, G); return true; }
    catch (e) { toast(errMsg(e, 'Дараалал хадгалж чадсангүй: ')); return false; }
  }
  function nextInOrder() {
    const live = (G.order || []).filter(id => G.players.some(p => p.id === id && !p.out && (!p.won || id === G.turn)) && !(G.kicked || []).includes(id));
    if (!live.length) return null;
    const i = live.indexOf(G.turn);
    return live[(i + 1) % live.length];
  }
  async function passTurn(force) {   // the player whose turn it is (or the host) hands it on
    if (!db || !G || G.mode !== 'online') return false;
    if (!force && G.turn !== G.me && G.host !== G.me) return false;
    const next = nextInOrder(); if (!next) return false;
    try { await db.doc(`rooms/${G.room}`).update({ turn: next }); G.turn = next; store.set('of2.g.' + G.id, G); return true; }
    catch (e) { toast(errMsg(e, 'Ээлж шилжүүлж чадсангүй: ')); return false; }
  }
  // check pending incoming cards whenever a sheet closes
  const _close = closeSheet;
  closeSheet = function () { _close(); setTimeout(flush, 200); };
  return { create, joinRoom, join, answerReq, emit, push, leave, kick, passTurn, nextInOrder, setOrder, start, isHost: () => !!(G && G.mode === 'online' && G.host === G.me), status: () => st, init, _handle: (e, name) => { handle(e, name); flush(); } };
})();
/* boot */
(function () {
  const last = store.get('of2.last', null);
  const l = listGames().find(x => x.id === last);
  if (l && Date.now() - l.at < 12 * 3600e3) loadGame(last);
  render();
  warmImgs();
  NET.init();
  setInterval(() => { if (G && G.settings.shortGame && UI.view === 'game' && UI.tab === 'board' && !UI.sheetFn) render(); }, 30000);
})();

