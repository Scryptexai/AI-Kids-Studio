// actor.sc — gerakkan entity sepanjang waypoint (Carpet scarpet, MC 1.20.1)
// Load : /script load actor
// Call : /script in actor run follow('ruby',[[0,65,0],[4,65,0],[4,65,4]],0.06)
//        /script in actor run follow('kid1',[[2,65,0],[6,65,0]],0.05)     ← beberapa aktor sekaligus boleh
//        /script in actor run stop()
// `name` = id aktor (CustomName dari shot.mjs) atau nama fake player.
// Untuk aktor BBS pakai camera/actor milik BBS — app ini untuk entity biasa / fake player.
// Trigonometri scarpet memakai DERAJAT.

__config() -> {'scope' -> 'global', 'stay_loaded' -> true};

// name -> [entity, points, idx, speed]
global_tracks = {};

reset() -> (
    global_tracks = {};
    'reset'
);

stop() -> (
    global_tracks = {};
    'stopped'
);

clear() -> reset();

follow(name, points, speed) -> (
    found = entity_selector('@e[name=' + name + ',limit=1]');
    if (length(found) == 0, return('actor not found: ' + name));
    if (length(points) < 2, return('butuh minimal 2 waypoint'));
    global_tracks:name = [found:0, points, 0, speed];
    'following'
);

__on_tick() -> (
    for (keys(global_tracks),
        name = _;
        tr = global_tracks:name;
        e = tr:0;
        pts = tr:1;
        idx = tr:2;
        spd = tr:3;
        if (e ~ 'removed' || idx >= length(pts),
            delete(global_tracks:name);
            continue()
        );
        target = pts:idx;
        p = e ~ 'pos';
        dx = target:0 - p:0;
        dz = target:2 - p:2;
        dist = sqrt(dx * dx + dz * dz);
        if (dist < spd,
            modify(e, 'pos', [target:0, p:1, target:2]);
            modify(e, 'motion', [0, 0, 0]);
            global_tracks:name = [e, pts, idx + 1, spd];
            continue()
        );
        ux = dx / dist;
        uz = dz / dist;
        modify(e, 'motion', [ux * spd, 0, uz * spd]);
        modify(e, 'pos', [p:0 + ux * spd, p:1, p:2 + uz * spd]);
        // yaw Minecraft: 0 = +z, 90 = -x
        modify(e, 'yaw', atan2(-ux, uz))
    );
);
