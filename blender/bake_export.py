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

os.makedirs(TEX_DIR, exist_ok=True)
os.makedirs(os.path.dirname(GLB_WEB), exist_ok=True)

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


# ---- run ----
# Object lists are derived dynamically from material users (see users_of), so
# every shared user is baked -- including CTR_back_R, which the old hard-coded
# list omitted.
baked = {}
specs = [
    ("MAT_counter_granite", 0.18),
    ("MAT_floor_tile",      0.35),
    ("MAT_butcher_block",   0.38),
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

result = {
    "baked": baked,
    "mesh_objects_exported": n_mesh,
    "glb_sizes": sizes,
    "glb_materials": sorted(mats_in_glb),
    "log": log,
}
