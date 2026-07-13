"""Bake procedural base-colour textures and export glTF for the live kitchen.

Runs AFTER kitchen_build.py (does NOT modify it). Steps:
  1. UV-unwrap the objects that carry the procedural materials we must bake.
  2. Bake each material's BASE COLOUR (diffuse, colour pass only -- no lighting)
     to a 1024x1024 PNG in export/textures/.
  3. Rewire each baked material so the baked PNG drives Base Color (name kept,
     roughness left as a scalar).
  4. Export every mesh object (excluding lights/camera/empties) to GLB, to both
     export/kitchen.glb and web/public/kitchen.glb.
  5. Parse the GLB JSON chunk and report the material names it contains.

Assigns `result` with a summary dict.
"""

import bpy
import os
import json
import struct
import shutil

PROJ = "/Users/tien/3d kitchen"
TEX_DIR = os.path.join(PROJ, "export", "textures")
GLB_MAIN = os.path.join(PROJ, "export", "kitchen.glb")
GLB_WEB = os.path.join(PROJ, "web", "public", "kitchen.glb")
WEB_TEX_DIR = os.path.join(PROJ, "web", "public", "textures")

os.makedirs(TEX_DIR, exist_ok=True)
os.makedirs(os.path.dirname(GLB_WEB), exist_ok=True)
os.makedirs(WEB_TEX_DIR, exist_ok=True)

log = []


def _principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def _find_area(kind):
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == kind:
                for region in area.regions:
                    if region.type == 'WINDOW':
                        return win, area, region
    return None, None, None


def users_of(mat_name):
    """All mesh objects whose data references the given (shared) material."""
    return sorted(
        o.name for o in bpy.data.objects
        if o.type == 'MESH' and any(
            ms is not None and ms.name == mat_name for ms in o.data.materials)
    )


def uv_unwrap_shared(obj_names):
    """Joint Smart UV Project across MANY objects at once.

    A shared material is baked to ONE image, so every object that uses it must
    occupy its OWN non-overlapping region of that image. Selecting all the user
    objects and entering multi-object edit mode makes Smart UV Project pack all
    their islands JOINTLY into a single 0-1 layout -- no two objects share UV
    space, so no object samples an un-baked (black) region. (The previous
    per-object unwrap gave each object the full 0-1 square, all overlapping, and
    only the one representative object was baked -> every other object read black.)
    """
    objs = [bpy.data.objects[n] for n in obj_names if bpy.data.objects.get(n)]
    if not objs:
        return False
    # An active object must exist for object.mode_set to poll in the bridge context.
    bpy.context.view_layer.objects.active = objs[0]
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    win, area, region = _find_area('VIEW_3D')
    ok = False
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        if area is not None:
            with bpy.context.temp_override(window=win, area=area, region=region):
                try:
                    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
                    ok = True
                except Exception as e:
                    log.append(f"shared smart_project override failed {obj_names}: {e!r}")
        if not ok:
            try:
                bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
                ok = True
            except Exception as e:
                log.append(f"shared smart_project direct failed {obj_names}: {e!r}; cube_project")
                bpy.ops.uv.cube_project(cube_size=1.0)
                ok = True
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
    return ok


def add_bake_image_node(mat, img):
    nt = mat.node_tree
    node = nt.nodes.new('ShaderNodeTexImage')
    node.name = "BAKE_TARGET"
    node.label = "BAKE_TARGET"
    node.image = img
    node.select = True
    nt.nodes.active = node
    return node


