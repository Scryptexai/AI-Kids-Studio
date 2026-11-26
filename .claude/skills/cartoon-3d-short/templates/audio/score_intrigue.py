# Sound for "Tiga Jenderal yang Menyadap Rajanya": an original court-intrigue score (a pelog-flavoured E mode:
# E F G B C), procedural SFX on the picture's frames, and the final mix with the narration.
# Picture times mirror src/videos/tigajenderal/story.ts + cast.ts (frame / 30). Lock the picture before re-running.
#   python -I score.py <voice.wav> <words.json> <out_dir>
# Writes music.wav, sfx.wav, mix.wav (48 kHz, 24-bit, exactly TOTAL / 30 s) and cues.md.
import json, os, sys
import numpy as np
from dsp import SR, TAU, ns, tt, rng, lp, hp, bp, colored, smooth_noise, fades, phase, modal, pan, st, place, widen, make_ir, \
    convolve_st, integrated, true_peak, read_wav, write_wav, dbg
from instruments import m2f, pluck, pad, vibes, glock, timpani, cymbal, snare, snare_roll, brass, brush
from sfx_gen import whoosh, applause, hurrah, babble, bird_chirps, crickets, breeze, stroll_step, clink

FPS, TOTAL = 30, 2430
DUR = TOTAL / FPS
fr = lambda f: f / FPS
# shots (first frame, light) from story.ts
SHOTS = [(0, "night"), (139, "golden"), (190, "day"), (279, "day"), (408, "day"), (472, "day"), (686, "day"), (772, "night"),
         (841, "day"), (877, "golden"), (966, "day"), (1027, "day"), (1073, "night"), (1222, "day"), (1295, "night"), (1339, "night"),
         (1392, "night"), (1521, "day"), (1622, "night"), (1789, "night"), (1820, "night"), (1845, "day"), (1867, "night"),
         (1939, "night"), (1996, "night"), (2068, "night"), (2104, "golden"), (2197, "golden"), (2249, "golden"), (2306, "golden"), (2414, "golden")]
KICKS = [863, 1606, 1979, 2094, 2229]          # flip-shake impacts in story.ts
SWAPS = [596, 623, 651]                         # courtiers swapped (cast.ts, 2 f lead)
LEAD = 2 / FPS


def light_spans():
    out = []
    for i, (a, l) in enumerate(SHOTS):
        b = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else TOTAL
        if out and out[-1][2] == l and abs(out[-1][1] - fr(a)) < 1e-6:
            out[-1] = (out[-1][0], fr(b), l)
        else:
            out.append((fr(a), fr(b), l))
    return out


def env_span(n, t0, t1, fade=0.35):
    t = np.arange(n) / SR
    return np.clip((t - t0) / fade, 0, 1) * np.clip((t1 - t) / fade, 0, 1)


# ---------------------------------------------------------------- instruments of our own
def gong(f, vel=0.8, r=None, dur=5.0):
    """bronze gong: inharmonic modes with slow beating, a soft mallet thump"""
    r = r or rng(1)
    modes = [(f, 1.0, 3.2), (f * 1.006, 0.8, 3.0), (f * 2.02, 0.45, 1.8), (f * 2.98, 0.3, 1.2), (f * 4.1, 0.18, 0.7), (f * 5.3, 0.1, 0.4)]
    y = modal(dur, modes, r)
    t = tt(dur)
    y += lp(r.standard_normal(len(t)), 300, 2) * np.exp(-t / 0.03) * 0.6
    return fades(y * vel * (1 - np.exp(-t / 0.01)), 0.0, 0.4)


def bonang(f, vel=0.6, r=None, dur=1.2):
    """small kettle gong (bonang-like): bright, quick decay"""
    r = r or rng(2)
    y = modal(dur, [(f, 1.0, 0.6), (f * 2.76, 0.35, 0.25), (f * 5.4, 0.12, 0.08)], r)
    t = tt(dur)
    return fades(y * vel * (1 - np.exp(-t / 0.002)), 0.0, 0.1)


def hoof(r, hard=1.0):
    d = 0.18
    t = tt(d)
    th = np.exp(-t / 0.02) * np.sin(phase(r.uniform(150, 210) * (1 + 0.3 * np.exp(-t / 0.006))))
    nz = r.standard_normal(len(t))
    clop = bp(nz, 900, 4200, 1) * np.exp(-t / 0.006) * 0.8 * hard
    return th + clop + lp(nz, 600) * np.exp(-t / 0.03) * 0.3


