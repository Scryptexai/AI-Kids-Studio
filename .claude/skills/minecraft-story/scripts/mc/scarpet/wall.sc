// wall.sc — bangun tembok lingkaran bertahap (Carpet scarpet, MC 1.20.1)
// Load : /script load wall
// Call : /script in wall run ring([0,65,0],24,6,'minecraft:stone_bricks',1)
//        /script in wall run stop()
// `lip` = 1 → tambah satu lapis bibir tembok yang menonjol ke luar di puncak.
// Progres: 8 blok per tick (20 tps) → tembok r=24, h=6 selesai ±4 detik. Ubah `bpt` kalau perlu.

__config() -> {'scope' -> 'global', 'stay_loaded' -> true};

global_active = false;
global_center = [0, 0, 0];
global_radius = 12;
global_height = 5;
global_lip = 0;
global_block = 'minecraft:stone_bricks';
global_layer = 0;
global_i = 0;
global_n = 16;
global_bpt = 8;

reset() -> (
    global_active = false;
    global_bpt = 8;
    global_layer = 0;
    global_i = 0;
    'reset'
);

clear() -> reset();

stop() -> (
    global_active = false;
    'stopped'
);

ring(center, radius, height, block, lip) -> (
    reset();
    global_center = center;
    global_radius = radius;
    global_height = height;
    global_block = block;
    global_lip = lip;
    global_n = max(16, round(2 * 3.14159265 * radius));
    global_active = true;
    'started'
);

// Tembok selesai langsung (untuk shot statis / cek framing)
ring_now(center, radius, height, block, lip) -> (
    ring(center, radius, height, block, lip);
    global_bpt = global_n * (height + 2);
    'building'
);

__on_tick() -> (
    if (!global_active, return());
    loop(global_bpt,
        if (!global_active, return());
        r = global_radius;
        if (global_layer >= global_height, r = global_radius + global_lip);
        a = 360 * global_i / global_n;   // derajat (trigonometri scarpet memakai derajat)
        p = [
            global_center:0 + round(r * cos(a)),
            global_center:1 + global_layer,
            global_center:2 + round(r * sin(a))
        ];
        set(p, global_block);
        global_i = global_i + 1;
        if (global_i >= global_n,
            global_i = 0;
            global_layer = global_layer + 1;
            if (global_layer > global_height, global_active = false)
        )
    );
);
