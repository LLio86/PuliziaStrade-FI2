/**
 * settings-view.js - Gestione Impostazioni Grafiche, Temi, Accessibilità e Cache Offline
 */

import { state } from '../state.js';
import { dataService } from '../data-service.js';

export class SettingsView {
  constructor() {
    this.container = document.getElementById('sezione-impostazioni');
    this.themeSelect = document.getElementById('tema-select');
    this.autoThemeToggle = document.getElementById('tema-auto-checkbox');
    this.fontSizeRange = document.getElementById('dimensione-testo');
    this.fontSizeValueEl = document.getElementById('dimensione-testo-valore');
    this.clearCacheBtn = document.getElementById('btn-clear-cache');
    this.cacheStatusEl = document.getElementById('cache-status-text');

    this._applyInitialSettings();
    this._bindEvents();
  }

  _applyInitialSettings() {
    const { theme, autoTheme, fontSize } = state.state;

    if (this.themeSelect) this.themeSelect.value = theme;
    if (this.autoThemeToggle) this.autoThemeToggle.checked = autoTheme;
    if (this.fontSizeRange) this.fontSizeRange.value = fontSize;
    if (this.fontSizeValueEl) this.fontSizeValueEl.textContent = `${Math.round(fontSize * 100)}%`;

    this._applyTheme(theme, autoTheme);
    this._applyFontSize(fontSize);
  }

  _bindEvents() {
    if (this.themeSelect) {
      this.themeSelect.addEventListener('change', e => {
        state.setAutoTheme(false);
        if (this.autoThemeToggle) this.autoThemeToggle.checked = false;
        state.setTheme(e.target.value);
        this._applyTheme(e.target.value, false);
      });
    }

    if (this.autoThemeToggle) {
      this.autoThemeToggle.addEventListener('change', e => {
        const auto = e.target.checked;
        state.setAutoTheme(auto);
        this._applyTheme(state.state.theme, auto);
      });
    }

    if (this.fontSizeRange) {
      this.fontSizeRange.addEventListener('input', e => {
        const scale = parseFloat(e.target.value);
        state.setFontSize(scale);
        this._applyFontSize(scale);
        if (this.fontSizeValueEl) this.fontSizeValueEl.textContent = `${Math.round(scale * 100)}%`;
      });
    }

    if (this.clearCacheBtn) {
      this.clearCacheBtn.addEventListener('click', async () => {
        if (confirm('Vuoi svuotare la cache offline dei dati e ricaricare il dataset?')) {
          await dataService.clearCache();
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          alert('Cache svuotata! L\'app verrà ricaricata.');
          window.location.reload();
        }
      });
    }
  }

  _applyTheme(theme, autoTheme) {
    let effectiveTheme = theme;

    if (autoTheme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const hour = new Date().getHours();
      const isNight = hour >= 20 || hour < 7;
      effectiveTheme = (prefersDark || isNight) ? 'scuro' : 'chiaro';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      if (effectiveTheme === 'scuro') {
        metaThemeColor.setAttribute('content', '#0f172a');
      } else if (effectiveTheme === 'alto-contrasto') {
        metaThemeColor.setAttribute('content', '#000000');
      } else {
        metaThemeColor.setAttribute('content', '#4f46e5');
      }
    }
  }

  _applyFontSize(scale) {
    document.documentElement.style.setProperty('--font-scale', scale);
  }
}
