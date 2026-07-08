# Lospia demo — background music (licensed + approved only)

The demo video supports an **optional** subtle background-music bed. It is
included **only when a licensed / royalty-free / owned file physically exists
here** with the approved filename. No music is downloaded, bundled, or
referenced by default, and the video renders perfectly well without it.

## How to add music

Drop **one** licensed, approved file here (either format works):

```
public/demo/audio/music/lospia-background-approved.mp3
public/demo/audio/music/lospia-background-approved.wav
```

The render script (`scripts/render-lospia-demo.sh`) auto-detects it and passes
`{ musicExt: "mp3" | "wav" }` to the composition. If neither file exists, the
script prints **"music: skipped, no approved music file"** and renders without
music. Missing music never blocks the render.

## Required track qualities

- calm, minimal, premium B2B / light ambient
- no vocals
- no dramatic cinematic hits or big swells
- no corporate "cheesy ukulele"
- no distracting beat

## Mix (handled automatically in Remotion)

- Any narration always sits clearly **above** the music.
- Music plays at roughly **−26 dB** (linear volume ≈ 0.06).
- 2-second fade-in at the start, 3-second fade-out at the end.
- See `BackgroundMusic` in `remotion/LospiaDemo.tsx`.

## Licensing rules (do not skip)

Only licensed / royalty-free / owned music may be placed here:

- your own composition, or
- a genuinely royalty-free / CC0 / commercially-licensed track (keep the
  license file / receipt alongside your records).

**Never commit copyrighted tracks.** Audio files are git-ignored by default
(see `public/demo/audio/.gitignore`) so an unlicensed binary is never
accidentally committed.

> Status: **no approved music file is present**, so the current render has no
> music track.
