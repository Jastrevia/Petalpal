import type { PetOutfit } from '@/services/gardenPets';

// The puppy, bare or dressed: one painted walk per look (scripts/critters/video-frames.py, all
// cut with crop 200,30,920,660 into 418 × 300 cells, so every look is the same dog, same size).
// The puppy has two sets of its own, three pieces each: a headpiece (hat row), a crystal pendant
// (pendant row) and a cape (collar row); set 2 is the flower sprig, petal capelet and crystal
// drop (PUPPY_SET_2), set 1 every other piece. A cape carries its own crystal clasp, so a pendant
// only shows without a cape, as a necklace. Hats and necklaces are painted onto the bare walking
// clip, each set's cape looks onto that cape's clip: putting a hat on or off never changes the gait. Each look also gallops (`run`, chasing the bluebird) and
// sits down where it caught up (`rest`, from a run-to-sit clip that starts on the gallop's first
// frame), painted the same way. `loop` is in Garden units (cell pixels × 113 / 418).
export type PuppyLook = 'bare' | 'hat' | 'necklace' | 'hat-necklace' | 'cape' | 'cape-hat'
  | 'hat2' | 'necklace2' | 'hat-necklace2' | 'cape2' | 'cape2-hat';
export type Clip = 'walk' | 'cape' | 'cape2';
export type LookFrames = { source: number; clip: Clip; columns: number; count: number; ground: number; loop: number;
  run: { source: number; columns: number; count: number; loop: number }; rest: { source: number; count: number; rise: number } };
const BARE_CLIP = { clip: 'walk' as const, columns: 6, count: 33, ground: 279, loop: 123.7 };
const CAPE_CLIP = { clip: 'cape' as const, columns: 5, count: 15, ground: 280, loop: 43.3 };
// The rest sheets share their walk's columns (GardenCritters draws them with the walk's grid).
const bareMoves = (run: number, sit: number) => ({ run: { source: run, columns: 5, count: 25, loop: 178.2 }, rest: { source: sit, count: 16, rise: 1 } });
const capeMoves = (run: number, sit: number) => ({ run: { source: run, columns: 5, count: 15, loop: 68.2 }, rest: { source: sit, count: 12, rise: 1 } });
// The petal cape's walk measures 24.3 units a stride, short for the puppy's pace (its legs would
// step half again too fast); 34 steps it at the velvet cape's cadence, at the cost of a little slide.
const CAPE2_CLIP = { clip: 'cape2' as const, columns: 4, count: 12, ground: 277, loop: 34 };
const cape2Moves = (run: number, sit: number) => ({ run: { source: run, columns: 5, count: 14, loop: 79.1 }, rest: { source: sit, count: 12, rise: 1 } });
// For each frame of one clip, the frame of another whose legs are closest (compared on the leg
// silhouettes), so a change between the clips carries on in the same step.
export const MATCHING_FRAME: Record<Clip, Partial<Record<Clip, readonly number[]>>> = {
  walk: {
    cape: [9, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 6, 7, 1, 2, 3, 4, 5, 6, 8, 9, 11, 4, 5, 6, 7, 8, 9, 11, 12, 5, 6, 8],
    cape2: [4, 10, 11, 1, 1, 3, 9, 10, 10, 11, 1, 2, 3, 3, 4, 5, 0, 1, 2, 3, 10, 11, 11, 1, 2, 3, 9, 10, 10, 11, 1, 2, 3],
  },
  cape: {
    walk: [12, 13, 14, 15, 22, 23, 4, 5, 6, 7, 8, 28, 29, 10, 11],
    cape2: [3, 3, 4, 6, 6, 1, 2, 3, 3, 4, 10, 11, 11, 8, 2],
  },
  cape2: {
    walk: [3, 30, 31, 12, 1, 15, 15, 23, 10, 25, 1, 9],
    cape: [3, 5, 6, 7, 2, 3, 3, 5, 6, 8, 10, 11],
  },
};
export const PUPPY_LOOKS: Record<PuppyLook, LookFrames> = {
  bare: { source: require('@/assets/garden/critters/puppy-looks/walk-bare.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-bare.webp'), require('@/assets/garden/critters/puppy-looks/sit-bare.webp')) },
  hat: { source: require('@/assets/garden/critters/puppy-looks/walk-hat.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-hat.webp'), require('@/assets/garden/critters/puppy-looks/sit-hat.webp')) },
  necklace: { source: require('@/assets/garden/critters/puppy-looks/walk-necklace.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-necklace.webp'), require('@/assets/garden/critters/puppy-looks/sit-necklace.webp')) },
  'hat-necklace': { source: require('@/assets/garden/critters/puppy-looks/walk-hat-necklace.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-hat-necklace.webp'), require('@/assets/garden/critters/puppy-looks/sit-hat-necklace.webp')) },
  cape: { source: require('@/assets/garden/critters/puppy-looks/walk-cape.webp'), ...CAPE_CLIP,
    ...capeMoves(require('@/assets/garden/critters/puppy-looks/run-cape.webp'), require('@/assets/garden/critters/puppy-looks/sit-cape.webp')) },
  'cape-hat': { source: require('@/assets/garden/critters/puppy-looks/walk-cape-hat.webp'), ...CAPE_CLIP,
    ...capeMoves(require('@/assets/garden/critters/puppy-looks/run-cape-hat.webp'), require('@/assets/garden/critters/puppy-looks/sit-cape-hat.webp')) },
  hat2: { source: require('@/assets/garden/critters/puppy-looks/walk-hat2.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-hat2.webp'), require('@/assets/garden/critters/puppy-looks/sit-hat2.webp')) },
  necklace2: { source: require('@/assets/garden/critters/puppy-looks/walk-necklace2.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-necklace2.webp'), require('@/assets/garden/critters/puppy-looks/sit-necklace2.webp')) },
  'hat-necklace2': { source: require('@/assets/garden/critters/puppy-looks/walk-hat-necklace2.webp'), ...BARE_CLIP,
    ...bareMoves(require('@/assets/garden/critters/puppy-looks/run-hat-necklace2.webp'), require('@/assets/garden/critters/puppy-looks/sit-hat-necklace2.webp')) },
  cape2: { source: require('@/assets/garden/critters/puppy-looks/walk-cape2.webp'), ...CAPE2_CLIP,
    ...cape2Moves(require('@/assets/garden/critters/puppy-looks/run-cape2.webp'), require('@/assets/garden/critters/puppy-looks/sit-cape2.webp')) },
  'cape2-hat': { source: require('@/assets/garden/critters/puppy-looks/walk-cape2-hat.webp'), ...CAPE2_CLIP,
    ...cape2Moves(require('@/assets/garden/critters/puppy-looks/run-cape2-hat.webp'), require('@/assets/garden/critters/puppy-looks/sit-cape2-hat.webp')) },
};

