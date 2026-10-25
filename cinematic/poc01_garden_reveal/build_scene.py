"""PetalPal garden reveal - proof of concept 01. Builds the Blender scene from scene_manifest.json.

Run (Windows, from this folder; see README.md):
    blender --background --factory-startup --python build_scene.py -- --preset preview --render stills

Arguments after "--":
    --preset preview|final     preview = EEVEE, 960x540; final = Cycles, 1920x1080 (default: preview)
    --render none|stills|anim  none = build + save .blend only; stills = frames at 0%, 20%, 40%, 67% and 100% of the shot; anim = all frames
    --frames A-B               restrict anim to a frame range, e.g. 1-24
    --no-haze                  skip volumetric atmosphere (much faster, less depth)
    --repo PATH                repository root (default: two folders up from this script)

Safety: approved assets are only READ (bpy.data.images.load). Nothing in the repository outside this folder is written.
Everything generated (.blend, renders, report) goes to ./output/.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import poclib as P  # noqa: E402

# ----------------------------------------------------------------------------------------------- arguments
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None, flag=False):
    if name not in argv:
        return default
    if flag:
        return True
    return argv[argv.index(name) + 1]


PRESET = arg('--preset', 'preview')
RENDER = arg('--render', 'none')
FRAMES = arg('--frames', None)
NO_HAZE = arg('--no-haze', False, flag=True)
REPO = os.path.abspath(arg('--repo', os.path.join(HERE, '..', '..')))
OUT = os.path.join(HERE, 'output')
os.makedirs(OUT, exist_ok=True)

M = json.load(open(os.path.join(HERE, 'scene_manifest.json')))
S = M['units']['metersPerWorldPixel']
H = M['heights']
REPORT = dict(blender=bpy.app.version_string, preset=PRESET, render=RENDER, repo=REPO, warnings=[], timings={}, counts={})
T0 = time.time()


def warn(msg):
    REPORT['warnings'].append(msg)
    print('[poc01] WARNING:', msg)


def log(msg):
    print('[poc01] %6.1fs  %s' % (time.time() - T0, msg))


def try_set(obj, attr, value, label=None):
    """Set an attribute that may not exist in every Blender version; record anything that fails."""
    try:
        setattr(obj, attr, value)
        return True
    except Exception as e:  # noqa: BLE001
        warn('could not set %s.%s (%s)' % (label or type(obj).__name__, attr, e))
        return False


def set_input(node, names, value):
    """Set the first matching socket name (socket names changed between Blender 3.x and 4.x+)."""
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return node.inputs[n]
    warn('node %s has none of inputs %s' % (node.bl_idname, names))
    return None


def sock(node, names, out=False):
    coll = node.outputs if out else node.inputs
    for n in names:
        if n in coll:
            return coll[n]
    raise KeyError('%s: none of %s' % (node.bl_idname, names))


# ----------------------------------------------------------------------------------------------- preflight
missing = []
for item in [l['asset'] for l in M['layers']] + [c['asset'] for c in M['landmarkCards']] + [M['waterfall']['asset']] + M['foregroundFlowers']:
    if not os.path.isfile(os.path.join(REPO, item)):
        missing.append(item)
if missing:
    raise SystemExit('[poc01] Missing approved assets (is --repo correct?):\n  ' + '\n  '.join(missing))
log('Blender %s, repo %s, preset %s' % (bpy.app.version_string, REPO, PRESET))

# ----------------------------------------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'PetalPal_POC01_GardenReveal'
cam_cfg = M['camera']
scene.render.fps = cam_cfg['fps']
scene.frame_start, scene.frame_end = 1, cam_cfg['frames']
scene.unit_settings.system = 'METRIC'
root = bpy.data.collections.new('POC01')
scene.collection.children.link(root)
colls = {}


def coll(name):
    if name not in colls:
        c = bpy.data.collections.new(name)
        root.children.link(c)
        colls[name] = c
    return colls[name]


# ----------------------------------------------------------------------------------------------- images (read only)
_images = {}


def load_image(rel, colorspace='sRGB'):
    if rel in _images:
        return _images[rel]
    img = bpy.data.images.load(os.path.join(REPO, rel), check_existing=True)
    try:
        img.colorspace_settings.name = colorspace
    except Exception:  # noqa: BLE001
        pass
    _images[rel] = img
    return img


def alpha_array(img, max_width=640):
    """Alpha channel as a top-down float array, downsampled for height fields (fast foreach_get)."""
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    a = buf.reshape(h, w, 4)[::-1, :, 3]         # Blender stores rows bottom-up
    k = max(1, w // max_width)
    return a[::k, ::k].astype(np.float64)


# ----------------------------------------------------------------------------------------------- materials
def set_alpha_mode(mat):
    if hasattr(mat, 'surface_render_method'):          # Blender 4.2+
        try_set(mat, 'surface_render_method', 'DITHERED', 'Material')
    else:
        try_set(mat, 'blend_method', 'HASHED', 'Material')
        if hasattr(mat, 'shadow_method'):
            try_set(mat, 'shadow_method', 'HASHED', 'Material')
    mat.use_backface_culling = False


def painted_material(name, img, emission=0.35, roughness=0.75, extension='CLIP', tile=None, feather=0.0, specular=0.15):
    """Approved painting as a lit surface.

    Painted art already contains its own light, so it is split between a diffuse surface (receives the real sun,
    sky and shadows) and a small emission term (keeps the painted values from going muddy in shadow)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = extension
    tex.interpolation = 'Cubic'
    uv = nt.nodes.new('ShaderNodeTexCoord')
    vec = sock(uv, ['UV'], out=True)
    if tile:
        mp = nt.nodes.new('ShaderNodeMapping')
        (sx, sy), (ox, oy) = tile
        set_input(mp, ['Scale'], (sx, sy, 1.0))
        set_input(mp, ['Location'], (ox, oy, 0.0))
        nt.links.new(vec, sock(mp, ['Vector']))
        vec = sock(mp, ['Vector'], out=True)
    nt.links.new(vec, sock(tex, ['Vector']))
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(sock(tex, ['Color'], out=True), sock(bsdf, ['Base Color']))
    set_input(bsdf, ['Roughness'], roughness)
    set_input(bsdf, ['Specular IOR Level', 'Specular'], specular)
    emi = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(sock(tex, ['Color'], out=True), sock(emi, ['Color']))
    set_input(emi, ['Strength'], emission)
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(sock(bsdf, ['BSDF'], out=True), add.inputs[0])
    nt.links.new(sock(emi, ['Emission'], out=True), add.inputs[1])
    alpha = sock(tex, ['Alpha'], out=True)
    if feather > 0:
        # fade the outer band of the rectangle so terrain plates blend instead of showing straight seams
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(sock(uv, ['UV'], out=True), sep.inputs[0])
        edge = None
        for comp in (0, 1):
            inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
            nt.links.new(sep.outputs[comp], inv.inputs[1])
            mn = nt.nodes.new('ShaderNodeMath'); mn.operation = 'MINIMUM'
            nt.links.new(sep.outputs[comp], mn.inputs[0]); nt.links.new(inv.outputs[0], mn.inputs[1])
            if edge is None:
                edge = mn
            else:
                both = nt.nodes.new('ShaderNodeMath'); both.operation = 'MINIMUM'
                nt.links.new(edge.outputs[0], both.inputs[0]); nt.links.new(mn.outputs[0], both.inputs[1]); edge = both
        mr = nt.nodes.new('ShaderNodeMapRange')
        try_set(mr, 'interpolation_type', 'SMOOTHSTEP', 'MapRange')
        nt.links.new(edge.outputs[0], sock(mr, ['Value']))
        set_input(mr, ['From Min'], 0.0); set_input(mr, ['From Max'], feather)
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
        nt.links.new(alpha, mul.inputs[0]); nt.links.new(sock(mr, ['Result'], out=True), mul.inputs[1])
        alpha = mul.outputs[0]
    transp = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(alpha, mix.inputs[0])
    nt.links.new(sock(transp, ['BSDF'], out=True), mix.inputs[1])
    nt.links.new(add.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], sock(out, ['Surface']))
    set_alpha_mode(mat)
    return mat


