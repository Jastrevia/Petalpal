import { STARTER_FAIRY } from "./fairy-config.js";
import { assertContentAllowed, CONTENT_REJECTED } from "./content-safety.js";

// First-time guided tour (mobile/src/components/onboarding). One row per owner lives on
// FairyState next to the original first-flower onboarding flags. The tour's step only
// moves forward, so a resumed device, a retried request or a second device can never
// rewind it. The Fairy's chosen name is her real name: the starter UserFairy row that
// Moments, captions and the rest of her experience already read.

// Keep in sync with mobile/src/components/onboarding/onboardingSteps.ts (a test compares them).
export const TUTORIAL_STEPS = Object.freeze([
  "intro.name", "intro.celebrate",
  "garden.zoom",
  "event.nav", "event.write", "event.mood", "event.save", "event.flower",
  "plant.place", "plant.growth", "plant.months",
  "treehouse.enter", "treehouse.shelf", "treehouse.books", "treehouse.archive", "treehouse.journal", "treehouse.back",
  "mailbox",
  "friends.nav", "friends.search", "friends.house", "friends.visit", "friends.return",
  "fairy.feed", "fairy.bond", "fairy.keepsakes",
  "me.space", "me.privacy",
  "finale",
  "done"
]);
export const FAIRY_NAME_MAX_LENGTH = 16;
const order = step => TUTORIAL_STEPS.indexOf(step);
// Letters (any script), combining marks, digits, spaces and a few name punctuation marks.
const NAME_PATTERN = /^[\p{L}\p{M}\p{N} '’·.\-_]+$/u;

export class OnboardingTutorialError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "OnboardingTutorialError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeFairyName(value) {
  if (typeof value !== "string") throw new OnboardingTutorialError("Give your fairy a name.", 400, "FAIRY_NAME_REQUIRED");
  const name = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!name) throw new OnboardingTutorialError("Give your fairy a name.", 400, "FAIRY_NAME_REQUIRED");
  if ([...name].length > FAIRY_NAME_MAX_LENGTH) {
    throw new OnboardingTutorialError(`Her name can be up to ${FAIRY_NAME_MAX_LENGTH} characters.`, 400, "FAIRY_NAME_TOO_LONG");
  }
  if (!NAME_PATTERN.test(name)) {
    throw new OnboardingTutorialError("Use letters, numbers and spaces for her name.", 400, "FAIRY_NAME_INVALID");
  }
  try { assertContentAllowed(name); }
  catch (error) {
    if (error?.code === CONTENT_REJECTED) throw new OnboardingTutorialError("Please choose a kinder name.", 422, "FAIRY_NAME_REJECTED");
    throw error;
  }
  return name;
}

const TUTORIAL_SELECT = {
  onboardingCompleted: true, tutorialStep: true, tutorialCompletedAt: true, fairyNamedAt: true,
  tutorialFirstEventId: true, tutorialFirstFlowerId: true, tutorialFlowerPlantedAt: true
};

function view(state, fairyName) {
  const completed = Boolean(state?.tutorialCompletedAt);
  return {
    status: completed ? "completed" : "active",
    step: completed ? "done" : (state?.tutorialStep || TUTORIAL_STEPS[0]),
    fairyName: fairyName ?? null,
    fairyNamed: Boolean(state?.fairyNamedAt),
    firstEventId: state?.tutorialFirstEventId ?? null,
    firstFlowerId: state?.tutorialFirstFlowerId ?? null,
    flowerPlanted: Boolean(state?.tutorialFlowerPlantedAt)
  };
}

async function starterName(db, userId) {
  const starter = await db.userFairy.findUnique({
    where: { userId_fairyType: { userId, fairyType: STARTER_FAIRY.type } }, select: { name: true }
  });
  return starter?.name ?? null;
}

