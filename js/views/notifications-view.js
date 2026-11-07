/**
 * notifications-view.js - Scheda Notifiche Semplificata (Attivazione, Orari Multipli e Preferiti)
 */

import { state } from '../state.js';
import { notificationService } from '../notification-service.js';

export class NotificationsView {
  constructor() {
    this.container = document.getElementById('sezione-notifiche');

    this.toggleNotifSwitch = document.getElementById('notif-master-switch');
    this.permBadgeEl = document.getElementById('notif-perm-badge');
    this.btnEnableNotif = document.getElementById('btn-enable-notif');
    this.hoursContainerEl = document.getElementById('notif-hours-chips');
    this.hoursSummaryEl = document.getElementById('notif-hours-summary');
    this.favStreetsBoxEl = document.getElementById('notif-fav-streets-box');

    this.btnTestImmediate = document.getElementById('btn-test-notif-now');
    this.btnSimulateDayBefore = document.getElementById('btn-simulate-day-before');

    this.availableHours = [8, 12, 14, 18, 19, 20, 21, 22];

    this._bindEvents();
    this.render();
  }

  _bindEvents() {
    state.on('notificationsEnabled:changed', () => this.render());
    state.on('notificationHours:changed', () => this.render());
    state.on('favorites:changed', () => this._renderFavoritesList());

    // Switcher master notifiche
    if (this.toggleNotifSwitch) {
      this.toggleNotifSwitch.addEventListener('change', async e => {
        const active = e.target.checked;
        if (active) {
          const perm = await notificationService.requestPermission();
          if (!perm) {
            e.target.checked = false;
            state.setNotificationsEnabled(false);
            alert('Per attivare le notifiche è necessario consentire l\'autorizzazione nel browser.');
          }
        } else {
          state.setNotificationsEnabled(false);
        }
        this.render();
      });
    }

    if (this.btnEnableNotif) {
      this.btnEnableNotif.addEventListener('click', async () => {
        const ok = await notificationService.requestPermission();
        if (ok) {
          state.setNotificationsEnabled(true);
        } else {
          alert('Permesso notifiche negato dal browser. Controlla le impostazioni del sito o del browser.');
        }
        this.render();
      });
    }

    // Test notifica immediata
    if (this.btnTestImmediate) {
      this.btnTestImmediate.addEventListener('click', async () => {
        const result = await notificationService.sendTestNotification();
        if (result) {
          this._showToast('Notifica push di prova inviata con successo!');
        }
      });
    }

    // Simula avviso giorno prima per le vie preferite
    if (this.btnSimulateDayBefore) {
      this.btnSimulateDayBefore.addEventListener('click', async () => {
        const sim = await notificationService.simulateDayBeforeAlert();
        if (sim) {
          this._showToast(`Avviso del giorno prima simulato per ${sim.street}!`);
        }
      });
    }
  }

  async render() {
    this._renderPermissionStatus();
    this._renderHoursChips();
    await this._renderFavoritesList();
  }

  _renderPermissionStatus() {
    const perm = notificationService.getPermissionStatus();
    const isEnabled = state.state.notificationsEnabled;

    if (this.toggleNotifSwitch) {
      this.toggleNotifSwitch.checked = isEnabled && perm === 'granted';
    }

    if (!this.permBadgeEl) return;

    if (perm === 'granted' && isEnabled) {
      this.permBadgeEl.className = 'status-badge status-badge-success';
      this.permBadgeEl.innerHTML = '● Notifiche Attive';
      if (this.btnEnableNotif) this.btnEnableNotif.style.display = 'none';
    } else if (perm === 'denied') {
      this.permBadgeEl.className = 'status-badge status-badge-danger';
      this.permBadgeEl.innerHTML = '● Bloccate nel Browser';
      if (this.btnEnableNotif) {
        this.btnEnableNotif.style.display = 'block';
        this.btnEnableNotif.textContent = 'Come sbloccare i permessi';
      }
    } else {
      this.permBadgeEl.className = 'status-badge status-badge-warning';
      this.permBadgeEl.innerHTML = '● Non Attivate';
      if (this.btnEnableNotif) {
        this.btnEnableNotif.style.display = 'block';
        this.btnEnableNotif.textContent = '🔔 Consenti Notifiche';
      }
    }
  }

