/* ═══════════════════════════════════════════════════════
   KQ SOLICITORS — RELATIONSHIP EVIDENCE CHECKER
   script.js — V1 Updated
   22 questions, checkbox scoring, risk split display,
   progressive disclosure, clean hands skip logic
═══════════════════════════════════════════════════════ */

/* ─── STATE ─────────────────────────────────────────── */
let currentStep = 0;
let path = 'A';
let deportationFlag = false;
let subsidingMode = false;
let saveTimer = null;
let sessionTimer = null;
let answers = {};

/* ─── CONSTANTS ─────────────────────────────────────── */
const TOTAL_STEPS = 6;
const SESSION_TIMEOUT_MS = 20 * 60 * 1000;
const SAVE_KEY = 'kq_checker_v2';

/* ─── HARD STOP MESSAGES ────────────────────────────── */
const HARD_STOPS = {
  not_met: {
    title: 'In-Person Meeting Required',
    message: 'UK spouse and partner visa applications require that you and your partner have physically met in person before applying. Video calls and online communication do not satisfy this requirement. If your marriage took place by proxy and you have never physically met your partner, this requirement is not met even if the proxy marriage was legally valid overseas.'
  },
  under_18: {
    title: 'Age Requirement Not Met',
    message: 'Both people must be 18 or over on the date of application to apply as a partner under the UK Immigration Rules. If you or your partner are under 18, you may need different immigration advice. Please contact KQ Solicitors to discuss your options.'
  },
  existing_marriage: {
    title: 'Existing Marriage or Civil Partnership',
    message: 'Both people must be free to marry before this application can proceed. If either of you is currently in a marriage or civil partnership that has not been formally ended, this is a legal barrier to the application.'
  },
  not_dissolved: {
    title: 'Dissolution Document Required',
    message: 'Where a previous marriage or civil partnership exists, official evidence that it has ended is required. This means a decree absolute (before April 2022), a final order (April 2022 or after), a dissolution order, or a death certificate. Without this document the application cannot proceed.'
  },
  related: {
    title: 'Close Family Relationship',
    message: 'UK law does not permit marriage or civil partnership between close relatives. This includes parent and child, siblings including half-siblings, grandparent and grandchild, aunt or uncle and nephew or niece, and adoptive parent and child. This application cannot proceed under these rules.'
  },

  deception: {
    title: 'Previous Refusal Involving Dishonesty',
    message: 'A previous visa refusal involving dishonesty, deception, or false representations is a very serious matter under the UK Immigration Rules. This can result in a lengthy ban from re-applying and significantly affects all future applications. We strongly recommend consulting an immigration solicitor before taking any further steps.'
  }
};

/* ─── INIT ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  loadFromStorage();
  resetSessionTimer();
  document.addEventListener('click', resetSessionTimer);
  document.addEventListener('keypress', resetSessionTimer);
});

/* ─── START ─────────────────────────────────────────── */
function startTool() {
  showScreen('step1');
  currentStep = 1;
  updateProgress(1);
  showProgress(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── SCREEN MANAGEMENT ─────────────────────────────── */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── PROGRESS ──────────────────────────────────────── */
function showProgress(visible) {
  const wrap = document.getElementById('progressWrap');
  wrap.classList[visible ? 'add' : 'remove']('visible');
}

function updateProgress(step) {
  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  const steps = document.querySelectorAll('.progress-step');
  const pct = ((step - 1) / TOTAL_STEPS) * 100;
  fill.style.width = pct + '%';
  label.textContent = 'Step ' + step + ' of ' + TOTAL_STEPS;
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 === step) s.classList.add('active');
    if (i + 1 < step) s.classList.add('done');
  });
}

/* ─── NAVIGATION ────────────────────────────────────── */
function goNext(step) {
  collectAnswers(step);

  // Hard stop checks step 1
  if (step === 1) {
    const stop = checkHardStopsStep1();
    if (stop) { triggerHardStop(stop); return; }
  }

  // Deception check step 5
  if (step === 5) {
    if (answers.q5_refusal === 'deception') {
      triggerHardStop('deception');
      return;
    }
  }

  const next = step + 1;
  currentStep = next;

  if (next <= TOTAL_STEPS) {
    showScreen('step' + next);
    updateProgress(next);
    if (next === TOTAL_STEPS) buildReviewScreen();
  }

  saveToStorage();
}

function goBack() {
  if (currentStep <= 1) return;
  currentStep--;
  showScreen('step' + currentStep);
  updateProgress(currentStep);
}

function goToStep(step) {
  currentStep = step;
  showScreen('step' + step);
  updateProgress(step);
}

function goToLeadCapture() {
  collectAnswers(6);
  showScreen('lead');
  showProgress(false);
}

function restartTool() {
  answers = {};
  currentStep = 0;
  path = 'A';
  deportationFlag = false;
  subsidingMode = false;
  clearStorage();
  document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
  document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  document.getElementById('q2-apart-wrap').hidden = true;
  document.getElementById('samesex-note').hidden = true;
  document.getElementById('prev-visa-note').hidden = true;
  document.getElementById('deportation-flag').hidden = true;
  document.getElementById('conviction-note').hidden = true;
  document.getElementById('path-a-questions').hidden = false;
  document.getElementById('path-b-questions').hidden = true;
  updateNextButtons();
  showScreen('intro');
  showProgress(false);
}

