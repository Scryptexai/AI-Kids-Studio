// env.sc — api, air, obor (Carpet scarpet, MC 1.20.1)
// Load : /script load env
// Call : /script in env run ignite([0,65,0],12,80)
//        /script in env run torches([-10,65,-10],[10,65,10],4)
//        /script in env run water([0,65,0],12,2)
//        /script in env run drain([0,65,0],12,3)
// Semua penempatan deterministik (spiral sudut emas 137.5°), bukan rand() — take bisa diulang sama persis.
// Trigonometri scarpet memakai DERAJAT.

__config() -> {'scope' -> 'global', 'stay_loaded' -> true};

ignite(center, radius, count) -> (
    loop(count,
        a = _ * 137.50776405;
        r = radius * sqrt((_ + 0.5) / count);
        p = [center:0 + round(r * cos(a)), center:1, center:2 + round(r * sin(a))];
        set(p, 'minecraft:fire')
    );
    count
);

torches(from, to, spacing) -> (
    xs = range(from:0, to:0, spacing);
    zs = range(from:2, to:2, spacing);
    n = 0;
    for (xs,
        x = _;
        for (zs,
            set([x, from:1, _], 'minecraft:torch');
            n = n + 1
        )
    );
    n
);

water(center, radius, level) -> (
    n = 0;
    for (range(center:0 - radius, center:0 + radius),
        x = _;
        for (range(center:2 - radius, center:2 + radius),
            z = _;
            loop(level,
                set([x, center:1 + _, z], 'minecraft:water');
                n = n + 1
            )
        )
    );
    n
);

drain(center, radius, depth) -> (
    n = 0;
    for (range(center:0 - radius, center:0 + radius),
        x = _;
        for (range(center:2 - radius, center:2 + radius),
            z = _;
            loop(depth,
                set([x, center:1 + _, z], 'minecraft:air');
                n = n + 1
            )
        )
    );
    n
);
