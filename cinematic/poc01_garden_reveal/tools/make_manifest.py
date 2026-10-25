"""Generates scene_manifest.json from values verified in the PetalPal source (2026-10-20).
Every value cites the file it was read from. Paths are repo-relative and are only READ."""
import json, sys, os
M = 'mobile/assets/garden/'
T = 'mobile/src/components/garden/terrain/'
W = 'mobile/src/components/garden/water/assets/'

layers = []
RELIEF = {
  # base/top in metres; blur in world px softens the alpha edge into a slope; northRamp raises the far rim behind the waterfall
  # Low banks only. Tall height-from-alpha relief smeared the paintings into streaked walls (previs v1), so the
  # painted cliffs are now standing matte panels (MATTES below) and the basin stays a gentle bank.
  'outer_basin':      dict(base=-0.4, top=1.0, blur=70),
  'right_perimeter':  dict(base=-0.4, top=1.0, blur=70),
  'land':             dict(base=-0.45, top=0.55, blur=10),
}
# Cliff and backdrop paintings drawn by the app at its 3/4 angle. Built as matte panels perpendicular to the final
# camera view, pivoting at the lowest painted row, height scaled by sin(final pitch) so the reveal frame matches the app art.
MATTES = {'upland', 'treehouse_cliffs', 'right_shoulder', 'source_banks', 'upper_right_scenic'}
# Pivot (map y) overrides keep the app's draw order in depth: a backdrop must stand BEHIND whatever the app paints over it.
MATTE_PIVOT_Y = {'treehouse_cliffs': 440,      # behind the treehouse base (anchor y ~481); TreehouseEntity draws over it
                 'right_shoulder': -160,       # behind the waterfall lip/source band; WaterfallV2Entity draws over it
                 'upper_right_scenic': 120}    # GardenUpperRightScenery cutout bottomBase
def L(id, role, asset, x, y, w, h, rot=0.0, src='', **kw):
    if id in MATTES:
        role = 'matte'
        if id in MATTE_PIVOT_Y:
            kw['pivotY'] = MATTE_PIVOT_Y[id]
            kw['groundSplit'] = id in ('treehouse_cliffs', 'right_shoulder')   # app paints their lower part on the ground
    d = dict(id=id, role=role, asset=asset, x=x, y=y, width=w, height=h, rotationDeg=rot, source=src)
    d.update(kw)
    rel = RELIEF.get(id) or (RELIEF['land'] if role == 'land' else None)
    if rel: d['relief'] = rel
    layers.append(d)

# Lake bed seen through the water surface. GardenWaterField.tsx: Rect(-2400,-2400,7200,6600) filled with the floor
# texture at rect (0,0,2400,1800), mirror-tiled. Drawn BEFORE the basin: the basin's alpha opening reveals it.
L('lakebed', 'lakebed', W+'ornamental-water-floor.png', -2400, -2400, 7200, 6600, src='GardenWaterField.tsx floor shader', tile=dict(mode='mirror', rect=[0,0,2400,1800]))
# Outer basin terrain (GardenOuterBasin.tsx). App composites these through masking shaders; here: plain planes (PROVISIONAL).
L('upland', 'terrain', T+'outer-upland-v1.png', -1700, -2250, 3000, 2000, src='GardenOuterBasin.tsx upland rect; app masks it with OUTER_GROUND shader', tile=dict(mode='mirror', rect=[-1700,-2250,3000,2000]))
L('outer_basin', 'terrain', T+'outer-basin-floral-v3.png', -700, -800, 3800, 3400, src='GardenOuterBasin.tsx TerrainJoin bounds (floral painting)')
L('treehouse_cliffs', 'terrain', T+'treehouse-cliff-backing-v1.png', -350, -200, 1300, 1100, src='GardenOuterBasin.tsx treeCliffs bounds')
L('right_shoulder', 'terrain', T+'outer-right-bank-floral-v2.png', 1010, -1480, 550, 1660, src='GardenOuterBasin.tsx rightBank bounds')
L('right_perimeter', 'terrain', T+'outer-right-bank-floral-v2.png', 2140, -260, 680, 2300, src='GardenOuterBasin.tsx right perimeter rect')
L('source_banks', 'terrain', T+'waterfall-source-banks-v1.png', 645, -1160, 600, 900, src='GardenOuterBasin.tsx INLET_BOUNDS')
L('upper_right_scenic', 'terrain', T+'upper-right-scenic-v2.png', 1330, -420, 1200, 700, src='terrain/upper-right-scenic.json bounds (app applies a shader cutout)')