def boom(r, big=1.0):
    d = 1.6
    t = tt(d)
    y = np.sin(phase(52 * (1 + 0.6 * np.exp(-t / 0.05)))) * np.exp(-t / 0.35)
    y += lp(r.standard_normal(len(t)), 220, 2) * np.exp(-t / 0.06) * 0.8
    return fades(y * big, 0.0, 0.2)


def crackle(dur, r, density=14.0):
    n = ns(dur)
    y = np.zeros(n)
    tm = 0.0
    while tm < dur:
        L = ns(0.006)
        k = ns(tm)
        if k + L < n:
            y[k:k + L] += hp(r.standard_normal(L), 1500) * np.exp(-np.arange(L) / (L / 3)) * r.uniform(0.2, 1.0)
        tm += r.exponential(1 / density)
    return y + 0.15 * lp(colored(n, r, 1.0), 400)


def scratch(dur, r, rate=7.0):
    """quill on paper / brick on mortar: rhythmic filtered friction bursts"""
    n = ns(dur)
    t = np.arange(n) / SR
    g = np.clip(np.sin(TAU * rate * t + r.uniform(0, TAU)), 0, 1) ** 2 * (0.6 + 0.4 * smooth_noise(n, r, 3))
    return bp(colored(n, r, 0.3), 1800, 7000, 1) * g


# ---------------------------------------------------------------- the score
E = {"E2": 40, "B2": 47, "E3": 52, "F3": 53, "G3": 55, "B3": 59, "C4": 60, "E4": 64, "F4": 65, "G4": 67, "B4": 71, "C5": 72,
     "E5": 76, "F5": 77, "G5": 79, "B5": 83, "C6": 84}
BEAT = 60 / 84


