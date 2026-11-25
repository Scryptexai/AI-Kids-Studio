"""
Blender 4.x Python Automation Script (bpy) — Episode 1: Inductive Loop Sensor
Run headless on a Blender 4.x workstation:
    blender -b -P blender/ep01_inductive_loop_bpy.py -- --render output/blender_ep01.mp4
Or open in Blender GUI to inspect/tweak generated 3D Low-Poly Diorama, Shaders & Keyframes:
    blender -P blender/ep01_inductive_loop_bpy.py
"""
import math
import os
import sys

try:
    import bpy
except ImportError:
    print("Note: Run this script inside Blender 4.x (`blender -b -P blender/ep01_inductive_loop_bpy.py`).")
    sys.exit(0)


FPS = 24
DURATION_SEC = 59
TOTAL_FRAMES = FPS * DURATION_SEC


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = TOTAL_FRAMES
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100

    # Blender 4.x EEVEE / EEVEE Next engine configuration
    available_engines = {e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available_engines else "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "use_bloom"):
            scene.eevee.use_bloom = True

    # Stylized bright night sky world
    world = bpy.data.worlds.new("StylizedNightWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.09, 0.13, 0.24, 1.0)
        bg.inputs[1].default_value = 1.15
    return scene


def make_principled_mat(name, rgba, roughness=0.55, alpha=1.0, emission_rgba=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 0.999:
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
    if emission_rgba is not None and emission_strength > 0.0:
        em_key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if em_key in bsdf.inputs:
            bsdf.inputs[em_key].default_value = emission_rgba
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def make_fresnel_dome_mat(name="Mat_Magnetic_Dome"):
    """Fresnel + Emission shader for translucent pulsing Magnetic Dome."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    emiss = nt.nodes.new("ShaderNodeEmission")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.45

    emiss.inputs["Color"].default_value = (0.0, 0.85, 1.0, 1.0)
    emiss.inputs["Strength"].default_value = 3.2

    nt.links.new(lw.outputs["Fresnel"], mix.inputs["Fac"])
    nt.links.new(transp.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emiss.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat, emiss


def add_bevel(obj, width=0.04, segments=2):
    mod = obj.modifiers.new(name="StylizedBevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def build_episode1_scene():
    scene = reset_scene()

    # Materials
    mat_asphalt = make_principled_mat("Road_Asphalt", (0.21, 0.24, 0.30, 1.0), roughness=0.85)
    mat_cutaway = make_principled_mat("Road_Cutaway_Patch", (0.21, 0.24, 0.30, 1.0), roughness=0.85, alpha=1.0)
    mat_sidewalk = make_principled_mat("Sidewalk_Pastel", (0.68, 0.72, 0.78, 1.0), roughness=0.8)
    mat_pole = make_principled_mat("Pole_Metal", (0.35, 0.39, 0.46, 1.0), roughness=0.38)
    mat_coil = make_principled_mat(
        "Copper_Inductive_Loop", (1.0, 0.66, 0.0, 1.0), roughness=0.25,
        emission_rgba=(1.0, 0.66, 0.0, 1.0), emission_strength=0.0
    )
    mat_scooter_body = make_principled_mat("Scooter_Fairing", (0.30, 0.80, 0.77, 1.0), roughness=0.32)
    mat_scooter_metal = make_principled_mat(
        "Scooter_Chassis_Metal", (0.55, 0.60, 0.68, 1.0), roughness=0.25,
        emission_rgba=(1.0, 0.15, 0.10, 1.0), emission_strength=0.0
    )
    mat_dome, dome_emiss_node = make_fresnel_dome_mat()

    # 1. Road Intersection & Cutaway Asphalt Patch
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.1))
    road = bpy.context.active_object
    road.name = "Road_Intersection_LowPoly"
    road.scale = (16.0, 16.0, 0.2)
    road.data.materials.append(mat_asphalt)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.35, -3.45, 0.01))
    cut_patch = bpy.context.active_object
    cut_patch.name = "Asphalt_Cutaway_Layer"
    cut_patch.scale = (2.8, 3.2, 0.18)
    cut_patch.data.materials.append(mat_cutaway)

    # 2. Copper_Coil_Loop (Rounded rectangle curve w/ bevel depth)
    curve_data = bpy.data.curves.new("Copper_Coil_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.04
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("POLY")
    loop_pts = [
        (-2.15, -2.45, -0.20), (-0.55, -2.45, -0.20),
        (-0.55, -4.45, -0.20), (-2.15, -4.45, -0.20),
    ]
    spline.points.add(len(loop_pts) - 1)
    for i, (x, y, z) in enumerate(loop_pts):
        spline.points[i].co = (x, y, z, 1.0)
    spline.use_cyclic_u = True
    coil_obj = bpy.data.objects.new("Copper_Coil_Loop", curve_data)
    bpy.context.collection.objects.link(coil_obj)
    coil_obj.data.materials.append(mat_coil)

    # 3. Magnetic Dome
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.25, location=(-1.35, -3.45, 0.0))
    dome = bpy.context.active_object
    dome.name = "Magnetic_Field_Dome"
    dome.scale = (0.85, 1.05, 1.25)
    dome.data.materials.append(mat_dome)

    # 4. Traffic Light + Control Box
    bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=4.4, location=(-3.35, -1.65, 2.2))
    pole = bpy.context.active_object
    pole.name = "Traffic_Light_Pole"
    pole.data.materials.append(mat_pole)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-3.55, -3.45, 0.72))
    cabinet = bpy.context.active_object
    cabinet.name = "Control_Cabinet"
    cabinet.scale = (0.68, 0.52, 1.12)
    add_bevel(cabinet, 0.04)
    cabinet.data.materials.append(mat_sidewalk)

    # 5. Scooter_Model + Character_Blocky
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.35, -3.45, 0.52))
    scooter = bpy.context.active_object
    scooter.name = "Scooter_Model"
    scooter.scale = (0.48, 1.25, 0.55)
    add_bevel(scooter, 0.05)
    scooter.data.materials.append(mat_scooter_body)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.35, -3.45, 0.26))
    chassis = bpy.context.active_object
    chassis.name = "Scooter_Metal_Chassis"
    chassis.scale = (0.34, 0.95, 0.24)
    chassis.parent = scooter
    chassis.data.materials.append(mat_scooter_metal)

    # 6. Lighting (Even bright night setup without pitch-black shadows)
    bpy.ops.object.light_add(type="SUN", location=(4.0, -6.0, 8.0))
    sun = bpy.context.active_object
    sun.data.energy = 2.4
    sun.rotation_euler = (math.radians(42), math.radians(18), math.radians(28))

    bpy.ops.object.light_add(type="POINT", location=(2.5, -2.0, 4.0))
    lamp = bpy.context.active_object
    lamp.data.energy = 450.0
    lamp.data.color = (1.0, 0.68, 0.32)

    # 7. Vertical 9:16 Camera & Keyframe Choreography
    bpy.ops.object.camera_add(location=(2.8, -9.2, 6.2))
    cam = bpy.context.active_object
    cam.name = "Shorts_Camera_9x16"
    cam.rotation_euler = (math.radians(58), 0.0, math.radians(18))
    scene.camera = cam

    cam_keyframes = [
        (1, (3.2, -10.0, 6.8)),
        (int(8.2 * FPS), (2.1, -7.8, 4.9)),
        (int(11.0 * FPS), (1.4, -6.2, 4.1)),
        (int(17.0 * FPS), (1.8, -6.5, 2.7)),
        (int(30.0 * FPS), (2.4, -7.9, 3.3)),
        (int(50.0 * FPS), (2.2, -8.8, 5.7)),
    ]
    for frame_no, loc in cam_keyframes:
        cam.location = loc
        cam.keyframe_insert(data_path="location", frame=frame_no)

    # Keyframe Inductive Loop Emission & Magnetic Dome Color Shift in Segment 3 & 4
    coil_bsdf = mat_coil.node_tree.nodes.get("Principled BSDF")
    if coil_bsdf and "Emission Strength" in coil_bsdf.inputs:
        em_in = coil_bsdf.inputs["Emission Strength"]
        for fr, val in [(1, 0.0), (int(16.5 * FPS), 0.0), (int(18.5 * FPS), 4.5), (int(41.5 * FPS), 0.0)]:
            em_in.default_value = val
            em_in.keyframe_insert(data_path="default_value", frame=fr)

    for fr, rgba in [
        (1, (0.0, 0.85, 1.0, 1.0)),
        (int(30.5 * FPS), (0.0, 0.85, 1.0, 1.0)),
        (int(31.2 * FPS), (1.0, 0.25, 0.1, 1.0)),
        (int(41.2 * FPS), (0.0, 0.85, 1.0, 1.0)),
    ]:
        dome_emiss_node.inputs["Color"].default_value = rgba
        dome_emiss_node.inputs["Color"].keyframe_insert(data_path="default_value", frame=fr)

    return scene


if __name__ == "__main__":
    scn = build_episode1_scene()
    if "-- --render" in " ".join(sys.argv):
        idx = sys.argv.index("--render")
        out_path = os.path.abspath(sys.argv[idx + 1])
        scn.render.filepath = out_path
        scn.render.image_settings.file_format = "FFMPEG"
        scn.render.ffmpeg.format = "MPEG4"
        scn.render.ffmpeg.codec = "H264"
        scn.render.ffmpeg.audio_codec = "AAC"
        bpy.ops.render.render(animation=True)
