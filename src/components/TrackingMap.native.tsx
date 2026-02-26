// Native version: uses react-native-maps
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

interface Coordinate {
    latitude: number;
    longitude: number;
}

interface TrackingMapProps {
    coordinates: Coordinate[];
    origin?: Coordinate | null;
    destination?: Coordinate | null;
}

function dedupe(points: Coordinate[]) {
    return points.filter((point, index) => {
        if (index === 0) return true;
        const prev = points[index - 1];
        return point.latitude !== prev.latitude || point.longitude !== prev.longitude;
    });
}

export function TrackingMap({ coordinates, origin, destination }: TrackingMapProps) {
    const riderPosition = coordinates.length ? coordinates[coordinates.length - 1] : null;
    const route = dedupe([
        ...(origin ? [origin] : []),
        ...coordinates,
        ...(destination ? [destination] : []),
    ]);

    if (!route.length && !riderPosition && !destination && !origin) {
        return null;
    }

    const regionSource = riderPosition ?? destination ?? origin ?? route[0];

    return (
        <MapView
            style={styles.map}
            initialRegion={{
                latitude: regionSource.latitude,
                longitude: regionSource.longitude,
                latitudeDelta: 0.12,
                longitudeDelta: 0.12,
            }}
        >
            {origin ? <Marker coordinate={origin} title="Store" pinColor="#2563EB" /> : null}
            {destination ? <Marker coordinate={destination} title="Receiver" pinColor="#EF4444" /> : null}
            {riderPosition ? (
                <Marker coordinate={riderPosition} title="Rider">
                    <View style={styles.riderBubble}>
                        <Text style={styles.riderIcon}>🏍</Text>
                    </View>
                </Marker>
            ) : null}
            {route.length > 1 ? (
                <Polyline coordinates={route} strokeWidth={4} strokeColor="#DC2626" />
            ) : null}
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
    riderIcon: {
        color: '#FFFFFF',
        fontSize: 16,
    },
});
