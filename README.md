# Paceframe

Turn your runs into Instagram stories and posts. Pick a photo, drop on your Strava stickers (route, distance, pace…), arrange them freely or in a shape, and export at full quality.

Mobile-first. All image editing and export happen on your device. Nothing is uploaded.

## Features

- **Formats:** Story 9:16 (1080×1920), Post 4:5 (1080×1350), Square 1:1 (1080×1080)
- **Background photo:** pick from the gallery, drag and pinch to reframe
- **Stickers, two ways:**
  - **From your gallery:** transparent PNGs, e.g. the ones saved from Strava's share screen. Pick many at once.
  - **From Strava:** log in, pick an activity, and choose which stickers to make: route map, distance, pace/speed, time, elevation, heart rate, cadence, calories, title + date (km or miles)
- **Freeform editing:** drag, pinch to resize and rotate, one-thumb corner handle, snapping to the center lines and right angles, layer order, opacity, duplicate, delete
- **Layouts** (applied to all stickers as a movable group):
  - Stack, Corner, Grid (1–8 columns), **Arc** (stickers per arc, bend from ∪ to ∩, optional tilt), Bottom bar, Circle, Hero, Scatter
  - Layouts stay inside Instagram's safe area
  - Drag, pinch or rotate the whole group, recenter it, or ungroup to edit stickers one by one
- **Export:** PNG at Instagram size, or at full photo resolution (up to the browser canvas limit). On phones, **Save / Share** opens the share sheet (save to Photos, post to Instagram).

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Testing on your phone

```bash
npm run dev -- -H 0.0.0.0
```

Open `http://<your-mac-ip>:3000` on a phone on the same Wi-Fi (`ipconfig getifaddr en0` shows the IP). `next.config.ts` allows `192.168.*.*`, `10.*.*.*` and `*.local` as dev origins. Without that, Next blocks the dev JavaScript and buttons don't respond.

Over plain `http`, iOS disables the share sheet, so export falls back to a download. It works fully on HTTPS, for example once deployed.

## Strava setup

1. Create (or reuse) an API app at https://www.strava.com/settings/api. Each Strava account can own only one app, and reusing an existing one works fine.
2. Add credentials to `.env.local`, which git ignores:

   ```
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=your_secret
   ```

3. **Authorization Callback Domain:** Strava always allows `localhost` and `127.0.0.1`. For a phone on your LAN or a deployed site, set this to that host (e.g. `paceframe.vercel.app`). Strava allows only one domain per app.

Notes:

- Scopes requested: `read,activity:read_all`.
- The session is stored in an httpOnly cookie, and access tokens refresh automatically on the server.
- **Log out** only clears the cookie. It does not call Strava's `/deauthorize`, so other projects sharing the same API app keep working.
- New Strava apps are limited to a single athlete (the owner) until Strava approves a capacity increase.

## Project structure

```
app/
  page.tsx                  → renders the editor
  editor/
    Editor.tsx              → canvas, gestures, toolbars, bottom sheets
    layouts.ts              → layout presets (grid, arc, circle…) + safe area
    export.ts               → full-resolution PNG rendering
    StravaPanel.tsx         → Strava login, activity list, sticker picker
    stravaStickers.ts       → draws route/stat stickers to transparent PNGs
    types.ts                → formats, layer types, image loading
  lib/
    strava.ts               → OAuth helpers, session cookie, token refresh
    activity.ts             → Strava activity → compact client shape
  api/strava/
    login/                  → redirect to Strava authorize
    callback/               → exchange code, set session cookie
    me/                     → current athlete (or null)
    activities/             → recent activities (paged)
    activities/[id]/        → activity detail (full route, calories)
    logout/                 → clear session
```

## How it works

- Everything is positioned in **design units**, which equal output pixels at 1× (e.g. 1080×1920). The on-screen stage is a scaled DOM preview, and export redraws the same layers to a `<canvas>` at 1× or higher, so quality doesn't depend on screen size.
- Stickers are generic image layers. Gallery PNGs and Strava-generated stickers are the same layer type, so layouts, groups and gestures work on both.
- A group is moved as one rigid shape around its bounding-box center (`groupMove` in `Editor.tsx`).

## Tech

Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript. No canvas or gesture libraries.

---

Strava data shown in the app is "Powered by Strava". Paceframe is not affiliated with or endorsed by Strava.
