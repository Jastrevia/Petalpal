# PetalPal moderation — owner review required

Assign a primary and backup moderator before release. Review the queue each staffed day; triage threats, exploitation and privacy exposure first, record decisions, and escalate imminent danger to the appropriate local services when reliable information exists. PetalPal is not an emergency response service. No response-time SLA is verified or promised. Reassess staffing from actual queue age; do not launch without coverage.

## Staff page (2026-11-18)

The app has a team-only **Staff page** (`/staff`, entry under Me → Team). It shows two lists:

- **Feedback**: what players send from Help & Feedback (`POST /feedback`, stored in `AppFeedback`): category, subject, message, page, app version, and a reply email only if they typed one. Mark it Read or Done and keep a team note.
- **Reports**: the open report queue below, with the same actions.

Who can open it: accounts whose Firebase uid is in `MODERATOR_FIREBASE_UIDS` on Render (comma-separated; add both team members). Everyone else gets 403 and never sees the entry.

New items ping the team channel when `STAFF_NOTIFY_WEBHOOK_URL` is set on Render (a Discord or Slack incoming-webhook URL, https only). The ping says only the kind and category ("新反馈 / New feedback · BUG"), never the text, the person or an id. Read the content in the Staff page.

Guests (no account) still send feedback by email to contact@jastrevia.com.

Authenticated HTTP workflow (small-team tooling, no public dashboard):

1. Operator configures `MODERATOR_FIREBASE_UIDS` with verified staff Firebase UIDs; empty denies everyone. Use verified-email staff accounts and short-lived Firebase ID tokens in an approved API client. Never paste tokens into shell history, logs, tickets or this chat.
2. `GET /moderation/reports` returns up to 50 oldest open reports. It excludes reporter identity and private entries. Handle visible message text as sensitive evidence; do not export it to external AI tools.
3. `POST /moderation/reports/:reportId` JSON `{"action":"remove-message"}` removes only the reported author's message. `restrict-user` denies social access; `restore-user` reverses that restriction. `dismiss` closes an unsupported report. Each decision is stored with action and time. Restrictions preserve private journaling and deletion access.
4. Refresh the queue and verify the content/action result with disposable staging accounts. Review appeals through the proposed support inbox; never reveal reporter identity. Staff should record minimal operational case notes outside chat using approved restricted storage.
5. Curate synthetic regression cases from patterns, never copy private user submissions into test fixtures. Filters miss semantic abuse; reports and human decisions are essential.

Proposed public contact: contact@jastrevia.com. Delivery, access control, mailbox coverage and response process must be verified by the owner before publication. This document authorizes no production configuration.

AI-output reports contain output kind/reference and reason only. Use `review-ai` to record that a safety review was completed, or `dismiss` for an invalid flag. Do not retrieve the user's private Event/Reflection through admin tools: reproduce the reported class of issue with synthetic inputs, review the relevant policy/prompt/model version, and obtain separate explicit user permission if a user elects to share an excerpt through support. A closed report is not evidence of a filter fix; track any corrective work and regression before closing a valid safety issue.
