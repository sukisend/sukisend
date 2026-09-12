import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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

interface ProjectedPoint {
  x: number;
  y: number;
}

interface TileDescriptor {
  key: string;
  left: number;
  top: number;
  uri: string;
}

interface LineSegment {
  key: string;
  left: number;
  top: number;
  width: number;
  angle: number;
}

interface PreviewLayout {
  height: number;
  tiles: TileDescriptor[];
  routeSegments: LineSegment[];
  originPoint: ProjectedPoint | null;
  destinationPoint: ProjectedPoint | null;
  riderPoint: ProjectedPoint | null;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 16;
const MAP_PADDING = 34;
const STORE_LOGO = require('../../assets/suki-send-logo.png');
const RIDER_LOGO = require('../../assets/rider.png');

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

    const previous = points[index - 1];
    return point.latitude !== previous.latitude || point.longitude !== previous.longitude;
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

function samePoint(a: Coordinate | null | undefined, b: Coordinate | null | undefined) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
}

function offsetPoint(point: Coordinate, latitudeOffset: number, longitudeOffset: number): Coordinate {
  return {
    latitude: point.latitude + latitudeOffset,
    longitude: point.longitude + longitudeOffset,
  };
}

function projectCoordinate(point: Coordinate, zoom: number): ProjectedPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedSine = Math.min(Math.max(Math.sin((point.latitude * Math.PI) / 180), -0.9999), 0.9999);

  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + clampedSine) / (1 - clampedSine)) / (4 * Math.PI)) * scale,
  };
}

function toRelativePoint(projected: ProjectedPoint, left: number, top: number): ProjectedPoint {
  return {
    x: projected.x - left,
    y: projected.y - top,
  };
}

function createSegments(points: ProjectedPoint[]) {
  const segments: LineSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const width = Math.hypot(deltaX, deltaY);

    if (!Number.isFinite(width) || width < 1) {
      continue;
    }

    segments.push({
      key: `route-segment-${index}`,
      left: start.x,
      top: start.y,
      width,
      angle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
    });
  }

  return segments;
}

function chooseZoom(points: Coordinate[], width: number, height: number, padding: number) {
  if (points.length <= 1) {
    return 14;
  }

  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => projectCoordinate(point, zoom));
    const xValues = projected.map((point) => point.x);
    const yValues = projected.map((point) => point.y);
    const spanX = Math.max(...xValues) - Math.min(...xValues);
    const spanY = Math.max(...yValues) - Math.min(...yValues);

    if (spanX <= availableWidth && spanY <= availableHeight) {
      return zoom;
    }
  }

  return MIN_ZOOM;
}

function buildPreviewLayout(
  width: number,
  height: number,
  route: Coordinate[],
  origin: Coordinate | null,
  destination: Coordinate | null,
  rider: Coordinate | null,
): PreviewLayout | null {
  if (width < 40 || height < 40) {
    return null;
  }

  const fitPoints = mergeFitPoints(route, [origin, rider, destination]);
  if (!fitPoints.length) {
    return null;
  }

  const zoom = chooseZoom(fitPoints, width, height, MAP_PADDING);
  const projectedFitPoints = fitPoints.map((point) => projectCoordinate(point, zoom));
  const projectedRoute = route.map((point) => projectCoordinate(point, zoom));

  const xValues = projectedFitPoints.map((point) => point.x);
  const yValues = projectedFitPoints.map((point) => point.y);
  const centerX =
    projectedFitPoints.length === 1
      ? projectedFitPoints[0].x
      : (Math.min(...xValues) + Math.max(...xValues)) / 2;
  const centerY =
    projectedFitPoints.length === 1
      ? projectedFitPoints[0].y
      : (Math.min(...yValues) + Math.max(...yValues)) / 2;
  const topLeftX = centerX - width / 2;
  const topLeftY = centerY - height / 2;

  const routePoints = projectedRoute.map((point) => toRelativePoint(point, topLeftX, topLeftY));
  const routeSegments = createSegments(routePoints);

  const tileCount = 2 ** zoom;
  const startTileX = Math.floor(topLeftX / TILE_SIZE);
  const endTileX = Math.floor((topLeftX + width) / TILE_SIZE);
  const startTileY = Math.floor(topLeftY / TILE_SIZE);
  const endTileY = Math.floor((topLeftY + height) / TILE_SIZE);
  const tiles: TileDescriptor[] = [];

  for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) {
      continue;
    }

    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `tile-${zoom}-${wrappedTileX}-${tileY}`,
        left: tileX * TILE_SIZE - topLeftX,
        top: tileY * TILE_SIZE - topLeftY,
        uri: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
      });
    }
  }

  return {
    height,
    tiles,
    routeSegments,
    originPoint: origin ? toRelativePoint(projectCoordinate(origin, zoom), topLeftX, topLeftY) : null,
    destinationPoint: destination ? toRelativePoint(projectCoordinate(destination, zoom), topLeftX, topLeftY) : null,
    riderPoint: rider ? toRelativePoint(projectCoordinate(rider, zoom), topLeftX, topLeftY) : null,
  };
}

function StoreMarker({ point }: { point: ProjectedPoint }) {
  return (
    <View style={[styles.markerBase, styles.storeMarker, { left: point.x - 20, top: point.y - 20 }]}>
      <Image source={STORE_LOGO} style={styles.storeMarkerImage} resizeMode="contain" />
    </View>
  );
}

