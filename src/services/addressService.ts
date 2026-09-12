import { supabase } from '../lib/supabase';
import { CustomerAddress } from '../types/models';
import {
  ADDRESS_SELECT_COLUMNS,
  ADDRESS_SELECT_COLUMNS_LEGACY,
  getAddressCoordinatesSupported,
  isMissingAddressCoordinateColumn,
  setAddressCoordinatesSupported,
} from './columnDetection';
import { mapRowToAddress } from './mappers';

async function clearDefaultAddresses(customerId: string, keepAddressId?: string) {
  if (!supabase) {
    return;
  }

  let query = supabase
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId);

  if (keepAddressId) {
    query = query.neq('id', keepAddressId);
  }

  const { error } = await query.eq('is_default', true);
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  if (!supabase) {
    return [];
  }

  if (getAddressCoordinatesSupported() !== false) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select(ADDRESS_SELECT_COLUMNS)
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error) {
      setAddressCoordinatesSupported(true);
      return (data ?? []).map(mapRowToAddress);
    }

    if (!isMissingAddressCoordinateColumn(error.message)) {
      throw new Error(error.message);
    }

    setAddressCoordinatesSupported(false);
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .select(ADDRESS_SELECT_COLUMNS_LEGACY)
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map(mapRowToAddress);
}

export async function saveCustomerAddress(input: Omit<CustomerAddress, 'id'> & { id?: string }): Promise<CustomerAddress> {
  if (!supabase) {
    throw new Error('Address management requires Supabase.');
  }

  const payload = {
    customer_id: input.customerId,
    country_region: input.countryRegion,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    province: input.province,
    city: input.city,
    barangay: input.barangay,
    postal_code: input.postalCode,
    line1: input.line1,
    line2: input.line2 ?? null,
    latitude: Number.isFinite(input.latitude) ? Number(input.latitude) : null,
    longitude: Number.isFinite(input.longitude) ? Number(input.longitude) : null,
    is_default: input.isDefault,
  };

  if (input.id) {
    if (input.isDefault) {
      await clearDefaultAddresses(input.customerId, input.id);
    }

    if (getAddressCoordinatesSupported() !== false) {
      const { data, error } = await supabase
        .from('customer_addresses')
        .update(payload)
        .eq('id', input.id)
        .select(ADDRESS_SELECT_COLUMNS)
        .single();

      if (!error) {
        setAddressCoordinatesSupported(true);
        return mapRowToAddress(data);
      }

      if (!isMissingAddressCoordinateColumn(error.message)) {
        throw new Error(error.message);
      }

      setAddressCoordinatesSupported(false);
    }

    const legacyPayload = {
      customer_id: input.customerId,
      country_region: input.countryRegion,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      province: input.province,
      city: input.city,
      barangay: input.barangay,
      postal_code: input.postalCode,
      line1: input.line1,
      line2: input.line2 ?? null,
      is_default: input.isDefault,
    };

    const { data, error } = await supabase
      .from('customer_addresses')
      .update(legacyPayload)
      .eq('id', input.id)
      .select(ADDRESS_SELECT_COLUMNS_LEGACY)
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return mapRowToAddress(data);
  }

  if (input.isDefault) {
    await clearDefaultAddresses(input.customerId);
  }

  if (getAddressCoordinatesSupported() !== false) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .insert(payload)
      .select(ADDRESS_SELECT_COLUMNS)
      .single();
    if (!error) {
      setAddressCoordinatesSupported(true);
      return mapRowToAddress(data);
    }

    if (!isMissingAddressCoordinateColumn(error.message)) {
      throw new Error(error.message);
    }

    setAddressCoordinatesSupported(false);
  }

  const legacyPayload = {
    customer_id: input.customerId,
    country_region: input.countryRegion,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    province: input.province,
    city: input.city,
    barangay: input.barangay,
    postal_code: input.postalCode,
    line1: input.line1,
    line2: input.line2 ?? null,
    is_default: input.isDefault,
  };

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert(legacyPayload)
    .select(ADDRESS_SELECT_COLUMNS_LEGACY)
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return mapRowToAddress(data);
}

export async function deleteCustomerAddress(addressId: string) {
  if (!supabase) {
    throw new Error('Address management requires Supabase.');
  }

  const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function setDefaultAddress(addressId: string, customerId: string) {
  if (!supabase) {
    return;
  }

  await clearDefaultAddresses(customerId, addressId);

  const { error } = await supabase
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('customer_id', customerId);
  if (error) {
    throw new Error(error.message);
  }
}
