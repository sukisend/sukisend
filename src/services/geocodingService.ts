export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResult {
  countryRegion?: string;
  province?: string;
  city?: string;
  barangay?: string;
  postalCode?: string;
  line1?: string;
  displayName?: string;
}

const GEOCODING_API_BASE = (process.env.EXPO_PUBLIC_GEOCODING_API_BASE ?? 'https://nominatim.openstreetmap.org').replace(
  /\/+$/,
  '',
);
const PHOTON_API_BASE = (process.env.EXPO_PUBLIC_PHOTON_API_BASE ?? 'https://photon.komoot.io').replace(/\/+$/, '');
const DEFAULT_STORE_LAT = Number(process.env.EXPO_PUBLIC_STORE_LAT ?? 13.2186127);
const DEFAULT_STORE_LNG = Number(process.env.EXPO_PUBLIC_STORE_LNG ?? 120.6032722);
const DEFAULT_DELIVERY_RATE_PER_KM = Number(process.env.EXPO_PUBLIC_DELIVERY_RATE_PER_KM ?? 20);
const ROUTING_API_BASE = (process.env.EXPO_PUBLIC_ROUTING_API_BASE ?? 'https://router.project-osrm.org').replace(/\/+$/, '');

const geocodeCache = new Map<string, GeoPoint | null>();
const routeCache = new Map<string, { distanceKm: number; coordinates: GeoPoint[] } | null>();

function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isLikelyPhilippines(point: GeoPoint) {
  return point.latitude >= 4 && point.latitude <= 22 && point.longitude >= 116 && point.longitude <= 127;
}

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function pickFirstText(values: unknown[]) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return undefined;
}

export function getStoreCoordinates(): GeoPoint {
  if (!Number.isFinite(DEFAULT_STORE_LAT) || !Number.isFinite(DEFAULT_STORE_LNG)) {
    return { latitude: 10.3157, longitude: 123.8854 };
  }

  return { latitude: DEFAULT_STORE_LAT, longitude: DEFAULT_STORE_LNG };
}

export function getDeliveryRatePerKm() {
  return Number.isFinite(DEFAULT_DELIVERY_RATE_PER_KM) && DEFAULT_DELIVERY_RATE_PER_KM > 0
    ? DEFAULT_DELIVERY_RATE_PER_KM
    : 20;
}

export function buildAddressQuery(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = normalizeAddress(address);
  if (!query) {
    return null;
  }

  if (geocodeCache.has(query)) {
    return geocodeCache.get(query) ?? null;
  }

  const url = new URL(`${GEOCODING_API_BASE}/search`);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'ph');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      geocodeCache.set(query, null);
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) {
      geocodeCache.set(query, null);
      return null;
    }

    const first = rows[0];
    const latitude = toNumber(first?.lat);
    const longitude = toNumber(first?.lon);
    if (latitude !== null && longitude !== null) {
      const point = { latitude, longitude };
      if (isLikelyPhilippines(point)) {
        geocodeCache.set(query, point);
        return point;
      }
    }
  } catch {
    // Fall through to alternative provider.
  }

  try {
    const photonUrl = new URL(`${PHOTON_API_BASE}/api`);
    photonUrl.searchParams.set('q', address);
    photonUrl.searchParams.set('limit', '1');
    photonUrl.searchParams.set('lang', 'en');
    photonUrl.searchParams.set('osm_tag', 'place');

    const response = await fetch(photonUrl.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      geocodeCache.set(query, null);
      return null;
    }

    const payload = await response.json();
    const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : null;
    if (!coordinates || coordinates.length < 2) {
      geocodeCache.set(query, null);
      return null;
    }

    const longitude = toNumber(coordinates[0]);
    const latitude = toNumber(coordinates[1]);
    if (latitude === null || longitude === null) {
      geocodeCache.set(query, null);
      return null;
    }

    const point = { latitude, longitude };
    if (!isLikelyPhilippines(point)) {
      geocodeCache.set(query, null);
      return null;
    }

    geocodeCache.set(query, point);
    return point;
  } catch {
    geocodeCache.set(query, null);
    return null;
  }
}

export async function reverseGeocodePoint(point: GeoPoint): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return null;
  }

  const url = new URL(`${GEOCODING_API_BASE}/reverse`);
  url.searchParams.set('lat', String(point.latitude));
  url.searchParams.set('lon', String(point.longitude));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const address = payload?.address ?? {};
    const countryCode = toText(address?.country_code)?.toLowerCase();
    if (countryCode && countryCode !== 'ph') {
      return null;
    }

    const lineRoad = pickFirstText([address?.road, address?.residential, address?.pedestrian]);
    const lineNumber = pickFirstText([address?.house_number, address?.building]);
    const line1 = [lineNumber, lineRoad].filter(Boolean).join(' ').trim() || pickFirstText([address?.building, address?.hamlet]);

    return {
      countryRegion: pickFirstText([address?.country, 'Philippines']),
      province: pickFirstText([address?.state, address?.region, address?.province]),
      city: pickFirstText([address?.city, address?.town, address?.municipality, address?.county]),
      barangay: pickFirstText([address?.suburb, address?.neighbourhood, address?.quarter, address?.village]),
      postalCode: pickFirstText([address?.postcode]),
      line1: line1 || undefined,
      displayName: toText(payload?.display_name),
    };
  } catch {
    return null;
  }
}

export function haversineDistanceKm(from: GeoPoint, to: GeoPoint) {
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

export function computeDeliveryFeeByDistance(distanceKm: number, ratePerKm = getDeliveryRatePerKm()) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }
  return Number((distanceKm * ratePerKm).toFixed(2));
}

function makeRouteKey(from: GeoPoint, to: GeoPoint) {
  return `${from.latitude.toFixed(5)},${from.longitude.toFixed(5)}::${to.latitude.toFixed(5)},${to.longitude.toFixed(5)}`;
}

export async function fetchDrivingRoute(from: GeoPoint, to: GeoPoint): Promise<{ distanceKm: number; coordinates: GeoPoint[] } | null> {
  if (
    !Number.isFinite(from.latitude) ||
    !Number.isFinite(from.longitude) ||
    !Number.isFinite(to.latitude) ||
    !Number.isFinite(to.longitude)
  ) {
    return null;
  }

  const key = makeRouteKey(from, to);
  if (routeCache.has(key)) {
    return routeCache.get(key) ?? null;
  }

  const routeUrl = `${ROUTING_API_BASE}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = new URL(routeUrl);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      routeCache.set(key, null);
      return null;
    }

    const payload = await response.json();
    const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
    const rawCoordinates = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : null;
    const distanceMeters = Number(route?.distance ?? 0);

    if (!rawCoordinates?.length || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
      routeCache.set(key, null);
      return null;
    }

    const coordinates: GeoPoint[] = rawCoordinates
      .map((pair: any) => {
        const longitude = toNumber(Array.isArray(pair) ? pair[0] : null);
        const latitude = toNumber(Array.isArray(pair) ? pair[1] : null);
        if (longitude === null || latitude === null) {
          return null;
        }
        return { latitude, longitude };
      })
      .filter((point: GeoPoint | null): point is GeoPoint => Boolean(point));

    if (!coordinates.length) {
      routeCache.set(key, null);
      return null;
    }

    const result = {
      distanceKm: Number((distanceMeters / 1000).toFixed(2)),
      coordinates,
    };

    routeCache.set(key, result);
    return result;
  } catch {
    routeCache.set(key, null);
    return null;
  }
}