def keyframe_linear(target, path, frames_values):
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = 'LINEAR'
    for f, v in frames_values:
        target.default_value = v
        target.keyframe_insert('default_value', frame=f)
    prefs.keyframe_new_interpolation_type = old


def water_material():
    w = M['water']
    mat = bpy.data.materials.new('Water_Lake')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    set_input(bsdf, ['Base Color'], (1.0, 1.0, 1.0, 1.0))
    set_input(bsdf, ['Roughness'], w['roughness'])
    set_input(bsdf, ['IOR'], w['ior'])
    set_input(bsdf, ['Transmission Weight', 'Transmission'], 1.0)
    # gentle animated surface: two octaves of 4D noise drive a bump; W is keyed linearly over the shot
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    try_set(noise, 'noise_dimensions', '4D', 'Noise')
    set_input(noise, ['Scale'], w['waveScale'])
    set_input(noise, ['Detail'], 6.0)
    set_input(noise, ['Roughness'], 0.55)
    nt.links.new(sock(coord, ['Object'], out=True), sock(noise, ['Vector']))
    wsock = sock(noise, ['W'])
    keyframe_linear(wsock, 'W', [(1, 0.0), (cam_cfg['frames'], 0.9)])
    bump = nt.nodes.new('ShaderNodeBump')
    set_input(bump, ['Strength'], w['waveStrength'])
    set_input(bump, ['Distance'], 0.05)
    nt.links.new(sock(noise, ['Fac'], out=True), sock(bump, ['Height']))
    nt.links.new(sock(bump, ['Normal'], out=True), sock(bsdf, ['Normal']))
    nt.links.new(sock(bsdf, ['BSDF'], out=True), sock(out, ['Surface']))
    vol = nt.nodes.new('ShaderNodeVolumeAbsorption')
    set_input(vol, ['Color'], tuple(w['absorbColor']) + (1.0,))
    set_input(vol, ['Density'], w['absorbDensity'])
    nt.links.new(sock(vol, ['Volume'], out=True), sock(out, ['Volume']))
    if hasattr(mat, 'use_raytrace_refraction'):
        try_set(mat, 'use_raytrace_refraction', True, 'Material')
    elif hasattr(mat, 'use_screen_refraction'):
        try_set(mat, 'use_screen_refraction', True, 'Material')
    return mat