def bake_material(mat_name, roughness_scalar):
    mat = bpy.data.materials[mat_name]
    all_obj_names = users_of(mat_name)
    log.append(f"{mat_name} users: {all_obj_names}")
    # (a) SHARED non-overlapping UV layout across every user of this material.
    uv_unwrap_shared(all_obj_names)

    img_name = "BAKE_" + mat_name
    img = bpy.data.images.get(img_name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(img_name, width=1024, height=1024, alpha=False)
    img.colorspace_settings.name = 'sRGB'

    node = add_bake_image_node(mat, img)
    mat.node_tree.nodes.active = node

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 6
    scene.cycles.bake_type = 'DIFFUSE'

    # (b) ACCUMULATE-bake EVERY user object into the SAME image. Clear the image
    # only on the first object; every subsequent object keeps prior results and
    # writes into its own (non-overlapping) UV region. This is what stops
    # CTR_left / CTR_back_R / stool seats from rendering as un-baked black.
    for i, on in enumerate(all_obj_names):
        obj = bpy.data.objects.get(on)
        if obj is None:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mat.node_tree.nodes.active = node
        use_clear = (i == 0)
        try:
            bpy.ops.object.bake(type='DIFFUSE', use_clear=use_clear, margin=6)
        except Exception as e:
            # GPU bake can be finicky; retry on CPU.
            log.append(f"bake GPU failed {mat_name}/{on}: {e!r}; retry CPU")
            prev = scene.cycles.device
            scene.cycles.device = 'CPU'
            bpy.ops.object.bake(type='DIFFUSE', use_clear=use_clear, margin=6)
            scene.cycles.device = prev

    out_path = os.path.join(TEX_DIR, mat_name + "_basecolor.png")
    img.filepath_raw = out_path
    img.file_format = 'PNG'
    img.save()
    log.append(f"baked {mat_name} -> {out_path} ({os.path.getsize(out_path)} bytes)")

    # Rewire: baked image -> Base Color; keep a scalar roughness.
    b = _principled(mat)
    nt = mat.node_tree
    # break existing Base Color link(s)
    for link in list(nt.links):
        if link.to_node == b and link.to_socket.name == 'Base Color':
            nt.links.remove(link)
    nt.links.new(node.outputs['Color'], b.inputs['Base Color'])
    # break Roughness link(s) and set scalar
    for link in list(nt.links):
        if link.to_node == b and link.to_socket.name == 'Roughness':
            nt.links.remove(link)
    b.inputs['Roughness'].default_value = roughness_scalar
    return out_path, os.path.getsize(out_path)


def export_glb():
    # Select all mesh objects; exclude lights, camera, empties.
    bpy.ops.object.select_all(action='DESELECT')
    mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in mesh_objs:
        o.select_set(True)
    if mesh_objs:
        bpy.context.view_layer.objects.active = mesh_objs[0]

    bpy.ops.export_scene.gltf(
        filepath=GLB_MAIN,
        export_format='GLB',
        use_selection=True,
        export_apply=True,      # apply modifiers
        export_yup=True,        # +Y up (default)
        export_cameras=False,
        export_lights=False,
    )
    shutil.copyfile(GLB_MAIN, GLB_WEB)
    return len(mesh_objs)


def glb_materials(path):
    with open(path, 'rb') as f:
        magic, version, length = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, "not a GLB"
        # first chunk = JSON
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        assert chunk_type == 0x4E4F534A, "first chunk not JSON"
        data = f.read(chunk_len)
    j = json.loads(data.decode('utf-8'))
    return [m.get('name', '<unnamed>') for m in j.get('materials', [])]


# ----------------------------------------------------------------------------
# TILEABLE TEXTURE SET for the web configurator (Task 4)
# ----------------------------------------------------------------------------
# Six 1024x1024 seamless PNGs baked from procedural materials on a temp plane.
# SEAMLESS METHOD: every texture is driven by a MIRRORED UV coordinate (a
# triangle wave per axis: s = pingpong(2*u, 1)). Because that coordinate is
# continuous and EQUAL at u=0 and u=1 (and v), ANY function of it -- noise at
# any scale, wave, brick, voronoi -- is automatically equal on opposite edges,
# so the baked image tiles with no seam. The trade-off is a mirror symmetry
# about the tile centre (organic wood/stone hides this well; the plank
# laminates show a faint centre mirror line -- noted honestly in the report).

def _tile_principled(m):
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def mirrored_coord(nt):
    """Return a Vector output that mirrors UV into a seamless triangle wave."""
    uv = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    for axis in ('X', 'Y', 'Z'):
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = 2.0
        nt.links.new(sep.outputs[axis], mul.inputs[0])
        pp = nt.nodes.new('ShaderNodeMath')
        pp.operation = 'PINGPONG'
        pp.inputs[1].default_value = 1.0
        nt.links.new(mul.outputs['Value'], pp.inputs[0])
        nt.links.new(pp.outputs['Value'], comb.inputs[axis])
    return comb.outputs['Vector']


def _stretch(nt, vec, sx, sy, sz=1.0):
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (sx, sy, sz)
    nt.links.new(vec, mp.inputs['Vector'])
    return mp.outputs['Vector']


def _wood_mat(name, c_light, c_dark, grain_scale=(1.0, 9.0)):
    """Generic anisotropic wood grain (long grain along U)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _tile_principled(m)
    mc = mirrored_coord(nt)
    v = _stretch(nt, mc, grain_scale[0], grain_scale[1])
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 6.0
    grain.inputs['Detail'].default_value = 9.0
    grain.inputs['Roughness'].default_value = 0.7
    nt.links.new(v, grain.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.inputs['Scale'].default_value = 2.5
    wave.inputs['Distortion'].default_value = 3.0
    wave.inputs['Detail'].default_value = 2.0
    nt.links.new(v, wave.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Fac'].default_value = 0.45
    nt.links.new(grain.outputs['Fac'], mix.inputs['Color1'])
    nt.links.new(wave.outputs['Fac'], mix.inputs['Color2'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = c_light
    ramp.color_ramp.elements[1].color = c_dark
    nt.links.new(mix.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def _plank_mat(name, c_light, c_dark, planks=4):
    """Wood grain overlaid with straight plank seams (visible board edges)."""
    m = _wood_mat(name, c_light, c_dark, grain_scale=(1.0, 6.0))
    nt = m.node_tree
    b = _tile_principled(m)
    mc = mirrored_coord(nt)
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.5
    brick.offset_frequency = 2
    brick.inputs['Scale'].default_value = float(planks)
    if 'Mortar Size' in brick.inputs:
        brick.inputs['Mortar Size'].default_value = 0.02
    if 'Brick Width' in brick.inputs:
        brick.inputs['Brick Width'].default_value = 2.0   # long boards
    if 'Row Height' in brick.inputs:
        brick.inputs['Row Height'].default_value = 0.5
    brick.inputs['Color1'].default_value = (1.0, 1.0, 1.0, 1.0)
    brick.inputs['Color2'].default_value = (0.92, 0.92, 0.92, 1.0)
    brick.inputs['Mortar'].default_value = (0.35, 0.30, 0.25, 1.0)  # dark seam
    nt.links.new(mc, brick.inputs['Vector'])
    # multiply the seam mask over the wood base color
    base_link = next((l for l in nt.links
                      if l.to_node == b and l.to_socket.name == 'Base Color'), None)
    if base_link:
        wood_col = base_link.from_socket
        nt.links.remove(base_link)
        seam = nt.nodes.new('ShaderNodeMixRGB')
        seam.blend_type = 'MULTIPLY'
        seam.inputs['Fac'].default_value = 1.0
        nt.links.new(wood_col, seam.inputs['Color1'])
        nt.links.new(brick.outputs['Color'], seam.inputs['Color2'])
        nt.links.new(seam.outputs['Color'], b.inputs['Base Color'])
    return m


def _marble_white_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _tile_principled(m)
    mc = mirrored_coord(nt)
    # noise-distorted wave gives soft wandering grey veins on a white field
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 2.5
    noise.inputs['Detail'].default_value = 6.0
    nt.links.new(mc, noise.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.inputs['Scale'].default_value = 2.0
    wave.inputs['Distortion'].default_value = 8.0
    wave.inputs['Detail'].default_value = 3.0
    nt.links.new(mc, wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.93, 0.93, 0.94, 1.0)  # white field
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.62, 0.63, 0.66, 1.0)  # grey vein
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def _granite_dark_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _tile_principled(m)
    mc = mirrored_coord(nt)
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'F1'
    vor.inputs['Scale'].default_value = 40.0
    nt.links.new(mc, vor.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 22.0
    noise.inputs['Detail'].default_value = 8.0
    nt.links.new(mc, noise.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MIX'
    mix.inputs['Fac'].default_value = 0.5
    nt.links.new(vor.outputs['Distance'], mix.inputs['Color1'])
    nt.links.new(noise.outputs['Fac'], mix.inputs['Color2'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (0.04, 0.04, 0.05, 1.0)  # near-black base
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.45, 0.44, 0.46, 1.0)  # grey speckle
    egold = ramp.color_ramp.elements.new(0.90)
    egold.color = (0.60, 0.55, 0.48, 1.0)
    nt.links.new(mix.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def generate_tileable_textures():
    """Bake six seamless 1024 PNGs to web/public/textures/, then clean up."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.cycles.bake_type = 'DIFFUSE'

    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0.0, 0.0, -8.0))
    plane = bpy.context.active_object
    plane.name = "TILE_PLANE_TMP"

    recipes = [
        ("oak_natural",    lambda: _wood_mat("TILE_oak", (0.60, 0.43, 0.25, 1), (0.80, 0.62, 0.40, 1))),
        ("walnut",         lambda: _wood_mat("TILE_walnut", (0.24, 0.14, 0.07, 1), (0.44, 0.29, 0.16, 1))),
        ("laminate_light", lambda: _plank_mat("TILE_lam_light", (0.62, 0.46, 0.28, 1), (0.80, 0.63, 0.42, 1), planks=4)),
        ("laminate_dark",  lambda: _plank_mat("TILE_lam_dark", (0.20, 0.17, 0.15, 1), (0.34, 0.29, 0.25, 1), planks=4)),
        ("marble_white",   lambda: _marble_white_mat("TILE_marble")),
        ("granite_dark",   lambda: _granite_dark_mat("TILE_granite")),
    ]

    sizes = {}
    temp_mats = []
    for fname, factory in recipes:
        mat = factory()
        temp_mats.append(mat)
        plane.data.materials.clear()
        plane.data.materials.append(mat)
        img = bpy.data.images.get("TILEBAKE_TMP")
        if img:
            bpy.data.images.remove(img)
        img = bpy.data.images.new("TILEBAKE_TMP", width=1024, height=1024, alpha=False)
        img.colorspace_settings.name = 'sRGB'
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        node.select = True
        mat.node_tree.nodes.active = node
        bpy.ops.object.select_all(action='DESELECT')
        plane.select_set(True)
        bpy.context.view_layer.objects.active = plane
        # margin 0: the texture is already seamless, so no edge bleed is wanted.
        try:
            bpy.ops.object.bake(type='DIFFUSE', use_clear=True, margin=0)
        except Exception as e:
            log.append(f"tile bake GPU failed {fname}: {e!r}; retry CPU")
            prev = scene.cycles.device
            scene.cycles.device = 'CPU'
            bpy.ops.object.bake(type='DIFFUSE', use_clear=True, margin=0)
            scene.cycles.device = prev
        out_path = os.path.join(WEB_TEX_DIR, fname + ".png")
        img.filepath_raw = out_path
        img.file_format = 'PNG'
        img.save()
        sizes[fname + ".png"] = os.path.getsize(out_path)
        log.append(f"tile texture {fname}.png -> {sizes[fname + '.png']} bytes")
        bpy.data.images.remove(img)

    # ---- clean up so the scene/export/.blend stays pristine ----
    # Detach the temp materials from the plane FIRST, then force-remove them
    # (do_unlink=True) -- relying on mat.users==0 is unsafe here because the
    # user count for the last-assigned material may not refresh until a depsgraph
    # update, which previously left one stray TILE_* material in the saved blend.
    plane.data.materials.clear()
    bpy.data.objects.remove(plane, do_unlink=True)
    for mat in temp_mats:
        try:
            bpy.data.materials.remove(mat, do_unlink=True)
        except Exception as e:
            log.append(f"temp material cleanup failed {mat.name}: {e!r}")
    return sizes