// Eating and being patted (the ring menu's Feed and Pat), for every look: oil-motion clips
// (minimax h3) of the bare puppy, the velvet cape and the petal cape that start and end on that
// look's sitting frame (sit sheet's last cell), cut from the same video canvas at the same scale
// (300 / 660), so the clip lies exactly over the sitting puppy. Hats and necklaces are laid onto
// those clips frame by frame like the walks (~/dev/petalpal-motion/dressed/actions/build_looks.sh:
// the head followed frame to frame as it dips into the bowl; on the pat clips the hand stays over
// the pieces). Eating brings its own bowl (it fades in and out with the clip); the pat
// clip's cell is wider and taller, for the hand coming in from the top right (its edges fade).
// `anchorX`, `ground`: where the puppy's centre and paws are in a cell (the sit sheets: 209, 277).
export type PuppyAction = 'eat' | 'pat';
export type ActionFrames = { source: number; columns: number; count: number; w: number; h: number; anchorX: number; ground: number };
export const ACTION_FPS = 12;
// (Same cells for every look.)
const actions = (eat: number, pat: number): Record<PuppyAction, ActionFrames> => ({
  eat: { source: eat, columns: 9, count: 71, w: 418, h: 300, anchorX: 209, ground: 277 },
  pat: { source: pat, columns: 7, count: 71, w: 520, h: 314, anchorX: 209, ground: 291 },
});
export const PUPPY_ACTIONS: Record<PuppyLook, Record<PuppyAction, ActionFrames>> = {
  bare: actions(require('@/assets/garden/critters/puppy-looks/eat-bare.webp'), require('@/assets/garden/critters/puppy-looks/pat-bare.webp')),
  hat: actions(require('@/assets/garden/critters/puppy-looks/eat-hat.webp'), require('@/assets/garden/critters/puppy-looks/pat-hat.webp')),
  necklace: actions(require('@/assets/garden/critters/puppy-looks/eat-necklace.webp'), require('@/assets/garden/critters/puppy-looks/pat-necklace.webp')),
  'hat-necklace': actions(require('@/assets/garden/critters/puppy-looks/eat-hat-necklace.webp'), require('@/assets/garden/critters/puppy-looks/pat-hat-necklace.webp')),
  cape: actions(require('@/assets/garden/critters/puppy-looks/eat-cape.webp'), require('@/assets/garden/critters/puppy-looks/pat-cape.webp')),
  'cape-hat': actions(require('@/assets/garden/critters/puppy-looks/eat-cape-hat.webp'), require('@/assets/garden/critters/puppy-looks/pat-cape-hat.webp')),
  hat2: actions(require('@/assets/garden/critters/puppy-looks/eat-hat2.webp'), require('@/assets/garden/critters/puppy-looks/pat-hat2.webp')),
  necklace2: actions(require('@/assets/garden/critters/puppy-looks/eat-necklace2.webp'), require('@/assets/garden/critters/puppy-looks/pat-necklace2.webp')),
  'hat-necklace2': actions(require('@/assets/garden/critters/puppy-looks/eat-hat-necklace2.webp'), require('@/assets/garden/critters/puppy-looks/pat-hat-necklace2.webp')),
  cape2: actions(require('@/assets/garden/critters/puppy-looks/eat-cape2.webp'), require('@/assets/garden/critters/puppy-looks/pat-cape2.webp')),
  'cape2-hat': actions(require('@/assets/garden/critters/puppy-looks/eat-cape2-hat.webp'), require('@/assets/garden/critters/puppy-looks/pat-cape2-hat.webp')),
};
export const actionSeconds = (frames: ActionFrames) => frames.count / ACTION_FPS;