def mist_material():
    mat = bpy.data.materials.new('Waterfall_Mist')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    set_input(vol, ['Color'], (0.92, 0.96, 0.97, 1.0))
    set_input(vol, ['Anisotropy'], 0.35)
    # density: noise * vertical falloff, so the spray thins upward instead of reading as a box
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    set_input(noise, ['Scale'], 1.6)
    set_input(noise, ['Detail'], 4.0)
    nt.links.new(sock(coord, ['Generated'], out=True), sock(noise, ['Vector']))
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(sock(coord, ['Generated'], out=True), sep.inputs[0])
    fall = nt.nodes.new('ShaderNodeMapRange')
    nt.links.new(sep.outputs[2], sock(fall, ['Value']))
    set_input(fall, ['From Min'], 0.0); set_input(fall, ['From Max'], 1.0)
    set_input(fall, ['To Min'], 1.0); set_input(fall, ['To Max'], 0.0)
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(sock(noise, ['Fac'], out=True), mul.inputs[0]); nt.links.new(sock(fall, ['Result'], out=True), mul.inputs[1])
    dens = nt.nodes.new('ShaderNodeMath'); dens.operation = 'MULTIPLY'; dens.inputs[1].default_value = 0.35
    nt.links.new(mul.outputs[0], dens.inputs[0])
    nt.links.new(dens.outputs[0], sock(vol, ['Density']))
    nt.links.new(sock(vol, ['Volume'], out=True), sock(out, ['Volume']))
    return mat


# ----------------------------------------------------------------------------------------------- geometry helpers
def mesh_object(name, verts, faces, uvs, collection, material=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32).ravel())
    try:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    except Exception:  # noqa: BLE001
        pass
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    if material:
        me.materials.append(material)
    return ob


