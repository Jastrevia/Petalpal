import type {SharedValue} from 'react-native-reanimated';
import TeaFairy from './fairy/TeaFairy';
import SleepingMoonFairy from './fairy/SleepingMoonFairy';
import SeatedSwingFairy from './fairy/SeatedSwingFairy';
import {GardenProfile} from './performance/GardenRuntimePanel';
import {runtimeAudit} from './performance/runtimeAudit';
import { Blur, Circle, Group, Oval, Path, Rect } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import MoonBedEntity, { MOON_BED_HEIGHT, MOON_BED_WIDTH } from './MoonBedEntity';
import TeaSetEntity, { TEA_SET_HEIGHT, TEA_SET_WIDTH } from './TeaSetEntity';
import {
  GARDEN_ARCH_HEIGHT, GARDEN_ARCH_WIDTH, GardenArchEntity,
  PAVILION_HEIGHT, PAVILION_WIDTH, PavilionEntity, DogHouseEntity,
} from './StaticLandmarkEntities';
import SwingEntity, { SWING_HEIGHT, SWING_WIDTH } from './SwingEntity';
import { Snowy } from './weather/SnowLayer';
import DogHouseOccupants from './critters/DogHouseOccupants';
import TreehouseEntity, { TREEHOUSE_HEIGHT, TREEHOUSE_WIDTH } from './TreehouseEntity';
import WaterfallEntity, { WATERFALL_HEIGHT, WATERFALL_WIDTH } from './WaterfallEntity';
import { INITIAL_WATERFALL_PLACEMENT, type WaterfallMapPlacement } from './waterfallMapPlacement';
import WaterfallContactFoam from './water/WaterfallContactFoam';
import WaterTopSource from './water/WaterTopSource';
import { type WaterfallVersion } from './waterfallV2Placement';
import { WaterfallSourceEnvironment, WaterfallSourceWaterBase } from './water/WaterfallSourceWaterLayer';
import WaterTopAssembly, { useWaterTopFlow, type TopWaterMotionMode } from './water/WaterTopAssembly';
import { INITIAL_WATER_TOP_PLACEMENT, type WaterTopPlacement } from './waterTopPlacement';
import { type WaterfallImpactPlacement } from './waterfallImpactPlacement';
import {
  SWING_MAP_ROTATION, SWING_MAP_SCALE, SWING_MAP_X, SWING_MAP_Y,
} from './swingMapPlacement';
import { TREEHOUSE_MAP_SCALE, TREEHOUSE_MAP_X, TREEHOUSE_MAP_Y } from './treehouseMapPlacement';
import {
  MOON_BED_MAP_ROTATION, MOON_BED_MAP_SCALE, MOON_BED_MAP_X, MOON_BED_MAP_Y,
} from './moonBedMapPlacement';
import { STATIC_LANDMARK_MAP_PLACEMENTS, type StaticLandmarkMapPlacement } from './staticLandmarkMapPlacements';
import { TEA_SET_MAP_ROTATION, TEA_SET_MAP_SCALE, TEA_SET_MAP_X, TEA_SET_MAP_Y } from './teaSetMapPlacement';

