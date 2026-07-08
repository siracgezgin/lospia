# public/demo

Rendered Lospia demo assets live here (produced by `scripts/render-lospia-demo.sh`):

- `lospia-demo.mp4` — the 75-second ANIMATED product explainer. The UI is drawn
  natively in Remotion (not screenshots); `remotion/assets/screenshots/*` are
  visual reference only.
- `lospia-demo-poster.png` — poster still (a real animated board frame)

Only the shipped `lospia-demo.mp4` + `lospia-demo-poster.png` are committed here.
QA stills (`qa-frame-*.png`), reference screenshots (`screenshots/`) and generated
voice-over (`audio/*.wav`) are local-only build artifacts and are git-ignored.

The landing page (`/#demo`) checks for these files at render time and swaps in a
real HTML5 `<video>` automatically once `lospia-demo.mp4` exists — no code change
needed. Until then, the section shows a polished "Canlı demo talep et" CTA card
(never a "coming soon" placeholder or a fake player).

Do not commit customer-sensitive footage. Use demo-workspace / generic data only.