// Accounts that grew a Garden before the tour existed never see it: any earlier first-flower
// onboarding, Event or Flower marks the tour complete (the migration does the same at once).
export async function onboardingTutorialState(db, { userId, now = new Date() }) {
  let state = await db.fairyState.upsert({
    where: { userId }, update: {}, create: { userId }, select: TUTORIAL_SELECT
  });
  if (!state.tutorialCompletedAt && !state.tutorialStep) {
    const established = state.onboardingCompleted ||
      (await db.event.count({ where: { ownerId: userId } })) > 0 ||
      (await db.flower.count({ where: { userId } })) > 0 ||
      (await db.userFairy.count({ where: { userId } })) > 0;
    if (established) {
      await db.fairyState.updateMany({ where: { userId, tutorialCompletedAt: null },
        data: { tutorialCompletedAt: now, tutorialStep: "done" } });
      state = { ...state, tutorialCompletedAt: now, tutorialStep: "done" };
    }
  }
  // An Event saved during the tour whose link never reached the server (the app closed at that
  // moment) is still the tour's first Event: the tour blocks every other way to write one.
  if (!state.tutorialCompletedAt && !state.tutorialFirstEventId && order(state.tutorialStep) >= order("event.write")) {
    const event = await db.event.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (event) {
      const flower = await db.flower.findFirst({ where: { userId, sourceEventId: event.id }, select: { id: true } });
      const data = { tutorialFirstEventId: event.id, ...(flower ? { tutorialFirstFlowerId: flower.id } : {}) };
      await db.fairyState.updateMany({ where: { userId, tutorialFirstEventId: null }, data });
      state = { ...state, ...data };
    }
  }
  return view(state, await starterName(db, userId));
}

async function nameStarterFairy(tx, userId, name) {
  const existing = await tx.userFairy.findUnique({
    where: { userId_fairyType: { userId, fairyType: STARTER_FAIRY.type } }, select: { id: true }
  });
  if (existing) return tx.userFairy.update({ where: { id: existing.id }, data: { name } });
  const active = await tx.userFairy.findFirst({ where: { userId, isActive: true }, select: { id: true } });
  return tx.userFairy.create({ data: {
    userId, fairyType: STARTER_FAIRY.type, name, unlockSource: STARTER_FAIRY.unlockSource,
    isActive: !active, runtime: { create: {} }
  } });
}

/**
 * One owner-scoped update. `fairyName` names her (only before the Garden tour starts);
 * `firstEventId` / `firstFlowerId` link the tour to the owner's real Event and its Flower;
 * `flowerPlanted` records that the Flower was placed; `step` advances (never rewinds);
 * `complete` finishes the tour and unlocks the Garden exactly like the first-flower onboarding.
 */