type LandmarkLayerProps = {
  /** World-space Land06 flowers, below every Tea Set layer. Shared by DEV and Garden. */
  behindTeaSet?: ReactNode;
  renderPass?: 'all' | 'motion' | 'static-front';
  landmarksVisible?: boolean;
  waterEnabled?: boolean;
  waterAnimationEnabled?: boolean;
  landmarkAnimationEnabled?: boolean;
  waterfallVersion?: WaterfallVersion;
  onDebugStatus?: (status: string) => void;
  showDiagnostics?: boolean;
  showBounds?: boolean;
  waterfallImpactPlacement?: WaterfallImpactPlacement;
  impactFoamEnabled?: boolean;
  treehousePlacement?: { x: number; y: number; scale: number };
  swingPlacement?: { x: number; y: number; scale: number; rotation: number };
  moonBedPlacement?: { x: number; y: number; scale: number; rotation: number };
  gardenArchPlacement?: StaticLandmarkMapPlacement;
  pavilionPlacement?: StaticLandmarkMapPlacement;
  dogHousePlacement?: StaticLandmarkMapPlacement;
  /** The Garden critters' clock, for the dogs in their house (critters/DogHouseOccupants.tsx). */
  dogHouseClock?: SharedValue<number>;
  teaSetPlacement?: { x: number; y: number; scale: number; rotation: number };
  waterfallPlacement?: WaterfallMapPlacement;
  waterfallActive?: boolean;
  treehouseLightingEnabled?: boolean;
  swingLightingEnabled?: boolean;
  fairySeconds?: SharedValue<number>;
  fairyAtTea?: 'seatedAtTea'|'drinkingTea'|null;
  fairyOnMoonBed?: boolean;
  fairyOnSwing?: boolean;
  fairyInTreehouse?: boolean;
  moonBedIntegrationEnabled?: boolean;
  moonBedShadowOpacity?: number;
  topWaterAssemblyEnabled?: boolean;
  suppressLegacyWaterTop?: boolean;
  topWaterMotionMode?: TopWaterMotionMode;
  waterTopPlacement?: WaterTopPlacement;
  topWaterShowWater?: boolean;
  topWaterShowCliff?: boolean;
  topWaterShowBank?: boolean;
  waterfallVisible?: boolean;
};

function MoonBedIntegrationShadow({ opacity }: { opacity: number }) {
  return (
    <Group opacity={opacity}>
      {/* Broad underside occlusion plus localized support/blanket contacts.
          Coordinates remain in Moon Bed design space and inherit its map transform. */}
      <Oval x={330} y={875} width={690} height={105} color="rgba(50, 42, 47, 0.20)">
        <Blur blur={42} />
      </Oval>
      <Oval x={92} y={1020} width={285} height={78} color="rgba(45, 38, 43, 0.30)">
        <Blur blur={28} />
      </Oval>
      <Oval x={972} y={1038} width={265} height={76} color="rgba(45, 38, 43, 0.30)">
        <Blur blur={28} />
      </Oval>
      <Oval x={612} y={972} width={190} height={58} color="rgba(53, 43, 48, 0.18)">
        <Blur blur={24} />
      </Oval>
    </Group>
  );
}

