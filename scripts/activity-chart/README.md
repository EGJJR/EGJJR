# activity-chart

Zero-dep Node script that renders:

- `profile-3d-contrib/skyline-{light,dark}.svg` — 26-week NYC-style contribution skyline
- `profile-3d-contrib/languages-{light,dark}.svg` — stacked bar of most-used languages

## Run locally

```powershell
$env:GITHUB_TOKEN = "ghp_..."   # PAT with read:user (and repo for private contribs)
$env:USERNAME    = "EGJJR"
node scripts/activity-chart/generate.mjs
```

## Tweak

- `WEEKS` env var — window length (default 26).
- Edit `SKYLINE_LIGHT` / `SKYLINE_DARK` or `LANG_LIGHT` / `LANG_DARK` palettes in `generate.mjs`.
- `buildingW`, `maxH`, `minH` — skyline proportions.
- `TOP_N` — number of languages before grouping the rest into "Other".
