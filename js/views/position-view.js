/**
 * position-view.js - Gestione della vista Posizione Attuale, Mappa e Info Pulizia della Via
 */

import { state } from '../state.js';
import { dataService } from '../data-service.js';
import { mapService } from '../map-service.js';
import { locationService } from '../location-service.js';
import {
  DAY_CODES,
  getNextCleaningDate,
  getCleaningStatus,
  formatRelativeDays,
  formatFullItalianDate,
  getNightCleaningWarning,
  getSideDescription
} from '../schedule.js';

export class PositionView {
  constructor() {
    this.container = document.getElementById('sezione-posizione');
    this.addressEl = document.getElementById('pos-address');
    this.coordsEl = document.getElementById('pos-coords');
    this.cleaningCardsEl = document.getElementById('pos-cleaning-cards');
    this.recenterBtn = document.getElementById('btn-recenter');
    this.manualStreetInput = document.getElementById('pos-manual-street');
    this.manualSuggestionsEl = document.getElementById('pos-manual-suggestions');

    this._bindEvents();
  }

  _bindEvents() {
    state.on('location:updated', loc => this.renderLocation(loc));

    state.on('tracking:changed', isTracking => {
      if (this.recenterBtn) {
        if (isTracking) {
          this.recenterBtn.classList.add('active');
          this.recenterBtn.setAttribute('title', 'Tracking GPS attivo');
        } else {
          this.recenterBtn.classList.remove('active');
          this.recenterBtn.setAttribute('title', 'Centra la mia posizione');
        }
      }
    });

    if (this.recenterBtn) {
      this.recenterBtn.addEventListener('click', () => {
        locationService.requestCurrentPosition().catch(() => {});
        mapService.recenterOnUser();
      });
    }

    state.on('favorites:changed', () => this.renderCleaningInfo());

    // Ricerca manuale via (per test o se senza GPS)
    if (this.manualStreetInput) {
      this.manualStreetInput.addEventListener('input', e => {
        const query = e.target.value;
        this._renderManualSuggestions(query);
      });
    }
  }

