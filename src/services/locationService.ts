export interface LocationOption {
  code: string;
  name: string;
}

export interface ProvinceOption extends LocationOption {
  scope: 'province' | 'region';
}

const LOCATION_API_BASE = (process.env.EXPO_PUBLIC_PH_LOCATIONS_API_BASE ?? 'https://psgc.gitlab.io/api').replace(/\/+$/, '');
const NCR_REGION_CODE = '130000000';

let provinceCache: ProvinceOption[] | null = null;
const cityCache = new Map<string, LocationOption[]>();
const barangayCache = new Map<string, LocationOption[]>();

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function sortByName<T extends LocationOption>(list: T[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchList(path: string): Promise<any[]> {
  const response = await fetch(`${LOCATION_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Location API failed (${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchProvinceOptions(): Promise<ProvinceOption[]> {
  if (provinceCache) {
    return provinceCache;
  }

  const [regions, provinces] = await Promise.all([fetchList('/regions/'), fetchList('/provinces/')]);
  const ncrRegion = regions.find((region: any) => region.code === NCR_REGION_CODE);

  const items: ProvinceOption[] = sortByName(
    provinces.map((province: any) => ({
      code: String(province.code),
      name: String(province.name),
      scope: 'province' as const,
    })),
  );

  if (ncrRegion) {
    items.unshift({
      code: String(ncrRegion.code),
      name: 'Metro Manila',
      scope: 'region',
    });
  }

  provinceCache = items;
  return items;
}

export async function fetchCityOptions(province: ProvinceOption): Promise<LocationOption[]> {
  const cacheKey = `${province.scope}:${province.code}`;
  const cached = cityCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const path =
    province.scope === 'region'
      ? `/regions/${province.code}/cities-municipalities/`
      : `/provinces/${province.code}/cities-municipalities/`;

  const rows = await fetchList(path);
  const items = sortByName(
    rows.map((row: any) => ({
      code: String(row.code),
      name: String(row.name),
    })),
  );

  cityCache.set(cacheKey, items);
  return items;
}

export async function fetchBarangayOptions(cityCode: string): Promise<LocationOption[]> {
  const cacheKey = cityCode;
  const cached = barangayCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await fetchList(`/cities-municipalities/${cityCode}/barangays/`);
  const items = sortByName(
    rows.map((row: any) => ({
      code: String(row.code),
      name: String(row.name),
    })),
  );

  barangayCache.set(cacheKey, items);
  return items;
}

export function findProvinceByName(provinces: ProvinceOption[], name: string) {
  const target = normalizeName(name);
  return provinces.find((province) => normalizeName(province.name) === target);
}

export function findLocationByName(options: LocationOption[], name: string) {
  const target = normalizeName(name);
  return options.find((option) => normalizeName(option.name) === target);
}
