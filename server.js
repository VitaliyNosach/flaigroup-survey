const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RESPONSES_FILE = path.join(__dirname, 'responses.json');
const REQUIRED = 14;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage — always starts fresh on each deploy
let memoryResponses = [];

function readResponses() {
  return memoryResponses;
}

function writeResponses(data) {
  memoryResponses = data;
  // Also write to file as backup
  try { fs.writeFileSync(RESPONSES_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// Reset (secret endpoint)
app.get('/api/reset', (req, res) => {
  if (req.query.key !== 'flai2026') {
    return res.status(403).json({ error: 'forbidden' });
  }
  writeResponses([]);
  res.json({ status: 'ok', message: 'Ответы сброшены' });
});

// Status
app.get('/api/status', (req, res) => {
  const responses = readResponses();
  res.json({
    count: responses.length,
    required: REQUIRED,
    completed: responses.length >= REQUIRED
  });
});

// Submit
app.post('/api/submit', (req, res) => {
  const responses = readResponses();
  if (responses.length >= REQUIRED) {
    return res.json({ status: 'closed' });
  }
  const entry = { ...req.body, timestamp: new Date().toISOString() };
  responses.push(entry);
  writeResponses(responses);
  res.json({
    status: 'ok',
    count: responses.length,
    completed: responses.length >= REQUIRED
  });
});

// Results
app.get('/api/results', (req, res) => {
  const responses = readResponses();
  if (responses.length < REQUIRED) {
    return res.status(403).json({
      error: `Нужно ещё ${REQUIRED - responses.length} ответов`,
      count: responses.length,
      required: REQUIRED
    });
  }
  res.json(calcResults(responses));
});

function avg(arr) {
  const valid = arr.filter(v => v !== undefined && v !== null && !isNaN(Number(v))).map(Number);
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function dist(arr) {
  const d = {};
  arr.filter(Boolean).forEach(v => { d[v] = (d[v] || 0) + 1; });
  return d;
}

function calcResults(responses) {
  const n = responses.length;

  // Q1: eNPS (0-10)
  const q1 = responses.map(r => Number(r.q1));
  const promoters = q1.filter(s => s >= 9).length;
  const neutrals   = q1.filter(s => s >= 7 && s <= 8).length;
  const detractors = q1.filter(s => s <= 6).length;
  const eNPS = Math.round((promoters / n - detractors / n) * 100);

  // Q2: satisfaction 1-10
  const q2avg = avg(responses.map(r => r.q2));

  // Q3: distribution
  const q3dist = dist(responses.map(r => r.q3));

  // Q4-6: Organization (1-5)
  const q4 = avg(responses.map(r => r.q4));
  const q5 = avg(responses.map(r => r.q5));
  const q6 = avg(responses.map(r => r.q6));

  // Q8: clarity (1-5)
  const q8 = avg(responses.map(r => r.q8));

  // Q9: response speed (1=worst, 5=best variant index)
  const q9map = { '1': 5, '2': 4, '3': 3, '4': 2, '5': 1 };
  const q9 = avg(responses.map(r => q9map[String(r.q9)]));

  // Q10: feedback regularity
  const q10map = { '1': 5, '2': 4, '3': 2, '4': 1 };
  const q10 = avg(responses.map(r => q10map[String(r.q10)]));

  // Q11: transparency (1-5)
  const q11 = avg(responses.map(r => r.q11));

  // Q12: comfort reporting (1-5)
  const q12 = avg(responses.map(r => r.q12));

  // Q13: single-person dependency (reverse)
  const q13map = { '1': 5, '2': 4, '3': 2, '4': 1 };
  const q13 = avg(responses.map(r => q13map[String(r.q13)]));

  // Q14-15: management clarity (1-5)
  const q14 = avg(responses.map(r => r.q14));
  const q15 = avg(responses.map(r => r.q15));

  // Q16-17: atmosphere (1-5)
  const q16 = avg(responses.map(r => r.q16));
  const q17 = avg(responses.map(r => r.q17));

  // Section averages
  const orgAvg  = avg([q4, q5, q6].filter(x => x !== null));
  const commAvg = avg([q8, q9, q10, q11].filter(x => x !== null));
  const mgmtAvg = avg([q12, q13, q14, q15].filter(x => x !== null));
  const atmAvg  = avg([q16, q17].filter(x => x !== null));

  // Open-ended
  const q7texts  = responses.map(r => r.q7).filter(Boolean);
  const q18texts = responses.map(r => r.q18).filter(Boolean);

  return {
    n, eNPS,
    promoters, neutrals, detractors,
    q2avg, q3dist,
    questions: { q4, q5, q6, q8, q9, q10, q11, q12, q13, q14, q15, q16, q17 },
    sections: {
      organization:  { avg: orgAvg,  label: 'Организация работы' },
      communication: { avg: commAvg, label: 'Коммуникация' },
      management:    { avg: mgmtAvg, label: 'Управление' },
      atmosphere:    { avg: atmAvg,  label: 'Атмосфера и доверие' }
    },
    openEnded: { q7: q7texts, q18: q18texts }
  };
}

app.listen(PORT, () => {
  console.log(`\n✅  FLAI Group Survey запущен → http://localhost:${PORT}`);
  console.log(`📊  Результаты           → http://localhost:${PORT}/results.html`);
  console.log(`📥  Ответов собрано      → GET /api/status\n`);
});
