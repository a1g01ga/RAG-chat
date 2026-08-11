# Authenticated Guides Test Plan

## Application Overview

The Safety Guides app shows a curated library of stalking-safety guides. Content under `/guides` is only visible to signed-in users. From the home page, a visitor signs in via `/auth/login` with an email/password and is redirected to `/guides`, where they can search, filter by topic tag, and open individual guides.

## Test Scenarios

### 1. Authenticated guides flow

**Seed:** `tests/seed.spec.ts`

#### 1.1. sign-in-and-browse-guides

**File:** `tests/auth/sign-in-and-browse-guides.spec.ts`

**Steps:**
  1. On the home page, click the "Sign in" link.
    - expect: navigates to `/auth/login` and the Login form (Email textbox, Password textbox, Login button) is visible.
  2. Fill the Email textbox with `TEST_USER_EMAIL` and the Password textbox with `TEST_USER_PASSWORD` from the environment, then click "Login".
    - expect: navigates to `/guides`.
    - expect: the "Safety Guides" heading is visible.
  3. Click the "Android" tag button in the filter bar.
    - expect: the guide list only shows links whose href starts with `/guides/` and that are tagged "Android" (e.g. "Resetting an Android Smartphone to Factory Settings" is visible, "What Is a Panic Exit Button?" — an unrelated, non-Android guide — is not visible).
  4. Click the "Resetting an Android Smartphone to Factory Settings" guide link.
    - expect: navigates to `/guides/android-factory-reset`.
    - expect: a level-1 heading "Resetting an Android Smartphone to Factory Settings" is visible.