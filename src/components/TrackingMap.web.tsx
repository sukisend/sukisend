import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useTheme } from '../providers/ThemeProvider';
import { getReceiverMarkerSvg } from './trackingMapMarkerAssets';
import { getWebMapStyleDefinition } from './webMapStyle';

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

function mergeFitPoints(route: Coordinate[], extras: Array<Coordinate | null | undefined>) {
  const seen = new Set<string>();
  return [...route, ...extras.filter((point): point is Coordinate => Boolean(point))].filter((point) => {
    const key = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
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

  const center = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  const averageCenter = {
    latitude: center.latitude / points.length,
    longitude: center.longitude / points.length,
  };

  if (points.length > 1) {
    const bounds = new module.LngLatBounds(
      [firstPoint.longitude, firstPoint.latitude],
      [firstPoint.longitude, firstPoint.latitude],
    );
    for (const point of points.slice(1)) {
      bounds.extend([point.longitude, point.latitude]);
    }

    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    const width = Number(container?.clientWidth ?? 0);
    const height = Number(container?.clientHeight ?? 0);
    const minSide = Math.max(0, Math.min(width, height));
    const lngSpan = Math.abs(bounds.getEast() - bounds.getWest());
    const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());

    if (!minSide || minSide < 140 || (lngSpan < 0.00008 && latSpan < 0.00008)) {
      map.easeTo({
        center: [averageCenter.longitude, averageCenter.latitude],
        duration: animate ? 450 : 0,
        zoom: 14,
      });
      return;
    }

    try {
      const horizontalPadding = Math.max(14, Math.min(34, Math.floor(width * 0.09)));
      const verticalPadding = Math.max(16, Math.min(40, Math.floor(height * 0.12)));
      map.fitBounds(bounds, {
        padding: {
          bottom: Math.min(verticalPadding, Math.max(18, Math.floor(height / 4))),
          left: Math.min(horizontalPadding + 10, Math.max(20, Math.floor(width / 4))),
          right: Math.min(horizontalPadding, Math.max(18, Math.floor(width / 4))),
          top: Math.min(verticalPadding + 10, Math.max(22, Math.floor(height / 4))),
        },
        duration: animate ? 600 : 0,
        maxZoom: 14.8,
      });
    } catch {
      map.easeTo({
        center: [averageCenter.longitude, averageCenter.latitude],
        duration: animate ? 450 : 0,
        zoom: 13,
      });
    }
    return;
  }

  map.easeTo({
    center: [firstPoint.longitude, firstPoint.latitude],
    duration: animate ? 450 : 0,
    zoom: 14,
  });
}

const BRAND_LOGO = require('../../assets/suki-send-logo.png');
const RIDER_LOGO = require('../../assets/rider.png');

function resolveAssetUri(moduleRef: any) {
  const raw = moduleRef as any;
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
  element.style.width = kind === 'customer' ? '32px' : '28px';
  element.style.height = kind === 'customer' ? '32px' : '28px';
  element.style.borderRadius = '999px';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.background = kind === 'customer' ? '#E11D48' : '#FFFFFF';
  element.style.border =
    kind === 'store' ? '1.5px solid #1D4ED8' : kind === 'rider' ? '1.5px solid #F97316' : '2px solid #831843';
  element.style.boxShadow = '0 2px 6px rgba(15,23,42,0.35)';
  element.style.fontSize = '13px';
  element.style.color = kind === 'customer' ? '#FFFFFF' : '#0F172A';
  element.style.fontWeight = '700';

  if (kind === 'store' || kind === 'rider') {
    const logo = document.createElement('img');
    const src = kind === 'store' ? resolveAssetUri(BRAND_LOGO) : resolveAssetUri(RIDER_LOGO);
    if (src) {
      logo.src = src;
      logo.style.width = '20px';
      logo.style.height = '20px';
      logo.style.borderRadius = '999px';
      element.appendChild(logo);
    } else {
      element.textContent = kind === 'store' ? '🏪' : '🏍️';
    }
  } else {
    const inner = document.createElement('div');
    inner.style.width = '18px';
    inner.style.height = '18px';
    inner.style.borderRadius = '999px';
    inner.style.backgroundColor = '#FFFFFF';
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.innerHTML = getReceiverMarkerSvg('#0F172A');

    const icon = inner.querySelector('svg');
    if (icon) {
      icon.setAttribute('width', '12');
      icon.setAttribute('height', '12');
      icon.style.display = 'block';
    }

    element.appendChild(inner);
  }

  return element;
}

function buildOpenStreetMapUrl(marker?: Coordinate | null) {
  if (!marker) {
    return null;
  }

  return `https://www.openstreetmap.org/?mlat=${marker.latitude}&mlon=${marker.longitude}#map=15/${marker.latitude}/${marker.longitude}`;
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
  const fitFrameRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  const riderCoordinate = coordinates.length ? coordinates[coordinates.length - 1] : null;
  const safeRouteCoordinates = routeCoordinates.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  const safeLiveCoordinates = coordinates.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  const route = useMemo(
    () =>
      dedupe(
        safeRouteCoordinates.length > 1
          ? safeRouteCoordinates
          : safeLiveCoordinates.length > 1
            ? safeLiveCoordinates
            : [],
      ),
    [safeLiveCoordinates, safeRouteCoordinates],
  );
  const fitPoints = useMemo(
    () => mergeFitPoints(route, [origin, riderCoordinate, destination]),
    [destination, origin, riderCoordinate, route],
  );
  const externalMapUrl = useMemo(
    () => buildOpenStreetMapUrl(riderCoordinate ?? destination ?? origin ?? fitPoints[0] ?? null),
    [destination, fitPoints, origin, riderCoordinate],
  );

  const scheduleFitToPoints = useCallback(
    (animate = true) => {
      const map = mapRef.current;
      const module = maplibreRef.current;
      if (!map || !module) {
        return;
      }

      if (fitFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }

      let attempts = 0;
      const runFit = () => {
        const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
        const width = Number(container?.clientWidth ?? 0);
        const height = Number(container?.clientHeight ?? 0);

        if ((width < 140 || height < 140) && attempts < 10 && typeof requestAnimationFrame === 'function') {
          attempts += 1;
          fitFrameRef.current = requestAnimationFrame(runFit);
          return;
        }

        fitFrameRef.current = null;
        map.resize();
        fitMapToPoints(map, module, fitPoints, animate);
      };

      if (typeof requestAnimationFrame === 'function') {
        fitFrameRef.current = requestAnimationFrame(() => {
          fitFrameRef.current = requestAnimationFrame(runFit);
        });
        return;
      }

      runFit();
    },
    [fitPoints],
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
          style: getWebMapStyleDefinition(),
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
            setError('Map preview timed out.');
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
        map.on('error', () => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError('Map preview is unavailable.');
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
      if (fitFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(fitFrameRef.current);
      }
      riderMarkerRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      mapRef.current = null;
      hasUserInteractedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      if (autoFollow || !hasUserInteractedRef.current) {
        scheduleFitToPoints(false);
      }
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, [autoFollow, scheduleFitToPoints]);

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
      scheduleFitToPoints(true);
    }
  }, [autoFollow, error, fitPoints, loading, route, routeColor, riderCoordinate, destination, origin, scheduleFitToPoints]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    hasUserInteractedRef.current = false;
    setAutoFollow(true);
    scheduleFitToPoints(true);
  }, [scheduleFitToPoints]);

  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 12,
        border: `1px solid ${theme.colors.border}`,
        height: 'auto',
        margin: '10px auto 0',
        maxWidth: 420,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        background: theme.colors.surface,
      }}
    >
      {!error ? <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} /> : null}
      {error ? (
        <div
          style={{
            alignItems: 'center',
            color: theme.colors.text,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            inset: 0,
            justifyContent: 'center',
            padding: 16,
            position: 'absolute',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>{error}</div>
          <div style={{ color: theme.colors.textMuted, fontSize: 11, lineHeight: 1.4, maxWidth: 240 }}>
            External maps are opened only after a click to avoid browser tracking warnings.
          </div>
          {externalMapUrl ? (
            <a
              href={externalMapUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                background: theme.colors.primary,
                borderRadius: 999,
                color: theme.colors.primaryContrast,
                fontSize: 11,
                fontWeight: 700,
                padding: '8px 12px',
                textDecoration: 'none',
              }}
            >
              Open in OpenStreetMap
            </a>
          ) : null}
        </div>
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
            left: 8,
            top: 8,
          }}
        >
          Recenter
        </button>
      ) : null}
    </div>
  );
}

