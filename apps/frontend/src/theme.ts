const THEME_KEY = 'dashlet_theme';

export type Theme = 'dark' | 'light';

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return 'dark'; // Dark por defecto
}

export function applyTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
  window.dispatchEvent(new CustomEvent('dashlet-theme-change', { detail: theme }));
}
