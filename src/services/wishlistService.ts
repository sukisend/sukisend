import { supabase } from '../lib/supabase';
import { WishlistItem } from '../types/models';
import { mapRowToProduct } from './mappers';

export async function fetchWishlist(customerId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select(
      `
      id,
      customer_id,
      product_id,
      products (
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
      )
    `,
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((item: any) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    return {
      id: item.id,
      customerId,
      productId: item.product_id,
      product: product ? mapRowToProduct(product) : undefined,
    };
  });
}

export async function toggleWishlist(customerId: string, productId: string): Promise<boolean> {
  const { data: existing, error: checkError } = await supabase
    .from('wishlist_items')
    .select('id')
    .eq('customer_id', customerId)
    .eq('product_id', productId)
    .maybeSingle();
  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing?.id) {
    const { error } = await supabase.from('wishlist_items').delete().eq('id', existing.id);
    if (error) {
      throw new Error(error.message);
    }
    return false;
  }

  const { error } = await supabase.from('wishlist_items').insert({
    customer_id: customerId,
    product_id: productId,
  });
  if (error) {
    throw new Error(error.message);
  }

  return true;
}
