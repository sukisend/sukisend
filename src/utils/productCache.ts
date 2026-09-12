import { Product } from '../types/models';

interface CacheEntry {
  data: Product[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildKey(search: string, categoryId: string, sort: string, page: number, pageSize: number): string {
  return `${search}::${categoryId}::${sort}::${page}::${pageSize}`;
}

export function getCachedProducts(search: string, categoryId: string, sort: string, page: number, pageSize: number): Product[] | null {
  const key = buildKey(search, categoryId, sort, page, pageSize);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedProducts(search: string, categoryId: string, sort: string, page: number, pageSize: number, data: Product[]): void {
  const key = buildKey(search, categoryId, sort, page, pageSize);
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearProductCache(): void {
  cache.clear();
}