export async function updateOnboardingTutorial(db, { userId, body, now = new Date(), lock = async () => {} }) {
  const fairyName = body.fairyName === undefined ? undefined : normalizeFairyName(body.fairyName);
  if (body.step !== undefined && (typeof body.step !== "string" || order(body.step) < 0 || body.step === "done")) {
    throw new OnboardingTutorialError("Unknown tutorial step", 400, "INVALID_STEP");
  }
  for (const field of ["firstEventId", "firstFlowerId"]) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || !body[field] || body[field].length > 128)) {
      throw new OnboardingTutorialError(`Invalid ${field}`, 400, "INVALID_REFERENCE");
    }
  }
  for (const field of ["flowerPlanted", "complete"]) {
    if (body[field] !== undefined && body[field] !== true) {
      throw new OnboardingTutorialError(`${field} must be true`, 400, "INVALID_FLAG");
    }
  }

  return db.$transaction(async (tx) => {
    await lock(tx, "onboarding-tutorial", userId);
    const state = await tx.fairyState.upsert({
      where: { userId }, update: {}, create: { userId }, select: TUTORIAL_SELECT
    });
    if (state.tutorialCompletedAt) return view(state, await starterName(tx, userId));
    const data = {};
    const current = state.tutorialStep || TUTORIAL_STEPS[0];

    if (fairyName !== undefined) {
      if (order(current) > order("intro.celebrate")) {
        throw new OnboardingTutorialError("Her name was already chosen.", 409, "FAIRY_ALREADY_NAMED");
      }
      await lock(tx, "fairy-owner", userId);
      await nameStarterFairy(tx, userId, fairyName);
      data.fairyNamedAt = state.fairyNamedAt || now;
    }
    const named = Boolean(state.fairyNamedAt || data.fairyNamedAt);

    const eventId = state.tutorialFirstEventId || body.firstEventId;
    if (body.firstEventId !== undefined) {
      if (state.tutorialFirstEventId && state.tutorialFirstEventId !== body.firstEventId) {
        throw new OnboardingTutorialError("The first Event is already recorded.", 409, "FIRST_EVENT_RECORDED");
      }
      const event = await tx.event.findFirst({ where: { id: body.firstEventId, ownerId: userId }, select: { id: true } });
      if (!event) throw new OnboardingTutorialError("Event not found", 404, "EVENT_NOT_FOUND");
      data.tutorialFirstEventId = event.id;
    }
    if (body.firstFlowerId !== undefined) {
      if (state.tutorialFirstFlowerId && state.tutorialFirstFlowerId !== body.firstFlowerId) {
        throw new OnboardingTutorialError("The first Flower is already recorded.", 409, "FIRST_FLOWER_RECORDED");
      }
      const flower = eventId ? await tx.flower.findFirst({
        where: { id: body.firstFlowerId, userId, sourceEventId: eventId }, select: { id: true }
      }) : null;
      if (!flower) throw new OnboardingTutorialError("Flower not found", 404, "FLOWER_NOT_FOUND");
      data.tutorialFirstFlowerId = flower.id;
    }
    const flowerId = data.tutorialFirstFlowerId || state.tutorialFirstFlowerId;
    if (body.flowerPlanted) {
      if (!flowerId) throw new OnboardingTutorialError("Grow your first flower before planting it.", 409, "FLOWER_REQUIRED");
      data.tutorialFlowerPlantedAt = state.tutorialFlowerPlantedAt || now;
    }
    const planted = Boolean(state.tutorialFlowerPlantedAt || data.tutorialFlowerPlantedAt);
    // An Event that grew no Flower (the daily flower limit) still lets the tour go on.
    const plantingSettled = async () => planted || (eventId && !flowerId &&
      !(await tx.flower.findFirst({ where: { userId, sourceEventId: eventId }, select: { id: true } })));

    const requireReached = async (target) => {
      if (order(target) > order("intro.name") && !named) {
        throw new OnboardingTutorialError("Name your fairy first.", 409, "FAIRY_NAME_REQUIRED");
      }
      if (order(target) > order("event.save") && !eventId) {
        throw new OnboardingTutorialError("Save your first Event first.", 409, "FIRST_EVENT_REQUIRED");
      }
      if (order(target) > order("plant.place") && !(await plantingSettled())) {
        throw new OnboardingTutorialError("Plant your first flower first.", 409, "FIRST_FLOWER_REQUIRED");
      }
    };

    if (body.step !== undefined && order(body.step) > order(current)) {
      await requireReached(body.step);
      data.tutorialStep = body.step;
    }
    if (body.complete) {
      const reached = data.tutorialStep || current;
      if (order(reached) < order("finale")) {
        throw new OnboardingTutorialError("Finish the tour first.", 409, "TOUR_UNFINISHED");
      }
      await requireReached("done");
      Object.assign(data, {
        tutorialStep: "done", tutorialCompletedAt: now,
        // The tour includes the first flower, so the Garden unlocks as it always has.
        onboardingCompleted: true, onboardingStep: "GARDEN_UNLOCKED"
      });
    }
    const saved = Object.keys(data).length
      ? await tx.fairyState.update({ where: { userId }, data, select: TUTORIAL_SELECT })
      : state;
    return view(saved, await starterName(tx, userId));
  });
}