  _renderHoursChips() {
    if (!this.hoursContainerEl) return;

    const selectedHours = state.state.notificationHours || [19];

    this.hoursContainerEl.innerHTML = this.availableHours.map(hour => {
      const isSelected = selectedHours.includes(hour);
      const label = `${String(hour).padStart(2, '0')}:00`;
      return `
        <button type="button" class="hour-chip ${isSelected ? 'active' : ''}" data-hour="${hour}">
          ${label}
        </button>
      `;
    }).join('');

    this.hoursContainerEl.querySelectorAll('.hour-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseInt(btn.dataset.hour, 10);
        state.toggleNotificationHour(hour);
      });
    });

    if (this.hoursSummaryEl) {
      const formatted = selectedHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ');
      this.hoursSummaryEl.textContent = `Riceverai l'avviso il giorno prima alle ore: ${formatted}`;
    }
  }

  async _renderFavoritesList() {
    if (!this.favStreetsBoxEl) return;

    const favorites = state.state.favorites || [];

    if (favorites.length === 0) {
      this.favStreetsBoxEl.innerHTML = `
        <div class="card text-center" style="padding: 24px 16px; margin: 0;">
          <span style="font-size: 2rem; display: block; margin-bottom: 6px;">❤️</span>
          <h4 style="font-weight: 700; margin-bottom: 4px;">Nessuna via nei Preferiti</h4>
          <p class="text-xs text-secondary" style="margin-bottom: 12px;">
            Aggiungi le vie dove parcheggi abitualmente per ricevere le notifiche il giorno prima dello spazzamento.
          </p>
          <button id="btn-goto-fav" class="btn btn-outline btn-sm">
            Vai a Preferiti ➔
          </button>
        </div>
      `;

      const btn = this.favStreetsBoxEl.querySelector('#btn-goto-fav');
      if (btn) {
        btn.addEventListener('click', () => {
          const favNav = document.querySelector('.bottom-nav-item[data-sezione="preferiti"]');
          if (favNav) favNav.click();
        });
      }
      return;
    }

    const scheduledAlerts = await notificationService.getNextScheduledAlertInfo();

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="text-xs text-secondary" style="font-weight: 700; text-transform: uppercase;">
          Strade Monitorate (${favorites.length})
        </span>
        <button id="btn-manage-favs" class="btn-chip" style="cursor: pointer;">
          Modifica ❤️
        </button>
      </div>
    `;

    if (scheduledAlerts && scheduledAlerts.length > 0) {
      html += scheduledAlerts.map(item => {
        const p = item.feature?.properties || {};
        const isNight = p.notturno || (p.ora_inizio && p.ora_inizio.startsWith('00:'));
        const timeSlot = `${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}`;
        const isTomorrow = item.cleaningRelative === 'Domani' || item.cleaningRelative === 'Oggi';
        const isSoon = item.cleaningRelative === 'Dopodomani' || item.cleaningRelative === 'Tra 3 giorni';
        const cardUrgencyClass = isTomorrow ? 'fav-bg-red' : (isSoon ? 'fav-bg-yellow' : '');
        const badgeClass = isTomorrow ? 'badge-danger' : (isSoon ? 'badge-warning' : 'badge-neutral');

        return `
          <div class="card ${cardUrgencyClass}" style="margin-bottom: 8px; padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <strong style="font-size: 0.92rem; display: block;">${item.street}</strong>
                <span class="text-xs text-secondary">${p.tratto || 'Intera via'}</span>
              </div>
              <span class="badge ${badgeClass}">
                ${item.cleaningRelative}
              </span>
            </div>
            <div style="margin-top: 6px; font-size: 0.78rem; display: flex; justify-content: space-between; color: var(--text-secondary);">
              <span>Pulizia: <b>${item.cleaningDateFormatted}</b> (${timeSlot})</span>
              ${isNight ? '<span style="color: var(--color-danger); font-weight: 700;">⚠️ Notturno</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      html += favorites.map(st => `
        <div class="card" style="margin-bottom: 6px; padding: 8px 12px;">
          <strong style="font-size: 0.88rem;">📍 ${st}</strong>
        </div>
      `).join('');
    }

    this.favStreetsBoxEl.innerHTML = html;

    const manageBtn = this.favStreetsBoxEl.querySelector('#btn-manage-favs');
    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        const favNav = document.querySelector('.bottom-nav-item[data-sezione="preferiti"]');
        if (favNav) favNav.click();
      });
    }
  }

  _showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3800);
  }
}
