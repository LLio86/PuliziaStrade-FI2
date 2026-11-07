/**
 * favorites-view.js - Gestione Strade Preferite e Ricerca Istantanea Vie di Firenze
 */

import { state } from '../state.js';
import { dataService } from '../data-service.js';
import {
  DAY_CODES,
  getNextCleaningDate,
  formatRelativeDays,
  formatFullItalianDate,
  getNightCleaningWarning,
  getSideDescription
} from '../schedule.js';

export class FavoritesView {
  constructor() {
    this.container = document.getElementById('sezione-preferiti');
    this.searchInput = document.getElementById('fav-search-input');
    this.clearSearchBtn = document.getElementById('btn-clear-fav-search');
    this.suggestionsEl = document.getElementById('fav-search-suggestions');
    this.favoritesListEl = document.getElementById('fav-streets-list');

    this._bindEvents();
    this.renderFavorites();
  }

  _bindEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', e => {
        const query = e.target.value;
        if (this.clearSearchBtn) {
          this.clearSearchBtn.style.display = query ? 'flex' : 'none';
        }
        this._renderSuggestions(query);
      });
    }

    if (this.clearSearchBtn) {
      this.clearSearchBtn.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchInput.focus();
        }
        this.clearSearchBtn.style.display = 'none';
        this._renderSuggestions('');
      });
    }

    state.on('favorites:changed', () => this.renderFavorites());
  }

  _renderSuggestions(query) {
    if (!this.suggestionsEl) return;

    if (!query || query.trim().length === 0) {
      this.suggestionsEl.innerHTML = '';
      this.suggestionsEl.style.display = 'none';
      return;
    }

    const matches = dataService.searchStreets(query, 12);

    if (matches.length === 0) {
      this.suggestionsEl.innerHTML = `
        <div class="suggestion-empty">Nessuna via trovata per "${query}"</div>
      `;
      this.suggestionsEl.style.display = 'block';
      return;
    }

    const html = matches.map(via => {
      const isFav = state.isFavorite(via);
      return `
        <div class="suggestion-item" data-street="${via}">
          <div class="suggestion-info">
            <span class="street-icon">📍</span>
            <span class="street-text">${via}</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-action-icon btn-toggle-fav-suggest" data-street="${via}" title="Preferiti">
              ${isFav ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.suggestionsEl.innerHTML = html;
    this.suggestionsEl.style.display = 'block';

    this.suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.btn-toggle-fav-suggest')) return;
        const street = item.dataset.street;
        const feats = dataService.getFeaturesForStreet(street);
        if (feats && feats.length > 0) {
          state.setSelectedFeature(feats[0]);
        }
        this.suggestionsEl.style.display = 'none';
      });
    });

    this.suggestionsEl.querySelectorAll('.btn-toggle-fav-suggest').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const street = btn.dataset.street;
        state.toggleFavorite(street);
        btn.textContent = state.isFavorite(street) ? '❤️' : '🤍';
      });
    });
  }

  renderFavorites() {
    if (!this.favoritesListEl) return;

    const favorites = state.state.favorites || [];

    if (favorites.length === 0) {
      this.favoritesListEl.innerHTML = `
        <div class="card text-center" style="padding: 32px 16px;">
          <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">❤️</span>
          <h4 style="font-weight: 700; margin-bottom: 4px;">Nessuna via salvata</h4>
          <p class="text-sm text-secondary" style="margin-bottom: 16px;">
            Cerca una via qui sopra per salvarla tra i preferiti e impostare promemoria per il parcheggio.
          </p>
          <button class="btn btn-primary btn-sm" id="btn-add-sample-fav">Aggiungi Borgo San Frediano</button>
        </div>
      `;

      const sampleBtn = this.favoritesListEl.querySelector('#btn-add-sample-fav');
      if (sampleBtn) {
        sampleBtn.addEventListener('click', () => {
          state.toggleFavorite('BORGO SAN FREDIANO');
        });
      }
      return;
    }

    const now = new Date();
    const notifActive = state.state.notificationsEnabled;

    let html = favorites.map(streetName => {
      const features = dataService.getFeaturesForStreet(streetName);

      let nextDate = null;
      let primaryFeature = null;

      if (features && features.length > 0) {
        for (const f of features) {
          const d = getNextCleaningDate(f.properties, now);
          if (d && (!nextDate || d < nextDate)) {
            nextDate = d;
            primaryFeature = f;
          }
        }
        if (!primaryFeature) primaryFeature = features[0];
      }

      const p = primaryFeature ? primaryFeature.properties : null;
      const relDays = nextDate ? formatRelativeDays(nextDate, now) : 'Non disponibile';
      const fullDate = nextDate ? formatFullItalianDate(nextDate) : '';
      const dayName = p ? (DAY_CODES[p.giorno] || p.giorno) : '';
      const weeksStr = p && p.settimane ? p.settimane.map(w => `${w}ª`).join(', ') : '';
      const nightWarning = p ? getNightCleaningWarning(p) : null;
      const sides = p ? getSideDescription(p) : '';

      // Calcolo differenza giorni per colorazione sfondo:
      // Rosso se pulizia domani (o oggi), Giallo se pulizia fra 2 o 3 giorni
      let diffDays = null;
      if (nextDate) {
        const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const d2 = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
        diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      }

      let urgencyClass = '';
      let badgeClass = 'badge-neutral';
      if (diffDays === 1 || diffDays === 0) {
        urgencyClass = 'fav-bg-red';
        badgeClass = 'badge-danger';
      } else if (diffDays === 2 || diffDays === 3) {
        urgencyClass = 'fav-bg-yellow';
        badgeClass = 'badge-warning';
      }

      return `
        <div class="card card-favorite ${urgencyClass}" data-street="${streetName}">
          <div class="card-fav-top">
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <h4 class="street-name">${streetName}</h4>
                ${notifActive ? '<span class="badge badge-success">🔔 Notifica Attiva</span>' : ''}
              </div>
              <p class="street-stretch">${p?.tratto ? `Tratto: ${p.tratto}` : 'Comune di Firenze'}</p>
            </div>
            <button class="btn-icon btn-remove-fav" data-street="${streetName}" title="Rimuovi dai preferiti">
              ❤️
            </button>
          </div>

          <div class="fav-info-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="text-xs text-secondary">PROSSIMO SPAZZAMENTO</span>
              <span class="badge ${badgeClass}">${relDays}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.95rem; margin-top: 4px;">
              ${fullDate || 'Data non disponibile'}
            </div>
            ${p ? `
              <div class="cleaning-meta-inline" style="margin-top: 6px;">
                <span>⏰ ${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}</span>
                <span>📅 ${dayName} (${weeksStr} sett.)</span>
                <span>🅿️ ${sides}</span>
              </div>
            ` : ''}
          </div>

          ${nightWarning ? `<div class="night-banner-compact" style="margin-top: 8px;">${nightWarning}</div>` : ''}

          <div class="card-fav-actions">
            <button class="btn btn-outline btn-sm btn-block btn-open-fav-detail" data-street="${streetName}">
              Dettagli Completi & Mappa ➔
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.favoritesListEl.innerHTML = html;

    this.favoritesListEl.querySelectorAll('.btn-remove-fav').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        state.toggleFavorite(btn.dataset.street);
      });
    });

    this.favoritesListEl.querySelectorAll('.btn-open-fav-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const feats = dataService.getFeaturesForStreet(btn.dataset.street);
        if (feats && feats.length > 0) {
          state.setSelectedFeature(feats[0]);
        }
      });
    });
  }
}