export default function LandmarkLayer({
  renderPass='all', behindTeaSet, landmarksVisible=true, waterEnabled=true, waterAnimationEnabled=true, landmarkAnimationEnabled=true,
  waterfallVersion = 'legacy',
  onDebugStatus, showDiagnostics = false, showBounds = false,
  treehousePlacement = { x: TREEHOUSE_MAP_X, y: TREEHOUSE_MAP_Y, scale: TREEHOUSE_MAP_SCALE },
  swingPlacement = {
    x: SWING_MAP_X, y: SWING_MAP_Y, scale: SWING_MAP_SCALE, rotation: SWING_MAP_ROTATION,
  },
  moonBedPlacement = {
    x: MOON_BED_MAP_X, y: MOON_BED_MAP_Y,
    scale: MOON_BED_MAP_SCALE, rotation: MOON_BED_MAP_ROTATION,
  },
  gardenArchPlacement = STATIC_LANDMARK_MAP_PLACEMENTS.gardenArch,
  pavilionPlacement = STATIC_LANDMARK_MAP_PLACEMENTS.pavilion,
  dogHousePlacement = STATIC_LANDMARK_MAP_PLACEMENTS.dogHouse,
  dogHouseClock,
  teaSetPlacement = {
    x: TEA_SET_MAP_X, y: TEA_SET_MAP_Y, scale: TEA_SET_MAP_SCALE, rotation: TEA_SET_MAP_ROTATION,
  },
  treehouseLightingEnabled = false,
  waterfallPlacement = INITIAL_WATERFALL_PLACEMENT,
  waterfallActive = true,
  waterfallImpactPlacement,
  impactFoamEnabled = true,
  swingLightingEnabled = false,
  fairyOnSwing = false,
  fairyOnMoonBed = false,
  fairyInTreehouse = false,
  fairyAtTea = null,
  fairySeconds,
  moonBedIntegrationEnabled = true,
  moonBedShadowOpacity = 0.5,
  topWaterAssemblyEnabled = true,
  suppressLegacyWaterTop = false,
  topWaterMotionMode = 'animate',
  waterTopPlacement = INITIAL_WATER_TOP_PLACEMENT,
  topWaterShowWater = true,
  topWaterShowCliff = true,
  topWaterShowBank = true,
  waterfallVisible = true,
}: LandmarkLayerProps) {
  runtimeAudit.render('LandmarkLayer');
  const waterTopFlow = useWaterTopFlow(renderPass !== 'static-front' && waterfallVersion === 'legacy' && !suppressLegacyWaterTop && waterfallActive && topWaterAssemblyEnabled && topWaterShowWater, topWaterMotionMode === 'animate');
  const { x, y, scale } = treehousePlacement;
  const swing = swingPlacement;
  const moonBed = moonBedPlacement;
  const swingCenter = {
    x: swing.x + SWING_WIDTH * swing.scale / 2,
    y: swing.y + SWING_HEIGHT * swing.scale / 2,
  };
  const swingMapTransform = [{ rotate: swing.rotation * Math.PI / 180 }];
  const moonBedCenter = {
    x: moonBed.x + MOON_BED_WIDTH * moonBed.scale / 2,
    y: moonBed.y + MOON_BED_HEIGHT * moonBed.scale / 2,
  };
  const moonBedMapTransform = [{ rotate: moonBed.rotation * Math.PI / 180 }];
  const gardenArchCenter = {
    x: gardenArchPlacement.x + GARDEN_ARCH_WIDTH * gardenArchPlacement.scale / 2,
    y: gardenArchPlacement.y + GARDEN_ARCH_HEIGHT * gardenArchPlacement.scale / 2,
  };
  const pavilionCenter = {
    x: pavilionPlacement.x + PAVILION_WIDTH * pavilionPlacement.scale / 2,
    y: pavilionPlacement.y + PAVILION_HEIGHT * pavilionPlacement.scale / 2,
  };
  const teaSetCenter = {
    x: teaSetPlacement.x + TEA_SET_WIDTH * teaSetPlacement.scale / 2,
    y: teaSetPlacement.y + TEA_SET_HEIGHT * teaSetPlacement.scale / 2,
  };
  const waterfallCenter = {
    x: waterfallPlacement.x + WATERFALL_WIDTH * waterfallPlacement.scale / 2,
    y: waterfallPlacement.y + WATERFALL_HEIGHT * waterfallPlacement.scale / 2,
  };
  const waterfallMapTransform = [{ rotate: waterfallPlacement.rotation * Math.PI / 180 },
    { scaleX: __DEV__ ? waterfallPlacement.scaleX : 1 },
    { scaleY: __DEV__ ? waterfallPlacement.scaleY : 1 }];
  return (
    <Group>
      {renderPass !== 'static-front' && waterfallVersion === 'legacy' && <Group>
      {/* --------------------------------------------------------
          NEW WATER-TOP ASSEMBLY (authoritative Resources/water/water-top)
          Z-ORDER:
          A. source upstream water layer (under WaterfallEntity)
          B. large cliff / environment layer (under WaterfallEntity)
          C. existing WaterfallEntity
          D. smaller left/right bank / seam-support layer (over WaterfallEntity)
          E. existing WaterfallContactFoam at waterfall bottom
          -------------------------------------------------------- */}
      {waterEnabled && !suppressLegacyWaterTop && topWaterAssemblyEnabled && (
        <WaterTopAssembly
          placement={waterTopPlacement}
          motionMode={topWaterMotionMode}
          layerGroup="under"
          flow={waterTopFlow}
          active={waterfallActive}
          showWater={topWaterShowWater}
          showCliff={topWaterShowCliff}
          showBank={topWaterShowBank}
        />
      )}

      {/* Fallback to previous implementation ONLY when new assembly toggle is OFF */}
      {waterEnabled && !suppressLegacyWaterTop && !topWaterAssemblyEnabled && (
        <WaterfallSourceWaterBase active={waterfallActive} />
      )}

      {/* C. Existing WaterfallEntity (APPROVED LOCATION UNCHANGED) */}
      {waterfallVisible && (
        <Group origin={waterfallCenter} transform={waterfallMapTransform}>
          <GardenProfile name="Waterfall">          <WaterfallEntity x={waterfallPlacement.x} y={waterfallPlacement.y}
            scale={waterfallPlacement.scale} animationEnabled={waterAnimationEnabled} assetQuality="map"
            active={waterfallActive} flowWaterlineY={1228} /></GardenProfile>
        </Group>
      )}

      {/* One continuous upper river and supporting cliffs; treehouse stays in front. */}
      {waterEnabled && suppressLegacyWaterTop && topWaterAssemblyEnabled && (
        <WaterTopSource placement={waterTopPlacement} active={waterfallActive}
          animated={topWaterMotionMode === 'animate'} />
      )}
      {/* D. WaterTopAssembly front bank / seam support */}
      {waterEnabled && !suppressLegacyWaterTop && topWaterAssemblyEnabled && (
        <WaterTopAssembly
          placement={waterTopPlacement}
          motionMode={topWaterMotionMode}
          layerGroup="over"
          flow={waterTopFlow}
          active={waterfallActive}
          showWater={topWaterShowWater}
          showCliff={topWaterShowCliff}
          showBank={topWaterShowBank}
        />
      )}

      {/* Fallback to previous environment ONLY when new assembly toggle is OFF */}
      {waterEnabled && !suppressLegacyWaterTop && !topWaterAssemblyEnabled && (
        <WaterfallSourceEnvironment active={waterfallActive} />
      )}
      {/* CONTACT FOAM / SPLASH OCCLUDER: sits in FRONT of the lower end of the falling water */}
      {impactFoamEnabled && waterfallImpactPlacement && (
        <WaterfallContactFoam
          placement={waterfallImpactPlacement}
          active={waterfallActive}
        />
      )}
      </Group>}
      <GardenProfile name="Landmark animation" enabled={landmarksVisible && renderPass !== 'static-front'}>
      <TreehouseEntity x={x} y={y} scale={scale}
        animationEnabled={landmarkAnimationEnabled} lightingEnabled={treehouseLightingEnabled} occupied={fairyInTreehouse} onDebugStatus={onDebugStatus} />
      {/* Map-level landmark order: Treehouse, then Swing. Internal Swing stacking is untouched. */}
      <Group origin={swingCenter} transform={swingMapTransform}>
        <SwingEntity x={swing.x} y={swing.y} scale={swing.scale}
          animationEnabled={landmarkAnimationEnabled} occupied={fairyOnSwing} fairy={<SeatedSwingFairy />} ribbonAnimationEnabled={landmarkAnimationEnabled}
          lanternLightingEnabled={swingLightingEnabled} />
      </Group>
      {/* Moon Bed is a separate map landmark above the land layer. */}
      <Group origin={moonBedCenter} transform={moonBedMapTransform}>
        {moonBedIntegrationEnabled && moonBedShadowOpacity > 0 && (
          <Group transform={[
            { translateX: moonBed.x }, { translateY: moonBed.y }, { scale: moonBed.scale },
          ]}>
            <MoonBedIntegrationShadow opacity={moonBedShadowOpacity} />
          </Group>
        )}
        <MoonBedEntity fairy={fairyOnMoonBed ? <SleepingMoonFairy /> : undefined} x={moonBed.x} y={moonBed.y} scale={moonBed.scale} animationEnabled={landmarkAnimationEnabled} />
      </Group>
      </GardenProfile>
      <GardenProfile name="Static landmarks" enabled={landmarksVisible && renderPass !== 'motion'}>
      {/* Drawn after the ground's lying snow, so they carry their own (weather/SnowLayer.tsx). */}
      <Snowy>
      <Group origin={gardenArchCenter}
        transform={[{ rotate: gardenArchPlacement.rotation * Math.PI / 180 }]}>
        <GardenArchEntity x={gardenArchPlacement.x} y={gardenArchPlacement.y}
          scale={gardenArchPlacement.scale} />
      </Group>
      <Group origin={pavilionCenter}
        transform={[{ rotate: pavilionPlacement.rotation * Math.PI / 180 }]}>
        <PavilionEntity x={pavilionPlacement.x} y={pavilionPlacement.y}
          scale={pavilionPlacement.scale} />
      </Group>
      <DogHouseEntity x={dogHousePlacement.x} y={dogHousePlacement.y} scale={dogHousePlacement.scale} />
      </Snowy>
      {/* The dogs going in and resting inside, over the house (seen through its doorway). */}
      {dogHouseClock ? <DogHouseOccupants clock={dogHouseClock} /> : null}
      {/* Tea Set is map-static and remains internally layered for future seating. */}
      </GardenProfile>
      {renderPass !== 'motion' && behindTeaSet}
      <GardenProfile name="Tea Set" enabled={landmarksVisible && renderPass !== 'motion'}>
      <Group origin={teaSetCenter}
        transform={[{ rotate: teaSetPlacement.rotation * Math.PI / 180 }]}>
        <TeaSetEntity fairy={<TeaFairy state={fairyAtTea} seconds={fairySeconds}/>} x={teaSetPlacement.x} y={teaSetPlacement.y} scale={teaSetPlacement.scale} />
      </Group>
      </GardenProfile>

      {renderPass !== 'motion' && __DEV__ && (showDiagnostics || showBounds) && (
        <Group>
          <Group origin={waterfallCenter} transform={waterfallMapTransform}>
            <Rect x={waterfallPlacement.x} y={waterfallPlacement.y}
              width={WATERFALL_WIDTH * waterfallPlacement.scale}
              height={WATERFALL_HEIGHT * waterfallPlacement.scale}
              style="stroke" strokeWidth={8} color="#007A91" />
          </Group>
          <Rect x={x} y={y}
            width={TREEHOUSE_WIDTH * scale}
            height={TREEHOUSE_HEIGHT * scale}
            style="stroke" strokeWidth={8} color="#FF00D4" />
          <Circle cx={x} cy={y} r={18} color="#FF00D4" />
          <Group origin={swingCenter} transform={swingMapTransform}>
            <Rect x={swing.x} y={swing.y}
              width={SWING_WIDTH * swing.scale}
              height={SWING_HEIGHT * swing.scale}
              style="stroke" strokeWidth={8} color="#00A8FF" />
            <Circle cx={swing.x} cy={swing.y} r={18} color="#00A8FF" />
          </Group>
          <Group origin={moonBedCenter} transform={moonBedMapTransform}>
            <Rect x={moonBed.x} y={moonBed.y}
              width={MOON_BED_WIDTH * moonBed.scale}
              height={MOON_BED_HEIGHT * moonBed.scale}
              style="stroke" strokeWidth={8} color="#9B59FF" />
            <Circle cx={moonBed.x} cy={moonBed.y} r={18} color="#9B59FF" />
          </Group>
          <Group origin={gardenArchCenter}
            transform={[{ rotate: gardenArchPlacement.rotation * Math.PI / 180 }]}>
            <Rect x={gardenArchPlacement.x} y={gardenArchPlacement.y}
              width={GARDEN_ARCH_WIDTH * gardenArchPlacement.scale}
              height={GARDEN_ARCH_HEIGHT * gardenArchPlacement.scale}
              style="stroke" strokeWidth={8} color="#FF8A00" />
          </Group>
          <Group origin={pavilionCenter}
            transform={[{ rotate: pavilionPlacement.rotation * Math.PI / 180 }]}>
            <Rect x={pavilionPlacement.x} y={pavilionPlacement.y}
              width={PAVILION_WIDTH * pavilionPlacement.scale}
              height={PAVILION_HEIGHT * pavilionPlacement.scale}
              style="stroke" strokeWidth={8} color="#00C48C" />
          </Group>
          <Group origin={teaSetCenter}
            transform={[{ rotate: teaSetPlacement.rotation * Math.PI / 180 }]}>
            <Rect x={teaSetPlacement.x} y={teaSetPlacement.y}
              width={TEA_SET_WIDTH * teaSetPlacement.scale}
              height={TEA_SET_HEIGHT * teaSetPlacement.scale}
              style="stroke" strokeWidth={8} color="#FF4D8D" />
          </Group>
        </Group>
      )}
    </Group>
  );
}
