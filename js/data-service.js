/**
 * data-service.js - Caricamento asincrono, indicizzazione ad alte prestazioni e cache IndexedDB
 */

import { isScheduledOnDate } from './schedule.js';

const DB_NAME = 'PuliziaStradeFI_Nuova_DB';
const DB_VERSION = 1;
const STORE_NAME = 'dataset_store';
const CACHE_KEY = 'dataset_cache_v1';

class DataService {
  constructor() {
    this.features = [];
    this.streetMap = new Map(); // NORM_STREET -> [features]
    this.allStreets = [];
    this.isLoaded = false;
    this._loadPromise = null;
  }

  async init() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._loadDataset();
    return this._loadPromise;
  }

  async _loadDataset() {
    console.time('DataService: Caricamento Dati');

    // Carica subito l'elenco leggero delle vie per rendere l'autocompletamento istantaneo
    this._loadLightweightStreetsList();

    // 1. Prova da IndexedDB locale
    try {
      const cached = await this._getFromIndexedDB(CACHE_KEY);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        this._indexFeatures(cached);
        this.isLoaded = true;
        console.timeEnd('DataService: Caricamento Dati');
        console.log(`Caricati ${this.features.length} record da IndexedDB`);
        return this.features;
      }
    } catch (err) {
      console.warn('Lettura da IndexedDB non riuscita, procedo con rete:', err);
    }

    // 2. Fetch da data/pulizia_firenze.json
    try {
      const resp = await fetch('data/pulizia_firenze.json');
      if (resp.ok) {
        const json = await resp.json();
        const features = json.features || [];
        this._indexFeatures(features);
        this.isLoaded = true;
        this._saveToIndexedDB(CACHE_KEY, features);
        console.timeEnd('DataService: Caricamento Dati');
        console.log(`Caricati e indicizzati ${this.features.length} record da JSON`);
        return this.features;
      }
    } catch (e) {
      console.error('Errore nel caricamento del file pulizia_firenze.json:', e);
      throw e;
    }
  }

  async _loadLightweightStreetsList() {
    try {
      const resp = await fetch('data/vie_firenze.json');
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list) && this.allStreets.length === 0) {
          this.allStreets = list;
        }
      }
    } catch (e) {
      // Ignora, verrà popolato da _indexFeatures
    }
  }

  _indexFeatures(features) {
    this.features = features;
    this.streetMap.clear();

    const streetSet = new Set();

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const via = f.properties?.via;
      if (!via) continue;

      const normVia = via.trim().toUpperCase();
      streetSet.add(via.trim());

      let list = this.streetMap.get(normVia);
      if (!list) {
        list = [];
        this.streetMap.set(normVia, list);
      }
      list.push(f);
    }

    this.allStreets = Array.from(streetSet).sort((a, b) => a.localeCompare(b, 'it'));
  }

  searchStreets(query, limit = 15) {
    if (!query) return [];
    const q = query.trim().toUpperCase();
    if (!q) return [];

    const startsWith = [];
    const contains = [];

    for (let i = 0; i < this.allStreets.length; i++) {
      const street = this.allStreets[i];
      const upper = street.toUpperCase();

      if (upper.startsWith(q)) {
        startsWith.push(street);
      } else if (upper.includes(q)) {
        contains.push(street);
      }

      if (startsWith.length >= limit) break;
    }

    return [...startsWith, ...contains].slice(0, limit);
  }

  getFeaturesForStreet(streetName) {
    if (!streetName) return [];
    const searchNorm = streetName.trim().toUpperCase();

    // 1. Corrispondenza esatta
    if (this.streetMap.has(searchNorm)) {
      return this.streetMap.get(searchNorm);
    }

    // 2. Corrispondenza parziale (es. se Nominatim restituisce "Via del Proconsolo" o simile)
    const matches = [];
    for (const [key, feats] of this.streetMap.entries()) {
      if (searchNorm.includes(key) || key.includes(searchNorm)) {
        matches.push(...feats);
      }
    }
    return matches;
  }

  getCoordinatesForStreet(streetName) {
    const features = this.getFeaturesForStreet(streetName);
    if (!features || features.length === 0) return null;

    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;

      if (geom.type === 'Point') {
        return { lat: geom.coordinates[1], lng: geom.coordinates[0] };
      } else if (geom.type === 'LineString' && geom.coordinates.length > 0) {
        const mid = Math.floor(geom.coordinates.length / 2);
        return { lat: geom.coordinates[mid][1], lng: geom.coordinates[mid][0] };
      } else if (geom.type === 'MultiLineString' && geom.coordinates.length > 0 && geom.coordinates[0].length > 0) {
        const line = geom.coordinates[0];
        const mid = Math.floor(line.length / 2);
        return { lat: line[mid][1], lng: line[mid][0] };
      }
    }
    return null;
  }

  getFeaturesForDate(targetDate) {
    if (!this.features || this.features.length === 0) return [];
    return this.features.filter(f => isScheduledOnDate(f.properties, targetDate));
  }

  // --- IndexedDB Cache ---

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async _getFromIndexedDB(key) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _saveToIndexedDB(key, data) {
    try {
      const db = await this._openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
    } catch (e) {
      console.warn('Salvataggio su IndexedDB fallito:', e);
    }
  }

  async clearCache() {
    try {
      const db = await this._openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      console.log('Cache IndexedDB svuotata.');
    } catch (e) {
      console.warn('Errore pulizia cache:', e);
    }
  }
}

export const dataService = new DataService();
