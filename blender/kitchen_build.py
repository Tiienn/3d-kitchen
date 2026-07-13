"""Photoreal L-shaped kitchen build for a live Blender 5.1.2 instance.

IDEMPOTENT: wipes all mesh/material/light/camera/collection data it can, then
rebuilds from scratch. Re-running produces an identical object count.

Coordinate contract (meters, Z up):
  Floor z=0, X in [-2.5, 2.5], Y in [-2.1, 2.1] (room 5.0 x 4.2).
  Walls 2.7 high. Back wall y=+2.1, left wall x=-2.5.
  L-kitchen along back wall (+Y) and left wall (-X).
"""

import bpy
import bmesh
import math
from mathutils import Vector

# ----------------------------------------------------------------------------
# 0. FULL WIPE (idempotency)
# ----------------------------------------------------------------------------

def wipe_scene():
    # Unlink & remove all objects
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for lt in list(bpy.data.lights):
        bpy.data.lights.remove(lt)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


# ----------------------------------------------------------------------------
# 1. COLLECTIONS
# ----------------------------------------------------------------------------

COLLECTIONS = {}

def make_collections():
    scene_coll = bpy.context.scene.collection
    for name in ("Room", "Cabinets", "Appliances", "Island", "Lighting"):
        c = bpy.data.collections.new(name)
        scene_coll.children.link(c)
        COLLECTIONS[name] = c


def link_to(obj, coll_name):
    COLLECTIONS[coll_name].objects.link(obj)


# ----------------------------------------------------------------------------
# 2. GEOMETRY HELPERS (bpy.data / bmesh only - no risky ops)
# ----------------------------------------------------------------------------

