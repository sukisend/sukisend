import { supabase } from '../lib/supabase';
import { getDeliveryRatePerKm } from './geocodingService';

const DELIVERY_RATE_SETTING_KEY = 'delivery_rate_per_km';
const DELIVERY_RATE_DESCRIPTION = 'Distance fee rate per kilometer for rider checkout.';

function parseDeliveryRate(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return getDeliveryRatePerKm();
  }
  return parsed;
}

function isMissingSettingsTable(message?: string) {
  const text = (message ?? '').toLowerCase();
  return text.includes('app_settings') && (text.includes('relation') || text.includes('does not exist'));
}

export async function fetchDeliveryRatePerKmSetting(): Promise<number> {
  if (!supabase) {
    return getDeliveryRatePerKm();
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', DELIVERY_RATE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTable(error.message)) {
      return getDeliveryRatePerKm();
    }
    throw new Error(error.message);
  }

  return parseDeliveryRate(data?.setting_value);
}

export async function saveDeliveryRatePerKmSetting(ratePerKm: number) {
  if (!supabase) {
    throw new Error('Supabase is required to save delivery settings.');
  }

  const normalized = Number(ratePerKm);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('Delivery rate must be greater than zero.');
  }

  const { error } = await supabase.from('app_settings').upsert(
    {
      setting_key: DELIVERY_RATE_SETTING_KEY,
      setting_value: String(normalized),
      description: DELIVERY_RATE_DESCRIPTION,
    },
    {
      onConflict: 'setting_key',
    },
  );

  if (error) {
    if (isMissingSettingsTable(error.message)) {
      throw new Error('Missing app_settings table. Run the updated supabase/schema.sql in SQL editor first.');
    }
    throw new Error(error.message);
  }
}
