import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'invariant-theme';
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

function createThemeStore() {
  const { subscribe, set } = writable<Theme>('system');

  function getResolvedTheme(theme: Theme): 'light' | 'dark' {
    if (theme !== 'system') {
      return theme;
    }

    return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light';
  }

  function apply(theme: Theme) {
    document.documentElement.setAttribute('data-theme', getResolvedTheme(theme));
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }

  return {
    subscribe,
    set: (theme: Theme) => {
      set(theme);
      apply(theme);
    },
    init: () => {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      const theme = savedTheme ?? 'system';

      apply(theme);
      set(theme);
    },
  };
}

export const themeStore = createThemeStore();