def quad_object(name, corners, v0, v1, collection, material):
    verts = np.array(corners)
    uvs = [(0.0, v0), (1.0, v0), (1.0, v1), (0.0, v1)]
    return mesh_object(name, verts, [(0, 1, 2, 3)], uvs, collection, material)


def grid_res(layer, cell):
    wm, hm = layer['width'] * S, layer['height'] * S
    nx = int(min(360, max(48, wm / cell)))
    ny = int(min(360, max(48, hm / cell)))
    return nx, ny


# ----------------------------------------------------------------------------------------------- build: terrain, lake, lands, overlays
sampler = P.HeightSampler(S)
lift = H['overlayLift']
overlay_index = 0
t = time.time()
for layer in M['layers']:
    img = load_image(layer['asset'])
    role = layer['role']
    if role == 'lakebed':
        mat = painted_material('M_' + layer['id'], img, emission=0.25, roughness=0.9, extension='MIRROR',
                               tile=P.tile_uv_scale(layer), specular=0.05)
        verts, faces, uvs = P.grid_mesh(layer, S, 1, 1, z=H['lakebed'])
        mesh_object(layer['id'], verts, faces, uvs, coll('Lake'), mat)
        (cx, cy), (wm, hm), _ = P.layer_frame(layer, S)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, (H['lakebed'] - 0.05 + H['waterSurface']) / 2.0))
        water = bpy.context.active_object
        water.name = 'Lake_Water'
        water.scale = (wm, hm, abs(H['waterSurface'] - H['lakebed'] + 0.05))
        for c in water.users_collection:
            c.objects.unlink(water)
        coll('Lake').objects.link(water)
        water.data.materials.append(water_material())
        continue
    if role == 'matte':
        mp = P.matte_panel(layer, P.matte_ground_v(layer, alpha_array(img)), cam_cfg['keys'][-1], S, z=H['waterSurface'])
        base, rt, up = np.array(mp['base']), np.array(mp['right']), np.array(mp['up'])
        lo, hi = -(1 - mp['ground_v']) * mp['height'], mp['ground_v'] * mp['height']
        corners = [base - rt * mp['width'] / 2 + up * lo, base + rt * mp['width'] / 2 + up * lo,
                   base + rt * mp['width'] / 2 + up * hi, base - rt * mp['width'] / 2 + up * hi]
        mat = painted_material('M_' + layer['id'], img, emission=0.42, roughness=0.8, feather=0.04)
        quad_object(layer['id'], corners, 0.0, 1.0, coll('Mattes'), mat)
        if layer.get('groundSplit'):
            sub, sub_alpha, vr = P.split_ground(layer, alpha_array(img), mp['ground_v'])
            heights = P.relief_heights(sub_alpha, sub)
            sampler.add(sub, heights)
            nx, ny = grid_res(sub, 0.32)
            verts, faces, uvs = P.grid_mesh(sub, S, nx, ny, heights=heights, v_range=vr)
            gmat = painted_material('M_' + sub['id'], img, emission=0.32, roughness=0.8, feather=0.06)
            mesh_object(sub['id'], verts, faces, uvs, coll('Terrain'), gmat)
        continue
    if 'relief' in layer:
        heights = P.relief_heights(alpha_array(img), layer)
        sampler.add(layer, heights)
        cell = 0.18 if role == 'land' else 0.32
        nx, ny = grid_res(layer, cell)
        verts, faces, uvs = P.grid_mesh(layer, S, nx, ny, heights=heights)
        feather = 0.06 if role == 'terrain' else 0.0
        mat = painted_material('M_' + layer['id'], img, emission=0.32, roughness=0.8, extension='CLIP', feather=feather)
        mesh_object(layer['id'], verts, faces, uvs, coll('Terrain' if role == 'terrain' else 'Lands'), mat)
        continue
    # flat overlays (environment sprites, road, bridges), stacked in app draw order just above the land top
    overlay_index += 1
    z = H['landTop'] + lift * overlay_index
    verts, faces, uvs = P.grid_mesh(layer, S, 1, 1, z=z)
    mat = painted_material('M_' + layer['id'], img, emission=0.32, roughness=0.8)
    mesh_object(layer['id'], verts, faces, uvs, coll('Overlays'), mat)