def music():
    r = rng(7)
    buf = np.zeros((2, ns(DUR) + ns(6)))
    P = lambda x, t, g=1.0, p=0.0: place(buf, pan(x, p) if np.ndim(x) == 1 else x, t, g)

    def ostinato(t0, t1, notes, vel, step=BEAT / 2, bright=0.45, p=0.15):
        k, t = 0, t0
        while t < t1 - 0.05:
            n = notes[k % len(notes)]
            P(pluck(m2f(E[n]), vel * (0.85 + 0.15 * r.uniform()), r, 0.8, bright), t, 1.0, p * (1 if k % 2 else -1))
            k += 1
            t += step

    # A hook (0 - 4.63): drone + creeping ostinato, gong under the flash
    P(pad([m2f(E["E2"]), m2f(E["B2"])], 4.6, 0.5, r, att=1.5, rel=1.2, warm=500), 0.0)
    ostinato(0.4, 4.5, ["E4", "B3", "F4", "B3"], 0.28)
    P(gong(m2f(E["E2"]), 0.9, r), fr(139) - 0.02, 1.0)
    # B the new king (4.63 - 15.7): stately vibes over C - E minor pads, glock on the downbeats, cheer brighter
    for i, (t0, ch) in enumerate([(4.7, ["C3", "G3", "E4"]), (7.6, ["E3", "B3", "G4"]), (10.4, ["C3", "G3", "E4"]), (13.2, ["E3", "B3", "G4"])]):
        fs = [m2f({"C3": 48, "G3": 55, "E4": 64, "E3": 52, "B3": 59, "G4": 67}[c]) for c in ch]
        P(pad(fs, 2.8, 0.42, r, att=0.4, rel=0.8, warm=1400), t0)
    line = [("E5", 1), ("G5", 1), ("B5", 2), ("C6", 1), ("B5", 1), ("G5", 2), ("F5", 1), ("G5", 1), ("E5", 2), ("G5", 1), ("B5", 1), ("C6", 2), ("E5", 2)]
    t = 4.9
    for n, b in line:
        P(vibes(m2f(E[n]), 0.42, r, dur=1.4 * b), t, 1.0, 0.2)
        t += b * BEAT
    for k in range(8):
        P(glock(m2f(E["E5"] if k % 2 else E["B4"]), 0.25, r), 4.8 + k * 2 * BEAT, 1.0, -0.3)
        P(timpani(m2f(E["E2"]), 0.3, r), 4.8 + k * 2 * BEAT, 1.0)
    P(cymbal(0.25, r, 2.4, 0.8), 13.6)
    # C the purge (15.7 - 25.8): drone with a rubbing F over E, low ostinato, a bonang stroke on every swap
    P(pad([m2f(E["E2"]), m2f(E["F3"]), m2f(E["B2"])], 9.9, 0.45, r, att=1.0, rel=1.0, warm=600), 15.75)
    ostinato(15.8, 25.6, ["E3", "B3", "C4", "B3"], 0.24)
    for f in SWAPS:
        P(bonang(m2f(E["F4"]), 0.5, r), fr(f), 1.0, 0.3)
    # D doubts and motives (25.8 - 40.7): thin drone; the oath tender (golden), the plot building
    P(pad([m2f(E["E2"]), m2f(E["B2"])], 3.0, 0.4, r, att=0.8, rel=0.6, warm=500), 25.75)
    P(pad([m2f(48), m2f(55), m2f(64)], 3.2, 0.42, r, att=0.6, rel=1.0, warm=1200), 29.2)   # oath: C major, warm
    for i, n in enumerate(["G4", "E4", "C5", "B4"]):
        P(vibes(m2f(E[n]), 0.35, r, dur=1.8), 29.35 + i * 0.75, 1.0, -0.2)
    P(pad([m2f(E["E2"]), m2f(E["G3"]), m2f(E["B3"])], 6.6, 0.4, r, att=0.5, rel=0.8, warm=700), 32.2)
    ostinato(35.8, 40.6, ["E3", "G3", "B3", "C4", "B3", "G3"], 0.3, BEAT / 2)
    for k in range(7):
        P(timpani(m2f(E["E2"]), 0.22 + 0.04 * k, r), 35.8 + k * BEAT, 1.0)
    # E the methods (40.7 - 50.7): sneaky pizzicato, brushes, a low bonang every bar
    ostinato(40.75, 50.6, ["E3", "G3", "B3", "C4", "B3", "G3", "F3", "G3"], 0.3, BEAT / 2, 0.6, 0.35)
    for k in range(int(10 / BEAT)):
        P(brush(0.25, r), 40.75 + k * BEAT + BEAT / 2, 1.0, 0.4)
        if k % 4 == 0:
            P(bonang(m2f(E["B3"]), 0.35, r), 40.75 + k * BEAT, 1.0, -0.3)
    # F the trap (50.7 - 62.2): the patih's low brass, the three-versions ticks, a soft roll up to Bayu
    for t0, n, d in [(51.0, "E3", 1.2), (52.3, "F3", 1.0), (53.5, "E3", 1.6)]:
        P(brass(m2f(E[n] - 12), d, 0.5, r, kind="tuba"), t0, 0.8)
    P(pad([m2f(E["E2"]), m2f(E["B2"]), m2f(E["F3"])], 11.5, 0.42, r, att=1.0, rel=0.8, warm=600), 50.7)
    ostinato(54.0, 62.1, ["E4", "B3", "F4", "B3"], 0.27)
    for f in [1722, 1744, 1771]:
        P(glock(m2f(E["F5"]), 0.4, r), fr(f), 1.0, 0.2)
    for t, v in snare_roll(59.6, 62.2, 0.05, 0.3, r):
        P(snare(v, r, 0.3, buzz=True), t, 0.6, 0.1)
    # G caught (62.2 - 70.1): driving low pulse, hits on "utara" and "kurir"
    for k in range(int(7.9 / (BEAT / 2))):
        t = 62.25 + k * BEAT / 2
        P(timpani(m2f(E["E2"]), 0.18 + 0.25 * (k % 2 == 0), r, 0.8), t, 1.0)
    ostinato(62.25, 69.9, ["E4", "F4", "B3", "F4"], 0.32, BEAT / 4, 0.6)
    P(pad([m2f(E["E2"]), m2f(E["B2"]), m2f(E["F3"])], 7.8, 0.5, r, att=0.4, rel=0.4, warm=900), 62.2)
    P(gong(m2f(E["E2"]), 0.7, r, 3.0), fr(1979), 1.0)
    P(gong(m2f(E["E2"]), 1.0, r, 5.0), fr(2094), 1.0)
    P(cymbal(0.35, r, 2.6, 0.7), fr(2094), 0.8)
    # H the ending (70.1 - 81): dawn pad left open, single vibes notes, a gong on "berlubang", unresolved F at the end
    P(pad([m2f(E["E3"]), m2f(E["B3"]), m2f(E["F4"])], 8.0, 0.36, r, att=1.6, rel=2.5, warm=900), 70.3)
    for t0, n in [(70.8, "B4"), (72.6, "E5"), (75.0, "C5")]:
        P(vibes(m2f(E[n]), 0.32, r, dur=2.2), t0, 1.0, 0.25)
    P(gong(m2f(E["E2"]) * 0.75, 0.8, r, 5.0), fr(2229), 1.0)
    P(vibes(m2f(E["F5"]), 0.45, r, dur=4.0, trem=4.0), fr(2351), 1.0)
    P(gong(m2f(E["E2"]), 0.6, r, 6.0), fr(2366), 1.0)
    y = buf[:, : ns(DUR)]
    rev = convolve_st(y, make_ir(1.8, 11, pre=0.02, hf=0.7))
    return y * 0.8 + rev * 0.35


