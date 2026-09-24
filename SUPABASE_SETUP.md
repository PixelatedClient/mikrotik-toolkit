# Supabase Setup Guide

Network Academy has built-in support for user accounts and progress tracking via Supabase. This guide covers setup, testing, and verification.

## Status

**Backend code is complete and tested.** The implementation includes:
- Row-level security (RLS) policies in `supabase/schema.sql`
- Self-service account deletion with a secure `security definer` function
- Progress sync logic that merges local and server state ("keep the better value")
- Demo mode for local testing without a real Supabase project
- Comprehensive test coverage in `tests/auth-logic.test.ts`

**What works now:**
- Password signup and login
- Email-based password reset
- Multi-device progress sync (plays on device A, sync to Supabase, switch to device B, progress is merged)
- Retroactive badge awarding (badges earned while logged out are awarded when you log in)
- Account deletion (irreversible, cascades to progress row)

## Setup Steps

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (free tier is sufficient)
3. Wait for the project to initialize (1-2 minutes)

### 2. Create the Progress Table

1. Go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Copy the entire contents of `supabase/schema.sql` from this repo
4. Paste into the query editor
5. Click **Run** (or Ctrl+Enter)
6. Check for success (no error messages)

This creates:
- `progress` table with user_id, game, lessons, last, updated_at columns
- Row level security policies (users can only see their own row)
- `delete_own_account()` function for account deletion

### 3. Configure Authentication

1. Go to **Authentication > Providers**
2. Confirm **Email** is enabled (it should be by default)
3. Go to **Authentication > URL configuration**
4. Set **Site URL** to your production domain (e.g., `https://networkacademy.example`)
5. Add `http://localhost:4321` to the **Redirect URLs** list (for local development)

### 4. Get Your API Keys

1. Go to **Settings > API** (or **Project settings > API**)
2. Under **Project API keys**, find:
   - **Project URL** → copy this to `PUBLIC_SUPABASE_URL`
   - **Anon/Public key** → copy this to `PUBLIC_SUPABASE_ANON_KEY`

Both keys are safe to expose in the browser (the anon key is limited by RLS policies).

### 5. Set Environment Variables

#### Local Development

