import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface AddressPinMapProps {
  value: Coordinate | null;
  onChange: (next: Coordinate) => void;
  height?: number;
}

const PHILIPPINES_BOUNDS = {
  southWest: { latitude: 4.5, longitude: 116.7 },
  northEast: { latitude: 21.3, longitude: 126.6 },
};

function isCoordinateValid(point: Coordinate | null | undefined): point is Coordinate {
  if (!point) {
    return false;
  }
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function buildPickerHtml(point: Coordinate | null) {
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
    .leaflet-control-zoom {
      top: 10px !important;
      right: 10px !important;
    }
    .leaflet-control-zoom a {
      width: 36px !important;
      height: 36px !important;
      line-height: 34px !important;
      font-size: 20px !important;
      font-weight: 700;
    }
    .leaflet-control-attribution {
      bottom: 2px !important;
      right: 4px !important;
      background: rgba(255,255,255,0.7) !important;
      border-radius: 4px !important;
      padding: 1px 5px !important;
      font-size: 9px !important;
      line-height: 12px !important;
    }
    .leaflet-control-attribution a {
      color: #475569 !important;
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
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
    }
    .pin-wrap {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      background: #F97316;
      border: 2.5px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pin-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #fff;
    }
  </style>
</head>
<body>
  <button id="recenter" type="button">Recenter</button>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const initialPoint = ${payload};
    const philippinesCenter = [14.5995, 120.9842];

    const map = L.map('map', {
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
      center: philippinesCenter,
      zoom: 12,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    function pinIcon() {
      return L.divIcon({
        className: '',
        html: '<div class="pin-wrap"><div class="pin-dot"></div></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
    }

    let marker = null;

    function ensureMarker(point) {
      if (!marker) {
        marker = L.marker([point.latitude, point.longitude], {
          draggable: true,
          icon: pinIcon(),
        }).addTo(map);
        marker.on('dragend', function() {
          emit(marker.getLatLng());
        });
      } else {
        marker.setLatLng([point.latitude, point.longitude]);
      }
      return marker;
    }

    if (initialPoint && Number.isFinite(initialPoint.latitude) && Number.isFinite(initialPoint.longitude)) {
      ensureMarker(initialPoint);
      map.setView([initialPoint.latitude, initialPoint.longitude], 14);
    } else {
      ensureMarker({ latitude: philippinesCenter[0], longitude: philippinesCenter[1] });
      map.setView(philippinesCenter, 12);
    }

    function emit(point) {
      if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'coordinate',
        latitude: point.lat,
        longitude: point.lng,
      }));
    }

    map.on('click', function(event) {
      ensureMarker({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      marker.setLatLng(event.latlng);
      emit(event.latlng);
    });

    document.getElementById('recenter').addEventListener('click', function() {
      if (marker) {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
      } else {
        map.setView(philippinesCenter, 12);
      }
    });
  </script>
</body>
</html>`;
}

export function AddressPinMap({ value, onChange, height = 200 }: AddressPinMapProps) {
  const [loading, setLoading] = useState(true);
  const activePoint = useMemo(() => (isCoordinateValid(value) ? value : null), [value]);

  const html = useMemo(
    () => buildPickerHtml(activePoint),
    [activePoint?.latitude, activePoint?.longitude],
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

