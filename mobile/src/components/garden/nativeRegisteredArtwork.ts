// Native copies of the registered artwork: the web copy's exact pixels (the original cropped to its
// registration box) plus a one-pixel ring of the original around it, so linear sampling at the clip edge
// reads the same neighbours as the full canvas did. Keyed by the web copy's asset id. A full 2400x1800
// canvas decodes to 16.5 MB whatever it holds; these hold only the drawn part.
export const NATIVE_REGISTERED_ARTWORK = new Map<number, number>([
  [require('@/assets/garden/runtime/infrastructure/SS01_stepping_stones.png'), require('@/assets/garden/runtime-native/infrastructure/SS01_stepping_stones.png')],
  [require('@/assets/garden/runtime/infrastructure/b02-land06-connection/b02-foreground-local-opening.png'), require('@/assets/garden/runtime-native/infrastructure/b02-land06-connection/b02-foreground-local-opening.png')],
  [require('@/assets/garden/runtime/infrastructure/b02-land06-connection/land06-approach.png'), require('@/assets/garden/runtime-native/infrastructure/b02-land06-connection/land06-approach.png')],
  [require('@/assets/garden/runtime/infrastructure/entrance-connections/b01-foot-landing.png'), require('@/assets/garden/runtime-native/infrastructure/entrance-connections/b01-foot-landing.png')],
  [require('@/assets/garden/runtime/infrastructure/entrance-connections/land09-transition.png'), require('@/assets/garden/runtime-native/infrastructure/entrance-connections/land09-transition.png')],
  [require('@/assets/garden/runtime/infrastructure/final/B01_bridge.png'), require('@/assets/garden/runtime-native/infrastructure/final/B01_bridge.png')],
  [require('@/assets/garden/runtime/infrastructure/final/B02_bridge.png'), require('@/assets/garden/runtime-native/infrastructure/final/B02_bridge.png')],
  [require('@/assets/garden/runtime/infrastructure/final/ST01_approved.png'), require('@/assets/garden/runtime-native/infrastructure/final/ST01_approved.png')],
  [require('@/assets/garden/runtime/infrastructure/land09-interface-v2/land09-broad-interface.png'), require('@/assets/garden/runtime-native/infrastructure/land09-interface-v2/land09-broad-interface.png')],
  [require('@/assets/garden/runtime/infrastructure/land09-interface-v2/land09-interface-foreground.png'), require('@/assets/garden/runtime-native/infrastructure/land09-interface-v2/land09-interface-foreground.png')],
  [require('@/assets/garden/runtime/infrastructure/seams/B01_land08_occlusion.png'), require('@/assets/garden/runtime-native/infrastructure/seams/B01_land08_occlusion.png')],
  [require('@/assets/garden/runtime/infrastructure/seams/Road_entrance09_seamed.png'), require('@/assets/garden/runtime-native/infrastructure/seams/Road_entrance09_seamed.png')],
  [require('@/assets/garden/runtime/infrastructure/seams/Road_other_seamed.png'), require('@/assets/garden/runtime-native/infrastructure/seams/Road_other_seamed.png')],
  [require('@/assets/garden/runtime/infrastructure/seams/Road_west_seamed.png'), require('@/assets/garden/runtime-native/infrastructure/seams/Road_west_seamed.png')],
  [require('@/assets/garden/runtime/infrastructure/seams/ST01_feet_occlusion.png'), require('@/assets/garden/runtime-native/infrastructure/seams/ST01_feet_occlusion.png')],
  [require('@/assets/garden/runtime/roads/complete/R01_existing_foreground.png'), require('@/assets/garden/runtime-native/roads/complete/R01_existing_foreground.png')],
  [require('@/assets/garden/runtime/roads/complete/R01_treehouse_path.png'), require('@/assets/garden/runtime-native/roads/complete/R01_treehouse_path.png')],
]);
