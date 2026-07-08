#!/usr/bin/env bash
set -euo pipefail

# Render the Lospia 75-second ANIMATED product-explainer demo.
#
# The product scenes are drawn natively in Remotion (remotion/LospiaDemo.tsx) —
# a video-native rebuild of the real Lospia UI (sidebar, top bar, board, task
# drawer, list, calendar, dashboard). Screenshots in remotion/assets/screenshots
# are visual REFERENCE only; no screenshot is placed as footage.
#
# Outputs (written to public/demo/):
#   - lospia-demo.mp4               (required — H.264 yuv420p, 1920x1080, 30fps,
#                                    +faststart so Safari can stream it)
#   - lospia-demo-poster.png        (required — a real animated board frame)
#   - qa-frame-board.png            (QA still — animated board)
#   - qa-frame-task-detail.png      (QA still — task-detail drawer)
#   - qa-frame-list-calendar.png    (QA still — list + calendar split)
#   - qa-frame-dashboard.png        (QA still — weekly dashboard summary)
#   - lospia-demo.webm              (optional — VP9, only if RENDER_WEBM=1)
#
# Audio (both optional, auto-detected — APPROVED files only):
#   • Voice-over: public/demo/audio/lospia-voiceover-approved.wav — a voice
#     track that has been MANUALLY listened to and approved. Earlier generated
#     takes (master/per-scene/male) were rejected and live in the
#     archive-bad-voice-* folders; they are NEVER picked up automatically.
#   • Music: public/demo/audio/music/lospia-background-approved.{mp3,wav} —
#     included ONLY if a licensed, approved file exists (see that folder's
#     README). Never bundled.
# Missing audio → the video renders with captions only (bad audio is worse than
# none).
#
# Remotion is a devDependency. If not installed: npm install
# Then, from the repo root: bash scripts/render-lospia-demo.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -x "node_modules/.bin/remotion" ]; then
  echo "Remotion is not installed. Run: npm install" >&2
  exit 1
fi

ENTRY="remotion/index.ts"
COMPOSITION="LospiaDemo"
OUT_DIR="public/demo"
AUDIO_DIR="$OUT_DIR/audio"
MUSIC_DIR="$AUDIO_DIR/music"
POSTER_FRAME="${POSTER_FRAME:-720}" # board scene: card landed in Kontrol / Onay
FINAL_MP4="$OUT_DIR/lospia-demo.mp4"
POSTER_PNG="$OUT_DIR/lospia-demo-poster.png"
TMP_MP4="$OUT_DIR/.lospia-demo.raw.mp4"
APPROVED_WAV="$AUDIO_DIR/lospia-voiceover-approved.wav"
MUSIC_MP3="$MUSIC_DIR/lospia-background-approved.mp3"
MUSIC_WAV="$MUSIC_DIR/lospia-background-approved.wav"

mkdir -p "$OUT_DIR"

# ── Detect optional APPROVED voice-over + licensed music → build props ─
# Only manually-approved files are ever mounted. The old generated master
# (lospia-voiceover-master.wav) was rejected and is NEVER used automatically.
HAVE_AUDIO=0
HAVE_MUSIC=0
AUDIO_JSON="false"
MUSIC_EXT_JSON="null"

if [ -s "$APPROVED_WAV" ]; then
  HAVE_AUDIO=1
  AUDIO_JSON="true"
  echo "🔊 Voice-over: approved voice file found → embedding it."
else
  echo "🔇 Voice-over: skipped, no approved voice file → rendering silently (captions only)."
fi

if [ -s "$MUSIC_MP3" ]; then
  HAVE_MUSIC=1
  MUSIC_EXT_JSON="\"mp3\""
  echo "🎵 Music: approved licensed track (mp3) found → mixing it low."
elif [ -s "$MUSIC_WAV" ]; then
  HAVE_MUSIC=1
  MUSIC_EXT_JSON="\"wav\""
  echo "🎵 Music: approved licensed track (wav) found → mixing it low."
else
  echo "🎵 Music: skipped, no approved music file → rendering without music."
fi

PROPS=(--props "{\"audio\":$AUDIO_JSON,\"musicExt\":$MUSIC_EXT_JSON}")

