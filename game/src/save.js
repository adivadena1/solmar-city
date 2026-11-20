// Solmar — saving to localStorage: cash, finished missions, and where the
// player last stood. Nothing sensitive, just progress, so the player can
// pick the story up again after closing the tab.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone : [],
      spawn: data.spawn && typeof data.spawn.x === 'number' ? data.spawn : null,
    };
  } catch (err) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: data.money,
      missionsDone: data.missionsDone,
      spawn: data.spawn,
      savedAt: Date.now(),
    }));
  } catch (err) {
    /* Storage full or blocked: the game still plays, it just forgets. */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    /* Nothing stored. */
  }
}
