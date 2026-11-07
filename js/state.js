/**
 * state.js - Gestione reattiva dello stato applicativo con persistenza LocalStorage
 */

const STORAGE_KEY_SETTINGS = 'pulizia_fi_nuova_settings';
const STORAGE_KEY_FAVORITES = 'pulizia_fi_nuova_favorites';
const STORAGE_KEY_NOTIF_LOG = 'pulizia_fi_nuova_notif_log';
const STORAGE_KEY_NOTIFIED_TAGS = 'pulizia_fi_nuova_notified_tags';

class State {
  constructor() {
    this.listeners = new Map();

    const savedSettings = this._loadJSON(STORAGE_KEY_SETTINGS, {});
    const savedFavorites = this._loadJSON(STORAGE_KEY_FAVORITES, [
      'BORGO SAN FREDIANO',
      'PIAZZA SANTO SPIRITO'
    ]);
    const savedNotifLog = this._loadJSON(STORAGE_KEY_NOTIF_LOG, []);
    const savedNotifiedTags = this._loadJSON(STORAGE_KEY_NOTIFIED_TAGS, {});

    // Orari multipli di notifica (default ore 19:00)
    let initialHours = [19];
    if (Array.isArray(savedSettings.notificationHours) && savedSettings.notificationHours.length > 0) {
      initialHours = savedSettings.notificationHours.map(Number);
    } else if (savedSettings.notificationHour) {
      initialHours = [parseInt(savedSettings.notificationHour, 10)];
    }

    this.state = {
      // Geolocalizzazione
      userLocation: {
        lat: null,
        lng: null,
        accuracy: null,
        address: null,
        inFlorence: true,
        hasGpsFix: false,
        loading: false,
        error: null,
        isPermissionDenied: false,
        isSecureContextError: false,
        timestamp: null
      },
      trackingActive: true,

      // Preferiti (tutte le strade che ricevono la notifica il giorno prima)
      favorites: savedFavorites,

      // Notifiche push e promemoria
      notificationsEnabled: savedSettings.notificationsEnabled ?? false,
      notificationHours: initialHours, // Array di orari es. [18, 20]
      notificationLog: savedNotifLog,
      notifiedTags: savedNotifiedTags,

      // Calendario e filtri
      selectedDate: new Date(),
      scheduleFilter: 'tutte',
      scheduleSearch: '',
      scheduleViewMode: 'list', // 'list' | 'map'
      selectedFeature: null,

      // Temi e Accessibilità
      theme: savedSettings.theme || 'scuro',
      autoTheme: savedSettings.autoTheme ?? true,
      fontSize: savedSettings.fontSize || 1.0
    };
  }

  // ================= Pub/Sub Event System =================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, list);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Errore nel listener per evento "${event}":`, err);
      }
    });
  }

  // ================= Azioni di Stato =================

  setUserLocation(patch) {
    this.state.userLocation = { ...this.state.userLocation, ...patch };
    this.emit('location:updated', this.state.userLocation);
  }

  setTrackingActive(active) {
    this.state.trackingActive = active;
    this.emit('tracking:changed', active);
  }

  // --- Preferiti (Strade monitorate) ---
  toggleFavorite(streetName) {
    if (!streetName) return false;
    const clean = streetName.trim();
    const index = this.state.favorites.indexOf(clean);
    let isFav = false;

    if (index >= 0) {
      this.state.favorites.splice(index, 1);
      isFav = false;
    } else {
      this.state.favorites.push(clean);
      isFav = true;
    }

    this._saveJSON(STORAGE_KEY_FAVORITES, this.state.favorites);
    this.emit('favorites:changed', this.state.favorites);
    return isFav;
  }

  isFavorite(streetName) {
    if (!streetName) return false;
    return this.state.favorites.includes(streetName.trim());
  }

  // --- Notifiche Push Semplificate ---
  setNotificationsEnabled(enabled) {
    this.state.notificationsEnabled = !!enabled;
    this._persistSettings();
    this.emit('notificationsEnabled:changed', this.state.notificationsEnabled);
  }

  toggleNotificationHour(hour) {
    const h = parseInt(hour, 10);
    const idx = this.state.notificationHours.indexOf(h);

    if (idx >= 0) {
      if (this.state.notificationHours.length > 1) {
        this.state.notificationHours.splice(idx, 1);
      }
    } else {
      this.state.notificationHours.push(h);
      this.state.notificationHours.sort((a, b) => a - b);
    }

    this._persistSettings();
    this.emit('notificationHours:changed', this.state.notificationHours);
  }

  setNotificationHours(hours) {
    if (Array.isArray(hours) && hours.length > 0) {
      this.state.notificationHours = hours.map(Number).sort((a, b) => a - b);
    } else {
      this.state.notificationHours = [19];
    }
    this._persistSettings();
    this.emit('notificationHours:changed', this.state.notificationHours);
  }

  logNotification(entry) {
    const logItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toISOString(),
      ...entry
    };
    this.state.notificationLog.unshift(logItem);
    if (this.state.notificationLog.length > 50) {
      this.state.notificationLog.pop();
    }
    this._saveJSON(STORAGE_KEY_NOTIF_LOG, this.state.notificationLog);
    this.emit('notificationLog:updated', this.state.notificationLog);
  }

  isTagNotified(tag) {
    return !!this.state.notifiedTags[tag];
  }

  markTagNotified(tag) {
    this.state.notifiedTags[tag] = Date.now();
    this._saveJSON(STORAGE_KEY_NOTIFIED_TAGS, this.state.notifiedTags);
  }

  clearNotificationHistory() {
    this.state.notificationLog = [];
    this.state.notifiedTags = {};
    this._saveJSON(STORAGE_KEY_NOTIF_LOG, []);
    this._saveJSON(STORAGE_KEY_NOTIFIED_TAGS, {});
    this.emit('notificationLog:updated', []);
  }

  // --- Calendario e Filtri ---
  setSelectedDate(date) {
    this.state.selectedDate = date;
    this.emit('scheduleDate:changed', date);
  }

  setScheduleFilter(filter) {
    this.state.scheduleFilter = filter;
    this.emit('scheduleFilter:changed', filter);
  }

  setScheduleSearch(query) {
    this.state.scheduleSearch = query;
    this.emit('scheduleSearch:changed', query);
  }

  setScheduleViewMode(mode) {
    this.state.scheduleViewMode = mode;
    this.emit('scheduleView:changed', mode);
  }

  setSelectedFeature(feature) {
    this.state.selectedFeature = feature;
    this.emit('feature:selected', feature);
  }

  // --- Temi e UI ---
  setTheme(theme) {
    this.state.theme = theme;
    this._persistSettings();
    this.emit('theme:changed', theme);
  }

  setAutoTheme(auto) {
    this.state.autoTheme = auto;
    this._persistSettings();
    this.emit('autoTheme:changed', auto);
  }

  setFontSize(scale) {
    this.state.fontSize = scale;
    this._persistSettings();
    this.emit('fontSize:changed', scale);
  }

  // ================= Persistenza Locale =================

  _persistSettings() {
    const settings = {
      theme: this.state.theme,
      autoTheme: this.state.autoTheme,
      fontSize: this.state.fontSize,
      notificationsEnabled: this.state.notificationsEnabled,
      notificationHours: this.state.notificationHours
    };
    this._saveJSON(STORAGE_KEY_SETTINGS, settings);
  }

  _loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  _saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }
}

export const state = new State();
