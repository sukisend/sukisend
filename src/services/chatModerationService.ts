import { supabase } from '../lib/supabase';
import {
  CustomerModerationUser,
  CustomerRestriction,
  RestrictionSeverity,
  SellerChatMessage,
  SellerChatThread,
} from '../types/models';

function mapRestrictionRow(row: any): CustomerRestriction {
  return {
    id: row.restriction_id ?? row.id,
    customerId: row.customer_id ?? '',
    reason: row.reason,
    severity: (row.severity ?? 'restricted') as RestrictionSeverity,
    startsAt: row.starts_at ?? new Date().toISOString(),
    endsAt: row.ends_at ?? undefined,
  };
}

function mapThreadRow(row: any): SellerChatThread {
  return {
    id: row.thread_id ?? row.id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? 'Customer',
    customerEmail: row.customer_email ?? undefined,
    lastMessageAt: row.last_message_at ?? row.updated_at ?? new Date().toISOString(),
    lastMessage: row.last_message ?? undefined,
    unreadCount: Number(row.unread_count ?? 0),
    isClosed: Boolean(row.is_closed ?? false),
  };
}

function mapMessageRow(row: any): SellerChatMessage {
  const senderProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    senderName: senderProfile?.full_name ?? undefined,
    message: row.message,
    isRead: Boolean(row.is_read ?? false),
    createdAt: row.created_at,
  };
}

export async function fetchActiveCustomerRestriction(customerId: string): Promise<CustomerRestriction | null> {
  if (!supabase || !customerId) {
    return null;
  }

  const { data, error } = await supabase.rpc('customer_active_restriction', {
    p_customer_id: customerId,
  });
  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapRestrictionRow({
    ...row,
    customer_id: customerId,
  });
}

export async function getOrCreateSellerThread(customerId: string) {
  if (!supabase) {
    throw new Error('Chat requires Supabase.');
  }

  const { data, error } = await supabase.rpc('get_or_create_seller_thread', {
    p_customer_id: customerId,
  });
  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function fetchSellerChatMessages(threadId: string): Promise<SellerChatMessage[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('seller_chat_messages')
    .select(
      `
      id,
      thread_id,
      sender_id,
      sender_role,
      message,
      is_read,
      created_at,
      profiles ( full_name )
    `,
    )
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapMessageRow);
}

export async function sendSellerChatMessage(threadId: string, message: string): Promise<string> {
  if (!supabase) {
    throw new Error('Chat requires Supabase.');
  }

  const { data, error } = await supabase.rpc('send_seller_message', {
    p_thread_id: threadId,
    p_message: message,
  });
  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function markSellerChatThreadRead(threadId: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('mark_seller_thread_read', {
    p_thread_id: threadId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchAdminSellerThreads(): Promise<SellerChatThread[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('admin_list_seller_threads');
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapThreadRow);
}

export async function fetchAdminCustomers(): Promise<CustomerModerationUser[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('admin_list_customers');
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => {
    const activeRestrictionId = row.active_restriction_id as string | null;
    const activeRestriction =
      activeRestrictionId && row.active_restriction_reason
        ? {
            id: activeRestrictionId,
            customerId: row.customer_id,
            reason: row.active_restriction_reason,
            severity: (row.active_restriction_severity ?? 'restricted') as RestrictionSeverity,
            startsAt: row.active_restriction_starts_at ?? row.created_at,
            endsAt: row.active_restriction_ends_at ?? undefined,
          }
        : undefined;

    return {
      id: row.customer_id,
      fullName: row.full_name ?? 'Customer',
      email: row.email ?? '',
      createdAt: row.created_at,
      totalOrders: Number(row.total_orders ?? 0),
      pendingOrders: Number(row.pending_orders ?? 0),
      activeRestriction,
    } satisfies CustomerModerationUser;
  });
}

export async function adminSetCustomerRestriction(input: {
  customerId: string;
  reason: string;
  severity?: RestrictionSeverity;
  durationHours?: number;
  until?: string;
}) {
  if (!supabase) {
    throw new Error('Moderation requires Supabase.');
  }

  const { data, error } = await supabase.rpc('admin_set_customer_restriction', {
    p_customer_id: input.customerId,
    p_reason: input.reason,
    p_duration_hours: Number.isFinite(input.durationHours) ? Number(input.durationHours) : null,
    p_until: input.until ?? null,
    p_severity: input.severity ?? 'restricted',
  });
  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function adminLiftCustomerRestriction(restrictionId: string, reason?: string) {
  if (!supabase) {
    throw new Error('Moderation requires Supabase.');
  }

  const { error } = await supabase.rpc('admin_lift_customer_restriction', {
    p_restriction_id: restrictionId,
    p_reason: reason ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function adminDeleteCustomerAccount(customerId: string, reason?: string) {
  if (!supabase) {
    throw new Error('Moderation requires Supabase.');
  }

  const { error } = await supabase.rpc('admin_delete_customer_account', {
    p_customer_id: customerId,
    p_reason: reason ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}
