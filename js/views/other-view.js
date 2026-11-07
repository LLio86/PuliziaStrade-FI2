/**
 * other-view.js - Gestione Condivisione, Rimozioni Auto e Depositeria Comunale SAS Firenze
 */

export class OtherView {
  constructor() {
    this.container = document.getElementById('sezione-impostazioni');
    this.shareNativeBtn = document.getElementById('btn-share-native');
    this.copyLinkBtn = document.getElementById('btn-copy-link');

    this._bindEvents();
  }

  _bindEvents() {
    if (this.shareNativeBtn) {
      this.shareNativeBtn.addEventListener('click', async () => {
        const shareData = {
          title: 'Pulizia Strade Firenze 🧹',
          text: 'Scopri quando puliscono la tua strada a Firenze e ricevi notifiche il giorno prima del divieto!',
          url: window.location.href
        };

        if (navigator.share) {
          try {
            await navigator.share(shareData);
          } catch (e) {
            // Condivisione annullata dall'utente
          }
        } else {
          this._copyLink();
        }
      });
    }

    if (this.copyLinkBtn) {
      this.copyLinkBtn.addEventListener('click', () => {
        this._copyLink();
      });
    }
  }

  _copyLink() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('🔗 Link copiato negli appunti!');
      }).catch(() => {
        this._promptFallback(url);
      });
    } else {
      this._promptFallback(url);
    }
  }

  _promptFallback(url) {
    prompt('Copia questo link:', url);
  }
}
