# Published policies (2026-10-22)

Owner decisions (2026-10-22): operators are the co-founders **Xingran Ma and Jinyin Cao** (no company);
contact **contact@jastrevia.com** (owner confirms it receives mail); adults only — **19, or the age of
majority where the user lives, whichever is higher**; **British Columbia and Canadian federal law**;
**no backups of deleted accounts are kept** (owner confirms the earlier manual `pg_dump` files are gone).
Effective date October 22, 2026. Not reviewed by a lawyer; have counsel review before a public launch.

**Update 2026-10-23 (Privacy Policy and deletion page now effective October 23, 2026; Terms unchanged).**
The free Render database has no automatic backups, so the owner now makes periodic manual exports and
keeps only the last **30 days**, deleting older ones. The pages say: deletion removes data from the
database right away; backups made before a deletion may still hold it for up to 30 days; backups are only
for recovering from a technical failure and are never used to restore a deleted account. Keeping that
promise is the owner's job: delete every export older than 30 days, and never restore a deleted account
from one. If an export is ever restored, delete again the accounts deleted after that export was made.

| Page | Source | Public URL |
|---|---|---|
| Privacy Policy | `mobile/public/legal/privacy.html` | https://app.jastrevia.com/legal/privacy.html |
| Terms of Use (includes Community Guidelines) | `mobile/public/legal/terms.html` | https://app.jastrevia.com/legal/terms.html |
| Account & Data Deletion | `mobile/public/legal/account-deletion.html` | https://app.jastrevia.com/legal/account-deletion.html |

The Expo web export copies `mobile/public/` into `mobile/dist/`, and the production Worker serves those
files as-is (`html_handling: none`, `/legal/*` is never the app shell). `scripts/build-cloudflare-web.mjs`
sets `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_DELETION_URL` to these
URLs, so the Privacy & support links in the app open them. Native EAS builds need the same three values.

## Owner steps to make them public

1. Merge and release the Web as usual (build → upload-app → activate-app).
2. **Cloudflare Zero Trust → Access → Applications → Add an application → Self-hosted**: domain
   `app.jastrevia.com`, path `legal/*`, policy action **Bypass**, include **Everyone**. A more specific path
   takes precedence over the existing `app.jastrevia.com` application, so only `/legal/*` becomes public.
3. Open the three URLs in a private browser window that is not signed in: each must load without the
   Cloudflare email page.
4. Keep the backup promise above: exports older than 30 days are deleted.

The drafts in [POLICY_DRAFTS.md](POLICY_DRAFTS.md) remain for history; the published pages above supersede them.
