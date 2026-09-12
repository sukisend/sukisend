let categoryIconColumnSupported: boolean | null = null;
let addressCoordinatesSupported: boolean | null = null;

export function isMissingCategoryIconColumn(message?: string) {
  return (message ?? '').toLowerCase().includes('column') && (message ?? '').toLowerCase().includes('icon');
}

export function isMissingAddressCoordinateColumn(message?: string) {
  const text = (message ?? '').toLowerCase();
  return text.includes('column') && (text.includes('latitude') || text.includes('longitude'));
}

export function getCategoryIconColumnSupported() {
  return categoryIconColumnSupported;
}

export function setCategoryIconColumnSupported(value: boolean) {
  categoryIconColumnSupported = value;
}

export function getAddressCoordinatesSupported() {
  return addressCoordinatesSupported;
}

export function setAddressCoordinatesSupported(value: boolean) {
  addressCoordinatesSupported = value;
}

export const ADDRESS_SELECT_COLUMNS =
  'id, customer_id, country_region, first_name, last_name, phone, province, city, barangay, postal_code, line1, line2, latitude, longitude, is_default';

export const ADDRESS_SELECT_COLUMNS_LEGACY =
  'id, customer_id, country_region, first_name, last_name, phone, province, city, barangay, postal_code, line1, line2, is_default';
