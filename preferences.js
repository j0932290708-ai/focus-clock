(() => {
  const key = 'focus-clock-theme';
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.textContent = theme === 'dark' ? '淺色模式' : '深色模式';
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  }
  function initialTheme() {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  apply(initialTheme());
  document.addEventListener('DOMContentLoaded', () => {
    apply(initialTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, theme); } catch {}
      apply(theme);
    }));
  });
  window.addEventListener('storage', event => { if (event.key === key) apply(initialTheme()); });
})();
