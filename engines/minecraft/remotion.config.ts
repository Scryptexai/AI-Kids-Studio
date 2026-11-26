// CLI defaults for every render / still in this project.
import { Config } from "@remotion/cli/config";

// Draw WebGL (three.js) on the GPU. The default is a software renderer on the CPU: about 20x slower for these
// scenes, with identical pictures. If your machine has no usable GPU, remove this line (or pass --gl=swangle).
Config.setChromiumOpenGlRenderer("angle");
