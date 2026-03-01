import { useEffect, useMemo, useState } from 'react';

import { PH_LOCATION_MAP } from '../data/locationData';
import {
  fetchBarangayOptions,
  fetchCityOptions,
  fetchProvinceOptions,
  findLocationByName,
  findProvinceByName,
  LocationOption,
  ProvinceOption,
} from '../services/locationService';

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function fallbackProvinceNames() {
  return uniqueSorted(PH_LOCATION_MAP.map((province) => province.province));
}

function fallbackCityNames(provinceName: string) {
  const province = PH_LOCATION_MAP.find((item) => normalize(item.province) === normalize(provinceName));
  return uniqueSorted((province?.cities ?? []).map((city) => city.city));
}

function fallbackBarangayNames(provinceName: string, cityName: string) {
  const province = PH_LOCATION_MAP.find((item) => normalize(item.province) === normalize(provinceName));
  const city = province?.cities.find((item) => normalize(item.city) === normalize(cityName));
  return uniqueSorted(city?.barangays ?? []);
}

export function useAddressLocations(provinceName: string, cityName: string) {
  const [provinceOptions, setProvinceOptions] = useState<ProvinceOption[]>([]);
  const [cityOptions, setCityOptions] = useState<LocationOption[]>([]);
  const [barangayOptions, setBarangayOptions] = useState<LocationOption[]>([]);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingLocations(true);
      try {
        const provinces = await fetchProvinceOptions();
        if (!mounted) {
          return;
        }
        setProvinceOptions(provinces);
        setIsUsingFallback(false);
      } catch {
        if (!mounted) {
          return;
        }
        setProvinceOptions(
          fallbackProvinceNames().map((name) => ({
            code: name,
            name,
            scope: 'province',
          })),
        );
        setIsUsingFallback(true);
      } finally {
        if (mounted) {
          setLoadingLocations(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedProvince = useMemo(() => findProvinceByName(provinceOptions, provinceName), [provinceOptions, provinceName]);
  const selectedCity = useMemo(() => findLocationByName(cityOptions, cityName), [cityOptions, cityName]);

  useEffect(() => {
    let mounted = true;

    if (!provinceName.trim()) {
      setCityOptions([]);
      setBarangayOptions([]);
      return;
    }

    if (isUsingFallback || !selectedProvince) {
      const fallbackCities = fallbackCityNames(provinceName).map((name) => ({ code: name, name }));
      setCityOptions(fallbackCities);
      setBarangayOptions([]);
      return;
    }

    (async () => {
      setLoadingLocations(true);
      try {
        const cities = await fetchCityOptions(selectedProvince);
        if (!mounted) {
          return;
        }
        setCityOptions(cities);
      } catch {
        if (!mounted) {
          return;
        }
        const fallbackCities = fallbackCityNames(provinceName).map((name) => ({ code: name, name }));
        setCityOptions(fallbackCities);
      } finally {
        if (mounted) {
          setLoadingLocations(false);
          setBarangayOptions([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isUsingFallback, provinceName, selectedProvince]);

  useEffect(() => {
    let mounted = true;

    if (!provinceName.trim() || !cityName.trim()) {
      setBarangayOptions([]);
      return;
    }

    if (isUsingFallback || !selectedCity) {
      const fallbackBarangays = fallbackBarangayNames(provinceName, cityName).map((name) => ({ code: name, name }));
      setBarangayOptions(fallbackBarangays);
      return;
    }

    (async () => {
      setLoadingLocations(true);
      try {
        const barangays = await fetchBarangayOptions(selectedCity.code);
        if (!mounted) {
          return;
        }
        setBarangayOptions(barangays);
      } catch {
        if (!mounted) {
          return;
        }
        const fallbackBarangays = fallbackBarangayNames(provinceName, cityName).map((name) => ({ code: name, name }));
        setBarangayOptions(fallbackBarangays);
      } finally {
        if (mounted) {
          setLoadingLocations(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [cityName, isUsingFallback, provinceName, selectedCity]);

  return {
    provinceOptions: provinceOptions.map((item) => item.name),
    cityOptions: cityOptions.map((item) => item.name),
    barangayOptions: barangayOptions.map((item) => item.name),
    loadingLocations,
    isUsingFallback,
  };
}
