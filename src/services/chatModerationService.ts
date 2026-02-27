import { supabase } from '../lib/supabase';
import {
  CustomerModerationUser,
  CustomerRestriction,
  RestrictionSeverity,
  SellerChatAttachment,
  SellerChatMessage,
  SellerChatThread,
} from '../types/models';

const ATTACHMENT_PREFIX = '__SUKI_ATTACHMENT__:';
const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_MESSAGE_PAGE_SIZE = 30;

interface ParsedSellerChatPayload {
  text: string;
  attachment?: SellerChatAttachment;
}

interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PaginatedRows<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

function normalizePagination(input?: PaginationInput, fallbackPageSize = DEFAULT_PAGE_SIZE) {
  const page = Math.max(1, Number(input?.page ?? 1));
  const pageSize = Math.max(1, Number(input?.pageSize ?? fallbackPageSize));
  return { page, pageSize };
}

function parseSellerChatPayload(message: string): ParsedSellerChatPayload {
  if (!message.startsWith(ATTACHMENT_PREFIX)) {
    return { text: message };
  }

  try {
    const raw = message.slice(ATTACHMENT_PREFIX.length);
    const parsed = JSON.parse(raw) as {
      url?: string;
      type?: string;
      mimeType?: string;
      sizeBytes?: number;
      caption?: string;
    };

    if (!parsed.url || (parsed.type !== 'image' && parsed.type !== 'video')) {
      return { text: message };
    }

    return {
      text: String(parsed.caption ?? ''),
      attachment: {
        url: parsed.url,
        type: parsed.type,
        mimeType: parsed.mimeType,
        sizeBytes: Number.isFinite(parsed.sizeBytes) ? Number(parsed.sizeBytes) : undefined,
      },
    };
  } catch {
    return { text: message };
  }
}

function encodeSellerChatAttachmentPayload(attachment: SellerChatAttachment, caption?: string) {
  return `${ATTACHMENT_PREFIX}${JSON.stringify({
    url: attachment.url,
    type: attachment.type,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    caption: caption?.trim() ?? '',
  })}`;
}

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
  const parsed = typeof row.last_message === 'string' ? parseSellerChatPayload(row.last_message) : { text: '' };
  const parsedLastMessage = parsed.attachment
    ? `${parsed.attachment.type === 'video' ? 'Video' : 'Photo'}${parsed.text ? `: ${parsed.text}` : ''}`
    : parsed.text || undefined;

  return {
    id: row.thread_id ?? row.id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? 'Customer',
    customerEmail: row.customer_email ?? undefined,
    lastMessageAt: row.last_message_at ?? row.updated_at ?? new Date().toISOString(),
    lastMessage: parsedLastMessage,
    unreadCount: Number(row.unread_count ?? 0),
    isClosed: Boolean(row.is_closed ?? false),
  };
}

function mapMessageRow(row: any): SellerChatMessage {
  const senderProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const parsed = parseSellerChatPayload(row.message ?? '');
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    senderName: senderProfile?.full_name ?? undefined,
    message: parsed.text,
    attachment: parsed.attachment,
    isRead: Boolean(row.is_read ?? false),
    createdAt: row.created_at,
  };
}