// Xiaobai eats and is patted too, in every look, with the golden's bowl and the golden's hand
// (2026-11-05, Kiro; ~/dev/petalpal-motion/maltese/actions): oil-motion clips that start and end on
// each look's held sitting frame (its sit sheet's last cell), cut at the sit sheets' scale
// (220 / 690). Its own clips for bare, the light capelet, petal and the Noble capelet; the light
// and Noble hats and necklaces are laid onto the bare clips, the light ones onto the capelet's, and
// the whole Noble look's eat and pat are the Noble capelet's with the headpiece laid on, like its
// walk, sit and run (2026-11-06: its own Noble eating clip sat differently from its sit; its own
// pat clips both brought a long lace sleeve, unlike the golden's hand). Cells start 80 video px left of the
// sit cells (the capelets' tails reach past them), eat cells a little taller (the bowl), pat cells
// up to the frame's top and right edge for the hand; `anchorX` is the sit cell's centre in them.
const malteseActions = (eat: number, pat: number): Record<PuppyAction, ActionFrames> => ({
  eat: { source: eat, columns: 8, count: 71, w: 319, h: 230, anchorX: 172, ground: 216 },
  pat: { source: pat, columns: 8, count: 71, w: 393, h: 239, anchorX: 172, ground: 225.6 },
});
export const MALTESE_ACTIONS: Record<MalteseLook, Record<PuppyAction, ActionFrames>> = {
  bare: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-bare.webp'), require('@/assets/garden/critters/maltese-actions/pat-bare.webp')),
  hat: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-hat.webp'), require('@/assets/garden/critters/maltese-actions/pat-hat.webp')),
  necklace: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-necklace.webp'), require('@/assets/garden/critters/maltese-actions/pat-necklace.webp')),
  'hat-necklace': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-hat-necklace.webp'), require('@/assets/garden/critters/maltese-actions/pat-hat-necklace.webp')),
  cape: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-cape.webp'), require('@/assets/garden/critters/maltese-actions/pat-cape.webp')),
  'cape-hat': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-cape-hat.webp'), require('@/assets/garden/critters/maltese-actions/pat-cape-hat.webp')),
  'cape-necklace': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-cape-necklace.webp'), require('@/assets/garden/critters/maltese-actions/pat-cape-necklace.webp')),
  petal: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-petal.webp'), require('@/assets/garden/critters/maltese-actions/pat-petal.webp')),
  'noble-hat': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-noble-hat.webp'), require('@/assets/garden/critters/maltese-actions/pat-noble-hat.webp')),
  'noble-necklace': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-noble-necklace.webp'), require('@/assets/garden/critters/maltese-actions/pat-noble-necklace.webp')),
  'noble-hat-necklace': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-noble-hat-necklace.webp'), require('@/assets/garden/critters/maltese-actions/pat-noble-hat-necklace.webp')),
  'noble-cape': malteseActions(require('@/assets/garden/critters/maltese-actions/eat-noble-cape.webp'), require('@/assets/garden/critters/maltese-actions/pat-noble-cape.webp')),
  noble: malteseActions(require('@/assets/garden/critters/maltese-actions/eat-noble.webp'), require('@/assets/garden/critters/maltese-actions/pat-noble.webp')),
};