  renderLocation(loc) {
    if (!this.container) return;

    if (loc.loading && !loc.address) {
      if (this.addressEl) this.addressEl.textContent = 'Rilevamento posizione GPS...';
      if (this.coordsEl) this.coordsEl.textContent = 'Acquisizione coordinate da satellite...';
      return;
    }

    if (loc.error) {
      if (this.addressEl) this.addressEl.textContent = '⚠️ Posizione non disponibile';
      if (this.coordsEl) this.coordsEl.textContent = loc.error;
      this._renderErrorCard(loc.error, loc.isSecureContextError, loc.isPermissionDenied);
      return;
    }

    if (this.addressEl) {
      this.addressEl.textContent = loc.address || 'Firenze';
    }

    if (this.coordsEl && loc.lat && loc.lng) {
      const acc = loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : '';
      this.coordsEl.textContent = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${acc}`;
    }

    this.renderCleaningInfo();
  }

  renderCleaningInfo() {
    if (!this.cleaningCardsEl) return;

    const loc = state.state.userLocation;
    if (!loc.address) {
      return;
    }

    const features = dataService.getFeaturesForStreet(loc.address);

    if (!features || features.length === 0) {
      this.cleaningCardsEl.innerHTML = `
        <div class="card info-card">
          <div style="display: flex; gap: 12px; align-items: center;">
            <span style="font-size: 1.6rem;">ℹ️</span>
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 2px;">Nessun divieto rilevato</h4>
              <p class="text-sm text-secondary">
                Non risultano turni di spazzamento con divieto di sosta per <strong>${loc.address}</strong> nei dati ufficiali.
              </p>
            </div>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm" id="btn-manual-pick">📍 Cambia o cerca via</button>
          </div>
        </div>
      `;

      const btn = this.cleaningCardsEl.querySelector('#btn-manual-pick');
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.manualStreetInput) {
            this.manualStreetInput.scrollIntoView({ behavior: 'smooth' });
            this.manualStreetInput.focus();
          }
        });
      }
      return;
    }

    const now = new Date();
    const isFav = state.isFavorite(loc.address);

    let html = `
      <div class="street-summary-header" style="display: flex; justify-content: space-between; align-items: center; margin: 12px 4px 6px;">
        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          Spazzamento Programmato (${features.length} ${features.length === 1 ? 'tratto' : 'tratti'})
        </span>
        <button id="btn-quick-fav" class="btn-chip ${isFav ? 'active' : ''}" title="Salva nei preferiti per ricevere le notifiche">
          ${isFav ? '❤️ Nei Preferiti (Avvisi attivi)' : '🤍 Salva nei Preferiti'}
        </button>
      </div>
    `;

    features.forEach(feat => {
      const p = feat.properties;
      const statusToday = getCleaningStatus(p, now, now);
      const nextDate = getNextCleaningDate(p, now);
      const relativeDays = nextDate ? formatRelativeDays(nextDate, now) : 'Non programmata';
      const fullDate = nextDate ? formatFullItalianDate(nextDate) : '';
      const dayName = DAY_CODES[p.giorno] || p.giorno;
      const weeksStr = (p.settimane || []).map(w => `${w}ª`).join(', ');
      const nightWarning = getNightCleaningWarning(p);
      const sides = getSideDescription(p);

      html += `
        <div class="card card-cleaning" data-id="${p.id || ''}">
          <div class="card-cleaning-header">
            <div>
              <h4 class="street-name">${p.via}</h4>
              <p class="street-stretch">${p.tratto || 'Intera via'}</p>
            </div>
            <span class="badge ${statusToday.badgeClass}">${statusToday.label}</span>
          </div>

          <div class="cleaning-details-grid">
            <div class="detail-item">
              <span class="detail-label">Orario Spazzamento</span>
              <span class="detail-val">⏰ ${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Cadenza Mensile</span>
              <span class="detail-val">📅 ${dayName} (${weeksStr} sett.)</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Lati Carreggiata</span>
              <span class="detail-val">🅿️ ${sides}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Prossima Pulizia</span>
              <span class="detail-val" style="color: var(--color-primary); font-weight: 700;">
                🗓️ ${relativeDays} <small style="display:block; font-size:0.75rem; font-weight:normal; color:var(--text-secondary);">${fullDate}</small>
              </span>
            </div>
          </div>

          ${nightWarning ? `<div class="night-banner">${nightWarning}</div>` : ''}

          <div style="margin-top: 10px; display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm btn-block btn-open-detail" data-street="${p.via}">
              Dettagli Completi & Mappa ➔
            </button>
          </div>
        </div>
      `;
    });

    this.cleaningCardsEl.innerHTML = html;

    // Listener per i bottoni rapidi
    const favBtn = this.cleaningCardsEl.querySelector('#btn-quick-fav');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const isFav = state.toggleFavorite(loc.address);
        if (isFav) {
          state.setNotificationsEnabled(true);
        }
      });
    }

    this.cleaningCardsEl.querySelectorAll('.btn-open-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const feats = dataService.getFeaturesForStreet(btn.dataset.street);
        if (feats && feats.length > 0) {
          state.setSelectedFeature(feats[0]);
        }
      });
    });
  }

  _renderErrorCard(errorMsg, isSecureError, isPermDenied) {
    if (!this.cleaningCardsEl) return;

    this.cleaningCardsEl.innerHTML = `
      <div class="card card-warning">
        <h4 style="font-weight: 700; margin-bottom: 6px;">📍 Posizione GPS non rilevata</h4>
        <p class="text-sm" style="margin-bottom: 12px;">${errorMsg}</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="btn-retry-gps" class="btn btn-primary btn-sm">🔄 Riprova GPS</button>
          <button id="btn-set-sample-street" class="btn btn-outline btn-sm">Usa Via di Test (San Frediano)</button>
        </div>
      </div>
    `;

    const retryBtn = this.cleaningCardsEl.querySelector('#btn-retry-gps');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        locationService.requestCurrentPosition().catch(() => {});
      });
    }

    const testBtn = this.cleaningCardsEl.querySelector('#btn-set-sample-street');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        locationService.setManualLocation('BORGO SAN FREDIANO');
      });
    }
  }

  _renderManualSuggestions(query) {
    if (!this.manualSuggestionsEl) return;
    if (!query || query.trim().length === 0) {
      this.manualSuggestionsEl.innerHTML = '';
      this.manualSuggestionsEl.style.display = 'none';
      return;
    }

    const matches = dataService.searchStreets(query, 6);
    if (matches.length === 0) {
      this.manualSuggestionsEl.innerHTML = '<div class="suggestion-empty">Nessuna via trovata</div>';
      this.manualSuggestionsEl.style.display = 'block';
      return;
    }

    this.manualSuggestionsEl.innerHTML = matches.map(via => `
      <div class="suggestion-item" data-street="${via}">
        <span>📍 ${via}</span>
      </div>
    `).join('');
    this.manualSuggestionsEl.style.display = 'block';

    this.manualSuggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const street = item.dataset.street;
        if (this.manualStreetInput) this.manualStreetInput.value = street;
        this.manualSuggestionsEl.style.display = 'none';
        locationService.setManualLocation(street);
      });
    });
  }
}
