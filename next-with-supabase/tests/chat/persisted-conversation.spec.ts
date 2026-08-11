// spec: docs/superpowers/specs/2026-07-27-persisted-rag-chat-design.md
// Requires: npm run mock:openrouter running, and the dev server started
// with OPENROUTER_MOCK_URL=http://localhost:4319 (see tests/helpers/mock-openrouter-server.mts).
import { test, expect } from '@playwright/test';

test.describe('Persisted RAG chat', () => {
  test('new conversation, send a message, reply persists after reload', async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set (see .env.local)');
    }

    // 1. Sign in.
    await page.goto('/auth/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/guides$/);

    // 2. Go to Chat, start a new conversation.
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/chat$/);

    const startButton = page.getByRole('button', { name: /new conversation|new chat/i }).first();
    await startButton.click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);

    // 3. Send a message.
    // Uses a role-based locator (accessibility tree, visibility-aware) rather than
    // getByPlaceholder (raw DOM match) because Next.js 16's Activity-based route
    // preservation can leave the previous route's DOM subtree mounted with
    // display:none after a client-side navigation, which would otherwise make
    // getByPlaceholder resolve ambiguously to an invisible leftover element.
    const messageText = `e2e test message ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Ask about a safety guide…' }).fill(messageText);
    await page.getByRole('button', { name: 'Send' }).click();

    // 4. Verify both the user's message and the mocked assistant reply render.
    // Both checks are scoped to `p:visible` (Playwright's own CSS extension) rather than a
    // bare getByText, for two separate reasons observed in this app:
    //   - Once the conversation gets titled from its first message, the sidebar link's title
    //     text (a plain, non-<p> <div>) becomes identical to the message text.
    //   - Next.js 16 route/activity state preservation can leave a second, hidden (display:none)
    //     copy of a message's <p> in the DOM.
    // A bare getByText(...) matches raw DOM text regardless of tag or visibility, so it trips
    // Playwright's strict mode on either duplicate; `p:visible` picks out the one live, on-screen
    // paragraph.
    const messageBubble = page.locator('p:visible').filter({ hasText: messageText });
    const assistantReply = page
      .locator('p:visible')
      .filter({ hasText: 'This is a mocked assistant reply for automated testing.' });
    await expect(messageBubble).toBeVisible();
    await expect(assistantReply).toBeVisible();

    // 4b. Verify the RAG citation renders. The mock OpenRouter server's
    // /embeddings response is pinned to a real, already-stored embedding for
    // the "android-factory-reset" guide (see tests/helpers/mock-openrouter-server.mts),
    // so match_documents deterministically returns that guide as a match and
    // the app should render a "Related guides" section linking to it
    // (see components/chat/chat-thread.tsx's relatedGuides rendering).
    const relatedGuidesHeading = page.locator(':visible').getByText('Related guides', { exact: true });
    await expect(relatedGuidesHeading).toBeVisible();
    const relatedGuideLink = page.locator('a[href="/guides/android-factory-reset"]:visible');
    await expect(relatedGuideLink).toBeVisible();

    const conversationUrl = page.url();

    // 5. Reload and verify history persisted.
    // Note: relatedGuides/citations are not persisted to chat_messages (see
    // lib/chat/types.ts's ChatMessageItem — relatedGuides is only attached to
    // the in-memory message right after the API response), so the citation
    // is intentionally not expected to still be visible after reload here.
    await page.reload();
    await expect(messageBubble).toBeVisible();
    await expect(assistantReply).toBeVisible();
    expect(page.url()).toBe(conversationUrl);

    // 6. Send a second message in the same conversation. This is now a
    // non-empty-history send, so app/api/chat/route.ts takes the
    // query-rewrite branch (see docs/superpowers/specs/2026-07-28-context-aware-retrieval-query-design.md)
    // instead of the skip-on-first-message branch exercised above. The mock
    // OpenRouter server returns fixed content regardless of the request
    // body (see tests/helpers/mock-openrouter-server.mts), so this doesn't
    // verify retrieval *quality* — that's covered by Task 1's manual
    // verification against the real API — but it does verify the new
    // rewrite code path runs without breaking the send flow.
    const secondMessageText = `e2e follow-up ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Ask about a safety guide…' }).fill(secondMessageText);
    await page.getByRole('button', { name: 'Send' }).click();

    const secondMessageBubble = page.locator('p:visible').filter({ hasText: secondMessageText });
    await expect(secondMessageBubble).toBeVisible();
    await expect(assistantReply).toHaveCount(2);

    // Only 1, not 2: relatedGuides is never persisted to chat_messages (see
    // lib/chat/types.ts / components/chat/chat-thread.tsx), and the page was
    // reloaded (step 5) before this second send, so message 1's "Related
    // guides" section from earlier in this test is gone from the DOM. Only
    // this freshly-received second message carries a relatedGuides section.
    const relatedGuidesHeadings = page.locator(':visible').getByText('Related guides', { exact: true });
    await expect(relatedGuidesHeadings).toHaveCount(1);
  });
});