# ---------------------------------------------------------------- effects
def sfx():
    r = rng(21)
    n = ns(DUR)
    buf = np.zeros((2, n))
    P = lambda x, t, g=1.0, p=0.0: place(buf, pan(x, p) if np.ndim(x) == 1 else x, t, g)
    # ambience per light: crickets at night, sparse birds by day, a breeze everywhere
    for t0, t1, l in light_spans():
        d = t1 - t0 + 0.7
        e = env_span(ns(d), 0.0, d, 0.3)
        if l == "night":
            place(buf, widen(crickets(d, r, 4) * e * 0.12, r, 13, 0.8), t0 - 0.35)
        else:
            place(buf, widen(bird_chirps(d, r, 0.6, "sparrow" if l == "day" else "black") * e * 0.08, r, 9, 0.7), t0 - 0.35)
        place(buf, breeze(d, r, 0.05 if l != "night" else 0.035) * e[None, :], t0 - 0.35)
    # flash whoosh, kicks
    P(whoosh(0.6, r, 0.42, 300, 2600), fr(139) - 0.42, 0.5)
    for f in KICKS:
        P(boom(r, 0.9), fr(f) - LEAD, 0.7)
    # coronation murmur, cheer
    P(babble(3.0, r, 150, 1.0) * 0.35, 6.4, 0.6, -0.2)
    place(buf, applause(2.2, r, 30) * 0.18, 13.6)
    for k in range(8):
        P(hurrah(r, r.uniform(120, 200), r.uniform(0.9, 1.15)), 13.65 + r.uniform(0, 1.6), 0.25, r.uniform(-0.7, 0.7))
    # courtiers swapped: a puff of air and a soft pop
    for f in SWAPS:
        P(whoosh(0.35, r, 0.08, 600, 3200, tail=0.12), fr(f), 0.35, 0.2)
    # the old court walked out, the troops marched off, the generals cross the plaza at dawn, Bayu pacing
    for t0, t1, rate, g in [(22.9, 25.7, 2.6, 0.18), (34.25, 35.75, 3.4, 0.22), (70.1, 73.2, 3.2, 0.32), (62.3, 64.6, 1.9, 0.35)]:
        t = t0
        while t < t1:
            P(stroll_step(r, 0.6), t, g, r.uniform(-0.3, 0.3))
            t += 1 / rate * r.uniform(0.92, 1.08)
    # Sekar's letter, the kitchen fire, coins, the quill, the candles at the desks
    P(bp(colored(ns(0.5), r, 0.2), 1500, 8000, 1) * np.exp(-np.arange(ns(0.5)) / ns(0.15)) * 0.4, 32.25, 0.6)
    for t0, t1 in [(40.73, 43.17), (59.63, 60.67)]:
        P(crackle(t1 - t0, r, 10) * env_span(ns(t1 - t0), 0, t1 - t0, 0.2), t0, 0.22, -0.3)
    for k in range(6):
        P(clink(r, r.uniform(2600, 4200), 0.2), 43.58 + k * r.uniform(0.04, 0.09), 0.35, 0.2)
    P(scratch(1.7, r, 6.5), 44.75, 0.3, 0.1)
    for t0, t1 in [(43.17, 46.4), (54.07, 59.63), (60.67, 61.5), (66.53, 70.13)]:
        P(crackle(t1 - t0, r, 4) * 0.5, t0, 0.12, 0.25)
    # the loose brick: scraped out, falls on the cobbles
    P(scratch(0.9, r, 11) * 1.4, fr(1452), 0.5, 0.15)
    P(stroll_step(r, 1.0) * 1.6, fr(1478), 0.6, 0.15)
    # the patih's quill and the three versions (paper slides), the scroll handed to the courier
    P(scratch(2.2, r, 6.0), 54.4, 0.28, -0.1)
    for f in [1722, 1744, 1771]:
        P(bp(colored(ns(0.25), r, 0.2), 1200, 7000, 1) * np.exp(-np.arange(ns(0.25)) / ns(0.06)), fr(f), 0.35, 0.2)
    P(bp(colored(ns(0.4), r, 0.2), 1000, 6000, 1) * np.exp(-np.arange(ns(0.4)) / ns(0.1)), 60.9, 0.35, -0.2)
    # horses: four riders out of the gate, a three-beat gallop each, fading up the road
    for k in range(4):
        t0 = fr(1940) + k * 0.22
        stride = 0.42
        for s in range(int(3.0 / stride)):
            far = np.clip(1 - s * stride / 3.2, 0.15, 1)
            for j, dt in enumerate([0.0, 0.09, 0.2]):
                P(hoof(r, 1.0 if j == 2 else 0.7), t0 + s * stride + dt + r.uniform(-0.008, 0.008), 0.5 * far, (k % 2 - 0.5) * 0.6)
    # the summoning at dawn: a gate creak-free whoosh of morning air, nothing else; the end is silence
    P(whoosh(1.4, r, 0.7, 200, 1200, tail=0.6), fr(2098), 0.15)
    return buf


