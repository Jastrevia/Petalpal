// Pet homes (time.md): each Garden pet has a bed the owner places, goes in to sleep at night and comes
// out in the morning, by the owner's local clock (User.timezone). Bedtimes are staggered a few minutes
// per pet so they do not all disappear at once. The app animates going in / coming out at the
// returned instants; the server only says who is asleep and when that changes.
import { localDateForInstant, localTimeToUtc, normalizeIanaTimezone } from "./ai-periods.js";
import { GARDEN_WORLD } from "./flower-placement.js";
import { GARDEN_PETS } from "./garden-pets.js";

export const PET_SLEEP = Object.freeze({ bedtime: 21 * 60 + 30, wake: 7 * 60, staggerMinutes: 12 });

export class PetHomeError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// One pet's state at `now`: ASLEEP or AWAKE, and the UTC instant of the next change.
export function petSleepState(petId, now, timezone) {
  const index = GARDEN_PETS.indexOf(petId);
  if (index < 0) throw new PetHomeError("Unknown pet", 404, "PET_NOT_FOUND");
  const zone = normalizeIanaTimezone(timezone) || "UTC";
  const today = localDateForInstant(now, zone);
  const offset = index * PET_SLEEP.staggerMinutes;
  const wake = localTimeToUtc(today, PET_SLEEP.wake + offset, zone);
  const bed = localTimeToUtc(today, PET_SLEEP.bedtime + offset, zone);
  if (now < wake) return { state: "ASLEEP", nextChangeAt: wake };
  if (now < bed) return { state: "AWAKE", nextChangeAt: bed };
  return { state: "ASLEEP", nextChangeAt: localTimeToUtc(today, PET_SLEEP.wake + offset + 1440, zone) };
}

export async function petHomesFor(db, userId, { now = new Date() } = {}) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new PetHomeError("User not found", 404, "USER_NOT_FOUND");
  const rows = await db.gardenPetOutfit.findMany({ where: { userId }, select: { petId: true, homeX: true, homeY: true } });
  return {
    pets: GARDEN_PETS.map(petId => {
      const row = rows.find(item => item.petId === petId);
      const { state, nextChangeAt } = petSleepState(petId, now, user.timezone);
      return { petId, state, nextChangeAt: nextChangeAt.toISOString(),
        home: row?.homeX != null && row?.homeY != null ? { worldX: row.homeX, worldY: row.homeY } : null };
    }),
    world: GARDEN_WORLD
  };
}

// Places (or with { home: null } removes) one pet's bed.
export async function placePetHome(db, userId, petId, body, { now = new Date() } = {}) {
  if (!GARDEN_PETS.includes(petId)) throw new PetHomeError("Unknown pet", 404, "PET_NOT_FOUND");
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !Object.hasOwn(body, "home")) {
    throw new PetHomeError("Send { home: { worldX, worldY } } or { home: null }", 400, "PET_HOME_INVALID");
  }
  let homeX = null, homeY = null;
  if (body.home !== null) {
    const { worldX, worldY } = body.home ?? {};
    if (typeof body.home !== "object" || Object.keys(body.home).some(key => !["worldX", "worldY"].includes(key)) ||
        !Number.isFinite(worldX) || !Number.isFinite(worldY) || worldX < 0 || worldX >= GARDEN_WORLD.width || worldY < 0 || worldY >= GARDEN_WORLD.height) {
      throw new PetHomeError("The bed must be inside the Garden", 400, "PET_HOME_INVALID");
    }
    homeX = Math.round(worldX * 10) / 10; homeY = Math.round(worldY * 10) / 10;
  }
  await db.gardenPetOutfit.upsert({ where: { userId_petId: { userId, petId } }, update: { homeX, homeY }, create: { userId, petId, homeX, homeY } });
  return petHomesFor(db, userId, { now });
}
