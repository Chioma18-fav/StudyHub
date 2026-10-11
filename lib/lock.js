const K = 'sh:lock';
export const setLock = s => { try { localStorage.setItem(K, String(Date.now() + s * 1000 + 600000)); } catch {} };
export const clearLock = () => { try { localStorage.removeItem(K); } catch {} };
export const isLocked = () => { try { return Date.now() < +(localStorage.getItem(K) || 0); } catch { return false; } };
