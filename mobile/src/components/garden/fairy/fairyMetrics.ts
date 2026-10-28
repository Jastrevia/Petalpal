// Visible alpha silhouette (alpha > .5) measured on approved source PNGs.
// Excludes transparent padding. Keep sprite size and decision height in sync.
export const WALK_SPRITE_HEIGHT=153.6;
// Her standing pose (walk_04); the walking frames keep the same canvas and height.
export const walkVisualHeight=()=>WALK_SPRITE_HEIGHT*1236/1536;
export const FLY_VISUAL_HEIGHT=150*1352/1448;
export const SEATED_VISUAL_HEIGHT=((1287/1402-.59)*470*1.55+(.59-134/1402)*470)*.3;
