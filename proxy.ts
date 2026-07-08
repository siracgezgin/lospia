import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed "middleware" to "proxy".
// Export must be named "proxy" (or default) — not "middleware".
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico
     * - public files with an extension (images, VIDEO/AUDIO, fonts, etc.)
     *
     * Video/audio extensions MUST be excluded: otherwise a static asset like
     * /demo/lospia-demo.mp4 is auth-gated and 307-redirected to /login, so the
     * <video> element receives an HTML page instead of media bytes and Safari
     * fails with "AbortError" + a gray player. Images already worked because
     * png/jpg were excluded; mp4 was not.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|m4v|mp3|wav|m4a|ogg|woff|woff2|ttf|otf)$).*)",
  ],
};
