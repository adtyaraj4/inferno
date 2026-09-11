// leaderboard.js
// A small storage service layer. Today it persists to localStorage so the
// project works with zero backend. The public functions below (getScores,
// submitScore) are the only surface the rest of the app talks to — swap the
// body of this file for a Firebase/MongoDB-backed implementation later
// without touching any calling code.

const SCORES_KEY = 'infernoProtocol.leaderboard.v1';
const SOUND_KEY = 'infernoProtocol.soundEnabled';
const MAX_ENTRIES = 10;

/**
 * @typedef {Object} ScoreEntry
 * @property {string} name
 * @property {number} score
 * @property {number} kills
 * @property {number} wave
 * @property {string} date  ISO date string
 */

/** @returns {ScoreEntry[]} sorted descending by score */
export function getScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn('Leaderboard read failed, starting fresh.', err);
    return [];
  }
}

/**
 * @param {{name: string, score: number, kills: number, wave: number}} entry
 * @returns {ScoreEntry[]} updated, sorted list
 */
export function submitScore(entry) {
  const scores = getScores();
  const clean = {
    name: (entry.name || 'OPERATIVE').toUpperCase().slice(0, 12),
    score: Math.max(0, Math.round(entry.score || 0)),
    kills: Math.max(0, Math.round(entry.kills || 0)),
    wave: Math.max(1, Math.round(entry.wave || 1)),
    date: new Date().toISOString(),
  };
  scores.push(clean);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Leaderboard write failed.', err);
  }
  return trimmed;
}

export function clearScores() {
  try { localStorage.removeItem(SCORES_KEY); } catch (err) { /* noop */ }
}

/* ---------------- Sound preference (shared across site + game) --------- */

export function isSoundEnabled() {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === null ? true : raw === 'true';
  } catch (err) {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try { localStorage.setItem(SOUND_KEY, String(!!enabled)); } catch (err) { /* noop */ }
}

/* ---------------- Rendering helper for the marketing site --------------- */

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (err) {
    return '—';
  }
}

export function renderLeaderboardTable() {
  const body = document.getElementById('leaderboardBody');
  const empty = document.getElementById('leaderboardEmpty');
  const table = document.getElementById('leaderboardTable');
  if (!body) return;

  const scores = getScores();

  if (scores.length === 0) {
    if (table) table.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }

  if (table) table.hidden = false;
  if (empty) empty.hidden = true;

  body.innerHTML = scores.map((entry, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td>${entry.score.toLocaleString()}</td>
      <td>${entry.kills}</td>
      <td>${entry.wave}</td>
      <td>${formatDate(entry.date)}</td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