/* ─── COLLECT ANSWERS ───────────────────────────────── */
function collectAnswers(step) {
  const form = document.getElementById('screen-step' + step);
  if (!form) return;

  // Radios
  form.querySelectorAll('input[type="radio"]:checked').forEach(r => {
    answers[r.name] = r.value;
  });

  // Selects
  form.querySelectorAll('select').forEach(s => {
    if (s.value) answers[s.name] = s.value;
  });

  // Checkboxes — collect all checked values as array
  const checkboxGroups = {};
  form.querySelectorAll('input[type="checkbox"]').forEach(c => {
    if (!checkboxGroups[c.name]) checkboxGroups[c.name] = [];
    if (c.checked) checkboxGroups[c.name].push(c.value);
  });
  Object.keys(checkboxGroups).forEach(name => {
    if (checkboxGroups[name].length > 0) {
      answers[name] = checkboxGroups[name];
    }
  });
}

/* ─── CHECKBOX CHANGE ───────────────────────────────── */
function onCheckboxChange(groupName) {
  // If "none" is checked, uncheck all others
  const noneBox = document.querySelector('input[name="' + groupName + '"][value="none"]');
  const allBoxes = document.querySelectorAll('input[name="' + groupName + '"]');

  if (noneBox && noneBox.checked) {
    allBoxes.forEach(b => { if (b.value !== 'none') b.checked = false; });
  } else {
    // If any other box is checked, uncheck none
    if (noneBox) noneBox.checked = false;
  }

  onFieldChange();
}

/* ─── FIELD CHANGE ──────────────────────────────────── */
function onFieldChange() {
  updateNextButtons();
  scheduleSave();
}

function updateNextButtons() {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const btn = document.getElementById('next-step' + i);
    if (btn) btn.disabled = !isStepComplete(i);
  }
}

/* ─── STEP COMPLETION ───────────────────────────────── */
function isStepComplete(step) {
  switch (step) {
  case 1:
   return (
        getRadio('q1_met') &&
        getRadio('q1_age') &&
        getRadio('q1_prev_marriage') &&
        getRadio('q1_related')
      );
    case 2:
      const living = getRadio('q2_living');
      const needsReason = living === 'no';
      return (
        getRadio('q2_type') &&
        getSelect('q2_duration') &&
        living &&
        (!needsReason || getSelect('q2_apart_reason')) &&
        getRadio('q2_intent') &&
        getRadio('q2_children') &&
        getRadio('q2_samesex') &&
        getRadio('q2_prev_visa')
      );
    case 3:
      if (path === 'A') {
        return (
          hasCheckboxAnswer('q3a_docs') &&
          getSelect('q3a_duration') &&
          hasCheckboxAnswer('q3a_finance') &&
          getRadio('q3_cultural')
        );
      } else {
        return (
          getRadio('q3b_reason_doc') &&
          getSelect('q3b_prev_cohab') &&
          hasCheckboxAnswer('q3b_finance') &&
          getRadio('q3_cultural')
        );
      }
    case 4:
      return (
        hasCheckboxAnswer('q4_travel') &&
        getSelect('q4_photos') &&
        hasCheckboxAnswer('q4_comms') &&
        getSelect('q4_comms_freq')
      );
    case 5:
      return (
        getSelect('q5_overstay') &&
        getSelect('q5_refusal') &&
        getSelect('q5_deported') &&
        getRadio('q5_convictions')
      );
    default:
      return true;
  }
}

/* ─── HELPERS ───────────────────────────────────────── */
function getRadio(name) {
  const el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : null;
}

function getSelect(name) {
  const el = document.querySelector('select[name="' + name + '"]');
  return el && el.value ? el.value : null;
}

function hasCheckboxAnswer(name) {
  return document.querySelector('input[name="' + name + '"]:checked') !== null;
}

function getCheckboxValues(name) {
  const checked = document.querySelectorAll('input[name="' + name + '"]:checked');
  return Array.from(checked).map(c => c.value);
}

/* ─── PATH DETECTION ────────────────────────────────── */
function onPathDetect() {
  const val = getRadio('q2_living');
  const wrap = document.getElementById('q2-apart-wrap');

  if (val === 'no') {
    path = 'B';
    wrap.hidden = false;
    document.getElementById('path-a-questions').hidden = true;
    document.getElementById('path-b-questions').hidden = false;
  } else {
    path = 'A';
    wrap.hidden = true;
    document.getElementById('path-a-questions').hidden = false;
    document.getElementById('path-b-questions').hidden = true;
  }
  onFieldChange();
}

/* ─── SAME SEX CHECK ────────────────────────────────── */
function onSameSexCheck() {
  const val = getRadio('q2_samesex');
  document.getElementById('samesex-note').hidden = val !== 'yes';
  onFieldChange();
}

/* ─── PREVIOUS VISA CHECK ───────────────────────────── */
function onPrevVisaCheck() {
  const val = getRadio('q2_prev_visa');
  document.getElementById('prev-visa-note').hidden = val !== 'yes';
  subsidingMode = val === 'yes';
  onFieldChange();
}

