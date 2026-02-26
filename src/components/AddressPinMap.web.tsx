import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useTheme } from '../providers/ThemeProvider';
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

const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json';

function isValidCoordinate(point: Coordinate | null | undefined): point is Coordinate {
  if (!point) {
    return false;
  }
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function createPinElement() {
  const element = document.createElement('div');
  element.style.width = '28px';
  element.style.height = '28px';
  element.style.borderRadius = '999px';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.background = '#F97316';
  element.style.border = '1px solid #0F172A';
  element.style.boxShadow = '0 2px 8px rgba(15,23,42,0.35)';
  element.style.color = '#FFFFFF';
  element.style.fontSize = '14px';
  element.textContent = '📍';
  return element;
}

export function AddressPinMap({ value, onChange, height = 200 }: AddressPinMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fallback = useMemo(() => getStoreCoordinates(), []);
  const activePoint = isValidCoordinate(value) ? value : fallback;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const module = await import('maplibre-gl');
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        maplibreRef.current = module;
        const map = new module.Map({
          container: mapContainerRef.current,
          style: MAP_STYLE_URL,
          center: [activePoint.longitude, activePoint.latitude],
          zoom: 13,
          attributionControl: { compact: true },
        });

        mapRef.current = map;
        map.on('load', () => {
          if (!cancelled) {
            setLoading(false);
          }
        });

        map.on('click', (event: any) => {
          const lng = Number(event?.lngLat?.lng);
          const lat = Number(event?.lngLat?.lat);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
          }
          onChange({
            latitude: Number(lat.toFixed(7)),
            longitude: Number(lng.toFixed(7)),
          });
        });
      } catch {
        if (!cancelled) {
          setError('Web map is unavailable. Use mobile map pinning for exact location.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const module = maplibreRef.current;
    if (!map || !module) {
      return;
    }

    markerRef.current?.remove?.();
    markerRef.current = new module.Marker({
      element: createPinElement(),
      draggable: true,
    })
      .setLngLat([activePoint.longitude, activePoint.latitude])
      .addTo(map);

    markerRef.current.on('dragend', () => {
      const lngLat = markerRef.current.getLngLat();
      onChange({
        latitude: Number(lngLat.lat.toFixed(7)),
        longitude: Number(lngLat.lng.toFixed(7)),
      });
    });

    map.easeTo({
      center: [activePoint.longitude, activePoint.latitude],
      duration: 380,
      zoom: Math.max(map.getZoom?.() ?? 13, 13),
    });
  }, [activePoint.latitude, activePoint.longitude, onChange]);

  if (error) {
    return (
      <View style={[styles.fallbackWrap, { borderColor: theme.colors.border }]}>
        <Text style={[styles.fallbackText, { color: theme.colors.textMuted }]}>{error}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.mapWrap,
        {
          height,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fallbackWrap: {
    alignItems: 'center',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  fallbackText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
