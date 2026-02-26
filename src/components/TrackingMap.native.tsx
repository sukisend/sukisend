import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

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

export function TrackingMap({ coordinates, origin, destination, routeCoordinates = [] }: TrackingMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const safeCoordinates = useMemo(() => coordinates.filter((point) => isCoordinateValid(point)), [coordinates]);
  const safeRouteCoordinates = useMemo(
    () => routeCoordinates.filter((point) => isCoordinateValid(point)),
    [routeCoordinates],
  );
  const riderPosition = safeCoordinates.length ? safeCoordinates[safeCoordinates.length - 1] : null;
  const safeOrigin = isCoordinateValid(origin) ? origin : null;
  const safeDestination = isCoordinateValid(destination) ? destination : null;

  const route = useMemo(
    () =>
      safeRouteCoordinates.length
        ? dedupe(safeRouteCoordinates)
        : dedupe([
            ...(safeOrigin ? [safeOrigin] : []),
            ...safeCoordinates,
            ...(safeDestination ? [safeDestination] : []),
          ]),
    [safeCoordinates, safeDestination, safeOrigin, safeRouteCoordinates],
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

  const regionSource = riderPosition ?? safeDestination ?? safeOrigin ?? mapPoints[0];

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapPoints.length) {
      return;
    }

    const map = mapRef.current;
    if (mapPoints.length > 1) {
      map.fitToCoordinates(mapPoints, {
        animated: false,
        edgePadding: {
          top: 48,
          right: 48,
          bottom: 48,
          left: 48,
        },
      });
      return;
    }

    map.animateCamera(
      {
        center: mapPoints[0],
        zoom: 14,
      },
      { duration: 180 },
    );
  }, [mapPoints, mapReady]);

  return (
    <MapView
      ref={(instance) => {
        mapRef.current = instance;
      }}
      style={styles.map}
      initialRegion={{
        latitude: regionSource.latitude,
        longitude: regionSource.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }}
      onMapReady={() => setMapReady(true)}
    >
      {safeOrigin ? (
        <Marker coordinate={safeOrigin} title="SUKI SEND Store">
          <View style={styles.storeMarkerWrap}>
            <Image source={require('../../assets/suki-send-logo.png')} style={styles.storeMarkerLogo} resizeMode="cover" />
          </View>
        </Marker>
      ) : null}
      {safeDestination ? (
        <Marker coordinate={safeDestination} title="Customer">
          <View style={styles.customerBubble}>
            <Ionicons name="person" size={16} color="#FFFFFF" />
          </View>
        </Marker>
      ) : null}
      {riderPosition ? (
        <Marker coordinate={riderPosition} title="Rider">
          <View style={styles.riderBubble}>
            <Ionicons name="bicycle-outline" size={14} color="#FFFFFF" />
          </View>
        </Marker>
      ) : null}
      {route.length > 1 ? <Polyline coordinates={route} strokeWidth={4} strokeColor="#DC2626" /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: 12,
    height: 200,
    marginTop: 10,
    width: '100%',
  },
  riderBubble: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderColor: '#F97316',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  storeMarkerWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#1D4ED8',
    borderRadius: 18,
    borderWidth: 1.5,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  storeMarkerLogo: {
    borderRadius: 14,
    height: 26,
    width: 26,
  },
  customerBubble: {
    alignItems: 'center',
    backgroundColor: '#E11D48',
    borderColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
