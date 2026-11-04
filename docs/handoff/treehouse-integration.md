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
- Wide windows (computer, tablet): the desk view keeps the illustration's phone-shaped column (its scale is set by
  the window's height) and fills the sides with the same room art, enlarged about the desk edge, blurred and darkened
  (`ReferenceScene.tsx`, ground layer), instead of plain dark wood. Phones are unchanged (the art already spans them).
- Carried over from main into the new screen: the caring safety window on save
  (`useSafetyWatch` in `book3d/WritingPage.tsx`) and guest mode (a guest tapping a book is asked
  for an account).

## Checked

- `npx tsc --noEmit` (mobile) passes; `node --test mobile/test/bookhouse.test.mjs` 44/44.
- `test/back/private-journals.test.js` and `journal-month-events.test.js` pass.
- `test/back/security-p0-http-coverage.test.js` fails on `POST /reports missing`, the same as on
  main eca6d88e (not from this change).
- Web local preview at 375×812, 768×1024 and 1280×800 (desk view checked at all three). At 375×812: book opens to the desk, squirrel sits there, hops left ~100 px
  and turns, folds into a journal; guest tap asks for an account.

## Not done / known gaps

- The walk is a hop with the idle clip's first pose: there is no real walk-cycle clip of the
  squirrel yet (would need a generated clip — paid, needs the owner's go-ahead).
- The new Treehouse is English only: main's zh-Hans copy for the old Bookhouse does not apply to
  the new components.
- Flower History has no entry button in the new Treehouse (the sheet is still in bookhouse.tsx).
- Not checked on a device or in the native app; nothing pushed or deployed.