function mapCustomerRow(row: any): CustomerModerationUser {
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

export async function fetchSellerChatMessagesPage(
  threadId: string,
  input?: PaginationInput,
): Promise<PaginatedRows<SellerChatMessage>> {
  if (!supabase || !threadId) {
    return {
      rows: [],
      page: 1,
      pageSize: DEFAULT_MESSAGE_PAGE_SIZE,
      total: 0,
      hasNextPage: false,
    };
  }

  const { page, pageSize } = normalizePagination(input, DEFAULT_MESSAGE_PAGE_SIZE);
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  const { data, error, count } = await supabase
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
      { count: 'exact' },
    )
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map(mapMessageRow).reverse();
  const total = Number(count ?? 0);

  return {
    rows,
    page,
    pageSize,
    total,
    hasNextPage: page * pageSize < total,
  };
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

export async function sendSellerChatAttachmentMessage(
  threadId: string,
  attachment: SellerChatAttachment,
  caption?: string,
): Promise<string> {
  return sendSellerChatMessage(threadId, encodeSellerChatAttachmentPayload(attachment, caption));
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

export async function fetchAdminSellerThreadsPage(
  input?: PaginationInput & {
    search?: string;
  },
): Promise<PaginatedRows<SellerChatThread>> {
  const { page, pageSize } = normalizePagination(input, DEFAULT_PAGE_SIZE);
  const search = input?.search?.trim() ?? '';

  if (!supabase) {
    return {
      rows: [],
      page,
      pageSize,
      total: 0,
      hasNextPage: false,
    };
  }

  const { data, error } = await supabase.rpc('admin_list_seller_threads_paginated', {
    p_page: page,
    p_page_size: pageSize,
    p_search: search || null,
  });

  if (!error) {
    const rows = (data ?? []).map(mapThreadRow);
    const total = Number((data ?? [])[0]?.total_count ?? 0);
    return {
      rows,
      page,
      pageSize,
      total,
      hasNextPage: page * pageSize < total,
    };
  }

  // Fallback for older databases where the paginated RPC isn't deployed yet.
  if (!error.message.toLowerCase().includes('admin_list_seller_threads_paginated')) {
    throw new Error(error.message);
  }

  const legacyRows = await fetchAdminSellerThreads();
  const filteredRows = search
    ? legacyRows.filter((thread) => {
        const haystack = `${thread.customerName} ${thread.customerEmail ?? ''}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : legacyRows;

  const start = (page - 1) * pageSize;
  const nextRows = filteredRows.slice(start, start + pageSize);

  return {
    rows: nextRows,
    page,
    pageSize,
    total: filteredRows.length,
    hasNextPage: page * pageSize < filteredRows.length,
  };
}

export async function fetchAdminUnreadSellerMessagesCount(): Promise<number> {
  if (!supabase) {
    return 0;
  }

  const { count, error } = await supabase
    .from('seller_chat_messages')
    .select('id', { head: true, count: 'exact' })
    .eq('sender_role', 'customer')
    .eq('is_read', false);

  if (error) {
    throw new Error(error.message);
  }

  return Number(count ?? 0);
}

export async function fetchCustomerUnreadSellerMessagesCount(customerId: string): Promise<number> {
  if (!supabase || !customerId) {
    return 0;
  }

  const { data: thread, error: threadError } = await supabase
    .from('seller_chat_threads')
    .select('id')
    .eq('customer_id', customerId)
    .maybeSingle();

  if (threadError) {
    throw new Error(threadError.message);
  }

  if (!thread?.id) {
    return 0;
  }

  const { count, error } = await supabase
    .from('seller_chat_messages')
    .select('id', { head: true, count: 'exact' })
    .eq('thread_id', thread.id)
    .eq('sender_role', 'admin')
    .eq('is_read', false);

  if (error) {
    throw new Error(error.message);
  }

  return Number(count ?? 0);
}

export async function fetchAdminCustomers(): Promise<CustomerModerationUser[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('admin_list_customers');
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapCustomerRow);
}

export async function fetchAdminCustomersPage(
  input?: PaginationInput & {
    search?: string;
  },
): Promise<PaginatedRows<CustomerModerationUser>> {
  const { page, pageSize } = normalizePagination(input, DEFAULT_PAGE_SIZE);
  const search = input?.search?.trim() ?? '';

  if (!supabase) {
    return {
      rows: [],
      page,
      pageSize,
      total: 0,
      hasNextPage: false,
    };
  }

  const { data, error } = await supabase.rpc('admin_list_customers_paginated', {
    p_page: page,
    p_page_size: pageSize,
    p_search: search || null,
  });

  if (!error) {
    const rows = (data ?? []).map(mapCustomerRow);
    const total = Number((data ?? [])[0]?.total_count ?? 0);
    return {
      rows,
      page,
      pageSize,
      total,
      hasNextPage: page * pageSize < total,
    };
  }

  if (!error.message.toLowerCase().includes('admin_list_customers_paginated')) {
    throw new Error(error.message);
  }

  const legacyRows = await fetchAdminCustomers();
  const filteredRows = search
    ? legacyRows.filter((customer) => {
        const haystack = `${customer.fullName} ${customer.email} ${customer.id}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : legacyRows;

  const start = (page - 1) * pageSize;
  const nextRows = filteredRows.slice(start, start + pageSize);

  return {
    rows: nextRows,
    page,
    pageSize,
    total: filteredRows.length,
    hasNextPage: page * pageSize < filteredRows.length,
  };
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
