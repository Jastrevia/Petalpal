// Where the Garden's zoom row sits: above the bottom dock (GardenHud: insets.bottom + 8 on phones,
// + 24 on tablets, plus the dock's own height) and never lower than the old 90 points. GardenScene places
// the row with it and GardenRefreshButton stacks above the row with it, so the two never overlap.
export const GARDEN_ZOOM_ROW_HEIGHT = 40;
export const isDockPhone = (width: number, height: number) => width < 600 || (width < 900 && height < 500);
export const gardenZoomBottom = (width: number, height: number, insetBottom: number) =>
  Math.max(90, insetBottom + (isDockPhone(width, height) ? 84 : 114));
