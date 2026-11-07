/**
 * pwa-service.js - Registrazione Service Worker, installazione PWA e supporto iOS
 */

import { notificationService } from './notification-service.js';

class PwaService {
  constructor() {
    this.deferredPrompt = null;
    this.swRegistration = null;

    this.installBanner = document.getElementById('pwa-install-banner');
    this.installBtn = document.getElementById('btn-pwa-install');
    this.closeBannerBtn = document.getElementById('btn-pwa-dismiss');
    this.iosGuidanceModal = document.getElementById('ios-install-guide');
    this.closeIosBtn = document.getElementById('btn-close-ios-guide');
  }

  async init() {
    await this._registerServiceWorker();
    this._setupInstallPrompt();
    this._setupIosPrompt();
  }

  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      this.swRegistration = reg;
      console.log('Nuovo Service Worker PWA registrato con scope:', reg.scope);

      // Inizializza il notification service con la registrazione
      notificationService.init(reg);

      // Controlla aggiornamenti
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('Nuova versione PWA disponibile.');
          }
        });
      });
    } catch (err) {
      console.warn('Registrazione Service Worker fallita:', err);
    }
  }

  _setupInstallPrompt() {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      if (this.installBanner) this.installBanner.style.display = 'none';
      return;
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;

      const dismissedTime = localStorage.getItem('pwa_banner_dismissed');
      if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 3 * 24 * 3600 * 1000) {
        return;
      }

      if (this.installBanner) {
        this.installBanner.style.display = 'flex';
      }
    });

    if (this.installBtn) {
      this.installBtn.addEventListener('click', async () => {
        if (!this.deferredPrompt) return;

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`Esito installazione PWA: ${outcome}`);

        this.deferredPrompt = null;
        if (this.installBanner) this.installBanner.style.display = 'none';
      });
    }

    if (this.closeBannerBtn) {
      this.closeBannerBtn.addEventListener('click', () => {
        if (this.installBanner) this.installBanner.style.display = 'none';
        localStorage.setItem('pwa_banner_dismissed', Date.now());
      });
    }

    window.addEventListener('appinstalled', () => {
      console.log('App PWA installata sulla Home con successo!');
      if (this.installBanner) this.installBanner.style.display = 'none';
      this.deferredPrompt = null;
    });
  }

  _setupIosPrompt() {
    const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isStandalone = window.navigator.standalone === true;

    if (isIos && !isStandalone) {
      const dismissed = localStorage.getItem('ios_guide_dismissed');
      if (dismissed && Date.now() - parseInt(dismissed, 10) < 5 * 24 * 3600 * 1000) {
        return;
      }

      setTimeout(() => {
        if (this.iosGuidanceModal) {
          this.iosGuidanceModal.style.display = 'flex';
        }
      }, 3000);
    }

    if (this.closeIosBtn) {
      this.closeIosBtn.addEventListener('click', () => {
        if (this.iosGuidanceModal) this.iosGuidanceModal.style.display = 'none';
        localStorage.setItem('ios_guide_dismissed', Date.now());
      });
    }
  }
}

export const pwaService = new PwaService();
