import { Platform } from 'react-native';
import type { ReactElement } from 'react';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface AddressPinMapProps {
  value: Coordinate | null;
  onChange: (next: Coordinate) => void;
  height?: number;
}

const AddressPinMapImpl =
  Platform.OS === 'web'
    ? (require('./AddressPinMap.web').AddressPinMap as (props: AddressPinMapProps) => ReactElement | null)
    : (require('./AddressPinMap.native').AddressPinMap as (props: AddressPinMapProps) => ReactElement | null);

export function AddressPinMap(props: AddressPinMapProps) {
  return <AddressPinMapImpl {...props} />;
}