# ---- run ----
# Object lists are derived dynamically from material users (see users_of), so
# every shared user is baked -- including CTR_back_R, which the old hard-coded
# list omitted.
baked = {}
specs = [
    ("MAT_counter_granite", 0.18),
    ("MAT_floor_tile",      0.12),   # glossy porcelain (was 0.35)
    ("MAT_butcher_block",   0.38),
    ("MAT_backsplash",      0.15),   # polished stone splash (new)
]
for mat_name, rough in specs:
    p, sz = bake_material(mat_name, rough)
    baked[mat_name] = {"path": p, "bytes": sz, "users": users_of(mat_name)}

n_mesh = export_glb()

sizes = {
    "export/kitchen.glb": os.path.getsize(GLB_MAIN),
    "web/public/kitchen.glb": os.path.getsize(GLB_WEB),
}
mats_in_glb = glb_materials(GLB_MAIN)

# Task 4: seamless tileable texture set (runs AFTER the scene bake + export, on
# its own temp plane, and removes all temp objects/materials afterward).
tile_sizes = generate_tileable_textures()

result = {
    "baked": baked,
    "mesh_objects_exported": n_mesh,
    "glb_sizes": sizes,
    "glb_materials": sorted(mats_in_glb),
    "tile_textures": tile_sizes,
    "scene_objects_after": len(bpy.data.objects),
    "log": log,
}