def _new_mesh_obj(name, bm, coll_name, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    obj = bpy.data.objects.new(name, me)
    if material is not None:
        me.materials.append(material)
    link_to(obj, coll_name)
    return obj


def box_bounds(name, xmin, xmax, ymin, ymax, zmin, zmax, coll_name, material=None):
    """Axis-aligned box from min/max bounds."""
    bm = bmesh.new()
    verts = [
        bm.verts.new((xmin, ymin, zmin)),
        bm.verts.new((xmax, ymin, zmin)),
        bm.verts.new((xmax, ymax, zmin)),
        bm.verts.new((xmin, ymax, zmin)),
        bm.verts.new((xmin, ymin, zmax)),
        bm.verts.new((xmax, ymin, zmax)),
        bm.verts.new((xmax, ymax, zmax)),
        bm.verts.new((xmin, ymax, zmax)),
    ]
    faces = [
        (0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    for f in faces:
        bm.faces.new([verts[i] for i in f])
    # Ensure consistent OUTWARD normals (raw winding above is inconsistent; a
    # flipped normal renders black in Cycles when lit from the front).
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    return _new_mesh_obj(name, bm, coll_name, material)


def box_cs(name, cx, cy, cz, sx, sy, sz, coll_name, material=None):
    """Box from center + full size."""
    return box_bounds(name, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2,
                      cz - sz / 2, cz + sz / 2, coll_name, material)


def cylinder(name, cx, cy, cz, radius, length, axis, coll_name, material=None, segments=20):
    """Cylinder centered at (cx,cy,cz), extruded 'length' along axis 'X'/'Y'/'Z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=length)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts,
                         matrix=_rot_matrix('Y', math.radians(90)))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts,
                         matrix=_rot_matrix('X', math.radians(90)))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(cx, cy, cz))
    bm.normal_update()
    return _new_mesh_obj(name, bm, coll_name, material)


def _rot_matrix(axis, angle):
    from mathutils import Matrix
    return Matrix.Rotation(angle, 3, axis)


def join_objects(name, objs):
    """Merge a list of objects into the first, renaming it. Keeps first's collection/material."""
    if not objs:
        return None
    base = objs[0]
    if len(objs) == 1:
        base.name = name
        return base
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    # carry material from base
    if base.data.materials:
        me.materials.append(base.data.materials[0])
    new_obj = bpy.data.objects.new(name, me)
    # link into same collection as base
    for c in base.users_collection:
        c.objects.link(new_obj)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return new_obj


# ----------------------------------------------------------------------------
# 3. MATERIALS  (names are a hard contract)
# ----------------------------------------------------------------------------

MATS = {}

def _principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None

def _set(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def make_materials():
    # MAT_cabinet ----------------------------------------------------------
    m = bpy.data.materials.new("MAT_cabinet")
    m.use_nodes = True
    b = _principled(m)
    _set(b, 'Base Color', (0.92, 0.92, 0.90, 1.0))
    _set(b, 'Roughness', 0.55)
    _set(b, 'Metallic', 0.0)
    MATS['MAT_cabinet'] = m

    # MAT_counter_granite --------------------------------------------------
    m = bpy.data.materials.new("MAT_counter_granite")
    m.use_nodes = True
    nt = m.node_tree
    b = _principled(m)
    _set(b, 'Roughness', 0.18)
    _set(b, 'Metallic', 0.0)
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = 0.6
    tex_coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 12.0
    if 'Roughness' in noise.inputs:
        noise.inputs['Roughness'].default_value = 0.7
    noise2 = nt.nodes.new('ShaderNodeTexNoise')
    noise2.inputs['Scale'].default_value = 8.0
    noise2.inputs['Detail'].default_value = 6.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    # near-black granite base with lighter grey speckle
    e0 = ramp.color_ramp.elements[0]
    e0.position = 0.25
    e0.color = (0.02, 0.02, 0.025, 1.0)
    e1 = ramp.color_ramp.elements[1]
    e1.position = 0.65
    e1.color = (0.22, 0.22, 0.23, 1.0)
    emid = ramp.color_ramp.elements.new(0.82)
    emid.color = (0.55, 0.54, 0.52, 1.0)  # occasional light grey flecks
    nt.links.new(tex_coord.outputs['Object'], noise.inputs['Vector'])
    nt.links.new(tex_coord.outputs['Object'], noise2.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    # subtle bump
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.05
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    MATS['MAT_counter_granite'] = m

    # MAT_steel ------------------------------------------------------------
    m = bpy.data.materials.new("MAT_steel")
    m.use_nodes = True
    b = _principled(m)
    _set(b, 'Base Color', (0.62, 0.63, 0.65, 1.0))
    _set(b, 'Metallic', 0.9)
    _set(b, 'Roughness', 0.25)
    MATS['MAT_steel'] = m

    # MAT_cooktop_black ----------------------------------------------------
    m = bpy.data.materials.new("MAT_cooktop_black")
    m.use_nodes = True
    b = _principled(m)
    _set(b, 'Base Color', (0.02, 0.02, 0.02, 1.0))
    _set(b, 'Metallic', 0.1)
    _set(b, 'Roughness', 0.30)
    MATS['MAT_cooktop_black'] = m

    # MAT_floor_tile -------------------------------------------------------
    # Square tiles with a distinctly darker grout so the grid reads at camera
    # distance, plus faint per-tile color variation and roughness variation.
    m = bpy.data.materials.new("MAT_floor_tile")
    m.use_nodes = True
    nt = m.node_tree
    b = _principled(m)
    tex_coord = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.0            # aligned grid (square tiles, not brick-offset)
    brick.offset_frequency = 2
    brick.inputs['Scale'].default_value = 1.6
    if 'Mortar Size' in brick.inputs:
        brick.inputs['Mortar Size'].default_value = 0.022
    if 'Mortar Smooth' in brick.inputs:
        brick.inputs['Mortar Smooth'].default_value = 0.1
    if 'Brick Width' in brick.inputs:
        brick.inputs['Brick Width'].default_value = 0.5
    if 'Row Height' in brick.inputs:
        brick.inputs['Row Height'].default_value = 0.5
    if 'Bias' in brick.inputs:
        brick.inputs['Bias'].default_value = 0.0   # even mix of the two tile tones
    # slightly warmer/lighter two tones -> visible tile-to-tile variation
    brick.inputs['Color1'].default_value = (0.82, 0.80, 0.75, 1.0)
    brick.inputs['Color2'].default_value = (0.70, 0.67, 0.61, 1.0)
    brick.inputs['Mortar'].default_value = (0.12, 0.115, 0.11, 1.0)  # darker grout
    nt.links.new(tex_coord.outputs['Generated'], brick.inputs['Vector'])

    # faint large-scale mottling across the floor
    mottle = nt.nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 4.0
    mottle.inputs['Detail'].default_value = 3.0
    nt.links.new(tex_coord.outputs['Generated'], mottle.inputs['Vector'])
    mott_mix = nt.nodes.new('ShaderNodeMixRGB')
    mott_mix.blend_type = 'OVERLAY'
    mott_mix.inputs['Fac'].default_value = 0.08
    nt.links.new(brick.outputs['Color'], mott_mix.inputs['Color1'])
    nt.links.new(mottle.outputs['Color'], mott_mix.inputs['Color2'])
    nt.links.new(mott_mix.outputs['Color'], b.inputs['Base Color'])

    # roughness ~0.35 with slight variation (grout rougher than tile face)
    rough_ramp = nt.nodes.new('ShaderNodeValToRGB')
    rough_ramp.color_ramp.elements[0].position = 0.0
    rough_ramp.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1.0)  # tile face
    rough_ramp.color_ramp.elements[1].position = 1.0
    rough_ramp.color_ramp.elements[1].color = (0.60, 0.60, 0.60, 1.0)  # grout
    nt.links.new(brick.outputs['Fac'], rough_ramp.inputs['Fac'])
    nt.links.new(rough_ramp.outputs['Color'], b.inputs['Roughness'])

    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.30
    nt.links.new(brick.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    MATS['MAT_floor_tile'] = m

    # MAT_butcher_block ----------------------------------------------------
    # Believable edge-grain butcher block. The island long axis is X, so the
    # grain must run along X. We build the coordinate space with a Mapping node
    # that heavily COMPRESSES X and stretches Y/Z, so every texture feature is
    # elongated along X (streaky grain parallel to the long axis). Wavy fine
    # grain (distorted Wave) + a low-freq plank tint + roughness variation give
    # warm honey->brown wood rather than uniform corduroy.
    m = bpy.data.materials.new("MAT_butcher_block")
    m.use_nodes = True
    nt = m.node_tree
    b = _principled(m)
    tex_coord = nt.nodes.new('ShaderNodeTexCoord')

    mapping = nt.nodes.new('ShaderNodeMapping')
    # scale.x small -> features long along X; scale.y large -> variation packs
    # into the plank WIDTH so the streaks lie along the long axis (X).
    mapping.inputs['Scale'].default_value = (0.5, 9.0, 3.0)
    nt.links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])

    # PRIMARY grain: a heavily stretched Noise. Noise is NON-periodic, so the
    # streaks it produces are irregular/wavy -- this is what kills the corduroy.
    grain_noise = nt.nodes.new('ShaderNodeTexNoise')
    grain_noise.inputs['Scale'].default_value = 3.5
    grain_noise.inputs['Detail'].default_value = 10.0
    if 'Roughness' in grain_noise.inputs:
        grain_noise.inputs['Roughness'].default_value = 0.75
    if 'Lacunarity' in grain_noise.inputs:
        grain_noise.inputs['Lacunarity'].default_value = 2.2
    nt.links.new(mapping.outputs['Vector'], grain_noise.inputs['Vector'])

    # SECONDARY: darker grain LINES from a very heavily distorted Wave. High
    # distortion (6) makes the bands wander so they read as natural grain
    # streaks rather than straight ridges.
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    if hasattr(wave, 'bands_direction'):
        wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 2.5
    wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 2.0
    if 'Detail Scale' in wave.inputs:
        wave.inputs['Detail Scale'].default_value = 2.0
    nt.links.new(mapping.outputs['Vector'], wave.inputs['Vector'])

    # Noise dominant, wave subordinate -> irregular wavy grain with occasional
    # darker streaks.
    mix_grain = nt.nodes.new('ShaderNodeMixRGB')
    mix_grain.blend_type = 'MULTIPLY'
    mix_grain.inputs['Fac'].default_value = 0.5
    nt.links.new(grain_noise.outputs['Fac'], mix_grain.inputs['Color1'])
    nt.links.new(wave.outputs['Fac'], mix_grain.inputs['Color2'])

    # Warm two-tone grain ramp: honey -> darker walnut brown.
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    e0 = ramp.color_ramp.elements[0]
    e0.position = 0.10
    e0.color = (0.64, 0.42, 0.21, 1.0)   # honey
    e1 = ramp.color_ramp.elements[1]
    e1.position = 0.70
    e1.color = (0.28, 0.15, 0.06, 1.0)   # darker brown grain line
    emid = ramp.color_ramp.elements.new(0.35)
    emid.color = (0.49, 0.30, 0.14, 1.0)
    nt.links.new(mix_grain.outputs['Color'], ramp.inputs['Fac'])

    # Per-plank tint: low-freq noise stretched along X shifts whole strips
    # warmer/cooler so adjacent planks differ slightly.
    plank_noise = nt.nodes.new('ShaderNodeTexNoise')
    plank_noise.inputs['Scale'].default_value = 1.5
    plank_noise.inputs['Detail'].default_value = 2.0
    nt.links.new(mapping.outputs['Vector'], plank_noise.inputs['Vector'])
    plank_mix = nt.nodes.new('ShaderNodeMixRGB')
    plank_mix.blend_type = 'OVERLAY'
    plank_mix.inputs['Fac'].default_value = 0.18
    nt.links.new(ramp.outputs['Color'], plank_mix.inputs['Color1'])
    nt.links.new(plank_noise.outputs['Color'], plank_mix.inputs['Color2'])
    nt.links.new(plank_mix.outputs['Color'], b.inputs['Base Color'])

    # Roughness variation (satin wood): grain lines slightly rougher.
    rough_ramp = nt.nodes.new('ShaderNodeValToRGB')
    rough_ramp.color_ramp.elements[0].position = 0.0
    rough_ramp.color_ramp.elements[0].color = (0.28, 0.28, 0.28, 1.0)
    rough_ramp.color_ramp.elements[1].position = 1.0
    rough_ramp.color_ramp.elements[1].color = (0.48, 0.48, 0.48, 1.0)
    nt.links.new(mix_grain.outputs['Color'], rough_ramp.inputs['Fac'])
    nt.links.new(rough_ramp.outputs['Color'], b.inputs['Roughness'])

    # Subtle grain bump.
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.10
    nt.links.new(mix_grain.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    MATS['MAT_butcher_block'] = m

    # MAT_wall -------------------------------------------------------------
    m = bpy.data.materials.new("MAT_wall")
    m.use_nodes = True
    b = _principled(m)
    _set(b, 'Base Color', (0.90, 0.87, 0.81, 1.0))
    _set(b, 'Roughness', 0.85)
    _set(b, 'Metallic', 0.0)
    MATS['MAT_wall'] = m

    # MAT_glass ------------------------------------------------------------
    m = bpy.data.materials.new("MAT_glass")
    m.use_nodes = True
    b = _principled(m)
    _set(b, 'Base Color', (1.0, 1.0, 1.0, 1.0))
    _set(b, 'Roughness', 0.0)
    _set(b, 'Transmission Weight', 1.0)
    _set(b, 'IOR', 1.45)
    MATS['MAT_glass'] = m


# ----------------------------------------------------------------------------
# 4. ROOM
# ----------------------------------------------------------------------------

XMIN, XMAX = -2.5, 2.5
YMIN, YMAX = -2.1, 2.1
WALL_H = 2.7
WALL_T = 0.10  # wall thickness

def build_room():
    # Floor
    box_bounds("ROOM_floor", XMIN, XMAX, YMIN, YMAX, -0.02, 0.0,
               "Room", MATS['MAT_floor_tile'])
    # Ceiling (invisible to camera)
    ceil = box_bounds("ROOM_ceiling", XMIN, XMAX, YMIN, YMAX, WALL_H, WALL_H + 0.02,
                      "Room", MATS['MAT_wall'])
    ceil.visible_camera = False

    # Left wall (x=-2.5), full, visible
    box_bounds("ROOM_wall_left", XMIN - WALL_T, XMIN, YMIN, YMAX, 0.0, WALL_H,
               "Room", MATS['MAT_wall'])

    # Right wall (x=+2.5), invisible to camera but present for GI
    rw = box_bounds("ROOM_wall_right", XMAX, XMAX + WALL_T, YMIN, YMAX, 0.0, WALL_H,
                    "Room", MATS['MAT_wall'])
    rw.visible_camera = False

    # Back wall (y=+2.1) built AROUND the window opening from boxes.
    # Window opening: x in [-0.9, 0.3], z in [1.1, 2.0]
    wx0, wx1 = -0.90, 0.30
    wz0, wz1 = 1.10, 2.00
    y0, y1 = YMAX, YMAX + WALL_T
    wall = MATS['MAT_wall']
    # left of opening
    box_bounds("ROOM_wall_back_L", XMIN - WALL_T, wx0, y0, y1, 0.0, WALL_H, "Room", wall)
    # right of opening
    box_bounds("ROOM_wall_back_R", wx1, XMAX, y0, y1, 0.0, WALL_H, "Room", wall)
    # below opening (sill)
    box_bounds("ROOM_wall_back_below", wx0, wx1, y0, y1, 0.0, wz0, "Room", wall)
    # above opening (header)
    box_bounds("ROOM_wall_back_above", wx0, wx1, y0, y1, wz1, WALL_H, "Room", wall)

    # Window frame + glass in the opening
    build_window(wx0, wx1, wz0, wz1, y0, y1)


def build_window(wx0, wx1, wz0, wz1, y0, y1):
    frame = MATS['MAT_steel']
    ft = 0.05  # frame thickness (into room)
    fw = 0.06  # frame width
    yc = y0  # frame sits at inner wall plane
    ymid = (y0 + y1) / 2
    # frame border boxes (extend slightly into room).
    # NON-OVERLAPPING layout to avoid coplanar/z-fighting steel faces that
    # rendered as black marks at the mullion/frame corners:
    #  - top & bottom rails span the full opening width,
    #  - left & right stiles and the mullion occupy ONLY the interior height
    #    between the top and bottom rails (no corner overlap, no double faces).
    yf0, yf1 = y0 - ft, y0 + WALL_T
    zin0, zin1 = wz0 + fw, wz1 - fw  # interior span between top/bottom rails
    box_bounds("WIN_frame_bottom", wx0, wx1, yf0, yf1, wz0, wz0 + fw, "Room", frame)
    box_bounds("WIN_frame_top", wx0, wx1, yf0, yf1, wz1 - fw, wz1, "Room", frame)
    box_bounds("WIN_frame_left", wx0, wx0 + fw, yf0, yf1, zin0, zin1, "Room", frame)
    box_bounds("WIN_frame_right", wx1 - fw, wx1, yf0, yf1, zin0, zin1, "Room", frame)
    # center mullion (interior height only -> no overlap with top/bottom rails)
    xm = (wx0 + wx1) / 2
    box_bounds("WIN_mullion", xm - 0.02, xm + 0.02, yf0, yf1, zin0, zin1, "Room", frame)
    # glass pane. Do NOT let it cast shadows: a refractive pane would otherwise
    # block the sun (Cycles needs caustics for that path), killing the warm patch.
    # With shadow casting off, the sun streams cleanly through the opening and
    # lays a defined warm rectangle on the counter/floor.
    g = box_bounds("WIN_glass", wx0 + fw, wx1 - fw, ymid - 0.005, ymid + 0.005,
                   wz0 + fw, wz1 - fw, "Room", MATS['MAT_glass'])
    g.visible_shadow = False


# ----------------------------------------------------------------------------
# 5. CABINET HELPERS
# ----------------------------------------------------------------------------

BASE_H = 0.86
BASE_DEEP = 0.60
TOE_H = 0.10
TOE_DEEP = 0.05
CTR_TOP = 0.91
CTR_T = 0.05
UPPER_DEEP = 0.34
UPPER_H = 0.70
UPPER_Z0 = 1.50
UPPER_Z1 = 2.20

DOOR_T = 0.018
PANEL_INSET = 0.008
FRAME_BORDER = 0.06
GAP = 0.006  # gap between door faces


def shaker_front(name, xc, zc, width, height, face_axis, face_sign, front_coord,
                 coll_name, material):
    """A shaker door/drawer face: thin back-plate (recessed center panel) with a
    raised border frame around it, protruding toward the room.

    face_axis: 'Y' -> face lies in the XZ plane; 'X' -> face lies in the YZ plane.
    face_sign: outward direction toward the room along face_axis (+1 or -1).
    front_coord: coordinate of the carcass front (door mounts here, protruding out).
    xc: in-plane horizontal center (X if face_axis 'Y', else Y). zc: vertical center.
    """
    objs = []
    w = width - GAP
    h = height - GAP
    BP = DOOR_T - PANEL_INSET  # back-plate thickness (recessed panel sits here)
    # outward layers measured from carcass front toward the room (face_sign dir)
    c0 = front_coord                       # back of door (at carcass front)
    c_plate = front_coord + face_sign * BP     # recessed panel face
    c_frame = front_coord + face_sign * DOOR_T  # raised frame face
    if face_axis == 'Y':
        x0, x1 = xc - w / 2, xc + w / 2
        z0, z1 = zc - h / 2, zc + h / 2
        pa, pb = sorted((c0, c_plate))
        fa, fb = sorted((c0, c_frame))
        # back plate (full area) -> its outer surface is the recessed panel
        objs.append(box_bounds(name + "_panel", x0, x1, pa, pb, z0, z1, coll_name, material))
        # frame rails (raised border)
        objs.append(box_bounds(name + "_fr_b", x0, x1, fa, fb, z0, z0 + FRAME_BORDER, coll_name, material))
        objs.append(box_bounds(name + "_fr_t", x0, x1, fa, fb, z1 - FRAME_BORDER, z1, coll_name, material))
        objs.append(box_bounds(name + "_fr_l", x0, x0 + FRAME_BORDER, fa, fb, z0 + FRAME_BORDER, z1 - FRAME_BORDER, coll_name, material))
        objs.append(box_bounds(name + "_fr_r", x1 - FRAME_BORDER, x1, fa, fb, z0 + FRAME_BORDER, z1 - FRAME_BORDER, coll_name, material))
    else:  # face_axis == 'X'
        y0, y1 = xc - w / 2, xc + w / 2  # xc holds Y center here
        z0, z1 = zc - h / 2, zc + h / 2
        pa, pb = sorted((c0, c_plate))
        fa, fb = sorted((c0, c_frame))
        objs.append(box_bounds(name + "_panel", pa, pb, y0, y1, z0, z1, coll_name, material))
        objs.append(box_bounds(name + "_fr_b", fa, fb, y0, y1, z0, z0 + FRAME_BORDER, coll_name, material))
        objs.append(box_bounds(name + "_fr_t", fa, fb, y0, y1, z1 - FRAME_BORDER, z1, coll_name, material))
        objs.append(box_bounds(name + "_fr_l", fa, fb, y0, y0 + FRAME_BORDER, z0 + FRAME_BORDER, z1 - FRAME_BORDER, coll_name, material))
        objs.append(box_bounds(name + "_fr_r", fa, fb, y1 - FRAME_BORDER, y1, z0 + FRAME_BORDER, z1 - FRAME_BORDER, coll_name, material))
    return join_objects(name, objs)


def bar_handle(name, xc, zc, length, face_axis, face_sign, front_coord, coll_name,
               orient='H'):
    """Steel bar handle standing off the front by ~0.03. orient H=horizontal, V=vertical."""
    r = 0.008
    standoff = 0.03
    if face_axis == 'Y':
        yc = front_coord + face_sign * standoff
        if orient == 'H':
            return cylinder(name, xc, yc, zc, r, length, 'X', coll_name, MATS['MAT_steel'])
        else:
            return cylinder(name, xc, yc, zc, r, length, 'Z', coll_name, MATS['MAT_steel'])
    else:
        xc_coord = front_coord + face_sign * standoff
        # xc holds Y center
        if orient == 'H':
            return cylinder(name, xc_coord, xc, zc, r, length, 'Y', coll_name, MATS['MAT_steel'])
        else:
            return cylinder(name, xc_coord, xc, zc, r, length, 'Z', coll_name, MATS['MAT_steel'])


# ----------------------------------------------------------------------------
# 6. BASE CABINET RUNS + COUNTERTOPS
# ----------------------------------------------------------------------------

# Back run occupies the corner. Front face at y = YMAX - BASE_DEEP = 1.5
BACK_FRONT_Y = YMAX - BASE_DEEP        # 1.50
BACK_RUN_X0 = XMIN                     # -2.5 (corner)
BACK_RUN_X1 = 1.90
# Left run below the corner, front face at x = XMIN + BASE_DEEP = -1.9
LEFT_FRONT_X = XMIN + BASE_DEEP        # -1.90
LEFT_RUN_Y1 = BACK_FRONT_Y            # 1.50 (touches back run)
LEFT_RUN_Y0 = -0.70

# Feature x-centers on the back run
SINK_CX = -0.30
SINK_OPEN_W = 0.70   # sink opening width  (X) cut in CTR_back
SINK_OPEN_D = 0.40   # sink opening depth  (Y) cut in CTR_back
DW_CX = 0.60      # dishwasher center
RANGE_CX = 1.45   # range center
RANGE_W = 0.76
DW_W = 0.60

cab = None

def build_base_runs():
    cab = MATS['MAT_cabinet']
    steel = MATS['MAT_steel']

    # ---- Back run carcass ----
    # Split around the range footprint [rx0, rx1] so the cabinet-material carcass
    # does NOT run through the steel range. A continuous carcass here put a
    # MAT_cabinet front face coplanar with the range's steel front (y=YMAX-BASE_DEEP),
    # which z-fought as a splotch AND made the range front follow cabinet-finish
    # swaps. The range now sits flush in the gap (butt joints at rx0 and rx1).
    rx0 = RANGE_CX - RANGE_W / 2
    rx1 = RANGE_CX + RANGE_W / 2
    box_bounds("CAB_base_back_carcass", BACK_RUN_X0, rx0,
               BACK_FRONT_Y, YMAX, TOE_H, BASE_H, "Cabinets", cab)
    box_bounds("CAB_base_back_carcass_R", rx1, BACK_RUN_X1,
               BACK_FRONT_Y, YMAX, TOE_H, BASE_H, "Cabinets", cab)
    # toe kick (recessed), split the same way
    box_bounds("CAB_base_back_toe", BACK_RUN_X0, rx0,
               BACK_FRONT_Y + TOE_DEEP, YMAX, 0.0, TOE_H, "Cabinets", cab)
    box_bounds("CAB_base_back_toe_R", rx1, BACK_RUN_X1,
               BACK_FRONT_Y + TOE_DEEP, YMAX, 0.0, TOE_H, "Cabinets", cab)

    # ---- Left run carcass ----
    box_bounds("CAB_base_left_carcass", XMIN, LEFT_FRONT_X,
               LEFT_RUN_Y0, LEFT_RUN_Y1, TOE_H, BASE_H, "Cabinets", cab)
    box_bounds("CAB_base_left_toe", XMIN + TOE_DEEP, LEFT_FRONT_X,
               LEFT_RUN_Y0, LEFT_RUN_Y1, 0.0, TOE_H, "Cabinets", cab)

    # ---- Doors on the BACK run ----
    # Regions occupied by appliances (no cabinet doors there):
    #   dishwasher: DW_CX +/- DW_W/2  -> [0.30, 0.90]
    #   range:      RANGE_CX +/- RANGE_W/2 -> [1.07, 1.83]
    #   sink cab (doors below sink, but sink hole above): keep doors [-0.75,0.15]
    door_zc = (TOE_H + BASE_H) / 2 + 0.0
    door_h = BASE_H - TOE_H - 0.02
    # segment A: corner..left of sink  x in [-2.45, -0.80]  -> two doors
    _back_door_segment(-2.45, -0.80, door_zc, door_h, cab)
    # segment B: sink doors x in [-0.75, 0.20]
    _back_door_segment(-0.75, 0.20, door_zc, door_h, cab)
    # (dishwasher 0.30-0.90 and range 1.07-1.83 handled as appliances)
    # segment C: between dishwasher and range x in [0.90, 1.05]  (filler, one narrow door)
    _back_door_segment(0.92, 1.05, door_zc, door_h, cab)
    # segment D: right of range x in [1.85, 1.88] tiny -> skip

    # ---- Doors on the LEFT run ----
    # The fridge has been relocated to the south end of the left wall, so the
    # whole left run front is now cabinetry. Fill it with evenly redistributed
    # shaker doors spanning the full carcass (no blank face where the fridge was).
    _left_door_segment(LEFT_RUN_Y0 + 0.03, LEFT_RUN_Y1 - 0.05, door_zc, door_h, cab)

    # ---- Countertops ----
    build_counters()


def _back_door_segment(x0, x1, zc, h, mat):
    """Fill an X-span of the back run with 1..n shaker doors + handles."""
    span = x1 - x0
    n = max(1, round(span / 0.55))
    dw = span / n
    for i in range(n):
        cx = x0 + dw * (i + 0.5)
        nm = f"CAB_base_back_door_{x0:.2f}_{i}".replace('-', 'm')
        shaker_front(nm, cx, zc, dw, h, 'Y', -1, BACK_FRONT_Y, "Cabinets", mat)
        # handle near top, offset toward a side
        hx = cx + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        bar_handle(nm + "_handle", hx, zc + h / 2 - 0.08, 0.12, 'Y', -1,
                   BACK_FRONT_Y, "Cabinets", orient='V')


def _left_door_segment(y0, y1, zc, h, mat):
    span = y1 - y0
    n = max(1, round(span / 0.55))
    dw = span / n
    for i in range(n):
        yc = y0 + dw * (i + 0.5)
        nm = f"CAB_base_left_door_{i}"
        shaker_front(nm, yc, zc, dw, h, 'X', +1, LEFT_FRONT_X, "Cabinets", mat)
        hy = yc + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        bar_handle(nm + "_handle", hy, zc + h / 2 - 0.08, 0.12, 'X', +1,
                   LEFT_FRONT_X, "Cabinets", orient='V')


def build_counters():
    gr = MATS['MAT_counter_granite']
    z0, z1 = CTR_TOP - CTR_T, CTR_TOP
    overhang = 0.02
    # Back run counter (front overhang toward -Y). Split around the range
    # footprint [rx0, rx1] the same way the carcass/toe kick are, so the granite
    # does NOT cover the slide-in range's cooktop from above. The two segments
    # butt flush against the range's steel sides (no x-overhang into the gap);
    # the -Y front overhang is unchanged. Mirrors build_base_runs' rx0/rx1.
    rx0 = RANGE_CX - RANGE_W / 2
    rx1 = RANGE_CX + RANGE_W / 2
    # CTR_back carries a real rectangular SINK OPENING. Rather than one slab we
    # compose the slab from 4 sub-boxes around the hole (front strip, back strip,
    # left, right) and join them into a single CTR_back mesh -- same
    # wall-around-window technique, NO booleans. Opening 0.70(X) x 0.40(Y),
    # centered on SINK_CX, centered in the counter depth; >=6 cm granite left at
    # the front and back edges. SINK_OPENING is exported for build_sink_faucet.
    cf = BACK_FRONT_Y - overhang            # counter front edge in Y (1.48)
    hy_c = (cf + YMAX) / 2                   # depth center (1.79)
    hx0, hx1 = SINK_CX - SINK_OPEN_W / 2, SINK_CX + SINK_OPEN_W / 2
    hy0, hy1 = hy_c - SINK_OPEN_D / 2, hy_c + SINK_OPEN_D / 2
    _ctr_parts = [
        box_bounds("CTR_back_hL", BACK_RUN_X0, hx0, cf, YMAX, z0, z1, "Cabinets", gr),
        box_bounds("CTR_back_hR", hx1, rx0, cf, YMAX, z0, z1, "Cabinets", gr),
        box_bounds("CTR_back_hF", hx0, hx1, cf, hy0, z0, z1, "Cabinets", gr),
        box_bounds("CTR_back_hB", hx0, hx1, hy1, YMAX, z0, z1, "Cabinets", gr),
    ]
    join_objects("CTR_back", _ctr_parts)
    box_bounds("CTR_back_R", rx1, BACK_RUN_X1,
               BACK_FRONT_Y - overhang, YMAX, z0, z1, "Cabinets", gr)
    # Left run counter (front overhang toward +X). Avoid double at corner: start below back counter.
    box_bounds("CTR_left", XMIN, LEFT_FRONT_X + overhang,
               LEFT_RUN_Y0, BACK_FRONT_Y - overhang, z0, z1, "Cabinets", gr)


# ----------------------------------------------------------------------------
# 7. UPPER CABINETS
# ----------------------------------------------------------------------------

def build_uppers():
    cab = MATS['MAT_cabinet']
    zc = (UPPER_Z0 + UPPER_Z1) / 2
    h = UPPER_H
    yfront = YMAX - UPPER_DEEP  # back-wall uppers front face
    # Back wall uppers: leave gap above window/sink [-0.9,0.3] and above range [1.02,1.83]
    # Segment 1: x in [-2.5, -0.95]
    _upper_back(-2.5, -0.95, zc, h, yfront, cab)
    # Segment 2: x in [0.35, 1.00]
    _upper_back(0.35, 1.00, zc, h, yfront, cab)
    # Segment 3: x in [1.85, 1.90] tiny -> skip

    # Left wall uppers above the left base run. Now that the fridge (which used to
    # reach z=1.82 into the upper zone around y=0.5..1.42) is gone from this wall,
    # the run is continuous over the whole left base run up to the corner. Stops
    # short of the back-wall upper band (y>=1.76) so the two runs don't collide.
    xfront = XMIN + UPPER_DEEP
    _upper_left(LEFT_RUN_Y0 + 0.03, LEFT_RUN_Y1 - 0.05, zc, h, xfront, cab)


def _upper_back(x0, x1, zc, h, yfront, mat):
    # carcass
    box_bounds(f"CAB_upper_back_carcass_{x0:.2f}".replace('-', 'm'),
               x0, x1, yfront, YMAX, UPPER_Z0, UPPER_Z1, "Cabinets", mat)
    span = x1 - x0
    n = max(1, round(span / 0.5))
    dw = span / n
    for i in range(n):
        cx = x0 + dw * (i + 0.5)
        nm = f"CAB_upper_back_door_{x0:.2f}_{i}".replace('-', 'm')
        shaker_front(nm, cx, zc, dw, h, 'Y', -1, yfront, "Cabinets", mat)
        hx = cx + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        bar_handle(nm + "_handle", hx, zc - h / 2 + 0.08, 0.12, 'Y', -1,
                   yfront, "Cabinets", orient='V')


def _upper_left(y0, y1, zc, h, xfront, mat):
    box_bounds("CAB_upper_left_carcass", XMIN, xfront, y0, y1,
               UPPER_Z0, UPPER_Z1, "Cabinets", mat)
    span = y1 - y0
    n = max(1, round(span / 0.5))
    dw = span / n
    for i in range(n):
        yc = y0 + dw * (i + 0.5)
        nm = f"CAB_upper_left_door_{i}"
        shaker_front(nm, yc, zc, dw, h, 'X', +1, xfront, "Cabinets", mat)
        hy = yc + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        bar_handle(nm + "_handle", hy, zc - h / 2 + 0.08, 0.12, 'X', +1,
                   xfront, "Cabinets", orient='V')


# ----------------------------------------------------------------------------
# 8. APPLIANCES & FIXTURES
# ----------------------------------------------------------------------------

def build_appliances():
    steel = MATS['MAT_steel']
    black = MATS['MAT_cooktop_black']

    # ---- Dishwasher (integrated in back run) ----
    dx0, dx1 = DW_CX - DW_W / 2, DW_CX + DW_W / 2
    box_bounds("APP_dishwasher", dx0, dx1, BACK_FRONT_Y - 0.005, BACK_FRONT_Y + 0.02,
               TOE_H, BASE_H - 0.01, "Appliances", steel)
    bar_handle("APP_dishwasher_handle", DW_CX, BASE_H - 0.06, DW_W - 0.12, 'Y', -1,
               BACK_FRONT_Y, "Appliances", orient='H')

    # ---- Gas range ----
    rx0, rx1 = RANGE_CX - RANGE_W / 2, RANGE_CX + RANGE_W / 2
    # steel body flush with cabinets
    box_bounds("APP_range", rx0, rx1, BACK_FRONT_Y, YMAX, 0.0, BASE_H,
               "Appliances", steel)
    # black cooktop surface on top
    box_bounds("APP_range_cooktop", rx0, rx1, BACK_FRONT_Y, YMAX - 0.02,
               BASE_H, BASE_H + 0.02, "Appliances", black)
    # 4 burners
    by = [YMAX - 0.20, YMAX - 0.42]
    bx = [rx0 + 0.20, rx1 - 0.20]
    idx = 0
    for yy in by:
        for xx in bx:
            cylinder(f"APP_range_burner_{idx}", xx, yy, BASE_H + 0.025, 0.07, 0.02,
                     'Z', "Appliances", black)
            # simple grate ring
            cylinder(f"APP_range_grate_{idx}", xx, yy, BASE_H + 0.04, 0.10, 0.01,
                     'Z', "Appliances", black)
            idx += 1
    # control knobs strip (front)
    for k in range(4):
        kx = rx0 + 0.12 + k * (RANGE_W - 0.24) / 3
        cylinder(f"APP_range_knob_{k}", kx, BACK_FRONT_Y + 0.01, BASE_H - 0.06,
                 0.02, 0.03, 'Y', "Appliances", black)

    # ---- Micro-hood above range ----
    hood_z = 1.50
    box_bounds("APP_hood", rx0, rx1, YMAX - 0.38, YMAX, hood_z, hood_z + 0.40,
               "Appliances", steel)
    # underside vent (black)
    box_bounds("APP_hood_vent", rx0 + 0.05, rx1 - 0.05, YMAX - 0.34, YMAX - 0.04,
               hood_z - 0.005, hood_z + 0.01, "Appliances", black)

    # ---- French-door fridge on left wall ----
    build_fridge()

    # ---- Sink + faucet ----
    build_sink_faucet()


def build_fridge():
    steel = MATS['MAT_steel']
    # 0.92 wide (Y) x 0.74 deep (X) x 1.82 high
    # Relocated to the SOUTH end of the left wall: flush against x=-2.5, occupying
    # y in [-1.77, -0.85]. This clears the left base/counter run (which starts at
    # y=-0.70, leaving ~0.15 breathing room) and stops standing in front of the
    # back-wall corner uppers. Still faces +X (front at x1); door splits/handles
    # are built off (x0,x1,y0,y1) so they follow automatically.
    fw, fd, fh = 0.92, 0.74, 1.82
    x0 = XMIN
    x1 = XMIN + fd            # -1.76
    y0 = -1.77
    y1 = y0 + fw             # -0.85
    box_bounds("APP_fridge", x0, x1, y0, y1, 0.0, fh, "Appliances", steel)
    # door split lines: two vertical doors above, freezer drawer below
    ymid = (y0 + y1) / 2
    fresh_z0 = 0.62
    xf = x1 + 0.002
    # gap grooves (thin black insets) via steel-dark boxes
    dark = MATS['MAT_cooktop_black']
    # vertical split between the two fresh doors
    box_bounds("APP_fridge_split_v", x1 - 0.01, x1 + 0.005, ymid - 0.006, ymid + 0.006,
               fresh_z0, fh, "Appliances", dark)
    # horizontal split above freezer drawer
    box_bounds("APP_fridge_split_h", x1 - 0.01, x1 + 0.005, y0, y1,
               fresh_z0 - 0.006, fresh_z0 + 0.006, "Appliances", dark)
    # long bar handles (vertical) on the two fresh doors, near center split
    cylinder("APP_fridge_handle_L", x1 + 0.03, ymid - 0.10, (fresh_z0 + fh) / 2 + 0.1,
             0.012, 1.0, 'Z', "Appliances", steel)
    cylinder("APP_fridge_handle_R", x1 + 0.03, ymid + 0.10, (fresh_z0 + fh) / 2 + 0.1,
             0.012, 1.0, 'Z', "Appliances", steel)
    # freezer drawer handle (horizontal)
    cylinder("APP_fridge_handle_F", x1 + 0.03, ymid, fresh_z0 - 0.12,
             0.012, fw - 0.20, 'Y', "Appliances", steel)


def build_sink_faucet():
    steel = MATS['MAT_steel']
    black = MATS['MAT_cooktop_black']
    # ---- Undermount stainless basin hanging below the counter opening ----
    # Opening geometry MUST match the hole cut in CTR_back (build_counters).
    overhang = 0.02
    cf = BACK_FRONT_Y - overhang
    hy_c = (cf + YMAX) / 2
    ox0, ox1 = SINK_CX - SINK_OPEN_W / 2, SINK_CX + SINK_OPEN_W / 2   # opening X
    oy0, oy1 = hy_c - SINK_OPEN_D / 2, hy_c + SINK_OPEN_D / 2         # opening Y
    # Basin interior runs ~1 cm WIDER than the opening on every side, so the
    # granite edge overhangs the bowl rim -> true undermount reveal.
    rev = 0.01
    t = 0.02                                  # basin wall thickness
    ix0, ix1 = ox0 - rev, ox1 + rev           # interior span
    iy0, iy1 = oy0 - rev, oy1 + rev
    bx0, bx1 = ix0 - t, ix1 + t               # outer span
    by0, by1 = iy0 - t, iy1 + t
    ztop = CTR_TOP - CTR_T                     # basin rim at counter underside (0.86)
    depth = 0.19
    zbot = ztop - depth                        # 0.67
    tbot = 0.02
    _basin = [
        # bottom
        box_bounds("FIX_sink_b0", bx0, bx1, by0, by1, zbot, zbot + tbot, "Appliances", steel),
        # front wall (-Y)
        box_bounds("FIX_sink_b1", bx0, bx1, by0, iy0, zbot, ztop, "Appliances", steel),
        # back wall (+Y)
        box_bounds("FIX_sink_b2", bx0, bx1, iy1, by1, zbot, ztop, "Appliances", steel),
        # left wall (-X)
        box_bounds("FIX_sink_b3", bx0, ix0, iy0, iy1, zbot, ztop, "Appliances", steel),
        # right wall (+X)
        box_bounds("FIX_sink_b4", ix1, bx1, iy0, iy1, zbot, ztop, "Appliances", steel),
    ]
    join_objects("FIX_sink_basin", _basin)
    # dark drain disk centered on the basin floor
    cylinder("FIX_sink_drain", SINK_CX, hy_c, zbot + tbot + 0.002, 0.045, 0.006,
             'Z', "Appliances", black)
    # Faucet: riser + spout on the back granite strip, spout reaching over the bowl.
    fx = SINK_CX
    fy = YMAX - 0.08
    cylinder("FIX_faucet_riser", fx, fy, CTR_TOP + 0.12, 0.02, 0.24, 'Z',
             "Appliances", steel)
    # curved spout approximated: forward horizontal + short down
    cylinder("FIX_faucet_arm", fx, fy - 0.12, CTR_TOP + 0.24, 0.018, 0.26, 'Y',
             "Appliances", steel)
    cylinder("FIX_faucet_tip", fx, fy - 0.24, CTR_TOP + 0.19, 0.014, 0.08, 'Z',
             "Appliances", steel)
    cylinder("FIX_faucet_handle", fx + 0.05, fy, CTR_TOP + 0.10, 0.012, 0.10, 'X',
             "Appliances", steel)


# ----------------------------------------------------------------------------
# 9. ISLAND
# ----------------------------------------------------------------------------

def build_island():
    cab = MATS['MAT_cabinet']
    wood = MATS['MAT_butcher_block']
    cx, cy = 0.55, -0.55
    fw, fd = 1.90, 1.05
    x0, x1 = cx - fw / 2, cx + fw / 2
    y0, y1 = cy - fd / 2, cy + fd / 2
    # body
    box_bounds("ISL_body", x0, x1, y0, y1, TOE_H, BASE_H, "Island", cab)
    box_bounds("ISL_toe", x0 + TOE_DEEP, x1 - TOE_DEEP, y0 + TOE_DEEP, y1,
               0.0, TOE_H, "Island", cab)
    # butcher-block top w/ overhang on seating side (-Y)
    oh = 0.02
    seat_oh = 0.30
    box_bounds("ISL_top", x0 - oh, x1 + oh, y0 - seat_oh, y1 + oh,
               BASE_H, BASE_H + CTR_T, "Island", wood)
    # doors on the back (+Y) side
    zc = (TOE_H + BASE_H) / 2
    h = BASE_H - TOE_H - 0.02
    span = fw
    n = 3
    dw = span / n
    for i in range(n):
        dxc = x0 + dw * (i + 0.5)
        nm = f"ISL_door_{i}"
        shaker_front(nm, dxc, zc, dw, h, 'Y', +1, y1, "Island", cab)
        hx = dxc + (dw / 2 - 0.05) * (1 if i % 2 == 0 else -1)
        bar_handle(nm + "_handle", hx, zc + h / 2 - 0.08, 0.12, 'Y', +1, y1,
                   "Island", orient='V')

    # 2 stools on -Y side
    build_stool("STOOL_1", cx - 0.45, y0 - seat_oh - 0.28)
    build_stool("STOOL_2", cx + 0.45, y0 - seat_oh - 0.28)


def build_stool(name, sx, sy):
    steel = MATS['MAT_steel']
    wood = MATS['MAT_butcher_block']
    seat_z = 0.65
    # seat (wood cylinder)
    cylinder(name + "_seat", sx, sy, seat_z, 0.16, 0.04, 'Z', "Island", wood)
    # 4 legs (steel)
    lr = 0.30 * 0.5
    for i, (dx, dy) in enumerate([(-lr, -lr), (lr, -lr), (lr, lr), (-lr, lr)]):
        cylinder(f"{name}_leg_{i}", sx + dx, sy + dy, seat_z / 2, 0.012, seat_z,
                 'Z', "Island", steel)
    # footrest ring approximated by a low square of bars (2 bars)
    cylinder(name + "_rest_x", sx, sy - lr, 0.22, 0.010, 2 * lr, 'X', "Island", steel)
    cylinder(name + "_rest_y", sx + lr, sy, 0.22, 0.010, 2 * lr, 'Y', "Island", steel)


# ----------------------------------------------------------------------------
# 10. LIGHTING & CAMERA
# ----------------------------------------------------------------------------

def build_lighting():
    # Directional daylight mood: a strong warm sun rakes through the window and
    # casts visible light patches, a warm window-plane area fills the glow, and
    # a soft low ceiling fill lifts the shadows without going studio-flat.
    # (The two former diagnostic helpers -- LIGHT_backwash area and
    # LIGHT_corner point -- are removed; a low warm world ambient replaces them.)

    # Sun through the window (comes from +Y, warm) -- primary key light.
    sun_data = bpy.data.lights.new("LIGHT_sun", type='SUN')
    sun_data.energy = 13.0
    sun_data.color = (1.0, 0.85, 0.63)   # warm, golden daylight
    sun_data.angle = math.radians(1.2)   # crisp, defined warm light patches
    sun = bpy.data.objects.new("LIGHT_sun", sun_data)
    sun.rotation_euler = (math.radians(-40), math.radians(12), math.radians(24))
    sun.location = (0.0, 4.0, 3.0)
    link_to(sun, "Lighting")

    # Warm area light at the window plane (just outside, shining IN toward -Y).
    # Area lights emit along local -Z; rot -90 about X points -Z toward -Y.
    area_data = bpy.data.lights.new("LIGHT_window_area", type='AREA')
    area_data.energy = 42.0
    area_data.color = (1.0, 0.87, 0.70)
    area_data.shape = 'RECTANGLE'
    area_data.size = 1.2
    area_data.size_y = 0.9
    area = bpy.data.objects.new("LIGHT_window_area", area_data)
    area.location = (-0.30, YMAX + 0.15, 1.55)
    area.rotation_euler = (math.radians(-90), 0, 0)  # -Z faces -Y (into room)
    link_to(area, "Lighting")

    # Soft LOW ceiling fill facing DOWN -- lifts shadows gently, warm, not the
    # former clinical 45-energy wash.
    fill_data = bpy.data.lights.new("LIGHT_fill", type='AREA')
    fill_data.energy = 11.0
    fill_data.color = (1.0, 0.95, 0.88)
    fill_data.shape = 'RECTANGLE'
    fill_data.size = 3.2
    fill_data.size_y = 3.2
    fill = bpy.data.objects.new("LIGHT_fill", fill_data)
    fill.location = (0.0, 0.0, WALL_H - 0.05)
    fill.rotation_euler = (0.0, 0.0, 0.0)  # faces straight down
    link_to(fill, "Lighting")


def build_camera():
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 32.0
    cam = bpy.data.objects.new("Camera", cam_data)
    # Pulled back into the front-right corner and raised to ~2.0 m so the whole
    # L-run reads (fridge back-left, sink+window back-center, range+hood
    # back-right) and the island drops to <= 1/3 of frame. Target pushed toward
    # the back-left and up so the composition centres on the working wall.
    cam.location = (2.45, -2.05, 2.02)
    link_to(cam, "Room")
    # target empty
    target = bpy.data.objects.new("CAM_target", None)
    target.empty_display_size = 0.2
    target.location = (0.42, 0.50, 0.98)
    link_to(target, "Room")
    con = cam.constraints.new(type='TRACK_TO')
    con.target = target
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam


# ----------------------------------------------------------------------------
# 11. RENDER SETTINGS
# ----------------------------------------------------------------------------

def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    # Try Metal GPU, fall back to CPU
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        gpu_found = False
        for d in prefs.devices:
            if d.type == 'METAL':
                d.use = True
                gpu_found = True
            elif d.type == 'CPU':
                d.use = True  # keep CPU on too for Metal (helps)
        scene.cycles.device = 'GPU' if gpu_found else 'CPU'
    except Exception as e:
        scene.cycles.device = 'CPU'
        print("GPU setup failed, CPU fallback:", repr(e))
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    # ---- View transform: warm, filmic interior look ----
    # AgX tames the window highlight without clipping, but its default ("None"
    # look) reads flat/grey. A contrast+punch look plus a touch of positive
    # exposure gives an inviting daylight interior instead of a clinical one.
    vs = scene.view_settings
    vs.view_transform = 'AgX'
    # look name enums vary slightly between builds; pick the first that exists.
    for look in ('AgX - Medium High Contrast', 'AgX - Punchy',
                 'AgX - Base Contrast', 'Medium High Contrast', 'None'):
        try:
            vs.look = look
            break
        except Exception:
            continue
    vs.exposure = 0.55
    vs.gamma = 1.0

    # world: low warm ambient only (keeps corners from going black without
    # flattening the directional daylight mood). Strength <= 0.15 per spec.
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs['Color'].default_value = (0.64, 0.58, 0.48, 1.0)  # warmer ambient
        bg.inputs['Strength'].default_value = 0.14


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------

def build():
    wipe_scene()
    make_collections()
    make_materials()
    build_room()
    build_base_runs()
    build_uppers()
    build_appliances()
    build_island()
    build_lighting()
    build_camera()
    setup_render()

    # report
    obj_count = len(bpy.data.objects)
    mat_count = len(bpy.data.materials)
    tris = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return {"objects": obj_count, "materials": mat_count, "tris": tris}


result = build()
