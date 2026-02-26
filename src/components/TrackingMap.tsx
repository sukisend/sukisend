import { Platform } from 'react-native';
import type { ReactElement } from 'react';

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

const TrackingMapImpl =
  Platform.OS === 'web'
    ? (require('./TrackingMap.web').TrackingMap as (props: TrackingMapProps) => ReactElement | null)
    : (require('./TrackingMap.native').TrackingMap as (props: TrackingMapProps) => ReactElement | null);

export function TrackingMap(props: TrackingMapProps) {
  return <TrackingMapImpl {...props} />;
}
