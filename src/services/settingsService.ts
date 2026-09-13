import { supabase } from '../lib/supabase';
import { getDeliveryRatePerKm, getStoreCoordinates } from './geocodingService';

const DELIVERY_RATE_SETTING_KEY = 'delivery_rate_per_km';
const STORE_LAT_KEY = 'store_latitude';
const STORE_LNG_KEY = 'store_longitude';
const DELIVERY_RADIUS_KEY = 'delivery_radius_meters';
const FREE_SHIPPING_KEY = 'free_shipping_threshold';

function isMissingSettingsTable(message?: string) {
  const text = (message ?? '').toLowerCase();
  return text.includes('app_settings') && (text.includes('relation') || text.includes('does not exist'));
}

async function fetchSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.setting_value;
}

async function upsertSetting(key: string, value: string) {
  await supabase.from('app_settings').upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
}

export async function fetchDeliveryRatePerKmSetting(): Promise<number> {
  const raw = await fetchSetting(DELIVERY_RATE_SETTING_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return getDeliveryRatePerKm();
  }
  return parsed;
}

export interface StoreLocation {
  latitude: number;
  longitude: number;
}

export async function fetchStoreLocation(): Promise<StoreLocation> {
  const fallback = getStoreCoordinates();
  const rawLat = await fetchSetting(STORE_LAT_KEY);
  const rawLng = await fetchSetting(STORE_LNG_KEY);
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng };
  }
  return fallback;
}

export async function saveStoreLocation(lat: number, lng: number) {
  await Promise.all([
    upsertSetting(STORE_LAT_KEY, String(lat)),
    upsertSetting(STORE_LNG_KEY, String(lng)),
  ]);
}

export async function fetchDeliveryRadiusMeters(): Promise<number> {
  const raw = await fetchSetting(DELIVERY_RADIUS_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

export async function saveDeliveryRadiusMeters(meters: number) {
  await upsertSetting(DELIVERY_RADIUS_KEY, String(Math.max(1000, Math.round(meters))));
}

export async function saveDeliveryRatePerKmSetting(ratePerKm: number) {
  await upsertSetting(DELIVERY_RATE_SETTING_KEY, String(Math.max(0, Number(ratePerKm.toFixed(2)))));
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchFreeShippingThreshold(): Promise<number> {
  const raw = await fetchSetting(FREE_SHIPPING_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function saveFreeShippingThreshold(threshold: number) {
  await upsertSetting(FREE_SHIPPING_KEY, String(Math.max(0, Math.round(threshold))));
}
