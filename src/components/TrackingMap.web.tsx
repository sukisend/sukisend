import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useTheme } from '../providers/ThemeProvider';

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

const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json';
const SOURCE_ID = 'tracking-route-source';
const LAYER_ID = 'tracking-route-layer';
const FALLBACK_CENTER: Coordinate = { latitude: 14.5995, longitude: 120.9842 };

function dedupe(points: Coordinate[]) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const prev = points[index - 1];
    return point.latitude !== prev.latitude || point.longitude !== prev.longitude;
  });
}

function toLineFeature(points: Coordinate[]) {
  return {
    type: 'FeatureCollection',
    features: points.length
      ? [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map((point) => [point.longitude, point.latitude]),
            },
          },
        ]
      : [],
  };
}

function fitMapToPoints(map: any, module: any, points: Coordinate[], animate = true) {
  if (!points.length) {
    return;
  }

  const firstPoint = points[0];
  if (!firstPoint) {
    return;
  }

  if (points.length > 1) {
    const bounds = new module.LngLatBounds(
      [firstPoint.longitude, firstPoint.latitude],
      [firstPoint.longitude, firstPoint.latitude],
    );
    for (const point of points.slice(1)) {
      bounds.extend([point.longitude, point.latitude]);
    }
    map.fitBounds(bounds, { padding: 48, duration: animate ? 600 : 0, maxZoom: 15 });
    return;
  }

  map.easeTo({
    center: [firstPoint.longitude, firstPoint.latitude],
    duration: animate ? 450 : 0,
    zoom: 14,
  });
}

const BRAND_LOGO = require('../../assets/suki-send-logo.png');

function resolveLogoUri() {
  const raw = BRAND_LOGO as any;
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw?.uri && typeof raw.uri === 'string') {
    return raw.uri;
  }
  if (raw?.default && typeof raw.default === 'string') {
    return raw.default;
  }
  if (raw?.default?.uri && typeof raw.default.uri === 'string') {
    return raw.default.uri;
  }
  return '';
}

function createMarkerElement(kind: 'store' | 'customer' | 'rider') {
  const element = document.createElement('div');
  element.style.width = '28px';
  element.style.height = '28px';
  element.style.borderRadius = '999px';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.background = kind === 'customer' ? '#E11D48' : '#FFFFFF';
  element.style.border =
    kind === 'store' ? '1.5px solid #1D4ED8' : kind === 'rider' ? '1.5px solid #F97316' : '1px solid #0F172A';
  element.style.boxShadow = '0 2px 6px rgba(15,23,42,0.35)';
  element.style.fontSize = '13px';
  element.style.color = kind === 'customer' ? '#FFFFFF' : '#0F172A';
  element.style.fontWeight = '700';

  if (kind === 'store' || kind === 'rider') {
    const logo = document.createElement('img');
    const src = resolveLogoUri();
    if (src) {
      logo.src = src;
      logo.style.width = '20px';
      logo.style.height = '20px';
      logo.style.borderRadius = '999px';
      element.appendChild(logo);
    } else {
      element.textContent = kind === 'store' ? 'S' : 'R';
    }
  } else {
    element.textContent = 'C';
  }

  return element;
}

