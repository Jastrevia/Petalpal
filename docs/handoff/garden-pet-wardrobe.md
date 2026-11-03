# Garden Pet Wardrobe — Engineering Handoff

**Project:** PetalPal  
**Repository:** `Jastrevia/Petalpal`  
**Working branch:** `feat/garden-pet-wardrobe`  
**Related PR:** #170  
**Status:** In progress — not merged  
**Handoff date:** November 3, 2026

---

## 1. Mission

Continue the existing Garden Pet / Puppy Wardrobe implementation.

This is a continuation task, NOT a greenfield implementation.

The previous development work established the pet appearance assets, outfit combinations, pet interaction logic, and related frontend/backend changes.

Your responsibility is to:

1. Understand the existing implementation.
2. Preserve completed work.
3. Complete the pet interaction and wardrobe experience.
4. Connect the outfit assets to the UI correctly.
5. Verify the complete user experience.
6. Keep the implementation consistent with the existing PetalPal architecture.

Do not rewrite working features just because you would implement them differently.

## 2. GitHub and source-of-truth

Repository:

`https://github.com/Jastrevia/Petalpal`

Branch:

`feat/garden-pet-wardrobe`

Related PR:

`https://github.com/Jastrevia/Petalpal/pull/170`

The branch is not merged into main.

First inspect the actual remote state:

- Fetch the latest remote branches.
- Inspect the branch and PR #170.
- Check the current commit history.
- Check whether there are additional commits or changes.
- Inspect the working tree and all relevant files.

Historical local development information:

- Worktree: `/Users/xingranma/dev/PetalPal/.claude/worktrees/pet-wardrobe`
- Previously recorded HEAD: `cf2f1a1a`
- Previous branch: `feat/garden-pet-wardrobe`

These are historical reference details, not guaranteed current HEAD values.

**Important:** Never assume local changes have been pushed. Verify everything against GitHub before making changes.

## 3. Existing implementation to preserve

The previous development work included:

- Pet-related API changes.
- Pet-related UI changes.
- Pet-related tests.
- Puppy appearance combinations.
- Pet outfit configuration and rendering logic.
- `puppyLooks.ts`
- `gardenPets.ts`
- New puppy appearance assets.
- Legacy puppy animation asset cleanup.

The previous local development snapshot contained 18 puppy-look combinations and approximately 32 accessory assets.

Verify the actual number and asset inventory in the repository.

Do not recreate assets that already exist.

Do not delete existing assets without understanding their references.

## 4. Visual design rules — NON-NEGOTIABLE

These are product requirements, not suggestions.

### 4.1 Character consistency

The dog must remain visually consistent across every outfit.

Requirements:

- Same dog identity.
- Same body proportions.
- Same overall dimensions.
- Same head-to-body ratio.
- Same position and visual center.
- Same base appearance.
- Outfits must not change the underlying character identity.

The dog must not become larger or smaller when switching outfits.

Different outfits should look like different clothing applied to the same dog, not different dog characters.

### 4.2 Outfit transitions

Outfit switching must use a simple fade transition.

- Fade out the previous outfit.
- Fade in the new outfit.
- No excessive visual effects.
- No flashy transitions.
- No additional particle effects.
- No unnecessary animation that distracts from the pet.

Keep the transition clean and subtle.

### 4.3 Cape and crystal brooch

A cape must always come with its matching crystal brooch.

The brooch is part of the cape outfit combination.

Never allow the cape to appear without the brooch.

Do not treat these as unrelated optional accessories.

### 4.4 Changing outfits while running

If the user changes an outfit while the dog is running:

1. Stop the running animation.
2. Transition the dog into a sitting position.
3. Apply the new outfit.
4. Resume the appropriate idle state.

Never change outfits while the dog continues running.

Avoid abrupt animation state changes.

## 5. Main user experience to complete

### 5.1 Pet interaction ring menu

When the user taps the pet, display an interaction ring menu.

Expected actions:

- Feed
- Pet / interact
- Change outfit

Requirements:

- The menu should be visually consistent with PetalPal.
- It should be easy to understand.
- It should not obstruct the pet unnecessarily.
- It should work with the existing pet interaction system.
- Actions must connect to real application logic, not just visual placeholders.

Inspect the existing implementation before adding or replacing components.

### 5.2 Wardrobe screen

Build or complete the wardrobe interface.

Requirements:

- Display available outfits and accessories.
- Use existing artwork.
- Show the currently equipped outfit.
- Allow the user to select another available outfit.
- Preview the outfit on the same dog.
- Confirm and persist the selection using the existing data architecture.
- Correctly handle unavailable or locked items.
- Ensure the selected outfit survives navigation and app reloads.

Do not invent a new asset-generation pipeline.

### 5.3 Outfit and accessory logic

Inspect:

- Existing outfit configuration.
- Accessory relationships.
- Pet ownership.
- Unlock conditions.
- Equipped-item persistence.
- Any existing outfit validation.

Enforce required combinations, especially the cape and crystal brooch.

Do not create conflicting outfit states.

## 6. Existing PetalPal features to protect

The pet wardrobe is part of a larger application.

Preserve existing functionality, including:

- Pet ownership and identity.
- Pet state and animation logic.
- Existing rewards and progression.
- Existing API contracts.
- Existing user data.
- Existing frontend navigation.
- Existing tests.

The previous work also included Fairy Bond reward logic:

- Levels 4–10: pendants.
- Levels 11–15: collars.
- Levels 16–20: hats.
- Owner/level-based non-repeating assignments.
- Per-pet outfits.
- Food rewards from check-ins, level-ups, and first plantings.
- Fairy Moments beginning at level 3.

These are existing changes to inspect and preserve if they are present in the current branch.

Do not accidentally remove unrelated improvements while completing the wardrobe.

## 7. Assets and art pipeline

There is a separate local art pipeline:

`~/dev/petalpal-motion`

This folder contains the local workflow for generating new outfit images and animations.

It is not part of the GitHub repository.

Kiro Web cannot access it.

The local generation API keys, including ZenMux and image/video generation credentials, are stored in the local macOS Keychain.

**Security requirements:**

- Never request or expose API keys.
- Never commit secrets.
- Never invent a replacement art-generation workflow.
- Do not attempt to access the user's local filesystem from Kiro Web.
- Do not claim to have generated new artwork if you have not.

The accessory asset folder previously identified as unpushed:

`mobile/assets/garden/pets/`

It contains approximately 32 accessory icons.

First check whether these assets are already present in the remote branch.

If missing, report the exact missing assets and request that they be committed from the local machine.

Do not replace missing artwork with random placeholders.

## 8. Technical implementation requirements

Before coding:

1. Identify the framework and project architecture.
2. Locate the existing pet components.
3. Locate the pet state and animation management.
4. Locate outfit and accessory configuration.
5. Locate API endpoints and persistence logic.
6. Understand the existing navigation and styling conventions.
7. Inspect related tests.

Implementation requirements:

- Reuse existing components wherever possible.
- Reuse existing state management.
- Reuse existing API contracts.
- Avoid unnecessary dependencies.
- Avoid duplicate business logic.
- Maintain TypeScript type safety.
- Keep changes focused.
- Preserve backward compatibility with existing pet data.
- Handle missing or unavailable accessories safely.

Do not make architectural changes without explaining why they are necessary.

## 9. Testing and acceptance criteria

The implementation is not complete just because the UI renders.

### Character and appearance

- [ ] The same dog appears in every outfit.
- [ ] Character dimensions remain consistent.
- [ ] No outfit causes unexpected scaling.
- [ ] Accessories are correctly positioned.
- [ ] Cape always includes its crystal brooch.

### Animation

- [ ] Running animation works.
- [ ] Sitting animation works.
- [ ] Idle animation works.
- [ ] Outfit switching uses fade only.
- [ ] Switching during running first transitions to sitting.
- [ ] No animation state conflicts occur.

### Interaction

- [ ] Tapping the pet opens the ring menu.
- [ ] Feed action works.
- [ ] Pet interaction works.
- [ ] Wardrobe action opens the wardrobe.
- [ ] Menu closes correctly.
- [ ] Interactions work on mobile-sized screens.

### Wardrobe

- [ ] Existing outfits are displayed.
- [ ] Existing accessories are displayed.
- [ ] Locked items are handled correctly.
- [ ] Outfit preview works.
- [ ] Outfit selection works.
- [ ] Equipped outfit persists after reload.
- [ ] Invalid accessory combinations are prevented.

### Regression

- [ ] Existing pet features still work.
- [ ] Existing rewards and progression remain intact.
- [ ] Existing API tests pass.
- [ ] Existing relevant frontend tests pass.
- [ ] No unrelated functionality is broken.

Report tests that cannot be run and explain why.

## 10. Development workflow

Work in small, reviewable steps.

Recommended sequence:

**Phase 1 — Audit**

- Inspect branch and PR #170.
- Map existing implementation.
- Identify completed and incomplete features.
- Verify available assets.
- Identify missing dependencies.

**Phase 2 — Interaction**

- Complete pet interaction ring menu.
- Connect Feed, Pet, and Wardrobe actions.
- Verify menu state and behavior.

**Phase 3 — Wardrobe**

- Complete wardrobe screen.
- Connect outfit selection.
- Implement persistence.
- Validate accessory combinations.

**Phase 4 — Animation**

- Implement the required sitting-before-changing behavior.
- Implement fade-only transitions.
- Test idle, running, and sitting states.

**Phase 5 — Verification**

- Run relevant tests.
- Fix regressions.
- Review responsive behavior.
- Provide implementation evidence.

**Phase 6 — Delivery**

- Summarize changed files.
- Summarize completed functionality.
- List remaining issues.
- Report test results.
- Commit and push only to the designated feature branch.
- Do not merge PR #170 without explicit approval.

## 11. Boundaries

Kiro Web can work with the code and assets already pushed to GitHub.

It cannot directly:

- Read `~/dev/petalpal-motion`.
- Access local macOS Keychain credentials.
- Generate new artwork using the user's local API keys.
- Access unpushed local assets.

Do not pretend these limitations do not exist.

When a task requires local assets or local generation, clearly identify what is missing and provide the exact file paths or actions needed.

## 12. Definition of success

The handoff is successful when:

1. The existing implementation has been understood and preserved.
2. The pet interaction ring menu works.
3. The wardrobe interface works.
4. Outfit selection and persistence work.
5. Character consistency is maintained.
6. Animation transitions follow the specified rules.
7. Required accessory combinations are enforced.
8. Existing PetalPal functionality remains intact.
9. Relevant tests pass.
10. The changes are ready for human review in PR #170.

**Final principle: Preserve the existing creative direction. The pet should feel like the same living companion, simply wearing different outfits.**