REPORT['timings']['ground'] = round(time.time() - t, 1)
log('ground layers built')

# ----------------------------------------------------------------------------------------------- waterfall (approved short-r1 bands)
wf = M['waterfall']
wf_img = load_image(wf['asset'])
wf_mat = painted_material('M_waterfall_v2', wf_img, emission=0.55, roughness=0.35, specular=0.4)
bands = P.waterfall_bands(wf, S, H)
for b in bands:
    quad_object('waterfall_' + b['shape'], b['corners'], b['v0'], b['v1'], coll('Landmarks'), wf_mat)
pool = bands[0]['corners']
px = sum(c[0] for c in pool) / 4.0
py = sum(c[1] for c in pool) / 4.0
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py + 1.0, 2.2))
mist = bpy.context.active_object
mist.name = 'Waterfall_Mist'
mist.scale = (abs(pool[1][0] - pool[0][0]) * 1.1, 6.0, 4.4)
for c in mist.users_collection:
    c.objects.unlink(mist)
coll('Atmosphere').objects.link(mist)
mist.data.materials.append(mist_material())
log('waterfall built')

# ----------------------------------------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new('POC01_Camera')
cam_data.lens = cam_cfg['lensMm']
cam_data.sensor_width = cam_cfg['sensorMm']
cam_data.clip_start = 0.05
cam_data.clip_end = 3000.0
cam_data.dof.use_dof = True
cam = bpy.data.objects.new('POC01_Camera', cam_data)
coll('Camera').objects.link(cam)
scene.camera = cam
cam.rotation_mode = 'XYZ'
for k in cam_cfg['keys']:
    loc, rot = P.camera_pose(k, S)
    cam.location = loc
    cam.rotation_euler = rot
    cam.keyframe_insert('location', frame=k['f'])
    cam.keyframe_insert('rotation_euler', frame=k['f'])
    cam_data.dof.focus_distance = k['focus']
    cam_data.dof.aperture_fstop = k['fstop']
    cam_data.dof.keyframe_insert('focus_distance', frame=k['f'])
    cam_data.dof.keyframe_insert('aperture_fstop', frame=k['f'])
log('camera keyed (%d keys, %d mm fixed lens)' % (len(cam_cfg['keys']), cam_cfg['lensMm']))

# ----------------------------------------------------------------------------------------------- landmark cards
cards_by_group = {}
for c in M['landmarkCards']:
    cards_by_group.setdefault(c['group'], []).append(c)
frt, fup = P.final_view_basis(cam_cfg['keys'][-1])
fnorm = np.cross(frt, fup)          # = -forward: points toward the final camera
for group, cards in cards_by_group.items():
    for i, c in enumerate(cards):
        (X, Y), (wm, hm) = P.card_anchor(c, S)
        g = c['groundV']
        base = np.array([X, Y, H['landTop']]) + fnorm * 0.03 * i     # later app layers sit a few cm nearer the lens
        lo, hi = -(1 - g) * hm, g * hm
        corners = [base - frt * wm / 2 + fup * lo, base + frt * wm / 2 + fup * lo, base + frt * wm / 2 + fup * hi, base - frt * wm / 2 + fup * hi]
        mat = painted_material('M_' + c['id'], load_image(c['asset']), emission=0.45, roughness=0.7)
        # Fixed panel perpendicular to the final view: depth order follows the map, and the reveal frame reproduces the app art.
        quad_object(c['id'], corners, 0.0, 1.0, coll('Landmarks'), mat)
log('landmark cards placed')

