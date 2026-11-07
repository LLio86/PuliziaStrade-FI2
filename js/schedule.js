/**
 * schedule.js - Calcoli orari, date, stati e motore promemoria giorno prima
 */

export const DAY_CODES = {
  LU: 'Lunedì',
  MA: 'Martedì',
  ME: 'Mercoledì',
  GI: 'Giovedì',
  VE: 'Venerdì',
  SA: 'Sabato',
  DO: 'Domenica'
};

export const DAY_NUM_TO_CODE = {
  0: 'DO',
  1: 'LU',
  2: 'MA',
  3: 'ME',
  4: 'GI',
  5: 'VE',
  6: 'SA'
};

export const CODE_TO_DAY_NUM = {
  DO: 0,
  LU: 1,
  MA: 2,
  ME: 3,
  GI: 4,
  VE: 5,
  SA: 6
};

/**
 * Calcola quale settimana del mese è una data (1..5).
 * A Firenze la prima occorrenza di un giorno feriale cade sempre tra l'1 e il 7,
 * la seconda tra l'8 e il 14, la terza tra il 15 e il 21, ecc.
 * @param {Date} date
 * @returns {number} 1, 2, 3, 4 o 5
 */
export function getWeekOfMonth(date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

/**
 * Verifica se una strada è soggetta a pulizia in una data specifica
 * @param {Object} props - Proprietà della strada (giorno, settimane)
 * @param {Date} date
 * @returns {boolean}
 */
export function isScheduledOnDate(props, date) {
  if (!props || !props.giorno || !props.settimane) return false;
  const dayCode = DAY_NUM_TO_CODE[date.getDay()];
  if (props.giorno !== dayCode) return false;

  const week = getWeekOfMonth(date);
  return props.settimane.includes(week);
}

/**
 * Calcola la prossima data di pulizia a partire da un momento di riferimento
 * @param {Object} props
 * @param {Date} [fromTime=new Date()]
 * @returns {Date|null}
 */
export function getNextCleaningDate(props, fromTime = new Date()) {
  if (!props || !props.giorno || !props.settimane || props.settimane.length === 0) {
    return null;
  }

  const now = new Date(fromTime);
  const currentHours = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  // Controlliamo i prossimi 60 giorni
  for (let offset = 0; offset <= 60; offset++) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (isScheduledOnDate(props, candidate)) {
      // Se è oggi, controlliamo se la fascia oraria è già passata
      if (offset === 0 && props.ora_fine && currentHours > props.ora_fine) {
        continue; // La pulizia di oggi è già terminata
      }
      return candidate;
    }
  }

  return null;
}

/**
 * Determina lo stato della pulizia (in_corso, in_arrivo, conclusa)
 * @param {Object} props
 * @param {Date} targetDate - Giorno visualizzato
 * @param {Date} [now=new Date()] - Momento attuale
 * @returns {{ key: string, label: string, color: string, badgeClass: string, timeDesc: string }}
 */
export function getCleaningStatus(props, targetDate, now = new Date()) {
  const isToday =
    targetDate.getFullYear() === now.getFullYear() &&
    targetDate.getMonth() === now.getMonth() &&
    targetDate.getDate() === now.getDate();

  const isFuture = targetDate > now && !isToday;
  const isPast = targetDate < now && !isToday;

  if (isPast) {
    return {
      key: 'conclusa',
      label: 'Conclusa',
      color: 'success',
      badgeClass: 'badge-conclusa',
      timeDesc: 'Terminata'
    };
  }

  if (isFuture) {
    return {
      key: 'in_arrivo',
      label: 'In arrivo',
      color: 'warning',
      badgeClass: 'badge-in-arrivo',
      timeDesc: `Prevista: ${props.ora_inizio || '--:--'} - ${props.ora_fine || '--:--'}`
    };
  }

  // È oggi: confrontiamo gli orari
  const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const start = props.ora_inizio || '00:00';
  const end = props.ora_fine || '23:59';

  if (currentHHMM < start) {
    return {
      key: 'in_arrivo',
      label: 'Non ancora iniziata',
      color: 'danger',
      badgeClass: 'badge-non-iniziata',
      timeDesc: `Inizia alle ${start}`
    };
  } else if (currentHHMM >= start && currentHHMM <= end) {
    return {
      key: 'in_corso',
      label: 'IN CORSO 🧹',
      color: 'warning',
      badgeClass: 'badge-in-corso',
      timeDesc: `Termina alle ${end}`
    };
  } else {
    return {
      key: 'conclusa',
      label: 'Conclusa',
      color: 'success',
      badgeClass: 'badge-conclusa',
      timeDesc: `Terminata alle ${end}`
    };
  }
}

