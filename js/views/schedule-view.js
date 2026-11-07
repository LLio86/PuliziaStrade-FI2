/**
 * schedule-view.js - Vista Calendario e Pulizia del Giorno (Elenco paginato & Mappa interattiva)
 */

import { state } from '../state.js';
import { dataService } from '../data-service.js';
import { mapService } from '../map-service.js';
import {
  DAY_CODES,
  getCleaningStatus,
  formatFullItalianDate,
  getNightCleaningWarning,
  getSideDescription
} from '../schedule.js';

export class ScheduleView {
  constructor() {
    this.container = document.getElementById('sezione-pulizia');
    this.titleEl = document.getElementById('schedule-title');
    this.dateChipsEl = document.getElementById('schedule-date-chips');
    this.datePickerInput = document.getElementById('schedule-date-picker');
    this.statsEl = document.getElementById('schedule-stats');
    this.filterChipsEl = document.getElementById('schedule-filter-chips');
    this.searchBarInput = document.getElementById('schedule-search-input');
    this.listContainerEl = document.getElementById('schedule-list-container');
    this.mapContainerEl = document.getElementById('schedule-map-container');
    this.viewToggleBtn = document.getElementById('btn-toggle-schedule-view');

    this.visibleCount = 40;
    this._filteredFeatures = [];
    this.scheduleMap = null;
    this.scheduleMapLayer = null;

    this._bindEvents();
    this.render();
  }

  _bindEvents() {
    state.on('scheduleDate:changed', () => {
      this.visibleCount = 40;
      this.render();
    });

    state.on('scheduleFilter:changed', () => {
      this.visibleCount = 40;
      this.renderList();
    });

    state.on('scheduleSearch:changed', () => {
      this.visibleCount = 40;
      this.renderList();
    });

    state.on('scheduleView:changed', mode => {
      this._updateViewMode(mode);
    });

    if (this.datePickerInput) {
      this.datePickerInput.addEventListener('change', e => {
        if (e.target.value) {
          const [y, m, d] = e.target.value.split('-').map(Number);
          state.setSelectedDate(new Date(y, m - 1, d));
        }
      });
    }

    if (this.searchBarInput) {
      this.searchBarInput.addEventListener('input', e => {
        state.setScheduleSearch(e.target.value);
      });
    }

    if (this.viewToggleBtn) {
      this.viewToggleBtn.addEventListener('click', () => {
        const nextMode = state.state.scheduleViewMode === 'list' ? 'map' : 'list';
        state.setScheduleViewMode(nextMode);
      });
    }
  }

  render() {
    const selectedDate = state.state.selectedDate;
    const now = new Date();

    if (this.titleEl) {
      const fullDateStr = formatFullItalianDate(selectedDate);
      this.titleEl.textContent = `📅 Pulizia: ${fullDateStr}`;
    }

    this._renderDateChips(selectedDate, now);

    const allFeatures = dataService.getFeaturesForDate(selectedDate);

    this._renderStats(allFeatures, selectedDate, now);
    this._renderFilterChips();
    this.renderList();

    if (state.state.scheduleViewMode === 'map') {
      this._renderMapFeatures(allFeatures, selectedDate);
    }
  }