# ----------------------------------------------------------------------------------------------- foreground flowers
first = cam_cfg['keys'][0]
sprites = [load_image(p) for p in M['foregroundFlowers']]
sprite_mats = [painted_material('M_flower_%d' % i, im, emission=0.38, roughness=0.65) for i, im in enumerate(sprites)]
placements = P.scatter_flowers(M['scatter'], first, sampler, len(sprites))
for i, f in enumerate(placements):
    im = sprites[f['sprite_index']]
    aspect = im.size[0] / float(im.size[1])
    hm = f['height_m']; wm = hm * aspect
    verts = np.array([(-wm / 2, 0, -0.04 * hm), (wm / 2, 0, -0.04 * hm), (wm / 2, 0, hm), (-wm / 2, 0, hm)])
    ob = mesh_object('flower_%03d' % i, verts, [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], coll('Flowers'),
                     sprite_mats[f['sprite_index']])
    X, Y = P.world_to_bl(f['px'], f['py'], S)
    ob.location = (X, Y, f['z'])
    con = ob.constraints.new('LOCKED_TRACK')       # stays upright, turns to face the lens
    con.target = cam
    con.track_axis = 'TRACK_NEGATIVE_Y'
    con.lock_axis = 'LOCK_Z'
REPORT['counts']['flowers'] = len(placements)
log('%d foreground flower cards' % len(placements))

# ----------------------------------------------------------------------------------------------- light and world
L = M['light']
sun_data = bpy.data.lights.new('Sun', 'SUN')
sun_data.energy = L['sunStrength']
sun_data.color = L['sunColor']
try_set(sun_data, 'angle', math.radians(L['sunAngleDeg']), 'Sun')
sun = bpy.data.objects.new('Sun', sun_data)
coll('Lighting').objects.link(sun)
el, az = math.radians(L['sunElevationDeg']), math.radians(L['sunAzimuthDeg'])
to_sun = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))   # azimuth clockwise from north
from mathutils import Vector  # noqa: E402
sun.rotation_mode = 'QUATERNION'
sun.rotation_quaternion = Vector(to_sun).to_track_quat('Z', 'Y')

world = bpy.data.worlds.new('POC01_World')
scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes.clear()
wout = wn.nodes.new('ShaderNodeOutputWorld')
bg = wn.nodes.new('ShaderNodeBackground')
sky = wn.nodes.new('ShaderNodeTexSky')
for st in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
    try:
        sky.sky_type = st
        REPORT['sky_type'] = st
        break
    except Exception:  # noqa: BLE001
        continue
for attr, val in (('sun_disc', False), ('sun_elevation', el), ('sun_rotation', az), ('altitude', 200.0),
                  ('air_density', 1.0), ('dust_density', 2.5)):
    if hasattr(sky, attr):
        try_set(sky, attr, val, 'Sky')
wn.links.new(sock(sky, ['Color'], out=True), sock(bg, ['Color']))
set_input(bg, ['Strength'], L['skyStrength'])
wn.links.new(sock(bg, ['Background'], out=True), sock(wout, ['Surface']))
if not NO_HAZE:
    haze = wn.nodes.new('ShaderNodeVolumePrincipled')
    set_input(haze, ['Color'], tuple(L['hazeColor']) + (1.0,))
    set_input(haze, ['Density'], L['hazeDensity'])
    set_input(haze, ['Anisotropy'], L['hazeAnisotropy'])
    wn.links.new(sock(haze, ['Volume'], out=True), sock(wout, ['Volume']))
log('light and world set (sky %s, haze %s)' % (REPORT.get('sky_type'), not NO_HAZE))

# ----------------------------------------------------------------------------------------------- render settings
r = scene.render
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
REPORT['engines'] = engines
if PRESET == 'final':
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = 1920, 1080
    cy = scene.cycles
    try_set(cy, 'samples', 384, 'cycles')
    try_set(cy, 'use_adaptive_sampling', True, 'cycles')
    try_set(cy, 'adaptive_threshold', 0.008, 'cycles')
    try_set(cy, 'use_denoising', True, 'cycles')
    try_set(cy, 'max_bounces', 10, 'cycles')
    try_set(cy, 'transmission_bounces', 8, 'cycles')
    try_set(cy, 'transparent_max_bounces', 24, 'cycles')
    try_set(cy, 'volume_bounces', 1, 'cycles')
    try_set(cy, 'volume_step_rate', 2.0, 'cycles')
    try_set(cy, 'caustics_refractive', False, 'cycles')
    try_set(cy, 'blur_glossy', 0.6, 'cycles')
    device = 'CPU'
    try:
        cp = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
            try:
                cp.compute_device_type = kind
            except Exception:  # noqa: BLE001
                continue
            cp.get_devices()
            devs = [d for d in cp.devices if d.type == kind]
            if devs:
                for d in cp.devices:
                    d.use = d.type == kind
                device = kind
                break
    except Exception as e:  # noqa: BLE001
        warn('GPU detection failed: %s' % e)
    cy.device = 'GPU' if device != 'CPU' else 'CPU'
    REPORT['device'] = device
