import { CanonicalFlowerArt } from './CanonicalFlowerArt';
import React, { useMemo } from 'react';
import {
  Circle,
  Group,
  useImage,
} from '@shopify/react-native-skia';
import { usePlanting } from './PlantingContext';
import { getFlowerPlacementDefinition } from './flowerFootprintConfig';
import { flowerInDepthPass, type FlowerDepthPass } from '../flowerOcclusion';
import { ProductionPlantedFlowers } from './ProductionPlantedFlowers';
import { BotanicalFlowerImage } from '../flower-visuals/BotanicalFlowerImage';
import { botanicalPresentationPose } from '../flower-visuals/botanicalPresentationPose';

const FLOWER_ASSETS: Record<string, any> = {
  pink: require('../../../../assets/garden/flowers/pink.png'),
  purple: require('../../../../assets/garden/flowers/purple.png'),
  blue: require('../../../../assets/garden/flowers/blue.png'),
  sunflower: require('../../../../assets/garden/flowers/sunflower.png'),
  tulip: require('../../../../assets/garden/flowers/tulip.png'),
};

export default function PlantedFlowerLayer({depthPass='all',useMonthlyGrowth=false}:{depthPass?:FlowerDepthPass;useMonthlyGrowth?:boolean}) {
  return useMonthlyGrowth?<ProductionPlantedFlowers depthPass={depthPass}/>:<LegacyPlantedFlowerLayer depthPass={depthPass}/>;
}

export function LegacyPlantedFlowerLayer({ depthPass = 'all' }: { depthPass?: FlowerDepthPass }) {
  const {
    placements,
    activeMode,
    targetFlower,
    previewCoords,
    validationResult,
    showDevFootprints,
    showDevHitboxes,
  } = usePlanting();

  // Pre-load Skia images
  const pinkImg = useImage(FLOWER_ASSETS.pink);
  const purpleImg = useImage(FLOWER_ASSETS.purple);
  const blueImg = useImage(FLOWER_ASSETS.blue);
  const sunflowerImg = useImage(FLOWER_ASSETS.sunflower);
  const tulipImg = useImage(FLOWER_ASSETS.tulip);

  const getImageForFlower = (flowerName?: string) => {
    if (!flowerName) return pinkImg;
    const lower = flowerName.toLowerCase();
    if (lower.includes('sunflower')) return sunflowerImg;
    if (lower.includes('tulip')) return tulipImg;
    if (lower.includes('purple')) return purpleImg;
    if (lower.includes('blue')) return blueImg;
    if (lower.includes('pink')) return pinkImg;
    return pinkImg;
  };

  // Deterministic Y-depth sorting (smaller Y drawn first, so larger Y renders in front)
  const sortedPlacements = useMemo(() => {
    return [...placements].sort((a, b) => a.worldY - b.worldY);
  }, [placements]);

  return (
    <Group>
      {/* 1. Committed Planted Flowers */}
      {sortedPlacements.map((flower) => {
        if (!flowerInDepthPass(flower.month, depthPass)) return null;
        if (flower.sourceType || flower.sourceEventId) return <CanonicalFlowerArt key={flower.id} flower={flower} />;
        const def = getFlowerPlacementDefinition(flower.flowerName, flower.speciesCode);
        const img = getImageForFlower(flower.flowerName);
        if (!img) return null;

        const w = def.visualWidth;
        const h = def.visualHeight;
        const drawX = flower.worldX - w / 2;
        const drawY = flower.worldY - h * 0.82;
        const pose = botanicalPresentationPose(flower.id);

        return (
          <Group key={flower.id}>
            {/* Visual flower art */}
            <Group origin={{ x: flower.worldX, y: flower.worldY }} transform={pose.transform}>
              <BotanicalFlowerImage
                image={img}
                x={drawX}
                y={drawY}
                width={w}
                height={h}
                fit="contain"
                rootX={flower.worldX}
                rootY={flower.worldY}
                rootWidth={w * .24}
                seed={pose.seed}
                plantWidth={w}
                plantHeight={h}
              />
            </Group>

            {/* DEV Footprint Collision Overlay */}
            {showDevFootprints && (
              <Group>
                <Circle
                  cx={flower.worldX}
                  cy={flower.worldY}
                  r={def.footprintRadius}
                  color="rgba(74, 222, 128, 0.8)"
                  style="stroke"
                  strokeWidth={2}
                />
                <Circle
                  cx={flower.worldX}
                  cy={flower.worldY}
                  r={3}
                  color="rgba(74, 222, 128, 1)"
                />
              </Group>
            )}

            {/* DEV Hitbox Overlay */}
            {showDevHitboxes && (
              <Circle
                cx={flower.worldX}
                cy={flower.worldY - h * 0.35}
                r={def.hitboxRadius}
                color="rgba(56, 189, 248, 0.6)"
                style="stroke"
                strokeWidth={1.5}
              />
            )}
          </Group>
        );
      })}

      {/* 2. Active Preview Flower (Planting) */}
      {activeMode !== 'normal' && previewCoords && targetFlower && flowerInDepthPass(targetFlower.month, depthPass) && (
        <Group>
          {(() => {
            const def = getFlowerPlacementDefinition(targetFlower.flowerName, targetFlower.speciesCode);
            const img = getImageForFlower(targetFlower.flowerName);
            const isValid = validationResult?.isValid ?? false;
            const w = def.visualWidth;
            const h = def.visualHeight;
            const drawX = previewCoords.worldX - w / 2;
            const drawY = previewCoords.worldY - h * 0.82;
            const pose = botanicalPresentationPose(targetFlower.id);

            const ringColor = isValid
              ? 'rgba(34, 197, 94, 0.85)'
              : 'rgba(239, 68, 68, 0.85)';
            const ringFill = isValid
              ? 'rgba(34, 197, 94, 0.25)'
              : 'rgba(239, 68, 68, 0.25)';

            return (
              <Group>
                {/* Placement preview base halo indicator */}
                <Circle
                  cx={previewCoords.worldX}
                  cy={previewCoords.worldY}
                  r={def.footprintRadius + 4}
                  color={ringFill}
                />
                <Circle
                  cx={previewCoords.worldX}
                  cy={previewCoords.worldY}
                  r={def.footprintRadius}
                  color={ringColor}
                  style="stroke"
                  strokeWidth={2.5}
                />

                {/* Preview flower image (slightly translucent) */}
                {(targetFlower.sourceType || targetFlower.sourceEventId) ? <CanonicalFlowerArt flower={{ ...targetFlower, ...previewCoords }} /> : img && (
                  <Group opacity={isValid ? 0.92 : 0.65}
                    origin={{ x: previewCoords.worldX, y: previewCoords.worldY }} transform={pose.transform}>
                    <BotanicalFlowerImage
                      image={img}
                      x={drawX}
                      y={drawY}
                      width={w}
                      height={h}
                      fit="contain"
                      rootX={previewCoords.worldX}
                      rootY={previewCoords.worldY}
                      rootWidth={w * .24}
                      seed={pose.seed}
                      plantWidth={w}
                      plantHeight={h}
                    />
                  </Group>
                )}

                {/* Center marker */}
                <Circle
                  cx={previewCoords.worldX}
                  cy={previewCoords.worldY}
                  r={4}
                  color={ringColor}
                />
              </Group>
            );
          })()}
        </Group>
      )}
    </Group>
  );
}
