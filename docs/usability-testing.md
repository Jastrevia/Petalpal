# iPhone usability testing (free Apple ID)

This stage uses free signing from a normal Apple ID (Xcode **Personal Team**) to install **PetalPal Dev** on iPhones. There is no paid developer account and no TestFlight. The later beta path is at the end of this document and in [ios/TESTFLIGHT.md](ios/TESTFLIGHT.md).

**Current status:** the configuration has been checked by generating the iOS project, but no build has run on an iPhone yet, because the development Mac has no Xcode. Follow the first build below before you schedule testers.

## What you need

| Requirement | Detail |
|---|---|
| Mac | A macOS version that can run Xcode 26.4 or later (macOS Tahoe 26.2 or later) |
| Xcode | 26.4 or later (required by Expo SDK 57). Open it once and add the iOS platform |
| Apple ID | Xcode → Settings → Accounts → **+**. Any free Apple ID works |
| CocoaPods | `brew install cocoapods` |
| Node.js | 22.13 or later |
| iPhone | iOS 16.4 or later (the app's minimum). Xcode 27 can only run on iOS 17 or later |

Xcode 27 meets Expo's stated minimum, but we have not confirmed that SDK 57 builds with it. If the first build fails, look there first.

## Limits of free signing

- **The app stops opening after 7 days.** Reinstall it to continue.
- **Installing over the old copy keeps its local data**, as long as the bundle ID and Apple ID stay the same.
- **At most 3 registered devices per Apple ID, and 3 apps per device.** App IDs also expire after 7 days, with at most 10 at a time.
- **Each install needs the iPhone connected to the Mac.** After that the app runs without the Mac until it expires.
- **Apple describes this signing as for devices you own**, so testers should use our phones.
- **One bundle ID belongs to one Apple ID.** If a second person signs builds, they set their own ID in the `.env.ios.*` file, for example `PETALPAL_IOS_DEV_BUNDLE_ID=com.yourname.petalpal.dev`.

## What this build cannot test

The app uses no capability that free signing blocks. The generated `PetalPal Dev` project has empty entitlements: no push notifications, Sign in with Apple, iCloud, App Groups or Associated Domains. **Nothing was turned off for this variant.**

These still differ from a real release:

| Not covered | Why |
|---|---|
| Real AI output | The TEST backend's AI limits are 0, so Weekly reports use the code-written version |
| Weekly 2.0 loop, Monthly 2.0, almanac | Those are on `feat/weekly-insights-m2`, not this build |
| Install from an invitation | There is no TestFlight, so that first step isn't part of the test |
| Long-term use | The app expires after 7 days unless reinstalled |

## Environments

The app is configured only from a git-ignored file, chosen by the npm script.

| Script | Build | Settings file | Backend |
|---|---|---|---|
| `npm run ios:device` | Debug, hot reload, Mac needed | `.env.ios.development` | TEST by default |
| `npm run ios:device:release` | Release, no Mac needed | `.env.ios.usability-test` | TEST |

Create each file from its `.example` in `mobile/` and fill in the TEST Firebase web client values:

```bash
cd mobile
cp .env.ios.usability-test.example .env.ios.usability-test
cp .env.ios.development.example .env.ios.development
```

The script stops if:
- any of the five values is missing (Firebase would otherwise fall back to the production project)
- a usability-test build points at the production API or Firebase project
- Xcode or CocoaPods is missing or too old

It reads nothing from `.env` or your shell's `EXPO_PUBLIC_*` values, so a build can't pick up the wrong backend by accident.

**Keep the backend stable during a round:** TEST is also the integration environment. From the first tester to the last, do not deploy to `petalpal-backend-test` and do not run migrations on its database.

## First install on a new iPhone

1. Connect the iPhone to the Mac with a cable, unlock it and tap **Trust**.
2. In `mobile/`, run the Release build. The first one can take a long time, so close other apps first:
   ```bash
   npm run ios:device:release
   ```
   With several phones connected, name one:
   ```bash
   npm run ios:device:release -- --device "Device Name"
   ```
3. If Xcode reports a signing error, open `mobile/ios/PetalPalDev.xcworkspace`, select the **PetalPalDev** target, go to **Signing & Capabilities**, choose your **Personal Team**, close Xcode and run the command again.
4. Turn on Developer Mode on the iPhone: **Settings → Privacy & Security → Developer Mode**. The iPhone restarts. Confirm when it asks.
5. Trust the certificate: **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**.
6. Open **PetalPal Dev** from the home screen.

## Daily development

```bash
npm run ios:device
```

The iPhone and Mac must be on the same Wi-Fi. This build is slower than Release, so don't judge performance from it.

## Rebuild or reinstall

Run `npm run ios:device:release` again with the iPhone connected. Use the same command when the 7 days run out. Local data stays, so reset the phone before handing it to the next tester.

The script regenerates `ios/` when the bundle ID changes. Each Release build starts with an empty Metro cache, so an old API address can't be built in.

## Checklist for each round

**Before the round**
- [ ] Confirm with the team: no TEST deployments or migrations until the round ends.
- [ ] Reinstall if the app is close to 7 days old.
- [ ] Confirm the app is named **PetalPal Dev**.
- [ ] Create one TEST account per tester ahead of time. Sign-up needs an email inbox you can verify, so use a team-controlled address rather than the tester's own.

**Before each tester**
- [ ] Open the app after a reset: it should show the guest Garden.
- [ ] Sign in with that tester's account if the session starts past sign-up.
- [ ] Tell them not to write anything they would not want a test team to see.

**After each tester**
- [ ] If they want their entries gone, delete the test account: **Me → Delete account**. **Reset does not remove anything from the server.**
- [ ] Tap **Reset this device (test build)**, in **Me** when signed in or on the sign-in page when signed out, then confirm **Erase**.
- [ ] Swipe the app away in the app switcher and open it again. The full-screen message asks for this because memory is only cleared by restarting.
- [ ] If the message says some data could not be erased, delete the app from the phone before the next tester.

### What Reset clears

| Cleared | Not cleared |
|---|---|
| Sign-in session and all AsyncStorage data (preferences, flower placements on this phone, drafts) | Anything on the TEST server |
| expo-image memory and disk caches | Photos the tester saved to the phone's library, or images they shared |
| Files in the app's cache folder | iOS system data about the app |

Normal builds keep nothing in SecureStore and have no local database. The Reset button exists only when `EXPO_PUBLIC_APP_VARIANT=dev`, and store builds refuse that value.

## Later: moving to a paid account and TestFlight

1. Join the Apple Developer Program and create the app in App Store Connect.
2. Build the store variant by leaving `EXPO_PUBLIC_APP_VARIANT` unset, with `PETALPAL_IOS_BUNDLE_ID=com.jastrevia.petalpal`. The store name and scheme return automatically, and the Reset button disappears.
3. Sign with the paid team instead of the Personal Team. EAS can manage certificates.
4. **Capabilities:** nothing was turned off here, so there is nothing to restore. Add a capability in `app.json` only when a feature needs it.
5. Set the EAS `production` environment values and follow [ios/TESTFLIGHT.md](ios/TESTFLIGHT.md).
6. Decide which backend the beta uses. Production needs its own approved release and migration steps, and `feat/weekly-insights-m2` needs migration `202611010001` first.
7. Test accounts and data on TEST do not carry over to production.
