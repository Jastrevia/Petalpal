# Handoff: account-name sign-up (no email needed)

Branch `feat/account-name-signup`, worktree `.claude/worktrees/account-signup`, built on
`feat/pavilion-garden-v2-integration` (the teammate's pavilion), local only, not pushed.
Started by Claude Code (2026-11-06), finished by Kiro the same night.

## What the owner asked for (2026-11-06)

- The sign-up pages look like the owner's two mock-ups: "Create your account" (account name,
  password, confirm password) and then "Welcome to your garden" (the account name, the Garden
  Fairy's name, an avatar, "Enter My Garden").
- No email to sign up. The account name is unique; the PP number is generated and unique; either one
  with the password signs in. The fairy's name may be shared by many.
- "Your name" is now "Account Name" (the same name on both pages).
- "Connect to your email?" (top right of the welcome page) is the only way an email comes in, for
  the Weekly and Monthly reports; the existing email logic applies only then.
- The mock-up's "May your garden…" line became "Forgot your password?" and "Forgot your username?".
  Both work only for an account whose email was connected **and verified**.
- Keep the original avatar choice on sign-up (the 8 original portraits), not the teammate's
  avatar-welcome step.
- The pavilion lantern switch exists only in development builds; production follows the phone's
  local time. This was already so on the pavilion branch (`reflection.tsx`, `MailboxPage.tsx`:
  `__DEV__ ? override : null`, `useWorldTime` reads the device clock); nothing changed.

## How it works

- App: `mobile/src/components/AuthGate.tsx` (modes `register` → `welcome`, `forgotPassword`,
  `forgotName`, `signIn` = the invitation page) drawn with `mobile/src/components/auth/AccountPages.tsx`
  (frame, fields, buttons; background and leaning fairy in `mobile/assets/auth/signup/`, painted by
  Claude from the mock-ups). Name and password rules are checked on the first page
  (`registrationValidation.ts`: 4–20 letters, numbers or underscores, not shaped like a PP number;
  password 8–16 with a letter and a number); a taken name comes back from the server on the welcome page.
- Server `POST /auth/register` (`server.js`) takes name, password, fairy name and avatar, checks them
  all again, and writes the account, its password hash (`AccountPassword`), its starter fairy with
  that name and its 8 original portraits (so it never sees the avatar welcome) in one create, then
  issues the sign-in token. 10 new accounts per network a day (`newAccountRateLimit`).
- Sign-in: `POST /auth/password-login` with name or PP number (one answer for every failure); or
  the verified email with Firebase.
- Forgot password: Firebase sends a reset link (same reply for every address). Signing in with the
  email and the new password then sets the account's password too (`PUT /auth/password` accepts a
  fresh sign-in with a **verified** email instead of the old password).
- Forgot username: sign in with the verified email and its password; the page then shows the account
  name and PP number before the Garden.
- **Security rule added by Kiro:** `lib/auth.js` refuses any email-and-password sign-in whose address
  is not verified (`EMAIL_UNVERIFIED`, HTTP and sockets). Reason: Firebase mails a reset link to any
  address on file, so a mistyped or someone else's unverified address must never become a way into the
  account. The app also signs such a sign-in straight out with a message (`auth.tsx`).

## Checks (2026-11-06)

- Type check clean. Mobile tests: 763 pass / 39 fail, the same 39 as the base pavilion branch
  (none in auth). Backend tests: 1149 pass / 22 fail, the same failures as the base, plus the new
  `test/back/account-password-reset.route.test.js` (2 tests) passing.
- Local preview (`LOCAL_PREVIEW_PORT=8131 npm run web:local` in `mobile/`): create page, welcome
  page, entering the Garden, Forgot your username (shows name and PP number) were clicked through on a
  390-wide phone size. The fake server (`scripts/web-local/fixtures.js`) now keeps the password a new
  preview account sets.

## Not done / for the owner

- Not tried: real Firebase, a real email inbox, an iPhone. The backend needs Firebase Admin signing
  credentials for custom tokens (as on `feat/name-only-signup`).
- Release order: migration `202611060001_unique_names_account_passwords` (it gives any duplicate
  existing name the end of its PP number, the owner's earlier decision), then the pavilion's
  `202611040001_avatar_collection` if not run yet, then the backend, then the app.
- Legal pages still assume every account has an email. Sending Weekly/Monthly by email has no mail
  service yet.
- Do not undo: the unverified-email refusal in `lib/auth.js`; sign-up avatars limited to the 8
  original portraits.