# Lands (gardenMapLayout.ts GARDEN_LANDS; height = width*imgH/imgW; rotation about rect centre)
for id, f, x, y, w, r, ih, iw in [
    ('central','central-land.png',768,297,831,0,1254,1254), ('0405','land-0405.png',1135,-60,597,1.5,1254,1254),
    ('06','land-06.png',1638,230,598,-1.33,1024,1536), ('07','land-07.png',1737,407,689,7.24,1254,1254),
    ('08','land-08.png',1667,924,673,16.9,1254,1254), ('09','land-09.png',936,1000,597,8.28,1254,1254),
    ('101112','land-101112.png',-27,373,1008,0,1254,1254)]:
    L('land_'+id, 'land', M+'land/'+f, x, y, w, round(w*ih/iw, 2), r, src='gardenMapLayout.ts GARDEN_LANDS')

# Environment overlays (assets/garden/environment/layers.json)
env = json.load(open(sys.argv[1]+'/'+M+'environment/layers.json'))
for e in env:
    L('env_'+e['land'], 'overlay', M+'environment/'+e['asset'], e['x'], e['y'], e['width'], e['height'], e.get('rotation',0), src='environment/layers.json')

# Main road (GardenConnectionLayer.tsx + approved-circulation/manifest.json)
L('main_road', 'overlay', M+'bridges/approved-circulation/main-road-connected.png', 1300, 1350, 680, 2950, src='approved-circulation/manifest.json main-road-connected')
# Infrastructure, full-world canvases at origin, in GardenInfrastructureLayer.tsx draw order
infra = ['seams/Road_west_seamed.png','seams/Road_other_seamed.png','seams/Road_entrance09_seamed.png','SS01_stepping_stones.png',
         'b02-land06-connection/land06-approach.png','final/B02_bridge.png','final/ST01_approved.png','b02-land06-connection/b02-foreground-local-opening.png',
         'seams/ST01_feet_occlusion.png','entrance-connections/land09-transition.png','land09-interface-v2/land09-interface-foreground.png',
         'entrance-connections/b01-foot-landing.png','final/B01_bridge.png','seams/B01_land08_occlusion.png']
for i, f in enumerate(infra):
    L('infra_%02d' % i, 'overlay', M+'infrastructure/'+f, 0, 0, 2400, 1800, src='GardenInfrastructureLayer.tsx images[] order')

# Landmarks (standing panels). groundV = lowest painted row (8% coverage) measured from each image with poclib.auto_ground_v.
cards = []
def C(id, asset, x, y, w, h, rot, groundV, src, group=None):
    cards.append(dict(id=id, asset=asset, x=x, y=y, width=w, height=h, rotationDeg=rot, groundV=groundV, source=src, group=group or id))
C('pavilion', M+'landmarks/pavilion.png', 1086, 514, 1214*0.17, 1295*0.17, 0, 0.913, 'staticLandmarkMapPlacements.ts + StaticLandmarkEntities.tsx')
C('garden_arch', M+'landmarks/garden-arch.png', 1380, 1450, 1312*0.3, 1199*0.3, -6, 0.961, 'staticLandmarkMapPlacements.ts')
for f in ['tree-base','canopy-overlay','wisteria-overlay','foreground-overlay','mailbox']:   # TreehouseEntity renderOrder 'all' = [0,1,2,5,3]
    C('treehouse_'+f, M+'landmarks/treehouse/'+f+'.png', 70, -140, 1448*0.65, 1086*0.65, 0, 0.950, 'treehouseMapPlacement.ts + TreehouseEntity.tsx', group='treehouse')

waterfall = dict(id='waterfall_v2', asset=M+'landmarks/waterfall-v2/waterfall-v2-compact-r3.png', x=742.6, y=-656, scale=0.5, rotationDeg=-2.5,
                 canvas=[1024, 2048], bands=[dict(start=0,end=767,scaleY=0.58,translateY=676.14, shape='source_top'),
                                              dict(start=767,end=1652,scaleY=0.6,translateY=660.8, shape='fall'),
                                              dict(start=1652,end=2048,scaleY=1,translateY=0, shape='pool')],
                 source='waterfallV2Placement.ts + waterfallV2Proportions.ts (short-r1) + WaterfallV2Entity.tsx')

