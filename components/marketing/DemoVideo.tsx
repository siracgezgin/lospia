import { existsSync } from "node:fs";
import path from "node:path";
import { DemoVideoPlayer, LiveDemoCta } from "./DemoVideoPlayer";

// Demo slot. Server component: at render time it checks whether the rendered
// demo asset actually exists on disk. When public/demo/lospia-demo.mp4 is
// present it renders the client <DemoVideoPlayer> (native HTML5 <video> with an
// onError fallback). When it is NOT present — or when the browser fails to load
// the file — we never show a "hazırlanıyor"/"yakında" placeholder or a blank
// gray player; instead we render a trustworthy live-demo CTA card. No external
// or fake video URL is ever embedded; only a local file that is really on disk.
const DEMO_VIDEO_PUBLIC_PATH = "/demo/lospia-demo.mp4";
const DEMO_POSTER_PUBLIC_PATH = "/demo/lospia-demo-poster.png";

function publicFileExists(publicPath: string): boolean {
  try {
    return existsSync(path.join(process.cwd(), "public", publicPath));
  } catch {
    return false;
  }
}

/** Whether the real demo MP4 is present on disk (lets the page pick copy). */
export function hasDemoVideo(): boolean {
  return publicFileExists(DEMO_VIDEO_PUBLIC_PATH);
}

export function DemoVideo() {
  const hasVideo = publicFileExists(DEMO_VIDEO_PUBLIC_PATH);
  const hasPoster = publicFileExists(DEMO_POSTER_PUBLIC_PATH);

  return (
    <div className="mx-auto mt-12 max-w-4xl">
      {hasVideo ? <DemoVideoPlayer hasPoster={hasPoster} /> : <LiveDemoCta />}
    </div>
  );
}
