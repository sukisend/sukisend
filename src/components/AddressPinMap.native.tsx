import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { getStoreCoordinates } from '../services/geocodingService';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface AddressPinMapProps {
  value: Coordinate | null;
  onChange: (next: Coordinate) => void;
  height?: number;
}

function isCoordinateValid(point: Coordinate | null | undefined): point is Coordinate {
  if (!point) {
    return false;
  }
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function buildPickerHtml(point: Coordinate) {
  const payload = JSON.stringify(point);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #0F172A;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      width: 40px !important;
      height: 40px !important;
      line-height: 38px !important;
      font-size: 22px !important;
      font-weight: 700;
    }
    #recenter {
      position: absolute;
      left: 10px;
      top: 10px;
      z-index: 1000;
      border: 1px solid #334155;
      background: rgba(15, 23, 42, 0.88);
      color: #fff;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 800;
      padding: 8px 12px;
    }
    .pin-wrap {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #F97316;
      border: 1px solid rgba(15, 23, 42, 0.75);
      box-shadow: 0 2px 6px rgba(2, 6, 23, 0.38);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
    }
  </style>
</head>
<body>
  <button id="recenter" type="button">Recenter</button>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const initialPoint = ${payload};
    const map = L.map('map', {
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    function pinIcon() {
      return L.divIcon({
        className: '',
        html: '<div class="pin-wrap">&#9679;</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }

    const marker = L.marker([initialPoint.latitude, initialPoint.longitude], {
      draggable: true,
      icon: pinIcon(),
    }).addTo(map);

    map.setView([initialPoint.latitude, initialPoint.longitude], 14);

    function emit(point) {
      if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') {
        return;
      }
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'coordinate',
          latitude: point.lat,
          longitude: point.lng,
        }),
      );
    }

    map.on('click', function(event) {
      marker.setLatLng(event.latlng);
      emit(event.latlng);
    });

    marker.on('dragend', function() {
      const next = marker.getLatLng();
      emit(next);
    });

    document.getElementById('recenter').addEventListener('click', function() {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
    });
  </script>
</body>
</html>`;
}

export function AddressPinMap({ value, onChange, height = 200 }: AddressPinMapProps) {
  const [loading, setLoading] = useState(true);
  const fallback = useMemo(() => getStoreCoordinates(), []);
  const activePoint = isCoordinateValid(value) ? value : fallback;

  const html = useMemo(
    () => buildPickerHtml(activePoint),
    [activePoint.latitude, activePoint.longitude],
  );

  return (
    <View style={[styles.mapWrap, { height }]}>
      <WebView
        source={{ html }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={(event: WebViewMessageEvent) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data ?? '{}');
            if (payload?.type !== 'coordinate') {
              return;
            }

            const latitude = Number(payload.latitude);
            const longitude = Number(payload.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return;
            }

            onChange({
              latitude: Number(latitude.toFixed(7)),
              longitude: Number(longitude.toFixed(7)),
            });
          } catch {
            // Ignore malformed postMessage payloads from webview.
          }
        }}
      />

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  map: {
    backgroundColor: '#0F172A',
    height: '100%',
    width: '100%',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.52)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
});

