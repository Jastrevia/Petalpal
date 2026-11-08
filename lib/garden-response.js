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
    regionId: flower.regionId,
    worldX: flower.worldX,
    worldY: flower.worldY,
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

/** An Event's flower its owner has not planted yet (no Garden spot). */
export const awaitsPlanting = (flower) => Boolean(flower.sourceEventId) && (flower.worldX === null || flower.worldX === undefined);
const socialGardenFlower = (flower) => ({
  ...toSocialFlower(flower),
  ...(flower.supportState ? { supportState: flower.supportState } : {})
});

export function serializeGardenResponse({ owner, garden, activeVisitors, includePrivate }) {
  return {
    owner: {
      id: owner.id,
      name: owner.name,
      avatar: owner.avatar
    },
    // An Event's flower joins the Garden only once its owner plants it (a spot on the server). Until
    // then the owner's Garden does not draw it, so a visitor never sees it at a made-up spot either.
    flowers: includePrivate ? garden.flowers : garden.flowers.filter(flower => !awaitsPlanting(flower)).map(socialGardenFlower),
    visitRecords: garden.visitRecords,
    activeVisitors
  };
}
