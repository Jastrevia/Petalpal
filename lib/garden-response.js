import { plantedSpot, plantedSpotFields } from "./flower-placement.js";

export function toSocialMessage(message) {
  return {
    id: message.id,
    author: message.author,
    authorUserId: message.userId,
    text: message.text,
    createdAt: message.createdAt
  };
}

export function toSocialFlower(flower) {
  return {
    id: flower.id,
    mood: flower.mood,
    speciesCode: flower.speciesCode,
    colorAccent: flower.colorAccent,
    name: flower.name,
    meaning: flower.meaning,
    img: flower.img,
    left: flower.left,
    top: flower.top,
    // The persisted spot, exactly as the owner's Garden reads it (lib/flower-placement.js).
    ...plantedSpotFields(flower),
    slotId: flower.slotId,
    scale: flower.scale,
    rotation: flower.rotation,
    layer: flower.layer,
    layoutVersion: flower.layoutVersion,
    supportCount: flower.supportCount,
    variant: flower.variant,
    rarity: flower.rarity,
    growthState: flower.growthState,
    visualEffect: flower.visualEffect,
    season: flower.season,
    createdAt: flower.createdAt,
    messages: (flower.messages || []).map(toSocialMessage)
  };
}

export function serializeGardenResponse({ owner, garden, activeVisitors, includePrivate }) {
  return {
    owner: {
      id: owner.id,
      name: owner.name,
      avatar: owner.avatar
    },
    // Visitors get planted flowers only: an Event flower that has not been planted with Plant
    // (no persisted spot) is not in the Garden yet and never reaches a friend.
    flowers: includePrivate
      ? garden.flowers.map((flower) => ({ ...flower, ...plantedSpotFields(flower) }))
      : garden.flowers.filter((flower) => plantedSpot(flower)).map((flower) => ({
        ...toSocialFlower(flower),
        ...(flower.supportState ? { supportState: flower.supportState } : {})
      })),
    visitRecords: garden.visitRecords,
    activeVisitors
  };
}
