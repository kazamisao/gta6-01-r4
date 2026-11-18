// save.js — Verano Bay's save game: cash, story progress and where the
// player stood, kept in localStorage by the browser shell. The storage
// object is injected, so the tests drive it with a plain fake.

export const SAVE_KEY = 'verano-bay-save-v1';

export function createSave(storage, key = SAVE_KEY) {
  return {
    write(state) {
      try {
        storage.setItem(key, JSON.stringify({
          cash: state.cash,
          missionIndex: state.missionIndex,
          x: Math.round(state.x),
          y: Math.round(state.y),
        }));
        return true;
      } catch {
        return false; // storage full or blocked: the game plays on unsaved
      }
    },
    read() {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
        return data;
      } catch {
        return null; // a corrupt save is no save
      }
    },
    clear() {
      try { storage.removeItem(key); } catch { /* nothing to clear */ }
    },
  };
}
