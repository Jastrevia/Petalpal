# Third-party notices — content-safety change

This file records the notice scope of the Event/Journal content-safety change;
it is not a license inventory for all pre-existing PetalPal dependencies.

No third-party moderation package, word list, code or test corpus is included.
`lib/content-safety.js` and its synthetic tests were independently authored for
PetalPal. Existing dependencies and their licenses are unchanged.

The following packages were assessed only, and are **not adopted**:

| Package | Declared SPDX | Notice required if later included |
| --- | --- | --- |
| `@2toad/profanity@3.3.0` | MIT | Copyright (c) 2019 2Toad; full MIT permission and warranty text; any verified upstream dataset notices. |
| `obscenity@0.4.6` | MIT | Copyright © 2025 Joseph Liu; English preset also credits Copyright (c) 2016 Titus Wormer; full MIT texts and any independently verified upstream data obligations. |
| `profanity-guard@1.1.17` | MIT | Copyright (c) 2026 Akshay Benny; full MIT text; any verified upstream dataset notices. |

No MIT material from these packages is redistributed by this change, so no such
license text is required for the authored fallback. Future adoption must preserve
the actual distributed copyright/license notices here or in the distribution's
equivalent and resolve dataset permissions first. An MIT badge is not sufficient.

Exact sources, provenance blockers and technical assessment:
[docs/content-safety.md](docs/content-safety.md#dependency-and-licensing-assessment).

## Treehouse journal books — EB Garamond

The 3D monthly journal books (`mobile/src/components/bookhouse/book3d/`) letter their
covers and pages in EB Garamond, redistributed unmodified in `mobile/assets/fonts/`:

| Font files | Source | License |
| --- | --- | --- |
| `EBGaramond-Regular.ttf`, `EBGaramond-MediumItalic.ttf` | `@expo-google-fonts/eb-garamond@0.4.3` (npm) | SIL Open Font License 1.1 — Copyright 2017 The EB Garamond Project Authors |

The full license text ships beside the fonts as `mobile/assets/fonts/EBGaramond-OFL.txt`.
The book textures in `mobile/assets/bookhouse/journal/` are derived from PetalPal's own
spine artwork (see `mobile/scripts/journal-books/README.md`); no third-party artwork is included.