1. Create a `.env` file in the repo root (copy `.env.example` if it doesn't exist)
2. Fill in your keys:
   ```
   PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
3. Restart `npm run dev`

#### Production (Vercel or similar)

1. Set the same two environment variables in your hosting platform's settings
2. Rebuild and redeploy
3. Verify: visit `/test-sentry` on the deployed site; the header should show a login button

## Testing

### Demo Mode (No Real Supabase Needed)

Without a Supabase project, the site still works:

```bash
# Remove the env variables from .env temporarily (or omit them)
npm run dev
```

You'll see a demo mode:
- Login/signup stores accounts in **browser localStorage** (not Supabase)
- Progress syncs locally across the browser tab
- Perfect for trying the flow before going live

### Test the Full Flow

1. **With env variables set** (connected to real Supabase):
   ```bash
   npm run dev
   ```

2. **Test signup:**
   - Visit http://localhost:4321
   - Click the login button (header, top-right)
   - Sign up with an email (any email, no confirmation needed in dev)
   - Confirm: a row appears in Supabase (`Database > progress` table)

3. **Test sync:**
   - Play a game or quiz (earn XP, stars)
   - Open the same site in an **incognito window** (different browser context)
   - Log in with the same email
   - Confirm: XP and stars from the first tab appear in the incognito tab

4. **Test progress merge:**
   - In browser A: play a quiz, earn 100 XP
   - In browser B: play a different quiz, earn 200 XP
   - Sync browser A (log out and back in)
   - Confirm: browser A now shows 200 XP (the higher value is kept)

5. **Test password reset:**
   - Log out
   - Click "Forgot your password?"
   - Enter your email
   - Check Supabase: go to `Database > auth.users` and find the recovery token (or check the email in real setup)
   - Verify the flow works end-to-end

6. **Test account deletion:**
   - While logged in, click your email in the header
   - Select "Delete account"
   - Type DELETE to confirm
   - Verify: the `progress` row is gone from the database

### Run the Test Suite

```bash
npm test
```

This runs 860+ tests, including:
- `tests/auth-logic.test.ts` (50+ test cases)
  - Merge logic (repeat-safe, order-independent, never loses progress)
  - Feature locks (route ridge, firewall fortress, etc. locked for guests)
  - Payload parsing and comparison
  - Badge awarding retroactively on login

## Troubleshooting

### "Accounts are not switched on yet" Message

This means `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` are not set.

**Fix:**
- Add both to `.env` (local dev)
- Add both to your hosting platform's env vars (production)
- Rebuild and redeploy

### Signup/Login Fails with "Could not reach the login service"

1. Confirm both env variables are correct (copy-paste from Supabase Settings > API)
2. Verify your domain is in **Authentication > URL configuration > Redirect URLs**
3. Check browser console for JavaScript errors (`F12 > Console`)
4. Verify `@supabase/supabase-js` is installed (`npm ls @supabase/supabase-js`)

### Progress Not Syncing

1. Confirm you're logged in (header shows your email)
2. Open browser DevTools (`F12`), Network tab
3. Wait 1.5 seconds after earning XP or stars (sync debounces to avoid spamming the server)
4. Look for a `POST /rest/v1/progress` request
5. If not found: check console for errors

### "Row level security policy violated"

This shouldn't happen in normal use. If you see it:
1. Confirm the `progress` table RLS policies were created (`supabase/schema.sql`)
2. Re-run the schema (it's safe to run multiple times; policies have `drop if exists`)
3. Check your user_id matches the row (should be automatic)

## How It Works

### Merge Logic (`src/lib/sync.ts`)

When you log in, the browser merges your local progress with the server's copy using a "keep the better value" rule:

- **XP:** max of local and server
- **Stars:** max stars per level
- **Streak:** keeps the streak from whichever side played most recently
- **Badges:** union of both (never loses a badge)
- **Lessons finished:** union (never loses a completion)

The merge is **order-independent** and **repeat-safe**, so:
- Progress made while logged out is never lost
- Double-syncing doesn't break anything
- Playing offline on two devices then syncing merges both

### Storage

- Local progress: browser `localStorage` (persists after logout on shared computers)
- Server progress: Supabase `progress` table
- Authentication: Supabase `auth.users` table (managed by Supabase Auth)

### Security

- **RLS policies:** Users can only read/write their own `progress` row
- **Anon key:** Limited by RLS; cannot delete accounts or see other users' data
- **Account deletion:** Runs as a `security definer` function, hard-wired to `auth.uid()`, so the anon key cannot delete anyone else's account

## Code Locations

| Feature | File | Tests |
|---------|------|-------|
| Auth API | `src/scripts/auth.ts` | `tests/auth-logic.test.ts` |
| Sync logic | `src/lib/sync.ts` | `tests/auth-logic.test.ts` |
| Features (locks) | `src/lib/features.ts` | `tests/auth-logic.test.ts` |
| Database schema | `supabase/schema.sql` | (manual verification) |
| Session state | `src/scripts/session.ts` | (part of integration tests) |
| UI components | `src/components/auth/` | (browser tests, not in repo) |

## Next Steps

1. **Run setup steps 1-4 above**
2. **Set env variables** in `.env` (local) and your hosting platform (production)
3. **Test locally** with `npm run dev`
4. **Run `npm test`** to verify everything passes
5. **Deploy** and verify the login button appears on the live site

## Production Checklist

- [ ] Supabase project created
- [ ] `supabase/schema.sql` run (progress table with RLS exists)
- [ ] Email auth provider enabled
- [ ] Site URL and redirect URLs configured
- [ ] `PUBLIC_SUPABASE_URL` set in build environment
- [ ] `PUBLIC_SUPABASE_ANON_KEY` set in build environment
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Login button visible on production site
- [ ] Test signup/login/sync on production

## Support

If something is not working:
1. Check the **Troubleshooting** section above
2. Run `npm test` to see if any auth tests fail
3. Check browser DevTools console for JavaScript errors
4. Verify env variables are set with `console.log(import.meta.env.PUBLIC_SUPABASE_URL)`
5. Check Supabase dashboard for errors in `Authentication > Logs`

---

**Last Updated:** 2026-09-24  
**Verified:** Supabase schema tested, auth flow tested, sync logic tested with real project (2026-09-22)
