import { useMemo } from 'react';
import { BlendMode, Circle, ColorMatrix, Group, Image, Path, Rect, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  MONTH_REGION_METAS,
} from './plantingRegionData';
import {
  MonthRegionCalibration,
  PLANTING_REGION_CALIBRATION,
  getCalibratedCentroid,
  getLandGeometry,
  getParentLand,
} from './plantingRegionCalibration';
import { GARDEN_LANDS, type GardenLandLayout } from '../gardenMapLayout';
import {
  MaskStroke,
  MaskTool,
  type MaskOffset,
  getMaskRefinementOffset,
  getMonthMaskRefinement,
} from './plantingMaskRefinement';
import { APPROVED_MASK_CALIBRATION, APPROVED_MASK_REFINEMENTS } from './approvedPlantingMasks';


const NORMAL_MONTH_IMAGES: Record<number, any> = {
  1: require('@/assets/garden/planting/months/month-01.png'),
  2: require('@/assets/garden/planting/months/month-02.png'),
  3: require('@/assets/garden/planting/months/month-03.png'),
  4: require('@/assets/garden/planting/months/month-04.png'),
  5: require('@/assets/garden/planting/months/month-05.png'),
  6: require('@/assets/garden/planting/months/month-06.png'),
  7: require('@/assets/garden/planting/months/month-07.png'),
  8: require('@/assets/garden/planting/months/month-08.png'),
  9: require('@/assets/garden/planting/months/month-09.png'),
  10: require('@/assets/garden/planting/months/month-10.png'),
  11: require('@/assets/garden/planting/months/month-11.png'),
  12: require('@/assets/garden/planting/months/month-12.png'),
};

const DEBUG_MONTH_IMAGES: Record<number, any> = {
  1: require('@/assets/garden/planting/months/month-debug-01.png'),
  2: require('@/assets/garden/planting/months/month-debug-02.png'),
  3: require('@/assets/garden/planting/months/month-debug-03.png'),
  4: require('@/assets/garden/planting/months/month-debug-04.png'),
  5: require('@/assets/garden/planting/months/month-debug-05.png'),
  6: require('@/assets/garden/planting/months/month-debug-06.png'),
  7: require('@/assets/garden/planting/months/month-debug-07.png'),
  8: require('@/assets/garden/planting/months/month-debug-08.png'),
  9: require('@/assets/garden/planting/months/month-debug-09.png'),
  10: require('@/assets/garden/planting/months/month-debug-10.png'),
  11: require('@/assets/garden/planting/months/month-debug-11.png'),
  12: require('@/assets/garden/planting/months/month-debug-12.png'),
};


// The locked PNGs use alpha 160 for their interiors. Restore coverage before
// editing, otherwise opaque additions look darker and expose the brush geometry.
// Keep the original antialiased boundary; do not threshold or smooth painted area.
const BASE_COVERAGE_MATRIX = [
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 255 / 160, 0,
];

function renderStrokeInLand(
  stroke: MaskStroke,
  landX: number,
  landY: number,
  color: string,
  opacity: number,
  blendMode?: 'clear' | 'srcOver' | 'srcIn',
  keyPrefix = ''
) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return null;
  if (pts.length === 1) {
    return <Circle key={`${keyPrefix}${stroke.id}`} cx={landX + pts[0].x}
      cy={landY + pts[0].y} r={stroke.radius} color={color}
      opacity={opacity} blendMode={blendMode} />;
  }
  let d = `M ${landX + pts[0].x} ${landY + pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${landX + pts[i].x} ${landY + pts[i].y}`;
  }

  return (
    <Path
      key={`${keyPrefix}${stroke.id}`}
      path={d}
      style="stroke"
      strokeWidth={stroke.radius * 2}
      strokeCap="round"
      strokeJoin="round"
      color={color}
      opacity={opacity}
      blendMode={blendMode}
    />
  );
}