# ---------------------------------------------------------------- mix
def speech_spans(words, merge=0.3):
    sp = []
    for w in words:
        if sp and w["s"] - sp[-1][1] < merge:
            sp[-1][1] = w["e"]
        else:
            sp.append([w["s"], w["e"]])
    return sp


def duck(n, spans, depth_db=-6.0, pre=0.08, post=0.15, att=0.07, rel=0.45):
    g = np.zeros(n)
    for a, b in spans:
        g[max(0, ns(a - pre)):min(n, ns(b + post))] = 1
    k = 1 - np.exp(-1 / (SR * att))
    q = 1 - np.exp(-1 / (SR * rel))
    out = np.zeros(n)
    v = 0.0
    for i in range(0, n, 64):  # control rate 750 Hz
        tgt = g[i]
        c = 1 - (1 - (k if tgt > v else q)) ** 64
        v += (tgt - v) * c
        out[i:i + 64] = v
    return dbg(depth_db * out)


def limiter(x, ceil_db=-1.0, look=0.003, rel=0.08):
    c = dbg(ceil_db)
    peak = np.max(np.abs(x), axis=0)
    L = ns(look)
    need = np.maximum(1.0, peak / c)
    from scipy.ndimage import maximum_filter1d
    need = maximum_filter1d(need, size=2 * L + 1)
    g = 1 / need
    a = np.exp(-1 / (SR * rel))
    sm = np.empty_like(g)
    v = 1.0
    for i in range(len(g)):
        v = g[i] if g[i] < v else a * v + (1 - a) * g[i]
        sm[i] = v
    y = np.roll(x, L, axis=1) * sm[None, :]
    return np.roll(y, -L, axis=1)


def main():
    voice_p, words_p, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    n = ns(DUR)
    v, vsr = read_wav(voice_p)
    assert vsr == SR, vsr
    v = st(v.mean(axis=0) if v.ndim == 2 else v)[:, :n]
    v = np.pad(v, ((0, 0), (0, n - v.shape[1])))
    words = json.load(open(words_p, encoding="utf-8"))
    m = music()[:, :n]
    s = sfx()[:, :n]
    # levels: voice at -16 LUFS (unchanged shape), music bed ~ -25 LUFS before ducking ("+3 dB"), SFX ~ -29 LUFS ("-6 dB")
    v *= dbg(-16 - integrated(v))
    m *= dbg(-25 - integrated(m))
    s *= dbg(-29 - integrated(s))
    m *= duck(n, speech_spans(words))[None, :]
    mix = v + m + s
    mix *= dbg(-15 - integrated(mix))
    mix = limiter(mix, -1.0)
    fade = np.ones(n)
    fade[-ns(0.6):] = np.linspace(1, 0, ns(0.6))
    mix *= fade[None, :]
    write_wav(os.path.join(out, "music.wav"), m)
    write_wav(os.path.join(out, "sfx.wav"), s)
    write_wav(os.path.join(out, "mix.wav"), mix)
    with open(os.path.join(out, "cues.md"), "w", encoding="utf-8") as fh:
        fh.write("# Tiga Jenderal: sound cues\n\n")
        fh.write(f"- length {DUR:.2f} s, 48 kHz; mix integrated {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP\n")
        fh.write("- music: A hook drone + gong on the flash; B stately vibes for the new king; C rubbing drone + bonang per swap;\n"
                 "  D motives (oath in C major); E pizzicato methods; F patih's tuba, glock ticks on utara/selatan/timur, roll;\n"
                 "  G driving timpani, gongs on 'utara' and 'kurir'; H open dawn pad, gong on 'berlubang', unresolved F on 'Arya'\n")
        fh.write(f"- kicks (boom): frames {KICKS}; swaps (puff): {SWAPS}; brick scrape 1452, drop 1478; hooves from 1940\n")
    print(f"mix {integrated(mix):.1f} LUFS, peak {true_peak(mix):.1f} dBTP, {mix.shape[1] / SR:.2f} s")


if __name__ == "__main__":
    main()
