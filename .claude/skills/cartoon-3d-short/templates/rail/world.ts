// The whole short as one three.js scene: sky (day / golden / night), sun or moon, clouds, the sets (larkport.ts) and the
// cast. update(id, f, camera) poses everything for shot `id` at frame f (a pure function of id + f).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile, getInputProps } from "remotion";
import { V, Kit, Ray, kitClone, lam } from "./build";
import { ctex, cloudHD } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, ghostBegin, ghostEnd, GHOST_LAG } from "./cast";
import { buildRail, Parts } from "./rail";
import type { Consist } from "./rolling";
import { collide, groundAt, zfightReport, propReport } from "./solids";
import { FPS, SHOTS, SH, camAt, FOREGROUND, ShotDef, smooth, clamp01, freightX, testX, shopTrainX, brakeAt, CRANK, PULL, LEVER1, PUMP, CUT, FLIP, HOLDS, HALT, CLAMP, POOL } from "./story";
import { O } from "./layout";

// ---------------- assets ----------------
/** Kenney CC0 models copied into public/diedontime/kenney/<kit>/ (<ASSETS_DIR> tools/use_assets.py) */
const KENNEY = ["furniture-kit/chairDesk", "furniture-kit/bookcaseClosedWide", "furniture-kit/pottedPlant", "furniture-kit/lampRoundTable", "city-kit-industrial/chimney-large"];
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((k) => { const n = k.split("/")[1]; return loader.loadAsync(staticFile(`airbrake/kenney/${k}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const); }))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const starTex = () => ctex("stars", 1024, 512, (g, r) => {
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) { const a = 0.35 + r() * 0.65; g.fillStyle = `rgba(235,240,255,${a.toFixed(2)})`; g.beginPath(); g.arc(r() * 1024, r() * 512, 0.8 + r() * 1.6, 0, 7); g.fill(); }
});

/** every lens position of the film looking at its subject (buildings and trees there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 2) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = Math.min(fw.length(), 60);
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial; private stars: THREE.Mesh;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<LightName, THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private parts: Parts;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();


  constructor(kit: Kit) {
    const R = this.root;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    // night stars: a dome a little inside the sky, upper half only
    const st = starTex(); st.wrapS = THREE.RepeatWrapping; st.repeat.set(4, 1);
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }));
    this.stars.renderOrder = -0.8; this.stars.frustumCulled = false; this.stars.layers.set(NOINK);
    R.add(this.stars);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)),
      night: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.night.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    this.parts = buildRail(R, kit, sightLines());
    if ((getInputProps() as { frameCheck?: boolean }).frameCheck) for (const l of [...zfightReport(), ...propReport()]) console.warn(l);
    const pen = (w: number, h: number, draw: (p: Pen) => void) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(new Pen(cv.getContext("2d")!));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
    void pen;
    for (const fg of FOREGROUND) {
      const o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      o.position.set(...fg.pos); o.rotation.y = fg.yaw ?? 0; o.visible = false;
      this.fgs.push({ o, a: fg.a, b: fg.b }); R.add(o);
    }
  }

  /** camera-relative sun (moon at night), frozen per shot: the mean view direction turned by az, lifted by el */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light], night = s.light === "night";
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig: camera-relative sun frozen per shot, two-tone uniforms, shadow fit ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 10, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    const inside = s.set === "shop" || s.set === "office" || id === SH.bosses;
    if (inside) TONE.uShadeLift.value.set(0.06, 0.05, 0.045);
    if (inside) { const w = 0.45; TONE.uShadeCol.value.set(L.shade[0] + (0.5 - L.shade[0]) * w, L.shade[1] + (0.4 - L.shade[1]) * w, L.shade[2] + (0.58 - L.shade[2]) * w); }
    else if (s.light === "day") TONE.uShadeCol.value.set(L.shade[0] + 0.08, L.shade[1] + 0.07, L.shade[2] + 0.04);
    this.sun.shadow.radius = 4;
    // light pool on the subject for this shot (story.ts POOL: world centre + radius), in view space
    const pool = POOL[id];
    if (pool) { const pv = V(pool[0], pool[1], pool[2]).applyMatrix4(cam.matrixWorldInverse); TONE.uPool.value.set(pv.x, pv.y, pv.z, pool[3]); }
    else TONE.uPool.value.set(0, 0, 0, 0);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // the hook's diamond close-ups: the hall sinks into shadow so the stone under its spotlight is the brightest thing
    // at night a lamp or candle near what the lens looks at warms the cast (lantern-lit faces, not moonlit ones)
    // at night the brakemen's lanterns warm the cast a little (lantern-lit faces, not moonlit ones)
    if (night) CHAR.uCharTint.value.set(L.charTint[0] + (1.05 - L.charTint[0]) * 0.4, L.charTint[1] + (0.8 - L.charTint[1]) * 0.4, L.charTint[2] + (0.58 - L.charTint[2]) * 0.4);
    // ---- sky, fog, sun / moon, stars, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    this.stars.visible = night;
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light !== "day";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(night ? 1.3 : 1.7)));
      (this.sunDisc.material as THREE.SpriteMaterial).color.set(night ? new THREE.Color(2.4, 2.5, 2.8) : new THREE.Color(6.0, 4.4, 2.4));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(night ? 9 : 24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(night ? 0.35 : 1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
      mat.color.setScalar(night ? 0.7 : 1.1);
    }
    // ---- set parts: the trains (position, wheels, side rods, brake shoes, hoses, lever, pump), the workshop rig ----
    const P = this.parts;
    const pose = (c: Consist, x: number, br: number, vis: boolean) => {
      c.g.visible = vis;
      if (!vis) return;
      c.g.position.x = x;
      for (const car of c.cars) {
        for (const w of car.wheels) w.o.rotation.z = -x / w.r;
        for (const sh of car.shoes) sh.o.position.x = sh.x0 + sh.dir * 0.12 - sh.dir * 0.19 * br;
        if (car.rods) for (const r of car.rods) { const a = -x / 0.82; r.o.position.x = r.x0 + r.r * Math.cos(a); r.o.position.y = 0.82 + r.r * Math.sin(a); }
        if (car.lamp) car.lamp.color.setScalar(night ? 2.6 : 1.2);
      }
    };
    const set = s.set;
    // the freight: the hook (night) and 1872 (day); its brake wheels spin while cranked
    pose(P.freight, freightX(id === SH.hook ? SH.hook : SH.cut, id === SH.windout ? Math.max(f, HALT) : f), brakeAt(id, f), set === "line");
    P.freight.cars.forEach((car, i) => { if (car.brakeWheel) car.brakeWheel.rotation.y = id === SH.hook && f >= CRANK ? (f - CRANK) * 0.35 * (i % 2 ? 1 : -1) : 0; });
    const parted = (id === SH.cut && f >= CUT) || id === SH.windout, pk = id === SH.windout ? 1 : clamp01((f - CUT) / 5);
    P.freight.hoses.forEach((h, i) => { const on = parted && i === 3; h.a.rotation.z = on ? 1.0 * pk : 0; h.b.rotation.z = on ? -1.0 * pk : 0; h.a.position.y = h.b.position.y = 0.82; });
    // the test train at Pittsburgh: parked, or the run (hidden in the bore until it bursts out)
    pose(P.test, testX(id, f), brakeAt(id, f), set === "pitt" && id !== SH.pitt);
    const lv = P.test.cars[0].lever!;
    lv.rotation.z = id === SH.station ? 0.55 * smooth((f - LEVER1) / 5) : id === SH.run || id === SH.bosses ? 0.75 * smooth((f - PULL) / 3) : 0;
    const pr = P.test.cars[0].pumpRod!;
    pr.position.y = 2.8 + (id === SH.station && f >= PUMP ? 0.16 * Math.abs(Math.sin((f - PUMP) * 0.35)) : 0);
    // the yard train behind the workshop window
    pose(P.shopTrain, shopTrainX(f), 0, set === "shop" && id !== SH.flip);
    // 1872: the gauge needle swings up and the rig's shoe lets go of the wheel on "holds"; the valve flips (cast.ts)
    const hk = id === SH.flip ? smooth((f - HOLDS) / 8) : 0;
    P.needle.rotation.z = THREE.MathUtils.degToRad(125 - 190 * hk);
    P.rigShoe.position.x = P.rigX0 - 0.3 * hk;
    P.blind.visible = id === SH.pitt;
    // every brake shoe flashes pale as it bites (station clamp, the lever, the cut)
    const bite = (f0: number) => f >= f0 && f < f0 + 8 ? 1 - (f - f0) / 8 : 0;
    const fl = id === SH.station ? bite(CLAMP) : id === SH.run ? bite(PULL) : id === SH.cut ? bite(CUT + 3) : 0;
    lam("rsShoe", () => ({ color: "#3a6ab8" })).color.set("#3a6ab8").lerp(new THREE.Color("#e8f6ff"), fl);
    void FLIP; void O;
    for (const m of P.lampMats) m.color.set(new THREE.Color(3.0, 2.4, 1.3));
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.a < s.b && g.b > s.a;
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const ci = { pos: cam.position, right, sun: sunDir, fov: cam.fov };
    // ghost pass: the same stage GHOST_LAG frames earlier into a throwaway list, so each person knows how fast they move
    ghostBegin();
    try { stage(id, t - GHOST_LAG / FPS, ci); } catch { /* the real pass reports */ }
    ghostEnd();
    const st = stage(id, t, ci);
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2 * (p.sy ?? 1), sc2);
      a.mesh.castShadow = L.actorShadow;
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    // framing check (inputProps { frameCheck: true }): each character's card box projected to the screen, reported when
    // it is cut by a side or the top of the frame, or stands near a side (scripts/frame_check.mjs collects these lines)
    if ((getInputProps() as { frameCheck?: boolean }).frameCheck) {
      // camera speed: a 3x3 grid on the plane at the look distance, projected by the previous and this frame's camera,
      // mean displacement in 720p pixels (motion-camera.md: glide peaks <= 25 px/f; cuts are skipped by the checker)
      if (f > SHOTS[id - 1].a) {
        const mk = (c: ReturnType<typeof camAt>) => {
          const k = new THREE.PerspectiveCamera(c.fov, 9 / 16, 0.05, 1500);
          k.position.set(...c.pos); k.up.set(0, 1, 0); k.lookAt(...c.look); k.rotateZ(c.roll); k.updateMatrixWorld(); k.updateProjectionMatrix();
          return k;
        };
        const c0 = camAt(id, f - 1), k0 = mk(c0), k1 = mk(camAt(id, f));
        const d = Math.hypot(c0.look[0] - c0.pos[0], c0.look[1] - c0.pos[1], c0.look[2] - c0.pos[2]);
        const fwd = new THREE.Vector3(), rt = new THREE.Vector3(), upv = new THREE.Vector3(), pt = new THREE.Vector3(), a0 = new THREE.Vector3();
        k0.getWorldDirection(fwd); rt.setFromMatrixColumn(k0.matrixWorld, 0); upv.setFromMatrixColumn(k0.matrixWorld, 1);
        const hy = Math.tan((c0.fov * Math.PI) / 360) * d, hx = hy * (9 / 16);
        // the subject plane and the background behind it (x2 distance), so arcs round the subject register as motion
        let sum = 0;
        for (const dk of [1, 2]) for (const gx of [-0.6, 0, 0.6]) for (const gy of [-0.6, 0, 0.6]) {
          pt.copy(k0.position).addScaledVector(fwd, d * dk).addScaledVector(rt, gx * hx * dk).addScaledVector(upv, gy * hy * dk);
          a0.copy(pt).project(k0); const b = pt.clone().project(k1);
          sum += Math.hypot((b.x - a0.x) * 360, (b.y - a0.y) * 640);
        }
        console.warn(`CAMSPD|${f}|${id}|${(sum / 18).toFixed(1)}`);
      }
      // clipping: each character's column against every solid (seated: the upper body only, and its own seat only if
      // the mark sits deeper than 0.15 m behind the seat's front edge); feet: never below the surface under them
      for (const p of st.places) {
        const who = p.key.split("|")[1] ?? "?", sit = p.key.includes('"mode":"sit"'), sc = p.scale ?? 1; // a grown body has a bigger column
        const hits = collide(p.x, p.y + (sit ? 0.15 : 0.06) * sc, p.y + (sit ? 0.95 : 1.5) * sc, p.z, (sit ? 0.12 : 0.15) * sc)
          .filter((s) => !(sit && /chair|bench|deskWood/i.test(s.n) && (p.z <= s.a[2] + 0.15 || /wagon/.test(s.n))));
        for (const s of hits) console.warn(`COLLIDE|${f}|${id}|${who}|${s.n}@${s.a.map((v) => v.toFixed(2))}`);
        const g = groundAt(p.x, p.z, p.y);
        if (!sit && p.y < g - 0.002) console.warn(`FLOOR|${f}|${id}|${who}|sinks ${(g - p.y).toFixed(3)}`);
      }
      for (const p of st.places) {
        const sc2 = p.scale ?? 1, who = p.key.split("|")[1] ?? "?";
        let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
        for (const sx of [-0.3, 0.3]) for (const hy of [0.05, 1.85]) {
          this.v.set(p.x, p.y + hy * sc2, p.z).addScaledVector(right, sx * sc2).project(cam);
          if (this.v.z > 1) behind = true;
          x0 = Math.min(x0, this.v.x); x1 = Math.max(x1, this.v.x); y1 = Math.max(y1, this.v.y);
        }
        if (behind || x1 < -1 || x0 > 1) continue;
        const cx = (x0 + x1) / 2, cut = x0 < -1 || x1 > 1 || y1 > 1;
        if (cut || Math.abs(cx) > 0.62) console.warn(`FRAMECHK|${f}|${id}|${who}|${x0.toFixed(2)}|${x1.toFixed(2)}|${y1.toFixed(2)}|${cut ? "CUT" : "EDGE"}`);
      }
    }
    let fi = 0;
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const fxm = this.fx(fi++);
      fxm.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      fxm.use(p.mode ?? "cut", p.tint ?? 1);
      fxm.mesh.visible = true;
      fxm.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) fxm.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else if (p.wallYaw !== undefined) fxm.mesh.rotation.set(0, p.wallYaw, p.rot ?? 0);
      else { fxm.mesh.quaternion.copy(cam.quaternion); fxm.mesh.rotateZ(p.rot ?? 0); }
      fxm.mesh.scale.set(p.w, p.h, 1);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (let i = 0; i < ai; i++) this.actors[i].bind();
    for (let i = 0; i < fi; i++) this.fxs[i].bind();
    return focus;
  }
}
