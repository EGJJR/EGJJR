#!/usr/bin/env node
// Custom 26-week NYC-style contribution skyline.
// Zero deps — uses built-in fetch (Node 18+). Emits two SVGs:
//   profile-3d-contrib/skyline-light.svg
//   profile-3d-contrib/skyline-dark.svg
//
// Env:
//   GITHUB_TOKEN  (required) — PAT or workflow token. PAT recommended to count private repo activity.
//   USERNAME      (required) — GitHub login to render.
//   WEEKS         (optional, default 26) — rolling window length.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'profile-3d-contrib');

const USERNAME = process.env.USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;
const WEEKS = Number(process.env.WEEKS ?? 26);

if (!USERNAME) die('USERNAME env var is required');
if (!TOKEN) die('GITHUB_TOKEN env var is required');

function die(msg) {
  console.error(`generate.mjs: ${msg}`);
  process.exit(1);
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'egjjr-activity-chart',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) die(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) die(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchCalendar() {
  // contributionsCollection returns the calendar trimmed to the from..to window.
  // We add 1 day padding because GitHub treats `to` as exclusive at day boundaries
  // depending on the user's timezone.
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - WEEKS * 7 + 1);

  const query = /* GraphQL */ `
    query ($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const data = await gql(query, {
    login: USERNAME,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const cal = data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) die('No calendar returned — check USERNAME / token scopes.');
  return cal;
}

// ─── Bucketing ──────────────────────────────────────────────────────────────

// Quartiles of *non-zero* days so the chart self-scales — used to set
// per-building window brightness without GitHub's fixed thresholds.
function makeBucketer(days) {
  const nonZero = days.map(d => d.contributionCount).filter(c => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return () => 0;
  const q = p => nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (c) => {
    if (c === 0) return 0;
    if (c <= q1) return 1;
    if (c <= q2) return 2;
    if (c <= q3) return 3;
    return 4;
  };
}

// ─── Skyline (side view) ────────────────────────────────────────────────────

// Side-elevation city silhouette: each week = a building, height = weekly total.
// Roof variants + lit windows give it texture without adding data noise.

const SKYLINE_LIGHT = {
  name: 'skyline-light',
  // Dawn gradient — peach to soft blue
  skyTop: '#fff1d9',
  skyBottom: '#cfe3ff',
  building: '#1a1f2e',
  window: '#ffd97a',
  ground: '#0d1117',
  text: '#0a0a0a',
  muted: '#6b7280',
  sun: '#ffb96b',
  stars: false,
};

const SKYLINE_DARK = {
  name: 'skyline-dark',
  // Dusk gradient — deep navy to violet
  skyTop: '#06101e',
  skyBottom: '#1f1a3d',
  building: '#030610',
  window: '#ffd97a',
  ground: '#020408',
  text: '#c9d1d9',
  muted: '#8b949e',
  sun: '#e8f0ff', // moon
  stars: true,
};

// Deterministic 32-bit hash — keeps the skyline visually stable across runs.
function hash32(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) >>> 0;
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d) >>> 0;
  return (n ^ (n >>> 15)) >>> 0;
}

function renderSkyline(calendar, theme) {
  const weeks = calendar.weeks;
  const allDays = weeks.flatMap(w => w.contributionDays);
  const toLevel = makeBucketer(allDays);

  // Geometry
  const buildingW = 22;
  const gap = 4;
  const minH = 18;
  const maxH = 200;
  const groundY = 240;
  const skyTopY = 0;

  const weekTotals = weeks.map(w =>
    w.contributionDays.reduce((s, d) => s + d.contributionCount, 0)
  );
  const maxTotal = Math.max(...weekTotals, 1);

  // sqrt scaling so a single record-breaking week doesn't flatten everything else
  const scaleH = (total) =>
    Math.round(minH + (maxH - minH) * Math.sqrt(total / maxTotal));

  // Average level per week — drives window brightness for that building
  const weekLevels = weeks.map(w => {
    const levels = w.contributionDays.map(d => toLevel(d.contributionCount));
    return Math.max(...levels, 0);
  });

  // ── Buildings ────────────────────────────────────────────────────────────
  let buildings = '';
  weeks.forEach((week, i) => {
    const h = scaleH(weekTotals[i]);
    const x = i * (buildingW + gap);
    const y = groundY - h;
    const hash = hash32(i + 1);
    const variant = hash % 5;

    // Main body
    buildings += `<rect x="${x}" y="${y}" width="${buildingW}" height="${h}" fill="${theme.building}" />`;

    // Roof variant (skip on very short buildings — looks busy)
    if (h > 40) {
      if (variant === 1) {
        // Setback — narrower block on top
        const sbW = buildingW - 8;
        const sbH = 14;
        buildings += `<rect x="${x + 4}" y="${y - sbH}" width="${sbW}" height="${sbH}" fill="${theme.building}" />`;
      } else if (variant === 2) {
        // Spire (Chrysler/Empire State energy)
        const tipY = y - 22;
        buildings += `<polygon points="${x + buildingW / 2},${tipY} ${x + 5},${y} ${x + buildingW - 5},${y}" fill="${theme.building}" />`;
      } else if (variant === 3) {
        // Antenna
        const ax = x + buildingW / 2;
        buildings += `<line x1="${ax}" y1="${y}" x2="${ax}" y2="${y - 16}" stroke="${theme.building}" stroke-width="1.5" />`;
        buildings += `<circle cx="${ax}" cy="${y - 16}" r="1.2" fill="${theme.building}" />`;
      } else if (variant === 4) {
        // Water tower (classic NYC rooftop)
        const tx = x + buildingW / 2 - 3;
        buildings += `<rect x="${x + buildingW / 2 - 4}" y="${y - 9}" width="8" height="2" fill="${theme.building}" />`;
        buildings += `<rect x="${tx}" y="${y - 7}" width="6" height="6" fill="${theme.building}" />`;
        buildings += `<rect x="${tx + 2}" y="${y - 11}" width="2" height="4" fill="${theme.building}" />`;
      }
      // variant 0 = flat roof, no extra geometry
    }

    // Windows — deterministic-random grid, brightness from weekLevels[i]
    const level = weekLevels[i];
    if (level > 0 && h > minH + 4) {
      const winSize = 1.8;
      const colGap = 5;
      const rowGap = 5;
      const padTop = 6;
      const padBot = 4;
      const padX = 4;
      const cols = Math.floor((buildingW - padX * 2 + colGap - winSize) / colGap);
      const rows = Math.floor((h - padTop - padBot + rowGap - winSize) / rowGap);
      // Brightness ramps with weekly activity level (1..4)
      const op = (0.28 + level * 0.18).toFixed(2);

      let win = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // ~35% of windows dark — gives an organic "people home / not home" look
          const wHash = hash32(hash + r * 131 + c * 17) % 100;
          if (wHash < 35) continue;
          const wx = (x + padX + c * colGap).toFixed(1);
          const wy = (y + padTop + r * rowGap).toFixed(1);
          win += `<rect x="${wx}" y="${wy}" width="${winSize}" height="${winSize}" fill="${theme.window}" />`;
        }
      }
      buildings += `<g opacity="${op}">${win}</g>`;
    }
  });

  // ── Stars (dark only) ────────────────────────────────────────────────────
  let stars = '';
  if (theme.stars) {
    // Cap stars above the tallest possible building so none land inside one
    const starCeilingY = groundY - maxH - 30;
    const totalW = weeks.length * (buildingW + gap) - gap;
    for (let s = 0; s < 60; s++) {
      const h = hash32(s * 9999 + 7);
      const sx = (h % 1000) / 1000 * totalW;
      const sy = ((h >>> 10) % 1000) / 1000 * Math.max(starCeilingY, 10);
      const sr = 0.4 + ((h >>> 20) % 100) / 100 * 0.9;
      const so = 0.4 + ((h >>> 24) % 100) / 100 * 0.5;
      stars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(2)}" fill="#ffffff" opacity="${so.toFixed(2)}" />`;
    }
  }

  // Sun / moon — upper right, well above the tallest building
  const totalW = weeks.length * (buildingW + gap) - gap;
  const sunR = 14;
  const sunX = totalW - 30;
  const sunY = 36;
  const sun = `<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${theme.sun}" opacity="${theme.stars ? '0.85' : '0.7'}" />`;

  // ── Month labels along the ground ────────────────────────────────────────
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const firstDay = week.contributionDays[0];
    if (!firstDay) return;
    const m = new Date(firstDay.date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({
        x: i * (buildingW + gap) + buildingW / 2,
        text: new Date(firstDay.date + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      });
    }
  });

  // ── ViewBox + frame ──────────────────────────────────────────────────────
  const padX = 24;
  const padTop = 50;
  const padBottom = 30;
  const vbX = -padX;
  const vbY = skyTopY - padTop;
  const vbW = totalW + padX * 2;
  const vbH = (groundY - skyTopY) + padTop + padBottom;

  const headerY = vbY + 22;
  const totalLine = `${calendar.totalContributions.toLocaleString()} contributions · last ${WEEKS} weeks`;

  // Sky gradient id needs to be unique per file to avoid collisions if both
  // SVGs are ever inlined into the same page.
  const gradId = `sky-${theme.name}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.skyTop}" />
      <stop offset="100%" stop-color="${theme.skyBottom}" />
    </linearGradient>
  </defs>
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="url(#${gradId})" />
  ${stars}
  ${sun}
  <text x="0" y="${headerY}" fill="${theme.text}" font-size="13" font-weight="600">@${USERNAME}</text>
  <text x="0" y="${headerY + 14}" fill="${theme.muted}" font-size="10">${totalLine}</text>
  <g>${buildings}</g>
  <rect x="${vbX}" y="${groundY}" width="${vbW}" height="2" fill="${theme.ground}" />
  <g fill="${theme.muted}" font-size="9">
    ${monthLabels.map(l => `<text x="${l.x.toFixed(1)}" y="${groundY + 16}" text-anchor="middle">${l.text}</text>`).join('')}
  </g>
</svg>
`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const calendar = await fetchCalendar();
mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['skyline-light.svg', renderSkyline(calendar, SKYLINE_LIGHT)],
  ['skyline-dark.svg', renderSkyline(calendar, SKYLINE_DARK)],
];

for (const [name, svg] of outputs) {
  const p = join(OUT_DIR, name);
  writeFileSync(p, svg);
  console.log(`Wrote ${p}`);
}

console.log(`Total contributions (${WEEKS}w): ${calendar.totalContributions}`);
