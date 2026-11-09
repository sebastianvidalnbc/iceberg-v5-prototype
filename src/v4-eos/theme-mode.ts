// Light / dark switch for the V5 workspace. The theme is a single attribute on
// <html>: every color is a token in ui-lib/tokens.css, so flipping it re-themes
// the app, portaled dialogs included. The choice is remembered per browser.
export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "iceberg-v5-theme";

export function readThemeMode(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage can be blocked (private mode); the switch still works for this page.
  }
}