function CalibratedMonthRegion({
  month,
  isCalibrating,
  isSelected,
  cal: requestedCalibration,
  layout,
  opacity,
  showLandBounds,
  isPaintingMask,
  paintingMonth,
  activeStrokes,
  activeOffset,
  brushCursor,
  showBaseMask = false,
  showAdditions = false,
  showErasures = false,
  showFinalMask = true,
  screenScale,
  gardenTone = false,
}: {
  month: number;
  isCalibrating: boolean;
  isSelected: boolean;
  cal: MonthRegionCalibration;
  layout?: GardenLandLayout;
  opacity: number;
  showLandBounds: boolean;
  isPaintingMask?: boolean;
  paintingMonth?: number;
  activeStrokes?: MaskStroke[];
  activeOffset?: MaskOffset;
  brushCursor?: { lx: number; ly: number; radius: number; tool: MaskTool } | null;
  showBaseMask?: boolean;
  showAdditions?: boolean;
  showErasures?: boolean;
  showFinalMask?: boolean;
  screenScale?: SharedValue<number>;
  /** The owner's planting bed: a warm gold wash with a bright gold edge instead of the cyan editor tint, strong
   *  enough to read as gold over the night Garden's dark lawns too. */
  gardenTone?: boolean;
}) {
  const cal = isCalibrating ? requestedCalibration : APPROVED_MASK_CALIBRATION[month];
  const imgSrc =
    isCalibrating && !isPaintingMask
      ? DEBUG_MONTH_IMAGES[month]
      : NORMAL_MONTH_IMAGES[month];
  const meta = MONTH_REGION_METAS[month];
  const image = useImage(imgSrc);
  const isThisMonthPainting = isPaintingMask && paintingMonth === month;
  const fillPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setColorFilter(Skia.ColorFilter.MakeBlend(
      Skia.Color(gardenTone ? '#F5D27A' : isThisMonthPainting ? '#00DDEB' : '#06B6D4'), BlendMode.SrcIn
    ));
    // Keep the original baseline overlay strength outside the manual editor.
    paint.setAlphaf(gardenTone ? 0.3 : isThisMonthPainting ? opacity : opacity * 0.9 * (160 / 255));
    return paint;
  }, [isThisMonthPainting, opacity, gardenTone]);
  const outlinePaint = useDerivedValue(() => {
    const paint = Skia.Paint();
    // Subtract an eroded COPY from the completed coverage to get an inner ring.
    // Erosion affects the outline only, never the mask or planting rules.
    const radius = (gardenTone ? 4 : 2.5) / Math.max(screenScale?.value ?? 1, 0.001);
    paint.setImageFilter(Skia.ImageFilter.MakeBlend(
      BlendMode.DstOut,
      Skia.ImageFilter.MakeOffset(0, 0),
      Skia.ImageFilter.MakeErode(radius, radius)
    ));
    paint.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(gardenTone ? '#FFD66B' : '#006B78'), BlendMode.SrcIn));
    paint.setAlphaf(gardenTone ? 0.92 : 0.95);
    return paint;
  }, [screenScale, gardenTone]);
  if (!image || !meta) return null;

  const land = getParentLand(cal.parentLandAsset, layout);
  const { width: landWidth, height: landHeight, centerX: landCenterX, centerY: landCenterY } = getLandGeometry(land);

  const W = meta.bbox.width;
  const H = meta.bbox.height;
  const regCenterX = land.x + cal.localX + W / 2;
  const regCenterY = land.y + cal.localY + H / 2;

  const centroid = getCalibratedCentroid(month, { [month]: cal }, layout);

  // Determine strokes to render for this month
  const saved = isCalibrating ? getMonthMaskRefinement(month) : APPROVED_MASK_REFINEMENTS[month];
  const strokesToRender = isThisMonthPainting && activeStrokes ? activeStrokes : saved?.strokes ?? [];
  const offset = getMaskRefinementOffset(isThisMonthPainting ? activeOffset : saved);

  const addStrokes = strokesToRender.filter((s) => s.tool === 'add');
  const eraseStrokes = strokesToRender.filter((s) => s.tool === 'remove');

  // One opaque coverage surface: locked baseline, then each operation in order.
  // Stroke paths are mask inputs only; tint/opacity and outline apply after union.
  const finalCoverage = (
    <Group>
      <Group layer={true}>
        <Group transform={[
          { translateX: regCenterX }, { translateY: regCenterY },
          { rotate: (cal.rotation * Math.PI) / 180 },
          { scaleX: cal.scaleX || 1.0 }, { scaleY: cal.scaleY || 1.0 },
          { translateX: -regCenterX }, { translateY: -regCenterY },
        ]}>
          <Image image={image} x={land.x + cal.localX} y={land.y + cal.localY}
            width={W} height={H}>
            <ColorMatrix matrix={BASE_COVERAGE_MATRIX} />
          </Image>
        </Group>
      </Group>
      {strokesToRender.map((stroke) => renderStrokeInLand(
        stroke, land.x, land.y, '#FFFFFF', 1,
        stroke.tool === 'add' ? 'srcOver' : 'clear', 'final-'
      ))}
    </Group>
  );

  return (
    <Group>
      <Group
        transform={[
          { translateX: landCenterX },
          { translateY: landCenterY },
          { rotate: (land.rotation * Math.PI) / 180 },
          { translateX: -landCenterX },
          { translateY: -landCenterY },
        ]}
      >
        {/* A refinement translation wraps the complete mask in parent-land space. */}
        <Group transform={[{ translateX: offset.offsetX }, { translateY: offset.offsetY }]}>
        {/* 1. Display only the completed alpha silhouette. */}
        {showFinalMask && (
          <Group>
            <Group layer={fillPaint}>{finalCoverage}</Group>
            {(isThisMonthPainting || gardenTone) && (
              <Group layer={outlinePaint}>{finalCoverage}</Group>
            )}
          </Group>
        )}

        {/* 2. Optional Diagnostic Overlay: Base Mask in Yellow */}
        {isThisMonthPainting && showBaseMask && (
          <Group layer={true} opacity={opacity * 0.85}>
            <Group
              transform={[
                { translateX: regCenterX },
                { translateY: regCenterY },
                { rotate: (cal.rotation * Math.PI) / 180 },
                { scaleX: cal.scaleX || 1.0 },
                { scaleY: cal.scaleY || 1.0 },
                { translateX: -regCenterX },
                { translateY: -regCenterY },
              ]}
            >
              <Image
                image={image}
                x={land.x + cal.localX}
                y={land.y + cal.localY}
                width={W}
                height={H}
              />
              <Rect
                x={land.x + cal.localX}
                y={land.y + cal.localY}
                width={W}
                height={H}
                color="#FACC15"
                blendMode="srcIn"
              />
            </Group>
          </Group>
        )}

        {/* 3. Optional Diagnostic Overlay: Additions in Green */}
        {isThisMonthPainting &&
          showAdditions &&
          addStrokes.map((s) =>
            renderStrokeInLand(s, land.x, land.y, '#10B981', opacity * 0.9, 'srcOver', 'add-')
          )}

        {/* 4. Optional Diagnostic Overlay: Erasures in Red (OFF by default) */}
        {isThisMonthPainting &&
          showErasures &&
          eraseStrokes.map((s) =>
            renderStrokeInLand(s, land.x, land.y, '#EF4444', 0.65, 'srcOver', 'erase-')
          )}

        {/* 5. Transform Calibration Selection Box (Stage 1 only) */}
        {isCalibrating && isSelected && !isPaintingMask && (
          <Group
            transform={[
              { translateX: regCenterX },
              { translateY: regCenterY },
              { rotate: (cal.rotation * Math.PI) / 180 },
              { scaleX: cal.scaleX || 1.0 },
              { scaleY: cal.scaleY || 1.0 },
              { translateX: -regCenterX },
              { translateY: -regCenterY },
            ]}
          >
            <Rect
              x={land.x + cal.localX}
              y={land.y + cal.localY}
              width={W}
              height={H}
              color="#FFFFFFAA"
              style="stroke"
              strokeWidth={3}
            />
          </Group>
        )}

        {/* 6. Active Brush Cursor in Paint Mode */}
        {isThisMonthPainting && brushCursor && (
          <Group>
            <Circle
              cx={land.x + brushCursor.lx}
              cy={land.y + brushCursor.ly}
              r={brushCursor.radius}
              style="stroke"
              strokeWidth={2}
              color={brushCursor.tool === 'add' ? '#10B981' : '#FFFFFF'}
            />
            <Circle
              cx={land.x + brushCursor.lx}
              cy={land.y + brushCursor.ly}
              r={2}
              color={brushCursor.tool === 'add' ? '#10B981' : '#FFFFFF'}
            />
          </Group>
        )}

        </Group>

        {/* 7. Land Outline Border */}
        {isCalibrating && isSelected && showLandBounds && (
          <Rect
            x={land.x}
            y={land.y}
            width={landWidth}
            height={landHeight}
            color="#FFD700CC"
            style="stroke"
            strokeWidth={4}
          />
        )}
      </Group>

      {/* Centroid Marker in Transform Calibration Mode */}
      {isCalibrating && !isPaintingMask && (
        <Group>
          <Circle
            cx={centroid.x}
            cy={centroid.y}
            r={isSelected ? 16 : 10}
            color={isSelected ? '#FFFFFF' : '#172219CC'}
          />
          <Circle
            cx={centroid.x}
            cy={centroid.y}
            r={isSelected ? 12 : 7}
            color={isSelected ? '#E63946' : '#457B9D'}
          />
        </Group>
      )}
    </Group>
  );
}

