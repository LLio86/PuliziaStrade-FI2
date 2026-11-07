/**
 * notification-service.js - Motore Notifiche Push PWA per Tutte le Strade Preferite
 */

import { state } from './state.js';
import { dataService } from './data-service.js';
import {
  getDayBeforeAlertInfo,
  getNextCleaningDate,
  formatFullItalianDate,
  formatRelativeDays,
  getNightCleaningWarning,
  getSideDescription
} from './schedule.js';

class NotificationService {
  constructor() {
    this.swRegistration = null;
    this.checkIntervalId = null;
    this.isSupported = 'Notification' in window && 'serviceWorker' in navigator;
  }

  async init(swReg = null) {
    if (swReg) {
      this.swRegistration = swReg;
    } else if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.ready;
      } catch (e) {
        console.warn('Service Worker non ancora pronto per le notifiche:', e);
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'TRIGGER_SCHEDULED_CHECK') {
          this.checkDayBeforeCleanings();
        }
      });
    }

    this._startSchedulerLoop();

    // Ricalcola notifiche quando cambiano i preferiti o le impostazioni
    state.on('favorites:changed', () => this.checkDayBeforeCleanings());
    state.on('notificationHours:changed', () => this.checkDayBeforeCleanings());
    state.on('notificationsEnabled:changed', enabled => {
      if (enabled) this.checkDayBeforeCleanings();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.state.notificationsEnabled) {
        this.checkDayBeforeCleanings();
      }
    });
  }

  getPermissionStatus() {
    if (!this.isSupported) return 'unsupported';
    return Notification.permission;
  }

  async requestPermission() {
    if (!this.isSupported) {
      alert('Il tuo browser non supporta le notifiche web push.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      state.setNotificationsEnabled(granted);

      if (granted) {
        this.subscribePushManager();
        setTimeout(() => this.checkDayBeforeCleanings(), 500);
      }

      return granted;
    } catch (err) {
      console.error('Errore nella richiesta permessi notifica:', err);
      return false;
    }
  }

  async subscribePushManager() {
    if (!this.swRegistration || !('pushManager' in this.swRegistration)) {
      return null;
    }

    try {
      let sub = await this.swRegistration.pushManager.getSubscription();
      if (!sub) {
        const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
        const convertedKey = this._urlBase64ToUint8Array(vapidPublicKey);

        sub = await this.swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        });
        console.log('Sottoscrizione Web Push creata:', sub);
      }
      return sub;
    } catch (e) {
      console.log('Nota Push Manager (locale): il browser utilizzerà le notifiche Service Worker:', e);
      return null;
    }
  }

  async showNotification(title, options = {}) {
    const defaultOptions = {
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'pulizia-firenze-' + Date.now(),
      renotify: true,
      data: {
        url: './index.html#notifiche',
        timestamp: Date.now()
      },
      actions: [
        { action: 'open_app', title: 'Apri Dettagli 🚗' },
        { action: 'dismiss', title: 'Ho Capito ✓' }
      ]
    };

    const finalOptions = { ...defaultOptions, ...options };

    if (this.swRegistration && this.swRegistration.showNotification) {
      try {
        await this.swRegistration.showNotification(title, finalOptions);
        state.logNotification({
          title,
          body: finalOptions.body || '',
          street: finalOptions.data?.street || '',
          type: 'push'
        });
        return true;
      } catch (err) {
        console.warn('showNotification su SW fallita, provo fallback diretto:', err);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, finalOptions);
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
        state.logNotification({
          title,
          body: finalOptions.body || '',
          street: finalOptions.data?.street || '',
          type: 'window'
        });
        return true;
      } catch (err) {
        console.error('Fallback Notification API fallito:', err);
      }
    }

    return false;
  }

  async sendTestNotification() {
    const hasPerm = this.getPermissionStatus() === 'granted';
    if (!hasPerm) {
      const ok = await this.requestPermission();
      if (!ok) {
        alert('Per ricevere il test devi autorizzare le notifiche nel browser.');
        return false;
      }
    }

    const favs = state.state.favorites || [];
    const favSummary = favs.length > 0 ? favs.join(', ') : 'le tue vie preferite';
    const hours = (state.state.notificationHours || [19]).map(h => `${h}:00`).join(', ');

    return this.showNotification('🧹 Pulizia Strade Firenze - Test Notifiche', {
      body: `Test riuscito! Riceverai gli avvisi il giorno prima alle ore ${hours} per tutti i tuoi preferiti (${favSummary}).`,
      tag: 'test-notification-' + Date.now(),
      data: {
        url: './index.html#notifiche'
      }
    });
  }

  /**
   * ==========================================================================
   * CONTROLLO GIORNO PRIMA PER TUTTI I PREFERITI SU ORARI MULTIPLI
   * ==========================================================================
   */
  async checkDayBeforeCleanings(forceNow = false) {
    if (!state.state.notificationsEnabled && !forceNow) {
      return 0;
    }

    if (this.getPermissionStatus() !== 'granted') {
      return 0;
    }

    await dataService.init();

    const favorites = state.state.favorites || [];
    if (favorites.length === 0) {
      return 0;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const selectedHours = state.state.notificationHours || [19];

    let sentCount = 0;

    for (const streetName of favorites) {
      const features = dataService.getFeaturesForStreet(streetName);
      if (!features || features.length === 0) continue;

      for (const feat of features) {
        const alertInfo = getDayBeforeAlertInfo(feat.properties, now);
        if (!alertInfo) continue;

        // Verifica se l'orario attuale rientra in uno degli orari scelti dall'utente
        for (const targetHour of selectedHours) {
          const slotTag = `${alertInfo.tag}-h${targetHour}`;

          if (!forceNow && currentHour < targetHour) {
            continue; // Non è ancora arrivata quest'ora di avviso
          }

          if (state.isTagNotified(slotTag) && !forceNow) {
            continue; // Già inviato per questa fascia oraria
          }

          await this.showNotification(alertInfo.title, {
            body: alertInfo.body,
            tag: slotTag,
            data: {
              street: streetName,
              url: `./index.html#notifiche`
            }
          });

          state.markTagNotified(slotTag);
          sentCount++;
        }
        break;
      }
    }

    return sentCount;
  }

  /**
   * Simula l'avviso che l'utente riceverà il giorno prima per una via preferita
   */
  async simulateDayBeforeAlert() {
    const hasPerm = this.getPermissionStatus() === 'granted';
    if (!hasPerm) {
      const ok = await this.requestPermission();
      if (!ok) {
        alert('Autorizza le notifiche per provare la simulazione.');
        return null;
      }
    }

    await dataService.init();

    const favorites = state.state.favorites || [];
    if (favorites.length === 0) {
      alert('Non hai ancora aggiunto nessuna via ai Preferiti. Aggiungine una per simulare la notifica.');
      return null;
    }

    const now = new Date();
    let bestFeature = null;
    let nextDate = null;

    // Trova la pulizia più imminente tra tutte le vie preferite
    for (const street of favorites) {
      const features = dataService.getFeaturesForStreet(street);
      if (!features) continue;

      for (const f of features) {
        const d = getNextCleaningDate(f.properties, now);
        if (d && (!nextDate || d < nextDate)) {
          nextDate = d;
          bestFeature = f;
        }
      }
    }

    if (!bestFeature) {
      bestFeature = dataService.getFeaturesForStreet(favorites[0])?.[0];
      nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }

    const p = bestFeature.properties;
    const isNight = p.notturno || (p.ora_inizio && p.ora_inizio.startsWith('00:'));
    const timeSlot = `${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}`;
    const dateFormatted = formatFullItalianDate(nextDate);
    const sides = getSideDescription(p);
    const stretch = p.tratto ? ` (${p.tratto})` : '';

    let title = '';
    let body = '';

    if (isNight) {
      title = `🚨 Pulizia STANOTTE: ${p.via}`;
      body = `[Avviso Giorno Prima]\nAttenzione! Stanotte a mezzanotte scatta il divieto di sosta in ${p.via}${stretch} (${timeSlot}, ${sides}). Sposta l'auto entro le 00:00!`;
    } else {
      title = `🧹 Pulizia Domani: ${p.via}`;
      body = `[Avviso Giorno Prima]\nPromemoria per ${dateFormatted}: pulizia strade programmata in ${p.via}${stretch} ore ${timeSlot} (${sides}).`;
    }

    await this.showNotification(title, {
      body,
      tag: 'simulazione-' + Date.now(),
      data: {
        street: p.via,
        url: './index.html#notifiche'
      }
    });

    return { title, body, nextDate, street: p.via };
  }

  /**
   * Calcola i dettagli dei prossimi avvisi per tutte le vie preferite
   */
  async getNextScheduledAlertInfo() {
    await dataService.init();

    const favorites = state.state.favorites || [];
    if (favorites.length === 0) return null;

    const now = new Date();
    const alerts = [];

    for (const street of favorites) {
      const features = dataService.getFeaturesForStreet(street);
      if (!features || features.length === 0) continue;

      let nextDate = null;
      let primaryFeature = null;

      for (const f of features) {
        const d = getNextCleaningDate(f.properties, now);
        if (d && (!nextDate || d < nextDate)) {
          nextDate = d;
          primaryFeature = f;
        }
      }

      if (nextDate && primaryFeature) {
        const dayBefore = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate() - 1);
        alerts.push({
          street,
          cleaningDate: nextDate,
          cleaningDateFormatted: formatFullItalianDate(nextDate),
          cleaningRelative: formatRelativeDays(nextDate, now),
          alertDate: dayBefore,
          alertDateFormatted: formatFullItalianDate(dayBefore),
          feature: primaryFeature
        });
      }
    }

    alerts.sort((a, b) => a.cleaningDate - b.cleaningDate);
    return alerts;
  }

  _startSchedulerLoop() {
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    this.checkIntervalId = setInterval(() => {
      this.checkDayBeforeCleanings();
    }, 15 * 60 * 1000);
  }

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const notificationService = new NotificationService();