function RiderMarker({ point }: { point: ProjectedPoint }) {
  return (
    <View style={[styles.markerBase, styles.riderMarker, { left: point.x - 24, top: point.y - 24 }]}>
      <Image source={RIDER_LOGO} style={styles.riderMarkerImage} resizeMode="contain" />
    </View>
  );
}

function CustomerMarker({ point }: { point: ProjectedPoint }) {
  return (
    <View style={[styles.markerBase, styles.customerMarker, { left: point.x - 16, top: point.y - 16 }]}>
      <View style={styles.customerAvatar}>
        <Ionicons name="person" size={12} color="#0F172A" />
      </View>
    </View>
  );
}

export function TrackingMap({
  coordinates,
  origin,
  destination,
  routeCoordinates = [],
  routeColor = '#DC2626',
}: TrackingMapProps) {
  const window = useWindowDimensions();
  const [mapWidth, setMapWidth] = useState(0);

  const mapHeight = useMemo(() => Math.max(220, Math.min(280, Math.round(window.width * 0.62))), [window.width]);

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
  }, [safeCoordinates, safeOrigin, safeRouteCoordinates]);
  const route = useMemo(() => {
    if (safeRouteCoordinates.length > 1) {
      return simplifyCoordinates(safeRouteCoordinates, 180);
    }

    if (safeCoordinates.length > 1) {
      return simplifyCoordinates(safeCoordinates, 120);
    }

    return [];
  }, [safeCoordinates, safeRouteCoordinates]);

  const originMarkerPoint = useMemo(() => {
    if (!safeOrigin) {
      return null;
    }

    return samePoint(safeOrigin, riderPosition) ? offsetPoint(safeOrigin, 0.00035, -0.00035) : safeOrigin;
  }, [riderPosition, safeOrigin]);
  const destinationMarkerPoint = useMemo(() => {
    if (!safeDestination) {
      return null;
    }

    return samePoint(safeDestination, riderPosition) ? offsetPoint(safeDestination, -0.00035, 0.00035) : safeDestination;
  }, [riderPosition, safeDestination]);

  const layout = useMemo(
    () =>
      buildPreviewLayout(
        mapWidth,
        mapHeight,
        route,
        originMarkerPoint,
        destinationMarkerPoint,
        riderPosition,
      ),
    [destinationMarkerPoint, mapHeight, mapWidth, originMarkerPoint, riderPosition, route],
  );

  if (!mergeFitPoints(route, [safeOrigin, riderPosition, safeDestination]).length) {
    return null;
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth && nextWidth !== mapWidth) {
      setMapWidth(nextWidth);
    }
  };

  return (
    <View style={[styles.mapWrap, { height: mapHeight }]} onLayout={handleLayout}>
      <View style={styles.mapSurface}>
        {layout ? (
          <>
            {layout.tiles.map((tile) => (
              <Image key={tile.key} source={{ uri: tile.uri }} style={[styles.tile, { left: tile.left, top: tile.top }]} />
            ))}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {layout.routeSegments.map((segment) => (
                <View
                  key={`${segment.key}-shadow`}
                  style={[
                    styles.routeShadow,
                    {
                      left: segment.left + segment.width / 2,
                      top: segment.top,
                      width: segment.width,
                      transform: [
                        { translateX: -segment.width / 2 },
                        { translateY: -4.5 },
                        { rotate: `${segment.angle}deg` },
                      ],
                    },
                  ]}
                />
              ))}
              {layout.routeSegments.map((segment) => (
                <View
                  key={segment.key}
                  style={[
                    styles.routeLine,
                    {
                      backgroundColor: routeColor,
                      left: segment.left + segment.width / 2,
                      top: segment.top,
                      width: segment.width,
                      transform: [
                        { translateX: -segment.width / 2 },
                        { translateY: -3 },
                        { rotate: `${segment.angle}deg` },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
            {layout.originPoint ? <StoreMarker point={layout.originPoint} /> : null}
            {layout.destinationPoint ? <CustomerMarker point={layout.destinationPoint} /> : null}
            {layout.riderPoint ? <RiderMarker point={layout.riderPoint} /> : null}
          </>
        ) : (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Loading live map preview...</Text>
          </View>
        )}
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.captionText}>Live route preview auto-fits the rider, store, and receiver locations.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    alignSelf: 'center',
    borderRadius: 12,
    marginTop: 10,
    maxWidth: 420,
    overflow: 'hidden',
    width: '100%',
  },
  mapSurface: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  tile: {
    height: TILE_SIZE,
    position: 'absolute',
    width: TILE_SIZE,
  },
  routeShadow: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderRadius: 999,
    height: 9,
    position: 'absolute',
  },
  routeLine: {
    borderRadius: 999,
    height: 6,
    position: 'absolute',
  },
  markerBase: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  storeMarker: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1D4ED8',
    borderRadius: 999,
    borderWidth: 2,
    elevation: 4,
    height: 40,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    width: 40,
  },
  storeMarkerImage: {
    height: 30,
    width: 30,
  },
  riderMarker: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F97316',
    borderRadius: 999,
    borderWidth: 2,
    elevation: 4,
    height: 48,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    width: 48,
  },
  riderMarkerImage: {
    height: 36,
    width: 36,
  },
  customerMarker: {
    backgroundColor: '#E11D48',
    borderColor: '#831843',
    borderRadius: 999,
    borderWidth: 2,
    elevation: 4,
    height: 32,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    width: 32,
  },
  customerAvatar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.2)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  captionRow: {
    paddingTop: 8,
  },
  captionText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
});