# ── Render MP4 (H.264, yuv420p for broad browser/Safari support) ─────
echo "▶ Rendering MP4 (H.264 · yuv420p)…"
npx remotion render "$ENTRY" "$COMPOSITION" "$TMP_MP4" \
  --codec=h264 \
  --pixel-format=yuv420p \
  "${PROPS[@]}"

# ── Web-optimize for Safari (yuv420p limited-range + faststart) ──────
if command -v ffmpeg >/dev/null 2>&1; then
  echo "▶ Optimizing for Safari (yuv420p · +faststart)…"
  ffmpeg -y -loglevel error -i "$TMP_MP4" \
    -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset medium \
    -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -c:a aac -b:a 128k -movflags +faststart "$FINAL_MP4"
  rm -f "$TMP_MP4"
else
  echo "⚠ ffmpeg not found — skipping yuv420p/+faststart optimization (Safari may abort)." >&2
  mv -f "$TMP_MP4" "$FINAL_MP4"
fi

# ── Poster still (animated product board frame) ──────────────────────
echo "▶ Rendering poster still (frame $POSTER_FRAME)…"
npx remotion still "$ENTRY" "$COMPOSITION" "$POSTER_PNG" --frame="$POSTER_FRAME" "${PROPS[@]}"

# ── QA stills — one representative frame per key animated scene ───────
echo "▶ Rendering QA stills (board · task detail · list+calendar · dashboard)…"
npx remotion still "$ENTRY" "$COMPOSITION" "$OUT_DIR/qa-frame-board.png"         --frame=720  "${PROPS[@]}"
npx remotion still "$ENTRY" "$COMPOSITION" "$OUT_DIR/qa-frame-task-detail.png"   --frame=1140 "${PROPS[@]}"
npx remotion still "$ENTRY" "$COMPOSITION" "$OUT_DIR/qa-frame-list-calendar.png" --frame=1500 "${PROPS[@]}"
npx remotion still "$ENTRY" "$COMPOSITION" "$OUT_DIR/qa-frame-dashboard.png"     --frame=1880 "${PROPS[@]}"

if [ "${RENDER_WEBM:-0}" = "1" ]; then
  echo "▶ Rendering WebM (VP9)…"
  npx remotion render "$ENTRY" "$COMPOSITION" "$OUT_DIR/lospia-demo.webm" --codec=vp9 "${PROPS[@]}"
fi

# ── Verify outputs ───────────────────────────────────────────────────
fail=0
for f in "$FINAL_MP4" "$POSTER_PNG" \
         "$OUT_DIR/qa-frame-board.png" "$OUT_DIR/qa-frame-task-detail.png" \
         "$OUT_DIR/qa-frame-list-calendar.png" "$OUT_DIR/qa-frame-dashboard.png"; do
  if [ -s "$f" ]; then
    echo "   ✓ $f ($(du -h "$f" | cut -f1))"
  else
    echo "   ✗ MISSING: $f" >&2
    fail=1
  fi
done

# ── Probe the final MP4 ──────────────────────────────────────────────
if command -v ffprobe >/dev/null 2>&1 && [ -s "$FINAL_MP4" ]; then
  echo
  echo "ℹ ffprobe:"
  ffprobe -v error \
    -show_entries format=duration,format_name \
    -show_entries stream=codec_name,codec_type,pix_fmt,width,height \
    -of default=noprint_wrappers=1 "$FINAL_MP4" | sed 's/^/     /'
  if ffprobe -v error -select_streams a -show_entries stream=codec_name \
       -of csv=p=0 "$FINAL_MP4" | grep -q .; then
    echo "     audio_stream=yes"
  else
    echo "     audio_stream=no (silent — captions only)"
  fi
fi

echo
echo "   voice-over: $([ "$HAVE_AUDIO" = "1" ] && echo "INCLUDED (approved file)" || echo "skipped, no approved voice file (captions only)")"
echo "   music:      $([ "$HAVE_MUSIC" = "1" ] && echo "INCLUDED (approved licensed file, low mix)" || echo "skipped, no approved music file")"

if [ "$fail" = "0" ]; then
  echo "✅ Done — animated Lospia explainer rendered:"
  echo "   $FINAL_MP4"
  echo "   $POSTER_PNG + 4 QA stills"
  echo "   The landing page /#demo serves the real video automatically."
else
  echo "❌ Render finished with missing outputs — see above." >&2
  exit 1
fi