/* ─── REFUSAL CHECK ─────────────────────────────────── */
function onRefusalCheck() {
  const val = getSelect('q5_refusal');
  if (val === 'deception') {
    collectAnswers(5);
    triggerHardStop('deception');
  }
  onFieldChange();
}

/* ─── DEPORTATION CHECK ─────────────────────────────── */
function onDeportationCheck() {
  const val = getSelect('q5_deported');
  deportationFlag = val === 'yes';
  document.getElementById('deportation-flag').hidden = !deportationFlag;
  onFieldChange();
}

/* ─── CONVICTION CHECK ──────────────────────────────── */
function onConvictionCheck() {
  document.getElementById('conviction-note').hidden = false;
  onFieldChange();
}

/* ─── HARD STOP CHECKS ──────────────────────────────── */
function checkHardStopsStep1() {
  if (getRadio('q1_met') === 'no')                    return 'not_met';
  if (getRadio('q1_age') === 'no')                    return 'under_18';
  if (getRadio('q1_prev_marriage') === 'yes_nodoc')   return 'not_dissolved';
  if (getRadio('q1_related') === 'yes')               return 'related';
  return null;
}

function triggerHardStop(key) {
  const stop = HARD_STOPS[key];
  if (!stop) return;
  document.getElementById('hardstopTitle').textContent = stop.title;
  document.getElementById('hardstopMessage').textContent = stop.message;
  showScreen('hardstop');
  showProgress(false);
}

/* ─── SCORING ENGINE ────────────────────────────────── */
function calculateScore() {
  let score = 0;
  const breakdown = {};

  // ── CATEGORY A — Relationship Genuineness (25 pts) ──
  let catA = 0;
  catA += 10; // Met in person — always yes at this point

  const dur = answers.q2_duration;
  if (dur === '2plus')  catA += 10;
  if (dur === '1to2')   catA += 7;
  if (dur === '6to12')  catA += 5;
  if (dur === 'under6') catA += 2;

  if (answers.q2_intent === 'yes') catA += 5;

  breakdown.catA = Math.min(catA, 25);

  // ── CATEGORY B — Cohabitation or Long Distance (25 pts) ──
  let catB = 0;

  if (path === 'A') {
    // Duration
    const cohDur = answers.q3a_duration;
    if (cohDur === '2plus')  catB += 15;
    if (cohDur === '1to2')   catB += 10;
    if (cohDur === '6to12')  catB += 7;
    if (cohDur === 'under6') catB += 3;

    // Documents — checkbox scoring
    const docs = getStoredCheckbox('q3a_docs');
    const hasNone = docs.includes('none');
    if (!hasNone) {
      if (docs.includes('tenancy'))        catB += 4;
      if (docs.includes('council_tax'))    catB += 2;
      if (docs.includes('utility'))        catB += 2;
      if (docs.includes('official_letters')) catB += 2;
    }
    catB = Math.min(catB, 25);

  } else {
    // Path B
    const reason = answers.q2_apart_reason;
    if (reason === 'work_study' || reason === 'cultural') catB += 10;
    if (reason === 'family_care')  catB += 8;
    if (reason === 'immigration' || reason === 'other') catB += 5;

    // Previous cohabitation
    const prevCohab = answers.q3b_prev_cohab;
    if (prevCohab === 'yes_long')  catB += 5;
    if (prevCohab === 'yes_short') catB += 3;

    // Travel evidence for path B
    const travel = getStoredCheckbox('q4_travel');
    if (!travel.includes('none')) {
      if (travel.includes('tickets')) catB += 5;
      if (travel.includes('bookings')) catB += 3;
      if (travel.includes('stamps'))  catB += 2;
    }

    catB = Math.min(catB, 25);
  }

  breakdown.catB = catB;

  // ── CATEGORY C — Shared Financial (15 pts) ──
  let catC = 0;

  if (path === 'A') {
    const finance = getStoredCheckbox('q3a_finance');
    if (!finance.includes('none')) {
      if (finance.includes('joint_account'))  catC += 8;
      if (finance.includes('bank_statements')) catC += 5;
      if (finance.includes('shared_bills'))   catC += 4;
    }
  } else {
    const finance = getStoredCheckbox('q3b_finance');
    if (!finance.includes('none')) {
      if (finance.includes('transfers'))          catC += 8;
      if (finance.includes('joint_account'))      catC += 5;
      if (finance.includes('shared_commitments')) catC += 4;
    }
  }

  breakdown.catC = Math.min(catC, 15);

  // ── CATEGORY D — Immigration Compliance (25 pts) ──
  let catD = 0;

  const overstay = answers.q5_overstay;
  if (overstay === 'no')            catD += 15;
  if (overstay === 'yes_reason')    catD += 8;
  if (overstay === 'yes_no_reason') catD += 0;

  const refusal = answers.q5_refusal;
  if (refusal === 'no')       catD += 10;
  if (refusal === 'standard') catD += 5;

  breakdown.catD = Math.min(catD, 25);

  // ── CATEGORY E — Supporting Evidence (10 pts) ──
  let catE = 0;

  // Photos
  const photos = answers.q4_photos;
  if (photos === 'dated')   catE += 4;
  if (photos === 'undated') catE += 2;

  // Communication
  const comms = getStoredCheckbox('q4_comms');
  if (!comms.includes('none')) {
    if (comms.includes('transcripts')) catE += 3;
    if (comms.includes('call_logs'))   catE += 2;
    if (comms.includes('letters'))     catE += 1;
  }

  // Travel for Path A
  if (path === 'A') {
    const travel = getStoredCheckbox('q4_travel');
    if (!travel.includes('none')) {
      if (travel.includes('tickets')) catE += 2;
    }
  }

  // Children with birth cert
  if (answers.q2_children === 'yes_cert') catE += 2;

  breakdown.catE = Math.min(catE, 10);

  // ── TOTAL ──
  score = breakdown.catA + breakdown.catB + breakdown.catC + breakdown.catD + breakdown.catE;

  // ── LONG DISTANCE ADJUSTMENT ──
  if (path === 'B') {
    const hasReason = answers.q2_apart_reason && answers.q2_apart_reason !== '';
    const travel = getStoredCheckbox('q4_travel');
    const strongTravel = travel.includes('tickets') && !travel.includes('none');
    const finance = getStoredCheckbox('q3b_finance');
    const hasFinancial = finance.includes('transfers') && !finance.includes('none');
    if (hasReason && strongTravel && hasFinancial) {
      score = Math.min(score + 10, 100);
    }
  }

  // ── DEPORTATION CAP ──
  if (deportationFlag) {
    score = Math.min(score, 39);
  }

  // ── EVIDENCE vs COMPLIANCE SPLIT ──
  const evidenceScore = breakdown.catA + breakdown.catB + breakdown.catC + breakdown.catE;
  const evidenceMax = 75;
  const evidencePct = Math.round((evidenceScore / evidenceMax) * 100);

  const complianceScore = breakdown.catD;
  const complianceMax = 25;
  const compliancePct = Math.round((complianceScore / complianceMax) * 100);

  breakdown.evidencePct = evidencePct;
  breakdown.compliancePct = compliancePct;

  return { score, breakdown };
}

