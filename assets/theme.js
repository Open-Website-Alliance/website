/* Optional theme and footer enhancements. CSS alone follows the operating system. */
(() => {
  'use strict';
  const key = 'owa-color-theme';
  const choices = new Set(['system', 'light', 'dark']);
  const valid = value => choices.has(value) ? value : 'system';
  let preference = 'system';
  try { preference = valid(localStorage.getItem(key)); } catch { /* Storage can be blocked. */ }
  const apply = value => {
    document.documentElement.dataset.theme = valid(value);
    // Native picture media supplies the no-script OS fallback; explicit choices
    // override the same source without duplicating accessible images.
    const media = value === 'system' ? 'screen and (prefers-color-scheme: dark)' : value === 'dark' ? 'screen' : 'not all';
    document.querySelectorAll('source[data-dark-logo], source[data-dark-art]').forEach(source => { source.media = media; });
  };
  apply(preference);
  const updateCopyrightYear = () => {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-copyright-year]').forEach(element => { element.textContent = year; });
  };
  window.addEventListener('pageshow', updateCopyrightYear);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateCopyrightYear();
  });
  document.addEventListener('DOMContentLoaded', () => {
    updateCopyrightYear();
    const control = document.querySelector('.theme-control');
    const trigger = document.getElementById('theme-mode');
    const panel = document.getElementById('theme-options');
    if (!control || !trigger || !panel) return;
    const buttons = [...panel.querySelectorAll('button[data-theme-choice]')];
    const render = () => {
      apply(preference);
      trigger.dataset.preference = preference;
      const name = 'Color theme: ' + preference[0].toUpperCase() + preference.slice(1);
      trigger.setAttribute('aria-label', name);
      trigger.title = name;
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)));
    };
    const close = (restoreFocus = false) => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    trigger.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    });
    buttons.forEach(button => button.addEventListener('click', () => {
      preference = valid(button.dataset.themeChoice);
      render();
      try { localStorage.setItem(key, preference); } catch { /* The current page still changes. */ }
      close(true);
    }));
    control.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        close(true);
      }
    });
    control.addEventListener('focusout', event => {
      if (!control.contains(event.relatedTarget)) close();
    });
    document.addEventListener('click', event => {
      if (!control.contains(event.target)) close();
    });
    window.addEventListener('storage', event => {
      if (event.key !== key && event.key !== null) return;
      preference = valid(event.newValue);
      render();
    });
    render();
    control.hidden = false;
  });
})();
