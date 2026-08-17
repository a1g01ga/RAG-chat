// spec: docs/superpowers/specs/2026-08-12-chat-conversation-ownership-guard-design.md
//
// Confirms end-to-end wiring: a second signed-in user cannot read or post
// into the first user's conversation. Complements
// tests/chat/ownership-guard.spec.ts, which tests getOwnedConversation's
// comparison logic directly (bypassing RLS to do so) — this test instead
// goes through the real app under normal (RLS-active) conditions, so it
// verifies the route/pages actually call the guard, not just that the
// guard itself is correct.
import { test, expect } from '@playwright/test';

test.describe('Cross-user conversation access', () => {
  test('a second user cannot view or post into the first user\'s conversation', async ({ page }) => {
    const email1 = process.env.TEST_USER_EMAIL;
    const password1 = process.env.TEST_USER_PASSWORD;
    const email2 = process.env.TEST_USER2_EMAIL;
    const password2 = process.env.TEST_USER2_PASSWORD;
    if (!email1 || !password1 || !email2 || !password2) {
      throw new Error(
        'TEST_USER_EMAIL/PASSWORD and TEST_USER2_EMAIL/PASSWORD must be set (see .env.local)',
      );
    }

    // 1. Sign in as the first user and create a conversation.
    await page.goto('/auth/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(email1);
    await page.getByRole('textbox', { name: 'Password' }).fill(password1);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/guides$/);

    await page.goto('/chat');
    const startButton = page.getByRole('button', { name: /new conversation|new chat/i }).first();
    await startButton.click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    const conversationUrl = page.url();
    const conversationId = conversationUrl.split('/').pop() as string;

    // 2. Sign out, sign in as the second user.
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);

    await page.getByRole('textbox', { name: 'Email' }).fill(email2);
    await page.getByRole('textbox', { name: 'Password' }).fill(password2);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/guides$/);

    // 3. Attempt to view the first user's conversation directly.
    await page.goto(conversationUrl);
    await expect(page).toHaveURL(/\/chat$/);

    // 4. Attempt to post into it via the API, using page.request so the
    // second user's session cookies (shared with `page`'s browser context)
    // are sent automatically.
    const response = await page.request.post('/api/chat', {
      data: { conversationId, message: 'hello' },
    });
    expect(response.status()).toBe(404);
  });
});