/* ─── HELPER — get checkbox values from answers or DOM ─ */
function getStoredCheckbox(name) {
  // Try answers object first
  if (answers[name] && Array.isArray(answers[name])) return answers[name];
  // Fall back to DOM
  return getCheckboxValues(name);
}

/* ─── THRESHOLD ─────────────────────────────────────── */
function getThreshold(score) {
  if (score >= 85) return { label: '🟢 Strong Evidence',   cls: 'green',  text: 'Your relationship evidence appears strong.' };
  if (score >= 60) return { label: '🟡 Moderate Evidence', cls: 'amber',  text: 'Acceptable but can be strengthened before applying.' };
  if (score >= 40) return { label: '🟠 Weak Evidence',     cls: 'orange', text: 'Significant gaps identified. A caseworker may request further evidence.' };
  return              { label: '🔴 High Risk',             cls: 'red',    text: 'Serious gaps in evidence. Professional advice strongly recommended.' };
}

function getComplianceLabel(pct) {
  if (pct >= 80) return { label: 'Clear', cls: 'green' };
  if (pct >= 50) return { label: 'Some Issues', cls: 'amber' };
  return { label: 'High Risk', cls: 'red' };
}

/* ─── BUILD REVIEW SCREEN ───────────────────────────── */
function buildReviewScreen() {
  collectAnswers(5);
  const list = document.getElementById('reviewList');
  list.innerHTML = '';

  const sections = [
    {
      title: 'Quick Check',
      items: [
        { q: 'Met in person?', a: answers.q1_met },
        { q: 'Both aged 18 or over?', a: answers.q1_age },
        { q: 'Previously married or in civil partnership?', a: answers.q1_prev_marriage },
        { q: 'Closely related?', a: answers.q1_related }
      ],
      step: 1
    },
    {
      title: 'Relationship Basics',
      items: [
        { q: 'Relationship type', a: answers.q2_type },
        { q: 'How long together', a: answers.q2_duration },
        { q: 'Living together?', a: answers.q2_living },
        { q: 'Reason for living apart', a: answers.q2_apart_reason },
        { q: 'Plan to live together in UK?', a: answers.q2_intent },
        { q: 'Children together?', a: answers.q2_children },
        { q: 'Same-sex relationship?', a: answers.q2_samesex },
        { q: 'Previous partner visa?', a: answers.q2_prev_visa }
      ],
      step: 2
    },
    {
      title: 'Your Situation',
      items: path === 'A' ? [
        { q: 'Address documents', a: answers.q3a_docs ? answers.q3a_docs.join(', ') : null },
        { q: 'Time at shared address', a: answers.q3a_duration },
        { q: 'Financial evidence', a: answers.q3a_finance ? answers.q3a_finance.join(', ') : null },
        { q: 'Cultural documentation applies?', a: answers.q3_cultural }
      ] : [
        { q: 'Document proving separation', a: answers.q3b_reason_doc },
        { q: 'Previously lived together?', a: answers.q3b_prev_cohab },
        { q: 'Financial support evidence', a: answers.q3b_finance ? answers.q3b_finance.join(', ') : null },
        { q: 'Cultural documentation applies?', a: answers.q3_cultural }
      ],
      step: 3
    },
    {
      title: 'Evidence Check',
      items: [
        { q: 'Travel evidence', a: answers.q4_travel ? answers.q4_travel.join(', ') : null },
        { q: 'Photographs', a: answers.q4_photos },
        { q: 'Communication evidence', a: answers.q4_comms ? answers.q4_comms.join(', ') : null },
        { q: 'Communication frequency', a: answers.q4_comms_freq }
      ],
      step: 4
    },
    {
      title: 'Immigration History',
      items: [
        { q: 'Overstay history', a: answers.q5_overstay },
        { q: 'Previous refusal', a: answers.q5_refusal },
        { q: 'Deportation or removal', a: answers.q5_deported },
        { q: 'Criminal convictions', a: answers.q5_convictions }
      ],
      step: 5
    }
  ];

  sections.forEach(section => {
    const secDiv = document.createElement('div');
    secDiv.className = 'review-section';

    const title = document.createElement('div');
    title.className = 'review-section-title';
    title.textContent = section.title;
    secDiv.appendChild(title);

    section.items.forEach(item => {
      if (!item.a) return;
      const row = document.createElement('div');
      row.className = 'review-item';

      const q = document.createElement('div');
      q.className = 'review-question';
      q.textContent = item.q;

      const a = document.createElement('div');
      a.className = 'review-answer';
      a.textContent = formatAnswer(item.a);

      const edit = document.createElement('button');
      edit.className = 'review-edit';
      edit.textContent = 'Edit';
      edit.onclick = () => goToStep(section.step);

      row.appendChild(q);
      row.appendChild(a);
      row.appendChild(edit);
      secDiv.appendChild(row);
    });

    list.appendChild(secDiv);
  });
}

