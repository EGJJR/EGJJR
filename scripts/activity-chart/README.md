# activity-chart

Zero-dep Node script that renders a 26-week NYC-style contribution skyline
into `profile-3d-contrib/skyline-{light,dark}.svg`.

## Private contributions

The daily workflow tries `ACTIVITY_TOKEN` first (`secrets.MY_PERSONAL_ACCESS_TOKEN`) and falls back to the Actions token on a 401. The Actions token only sees public contributions, so the skyline stays short of the real calendar until that secret is a valid token for the EGJJR account.

Create a fine-grained personal access token:

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Resource owner: your user account. Repository access: All repositories.
3. Repository permissions: Contents → Read-only (Metadata is included automatically).
4. Generate the token and copy it once.

Save it on this repo as the secret `MY_PERSONAL_ACCESS_TOKEN` (Settings → Secrets and variables → Actions). The next scheduled run, or a manual run of GitHub-Profile-3D-Contrib, will count private activity again. A dead token still falls back to public contributions instead of failing the job.

## Run locally

```powershell
$env:ACTIVITY_TOKEN = "github_pat_..."  # the token above; private activity
$env:GITHUB_TOKEN   = "github_pat_..."  # same token is enough locally
$env:USERNAME       = "EGJJR"
node scripts/activity-chart/generate.mjs
```

## Tweak

- `WEEKS` env var — window length (default 26).
- Edit `SKYLINE_LIGHT` / `SKYLINE_DARK` palettes in `generate.mjs` for color changes.
- `buildingW`, `maxH`, `minH` constants control proportions.
- `colGap`/`rowGap` in the window-rendering block control window density.
