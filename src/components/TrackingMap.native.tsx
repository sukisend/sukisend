import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface TrackingMapProps {
  coordinates: Coordinate[];
  origin?: Coordinate | null;
  destination?: Coordinate | null;
  routeCoordinates?: Coordinate[];
  routeColor?: string;
}

const FALLBACK_CENTER: Coordinate = { latitude: 14.5995, longitude: 120.9842 };
const STORE_LOGO_ASSET = require('../../assets/suki-send-logo.png');
const RIDER_ICON_ASSET = require('../../assets/rider.png');

function isCoordinateValid(point: Coordinate | null | undefined): point is Coordinate {
  if (!point) {
    return false;
  }

  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function dedupe(points: Coordinate[]) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const prev = points[index - 1];
    return point.latitude !== prev.latitude || point.longitude !== prev.longitude;
  });
}

function simplifyCoordinates(points: Coordinate[], maxPoints: number) {
  if (!points.length) {
    return points;
  }

  if (points.length <= maxPoints) {
    return dedupe(points);
  }

  const stride = Math.ceil(points.length / maxPoints);
  const simplified: Coordinate[] = [];
  for (let index = 0; index < points.length; index += stride) {
    simplified.push(points[index]);
  }

  const lastPoint = points[points.length - 1];
  const currentLast = simplified[simplified.length - 1];
  if (!currentLast || currentLast.latitude !== lastPoint.latitude || currentLast.longitude !== lastPoint.longitude) {
    simplified.push(lastPoint);
  }

  return dedupe(simplified);
}

