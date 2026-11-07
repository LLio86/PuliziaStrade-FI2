/**
 * map-service.js - Gestione mappa interattiva Leaflet, marker GPS e polilinee spazzamento
 */

import { state } from './state.js';
import { getCleaningStatus } from './schedule.js';

class MapService {
  constructor() {
    this.map = null;
    this.userMarker = null;
    this.accuracyCircle = null;
    this.streetsLayer = null;
    this.isTracking = true;
    this.isInitialized = false;

    this.carIcon = L.icon({
      iconUrl: 'assets/images/sedan.png',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });
  }

  init(containerId = 'map') {
    if (this.isInitialized && this.map) {
      this.map.invalidateSize();
      return;
    }

    const { lat, lng } = state.state.userLocation;
    this.map = L.map(containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([lat || 43.7696, lng || 11.2558], 15);

    L.control.attribution({ position: 'bottomright', prefix: 'Leaflet | © OpenStreetMap' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c']
    }).addTo(this.map);

    this.streetsLayer = L.featureGroup().addTo(this.map);

    // Quando l'utente trascina la mappa, disattiva l'auto-pan continuo
    this.map.on('movestart', () => {
      if (!this._programmaticMove) {
        this.isTracking = false;
        state.setTrackingActive(false);
      }
    });

    if (lat && lng) {
      this.updateUserPosition(lat, lng, state.state.userLocation.accuracy);
    }

    state.on('location:updated', loc => {
      this.updateUserPosition(loc.lat, loc.lng, loc.accuracy);
    });

    this.isInitialized = true;
  }

  updateUserPosition(lat, lng, accuracy) {
    if (!this.map || !lat || !lng) return;

    const latLng = [lat, lng];

    if (!this.userMarker) {
      this.userMarker = L.marker(latLng, {
        icon: this.carIcon,
        zIndexOffset: 1000
      }).addTo(this.map);

      this.userMarker.bindPopup('<b>🅿️ La tua auto / posizione</b>', { closeButton: false });
    } else {
      this.userMarker.setLatLng(latLng);
    }

    if (accuracy && accuracy < 500) {
      if (!this.accuracyCircle) {
        this.accuracyCircle = L.circle(latLng, {
          radius: accuracy,
          color: '#4f46e5',
          fillColor: '#818cf8',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(this.map);
      } else {
        this.accuracyCircle.setLatLng(latLng);
        this.accuracyCircle.setRadius(accuracy);
      }
    }

    if (this.isTracking) {
      this._programmaticMove = true;
      this.map.setView(latLng, Math.max(this.map.getZoom(), 16), { animate: true });
      setTimeout(() => {
        this._programmaticMove = false;
      }, 500);
    }
  }

  recenterOnUser() {
    const { lat, lng } = state.state.userLocation;
    this.isTracking = true;
    state.setTrackingActive(true);

    if (lat && lng && this.map) {
      this._programmaticMove = true;
      this.map.flyTo([lat, lng], 16, { duration: 0.8 });
      setTimeout(() => {
        this._programmaticMove = false;
      }, 900);
    }
  }

  renderStreets(features, targetDate = new Date()) {
    if (!this.map || !this.streetsLayer) return;

    this.streetsLayer.clearLayers();
    if (!features || features.length === 0) return;

    const now = new Date();

    features.forEach(feat => {
      if (!feat.geometry) return;

      const p = feat.properties || {};
      const status = getCleaningStatus(p, targetDate, now);

      let color = '#3b82f6';
      let weight = 5;

      if (status.key === 'in_corso') {
        color = '#f59e0b';
        weight = 7;
      } else if (status.key === 'in_arrivo') {
        color = '#ef4444';
        weight = 5;
      } else if (status.key === 'conclusa') {
        color = '#10b981';
        weight = 4;
      }

      const layer = L.geoJSON(feat, {
        style: {
          color,
          weight,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        }
      });

      const popupHtml = `
        <div style="font-family: inherit; font-size: 0.85rem; min-width: 170px;">
          <strong style="color: #0f172a; display: block; margin-bottom: 2px;">${p.via || 'Via'}</strong>
          <span style="font-size: 0.75rem; color: #64748b; display: block; margin-bottom: 6px;">${p.tratto || 'Intera via'}</span>
          <div style="margin-bottom: 4px;">
            <span style="display:inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: ${color}20; color: ${color};">
              ${status.label}
            </span>
          </div>
          <div style="font-size: 0.78rem;">Orario: <b>${p.ora_inizio || '--:--'} - ${p.ora_fine || '--:--'}</b></div>
          <button style="margin-top: 8px; width: 100%; border: none; background: #4f46e5; color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;"
                  onclick="window.dispatchEvent(new CustomEvent('selectStreetFeature', { detail: '${p.id || p.via}' }))">
            Dettagli & Avvisi ➔
          </button>
        </div>
      `;

      layer.bindPopup(popupHtml);

      layer.on('click', () => {
        state.setSelectedFeature(feat);
      });

      this.streetsLayer.addLayer(layer);
    });
  }

  highlightStreet(streetName) {
    if (!this.map || !this.streetsLayer || !streetName) return;
    const targetNorm = streetName.trim().toUpperCase();

    let targetBounds = null;

    this.streetsLayer.eachLayer(layer => {
      const feat = layer.feature;
      if (feat && feat.properties?.via?.trim().toUpperCase() === targetNorm) {
        if (layer.getBounds) {
          targetBounds = layer.getBounds();
        }
      }
    });

    if (targetBounds && targetBounds.isValid()) {
      this._programmaticMove = true;
      this.map.fitBounds(targetBounds, { padding: [40, 40], maxZoom: 17 });
      setTimeout(() => {
        this._programmaticMove = false;
      }, 600);
    }
  }

  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 150);
    }
  }
}

export const mapService = new MapService();
