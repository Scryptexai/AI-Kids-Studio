"""
Blender 4.x Procedural Scene & Animation Generator — Episode 3:
"Bagaimana Menara Air Mengalirkan Air Tanpa Listrik?" (Water Tower & Hydrostatic Pressure)

Usage inside Blender 4.x:
    blender --background --python blender/ep03_water_tower_bpy.py -- --render-mp4 output/ep03_blender.mp4
"""

import math
import os
import bpy


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)


def make_mat(name, rgba, roughness=0.55, metallic=0.0, emission_rgb=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0 and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    if emission_rgb is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_rgb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission_rgb, 1.0)
    return mat


def add_beveled_cube(name, size_xyz, loc_xyz, mat, bevel_width=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size_xyz
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = obj.modifiers.new(name="Bevel", type="BEVEL")
    bev.width = bevel_width
    bev.segments = 2
    obj.data.materials.append(mat)
    return obj


def build_episode3_scene():
    clear_scene()
    scn = bpy.context.scene
    scn.render.resolution_x = 1080
    scn.render.resolution_y = 1920
    scn.render.fps = 24
    scn.frame_start = 1
    scn.frame_end = int(24 * 58.5)

    if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scn.render.bl_rna.properties["engine"].enum_items]:
        scn.render.engine = "BLENDER_EEVEE_NEXT"
    else:
        scn.render.engine = "BLENDER_EEVEE"

    bpy.ops.object.light_add(type="SUN", location=(5.0, -6.0, 9.5))
    sun = bpy.context.active_object
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(48), math.radians(16), math.radians(30))

    mat_grass = make_mat("Grass", (0.37, 0.60, 0.43, 1.0), roughness=0.85)
    mat_steel = make_mat("TowerSteel", (0.42, 0.48, 0.56, 1.0), roughness=0.45, metallic=0.45)
    mat_glass = make_mat("TankGlass", (0.73, 0.90, 0.99, 0.25), roughness=0.12, alpha=0.25)
    mat_water = make_mat("TankWater", (0.05, 0.65, 0.91, 1.0), emission_rgb=(0.05, 0.75, 1.0), emission_strength=3.0)
    mat_inlet = make_mat("InletGreen", (0.0, 1.0, 0.53, 1.0), emission_rgb=(0.0, 1.0, 0.53), emission_strength=4.5)
    mat_outlet = make_mat("OutletCyan", (0.0, 0.83, 1.0, 1.0), emission_rgb=(0.0, 0.83, 1.0), emission_strength=4.5)
    mat_house = make_mat("HouseWall", (0.91, 0.87, 0.83, 1.0), roughness=0.8)
    mat_win = make_mat("HouseWindow", (1.0, 0.88, 0.40, 1.0), emission_rgb=(1.0, 0.88, 0.40), emission_strength=4.0)

    # Terrain & Mini_City_Houses
    add_beveled_cube("Diorama_Ground", (10.8, 8.0, 0.4), (0.0, 0.0, -0.2), mat_grass)
    for idx, hx in enumerate((-3.4, -1.5, 0.3, 2.3)):
        add_beveled_cube(f"Mini_House_{idx}", (1.5, 1.35, 1.4), (hx, 2.8, 0.7), mat_house)
        win = add_beveled_cube(f"Mini_Win_{idx}", (0.3, 0.06, 0.32), (hx, 2.11, 0.8), mat_win, bevel_width=0.01)

    # Water_Tower_LowPoly + Glass Tank + Animated Water Fill Cylinder
    tx = -1.75
    for sx in (-0.65, 0.65):
        for sy in (-0.65, 0.65):
            add_beveled_cube(f"Tower_Leg_{sx}_{sy}", (0.12, 0.12, 3.05), (tx + sx, sy, 1.525), mat_steel, bevel_width=0.01)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.92, depth=1.45, vertices=28, location=(tx, 0.0, 3.82))
    glass_tank = bpy.context.active_object
    glass_tank.name = "Water_Tower_Glass_Tank"
    glass_tank.data.materials.append(mat_glass)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=1.35, vertices=28, location=(tx, 0.0, 3.78))
    water_cyl = bpy.context.active_object
    water_cyl.name = "Water_Fill_Cylinder"
    water_cyl.data.materials.append(mat_water)

    # Keyframe Segmen 2 Tank Fill Animation (frames 408..548)
    water_cyl.scale = (1.0, 1.0, 0.18)
    water_cyl.keyframe_insert("scale", frame=405)
    water_cyl.scale = (1.0, 1.0, 0.98)
    water_cyl.keyframe_insert("scale", frame=548)

    # Green Left Inlet Pipe & Cyan Underground Outlet Pipe + Sink_Cutaway House
    add_beveled_cube("Pipe_Inlet_Left", (0.10, 0.10, 4.2), (tx - 0.98, -0.2, 2.3), mat_inlet, bevel_width=0.02)
    add_beveled_cube("Pipe_Outlet_Down", (0.11, 0.11, 3.6), (tx + 0.35, -0.2, 1.25), mat_outlet, bevel_width=0.02)
    add_beveled_cube("Pipe_Underground_Main", (2.9, 0.11, 0.11), (-0.15, -0.2, -0.52), mat_outlet, bevel_width=0.02)
    add_beveled_cube("Sink_Cutaway_House", (1.9, 1.35, 2.55), (1.55, 0.0, 1.275), mat_house)

    # Camera (9:16 Vertical)
    bpy.ops.object.camera_add(location=(0.05, -8.5, 2.8), rotation=(math.radians(78), 0.0, 0.0))
    cam = bpy.context.active_object
    cam.data.lens = 35
    scn.camera = cam

    audio_path = os.path.abspath("assets/audio/ep03/master_ep03_mix.wav")
    if os.path.exists(audio_path):
        scn.sequence_editor_create()
        scn.sequence_editor.sequences.new_sound("MasterMixEp03", audio_path, channel=1, frame_start=1)


if __name__ == "__main__":
    build_episode3_scene()
    print("Blender 4.x Episode 3 scene ('Water Tower Hydrostatic Pressure') constructed successfully.")
