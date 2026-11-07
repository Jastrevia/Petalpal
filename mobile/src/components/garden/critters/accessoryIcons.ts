// The wardrobe's painted icons, one per catalog piece (lib/garden-pets.js), by accessory id.
export const ACCESSORY_ICONS: Record<string, number> = {
  'bell-bow': require('@/assets/garden/pets/accessories/bell-bow.webp'),
  'blossom-wreath': require('@/assets/garden/pets/accessories/blossom-wreath.webp'),
  'compass-star': require('@/assets/garden/pets/accessories/compass-star.webp'),
  'cream-ruffle': require('@/assets/garden/pets/accessories/cream-ruffle.webp'),
  'crescent-bloom': require('@/assets/garden/pets/accessories/crescent-bloom.webp'),
  'crescent-crystal': require('@/assets/garden/pets/accessories/crescent-crystal.webp'),
  'crystal-drop': require('@/assets/garden/pets/accessories/crystal-drop.webp'),
  'crystal-spire': require('@/assets/garden/pets/accessories/crystal-spire.webp'),
  'flower-sprig': require('@/assets/garden/pets/accessories/flower-sprig.webp'),
  'gilded-feather': require('@/assets/garden/pets/accessories/gilded-feather.webp'),
  'gilded-tome': require('@/assets/garden/pets/accessories/gilded-tome.webp'),
  'gilded-wing-collar': require('@/assets/garden/pets/accessories/gilded-wing-collar.webp'),
  'glow-lantern': require('@/assets/garden/pets/accessories/glow-lantern.webp'),
  'golden-circlet': require('@/assets/garden/pets/accessories/golden-circlet.webp'),
  'hourglass': require('@/assets/garden/pets/accessories/hourglass.webp'),
  'laurel-crown': require('@/assets/garden/pets/accessories/laurel-crown.webp'),
  'lilac-beret': require('@/assets/garden/pets/accessories/lilac-beret.webp'),
  'lilac-cape': require('@/assets/garden/pets/accessories/lilac-cape.webp'),
  'lilac-clover': require('@/assets/garden/pets/accessories/lilac-clover.webp'),
  'little-spellbook': require('@/assets/garden/pets/accessories/little-spellbook.webp'),
  'midnight-cape': require('@/assets/garden/pets/accessories/midnight-cape.webp'),
  'midnight-hood': require('@/assets/garden/pets/accessories/midnight-hood.webp'),
  'noble-lantern': require('@/assets/garden/pets/accessories/noble-lantern.webp'),
  'petal-capelet': require('@/assets/garden/pets/accessories/petal-capelet.webp'),
  'sage-bonnet': require('@/assets/garden/pets/accessories/sage-bonnet.webp'),
  'sage-capelet': require('@/assets/garden/pets/accessories/sage-capelet.webp'),
  'sealed-letter': require('@/assets/garden/pets/accessories/sealed-letter.webp'),
  'star-capelet': require('@/assets/garden/pets/accessories/star-capelet.webp'),
  'star-mantle': require('@/assets/garden/pets/accessories/star-mantle.webp'),
  'starlit-plume-cap': require('@/assets/garden/pets/accessories/starlit-plume-cap.webp'),
  'straw-sun-hat': require('@/assets/garden/pets/accessories/straw-sun-hat.webp'),
  'voyager-goggles': require('@/assets/garden/pets/accessories/voyager-goggles.webp'),
};
// A pet's own pieces (petRing.ts PET_OWN_PIECES), per pet, per catalog id: cut from the owner's
// design sheets (the golden puppy's "Refined" and "Noble" Garden Companions sheets, Xiaobai's "Little
// White Dog" light and Noble sheets; 2026-11-06, oil-motion onto green, keyed, 384 px), so the
// Collection and the closet show each piece as the sheet paints it.
export const OWN_PIECE_ICONS: Record<string, Record<string, number>> = {
  puppy: {
    'flower-sprig': require('@/assets/garden/pets/wardrobe/puppy-flower-sprig.webp'),
    'golden-circlet': require('@/assets/garden/pets/wardrobe/puppy-golden-circlet.webp'),
    'petal-capelet': require('@/assets/garden/pets/wardrobe/puppy-petal-capelet.webp'),
    'midnight-cape': require('@/assets/garden/pets/wardrobe/puppy-midnight-cape.webp'),
    'crystal-drop': require('@/assets/garden/pets/wardrobe/puppy-crystal-drop.webp'),
    'crystal-spire': require('@/assets/garden/pets/wardrobe/puppy-crystal-spire.webp'),
  },
  maltese: {
    'flower-sprig': require('@/assets/garden/pets/wardrobe/maltese-flower-clip.webp'),
    'petal-capelet': require('@/assets/garden/pets/wardrobe/maltese-capelet.webp'),
    'crystal-drop': require('@/assets/garden/pets/wardrobe/maltese-bow.webp'),
    'golden-circlet': require('@/assets/garden/pets/wardrobe/maltese-noble-headpiece.webp'),
    'midnight-cape': require('@/assets/garden/pets/wardrobe/maltese-noble-capelet.webp'),
    'crystal-spire': require('@/assets/garden/pets/wardrobe/maltese-noble-pendant.webp'),
  },
};
