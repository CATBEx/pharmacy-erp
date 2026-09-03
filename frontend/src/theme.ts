// Light/dark theme (bug #16): defaults to the device's OS setting, with a manual override that
// persists to localStorage. The actual "no flash of wrong theme on load" logic is duplicated as a
// small inline script in index.html <head> (it has to run before React mounts, before first paint --
// this module can't do that job, it only handles the toggle button's read/write after the app is
// already running). Keep the two in sync if this logic ever changes.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pharmacy-erp-theme';

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null; // localStorage can throw in a locked-down/private browsing context -- just fall back
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getEffectiveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort -- the toggle still works for this page load even if it can't persist
  }
  applyTheme(theme);
}
