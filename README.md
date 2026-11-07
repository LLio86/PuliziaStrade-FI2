# Pulizia Strade Firenze 🧹 (Nuova PWA 3.0 con Notifiche Push Semplificate)

Nuova Progressive Web App (PWA) progettata da zero per la consultazione degli orari e dei divieti di spazzamento strade nel **Comune di Firenze**, con sistema semplificato di **notifiche Web Push** per avvisare l'automobilista **il giorno prima** per tutte le strade salvate nei **Preferiti**.

---

## 🌟 Funzionamento Semplificato delle Notifiche

1. **Un solo interruttore:**
   - L'utente attiva le notifiche push con un comodo interruttore on/off.
2. **Scelta di uno o più orari di ricezione:**
   - L'utente seleziona gli orari preferiti in cui ricevere l'avviso il giorno prima (es. *18:00*, *19:00*, *21:00*). Può selezionarne quanti ne desidera per avere uno o più promemoria (es. prima di cena e prima di andare a dormire).
3. **Copertura automatica di tutti i Preferiti:**
   - Non serve selezionare o cambiare via a mano: **tutte le strade salvate nei Preferiti ❤️** ricevono automaticamente la notifica push il giorno prima dello spazzamento!
4. **Avviso Notturno Speciale (00:00 - 06:00):**
   - Per le pulizie notturne che partono a mezzanotte, la notifica avverte la sera prima di spostare l'auto entro le 00:00 per evitare rimozioni forzate.
5. **Test Istantaneo:**
   - Pulsanti integrati per inviare una notifica di prova immediata o simulare l'avviso reale del giorno prima.

---

## 🗺️ Tutte le Funzionalità

* **📍 Posizione GPS:** Rileva la via in cui ti trovi a Firenze, orario di spazzamento odierno e divieto.
* **📅 Calendario e Statistiche:** Elenco paginato fluido a 60fps e mappa Leaflet interattiva per visualizzare le pulizie di oggi, domani o qualsiasi data.
* **❤️ Preferiti & Ricerca Istantanea:** Ricerca tra 1.500+ vie cittadine e salvataggio delle strade abituali di sosta.
* **📋 Scheda Dettagli:** Finestra a scorrimento (bottom sheet) con giorni, orari, settimane del mese e lato strada.
* **⚙️ Temi & Accessibilità:** Scuro AMOLED, Chiaro, Alto Contrasto WCAG AAA e scala dei caratteri regolabile.
* **🚗 Depositeria SAS:** Contatti diretti per auto rimossa (Via Allende 18/20, `055 40401`).
* **📲 PWA Completa:** Installabile su Android, iOS e Desktop con funzionamento offline-first.

---

## 📁 Struttura della Cartella `pulizia-strade-nuova/`

```text
pulizia-strade-nuova/
├── index.html                   # Shell HTML5 semantica e responsive
├── manifest.json                # PWA Web App Manifest
├── sw.js                        # Service Worker con push notification e cache offline
├── README.md                    # Documentazione tecnica
├── data/
│   ├── pulizia_firenze.json     # Dataset GeoJSON pulizia strade
│   └── vie_firenze.json         # Indice per ricerca istantanea
├── assets/
│   ├── icons/ (icon-192.png, icon-512.png, icona.png, favicon.ico)
│   └── images/ (sedan.png)
├── css/
│   ├── main.css                 # Reset, design tokens, safe-areas iOS
│   ├── components.css           # Bottoni, card, bottom sheet, bottom nav
│   ├── map.css                  # Mappa Leaflet e FAB di ricentramento
│   ├── notifications.css        # Stili centro notifiche e griglia orari
│   └── themes.css               # Temi Scuro AMOLED, Chiaro, Alto Contrasto
└── js/
    ├── app.js                   # Coordinatore dell'applicazione e routing
    ├── state.js                 # Stato Pub/Sub (orari multipli e preferiti)
    ├── schedule.js              # Motore orari, date e avvisi notturni
    ├── notification-service.js  # Motore Notifiche Push per tutti i preferiti
    ├── data-service.js          # Cache IndexedDB e indicizzazione in memoria
    ├── location-service.js      # Geolocalizzazione GPS con reverse geocoding
    ├── map-service.js           # Gestione mappa Leaflet
    ├── pwa-service.js           # PWA installation prompt
    └── views/
        ├── position-view.js     # Vista Posizione e via attuale
        ├── schedule-view.js     # Vista Calendario e pulizia del giorno
        ├── favorites-view.js    # Vista Preferiti e ricerca vie
        ├── notifications-view.js# Vista Notifiche Semplificata (Orari multipli)
        ├── settings-view.js     # Vista Impostazioni, temi e font
        ├── other-view.js        # Vista Condivisione e Depositeria SAS
        └── detail-sheet.js      # Bottom sheet dettagli via
```
