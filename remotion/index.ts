// Remotion entry point. Registers the Lospia demo composition.
//
// This directory is intentionally ISOLATED from the Next.js app:
//   * It is excluded from tsconfig.json, so the app's `npm run typecheck`
//     never depends on Remotion being installed.
//   * Nothing under app/, components/ or lib/ imports from here.
//   * Remotion is NOT listed in package.json — see remotion/assets/README.md
//     for the one-time install + render steps.
//
// Rendering this video produces public/demo/lospia-demo.mp4, at which point the
// public landing page's <DemoVideo /> slot swaps its placeholder for the real
// player automatically (no code change needed).
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
