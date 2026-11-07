/**
 * app.js - Entry point e coordinatore della nuova PWA Pulizia Strade Firenze
 */

import { state } from './state.js';
import { dataService } from './data-service.js';
import { locationService } from './location-service.js';
import { mapService } from './map-service.js';
import { notificationService } from './notification-service.js';
import { pwaService } from './pwa-service.js';

import { PositionView } from './views/position-view.js';
import { ScheduleView } from './views/schedule-view.js';
import { FavoritesView } from './views/favorites-view.js';
import { NotificationsView } from './views/notifications-view.js';
import { SettingsView } from './views/settings-view.js';
import { OtherView } from './views/other-view.js';
import { DetailSheet } from './views/detail-sheet.js';

class App {
  constructor() {
    this.currentSection = 'posizione';
    this.navButtons = document.querySelectorAll('.bottom-nav-item');
    this.sections = document.querySelectorAll('.sezione');
  }

  async init() {
    console.log('Avvio Nuova PWA Pulizia Strade Firenze 🧹');

    // 1. Inizializza viste
    this.positionView = new PositionView();
    this.scheduleView = new ScheduleView();
    this.favoritesView = new FavoritesView();
    this.notificationsView = new NotificationsView();
    this.settingsView = new SettingsView();
    this.otherView = new OtherView();
    this.detailSheet = new DetailSheet();

    // 2. Setup navigazione a schede
    this._setupNavigation();

    // 3. Inizializza PWA e Service Worker
    await pwaService.init();

    // 4. Carica dataset in background
    try {
      await dataService.init();
      console.log('Dataset caricato con successo.');
    } catch (e) {
      console.warn('Errore precaricamento dataset:', e);
    }

    // 5. Inizializza Mappa
    mapService.init('map');

    // 6. Avvia geolocalizzazione GPS
    locationService.startTracking();

    // 7. Ascolta messaggi da Service Worker
    this._setupServiceWorkerMessaging();

    // 8. Gestione deep links da hash URL
    this._handleUrlHash();
    window.addEventListener('hashchange', () => this._handleUrlHash());

    // 9. Eventi personalizzati dalla mappa
    window.addEventListener('selectStreetFeature', e => {
      const streetOrId = e.detail;
      const feats = dataService.getFeaturesForStreet(streetOrId);
      if (feats && feats.length > 0) {
        state.setSelectedFeature(feats[0]);
      }
    });
  }

  _setupNavigation() {
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetSection = btn.dataset.sezione;
        this.navigateTo(targetSection);
      });
    });
  }

  navigateTo(sectionId) {
    if (!sectionId) return;
    this.currentSection = sectionId;

    // Aggiorna pulsanti nav
    this.navButtons.forEach(btn => {
      if (btn.dataset.sezione === sectionId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Aggiorna visibilità sezioni
    this.sections.forEach(sec => {
      if (sec.id === `sezione-${sectionId}`) {
        sec.style.display = 'block';
        sec.classList.add('section-active');
      } else {
        sec.style.display = 'none';
        sec.classList.remove('section-active');
      }
    });

    // Azioni contestuali quando si cambia tab
    if (sectionId === 'posizione') {
      mapService.invalidateSize();
    } else if (sectionId === 'pulizia') {
      this.scheduleView.render();
      if (state.state.scheduleViewMode === 'map') {
        this.scheduleView._initOrUpdateScheduleMap();
      }
    } else if (sectionId === 'preferiti') {
      this.favoritesView.renderFavorites();
    } else if (sectionId === 'notifiche') {
      this.notificationsView.render();
    }

    // Scroll in cima
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  _handleUrlHash() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;

    const validTabs = ['posizione', 'pulizia', 'preferiti', 'notifiche', 'impostazioni'];
    const aliasMap = {
      pos: 'posizione',
      map: 'posizione',
      calendar: 'pulizia',
      fav: 'preferiti',
      notif: 'notifiche',
      settings: 'impostazioni'
    };

    const target = aliasMap[hash] || (validTabs.includes(hash) ? hash : null);
    if (target) {
      this.navigateTo(target);
    }
  }

  _setupServiceWorkerMessaging() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', event => {
      if (!event.data) return;

      if (event.data.type === 'OPEN_STREET_DETAIL') {
        const street = event.data.street;
        const feats = dataService.getFeaturesForStreet(street);
        if (feats && feats.length > 0) {
          state.setSelectedFeature(feats[0]);
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch(err => {
    console.error('Errore inizializzazione App:', err);
  });
});
