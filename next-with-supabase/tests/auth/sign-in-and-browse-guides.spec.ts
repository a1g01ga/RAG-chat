// spec: specs/authenticated-guides.plan.md
// seed: tests/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authenticated guides flow', () => {
  test('sign in and browse guides', async ({ page }) => {
    // (seed navigates to the home page)
    await page.goto('/');

    // 1. On the home page, click the "Sign in" link.
    await page.getByRole('link', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    // 2. Fill in credentials from the environment and log in.
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set (see .env.local)');
    }
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/guides$/);
    await expect(page.getByRole('heading', { name: 'Safety Guides', level: 1 })).toBeVisible();

    // 3. Click the "Android" tag button in the filter bar.
    await page.getByRole('button', { name: 'Android' }).click();

    await expect(
      page.getByRole('link', { name: 'Resetting an Android Smartphone to Factory Settings' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'What Is a Panic Exit Button?' })
    ).not.toBeVisible();

    // 4. Click the "Resetting an Android Smartphone to Factory Settings" guide link.
    await page
      .getByRole('link', { name: 'Resetting an Android Smartphone to Factory Settings' })
      .click();

    await expect(page).toHaveURL(/\/guides\/android-factory-reset$/);
    await expect(
      page.getByRole('heading', { name: 'Resetting an Android Smartphone to Factory Settings', level: 1 })
    ).toBeVisible();
  });
});