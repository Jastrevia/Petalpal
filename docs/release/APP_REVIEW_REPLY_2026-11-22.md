# App Review reply · submission 1970cedc (1.0 (2), rejected 2026-11-22)

Draft for the owner to edit and send from App Store Connect. Fill in the demo account only after it
has been made in the production app and signed in once.

## What we found

- **Demo account (2.1):** `contact@jastrevia.com` does not exist in production Firebase
  (`petalpal-b212c`), so it could never sign in. PetalPal 1.0 signs in with an **account name** (or PP
  number) and password; an email works only after it has been connected and verified in the app.
- **Account creation (2.1(a)):** production logs (Render PetalPal_v2, 7 days) show no `/auth/register`
  after 2026-11-17 and no `/auth/session` after 2026-11-19, so the reviewer's attempt never reached the
  server. The app refused the form before sending it. **Reproduced on the iPad simulator:** tapping the
  password field on a fresh iPad opens iOS's "Use Strong Password? – Fill Strong Password" sheet. The
  password it fills is 20 characters, and build 1.0 (2) refused anything over 16 on the device, so a
  reviewer who took the system's suggestion could never make an account. A name with a space or an
  email would also be refused before sending (rule: 4–20 letters, numbers or underscores).
- **iPad layout, found while testing:** the sign-in card's fields sat above its paper art (native layout
  computed the card's height from the full iPad width), the welcome page's fairy covered two avatars,
  and in landscape the fairy-naming card covered the bottom bar. All three fixed and checked on the
  iPad Air 11-inch simulator, portrait and landscape.
- **iPad:** build 1.0 (2) had `supportsTablet: false`, so on the reviewer's iPad Air it ran as a narrow
  iPhone window (compatibility mode). The owner's rule is that PetalPal adapts to iPad, iPhone and
  desktop, landscape recommended and portrait supported.
- Fixed on branch `fix/app-review-signup`: new passwords may be 8–64 characters, a refused
  name says exactly why (email, space, length, other characters), and iPad runs natively
  (`supportsTablet: true`).

## Owner steps before resubmitting

1. Deploy the backend change (lib/accounts.js) to production first, then build 1.0 (3) from the same
   commit. An older backend still refuses passwords over 16 characters: checked on TEST, where the
   new app with a strong password got "Use 8–16 characters with letters and numbers." from the server.
2. In the production app, create the review account, e.g. account name `appreview2026` with a
   password of 8–64 characters with letters and numbers. Plant 3–5 flowers and write one journal.
3. iPad support means App Store Connect now requires **13-inch iPad screenshots** (2064 × 2752 or
   2752 × 2064, landscape recommended). Take them on the iPad Pro 13-inch simulator.
4. App Store Connect → 1.0 → App Review Information: User name = the account name (not an email),
   Password = that password. In Notes, paste the English text below.
5. Submit build 1.0 (3) and reply to the message.

## Reply (English)

```
Hello,

Thank you for the review.

Demo account: the account we provided did not exist on our production server. We are sorry for the trouble. Please sign in with:

Account name: <account name>
Password: <password>

On the sign-in page, enter the account name (not an email address) in the "Username / PP number" field.

Account creation: PetalPal accounts use an account name, not an email. We reproduced the error: when the device offered "Fill Strong Password", the previous build refused that 20-character password before sending it, because it allowed at most 16 characters. Build 1.0 (3) accepts passwords up to 64 characters and explains exactly what to change when a name is not accepted. It also runs natively on iPad in landscape and portrait, instead of in iPhone compatibility mode. To create an account: tap "Create Account", enter an account name of 4–20 letters, numbers or underscores (for example review_test), a password of 8–64 characters with letters and numbers, choose an avatar, accept the Community Guidelines and tap "Enter My Garden".

We tested sign-up and sign-in on iPad (iPadOS 27) before resubmitting.

Best regards,
PetalPal team
```