// Set 2's pieces (catalog ids, lib/garden-pets.js); every other piece the puppy wears is set 1.
export const PUPPY_SET_2: ReadonlySet<string> = new Set(['flower-sprig', 'petal-capelet', 'crystal-drop']);
const setOf = (id: string | null) => (id ? (PUPPY_SET_2.has(id) ? 2 : 1) : 0);

// The look for an outfit (null: not known, nothing on). Looks are painted one set at a time:
// the cape's set wins, else the hat's, and a piece of the other set is left off.
export function puppyLookOf(outfit: PetOutfit | null): PuppyLook {
  if (!outfit) return 'bare';
  const set = setOf(outfit.collar) || setOf(outfit.hat) || setOf(outfit.pendant);
  if (!set) return 'bare';
  const hat = setOf(outfit.hat) === set, pendant = setOf(outfit.pendant) === set, n = set === 2 ? '2' : '';
  if (outfit.collar) return set === 2 ? (hat ? 'cape2-hat' : 'cape2') : (hat ? 'cape-hat' : 'cape');
  if (pendant) return `${hat ? 'hat-' : ''}necklace${n}` as PuppyLook;
  return hat ? `hat${n}` as PuppyLook : 'bare';
}

// The Maltese's looks (its sheets: MALTESE_LOOKS in GardenCritters.tsx), in its own pieces: a
// flower clip (hat), a pink bow with two charms (necklace) and a lilac capelet fastened by a gold
// clasp (cape); all three on is its petal look. It wears its own outfit (the server keeps one for
// it): malteseLookOfOutfit; on a server from before it had one, the kinds of piece its friend wears.
// Its second set, Noble (the Noble design sheet: lilac flower headpiece with gold beads, deep violet
// capelet with gold embroidery, violet crystal clasp), piece by piece like the first: `noble-hat`,
// `noble-necklace` (the clasp on a fine gold chain), `noble-hat-necklace`, `noble-cape` (the capelet
// carries the clasp, so a pendant under it adds nothing) and `noble` (capelet and headpiece). One set
// is worn at a time, as the puppy wears its sets: the cape's set wins, else the hat's, else the
// pendant's, and a piece of the other set is left off.
export type MalteseLook = 'bare' | 'hat' | 'necklace' | 'hat-necklace' | 'cape' | 'cape-hat' | 'cape-necklace' | 'petal'
  | 'noble-hat' | 'noble-necklace' | 'noble-hat-necklace' | 'noble-cape' | 'noble';
export const MALTESE_NOBLE: ReadonlySet<string> = new Set(['golden-circlet', 'midnight-cape', 'crystal-spire']);
const MALTESE_BY_PIECES: Record<string, MalteseLook> = {
  '': 'bare', h: 'hat', n: 'necklace', hn: 'hat-necklace', c: 'cape', ch: 'cape-hat', cn: 'cape-necklace', chn: 'petal',
};
const NOBLE_BY_PIECES: Record<string, MalteseLook> = {
  '': 'bare', h: 'noble-hat', n: 'noble-necklace', hn: 'noble-hat-necklace', c: 'noble-cape', ch: 'noble', cn: 'noble-cape', chn: 'noble',
};
const malteseLookWith = (cape: boolean, hat: boolean, necklace: boolean, noble = false) =>
  (noble ? NOBLE_BY_PIECES : MALTESE_BY_PIECES)[`${cape ? 'c' : ''}${hat ? 'h' : ''}${necklace ? 'n' : ''}`];
const malteseSetOf = (id: string | null) => (id ? (MALTESE_NOBLE.has(id) ? 2 : 1) : 0);
export function malteseLookOfOutfit(outfit: PetOutfit | null): MalteseLook {
  if (!outfit) return 'bare';
  const set = malteseSetOf(outfit.collar) || malteseSetOf(outfit.hat) || malteseSetOf(outfit.pendant);
  const on = (id: string | null) => !!id && malteseSetOf(id) === set;
  return malteseLookWith(on(outfit.collar), on(outfit.hat), on(outfit.pendant), set === 2);
}
// From a puppy look alone (the preview's chosen look): what it shows (a cape hides its necklace).
export function malteseLookOf(look: PuppyLook): MalteseLook {
  const cape = look.startsWith('cape');
  return malteseLookWith(cape, look.includes('hat'), !cape && look.includes('necklace'));
}