async function assetModuleToDataUri(moduleId: number) {
  try {
    const asset = Asset.fromModule(moduleId);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }

    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) {
      return null;
    }

    let base64 = '';
    try {
      base64 = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      if (!sourceUri.startsWith('http://') && !sourceUri.startsWith('https://')) {
        return null;
      }

      const cacheFile = `${FileSystem.cacheDirectory ?? ''}sukisend-map-icon-${moduleId}.png`;
      if (!cacheFile) {
        return null;
      }

      const downloaded = await FileSystem.downloadAsync(sourceUri, cacheFile);
      base64 = await FileSystem.readAsStringAsync(downloaded.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    if (!base64) {
      return null;
    }

    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

function buildLeafletHtml(payload: {
  route: Coordinate[];
  origin: Coordinate | null;
  destination: Coordinate | null;
  rider: Coordinate | null;
  routeColor: string;
  storeLogoUri: string | null;
  riderIconUri: string | null;
}) {
  const jsonPayload = JSON.stringify(payload);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html, body, #map {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0f172a;
      font-family: Arial, sans-serif;
    }
    #map {
      width: 100%;
    }
    .leaflet-control-zoom a {
      width: 48px !important;
      height: 48px !important;
      line-height: 46px !important;
      font-size: 26px !important;
      font-weight: 700;
    }
    .leaflet-control-attribution {
      font-size: 10px;
    }
    .marker-bubble {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid rgba(15, 23, 42, 0.7);
      box-shadow: 0 2px 6px rgba(2, 6, 23, 0.4);
    }
    .store-bubble {
      background: #1d4ed8;
    }
    .customer-bubble {
      background: #e11d48;
    }
    .rider-bubble {
      background: #f97316;
    }
    .store-pin {
      width: 50px;
      height: 50px;
      border: 2px solid #1D4ED8;
      border-radius: 999px;
      background: #FFFFFF;
      box-shadow: 0 3px 8px rgba(2, 6, 23, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .store-pin img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      display: block;
    }
    .rider-pin {
      width: 60px;
      height: 60px;
      border: 2px solid #F97316;
      border-radius: 999px;
      background: #FFFFFF;
      box-shadow: 0 4px 9px rgba(2, 6, 23, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .rider-pin img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      display: block;
    }
    .pin-fallback {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
    }
    .customer-pin {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #E11D48;
      border: 1px solid rgba(15, 23, 42, 0.72);
      box-shadow: 0 2px 6px rgba(2, 6, 23, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .customer-head {
      display: block;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #FFFFFF;
      margin-bottom: 1px;
    }
    .customer-body {
      display: block;
      width: 11px;
      height: 6px;
      border-radius: 7px 7px 4px 4px;
      background: #FFFFFF;
    }
    #recenter {
      position: absolute;
      left: 10px;
      top: 12px;
      z-index: 1000;
      display: none;
      border: 1px solid #334155;
      background: rgba(15, 23, 42, 0.88);
      color: #fff;
      border-radius: 999px;
      font-size: 15px;
      font-weight: 800;
      padding: 11px 16px;
    }
  </style>
</head>
<body>
  <button id="recenter">Recenter</button>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const payload = ${jsonPayload};
    const map = L.map('map', {
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const recenterButton = document.getElementById('recenter');

    function markerBubbleIcon(kind, label) {
      return L.divIcon({
        className: '',
        html: '<div class="marker-bubble ' + kind + '">' + label + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    }

    function customerIcon() {
      return L.divIcon({
        className: '',
        html: '<div class="customer-pin"><span class="customer-head"></span><span class="customer-body"></span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }

    function storeIcon() {
      if (!payload.storeLogoUri) {
        return markerBubbleIcon('store-bubble', '🏪');
      }

      return L.divIcon({
        className: '',
        html: '<div class="store-pin"><img src="' + payload.storeLogoUri + '" alt="" onerror="this.style.display=\\'none\\';this.parentNode.classList.add(\\'pin-fallback\\');this.parentNode.textContent=\\'🏪\\';"/></div>',
        iconSize: [50, 50],
        iconAnchor: [25, 25],
      });
    }

    function riderIcon() {
      if (!payload.riderIconUri) {
        return markerBubbleIcon('rider-bubble', '🏍️');
      }

      return L.divIcon({
        className: '',
        html: '<div class="rider-pin"><img src="' + payload.riderIconUri + '" alt="" onerror="this.style.display=\\'none\\';this.parentNode.classList.add(\\'pin-fallback\\');this.parentNode.textContent=\\'🏍️\\';"/></div>',
        iconSize: [60, 60],
        iconAnchor: [30, 30],
      });
    }

    function normalize(point) {
      if (!point) {
        return null;
      }
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
        return null;
      }
      return [point.latitude, point.longitude];
    }

    function toBounds(points) {
      const first = points[0];
      let minLat = first[0];
      let maxLat = first[0];
      let minLng = first[1];
      let maxLng = first[1];

      for (let i = 1; i < points.length; i += 1) {
        const row = points[i];
        if (row[0] < minLat) minLat = row[0];
        if (row[0] > maxLat) maxLat = row[0];
        if (row[1] < minLng) minLng = row[1];
        if (row[1] > maxLng) maxLng = row[1];
      }

      return [[minLat, minLng], [maxLat, maxLng]];
    }

    const route = Array.isArray(payload.route)
      ? payload.route
          .map((point) => normalize(point))
          .filter(Boolean)
      : [];

    const origin = normalize(payload.origin);
    const destination = normalize(payload.destination);
    const rider = normalize(payload.rider);

    function samePoint(a, b) {
      if (!a || !b) {
        return false;
      }
      return Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;
    }

    function offsetPoint(point, latOffset, lngOffset) {
      return [point[0] + latOffset, point[1] + lngOffset];
    }

    const originMarkerPoint = origin && samePoint(origin, rider) ? offsetPoint(origin, 0.00045, -0.00045) : origin;
    const destinationMarkerPoint = destination && samePoint(destination, rider)
      ? offsetPoint(destination, -0.00045, 0.00045)
      : destination;

    if (originMarkerPoint) {
      L.marker(originMarkerPoint, { icon: storeIcon() }).addTo(map);
    }
    if (destinationMarkerPoint) {
      L.marker(destinationMarkerPoint, { icon: customerIcon() }).addTo(map);
    }
    if (rider) {
      L.marker(rider, { icon: riderIcon() }).addTo(map);
    }

    if (route.length > 1) {
      L.polyline(route, {
        color: '#0F172A',
        weight: 9,
        opacity: 0.32,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      L.polyline(route, {
        color: payload.routeColor || '#F97316',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }

    const fitPoints = route.length
      ? route
      : [origin, rider, destination].filter(Boolean);

    function fitToPoints() {
      if (!fitPoints.length) {
        map.setView([${FALLBACK_CENTER.latitude}, ${FALLBACK_CENTER.longitude}], 7);
        return;
      }

      if (fitPoints.length === 1) {
        map.setView(fitPoints[0], 14);
        return;
      }

      map.fitBounds(toBounds(fitPoints), {
        padding: [24, 24],
        maxZoom: 16,
      });
    }

    fitToPoints();

    let userMoved = false;
    function showRecenter() {
      recenterButton.style.display = userMoved ? 'block' : 'none';
    }

    map.on('dragstart zoomstart', function () {
      userMoved = true;
      showRecenter();
    });

    recenterButton.addEventListener('click', function () {
      userMoved = false;
      showRecenter();
      fitToPoints();
    });
  </script>
</body>
</html>`;
}

export function TrackingMap({
  coordinates,
  origin,
  destination,
  routeCoordinates = [],
  routeColor = '#DC2626',
}: TrackingMapProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mapIcons, setMapIcons] = useState<{ storeLogoUri: string | null; riderIconUri: string | null }>({
    storeLogoUri: null,
    riderIconUri: null,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const [storeLogoDataUri, riderDataUri] = await Promise.all([
        assetModuleToDataUri(STORE_LOGO_ASSET),
        assetModuleToDataUri(RIDER_ICON_ASSET),
      ]);

      if (!active) {
        return;
      }

      setMapIcons({
        storeLogoUri: storeLogoDataUri,
        riderIconUri: riderDataUri,
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  const safeCoordinates = useMemo(
    () => simplifyCoordinates(coordinates.filter((point) => isCoordinateValid(point)), 80),
    [coordinates],
  );
  const safeRouteCoordinates = useMemo(
    () => simplifyCoordinates(routeCoordinates.filter((point) => isCoordinateValid(point)), 180),
    [routeCoordinates],
  );
  const safeOrigin = isCoordinateValid(origin) ? origin : null;
  const safeDestination = useMemo(() => {
    if (isCoordinateValid(destination)) {
      return destination;
    }
    if (safeRouteCoordinates.length > 1) {
      return safeRouteCoordinates[safeRouteCoordinates.length - 1];
    }
    return null;
  }, [destination, safeRouteCoordinates]);
  const riderPosition = useMemo(() => {
    if (safeCoordinates.length) {
      return safeCoordinates[safeCoordinates.length - 1];
    }
    if (safeRouteCoordinates.length) {
      return safeRouteCoordinates[0];
    }
    return safeOrigin;
  }, [safeCoordinates, safeRouteCoordinates, safeOrigin]);

  const route = useMemo(
    () => {
      if (safeRouteCoordinates.length > 1) {
        return simplifyCoordinates(safeRouteCoordinates, 180);
      }
      if (safeCoordinates.length > 1) {
        return simplifyCoordinates(safeCoordinates, 120);
      }
      return [];
    },
    [safeCoordinates, safeRouteCoordinates],
  );

  const mapPoints = useMemo(
    () =>
      route.length
        ? route
        : [safeOrigin, riderPosition, safeDestination].filter((point): point is Coordinate => Boolean(point)),
    [route, riderPosition, safeDestination, safeOrigin],
  );

  if (!mapPoints.length) {
    return null;
  }

  const html = useMemo(
    () =>
      buildLeafletHtml({
        route,
        origin: safeOrigin,
        destination: safeDestination,
        rider: riderPosition,
        routeColor,
        storeLogoUri: mapIcons.storeLogoUri,
        riderIconUri: mapIcons.riderIconUri,
      }),
    [mapIcons.riderIconUri, mapIcons.storeLogoUri, route, routeColor, riderPosition, safeDestination, safeOrigin],
  );

  return (
    <View style={styles.mapWrap}>
      <WebView
        source={{ html }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onLoadStart={() => {
          setLoading(true);
          setFailed(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        setSupportMultipleWindows={false}
      />

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Map failed to load. Please check network and try again.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: 12,
    height: 360,
    marginTop: 10,
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
  errorOverlay: {
    backgroundColor: 'rgba(2, 6, 23, 0.76)',
    borderRadius: 8,
    bottom: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
