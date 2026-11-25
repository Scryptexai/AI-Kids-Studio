"""
Blender 4.x Procedural Scene & Animation Generator — Episode 2:
"Kenapa Tutup Gorong-Gorong Selalu Bulat?" (Geometri Manhole Cover)

Usage inside Blender 4.x:
    blender --background --python blender/ep02_manhole_cover_bpy.py -- --render-mp4 output/ep02_blender.mp4
Or open Blender -> Scripting -> Run Script to inspect the full 3D cutaway & manhole rig interactively.
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


def make_mat(name, rgba, roughness=0.55, metallic=0.0, emission_rgb=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
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


def build_episode2_scene():
    clear_scene()
    scn = bpy.context.scene
    scn.render.resolution_x = 1080
    scn.render.resolution_y = 1920
    scn.render.fps = 24
    scn.frame_start = 1
    scn.frame_end = 24 * 56

    if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scn.render.bl_rna.properties["engine"].enum_items]:
        scn.render.engine = "BLENDER_EEVEE_NEXT"
    else:
        scn.render.engine = "BLENDER_EEVEE"

    # Bright Daylight Sun + Sky Fill
    bpy.ops.object.light_add(type="SUN", location=(5.0, -5.0, 9.0))
    sun = bpy.context.active_object
    sun.data.energy = 3.6
    sun.rotation_euler = (math.radians(46), math.radians(18), math.radians(32))

    # Materials
    mat_asphalt = make_mat("Asphalt", (0.20, 0.23, 0.29, 1.0), roughness=0.82)
    mat_concrete = make_mat("Concrete", (0.45, 0.49, 0.56, 1.0), roughness=0.80)
    mat_iron = make_mat("CastIron", (0.30, 0.34, 0.42, 1.0), roughness=0.42, metallic=0.65)
    mat_rim_yel = make_mat("RimYellow", (1.0, 0.9, 0.0, 1.0), emission_rgb=(1.0, 0.9, 0.0), emission_strength=5.5)
    mat_green = make_mat("GreenSide100", (0.0, 1.0, 0.5, 1.0), emission_rgb=(0.0, 1.0, 0.5), emission_strength=6.0)
    mat_red = make_mat("RedDiag141", (1.0, 0.16, 0.26, 1.0), emission_rgb=(1.0, 0.16, 0.26), emission_strength=6.5)
    mat_vest = make_mat("WorkerVest", (0.98, 0.45, 0.09, 1.0), roughness=0.5)
    mat_hat = make_mat("SafetyHelmet", (0.98, 0.82, 0.08, 1.0), roughness=0.35)

    # Road & Underground_Pipe_Cutaway
    add_beveled_cube("Road_Left", (2.2, 14.0, 0.25), (-1.9, 0.0, -0.125), mat_asphalt)
    add_beveled_cube("Road_Right", (2.2, 14.0, 0.25), (1.9, 0.0, -0.125), mat_asphalt)
    add_beveled_cube("Underground_Pipe_Cutaway_Back", (1.7, 0.18, 2.7), (0.0, 0.80, -1.4), mat_concrete)
    add_beveled_cube("Underground_Pipe_Cutaway_L", (0.18, 1.6, 2.7), (-0.76, 0.0, -1.4), mat_concrete)
    add_beveled_cube("Underground_Pipe_Cutaway_R", (0.18, 1.6, 2.7), (0.76, 0.0, -1.4), mat_concrete)
    add_beveled_cube("Underground_Pipe_Cutaway_Floor", (1.7, 1.6, 0.18), (0.0, 0.0, -2.72), mat_concrete)

    # Inner Lip Rim (5 cm smaller than cover!)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.50, minor_radius=0.035, location=(0.0, 0.0, -0.05))
    rim = bpy.context.active_object
    rim.name = "Manhole_Inner_Rim"
    rim.data.materials.append(mat_rim_yel)

    # Manhole_Round (Ø 1.07m)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.535, depth=0.075, vertices=32, location=(0.0, 0.0, 0.02))
    mh_round = bpy.context.active_object
    mh_round.name = "Manhole_Round"
    mh_round.data.materials.append(mat_iron)

    # Manhole_Square (1.08m x 1.08m) — animated in Segmen 2 to lift, tilt 45 deg & fall through diagonal!
    mh_square = add_beveled_cube("Manhole_Square", (1.08, 1.08, 0.075), (0.0, 0.0, -5.0), mat_iron, bevel_width=0.015)

    # Measurement Arrows (Green 100cm Side & Red 141cm Diagonal)
    side_arrow = add_beveled_cube("Arrow_Green_100cm", (1.08, 0.06, 0.06), (0.0, -0.58, 0.08), mat_green, bevel_width=0.01)
    diag_arrow = add_beveled_cube("Arrow_Red_141cm", (1.52, 0.06, 0.06), (0.0, 0.0, 0.10), mat_red, bevel_width=0.01)
    diag_arrow.rotation_euler = (0.0, 0.0, math.radians(45.0))

    # Character_Blocky (Worker inside shaft -> street roller)
    worker_root = bpy.data.objects.new("Character_Blocky", None)
    scn.collection.objects.link(worker_root)
    worker_root.location = (0.0, 0.0, -2.65)
    torso = add_beveled_cube("Worker_Torso", (0.42, 0.24, 0.48), (0.0, 0.0, 0.72), mat_vest)
    helmet = add_beveled_cube("Worker_Helmet", (0.40, 0.42, 0.18), (0.0, 0.0, 1.28), mat_hat)
    torso.parent = worker_root
    helmet.parent = worker_root

    # Keyframe Segmen 2 Square Drop & Segmen 3 Round Rim Stop & Segmen 4 Rolling Wheel!
    mh_round.keyframe_insert("location", frame=1)
    mh_round.location = (0.0, 0.0, -5.0)
    mh_round.keyframe_insert("location", frame=345)

    mh_square.keyframe_insert("location", frame=340)
    mh_square.location = (0.0, 0.0, 1.15)
    mh_square.keyframe_insert("location", frame=390)
    mh_square.keyframe_insert("rotation_euler", frame=535)
    mh_square.rotation_euler = (math.radians(87.0), 0.0, math.radians(45.0))
    mh_square.keyframe_insert("rotation_euler", frame=560)
    mh_square.location = (0.0, 0.0, -1.05)
    mh_square.keyframe_insert("location", frame=582)

    # Camera Setup (9:16 Vertical)
    bpy.ops.object.camera_add(location=(1.8, -5.8, 3.8), rotation=(math.radians(58), 0.0, math.radians(16)))
    cam = bpy.context.active_object
    cam.data.lens = 34
    scn.camera = cam

    audio_path = os.path.abspath("assets/audio/ep02/master_ep02_mix.wav")
    if os.path.exists(audio_path):
        scn.sequence_editor_create()
        scn.sequence_editor.sequences.new_sound("MasterMixEp02", audio_path, channel=1, frame_start=1)


if __name__ == "__main__":
    build_episode2_scene()
    print("Blender 4.x Episode 2 scene ('Manhole Cover Geometry') constructed successfully.")