  _renderDateChips(selectedDate, now) {
    if (!this.dateChipsEl) return;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    const isSameDate = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    const isToday = isSameDate(selectedDate, today);
    const isTomorrow = isSameDate(selectedDate, tomorrow);
    const isDayAfter = isSameDate(selectedDate, dayAfter);
    const isCustom = !isToday && !isTomorrow && !isDayAfter;

    this.dateChipsEl.innerHTML = `
      <button class="chip ${isToday ? 'active' : ''}" data-type="today">Oggi</button>
      <button class="chip ${isTomorrow ? 'active' : ''}" data-type="tomorrow">Domani</button>
      <button class="chip ${isDayAfter ? 'active' : ''}" data-type="dayafter">Dopodomani</button>
      <label class="chip chip-calendar ${isCustom ? 'active' : ''}">
        🗓️ Scegli Data
        <input type="date" id="schedule-date-picker" style="position: absolute; opacity: 0; width: 0; height: 0;" />
      </label>
    `;

    this.dateChipsEl.querySelectorAll('.chip[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type === 'today') state.setSelectedDate(new Date(today));
        else if (type === 'tomorrow') state.setSelectedDate(new Date(tomorrow));
        else if (type === 'dayafter') state.setSelectedDate(new Date(dayAfter));
      });
    });

    const picker = this.dateChipsEl.querySelector('#schedule-date-picker');
    if (picker) {
      picker.addEventListener('change', e => {
        if (e.target.value) {
          const [y, m, d] = e.target.value.split('-').map(Number);
          state.setSelectedDate(new Date(y, m - 1, d));
        }
      });
    }
  }

  _renderStats(features, selectedDate, now) {
    if (!this.statsEl) return;

    let inCorso = 0;
    let inArrivo = 0;
    let concluse = 0;

    features.forEach(f => {
      const st = getCleaningStatus(f.properties, selectedDate, now);
      if (st.key === 'in_corso') inCorso++;
      else if (st.key === 'in_arrivo') inArrivo++;
      else if (st.key === 'conclusa') concluse++;
    });

    this.statsEl.innerHTML = `
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-num">${features.length}</span>
          <span class="stat-desc">Strade totali</span>
        </div>
        <div class="stat-card stat-warning">
          <span class="stat-num">${inCorso}</span>
          <span class="stat-desc">In corso 🧹</span>
        </div>
        <div class="stat-card stat-danger">
          <span class="stat-num">${inArrivo}</span>
          <span class="stat-desc">In arrivo ⏳</span>
        </div>
        <div class="stat-card stat-success">
          <span class="stat-num">${concluse}</span>
          <span class="stat-desc">Concluse ✅</span>
        </div>
      </div>
    `;
  }

  _renderFilterChips() {
    if (!this.filterChipsEl) return;
    const current = state.state.scheduleFilter;

    const filters = [
      { id: 'tutte', label: 'Tutte' },
      { id: 'in_corso', label: 'In corso 🧹' },
      { id: 'in_arrivo', label: 'In arrivo ⏳' },
      { id: 'conclusa', label: 'Concluse ✅' }
    ];

    this.filterChipsEl.innerHTML = filters.map(f => `
      <button class="chip ${current === f.id ? 'active' : ''}" data-filter="${f.id}">
        ${f.label}
      </button>
    `).join('');

    this.filterChipsEl.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.setScheduleFilter(btn.dataset.filter);
      });
    });
  }

  renderList() {
    if (!this.listContainerEl) return;

    const selectedDate = state.state.selectedDate;
    const now = new Date();
    const filter = state.state.scheduleFilter;
    const search = state.state.scheduleSearch.trim().toUpperCase();

    const allFeatures = dataService.getFeaturesForDate(selectedDate);

    this._filteredFeatures = allFeatures.filter(f => {
      const p = f.properties || {};
      const status = getCleaningStatus(p, selectedDate, now);

      if (filter !== 'tutte' && status.key !== filter) return false;

      if (search) {
        const via = (p.via || '').toUpperCase();
        const tratto = (p.tratto || '').toUpperCase();
        if (!via.includes(search) && !tratto.includes(search)) return false;
      }

      return true;
    });

    if (this._filteredFeatures.length === 0) {
      this.listContainerEl.innerHTML = `
        <div class="card text-center" style="padding: 30px 16px;">
          <span style="font-size: 2rem; display: block; margin-bottom: 8px;">🔍</span>
          <h4 style="font-weight: 700; margin-bottom: 4px;">Nessuna strada trovata</h4>
          <p class="text-sm text-secondary">Nessun turno di pulizia corrisponde ai filtri selezionati per questa data.</p>
        </div>
      `;
      return;
    }

    const visibleItems = this._filteredFeatures.slice(0, this.visibleCount);

    let html = visibleItems.map(feat => {
      const p = feat.properties || {};
      const status = getCleaningStatus(p, selectedDate, now);
      const night = getNightCleaningWarning(p);
      const sides = getSideDescription(p);

      return `
        <div class="card card-cleaning card-clickable" data-id="${p.id || ''}" data-street="${p.via}">
          <div class="card-cleaning-header">
            <div>
              <h4 class="street-name">${p.via}</h4>
              <p class="street-stretch">${p.tratto || 'Intera via'}</p>
            </div>
            <span class="badge ${status.badgeClass}">${status.label}</span>
          </div>

          <div class="cleaning-meta-inline">
            <span>⏰ ${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}</span>
            <span>🅿️ ${sides}</span>
          </div>

          ${night ? `<div class="night-banner-compact">${night}</div>` : ''}
        </div>
      `;
    }).join('');

    if (this._filteredFeatures.length > this.visibleCount) {
      const remaining = this._filteredFeatures.length - this.visibleCount;
      html += `
        <div style="text-align: center; margin: 16px 0;">
          <button id="btn-load-more" class="btn btn-outline btn-block">
            Mostra altre strade (${remaining} rimanenti)
          </button>
        </div>
      `;
    }

    this.listContainerEl.innerHTML = html;

    const loadMoreBtn = this.listContainerEl.querySelector('#btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.visibleCount += 40;
        this.renderList();
      });
    }

    this.listContainerEl.querySelectorAll('.card-clickable').forEach(card => {
      card.addEventListener('click', () => {
        const street = card.dataset.street;
        const feats = dataService.getFeaturesForStreet(street);
        if (feats && feats.length > 0) {
          state.setSelectedFeature(feats[0]);
        }
      });
    });
  }

  _updateViewMode(mode) {
    if (mode === 'map') {
      if (this.listContainerEl) this.listContainerEl.style.display = 'none';
      if (this.mapContainerEl) this.mapContainerEl.style.display = 'block';
      if (this.viewToggleBtn) this.viewToggleBtn.textContent = '📋 Vista Elenco';

      this._initOrUpdateScheduleMap();
    } else {
      if (this.listContainerEl) this.listContainerEl.style.display = 'block';
      if (this.mapContainerEl) this.mapContainerEl.style.display = 'none';
      if (this.viewToggleBtn) this.viewToggleBtn.textContent = '🗺️ Vista Mappa';
    }
  }

  _initOrUpdateScheduleMap() {
    if (!this.scheduleMap) {
      this.mapContainerEl.innerHTML = '<div id="schedule-map" style="height: 480px; width: 100%; border-radius: var(--radius-lg); overflow: hidden;"></div>';

      this.scheduleMap = L.map('schedule-map', {
        zoomControl: true,
        attributionControl: false
      }).setView([43.7696, 11.2558], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.scheduleMap);

      this.scheduleMapLayer = L.featureGroup().addTo(this.scheduleMap);
    }

    const allFeatures = dataService.getFeaturesForDate(state.state.selectedDate);
    this._renderMapFeatures(allFeatures, state.state.selectedDate);
  }

  _renderMapFeatures(features, date) {
    if (!this.scheduleMap || !this.scheduleMapLayer) return;

    this.scheduleMapLayer.clearLayers();
    const now = new Date();

    features.forEach(feat => {
      if (!feat.geometry) return;
      const p = feat.properties || {};
      const status = getCleaningStatus(p, date, now);

      let color = status.key === 'in_corso' ? '#f59e0b' : (status.key === 'in_arrivo' ? '#ef4444' : '#10b981');

      const layer = L.geoJSON(feat, {
        style: { color, weight: 5, opacity: 0.85 }
      });

      layer.bindPopup(`
        <div style="font-family: inherit; font-size: 0.82rem;">
          <b>${p.via}</b><br>
          <small>${p.tratto || 'Intera via'}</small><br>
          <span style="color:${color}; font-weight:700;">${status.label}</span> (${p.ora_inizio}-${p.ora_fine})
        </div>
      `);

      layer.on('click', () => {
        state.setSelectedFeature(feat);
      });

      this.scheduleMapLayer.addLayer(layer);
    });

    setTimeout(() => this.scheduleMap.invalidateSize(), 200);
  }
}