function buildOsmEmbedUrl(points: Coordinate[], marker?: Coordinate | null) {
  if (!points.length) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes) - 0.01;
  const maxLat = Math.max(...latitudes) + 0.01;
  const minLng = Math.min(...longitudes) - 0.01;
  const maxLng = Math.max(...longitudes) + 0.01;
  const fallbackMarker = marker ?? { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 };
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${fallbackMarker.latitude},${fallbackMarker.longitude}`;
}

export function TrackingMap({
  coordinates,
  origin,
  destination,
  routeCoordinates = [],
  routeColor = '#DC2626',
}: TrackingMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const hasUserInteractedRef = useRef(false);
  const riderMarkerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  const riderCoordinate = coordinates.length ? coordinates[coordinates.length - 1] : null;
  const safeRouteCoordinates = routeCoordinates.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  const route = useMemo(
    () =>
      dedupe(
        safeRouteCoordinates.length
          ? safeRouteCoordinates
          : [...(origin ? [origin] : []), ...coordinates, ...(destination ? [destination] : [])],
      ),
    [coordinates, destination, origin, safeRouteCoordinates],
  );
  const fitPoints = useMemo(
    () => (route.length ? route : [origin, riderCoordinate, destination].filter((point): point is Coordinate => Boolean(point))),
    [destination, origin, riderCoordinate, route],
  );
  const embedUrl = useMemo(
    () => buildOsmEmbedUrl(fitPoints, riderCoordinate ?? destination ?? origin ?? null),
    [destination, fitPoints, origin, riderCoordinate],
  );

  useEffect(() => {
    let cancelled = false;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const module = await import('maplibre-gl');
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        maplibreRef.current = module;
        const center = riderCoordinate ?? destination ?? origin ?? FALLBACK_CENTER;

        const map = new module.Map({
          container: mapContainerRef.current,
          style: MAP_STYLE_URL,
          center: [center.longitude, center.latitude],
          zoom: 12,
          pitchWithRotate: false,
          attributionControl: { compact: true },
        });

        mapRef.current = map;
        map.addControl(new module.NavigationControl({ visualizePitch: false }), 'top-right');
        map.on('dragstart', () => {
          hasUserInteractedRef.current = true;
          setAutoFollow(false);
        });
        map.on('zoomstart', () => {
          hasUserInteractedRef.current = true;
          setAutoFollow(false);
        });

        loadTimeout = setTimeout(() => {
          if (!cancelled) {
            setLoading(false);
            setError('MapLibre timeout. Fallback map is shown.');
          }
        }, 16000);
        map.on('load', () => {
          if (!cancelled) {
            if (loadTimeout) {
              clearTimeout(loadTimeout);
            }
            setLoading(false);
            setError(null);
            map.resize();
          }
        });
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError('MapLibre unavailable. Fallback map is shown.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
      }
      riderMarkerRef.current?.remove?.();
      originMarkerRef.current?.remove?.();
      destinationMarkerRef.current?.remove?.();
      mapRef.current?.remove?.();
      riderMarkerRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      mapRef.current = null;
      hasUserInteractedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const module = maplibreRef.current;
    if (!map || !module || loading || error) {
      return;
    }

    map.resize();

    const featureCollection = toLineFeature(route);
    const existingSource = map.getSource(SOURCE_ID);
    if (existingSource?.setData) {
      existingSource.setData(featureCollection as any);
    } else if (map.isStyleLoaded?.()) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: featureCollection as any,
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': routeColor,
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
    }

    if (map.getLayer?.(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, 'line-color', routeColor);
    }

    riderMarkerRef.current?.remove?.();
    originMarkerRef.current?.remove?.();
    destinationMarkerRef.current?.remove?.();
    riderMarkerRef.current = null;
    originMarkerRef.current = null;
    destinationMarkerRef.current = null;

    if (origin) {
      originMarkerRef.current = new module.Marker({ element: createMarkerElement('store') })
        .setLngLat([origin.longitude, origin.latitude])
        .addTo(map);
    }

    if (destination) {
      destinationMarkerRef.current = new module.Marker({ element: createMarkerElement('customer') })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(map);
    }

    if (riderCoordinate) {
      riderMarkerRef.current = new module.Marker({ element: createMarkerElement('rider') })
        .setLngLat([riderCoordinate.longitude, riderCoordinate.latitude])
        .addTo(map);
    }

    if (autoFollow || !hasUserInteractedRef.current) {
      fitMapToPoints(map, module, fitPoints, true);
    }
  }, [autoFollow, error, fitPoints, loading, route, routeColor, riderCoordinate, destination, origin]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const module = maplibreRef.current;
    if (!map || !module) {
      return;
    }

    hasUserInteractedRef.current = false;
    setAutoFollow(true);
    fitMapToPoints(map, module, fitPoints, true);
  }, [fitPoints]);

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${theme.colors.border}`,
        height: 220,
        marginTop: 10,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        background: theme.colors.surface,
      }}
    >
      {!error ? <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} /> : null}
      {error && embedUrl ? (
        <iframe
          title="Tracking map fallback"
          src={embedUrl}
          style={{ border: 0, height: '100%', width: '100%' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}
      {loading && !error ? (
        <div
          style={{
            alignItems: 'center',
            background: '#0F172A66',
            color: '#FFFFFF',
            display: 'flex',
            fontSize: 12,
            fontWeight: 600,
            inset: 0,
            justifyContent: 'center',
            position: 'absolute',
          }}
        >
          Loading map...
        </div>
      ) : null}
      {!loading && !error && !autoFollow ? (
        <button
          type="button"
          onClick={handleRecenter}
          style={{
            alignItems: 'center',
            background: '#0F172ACC',
            border: '1px solid #334155',
            borderRadius: 999,
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            fontSize: 11,
            fontWeight: 700,
            gap: 4,
            padding: '6px 10px',
            position: 'absolute',
            right: 8,
            top: 8,
          }}
        >
          Recenter
        </button>
      ) : null}
      {error ? (
        <div
          style={{
            background: '#0F172ACC',
            borderRadius: 8,
            bottom: 8,
            color: '#FFFFFF',
            fontSize: 11,
            left: 8,
            padding: '6px 8px',
            position: 'absolute',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

