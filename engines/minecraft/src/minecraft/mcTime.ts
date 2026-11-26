// Minecraft-mode time base. Plans and directions are keyed in KEY_FPS (30) frames; the video can render at any fps
// (60 for delivery). useMcFrame() is the current frame in KEY frames (fractional at 60 fps: 0, 0.5, 1, 1.5 ...), so
// every component keeps its 30 fps timing and simply gets the in-between frames for free. Time math uses KEY_FPS,
// never useVideoConfig().fps. Anything random per frame or stepped (flicker tables, spawn loops) must work on whole
// key frames (Math.floor, integer loops, keyNoise) so it steps at the same moments at any output fps.
import { useCurrentFrame, useVideoConfig } from "remotion";

/** the frame rate plan.json / direction.json are keyed in */
export const KEY_FPS = 30;

/** output frames per key frame (2 at 60 fps) */
export const useMcScale = () => useVideoConfig().fps / KEY_FPS;

/** the current frame in key frames (fractional when the video runs faster than KEY_FPS) */
export const useMcFrame = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return fps === KEY_FPS ? f : (f * KEY_FPS) / fps;
};

/** a per-key-frame random value, blended smoothly between whole key frames (identical to r(frame) on whole frames) */
export const keyNoise = (r: (k: number) => number, frame: number) => {
  const a = Math.floor(frame), u = frame - a;
  return u < 1e-6 ? r(a) : r(a) + (r(a + 1) - r(a)) * u;
};
