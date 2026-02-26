import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { MapPressEvent, Marker } from 'react-native-maps';

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

export function AddressPinMap({ value, onChange, height = 200 }: AddressPinMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const fallback = useMemo(() => getStoreCoordinates(), []);
  const activePoint = isCoordinateValid(value) ? value : fallback;

  useEffect(() => {
    if (!mapRef.current || !isCoordinateValid(value)) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: value,
        zoom: 15,
      },
      { duration: 220 },
    );
  }, [value]);

  const handleMapPress = (event: MapPressEvent) => {
    const next = event.nativeEvent.coordinate;
    if (!isCoordinateValid(next)) {
      return;
    }
    onChange(next);
  };

  return (
    <MapView
      ref={(instance) => {
        mapRef.current = instance;
      }}
      style={[styles.map, { height }]}
      initialRegion={{
        latitude: activePoint.latitude,
        longitude: activePoint.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      }}
      onPress={handleMapPress}
    >
      <Marker
        coordinate={activePoint}
        draggable
        title="Delivery pin"
        onDragEnd={(event) => {
          const next = event.nativeEvent.coordinate;
          if (isCoordinateValid(next)) {
            onChange(next);
          }
        }}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
});
