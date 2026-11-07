/**
 * detail-sheet.js - Bottom sheet per dettagli completi della via, mappa e promemoria
 */

import { state } from '../state.js';
import { mapService } from '../map-service.js';
import {
  DAY_CODES,
  getNextCleaningDate,
  formatRelativeDays,
  formatFullItalianDate,
  getNightCleaningWarning,
  getSideDescription
} from '../schedule.js';

export class DetailSheet {
  constructor() {
    this.sheetEl = document.getElementById('street-detail-sheet');
    this.overlayEl = document.getElementById('sheet-backdrop');
    this.titleEl = document.getElementById('sheet-street-title');
    this.stretchEl = document.getElementById('sheet-street-stretch');
    this.bodyEl = document.getElementById('sheet-street-body');
    this.closeBtn = document.getElementById('btn-close-sheet');
    this.favBtn = document.getElementById('btn-sheet-toggle-fav');
    this.mapBtn = document.getElementById('btn-sheet-show-map');

    this.currentFeature = null;
    this.currentStreet = null;

    this._bindEvents();
  }

  _bindEvents() {
    state.on('feature:selected', feat => {
      if (feat) this.open(feat);
    });

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.overlayEl) {
      this.overlayEl.addEventListener('click', () => this.close());
    }

    if (this.favBtn) {
      this.favBtn.addEventListener('click', () => {
        if (this.currentStreet) {
          const isNowFav = state.toggleFavorite(this.currentStreet);
          if (isNowFav) {
            state.setNotificationsEnabled(true);
          }
          this._updateFavButton(isNowFav);
        }
      });
    }

    if (this.mapBtn) {
      this.mapBtn.addEventListener('click', () => {
        if (this.currentStreet) {
          this.close();
          // Passa alla tab Posizione o pulizia
          const tabPos = document.querySelector('.bottom-nav-item[data-sezione="posizione"]');
          if (tabPos) tabPos.click();
          mapService.highlightStreet(this.currentStreet);
        }
      });
    }

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
    });
  }

  open(feature) {
    if (!this.sheetEl || !feature) return;

    this.currentFeature = feature;
    const p = feature.properties || {};
    this.currentStreet = p.via;

    if (this.titleEl) this.titleEl.textContent = p.via || 'Dettagli Via';
    if (this.stretchEl) {
      this.stretchEl.textContent = p.tratto ? `Tratto: ${p.tratto}` : 'Intera carreggiata';
      this.stretchEl.style.display = 'block';
    }

    const dayName = DAY_CODES[p.giorno] || p.giorno;
    const weeksStr = (p.settimane || []).map(w => `${w}ª`).join(', ');

    const now = new Date();
    const nextDate = getNextCleaningDate(p, now);
    const relDays = nextDate ? formatRelativeDays(nextDate, now) : 'Non disponibile';
    const nextDateFormatted = nextDate ? formatFullItalianDate(nextDate) : 'Non disponibile';
    const nightWarn = getNightCleaningWarning(p);
    const sides = getSideDescription(p);

    if (this.bodyEl) {
      this.bodyEl.innerHTML = `
        <div class="sheet-info-grid">
          <div class="sheet-info-item">
            <span class="sheet-info-label">Giorno di Passaggio</span>
            <span class="sheet-info-value">📅 ${dayName}</span>
          </div>
          <div class="sheet-info-item">
            <span class="sheet-info-label">Orario Divieto di Sosta</span>
            <span class="sheet-info-value">⏰ ${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}</span>
          </div>
          <div class="sheet-info-item">
            <span class="sheet-info-label">Settimane del Mese</span>
            <span class="sheet-info-value">🔢 ${weeksStr} settimana</span>
          </div>
          <div class="sheet-info-item">
            <span class="sheet-info-label">Lati di Spazzamento</span>
            <span class="sheet-info-value">🅿️ ${sides}</span>
          </div>
        </div>

        <div class="sheet-next-cleaning-box">
          <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; margin-bottom: 2px;">
            Prossima Pulizia Programmata
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--color-primary);">
              ${nextDateFormatted}
            </div>
            <span class="badge ${relDays === 'Oggi' || relDays === 'Domani' ? 'badge-danger' : 'badge-neutral'}">${relDays}</span>
          </div>
        </div>

        ${nightWarn ? `<div class="night-banner" style="margin-top: 12px;">${nightWarn}</div>` : ''}
      `;
    }

    this._updateFavButton(state.isFavorite(this.currentStreet));

    this.sheetEl.classList.add('open');
    if (this.overlayEl) this.overlayEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (!this.sheetEl) return;
    this.sheetEl.classList.remove('open');
    if (this.overlayEl) this.overlayEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  _updateFavButton(isFav) {
    if (!this.favBtn) return;
    if (isFav) {
      this.favBtn.innerHTML = '❤️ Nei Preferiti (Avvisi attivi) • Rimuovi';
      this.favBtn.classList.remove('btn-primary');
      this.favBtn.classList.add('btn-secondary');
    } else {
      this.favBtn.innerHTML = '🤍 Aggiungi ai Preferiti (Ricevi avvisi)';
      this.favBtn.classList.remove('btn-secondary');
      this.favBtn.classList.add('btn-primary');
    }
  }
}
