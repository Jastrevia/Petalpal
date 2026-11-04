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
  and the date caption. Also checked (375×812, 简体中文): a day with a journal (spread and close-up
  page), edit mode (unsaved chip 「未保存」, save button, 「❦ 日记已保存」), the actions menu and the
  delete confirmation, the photo button; a scan of the open book found no English left besides the
  owner's own writing. Fixed on the way: the unsaved chip was too long and pushed the date onto two
  lines; the safety note on the writing page was drawn in the dark-panel colour (pale teal, nearly
  invisible on parchment, in English too) and now uses the page's ink. NOT checked: voice input
  (its strings are in the table), Flower History (no entry button). The Petal Ring card prompt that
  appears over the Treehouse is another feature and is still English.
- Writing on a phone's browser (owner's report 2026-11-04, iPhone Safari, live: the words were very large and jumped
  while typing): react-native-web reports the part of the page above the on-screen keyboard as the window, so the
  open journal page was laid out again to that half-height as the keyboard opened (shrunk to about half its width, so
  the words looked huge on it) and again each time the suggestion / Chinese candidate bar came and went. The Treehouse
  now lays out to the app's own height (`book3d/layoutWindow.ts` `useLayoutWindow`: #root, 100dvh), and the writing
  page ends its writing area above the keyboard from the visible part of the page (`useWebVisibleBottom`). On the
  web the writing box takes its height from the same words set invisibly in the same type (a text area's scroll
  height never shrank back, so the box stayed tall and scrolled to empty space). Checked in the local preview at
  402×760 by giving the page iOS's keyboard viewport (visible height 424, then 380 for a candidate bar): the page
  stays 386×574 with 18.5 px words, the words do not move as the keyboard opens, the newest line and Save stay above
  the keyboard; at 1280×800 the desk still follows the window. NOT checked on a real iPhone (the simulator's typing
  was unreliable).
- Flower History has no entry button in the new Treehouse (the sheet is still in bookhouse.tsx).
- Not checked on a device or in the native app; nothing pushed or deployed.