scatter = dict(seed=7, count=90, distMin=1.4, distMax=7.0, halfAngleDeg=60, heightMin=0.32, heightMax=0.95, minGroundAboveWater=0.6,
               note='Foreground flower cards from the approved environment sprite set, placed only on dry ground near the camera start.')
flowers = [M+'environment/flowers/'+f for f in ['crocus_lavender.png','crocus_crescent.png','crocus_ivory.png','ivory_wildflowers.png','pale_blue.png','pale_pink.png','ivory_sage.png','sparse_sprig.png']] + \
          [M+'environment/foliage/'+f for f in ['fern_groundcover.png','leaf_tuft.png']]

import importlib.util
_spec = importlib.util.spec_from_file_location('poclib', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'poclib.py'))
poclib = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(poclib)
manifest = dict(
  version=1, generated='2026-10-20', branch='frontend-MVP-all', head='51ffd0b2',
  note='All assets are read in place from the repository and never modified. World units are app map pixels (y down).',
  world=dict(width=2400, height=1800, boundsY=[-309, 1810], source='gardenMapLayout.ts, rendering/gardenWorldBounds.ts'),
  units=dict(metersPerWorldPixel=0.03, note='Scale chosen so the pavilion (206 px) is about 6 m wide; PROVISIONAL artistic choice.'),
  heights=dict(waterSurface=0.0, lakebed=-1.6, landTop=0.55, overlayLift=0.012, waterfallTop=8.6, waterfallFallDeg=72),
  camera=dict(fps=24, frames=150, lensMm=24, sensorMm=36,
     # Waypoints (map x/y, height above water m, heading deg 0 = north + = east, pitch deg - = down, focus m, f-stop).
     path=[dict(x=800, y=1915, z=1.8,  heading=8, pitch=-3,  focus=2.6,  fstop=1.8),   # low among the flowers on the south bank
           dict(x=838, y=1730, z=1.5,  heading=7, pitch=-3,  focus=10.0, fstop=2.1),   # skim out over the turquoise lake
           dict(x=866, y=1560, z=6.5,  heading=6, pitch=-9,  focus=19.0, fstop=2.5),   # climb begins
           dict(x=888, y=1400, z=17.0, heading=5, pitch=-25, focus=26.0, fstop=3.3),   # rising reveal
           dict(x=900, y=1280, z=26.0, heading=6, pitch=-37, focus=30.0, fstop=4.0)],  # settle: waterfall, pavilion, treehouse
     # Speed is limited by curvature and braking, like a stabilised aerial camera: <= 8 m/s^2 lateral, <= 4 m/s^2 along the path.
     limits=dict(aLat=8.0, aLong=4.0, vMax=14.0), keyStep=1,   # a key on every frame so Blender reproduces the designed motion exactly
     note='Constant focal length: every change of framing comes from camera movement, never zoom.'),
  light=dict(sunElevationDeg=19, sunAzimuthDeg=250, sunStrength=3.6, sunColor=[1.0, 0.86, 0.70], sunAngleDeg=1.2,
             skyStrength=0.35, hazeDensity=0.0014, hazeAnisotropy=0.55, hazeColor=[1.0, 0.93, 0.84]),
  water=dict(absorbColor=[0.32, 0.74, 0.72], absorbDensity=0.55, roughness=0.035, ior=1.333, waveScale=1.6, waveStrength=0.18),
  paletteRefs=dict(turquoise='#5AA4AB', lavender='#A67EB7', appWater='#78b8b2'),
  layers=layers, landmarkCards=cards, waterfall=waterfall, foregroundFlowers=flowers, scatter=scatter)
c = manifest['camera']
c['keys'], c['naturalSeconds'] = poclib.camera_track(c['path'], c['frames'], c['limits'], c['keyStep'], manifest['units']['metersPerWorldPixel'])
c['naturalSeconds'] = round(c['naturalSeconds'], 2)
out = sys.argv[2]
json.dump(manifest, open(out, 'w'), indent=1)
missing = [p for p in [l['asset'] for l in layers]+[c['asset'] for c in cards]+[waterfall['asset']]+flowers if not os.path.exists(sys.argv[1]+'/'+p)]
print(len(layers), 'layers', len(cards), 'cards; missing:', missing)