else:
    eevee = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    r.engine = eevee
    r.resolution_x, r.resolution_y = 960, 540
    ev = scene.eevee
    for attr, val in (('taa_render_samples', 64), ('use_raytracing', True), ('use_shadows', True),
                      ('volumetric_tile_size', '4'), ('volumetric_samples', 96), ('volumetric_end', 400.0),
                      ('use_volumetric_shadows', True), ('use_gtao', True), ('use_ssr', True), ('use_ssr_refraction', True),
                      ('fast_gi_method', 'GLOBAL_ILLUMINATION'), ('use_soft_shadows', True)):
        if hasattr(ev, attr):
            try_set(ev, attr, val, 'eevee')
    REPORT['device'] = 'EEVEE'
r.resolution_percentage = 100
try_set(r, 'use_motion_blur', True, 'render')
try_set(r, 'motion_blur_shutter', 0.5, 'render')
if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'use_motion_blur'):
    try_set(scene.eevee, 'use_motion_blur', True, 'eevee')
vs = scene.view_settings
for vt in ('AgX', 'Filmic'):
    if try_set(vs, 'view_transform', vt, 'view_settings'):
        REPORT['view_transform'] = vt
        break
for look in ('AgX - Medium High Contrast', 'Medium High Contrast', 'None'):
    try:
        vs.look = look
        REPORT['look'] = look
        break
    except Exception:  # noqa: BLE001
        continue
vl = scene.view_layers[0]
for attr in ('use_pass_z', 'use_pass_mist', 'use_pass_normal', 'use_pass_cryptomatte_object'):
    if hasattr(vl, attr):
        try_set(vl, attr, True, 'view_layer')
r.image_settings.file_format = 'PNG'
try_set(r.image_settings, 'color_depth', '16', 'image_settings')
r.film_transparent = False
log('render settings: %s, %dx%d, device %s' % (r.engine, r.resolution_x, r.resolution_y, REPORT['device']))

# ----------------------------------------------------------------------------------------------- save and render
blend_path = os.path.join(OUT, 'poc01_garden_reveal_%s.blend' % PRESET)
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
try:
    bpy.ops.file.make_paths_relative()      # texture paths stay pointing at the approved files, relative to the .blend
except Exception as e:  # noqa: BLE001
    warn('make_paths_relative: %s' % e)
bpy.ops.wm.save_mainfile(compress=True)
REPORT['blend'] = blend_path
log('saved ' + blend_path)


def render_frame(f, folder):
    scene.frame_set(f)
    r.filepath = os.path.join(folder, 'frame_%04d.png' % f)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    REPORT['timings']['frame_%04d' % f] = round(time.time() - t, 1)
    log('rendered frame %d in %.1fs' % (f, time.time() - t))


if RENDER in ('stills', 'anim'):
    folder = os.path.join(OUT, '%s_%s' % (RENDER, PRESET))
    os.makedirs(folder, exist_ok=True)
    if RENDER == 'stills':
        n = cam_cfg['frames']
        frames = sorted({1, round(n * 0.2), round(n * 0.4), round(n * 0.67), n})
    else:
        a, b = (1, cam_cfg['frames'])
        if FRAMES:
            a, b = [int(x) for x in FRAMES.split('-')]
        frames = list(range(a, b + 1))
    for f in frames:
        render_frame(f, folder)
    REPORT['render_folder'] = folder

REPORT['timings']['total'] = round(time.time() - T0, 1)
json.dump(REPORT, open(os.path.join(OUT, 'build_report_%s.json' % PRESET), 'w'), indent=1)
log('done. Report: output/build_report_%s.json (%d warnings)' % (PRESET, len(REPORT['warnings'])))
