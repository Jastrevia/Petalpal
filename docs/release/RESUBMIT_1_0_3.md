# Resubmitting PetalPal 1.0 (4) to App Review

Build 1.0 (3) was uploaded on 2026-11-23 but not submitted: on TestFlight it closed on every tap on a pet's Feed or Dress up (a Reanimated callback called a plain function, `arcOffset`). Build 1.0 (4) fixes that and makes the golden puppy live in the Garden. Use 4 wherever this file says 3.

Status 2026-11-23. Both causes of the 1.0 (2) rejection are fixed and merged (`main` b9f24e7b, PRs #212 and #213); the
backend with the 8–64 password rule is live on Render; the review account exists in production and signs in on the web.

## Already done

- Production EAS variables checked (booleans only, no values read out): API is `petalpal-v2.onrender.com`, Firebase
  project `petalpal-b212c`, no Dev variant, bundle id `com.jastrevia.petalpal`. Build number was still **2**.
- Privacy policy, terms, support and account-deletion pages: public, HTTP 200, no login gate. The **app's website root
  (`app.jastrevia.com/`) redirects to a Cloudflare Access login**, so it must not be the Marketing URL in App Store
  Connect (Support URL = the public support page is fine).
- The native app talks only to `petalpal-v2.onrender.com`; Cloudflare Access does not stand between a reviewer and
  sign-in.
- Branch `fix/review-placeholder-copy` (local, not pushed): removes every "coming soon" teaser and the "Beta tester"
  badge a reviewer could reach (Guideline 2.1 / 2.3: no placeholder or beta wording).
- Reviewer walkthrough on the fake-data preview at iPad Air landscape: guest Garden → Create account with a
  20-character password (like iOS "Fill Strong Password") → welcome → Enter My Garden → first-time tour. No page
  errors.

## Owner steps, in order

0. Confirm production migrations (W27 added 10 on 2026-11-18; Petal Tarot reads a column one of them adds). In your
   own terminal, with DATABASE_URL copied from Render PetalPal_v2:
   `cd ~/dev/Petalpal && read -s DBURL && NODE_ENV=production DATABASE_URL="$DBURL" npx prisma migrate status`
   "Database schema is up to date" = fine. Otherwise back up (`pg_dump -Fc`) and run `migrate deploy` the same way.
1. Push and merge `fix/review-placeholder-copy` (one PR into `main`): no "coming soon" text, no "Beta tester"
   badge, and no "Redeem a code" on iOS (Guideline 3.1.1).
2. Set build number 4:
   `cd ~/dev/Petalpal/mobile && npx eas-cli env:set production --name PETALPAL_IOS_BUILD_NUMBER --value 4 --visibility plaintext --non-interactive`
3. Build and upload: `git checkout main && git pull`, then
   `npx eas-cli build --platform ios --profile production --auto-submit`
4. TestFlight on a real iPad and iPhone (10 minutes): create a new account with **Fill Strong Password**; sign out;
   sign in with the review account; rotate the sign-in page; write an Event and plant it; tap the puppy and Xiaobai, open Feed and Dress up for each; open the calendar and check in; open Events, Friends,
   Fairy, Me; Me → delete account flow opens.
5. App Store Connect → 1.0 → select build 1.0 (4).
6. App Review Information: Sign-in required; User name = the review **account name** (not an email); Password = its
   password; Notes = the text below.
7. Screenshots: 13-inch iPad (2752 × 2064) are now required because the app runs on iPad. Four ready ones are in
   `docs/release/app-store-ipad13/` (Garden, Events, Our Bond, Mailbox; not committed).
8. Reply in Resolution Center (text below), then Submit for Review.

## Review notes (paste into App Review Information → Notes)

```
Sign in on the first screen: tap "Create account / Sign in", enter the account name below in "Username / PP number" (it is not an email address) and the password.

Account name: <account name>
Password: <password>

You can also create a new account: Create account → an account name of 4–20 letters, numbers or underscores → a password of 8–64 characters with letters and numbers (iOS "Fill Strong Password" works). Connecting an email is optional and can be done later in Me.

A short first-time tour introduces the Garden: write an Event, choose a mood, plant the flower it grows. AI features are off until the user turns them on; text is then sent to Cloudflare Workers AI and Anthropic, as disclosed in the app and the privacy policy. Users can report and block other users, and delete their account in Me → Privacy & support.
```

## Reply to the rejection (Resolution Center)

```
Hello,

Thank you for the review, and sorry for the trouble.

1. Demo account: the account in our previous submission did not exist on our production server. A working account is now in App Review Information. PetalPal signs in with an account name, not an email address.

2. "Error creating account": on iPad, iOS offered "Fill Strong Password", which creates a 20-character password. Build 1.0 (2) allowed at most 16 characters, so the form was refused on the device before it was sent. Build 1.0 (4) accepts 8–64 characters, and our server was updated to match. We tested account creation with a strong password and sign-in on iPad and iPhone.

3. Build 1.0 (4) also runs natively on iPad in landscape and portrait instead of iPhone compatibility mode.

Best regards,
PetalPal team
```