/**
 * Formatta in italiano la differenza di giorni
 * @param {Date} targetDate
 * @param {Date} [refDate=new Date()]
 * @returns {string} E.g. "Oggi", "Domani", "Dopodomani", "Tra 3 giorni"
 */
export function formatRelativeDays(targetDate, refDate = new Date()) {
  if (!targetDate) return '';
  const d1 = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const d2 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Oggi';
  if (diffDays === 1) return 'Domani';
  if (diffDays === 2) return 'Dopodomani';
  if (diffDays > 2) return `Tra ${diffDays} giorni`;
  if (diffDays === -1) return 'Ieri';
  return `${Math.abs(diffDays)} giorni fa`;
}

/**
 * Formatta una data in stile esteso italiano: "Giovedì 12 Novembre 2026"
 * @param {Date} date
 * @returns {string}
 */
export function formatFullItalianDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Formattazione breve: "Gio 12 Nov"
 * @param {Date} date
 * @returns {string}
 */
export function formatShortItalianDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

/**
 * Restituisce una nota informativa se la pulizia è notturna (es. 00:00 - 06:00)
 * per evitare che l'automobilista si confonda sulla notte di parcheggio vietato.
 * @param {Object} props
 * @returns {string|null}
 */
export function getNightCleaningWarning(props) {
  if (!props) return null;
  const isNight = props.notturno || (props.ora_inizio && props.ora_inizio.startsWith('00:'));
  if (!isNight) return null;

  const previousDayMap = {
    LU: 'Domenica',
    MA: 'Lunedì',
    ME: 'Martedì',
    GI: 'Mercoledì',
    VE: 'Giovedì',
    SA: 'Venerdì',
    DO: 'Sabato'
  };

  const dayName = DAY_CODES[props.giorno] || props.giorno;
  const prevDay = previousDayMap[props.giorno] || '';

  return `⚠️ Divieto notturno: lo spazzamento scatta nella notte tra ${prevDay} e ${dayName} (orario ${props.ora_inizio}-${props.ora_fine}). Sposta l'auto entro la mezzanotte!`;
}

/**
 * Descrizione lato strada
 * @param {Object} props
 * @returns {string}
 */
export function getSideDescription(props) {
  if (!props) return 'Entrambi i lati';
  if (props.pari && !props.dispari) return 'Solo numeri Pari';
  if (!props.pari && props.dispari) return 'Solo numeri Dispari';
  return 'Entrambi i lati';
}

/**
 * ============================================================================
 * MOTORE CALCOLO PROMEMORIA IL GIORNO PRIMA DELLA PULIZIA
 * ============================================================================
 * Verifica se per una data feature oggi è la vigilia (giorno prima) della pulizia.
 * Genera il testo esatto e l'oggetto notifica per la zona monitorata.
 *
 * @param {Object} props - Proprietà della via
 * @param {Date} [now=new Date()]
 * @returns {Object|null} Dati del promemoria se c'è pulizia domani, oppure null
 */
export function getDayBeforeAlertInfo(props, now = new Date()) {
  if (!props) return null;

  // Calcola la data di domani
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Verifica se la strada è pulita domani
  if (!isScheduledOnDate(props, tomorrow)) {
    return null;
  }

  const isNight = props.notturno || (props.ora_inizio && props.ora_inizio.startsWith('00:'));
  const streetName = props.via || 'la tua zona';
  const timeSlot = `${props.ora_inizio || '--:--'} - ${props.ora_fine || '--:--'}`;
  const sides = getSideDescription(props);
  const stretchInfo = props.tratto ? ` (${props.tratto})` : '';

  let title = '';
  let body = '';

  if (isNight) {
    title = `🚨 Pulizia STANOTTE: ${streetName}`;
    body = `Attenzione! Stanotte a mezzanotte scatta il divieto di sosta in ${streetName}${stretchInfo} (ore ${timeSlot}, ${sides}). Sposta l'auto stasera entro le 00:00 per evitare la rimozione forzata!`;
  } else {
    title = `🧹 Pulizia Domani: ${streetName}`;
    body = `Promemoria: domani è programmata la pulizia strade in ${streetName}${stretchInfo} dalle ${timeSlot} (${sides}). Sposta il tuo veicolo in tempo!`;
  }

  return {
    street: streetName,
    cleaningDate: tomorrow,
    dateString: tomorrow.toISOString().split('T')[0],
    isNight,
    timeSlot,
    sides,
    title,
    body,
    tag: `cleaning-${streetName}-${tomorrow.toISOString().split('T')[0]}`
  };
}
