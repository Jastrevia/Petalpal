# Treehouse integration (2026-11-03)

Branch `feat/treehouse-integration`, cut from `main` eca6d88e. It brings in the teammate's
`origin/treehouse` 4ff2e09e (one commit, merge-base 366f6a93, 164 commits behind main) as a
3-way applied diff, not a merge, and replaces the old Bookhouse screen with the new Treehouse.

## What changed

- **New Treehouse** (`mobile/src/app/bookhouse.tsx`, `components/bookhouse/{MonthBook,TreehouseShelf,TreehouseArt,…}`,
  `book3d/*`, `assets/bookhouse/{journal,reference,composed,room,walls}`, EB Garamond fonts). Taken as the
  teammate wrote it. Active scene: `ROOM_LAYOUT = 'reference'` (book3d/scene.ts).
- **Server**: the teammate's `PATCH` and `DELETE /users/:userId/journals/:journalId` (only standalone
  journals; Daily Grow journals return 409 `JOURNAL_LOCKED`). Main's `PUT` on the same path stays
  as an alias of the PATCH handler, so installed apps that still send PUT keep working (with the
  same lock rule). The route inventory test lists all three (33 routes).
- **Scrollkeeper** (squirrel) moved from the top of the old bookcase to the illustrated desk:
  `ReferenceSquirrel` in `book3d/ReferenceScene.tsx` draws it on the strip of desk behind the open
  journal, between the quill and the teacup (`DESK_SQUIRREL`, reference-art px). It moves with the
  camera like the room, fading in as the camera settles on the desk. `Scrollkeeper` got a `roam`
  mode: from its first idle pose it now and then hops to another spot (facing where it goes),
  still folds into a journal now and then, and is frozen with reduced motion.
- Screens wider than the illustration (owner's choice 2026-11-03: original art only, no generated or blurred
  fill): on phones (width ≤ 600, `PHONE_WIDTH` in `book3d/composed.ts`) the camera stops closer so the illustration
  always fills the width; on short phone screens (a browser under its address bar) the upper rows and the sign go past
  the top — close the book to pick those months. Tablets and computers show the illustration at its own size with plain
  dark sides. (Version b14ea35b's blurred sides were removed.)
- Carried over from main into the new screen: the caring safety window on save
  (`useSafetyWatch` in `book3d/WritingPage.tsx`) and guest mode (a guest tapping a book is asked
  for an account).

## Checked

- `npx tsc --noEmit` (mobile) passes; `node --test mobile/test/bookhouse.test.mjs` 44/44.
- `test/back/private-journals.test.js` and `journal-month-events.test.js` pass.
- `test/back/security-p0-http-coverage.test.js` fails on `POST /reports missing`, the same as on
  main eca6d88e (not from this change).
- Web local preview: desk view at 393×660, 430×740, 375×812 (fills, full shelf at 375×812) and 1280×800 (dark sides). At 375×812: book opens to the desk, squirrel sits there, hops left ~100 px
  and turns, folds into a journal; guest tap asks for an account.

## Not done / known gaps

- The walk is a hop with the idle clip's first pose: there is no real walk-cycle clip of the
  squirrel yet (would need a generated clip — paid, needs the owner's go-ahead).
- Chinese (branch `feat/treehouse-zh`): the painted pages use Noto Serif SC (`e65ba524`), and the
  Treehouse words come from `mobile/src/services/treehouseCopy.ts` (`tt()` looks an English phrase
  up in a table; months, dates, counts and moods are written per language; anything missing stays
  English). The screen sets the language once per render (`setTreehouseLocale`). Checked in the
  local preview at 390×844 in 简体中文: the shelf (title, years, spines, locked labels), the open
  book's left page (flower, event and mood headings, empty-state lines), the right page's prompt
  and the date caption. NOT checked yet: a day that has a journal, edit mode, voice input, the
  photo and delete menus, Flower History, the save ceremony, `RecordsPage.tsx`/`WritingPage.tsx`
  (the readable-text versions). Strings those screens show that are not in the table are still
  English. The Petal Ring card prompt that appears over the Treehouse is another feature and is
  still English.
- Flower History has no entry button in the new Treehouse (the sheet is still in bookhouse.tsx).
- Not checked on a device or in the native app; nothing pushed or deployed.
