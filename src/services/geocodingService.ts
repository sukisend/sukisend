export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const GEOCODING_API_BASE = (process.env.EXPO_PUBLIC_GEOCODING_API_BASE ?? 'https://nominatim.openstreetmap.org').replace(
  /\/+$/,
  '',
);
const PHOTON_API_BASE = (process.env.EXPO_PUBLIC_PHOTON_API_BASE ?? 'https://photon.komoot.io').replace(/\/+$/, '');
const DEFAULT_STORE_LAT = Number(process.env.EXPO_PUBLIC_STORE_LAT ?? 10.3157);
const DEFAULT_STORE_LNG = Number(process.env.EXPO_PUBLIC_STORE_LNG ?? 123.8854);
const DEFAULT_DELIVERY_RATE_PER_KM = Number(process.env.EXPO_PUBLIC_DELIVERY_RATE_PER_KM ?? 20);

const geocodeCache = new Map<string, GeoPoint | null>();

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
