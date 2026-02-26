import { useEffect, useMemo, useRef, useState } from 'react';
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
  element.style.background = kind === 'store' ? '#FFFFFF' : kind === 'customer' ? '#E11D48' : '#F97316';
  element.style.border = '1px solid #0F172A';
  element.style.boxShadow = '0 2px 6px rgba(15,23,42,0.35)';
  element.style.fontSize = '13px';
  element.style.color = kind === 'store' ? '#0F172A' : '#FFFFFF';
  element.style.fontWeight = '700';

  if (kind === 'store') {
    const logo = document.createElement('img');
    const src = resolveLogoUri();
    if (src) {
      logo.src = src;
      logo.style.width = '20px';
      logo.style.height = '20px';
      logo.style.borderRadius = '999px';
      element.appendChild(logo);
    } else {
      element.textContent = '🏬';
    }
  } else {
    element.textContent = kind === 'customer' ? '👤' : '🚚';
  }

  return element;
}

function buildOsmEmbedUrl(points: Coordinate[]) {
  if (!points.length) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes) - 0.01;
  const maxLat = Math.max(...latitudes) + 0.01;
  const minLng = Math.min(...longitudes) - 0.01;
  const maxLng = Math.max(...longitudes) + 0.01;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${centerLat},${centerLng}`;
}

export function TrackingMap({ coordinates, origin, destination, routeCoordinates = [] }: TrackingMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const embedUrl = useMemo(
    () => buildOsmEmbedUrl(route.length ? route : [origin, riderCoordinate, destination].filter((point): point is Coordinate => Boolean(point))),
    [destination, origin, riderCoordinate, route],
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
          attributionControl: { compact: true },
        });

        mapRef.current = map;
        loadTimeout = setTimeout(() => {
          if (!cancelled) {
            setLoading(false);
            setError('MapLibre timeout. Fallback map is shown.');
          }
        }, 9000);
        map.on('load', () => {
          if (!cancelled) {
            if (loadTimeout) {
              clearTimeout(loadTimeout);
            }
            setLoading(false);
            setError(null);
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
    };
  }, [destination, origin, riderCoordinate]);

  useEffect(() => {
    const map = mapRef.current;
    const module = maplibreRef.current;
    if (!map || !module || loading || error) {
      return;
    }

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
          'line-color': '#DC2626',
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
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

    const fitPoints: Coordinate[] = route.length
      ? route
      : [origin, riderCoordinate, destination].filter((point): point is Coordinate => Boolean(point));
    const firstPoint = fitPoints[0];
    if (firstPoint && fitPoints.length > 1) {
      const bounds = new module.LngLatBounds(
        [firstPoint.longitude, firstPoint.latitude],
        [firstPoint.longitude, firstPoint.latitude],
      );
      for (const point of fitPoints.slice(1)) {
        bounds.extend([point.longitude, point.latitude]);
      }
      map.fitBounds(bounds, { padding: 42, duration: 600, maxZoom: 15 });
    } else if (firstPoint) {
      map.easeTo({ center: [firstPoint.longitude, firstPoint.latitude], duration: 500, zoom: 14 });
    }
  }, [destination, error, loading, origin, riderCoordinate, route]);

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
