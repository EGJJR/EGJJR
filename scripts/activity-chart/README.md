# activity-chart

Zero-dep Node script that renders a 26-week NYC-style contribution skyline
into `profile-3d-contrib/skyline-{light,dark}.svg`.

## Run locally

```powershell
$env:GITHUB_TOKEN = "ghp_..."   # PAT with read:user (and repo for private contribs)
$env:USERNAME    = "EGJJR"
node scripts/activity-chart/generate.mjs
```

## Tweak

- `WEEKS` env var — window length (default 26).
- Edit `SKYLINE_LIGHT` / `SKYLINE_DARK` palettes in `generate.mjs` for color changes.
- `buildingW`, `maxH`, `minH` constants control proportions.
- `colGap`/`rowGap` in the window-rendering block control window density.
