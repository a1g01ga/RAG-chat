// spec: docs/superpowers/specs/2026-08-12-chat-conversation-ownership-guard-design.md
//
// Uses Playwright's test runner without the `page` fixture — this repo has
// no unit test runner (see CLAUDE.md), and this assertion needs no browser.
//
// Why this can't be an ordinary (browser, RLS-respecting) e2e test: RLS
// already blocks a cross-user SELECT today, so the query inside
// getOwnedConversation would never even return a foreign row through a
// normal client — the `conversation.user_id !== userId` branch would never
// execute, and this test would pass identically whether that branch existed
// or not. The service-role client below bypasses RLS on purpose, to
// simulate the exact failure mode getOwnedConversation defends against: a
// client that CAN see another user's row.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getOwnedConversation, getConversationMessages } from '../../lib/chat/data.ts';

test.describe('getOwnedConversation', () => {
  test('accepts the owner and rejects a different user', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    const email1 = process.env.TEST_USER_EMAIL;
    const password1 = process.env.TEST_USER_PASSWORD;
    const email2 = process.env.TEST_USER2_EMAIL;
    const password2 = process.env.TEST_USER2_PASSWORD;
    if (!url || !anonKey || !serviceKey || !email1 || !password1 || !email2 || !password2) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, TEST_USER_EMAIL/PASSWORD and TEST_USER2_EMAIL/PASSWORD must all be set (see .env.local)',
      );
    }

    // Resolve both real user ids via a normal sign-in — this is the only
    // supported way to get a user's id without a user-creation script.
    const anon = createClient(url, anonKey);
    const signIn1 = await anon.auth.signInWithPassword({ email: email1, password: password1 });
    if (signIn1.error) throw signIn1.error;
    const userA = signIn1.data.user.id;

    const signIn2 = await anon.auth.signInWithPassword({ email: email2, password: password2 });
    if (signIn2.error) throw signIn2.error;
    const userB = signIn2.data.user.id;

    // Service-role client: bypasses RLS, simulating "RLS didn't filter this row".
    const admin = createClient(url, serviceKey);
    const inserted = await admin
      .from('chat_conversations')
      .insert({ user_id: userA, title: 'ownership guard test' })
      .select('id')
      .single();
    if (inserted.error) throw inserted.error;
    const conversationId = inserted.data.id as string;

    try {
      const ownedByA = await getOwnedConversation(admin, conversationId, userA);
      expect(ownedByA).not.toBeNull();
      expect(ownedByA?.id).toBe(conversationId);

      const ownedByB = await getOwnedConversation(admin, conversationId, userB);
      expect(ownedByB).toBeNull();
    } finally {
      await admin.from('chat_conversations').delete().eq('id', conversationId);
    }
  });

  test('getConversationMessages returns messages for the owner and null for a different user', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    const email1 = process.env.TEST_USER_EMAIL;
    const password1 = process.env.TEST_USER_PASSWORD;
    const email2 = process.env.TEST_USER2_EMAIL;
    const password2 = process.env.TEST_USER2_PASSWORD;
    if (!url || !anonKey || !serviceKey || !email1 || !password1 || !email2 || !password2) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, TEST_USER_EMAIL/PASSWORD and TEST_USER2_EMAIL/PASSWORD must all be set (see .env.local)',
      );
    }

    const anon = createClient(url, anonKey);
    const signIn1 = await anon.auth.signInWithPassword({ email: email1, password: password1 });
    if (signIn1.error) throw signIn1.error;
    const userA = signIn1.data.user.id;

    const signIn2 = await anon.auth.signInWithPassword({ email: email2, password: password2 });
    if (signIn2.error) throw signIn2.error;
    const userB = signIn2.data.user.id;

    const admin = createClient(url, serviceKey);
    const inserted = await admin
      .from('chat_conversations')
      .insert({ user_id: userA, title: 'ownership guard test 2' })
      .select('id')
      .single();
    if (inserted.error) throw inserted.error;
    const conversationId = inserted.data.id as string;

    try {
      const messagesForA = await getConversationMessages(admin, conversationId, userA);
      expect(messagesForA).not.toBeNull();
      expect(messagesForA).toEqual([]);

      const messagesForB = await getConversationMessages(admin, conversationId, userB);
      expect(messagesForB).toBeNull();
    } finally {
      await admin.from('chat_conversations').delete().eq('id', conversationId);
    }
  });
});