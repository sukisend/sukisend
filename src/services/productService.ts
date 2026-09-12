import { mockCategories, mockProducts } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { Category, Product, ProductSortOption, ShippingMethod } from '../types/models';
import { getProductBasePrice } from '../utils/pricing';
import {
  getCategoryIconColumnSupported,
  isMissingCategoryIconColumn,
  setCategoryIconColumnSupported,
} from './columnDetection';
import { mapRowToProduct, mapRowToShippingMethod } from './mappers';

interface ProductQuery {
  search?: string;
  categoryId?: string;
  sort?: ProductSortOption;
  page?: number;
  pageSize?: number;
}

function applySort(products: Product[], sort: ProductSortOption = 'best_selling') {
  const copy = [...products];

  switch (sort) {
    case 'all':
      return copy;
    case 'name_asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'on_sale':
      return copy.sort((a, b) => {
        const aOnSale = Number(Boolean(a.onSale));
        const bOnSale = Number(Boolean(b.onSale));
        if (aOnSale !== bOnSale) {
          return bOnSale - aOnSale;
        }
        return getProductBasePrice(a) - getProductBasePrice(b);
      });
    case 'newest':
      return copy;
    case 'oldest':
      return copy.reverse();
    case 'price_asc':
      return copy.sort((a, b) => getProductBasePrice(a) - getProductBasePrice(b));
    case 'price_desc':
      return copy.sort((a, b) => getProductBasePrice(b) - getProductBasePrice(a));
    case 'best_selling':
    default:
      return copy.sort((a, b) => (b.sortPriority ?? 0) - (a.sortPriority ?? 0));
  }
}

function applyDbSort<T>(query: T, sort: ProductSortOption | undefined) {
  const target = query as any;
  switch (sort) {
    case 'all':
      return target.order('created_at', { ascending: false });
    case 'name_asc':
      return target.order('name', { ascending: true });
    case 'on_sale':
      return target.order('on_sale', { ascending: false }).order('sort_priority', { ascending: false }).order('created_at', { ascending: false });
    case 'newest':
      return target.order('created_at', { ascending: false });
    case 'oldest':
      return target.order('created_at', { ascending: true });
    case 'price_asc':
      return target.order('price', { ascending: true });
    case 'price_desc':
      return target.order('price', { ascending: false });
    case 'best_selling':
    default:
      return target.order('sort_priority', { ascending: false }).order('created_at', { ascending: false });
  }
}

export async function fetchPublicCategories(): Promise<Category[]> {
  if (!supabase) {
    return mockCategories;
  }

  if (getCategoryIconColumnSupported() !== false) {
    const { data, error } = await supabase.from('categories').select('id, name, icon, image_url').order('name', { ascending: true });
    if (!error) {
      setCategoryIconColumnSupported(true);
      return [{ id: 'all', name: 'All' }, ...(data ?? []).map((row: any) => ({ ...row, imageUrl: row.image_url }))];
    }

    if (!isMissingCategoryIconColumn(error.message)) {
      throw new Error(error.message);
    }

    setCategoryIconColumnSupported(false);
  }

  const { data, error } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return [{ id: 'all', name: 'All' }, ...(data ?? [])];
}

export async function fetchPublicProducts(query?: ProductQuery): Promise<Product[]> {
  const page = Math.max(1, Number(query?.page ?? 1));
  const rawPageSize = Number(query?.pageSize ?? 0);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 0;

  if (!supabase) {
    const filtered = mockProducts.filter((product) => {
      const bySearch = query?.search
        ? product.name.toLowerCase().includes(query.search.toLowerCase()) ||
          (product.description ?? '').toLowerCase().includes(query.search.toLowerCase())
        : true;
      const byCategory = query?.categoryId && query.categoryId !== 'all' ? product.categoryId === query.categoryId : true;
      return bySearch && byCategory && product.isActive;
    });

    const sorted = applySort(filtered, query?.sort);
    if (!pageSize) {
      return sorted;
    }

    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }

  let dbQuery = supabase
    .from('products')
    .select(
      `
      id,
      name,
      description,
      sku,
      category_id,
      unit,
      cost,
      price,
      stock,
      min_stock,
      image_url,
      on_sale,
      sale_price,
      sort_priority,
      is_active,
      categories ( id, name ),
      product_images ( id, product_id, image_url, sort_order ),
      product_variants ( id, product_id, name, value, price_delta, stock_override, image_url, is_active )
    `,
    )
    .eq('is_active', true);

  if (query?.categoryId && query.categoryId !== 'all') {
    dbQuery = dbQuery.eq('category_id', query.categoryId);
  }

  if (query?.search) {
    dbQuery = dbQuery.or(`name.ilike.%${query.search}%,description.ilike.%${query.search}%`);
  }

  dbQuery = applyDbSort(dbQuery, query?.sort);

  if (pageSize > 0) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    dbQuery = dbQuery.range(start, end);
  }

  const { data, error } = await dbQuery;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToProduct);
}

export async function fetchProductById(productId: string): Promise<Product | null> {
  if (!supabase) {
    return mockProducts.find((item) => item.id === productId) ?? null;
  }

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      description,
      sku,
      category_id,
      unit,
      cost,
      price,
      stock,
      min_stock,
      image_url,
      on_sale,
      sale_price,
      sort_priority,
      is_active,
      categories ( id, name ),
      product_images ( id, product_id, image_url, sort_order ),
      product_variants ( id, product_id, name, value, price_delta, stock_override, image_url, is_active )
    `,
    )
    .eq('id', productId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToProduct(data);
}

export async function fetchShippingMethods(): Promise<ShippingMethod[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, name, description, base_fee, eta_min_days, eta_max_days, is_active')
    .eq('is_active', true)
    .order('base_fee', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToShippingMethod);
}
