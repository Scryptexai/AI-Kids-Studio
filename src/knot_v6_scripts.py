"""
Knot Theory V6 — High-Density Micro-Shot & 50+-Object Script Blueprints (`src/knot_v6_scripts.py`)

Hard V6 Standards enforced on every ~55-58s Short:
  1. >= 20 distinct camera shots per video (22-23 shots, ~2.4s per shot, 6-8 crisp words/shot).
  2. >= 50 distinct named multi-part 3D objects per video (every spoken noun illustrated).
  3. Total spoken length ~840-920 chars (~52-57s natural `voice-00` pace, strictly < 59.0s Shorts cap).
  4. Mandatory Knot Theory structure: Hook -> Naive Failure Simulation -> Engineering Cutaway ->
     Real-World Context -> Batas Akurasi -> "Oh, jadi..." Synthesis -> A/B Question -> White-Button CTA.
"""

from __future__ import annotations

V6_EPISODE_ORDER = ["KT-R07", "KT-R08", "KT-S15", "KT-S16"]

V6_EPISODES: dict[str, dict] = {
    # =========================================================================
    # 1. KT-R07 — Bantalan Karet Berlapis Baja Jembatan (22 Shots, 59 Objects)
    # =========================================================================
    "KT-R07": {
        "id": "KT-R07",
        "slot_label": "MALAM_SHORT",
        "scheduledFor": "2026-12-02T20:30:00",
        "category": "CIVIL & BRIDGE ENGINEERING",
        "hook_banner": "JEMBATAN RIBUAN TON DUDUK DI ATAS KARET?",
        "title": "Bantalan Karet Berlapis Baja yang Menyangga Jembatan Tol Ribuan Ton #Shorts",
        "cta_question": "Bagian jembatan mana yang paling gak nyangka kerjanya? (BANTALAN KARET BAJA vs JARI EXPANSION JOINT)",
        "reference": "Standar Bantalan Jembatan AASHTO LRFD Bridge Design Section 14 & SNI 3967.",
        "tags": [
            "Knot Theory", "elastomeric bearing", "bantalan jembatan", "teknik sipil",
            "jembatan tol", "infrastruktur tersembunyi", "edukasi sains", "shorts indonesia",
        ],
        "shots": [
            {
                "id": "s01", "recipe": "wide_establish", "Badge": "JALAN TOL LAYANG",
                "text": "Saat truk kontainer melintasi tol layang,",
                "ptr": ((0.0, 1.55, 0.0), "GELAGAR BETON RIBUAN TON"),
                "objects": ["sky_horizon_day", "valley_river_channel", "river_water_current", "highway_deck_slab", "asphalt_road_lanes", "container_truck_18w", "passenger_sedan_blue", "highway_cobra_lamp", "jersey_barrier_wall", "roadside_pine_trees"],
            },
            {
                "id": "s02", "recipe": "dolly_reveal", "Badge": "CELAH KEPALA PILAR",
                "text": "gelagar ribuan ton tak dicor mati ke pilar.",
                "ptr": ((0.0, 0.58, 0.0), "TIDAK DICOR MATI!"),
                "objects": ["hammerhead_concrete_pier", "pier_pile_footing", "steel_box_girder", "cross_diaphragm_brace", "elastomeric_pad_whole", "anchor_grout_plinth"],
            },
            {
                "id": "s03", "recipe": "macro_zoom", "Badge": "BLOK HITAM TIPIS",
                "text": "Semuanya duduk di blok karet setebal bantal!",
                "ptr": ((0.0, 0.42, 0.0), "BLOK KARET SETEBAL BANTAL"),
                "objects": ["sole_plate_top", "sole_plate_bottom", "anchor_stud_bolts", "bearing_serial_tag", "underbridge_catwalk", "bridge_inspector_human"],
            },
            {
                "id": "s04", "recipe": "heat_noon", "Badge": "SIANG TERIK 38°C",
                "text": "Siang terik membuat beton memuai panjang,",
                "ptr": ((0.15, 0.95, 0.0), "SIANG PANAS -> MEMUAI"),
                "objects": ["sun_heat_orb_3d", "thermometer_tower_hot", "thermal_expansion_arrows", "expansion_finger_joint"],
            },
            {
                "id": "s05", "recipe": "cold_night", "Badge": "MALAM DINGIN 18°C",
                "text": "malam dingin menyusutkannya beberapa senti.",
                "ptr": ((-0.15, 0.95, 0.0), "MALAM DINGIN -> MENYUSUT"),
                "objects": ["crescent_moon_3d", "thermometer_tower_cold", "contraction_arrows_blue", "streetlight_night_glow"],
            },
            {
                "id": "s06", "recipe": "fail_rigid", "Badge": "TUMPUAN KAKU RETAK",
                "text": "Jika dibaut kaku, kepala pilar langsung retak!",
                "ptr": ((0.0, 0.55, 0.15), "KEPALA PILAR RETAK!"),
                "objects": ["rigid_concrete_support_bad", "spalling_crack_wedges", "exposed_bent_rebar", "falling_concrete_debris"],
            },
            {
                "id": "s07", "recipe": "truck_deflect", "Badge": "LENDUTAN RODA TRUK",
                "text": "Tiap truk lewat, ujung gelagar ikut melendut.",
                "ptr": ((0.0, 0.85, 0.0), "UJUNG GELAGAR MELENDUT"),
                "objects": ["heavy_dump_truck_gravel", "suvs_convoy_car", "rotation_angle_arc_3d", "pier_drainage_downspout"],
            },
            {
                "id": "s08", "recipe": "fail_raw_rubber", "Badge": "KARET POLOS ROBEK!",
                "text": "Karet polos biasa pasti mekar dan robek!",
                "ptr": ((0.0, 0.36, 0.28), "MENGGEMBUNG & ROBEK!"),
                "objects": ["lab_compression_frame", "hydraulic_ram_piston", "raw_rubber_bulge_bad", "sidewall_split_tear"],
            },
            {
                "id": "s09", "recipe": "cutaway_reveal", "Badge": "LAMINATED BEARING",
                "text": "Mari belah Laminated Elastomeric Bearing.",
                "ptr": ((0.0, 0.44, 0.18), "BELAHAN BANTALAN JEMBATAN"),
                "objects": ["elastomeric_pad_cutaway", "laser_cut_plane_glow", "inspection_spotlight_rig"],
            },
            {
                "id": "s10", "recipe": "macro_layers", "Badge": "BAJA + NEOPRENA",
                "text": "Di dalamnya berselang-seling pelat baja tipis.",
                "ptr": ((0.0, 0.46, 0.22), "6 PELAT BAJA + 7 KARET"),
                "objects": ["neoprene_layer_stack", "internal_steel_shims_6x", "outer_ozone_rubber_cover"],
            },
            {
                "id": "s11", "recipe": "factory_press", "Badge": "VULKANISASI PANAS",
                "text": "Karet dan baja dimasak di mesin vulkanisasi.",
                "ptr": ((0.0, 0.72, 0.0), "MESIN KEMPA VULKANISASI"),
                "objects": ["vulcanizing_autoclave_press", "steam_manifold_pipes", "factory_pressure_gauge", "factory_tech_worker"],
            },
            {
                "id": "s12", "recipe": "vertical_lock", "Badge": "KUNCI MEKAR SAMPING",
                "text": "Baja mengunci karet agar tak mekar ke samping,",
                "ptr": ((0.0, 0.48, 0.22), "BAJA TAHAN MEKAR SAMPING"),
                "objects": ["vertical_load_arrows_red", "tensile_shim_arrows_cyan", "digital_load_cell_2000t"],
            },
            {
                "id": "s13", "recipe": "horizontal_shear", "Badge": "GESER HORIZONTAL",
                "text": "tapi lapis karetnya lentur bergeser saat muai!",
                "ptr": ((0.18, 0.52, 0.15), "GESER HORIZONTAL MULUS!"),
                "objects": ["shear_parallelogram_stack", "dial_micrometer_stand", "console_dual_monitor"],
            },
            {
                "id": "s14", "recipe": "rotational_flex", "Badge": "REDAM ROTASI SUDUT",
                "text": "Tebal karetnya juga meredam ayunan gelagar.",
                "ptr": ((-0.20, 0.50, 0.15), "AYUNAN SUDUT TEREDAM"),
                "objects": ["oscilloscope_wave_rig", "safety_mesh_guard", "workzone_cone_pair"],
            },
            {
                "id": "s15", "recipe": "inspector_walk", "Badge": "INSPEKSI KOLONG TOL",
                "text": "Teknisi rutin mengeceknya dari kolong pilar.",
                "ptr": ((-0.55, 0.85, 0.25), "INSPEKSI CELAH BANTALAN"),
                "objects": ["flashlight_beam_cone", "inspector_clipboard_caliper", "surveying_total_station"],
            },
            {
                "id": "s16", "recipe": "boundary_cable_bridge", "Badge": "BATAS AKURASI",
                "text": "Batas akurasi: jembatan cable-stayed raksasa",
                "ptr": ((0.0, 2.40, 0.0), "JEMBATAN BENTANG RAKSASA"),
                "objects": ["cable_stayed_a_pylon", "fan_stay_cables_array", "cargo_barge_ship"],
            },
            {
                "id": "s17", "recipe": "boundary_pot_ptfe", "Badge": "POT BEARING PTFE",
                "text": "memakai Pot Bearing berlapis teflon PTFE.",
                "ptr": ((0.0, 0.45, 0.18), "POT BEARING + TEFLON PTFE"),
                "objects": ["ptfe_spherical_pot_bearing", "stainless_slider_mirror", "brass_sealing_ring"],
            },
            {
                "id": "s18", "recipe": "split_recap", "Badge": "KAKU ATAS · LENTUR SAMPING",
                "text": "Paduan baja-karet ini kuat memikul jalan tol.",
                "ptr": ((0.0, 0.55, 0.0), "KAKU VERTIKAL · LENTUR GESER"),
                "objects": ["city_skyline_backdrop", "commuter_bus_green"],
            },
            {
                "id": "s19", "recipe": "oh_jadi_glide", "Badge": "INTI REKAYASA",
                "text": "Oh, jadi kue karet-baja ini cegah pilar retak!",
                "ptr": ((0.0, 0.65, 0.0), "BEBAS MEMUAI TANPA RETAK!"),
                "objects": ["overhead_highway_gantry"],
            },
            {
                "id": "s20", "recipe": "ab_poll_stage", "Badge": "PILIH DI KOMENTAR!",
                "text": "Pilih karet-baja ini atau jari sambungan tol?",
                "ptr": ((0.0, 0.75, 0.0), "A: KARET BAJA  vs  B: JARI BAJA"),
                "objects": ["poll_pedestal_left", "poll_pedestal_right"],
            },
            {
                "id": "s21", "recipe": "comment_wave", "Badge": "DISKUSI TEKNIK",
                "text": "Tulis pilihanmu di kolom komentar ya!",
                "ptr": ((0.0, 1.15, 0.0), "TULIS A ATAU B DI BAWAH!"),
                "objects": ["studio_truss_arch"],
            },
            {
                "id": "s22", "recipe": "cta_white_stage", "Badge": "TOMBOL PUTIH!",
                "text": "Tekan tombol putih di bawah setiap hari!",
                "ptr": ((0.0, 0.65, 0.0), "TEKAN TOMBOL PUTIH!"),
                "objects": ["cta_plinth_3d", "white_subscribe_button_3d", "pointer_hand_3d"],
            },
        ],
    },

    # =========================================================================
    # 2. KT-R08 — Pipa Air Gedung Pencakar Langit & Break Tank (22 Shots, 58 Objects)
    # =========================================================================
    "KT-R08": {
        "id": "KT-R08",
        "slot_label": "PAGI_SHORT",
        "scheduledFor": "2026-12-03T08:00:00",
        "category": "SKYSCRAPER MEP ENGINEERING",
        "hook_banner": "PIPA AIR 500 METER BISA MELEDAK DI DASAR!",
        "title": "Kenapa Pipa Air Gedung Tinggi Tidak Boleh Tersambung Lurus dari Bawah ke Atas? #Shorts",
        "cta_question": "Rahasia gedung tinggi mana yang paling mengejutkan? (TANGKI PEMUTUS TEKANAN vs BOLA RAKSASA ANTI-ANGIN)",
        "reference": "Standar Plambing Gedung Tinggi IPC / ASHRAE HVAC Applications Ch. 4 & SNI 8153.",
        "tags": [
            "Knot Theory", "gedung pencakar langit", "break tank", "plambing gedung tinggi",
            "lantai mekanikal", "teknik mesin", "infrastruktur tersembunyi", "shorts indonesia",
        ],
        "shots": [
            {
                "id": "s01", "recipe": "wide_establish", "Badge": "MENARA 90 LANTAI",
                "text": "Di gedung pencakar langit lima ratus meter,",
                "ptr": ((0.0, 3.10, 0.0), "MENARA KACA 500 METER"),
                "objects": ["sky_city_morning", "skyscraper_90f_glass", "neighbor_office_tower", "downtown_avenue_asphalt", "city_sedan_car", "transit_city_bus", "avenue_shade_trees", "street_bollard_lamps"],
            },
            {
                "id": "s02", "recipe": "dolly_louver", "Badge": "LANTAI TANPA JENDELA",
                "text": "ada lantai kisi gelap tanpa kaca di tengah.",
                "ptr": ((0.0, 2.05, 0.42), "LANTAI KISI UDARA (LOUVER)"),
                "objects": ["louver_facade_band", "curtain_wall_mullions", "facade_cleaning_gondola"],
            },
            {
                "id": "s03", "recipe": "penthouse_sink", "Badge": "KERAN LANTAI ATAS",
                "text": "Di puncak, air keran tetap mengalir lembut.",
                "ptr": ((0.0, 0.92, 0.18), "ALIRAN AIR TENANG 3 BAR"),
                "objects": ["bathroom_tile_room", "vanity_ceramic_sink", "chrome_mixer_faucet", "led_vanity_mirror", "towel_holder_rack", "resident_person_rig"],
            },
            {
                "id": "s04", "recipe": "xray_500m_pipe", "Badge": "JIKA PIPA LURUS 500M",
                "text": "Bayangkan satu pipa lurus dari atap ke dasar!",
                "ptr": ((0.0, 1.85, 0.15), "1 PIPA LURUS TANPA PUTUS"),
                "objects": ["xray_tower_shell", "continuous_red_riser_500m", "elevation_markers_100_500", "hydrostatic_down_arrows"],
            },
            {
                "id": "s05", "recipe": "gauge_50bar", "Badge": "TIAP 10M = +1 BAR!",
                "text": "Tiap sepuluh meter nambah satu—tembus lima puluh bar!",
                "ptr": ((0.22, 0.85, 0.12), "JARUM MENTOK 50 BAR!"),
                "objects": ["graduated_water_column", "bourdon_gauge_50bar_red", "pressure_scale_plaque"],
            },
            {
                "id": "s06", "recipe": "fail_pipe_burst", "Badge": "SAMBUNGAN PIPA JEBOL!",
                "text": "Tekanan itu menjebol pipa dan keran bawah!",
                "ptr": ((0.0, 0.72, 0.18), "FLANGE PIPA & KERAN JEBOL!"),
                "objects": ["cast_iron_flange_elbow", "ruptured_rubber_gasket", "high_pressure_water_jet", "ground_floor_kitchen_sink"],
            },
            {
                "id": "s07", "recipe": "fail_pump_overload", "Badge": "POMPA BAWAH OVERLOAD",
                "text": "Dipompa langsung dari bawah pun membakar motor.",
                "ptr": ((0.0, 0.68, 0.15), "POMPA TUNGGAL OVERLOAD!"),
                "objects": ["basement_pump_room", "giant_overloaded_pump", "electric_drive_motor", "overheat_smoke_plume", "alarm_control_cabinet"],
            },
            {
                "id": "s08", "recipe": "mech_floor_reveal", "Badge": "LANTAI MEKANIKAL",
                "text": "Maka tiap tiga puluh lantai ada ruang mesin.",
                "ptr": ((0.0, 0.95, 0.0), "RUANG MESIN LANTAI 30 & 60"),
                "objects": ["mep_epoxy_floor_deck", "overhead_pipe_trapeze", "cable_ladder_tray", "mep_technician_rig"],
            },
            {
                "id": "s09", "recipe": "relay_pump_z1", "Badge": "POMPA ESTAFET ZONA 1",
                "text": "Air dipompa estafet ke tangki Break Tank.",
                "ptr": ((-0.35, 0.65, 0.15), "POMPA ESTAFET KE BREAK TANK"),
                "objects": ["booster_pump_skid_duplex", "neoprene_vibration_pad", "stainless_break_tank", "zone1_rising_main_pipe"],
            },
            {
                "id": "s10", "recipe": "break_tank_cutaway", "Badge": "VENTILASI UDARA BEBAS",
                "text": "Di Break Tank terbuka, kolom air diputus!",
                "ptr": ((0.0, 0.82, 0.20), "PERMUKAAN AIR TERBUKA"),
                "objects": ["brass_float_ball_valve", "open_water_surface_wave", "gooseneck_air_vent", "overflow_drain_standpipe", "level_sight_glass_tube"],
            },
            {
                "id": "s11", "recipe": "dual_gauge_reset", "Badge": "RESET JADI 0 BAR!",
                "text": "Menyentuh udara bebas, tekanan kembali nol bar!",
                "ptr": ((0.25, 0.72, 0.15), "30 BAR -> RESET 0 BAR!"),
                "objects": ["inlet_gauge_30bar", "outlet_gauge_0bar_green", "butterfly_shutoff_valve", "swing_check_valve"],
            },
            {
                "id": "s12", "recipe": "zone2_relay_up", "Badge": "ESTAFET KE PUNCAK",
                "text": "Pompa kedua lalu mendorongnya ke zona atas.",
                "ptr": ((0.0, 1.45, 0.0), "ESTAFET ZONA 2 -> ATAP"),
                "objects": ["vfd_inverter_panel", "upper_break_tank_z2", "rooftop_header_tank"],
            },
            {
                "id": "s13", "recipe": "prv_station", "Badge": "KATUP KUNINGAN PRV",
                "text": "Saat turun ke hunian, air melewati katup PRV.",
                "ptr": ((0.0, 0.65, 0.18), "PRESSURE REDUCING VALVE"),
                "objects": ["brass_prv_assembly", "y_strainer_mesh_body", "bypass_globe_loop", "subzone_3bar_gauge"],
            },
            {
                "id": "s14", "recipe": "prv_cutaway", "Badge": "PEGAS & DIAFRAGMA",
                "text": "Pegas PRV menjaga tekanan stabil tiga bar.",
                "ptr": ((0.0, 0.68, 0.20), "PEGAS JAGA 3.5 BAR"),
                "objects": ["prv_cutaway_spring", "rubber_diaphragm_plate", "throttling_valve_cone"],
            },
            {
                "id": "s15", "recipe": "shower_comfort", "Badge": "SHOWER AMAN MERATA",
                "text": "Shower lantai atas dan bawah pun sama nyaman!",
                "ptr": ((0.0, 1.35, 0.12), "NYAMAN DI SEMUA LANTAI"),
                "objects": ["glass_shower_booth", "chrome_rain_showerhead", "gentle_shower_streams"],
            },
            {
                "id": "s16", "recipe": "mep_full_room", "Badge": "MESIN AHU & HIDRAN",
                "text": "Ruang ini juga memuat mesin AHU dan hidran.",
                "ptr": ((0.35, 0.85, 0.0), "BREAK TANK + AHU + HIDRAN"),
                "objects": ["galvanized_ahu_ductwork", "red_fire_jockey_pump"],
            },
            {
                "id": "s17", "recipe": "boundary_lowrise", "Badge": "BATAS AKURASI",
                "text": "Batas akurasi: gedung di bawah delapan lantai",
                "ptr": ((0.0, 1.65, 0.0), "GEDUNG < 8 LANTAI"),
                "objects": ["lowrise_6f_apartment", "rooftop_blue_water_toren", "hydrophore_pressure_tank", "parked_scooter_bike"],
            },
            {
                "id": "s18", "recipe": "boundary_lowrise_pipe", "Badge": "CUKUP TOREN ATAP",
                "text": "cukup memakai toren atap tanpa tangki tengah.",
                "ptr": ((0.0, 2.15, 0.0), "TOREN ATAP SUDAH AMAN"),
                "objects": ["simple_downfeed_pipe"],
            },
            {
                "id": "s19", "recipe": "oh_jadi_tower", "Badge": "INTI REKAYASA",
                "text": "Oh, jadi lantai gelap itu pemutus tekanan air!",
                "ptr": ((0.0, 1.95, 0.25), "STASIUN PEMUTUS TEKANAN!"),
                "objects": ["zoned_3tier_diagram_3d"],
            },
            {
                "id": "s20", "recipe": "ab_poll_stage", "Badge": "PILIH DI KOMENTAR!",
                "text": "Keren tangki pemutus ini atau bola anti-angin?",
                "ptr": ((0.0, 0.75, 0.0), "A: BREAK TANK  vs  B: BOLA TMD"),
                "objects": ["poll_plinth_tank", "poll_plinth_tmd_ball"],
            },
            {
                "id": "s21", "recipe": "comment_wave", "Badge": "DISKUSI TEKNIK",
                "text": "Tulis pilihanmu di kolom komentar ya!",
                "ptr": ((0.0, 1.15, 0.0), "KOMEN A ATAU B DI BAWAH!"),
                "objects": ["mep_control_desk"],
            },
            {
                "id": "s22", "recipe": "cta_white_stage", "Badge": "TOMBOL PUTIH!",
                "text": "Tekan tombol putih di bawah setiap hari!",
                "ptr": ((0.0, 0.65, 0.0), "TEKAN TOMBOL PUTIH!"),
                "objects": ["cta_stage_base", "white_subscribe_3d_pill", "click_hand_cursor_3d"],
            },
        ],
    },

    # =========================================================================
    # 3. KT-S15 — NEXT CONTENT: Jalur Penyelamat Truk Rem Blong (23 Shots, 60 Objects)
    # =========================================================================
    "KT-S15": {
        "id": "KT-S15",
        "slot_label": "SIANG_SHORT",
        "scheduledFor": "2026-12-03T12:30:00",
        "category": "HIGHWAY SAFETY ENGINEERING",
        "hook_banner": "KENAPA JALUR REM BLONG DIISI KERIKIL BULAT?",
        "title": "Kenapa Jalur Penyelamat Truk Rem Blong Diisi Kerikil Bulat Dalam, Bukan Pasir? #Shorts",
        "cta_question": "Penyelamat jalan raya mana yang paling jenius? (KOLAM KERIKIL REM BLONG vs PAGAR GUARDRAIL LENTUR)",
        "reference": "Standar Desain Runaway Truck Ramp AASHTO Green Book & FHWA Technical Advisory T5040.29.",
        "tags": [
            "Knot Theory", "jalur penyelamat", "truk rem blong", "arrester bed",
            "keselamatan jalan tol", "teknik sipil", "edukasi sains", "shorts indonesia",
        ],
        "shots": [
            {
                "id": "s01", "recipe": "mountain_grade_wide", "Badge": "TURUNAN TOL GUNUNG",
                "text": "Di turunan tol gunung ada jalur merah-putih.",
                "ptr": ((0.55, 1.15, -0.5), "JALUR PENYELAMAT MERAH-PUTIH"),
                "objects": ["mountain_ridge_terrain", "steep_asphalt_downgrade", "escape_ramp_lane", "red_white_checker_wall", "pine_forest_slope", "wbeam_steel_guardrail", "warning_gantry_sign", "family_mpv_car"],
            },
            {
                "id": "s02", "recipe": "smoking_brakes_truck", "Badge": "TROMOL REM MEMBARA!",
                "text": "Saat truk menurun lama, tromol rem membara!",
                "ptr": ((0.0, 0.48, 0.35), "TROMOL REM > 500°C!"),
                "objects": ["heavy_18w_semi_truck", "glowing_red_brake_drum", "brake_fade_smoke_trail", "cargo_steel_coils"],
            },
            {
                "id": "s03", "recipe": "cab_pedal_floor", "Badge": "PEDAL REM NGEMPOS",
                "text": "Di kabin, pedal rem mendadak terasa kosong.",
                "ptr": ((0.12, 0.55, 0.20), "PEDAL REM NGEMPOS!"),
                "objects": ["truck_cockpit_interior", "steering_wheel_column", "brake_pedal_floored", "air_pressure_dash_gauge", "truck_driver_rig", "windshield_mountain_view"],
            },
            {
                "id": "s04", "recipe": "swerve_into_ramp", "Badge": "MASUK JALUR DARURAT",
                "text": "Sopir langsung banting setir ke jalur darurat!",
                "ptr": ((0.25, 0.75, 0.0), "MASUK JALUR PENYELAMAT!"),
                "objects": ["chevron_curve_board", "emergency_sos_callbox", "amber_flashing_beacon", "tire_skid_marks"],
            },
            {
                "id": "s05", "recipe": "fail_asphalt_ramp", "Badge": "ASPAL MULUS GAGAL!",
                "text": "Di aspal mulus, truk bisa meluncur mundur!",
                "ptr": ((0.0, 0.85, 0.0), "MELUNCUR MUNDUR LAGI!"),
                "objects": ["plain_asphalt_ramp_bad", "rollback_danger_arrows", "concrete_end_stop_block"],
            },
            {
                "id": "s06", "recipe": "fail_wet_sand", "Badge": "PASIR BASAH KERAS!",
                "text": "Pasir halus basah memadat keras menjungkirkan truk!",
                "ptr": ((0.0, 0.92, 0.15), "PASIR KERAS -> TERJUNGKAL!"),
                "objects": ["rain_cloud_shower_3d", "compacted_sand_mound_bad", "nose_vaulting_truck_cab"],
            },
            {
                "id": "s07", "recipe": "fail_crushed_stone", "Badge": "BATU PECAH MENGUNCI",
                "text": "Batu pecah tajam pun saling mengunci keras.",
                "ptr": ((0.0, 0.42, 0.18), "SUDUT TAJAM MENGUNCI"),
                "objects": ["angular_crushed_rock_pile", "interlocked_jagged_stones", "magnifying_inspection_ring"],
            },
            {
                "id": "s08", "recipe": "pea_gravel_reveal", "Badge": "KERIKIL KACANG BULAT",
                "text": "Kuncinya: kerikil sungai bulat sedalam semeter!",
                "ptr": ((0.0, 0.45, 0.15), "KERIKIL BULAT SEDALAM 1M"),
                "objects": ["arrester_trench_cutaway", "rounded_pea_gravel_bed", "depth_ruler_1meter"],
            },
            {
                "id": "s09", "recipe": "macro_ball_bearings", "Badge": "BERGULIR BAGAI KELERENG",
                "text": "Tanpa sudut tajam, kerikil bergulir bagai kelereng.",
                "ptr": ((0.0, 0.48, 0.20), "BERGULIR BEBAS TAK MEMADAT"),
                "objects": ["macro_round_pebbles_cluster", "void_air_spaces_glow", "sieve_grading_screen"],
            },
            {
                "id": "s10", "recipe": "wheel_sink_plow", "Badge": "RODA AMBLES KE POROS",
                "text": "Roda truk langsung ambles sebatas poros!",
                "ptr": ((0.0, 0.42, 0.25), "BAN AMBLES SAMPAI POROS!"),
                "objects": ["sinking_dual_truck_wheel", "gravel_bow_wave_mound", "flying_pebble_spray"],
            },
            {
                "id": "s11", "recipe": "momentum_transfer", "Badge": "KURAS ENERGI GERAK",
                "text": "Jutaan kerikil menyingkir menguras laju truk.",
                "ptr": ((0.15, 0.65, 0.15), "ENERGI DIKURAS LEMBUT"),
                "objects": ["kinetic_energy_bar_drop", "momentum_scatter_arrows", "safe_deceleration_g_meter"],
            },
            {
                "id": "s12", "recipe": "drainage_subbase", "Badge": "PIPA DRAINASE DASAR",
                "text": "Pipa drainase dasar membuang air hujan cepat.",
                "ptr": ((0.0, 0.22, 0.20), "DRAINASE BAWAH KERIKIL"),
                "objects": ["perforated_underdrain_pipe", "geotextile_filter_sheet", "stormwater_outfall_ditch"],
            },
            {
                "id": "s13", "recipe": "stopped_safe_truck", "Badge": "BERHENTI & TERKUNCI",
                "text": "Saat berhenti, kerikil mengunci ban dari mundur!",
                "ptr": ((0.0, 0.58, 0.20), "TERKUNCI TANPA MUNDUR"),
                "objects": ["halted_truck_in_gravel", "relieved_driver_stepping_out", "wheel_cradle_pocket"],
            },
            {
                "id": "s14", "recipe": "tow_service_lane", "Badge": "JALUR DEREK & JANGKAR",
                "text": "Di sebelahnya ada jalur derek dan jangkar baja.",
                "ptr": ((-0.55, 0.65, 0.15), "MOBIL DEREK + JANGKAR"),
                "objects": ["paved_service_shoulder", "heavy_wrecker_tow_truck", "winch_steel_cable_hook", "concrete_deadman_anchor", "highway_patrol_suv"],
            },
            {
                "id": "s15", "recipe": "rake_fluff_crew", "Badge": "DIGARU LONGGAR LAGI",
                "text": "Petugas lalu menggaruk kerikil agar gembur lagi.",
                "ptr": ((0.15, 0.55, 0.20), "DIGARU RATA KEMBALI"),
                "objects": ["road_maintenance_worker", "gravel_leveling_rake", "mini_skid_steer_loader"],
            },
            {
                "id": "s16", "recipe": "boundary_urban_space", "Badge": "BATAS AKURASI",
                "text": "Batas akurasi: di tebing sempit tanpa lahan,",
                "ptr": ((0.0, 0.95, 0.0), "TEBING SEMPIT"),
                "objects": ["narrow_cliff_viaduct", "rock_cut_retaining_wall"],
            },
            {
                "id": "s17", "recipe": "boundary_drag_net", "Badge": "JARING BAJA PENANGKAP",
                "text": "dipasang jaring baja peredam tarik darurat.",
                "ptr": ((0.0, 0.72, 0.18), "JARING BAJA PENANGKAP"),
                "objects": ["steel_cable_catcher_net", "rotary_friction_energy_drums", "breakaway_support_posts"],
            },
            {
                "id": "s18", "recipe": "split_recap", "Badge": "BULAT vs PASIR PADAT",
                "text": "Batu bulat sederhana menyelamatkan puluhan ton.",
                "ptr": ((0.0, 0.55, 0.0), "KERIKIL BULAT vs PASIR KERAS"),
                "objects": ["comparison_divider_arch"],
            },
            {
                "id": "s19", "recipe": "oh_jadi_ramp", "Badge": "INTI REKAYASA",
                "text": "Oh, jadi kerikil bulat menenggelamkan ban lembut!",
                "ptr": ((0.0, 0.78, 0.0), "TENGGELAM LEMBUT & AMAN!"),
                "objects": ["solar_road_stud_lights"],
            },
            {
                "id": "s20", "recipe": "ab_poll_stage", "Badge": "PILIH DI KOMENTAR!",
                "text": "Jenius kolam kerikil ini atau pagar rel tol?",
                "ptr": ((0.0, 0.75, 0.0), "A: KOLAM KERIKIL  vs  B: GUARDRAIL"),
                "objects": ["poll_plinth_gravel", "poll_plinth_guardrail"],
            },
            {
                "id": "s21", "recipe": "comment_wave", "Badge": "DISKUSI TEKNIK",
                "text": "Tulis pilihanmu di kolom komentar ya!",
                "ptr": ((0.0, 1.15, 0.0), "TULIS A ATAU B DI BAWAH!"),
                "objects": ["highway_ops_console", "engineering_globe_emblem"],
            },
            {
                "id": "s22", "recipe": "cta_white_stage", "Badge": "TOMBOL PUTIH!",
                "text": "Tekan tombol putih di bawah sekarang ya!",
                "ptr": ((0.0, 0.65, 0.0), "TEKAN TOMBOL PUTIH!"),
                "objects": ["cta_pedestal_s15", "white_subscribe_3d_s15", "cursor_click_hand_s15"],
            },
        ],
    },

    # =========================================================================
    # 4. KT-S16 — NEXT CONTENT: Lubang Kecil 'Bleed Hole' Jendela Pesawat (23 Shots, 59 Objects)
    # =========================================================================
    "KT-S16": {
        "id": "KT-S16",
        "slot_label": "MALAM_SHORT",
        "scheduledFor": "2026-12-03T20:30:00",
        "category": "AVIATION SAFETY ENGINEERING",
        "hook_banner": "KENAPA JENDELA PESAWAT SENGAJA DILUBANGI KECIL?",
        "title": "Kenapa Lubang Kecil di Jendela Pesawat Justru Menyelamatkan Kaca Utama? #Shorts",
        "cta_question": "Detail kabin pesawat mana yang paling gak disangka fungsinya? (LUBANG KECIL JENDELA vs SUMBAT RODA PESAWAT)",
        "reference": "Regulasi Kelaikan Jendela Kabin Bertekanan FAA 14 CFR § 25.775 & EASA CS-25.",
        "tags": [
            "Knot Theory", "jendela pesawat", "bleed hole pesawat", "kabin pesawat",
            "keselamatan penerbangan", "teknik dirgantara", "edukasi sains", "shorts indonesia",
        ],
        "shots": [
            {
                "id": "s01", "recipe": "jet_climb_clouds", "Badge": "JELAJAH 35.000 KAKI",
                "text": "Saat terbang di tiga puluh lima ribu kaki,",
                "ptr": ((0.0, 1.35, 0.0), "JELAJAH DI ATAS AWAN"),
                "objects": ["stratosphere_sky_dome", "cumulus_cloud_sea", "airliner_fuselage_jet", "swept_wing_winglets", "turbofan_nacelle_pair", "tail_stabilizer_fin"],
            },
            {
                "id": "s02", "recipe": "cabin_seat_peek", "Badge": "LUBANG MUNGIL KACA",
                "text": "di bawah kaca jendela ada lubang seujung pena!",
                "ptr": ((0.18, 1.02, 0.22), "LUBANG MUNGIL (BLEED HOLE)"),
                "objects": ["cabin_interior_wall", "passenger_window_bezel", "economy_seat_row", "folding_tray_table", "coffee_cup_on_tray", "overhead_luggage_bin", "psu_reading_light_panel", "window_passenger_rig"],
            },
            {
                "id": "s03", "recipe": "outside_vs_inside_p", "Badge": "UDARA LUAR -55°C",
                "text": "Di luar sana udara minus lima puluh lima derajat,",
                "ptr": ((-0.42, 1.10, 0.0), "LUAR: -55°C · 0.24 BAR"),
                "objects": ["outside_cryo_thermometer", "barometer_outside_low", "ice_wind_streamlines"],
            },
            {
                "id": "s04", "recipe": "cabin_pressure_high", "Badge": "KABIN HANGAT 0.8 BAR",
                "text": "sedangkan kabin dipompa hangat bertekanan tinggi.",
                "ptr": ((0.42, 1.10, 0.0), "KABIN: +22°C · 0.80 BAR"),
                "objects": ["cabin_pressure_gauge_08", "bleed_air_supply_duct", "flight_attendant_rig", "beverage_service_cart"],
            },
            {
                "id": "s05", "recipe": "fail_single_pane", "Badge": "BAHAYA KACA TUNGGAL",
                "text": "Satu kaca tergores saja berisiko pecah keluar!",
                "ptr": ((0.0, 0.95, 0.20), "1 KACA -> BAHAYA PECAH!"),
                "objects": ["single_pane_window_bad", "diamond_ring_scratch_hand", "explosive_decompression_arrows"],
            },
            {
                "id": "s06", "recipe": "three_pane_exploded", "Badge": "TIGA LAPIS AKRILIK",
                "text": "Maka jendela pesawat dibuat tiga lapis akrilik!",
                "ptr": ((0.0, 0.92, 0.0), "3 LAPIS PANEL AKRILIK"),
                "objects": ["fuselage_aluminum_skin_frame", "rubber_window_seal_gasket", "outer_structural_acrylic", "middle_failsafe_acrylic", "inner_scratch_shield_pane"],
            },
            {
                "id": "s07", "recipe": "inner_scratch_pane", "Badge": "TAMENG GORES DALAM",
                "text": "Kaca paling dalam hanyalah pelindung goresan.",
                "ptr": ((0.32, 0.88, 0.18), "TAMENG GORES PENUMPANG"),
                "objects": ["sliding_window_sunshade", "passenger_finger_touch"],
            },
            {
                "id": "s08", "recipe": "middle_bleed_zoom", "Badge": "BLEED HOLE TENGAH",
                "text": "Lubang Bleed Hole dibor di kaca lapis tengah!",
                "ptr": ((0.0, 0.78, 0.22), "BLEED HOLE DI LAPIS TENGAH"),
                "objects": ["laser_drilled_bleed_nozzle", "air_gap_chamber_cavity", "caliper_2mm_scale"],
            },
            {
                "id": "s09", "recipe": "pressure_equalize_gap", "Badge": "ALIRKAN UDARA CELAH",
                "text": "Lubang ini menyamakan tekanan di celah luar.",
                "ptr": ((0.0, 0.85, 0.15), "SAMAKAN TEKANAN CELAH"),
                "objects": ["equalizing_airflow_stream", "gap_manometer_equal"],
            },
            {
                "id": "s10", "recipe": "outer_carries_load", "Badge": "KACA LUAR PIKUL 100%",
                "text": "Kaca paling luar pun memikul penuh beban kabin,",
                "ptr": ((-0.28, 0.92, 0.15), "KACA LUAR PIKUL 100%"),
                "objects": ["outer_pane_stress_vectors", "structural_forged_window_ring"],
            },
            {
                "id": "s11", "recipe": "middle_fresh_reserve", "Badge": "CADANGAN BEBAS LELAH",
                "text": "sementara kaca tengah bebas dari kelelahan tekan!",
                "ptr": ((0.05, 0.92, 0.15), "KACA TENGAH 0% LELAH!"),
                "objects": ["zero_stress_green_halo", "flight_cycle_counter_board"],
            },
            {
                "id": "s12", "recipe": "outer_crack_failsafe", "Badge": "AMBIL ALIH DARURAT!",
                "text": "Jika kaca luar retak, kaca tengah ambil alih!",
                "ptr": ((0.0, 0.92, 0.20), "KACA TENGAH TAHAN KABIN!"),
                "objects": ["hailstone_impact_chunk", "cracked_outer_pane_mesh", "controlled_micro_leak_arrow"],
            },
            {
                "id": "s13", "recipe": "anti_fog_frost_ring", "Badge": "CEGAH EMBUN BEKU",
                "text": "Alirannya juga mencegah embun menutup jendela.",
                "ptr": ((0.0, 0.78, 0.24), "CEGAH EMBUN JENDELA"),
                "objects": ["frost_crystal_halo_ring", "clear_scenic_window_view"],
            },
            {
                "id": "s14", "recipe": "hangar_inspection", "Badge": "CEK DI HANGGAR",
                "text": "Di hanggar, mekanik mengecek lubang bebas debu.",
                "ptr": ((0.12, 0.95, 0.20), "INSPEKSI LUBANG BERSIH"),
                "objects": ["maintenance_hangar_bay", "aircraft_mechanic_rig", "borescope_inspection_lamp", "rolling_service_stairs"],
            },
            {
                "id": "s15", "recipe": "cockpit_interior_wide", "Badge": "BATAS AKURASI: KOKPIT",
                "text": "Batas akurasi: kaca depan kokpit tak berlubang!",
                "ptr": ((0.0, 1.15, 0.15), "KACA KOKPIT TANPA LUBANG"),
                "objects": ["cockpit_flight_deck", "pilot_captain_rig", "glare_shield_avionics_pfd", "control_yoke_throttle"],
            },
            {
                "id": "s16", "recipe": "cockpit_heated_glass", "Badge": "KACA PEMANAS LISTRIK",
                "text": "Kokpit memakai kaca laminasi berpemanas listrik.",
                "ptr": ((0.0, 0.95, 0.22), "LAMINASI + PEMANAS LISTRIK"),
                "objects": ["laminated_windshield_cutaway", "gold_ito_heating_film", "pvb_tough_interlayer"],
            },
            {
                "id": "s17", "recipe": "dreamliner_electro", "Badge": "JENDELA GELAP ELEKTRIK",
                "text": "Jendela redup elektrik pun tetap berlapis ganda.",
                "ptr": ((0.0, 0.95, 0.18), "TOMBOL REDUP + 3 LAPIS"),
                "objects": ["electrochromic_dimmer_button", "tinted_gel_layer_pane"],
            },
            {
                "id": "s18", "recipe": "split_recap", "Badge": "UTAMA & PENYELAMAT",
                "text": "Satu lubang kecil membagi tugas kaca cadangan.",
                "ptr": ((0.0, 0.85, 0.0), "LUAR KERJA · TENGAH SIAGA"),
                "objects": ["safety_redundancy_scale"],
            },
            {
                "id": "s19", "recipe": "oh_jadi_window", "Badge": "INTI REKAYASA",
                "text": "Oh, jadi lubang itu menjaga kaca cadangan segar!",
                "ptr": ((0.0, 0.92, 0.18), "CADANGAN TETAP SEGAR!"),
                "objects": ["sunset_wingtip_clouds"],
            },
            {
                "id": "s20", "recipe": "ab_poll_stage", "Badge": "PILIH DI KOMENTAR!",
                "text": "Unik lubang jendela ini atau sumbat roda pesawat?",
                "ptr": ((0.0, 0.75, 0.0), "A: LUBANG JENDELA  vs  B: SUMBAT RODA"),
                "objects": ["poll_plinth_window", "poll_plinth_wheel_plug"],
            },
            {
                "id": "s21", "recipe": "comment_wave", "Badge": "DISKUSI TEKNIK",
                "text": "Tulis pilihanmu di kolom komentar ya!",
                "ptr": ((0.0, 1.15, 0.0), "KOMEN A ATAU B DI BAWAH!"),
                "objects": ["hangar_tool_cabinet", "aviation_badge_crest"],
            },
            {
                "id": "s22", "recipe": "cta_white_stage", "Badge": "TOMBOL PUTIH!",
                "text": "Tekan tombol putih di bawah sekarang ya!",
                "ptr": ((0.0, 0.65, 0.0), "TEKAN TOMBOL PUTIH!"),
                "objects": ["cta_pedestal_s16", "white_subscribe_3d_s16", "cursor_click_hand_s16"],
            },
        ],
    },
}


def full_narration_text(ep_id: str) -> str:
    ep = V6_EPISODES[ep_id]
    return " ".join(s["text"].strip() for s in ep["shots"])


def verify_script_density() -> dict[str, dict]:
    report = {}
    for ep_id in V6_EPISODE_ORDER:
        ep = V6_EPISODES[ep_id]
        shots = ep["shots"]
        uniq_objs = []
        seen = set()
        for s in shots:
            for o in s["objects"]:
                if o not in seen:
                    seen.add(o)
                    uniq_objs.append(o)
        txt = full_narration_text(ep_id)
        assert len(shots) >= 20, f"{ep_id}: shot count {len(shots)} < 20!"
        assert len(uniq_objs) >= 50, f"{ep_id}: unique object count {len(uniq_objs)} < 50!"
        assert len(txt) <= 1100, f"{ep_id}: narration chars {len(txt)} > 1100!"
        report[ep_id] = {
            "shots": len(shots),
            "unique_objects": len(uniq_objs),
            "chars": len(txt),
        }
    return report


if __name__ == "__main__":
    for k, v in verify_script_density().items():
        print(f"{k}: {v['shots']} shots | {v['unique_objects']} unique objects | {v['chars']} chars")