function formatAnswer(val) {
  if (Array.isArray(val)) {
    return val.map(v => formatAnswer(v)).join(', ');
  }
  const map = {
    yes: 'Yes', no: 'No', na: 'Not applicable',
    prefer_not: 'Prefer not to say',
    married: 'Married', civil: 'Civil partnership',
    unmarried_2plus: 'Unmarried — 2+ years',
    unmarried_less2: 'Unmarried — under 2 years',
    under6: 'Under 6 months', '6to12': '6–12 months',
    '1to2': '1–2 years', '2plus': '2+ years',
    yes_cert: 'Yes — with birth certificates',
    yes_nocert: 'Yes — without certificates',
    work_study: 'Work or study', cultural: 'Cultural/religious',
    family_care: 'Family care', immigration: 'Immigration reasons',
    other: 'Other',
    yes_long: 'Yes — over 1 year', yes_short: 'Yes — under 1 year',
    tenancy: 'Tenancy/mortgage', council_tax: 'Council tax',
    utility: 'Utility bills', official_letters: 'Official letters',
    none: 'None', joint_account: 'Joint account',
    bank_statements: 'Bank statements', shared_bills: 'Shared bills',
    transfers: 'Money transfers', shared_commitments: 'Shared commitments',
    tickets: 'Flight/train tickets', bookings: 'Holiday bookings',
    stamps: 'Passport stamps', call_logs: 'Call logs',
    transcripts: 'Certified transcripts', letters: 'Support letters',
    dated: 'Yes — dated', undated: 'Yes — undated',
    daily: 'Daily', weekly: 'Several times a week',
    monthly: 'Weekly or less', rarely: 'Rarely',
    standard: 'Yes — standard refusal',
    deception: 'Yes — involving dishonesty',
    yes_reason: 'Yes — with documented reason',
    yes_no_reason: 'Yes — no documented reason'
  };
  return map[val] || val;
}

/* ─── LEAD CAPTURE ──────────────────────────────────── */
function submitLead() {
  const name = document.getElementById('lead_name').value.trim();
  const email = document.getElementById('lead_email').value.trim();
  if (name) answers.lead_name = name;
  if (email) answers.lead_email = email;
  saveToStorage();
  showResults();
}

function skipLead() {
  showResults();
}

/* ─── SHOW RESULTS ──────────────────────────────────── */
function showResults() {
  collectAnswers(5);
  const { score, breakdown } = calculateScore();
  const threshold = getThreshold(score);

  // Overall score
  document.getElementById('scoreNumber').innerHTML = score + '<span>/100</span>';

  // Score bar animate
  const fill = document.getElementById('scoreBarFill');
  fill.className = 'score-bar-fill score-bar-fill--' + threshold.cls;
  setTimeout(() => { fill.style.width = score + '%'; }, 150);

  // Status
  const status = document.getElementById('scoreStatus');
  status.textContent = threshold.label;
  status.className = 'score-status score-status--' + threshold.cls;

  // Risk vs Evidence split
  buildRiskSplit(breakdown);

  // Categories
  buildCategoryBreakdown(breakdown);

  // Improvements
  buildImprovements(breakdown, score);

  // Docs
  buildDocsList(breakdown);

  // Guidance
  buildGuidance(score);

  // Interview note
  document.getElementById('interviewNote').hidden = score >= 85;

  showScreen('results');
  showProgress(false);
}

