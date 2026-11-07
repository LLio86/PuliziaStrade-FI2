/**
 * location-service.js - Geolocalizzazione GPS, reverse geocoding con debounce e controllo confini Firenze
 */

import { state } from './state.js';
import { dataService } from './data-service.js';

// Bounding box indicativo per il territorio del Comune di Firenze
const FLORENCE_BOUNDS = {
  minLat: 43.70,
  maxLat: 43.85,
  minLng: 11.15,
  maxLng: 11.35
};

class LocationService {
  constructor() {
    this.watchId = null;
    this.lastGeocodedLatLng = null;
    this.lastGeocodeTime = 0;
    this.geocodeCache = new Map();
    this._pendingTimeout = null;
  }

  startTracking() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocal) {
      console.warn('GPS bloccato dal browser dello smartphone: contesto non sicuro (richiesto HTTPS)');
      state.setUserLocation({
        loading: false,
        hasGpsFix: false,
        isSecureContextError: true,
        error: 'I browser mobile richiedono HTTPS per accedere al GPS. Puoi comunque selezionare una via manualmente qui sotto.'
      });
      return;
    }

    if (!('geolocation' in navigator)) {
      state.setUserLocation({
        loading: false,
        error: 'Geolocalizzazione non supportata da questo browser'
      });
      return;
    }

    state.setUserLocation({ loading: true, error: null });

    // Permissions API
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        status.onchange = () => {
          if (status.state === 'granted') {
            this.requestCurrentPosition();
          }
        };
      }).catch(() => {});
    }

    // 1. Richiesta puntuale iniziale
    navigator.geolocation.getCurrentPosition(
      pos => {
        this._handlePosition(pos, true);
      },
      err => {
        this._handleError(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // 2. Watch continuo
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      pos => this._handlePosition(pos, false),
      err => this._handleError(err),
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000
      }
    );
  }

  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  requestCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const err = new Error('Geolocalizzazione non supportata');
        reject(err);
        return;
      }

      state.setUserLocation({ loading: true, error: null });

      navigator.geolocation.getCurrentPosition(
        pos => {
          this._handlePosition(pos, true);
          resolve(pos);
        },
        err => {
          this._handleError(err);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  setManualLocation(streetName) {
    if (!streetName) return;
    const cleanStreet = streetName.trim();
    const coords = dataService.getCoordinatesForStreet(cleanStreet) || { lat: 43.7696, lng: 11.2558 };

    state.setUserLocation({
      lat: coords.lat,
      lng: coords.lng,
      address: cleanStreet,
      accuracy: 10,
      timestamp: Date.now(),
      inFlorence: true,
      hasGpsFix: true,
      loading: false,
      error: null
    });
  }

  _handlePosition(pos, isInitial = false) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    const inFlorence = this.isInFlorence(lat, lng);

    state.setUserLocation({
      lat,
      lng,
      accuracy,
      timestamp: pos.timestamp,
      inFlorence,
      hasGpsFix: true,
      loading: false,
      error: inFlorence ? null : 'Ti trovi al di fuori del Comune di Firenze.'
    });

    const distanceMoved = this.lastGeocodedLatLng
      ? this._calculateDistance(this.lastGeocodedLatLng.lat, this.lastGeocodedLatLng.lng, lat, lng)
      : Infinity;

    if (distanceMoved > 25 || !this.lastGeocodedLatLng || isInitial) {
      this._debouncedReverseGeocode(lat, lng);
    }
  }

  _handleError(err) {
    let msg = 'Impossibile rilevare la posizione.';
    let isPermissionDenied = false;

    if (err.code === 1) {
      isPermissionDenied = true;
      msg = 'Permesso GPS negato. Puoi impostare una via manualmente per verificare la pulizia strade.';
    } else if (err.code === 2) {
      msg = 'Segnale GPS non disponibile. Assicurati che i servizi di localizzazione del tuo dispositivo siano attivi.';
    } else if (err.code === 3) {
      msg = 'Tempo scaduto per il rilevamento GPS. Riprova.';
    }

    state.setUserLocation({
      loading: false,
      hasGpsFix: false,
      isPermissionDenied,
      error: msg
    });
  }

  isInFlorence(lat, lng) {
    return (
      lat >= FLORENCE_BOUNDS.minLat &&
      lat <= FLORENCE_BOUNDS.maxLat &&
      lng >= FLORENCE_BOUNDS.minLng &&
      lng <= FLORENCE_BOUNDS.maxLng
    );
  }

  _debouncedReverseGeocode(lat, lng) {
    if (this._pendingTimeout) {
      clearTimeout(this._pendingTimeout);
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastGeocodeTime;
    const delay = timeSinceLast < 1800 ? 1800 - timeSinceLast : 0;

    this._pendingTimeout = setTimeout(() => {
      this._reverseGeocode(lat, lng);
    }, delay);
  }

  async _reverseGeocode(lat, lng) {
    this.lastGeocodedLatLng = { lat, lng };
    this.lastGeocodeTime = Date.now();

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (this.geocodeCache.has(cacheKey)) {
      const cached = this.geocodeCache.get(cacheKey);
      state.setUserLocation({ address: cached });
      return cached;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=it`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const addrObj = data.address || {};
      const road = addrObj.road || addrObj.pedestrian || addrObj.street || addrObj.square || data.display_name?.split(',')[0];
      const city = addrObj.city || addrObj.town || addrObj.village || addrObj.municipality || '';

      const isFlorence = city.toLowerCase().includes('firenze');
      const formattedRoad = road ? road.trim() : 'Indirizzo sconosciuto';
      this.geocodeCache.set(cacheKey, formattedRoad);

      state.setUserLocation({
        address: formattedRoad,
        inFlorence: isFlorence,
        error: isFlorence ? null : 'L\'app funziona per il Comune di Firenze'
      });

      return formattedRoad;
    } catch (err) {
      console.warn('Reverse geocode fallito:', err);
    }
  }

  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export const locationService = new LocationService();