export interface PlantingRegionOverlayProps {
  screenScale?: SharedValue<number>;
  showAllRegions?: boolean;
  highlightedMonth?: number | null;
  // Calibration DEV mode props
  isCalibrating?: boolean;
  calibrationMap?: Record<number, MonthRegionCalibration>;
  selectedMonth?: number;
  displayMode?: 'selected' | 'all';
  opacity?: number;
  showLandBounds?: boolean;
  layout?: GardenLandLayout;
  // Manual Mask Painting Props
  isPaintingMask?: boolean;
  paintingMonth?: number;
  activeStrokes?: MaskStroke[];
  activeOffset?: MaskOffset;
  brushCursor?: { lx: number; ly: number; radius: number; tool: MaskTool } | null;
  showBaseMask?: boolean;
  showAdditions?: boolean;
  showErasures?: boolean;
  showFinalMask?: boolean;
}

export default function PlantingRegionOverlay({
  showAllRegions = false,
  highlightedMonth = null,
  isCalibrating = false,
  calibrationMap,
  selectedMonth = 1,
  displayMode = 'all',
  opacity = 0.5,
  showLandBounds = true,
  layout = GARDEN_LANDS,
  isPaintingMask = false,
  paintingMonth = 1,
  activeStrokes,
  activeOffset,
  brushCursor,
  showBaseMask = false,
  showAdditions = false,
  showErasures = false,
  showFinalMask = true,
  screenScale,
}: PlantingRegionOverlayProps) {
  const currentCalibrationMap = calibrationMap || PLANTING_REGION_CALIBRATION;

  // 1. Manual Mask Painting Active
  if (isPaintingMask) {
    return (
      <Group>
        <CalibratedMonthRegion
          key={paintingMonth}
          month={paintingMonth}
          isCalibrating={true}
          isSelected={true}
          cal={currentCalibrationMap[paintingMonth] || PLANTING_REGION_CALIBRATION[paintingMonth]}
          layout={layout}
          opacity={opacity}
          showLandBounds={showLandBounds}
          isPaintingMask={true}
          paintingMonth={paintingMonth}
          activeStrokes={activeStrokes}
          activeOffset={activeOffset}
          brushCursor={brushCursor}
          showBaseMask={showBaseMask}
          showAdditions={showAdditions}
          showErasures={showErasures}
          showFinalMask={showFinalMask}
          screenScale={screenScale}
        />
      </Group>
    );
  }

  // 2. Calibration DEV mode active
  if (isCalibrating) {
    const monthsToRender =
      displayMode === 'selected' ? [selectedMonth] : Array.from({ length: 12 }, (_, i) => i + 1);

    return (
      <Group>
        {monthsToRender.map((m) => (
          <CalibratedMonthRegion
            key={m}
            month={m}
            isCalibrating={true}
            isSelected={m === selectedMonth}
            cal={currentCalibrationMap[m] || PLANTING_REGION_CALIBRATION[m]}
            layout={layout}
            opacity={opacity}
            showLandBounds={showLandBounds}
          />
        ))}
      </Group>
    );
  }

  // 3. Normal Planting Mode: only the active flower's month region is highlighted
  if (highlightedMonth && highlightedMonth >= 1 && highlightedMonth <= 12) {
    return (
      <Group>
        <CalibratedMonthRegion
          month={highlightedMonth}
          isCalibrating={false}
          isSelected={false}
          cal={currentCalibrationMap[highlightedMonth] || PLANTING_REGION_CALIBRATION[highlightedMonth]}
          layout={layout}
          opacity={0.8}
          showLandBounds={false}
          screenScale={screenScale}
          gardenTone
        />
      </Group>
    );
  }

  // 4. DEV showAllRegions toggle
  if (showAllRegions) {
    return (
      <Group>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <CalibratedMonthRegion
            key={m}
            month={m}
            isCalibrating={false}
            isSelected={false}
            cal={currentCalibrationMap[m] || PLANTING_REGION_CALIBRATION[m]}
            layout={layout}
            opacity={0.65}
            showLandBounds={false}
          />
        ))}
      </Group>
    );
  }

  return null;
}