/* ─── RISK SPLIT ────────────────────────────────────── */
function buildRiskSplit(breakdown) {
  const evidenceFill = document.getElementById('evidenceBarFill');
  const evidenceStatus = document.getElementById('evidenceStatus');
  const complianceFill = document.getElementById('complianceBarFill');
  const complianceStatus = document.getElementById('complianceStatus');

  const evPct = breakdown.evidencePct || 0;
  const evCls = evPct >= 80 ? 'green' : evPct >= 60 ? 'amber' : evPct >= 40 ? 'orange' : 'red';
  const evLabel = evPct >= 80 ? '🟢 Strong' : evPct >= 60 ? '🟡 Moderate' : evPct >= 40 ? '🟠 Weak' : '🔴 Low';

  const compPct = breakdown.compliancePct || 0;
  const compCls = compPct >= 80 ? 'green' : compPct >= 60 ? 'amber' : 'red';
  const compLabel = compPct >= 80 ? '🟢 Clear' : compPct >= 60 ? '🟡 Some Issues' : '🔴 High Risk';

  evidenceFill.className = 'risk-bar-fill score-bar-fill--' + evCls;
  setTimeout(() => { evidenceFill.style.width = evPct + '%'; }, 200);
  evidenceStatus.textContent = evLabel;
  evidenceStatus.style.color = evCls === 'green' ? '#2e7d32' : evCls === 'amber' ? '#ed6c02' : evCls === 'orange' ? '#f57c00' : '#d32f2f';

  complianceFill.className = 'risk-bar-fill score-bar-fill--' + compCls;
  setTimeout(() => { complianceFill.style.width = compPct + '%'; }, 300);
  complianceStatus.textContent = compLabel;
  complianceStatus.style.color = compCls === 'green' ? '#2e7d32' : compCls === 'amber' ? '#ed6c02' : '#d32f2f';
}

