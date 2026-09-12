import { supabase } from '../lib/supabase';
import { ProductReview } from '../types/models';

export async function fetchProductReviews(productId: string): Promise<ProductReview[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .select(
      `
      id,
      order_id,
      order_item_id,
      product_id,
      customer_id,
      rating,
      comment,
      created_at,
      profiles ( full_name ),
      review_images ( image_url )
    `,
    )
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    productId: row.product_id,
    customerId: row.customer_id,
    authorName: (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ?? 'Customer',
    rating: Number(row.rating ?? 0),
    comment: row.comment ?? undefined,
    images: (row.review_images ?? []).map((image: any) => image.image_url),
    createdAt: row.created_at,
  }));
}

export async function submitProductReview(input: {
  orderId: string;
  orderItemId: string;
  productId: string;
  customerId: string;
  rating: number;
  comment?: string;
  imageUrls?: string[];
}) {
  if (!supabase) {
    throw new Error('Reviews require Supabase.');
  }

  if ((input.imageUrls?.length ?? 0) > 5) {
    throw new Error('Maximum of 5 review photos is allowed.');
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .insert({
      order_id: input.orderId,
      order_item_id: input.orderItemId,
      product_id: input.productId,
      customer_id: input.customerId,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(error.message);
  }

  if (input.imageUrls?.length) {
    const { error: imagesError } = await supabase.from('review_images').insert(
      input.imageUrls.map((imageUrl, index) => ({
        review_id: data.id,
        image_url: imageUrl,
        sort_order: index,
      })),
    );
    if (imagesError) {
      throw new Error(imagesError.message);
    }
  }

  return data.id;
}

export async function submitRiderReview(input: { orderId: string; customerId: string; rating: number; comment?: string }) {
  if (!supabase) {
    throw new Error('Reviews require Supabase.');
  }

  const { error } = await supabase.from('rider_reviews').upsert(
    {
      order_id: input.orderId,
      customer_id: input.customerId,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    { onConflict: 'order_id,customer_id' },
  );
  if (error) {
    throw new Error(error.message);
  }
}
