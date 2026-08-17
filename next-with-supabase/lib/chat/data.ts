import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatConversationSummary, ChatMessageItem } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface OwnedConversation {
  id: string;
  title: string;
}

export async function getOwnedConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<OwnedConversation | null> {
  if (!isValidUuid(conversationId)) {
    return null;
  }

  const { data: conversation, error } = await supabase
    .from("chat_conversations")
    .select("id, title, user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!conversation) {
    return null;
  }
  if (conversation.user_id !== userId) {
    // Should be unreachable under working RLS — the SELECT above should
    // never even return a row belonging to another user. Reaching this
    // branch means RLS itself failed to filter the row (policy
    // regression, or a client that bypasses RLS), which is exactly the
    // failure mode this function exists to catch. Treated the same as
    // "not found" below so the response gives no signal either way.
    console.error(
      `Ownership mismatch: conversation ${conversationId} belongs to ${conversation.user_id}, requested by ${userId}. This should be impossible under RLS — investigate immediately.`,
    );
    return null;
  }

  return { id: conversation.id, title: conversation.title };
}

export async function getConversationList(
  supabase: SupabaseClient,
): Promise<ChatConversationSummary[]> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

export async function getConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<ChatMessageItem[] | null> {
  const conversation = await getOwnedConversation(supabase, conversationId, userId);
  if (!conversation) {
    return null;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: row.created_at,
  }));
}