/* ─── CATEGORY BREAKDOWN ────────────────────────────── */
function buildCategoryBreakdown(breakdown) {
  const categories = [
    { name: 'Relationship Genuineness', score: breakdown.catA, max: 25 },
    { name: path === 'A' ? 'Cohabitation Evidence' : 'Long Distance Evidence', score: breakdown.catB, max: 25 },
    { name: 'Shared Financial Evidence', score: breakdown.catC, max: 15 },
    { name: 'Immigration Compliance', score: breakdown.catD, max: 25 },
    { name: 'Supporting Evidence', score: breakdown.catE, max: 10 }
  ];

  const list = document.getElementById('categoryList');
  list.innerHTML = '';

  categories.forEach(cat => {
    const pct = Math.round((cat.score / cat.max) * 100);
    const cls = pct >= 80 ? 'green' : pct >= 60 ? 'amber' : pct >= 40 ? 'orange' : 'red';
    const label = pct >= 80 ? 'Strong' : pct >= 60 ? 'Moderate' : pct >= 40 ? 'Weak' : 'Low';

    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <span class="category-name">${cat.name}</span>
      <div class="category-score-wrap">
        <div class="category-mini-bar">
          <div class="category-mini-fill category-mini-fill--${cls}" style="width:${pct}%"></div>
        </div>
        <span class="category-badge category-badge--${cls}">${label}</span>
      </div>
    `;
    list.appendChild(item);
  });
}

/* ─── IMPROVEMENTS ──────────────────────────────────── */
function buildImprovements(breakdown, score) {
  const list = document.getElementById('improvementsList');
  list.innerHTML = '';
  const items = [];

  if (breakdown.catA < 20) {
    items.push('Strengthen evidence of how your relationship started and developed over time');
  }
  if (breakdown.catB < 15) {
    if (path === 'A') {
      items.push('Gather more official documents showing both names at the same address — utility bills, council tax, bank statements');
    } else {
      items.push('Obtain a document explaining why you are living apart — employment contract, university letter, or medical certificate');
    }
  }
  if (breakdown.catC < 8) {
    items.push('Provide financial evidence linking you as a couple — joint bank account, money transfers, or shared financial commitments');
  }
  if (breakdown.catD < 20) {
    items.push('Address any immigration history issues with supporting documentation and a clear written explanation');
  }
  if (breakdown.catE < 5) {
    items.push('Add dated photographs from different periods of your relationship');
    items.push('Gather communication records covering periods you were apart');
  }

  if (items.length === 0) {
    items.push('Your evidence appears strong across all categories. Confirm your financial requirement separately before applying.');
  }

  items.forEach(text => {
    const item = document.createElement('div');
    item.className = 'improvement-item';
    item.innerHTML = '<div class="improvement-dot"></div><span>' + text + '</span>';
    list.appendChild(item);
  });
}

/* ─── DOCUMENTS LIST ────────────────────────────────── */
function buildDocsList(breakdown) {
  const list = document.getElementById('docsList');
  list.innerHTML = '';
  const docs = [];

  // Always show based on relationship type
  if (answers.q2_type === 'married' || answers.q2_type === 'civil') {
    docs.push({ name: 'Marriage certificate or civil partnership certificate', tier: 'strong' });
  }

  if (path === 'A') {
    // Show only what they are missing
    const docChecks = getStoredCheckbox('q3a_docs');
    if (!docChecks.includes('tenancy'))
      docs.push({ name: 'Tenancy agreement or mortgage document', tier: 'strong' });
    if (!docChecks.includes('council_tax'))
      docs.push({ name: 'Council tax bill at shared address', tier: 'strong' });
    if (!docChecks.includes('utility'))
      docs.push({ name: 'Utility bills at shared address', tier: 'strong' });
    if (!docChecks.includes('official_letters'))
      docs.push({ name: 'Official letters — GP, HMRC, DWP, driving licence', tier: 'strong' });

    const finChecks = getStoredCheckbox('q3a_finance');
    if (!finChecks.includes('joint_account') && !finChecks.includes('bank_statements'))
      docs.push({ name: 'Bank statements — joint or individual at same address', tier: 'strong' });

  } else {
    const finChecks = getStoredCheckbox('q3b_finance');
    if (!finChecks.includes('transfers'))
      docs.push({ name: 'Money transfer records or bank transaction history', tier: 'strong' });
    if (answers.q3b_reason_doc === 'no')
      docs.push({ name: 'Document explaining separation — employment contract, university letter, medical certificate', tier: 'strong' });
  }

  // Children
  if (answers.q2_children === 'yes_cert') {
    docs.push({ name: 'Birth certificates of children together', tier: 'strong' });
  }

  // Travel
  const travelChecks = getStoredCheckbox('q4_travel');
  if (!travelChecks.includes('tickets'))
    docs.push({ name: 'Flight tickets, boarding passes, or train tickets showing visits', tier: 'accept' });
  if (!travelChecks.includes('bookings'))
    docs.push({ name: 'Holiday bookings made together', tier: 'accept' });

  // Communication
  const commsChecks = getStoredCheckbox('q4_comms');
  if (!commsChecks.includes('transcripts'))
    docs.push({ name: 'Certified transcripts of communication records', tier: 'weak' });
  if (!commsChecks.includes('call_logs'))
    docs.push({ name: 'Call logs or message records', tier: 'weak' });
  if (!commsChecks.includes('letters'))
    docs.push({ name: 'Letters of support from family, friends, or community leaders', tier: 'weak' });

  // Photos
  if (answers.q4_photos === 'no' || answers.q4_photos === 'undated')
    docs.push({ name: 'Dated photographs together spanning different periods', tier: 'weak' });

  const tierLabel = { strong: 'Strong', accept: 'Acceptable', weak: 'Weak' };

  if (docs.length === 0) {
    const item = document.createElement('div');
    item.className = 'improvement-item';
    item.innerHTML = '<div class="improvement-dot" style="background:#2e7d32"></div><span>Your evidence checklist looks comprehensive. Ensure all documents are recent, translated if needed, and clearly legible.</span>';
    list.appendChild(item);
    return;
  }

  docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    item.innerHTML = `
      <span class="doc-tier doc-tier--${doc.tier === 'accept' ? 'accept' : doc.tier}">${tierLabel[doc.tier]}</span>
      <span class="doc-name">${doc.name}</span>
    `;
    list.appendChild(item);
  });
}

/* ─── PERSONALISED GUIDANCE ─────────────────────────── */
function buildGuidance(score) {
  const list = document.getElementById('guidanceList');
  list.innerHTML = '';
  const items = [];

  if (subsidingMode) {
    items.push({
      title: 'Second Application',
      text: 'Your relationship was already accepted as genuine. Focus on showing it is still active — provide recent utility bills, bank statements, and evidence of continued contact or cohabitation.'
    });
  }

  if (answers.q2_duration === 'under6' || answers.q2_duration === '6to12') {
    items.push({
      title: 'Short Relationship',
      text: 'A short relationship may attract closer scrutiny. Focus on quality evidence of how you met, how the relationship developed, and regular contact throughout.'
    });
  }

  if (answers.q2_apart_reason === 'cultural' || answers.q3_cultural === 'yes') {
    items.push({
      title: 'Cultural Awareness',
      text: 'The Home Office recognises that in some cultures women are not named on official documents. Alternative evidence is accepted: money transfers, birth certificates of children, evidence of shared childcare.'
    });
  }

  if (answers.q2_apart_reason === 'work_study') {
    items.push({
      title: 'Work or Study Separation',
      text: 'Include your employment contract or university letter with your application. Evidence of regular visits and communication during the separation period is particularly important.'
    });
  }

  if (answers.q2_samesex === 'yes' && answers.q2_living === 'no') {
    items.push({
      title: 'Same-Sex Relationship',
      text: 'You will not be penalised for lack of cohabitation evidence where cultural or legal barriers make this impossible. Focus on visits, communication records, and financial support between you.'
    });
  }

  if (answers.q5_refusal === 'standard') {
    items.push({
      title: 'Previous Refusal',
      text: 'Declare the previous refusal in your new application. Include a cover letter that specifically addresses the reasons for the previous refusal. Do not resubmit identical evidence.'
    });
  }

  if (answers.q5_overstay === 'yes_reason' || answers.q5_overstay === 'yes_no_reason') {
    items.push({
      title: 'Overstay History',
      text: 'Section 39E of the Immigration Rules provides exceptions in certain circumstances. A documented reason — employment records, medical evidence — will significantly help your case.'
    });
  }

  if (deportationFlag) {
    items.push({
      title: 'Deportation or Removal Order',
      text: 'Exceptions may apply under Article 8 family life rights. This is a complex area and professional legal advice is essential before proceeding with any application.'
    });
  }

  if (answers.q5_convictions === 'yes') {
    items.push({
      title: 'Criminal Convictions',
      text: 'Unspent convictions can affect your application on suitability grounds. Professional legal advice before applying is strongly recommended.'
    });
  }

  if (answers.q2_children === 'yes_cert') {
    items.push({
      title: 'Children Together',
      text: 'Birth certificates are classified as strong evidence. Make sure they are included and that certified translations are provided if they are not in English.'
    });
  }

  // Always add financial note
  items.push({
    title: 'Financial Requirement',
    text: 'This tool assesses relationship evidence only. The financial requirement must be confirmed separately. Use the KQ Solicitors Financial Requirement Calculator before submitting your application.'
  });

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'guidance-item';
    div.innerHTML = '<strong>' + item.title + '</strong>' + item.text;
    list.appendChild(div);
  });
}

/* ─── COPY RESULTS ──────────────────────────────────── */
function copyResults() {
  const { score, breakdown } = calculateScore();
  const threshold = getThreshold(score);

  const text = [
    'KQ SOLICITORS — RELATIONSHIP EVIDENCE ASSESSMENT',
    '─────────────────────────────────────────────────',
    'Overall Score: ' + score + ' / 100',
    'Result: ' + threshold.label,
    '',
    'Relationship Evidence: ' + breakdown.evidencePct + '%',
    'Immigration Compliance: ' + breakdown.compliancePct + '%',
    '',
    'CATEGORY BREAKDOWN',
    'Relationship Genuineness:  ' + breakdown.catA + ' / 25',
    (path === 'A' ? 'Cohabitation Evidence:     ' : 'Long Distance Evidence:    ') + breakdown.catB + ' / 25',
    'Shared Financial Evidence: ' + breakdown.catC + ' / 15',
    'Immigration Compliance:    ' + breakdown.catD + ' / 25',
    'Supporting Evidence:       ' + breakdown.catE + ' / 10',
    '',
    'Based on Home Office Appendix FM caseworker guidance.',
    'This does not constitute legal advice.',
    'Contact KQ Solicitors for advice on your specific circumstances.',
    '─────────────────────────────────────────────────'
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showSaveIndicator('Summary copied to clipboard');
  }).catch(() => {
    alert('Copy failed — please select and copy manually.');
  });
}

/* ─── EMAIL RESULTS ─────────────────────────────────── */
function emailResults() {
  const email = answers.lead_email;
  if (!email) {
    const input = prompt('Enter your email address:');
    if (input && input.includes('@')) {
      answers.lead_email = input;
      showSaveIndicator('Email saved — results would be sent in production');
    }
  } else {
    showSaveIndicator('Results would be emailed to ' + email);
  }
}

/* ─── LOCAL STORAGE ─────────────────────────────────── */
function saveToStorage() {
  try {
    const data = {
      answers, path, currentStep,
      deportationFlag, subsidingMode,
      savedAt: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    showSaveIndicator('Progress saved');
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.answers) return;

    // Auto-delete after 30 days
    if (data.savedAt && (Date.now() - data.savedAt) > 30 * 24 * 60 * 60 * 1000) {
      clearStorage();
      return;
    }

    answers = data.answers || {};
    path = data.path || 'A';
    currentStep = data.currentStep || 0;
    deportationFlag = data.deportationFlag || false;
    subsidingMode = data.subsidingMode || false;

    restoreFormFields();
  } catch (e) {
    console.warn('Load failed:', e);
  }
}

function restoreFormFields() {
  // Radios
  Object.keys(answers).forEach(name => {
    const val = answers[name];
    if (typeof val === 'string') {
      const radio = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
      if (radio) radio.checked = true;
      const select = document.querySelector('select[name="' + name + '"]');
      if (select) select.value = val;
    }
    if (Array.isArray(val)) {
      val.forEach(v => {
        const cb = document.querySelector('input[name="' + name + '"][value="' + v + '"]');
        if (cb) cb.checked = true;
      });
    }
  });

  // Text inputs
  if (answers.lead_name) { const el = document.getElementById('lead_name'); if (el) el.value = answers.lead_name; }
  if (answers.lead_email) { const el = document.getElementById('lead_email'); if (el) el.value = answers.lead_email; }

  // Conditional visibility
  if (answers.q2_living === 'no') {
    document.getElementById('q2-apart-wrap').hidden = false;
    document.getElementById('path-a-questions').hidden = true;
    document.getElementById('path-b-questions').hidden = false;
  }
  if (answers.q2_samesex === 'yes') document.getElementById('samesex-note').hidden = false;
  if (answers.q2_prev_visa === 'yes') document.getElementById('prev-visa-note').hidden = false;
  if (deportationFlag) document.getElementById('deportation-flag').hidden = false;
  if (answers.q5_convictions === 'yes') document.getElementById('conviction-note').hidden = false;

  updateNextButtons();
}

function clearStorage() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToStorage, 30000);
}

/* ─── SAVE INDICATOR ────────────────────────────────── */
function showSaveIndicator(msg) {
  const el = document.getElementById('saveIndicator');
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2500);
}

/* ─── SESSION TIMEOUT ───────────────────────────────── */
function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    if (currentStep > 0 && currentStep <= TOTAL_STEPS) {
      document.getElementById('timeoutModal').hidden = false;
    }
  }, SESSION_TIMEOUT_MS);
}

function dismissTimeout() {
  document.getElementById('timeoutModal').hidden = true;
  resetSessionTimer();
}

/* ─── TOOLTIP ───────────────────────────────────────── */
function toggleTooltip(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = !el.hidden;
}