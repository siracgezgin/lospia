# Lospia demo voice-over — APPROVED files only

The demo video ships **silently with captions** until a voice-over has been
**manually listened to and approved**. Bad audio is worse than no audio, so no
generated take is ever mounted automatically.

## The only file the video will ever use

```
public/demo/audio/lospia-voiceover-approved.wav
```

A file may be placed here **only after manual listening approval**. When it
exists, `scripts/render-lospia-demo.sh` detects it and passes
`{ "audio": true }` to the composition; otherwise the render prints
`voice-over: skipped, no approved voice file` and the video renders with
captions only. A missing voice-over never breaks the render.

## Rejected takes (never used)

Earlier locally-generated takes were rejected for artificial tone / wrong
emphasis and are kept only for reference:

- `archive-bad-voice-v1/` — per-scene clips (different speaker per scene)
- `archive-bad-voice-v2-male/` — male master take
- `archive-bad-voice-v3-female-master/` — continuous female master take
  (formerly `lospia-voiceover-master.wav`; rejected 2026-07-06)

Nothing in these folders is referenced by the render script or the Remotion
composition.

## Rules for a future approved voice

- Fully synthetic and original, or a properly licensed human recording.
- **No cloning of Siri, Apple voices, celebrities, or any real person.**
- No paid APIs without explicit sign-off.
- The file is added here only after someone has listened to the full track and
  explicitly approved it.

Audio binaries are git-ignored (see `.gitignore`); only this README is tracked.
