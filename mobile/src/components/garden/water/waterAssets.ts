export const WATER_DESIGN_WIDTH = 1448;
export const WATER_DESIGN_HEIGHT = 1086;

export const WATER_ASSETS = {
  base: require('@/assets/garden/water/water_base_full.webp'),
  calmBase: require('@/assets/garden/water/water_base_calm_preview.webp'),
  fish: require('@/assets/garden/water/fish_overlay.png'),
  ripples: [
    require('@/assets/garden/water/surface_light_ripples_A.webp'),
    require('@/assets/garden/water/surface_light_ripples_B.webp'),
    require('@/assets/garden/water/surface_light_ripples_C.webp'),
    require('@/assets/garden/water/surface_light_ripples_D.webp'),
  ] as const,
  wake: [
    require('@/assets/garden/water/waterfall_wake_overlay_A.webp'),
    require('@/assets/garden/water/waterfall_wake_overlay_B.webp'),
    require('@/assets/garden/water/waterfall_wake_overlay_C.webp'),
    require('@/assets/garden/water/waterfall_wake_overlay_D.webp'),
  ] as const,
  lotus: {
    static: require('@/assets/garden/water/lotus_static.png'),
    swayA: require('@/assets/garden/water/lotus_sway_A.png'),
    swayB: require('@/assets/garden/water/lotus_sway_B.png'),
  },
  impactFoam: require('@/assets/garden/water/waterfall_impact_foam_sprite.png'),
  sourceWaterBase: require('@/assets/garden/water/source_water_base.png'),
  sourceEnvStatic: require('@/assets/garden/water/source_env_static.png'),
} as const;
