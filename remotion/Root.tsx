import { Composition } from "remotion";
import { LospiaDemo } from "./LospiaDemo";

// 1920x1080 · 75s · 30fps → 2250 frames.
export const DEMO_FPS = 30;
export const DEMO_DURATION_SECONDS = 75;
export const DEMO_WIDTH = 1920;
export const DEMO_HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LospiaDemo"
      component={LospiaDemo}
      durationInFrames={DEMO_DURATION_SECONDS * DEMO_FPS}
      fps={DEMO_FPS}
      width={DEMO_WIDTH}
      height={DEMO_HEIGHT}
      // Audio + music are opt-in and APPROVED-only. The render script passes
      // { audio: true } only when lospia-voiceover-approved.wav exists, and
      // { musicExt: "mp3" | "wav" } only when a licensed, approved music file
      // is present on disk. Otherwise the video renders with captions and no
      // audio track. Rejected generated takes are never mounted.
      defaultProps={{ audio: false, musicExt: null }}
    />
  );
};
