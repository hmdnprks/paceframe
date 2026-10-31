# Paceframe: Product Roadmap

Turn runs into Instagram stories and posts: a photo, Strava stickers, arranged your way, exported at full quality. Mobile-first.

_Last updated: 2026-10-31_

- [x] = built and live · [ ] = not built yet
- **Effort** for open items: 🟢 mostly reuses what's built · 🟡 needs new stickers or data · 🔴 new subsystem

**Progress:** 65/140 done · Editor 15/30 · Layouts 18/38 · Strava 14/19 · Story styles 7/25 · Platform 11/19 · Tech debt 0/9

---

## Editor

### Core
- [x] Formats: Story 9:16 (1080×1920), Post 4:5 (1080×1350), Square 1:1 (1080×1080), switchable anytime (grouped layouts re-apply for the new size)
- [x] Background photo from the gallery, auto-fit to cover, drag and pinch to reframe
- [x] **Split background:** one photo, side by side, or top & bottom, with a white divider; each half pans and zooms separately
- [x] **Lock photo**, and the photo never moves while a sticker or group is selected
- [x] Gallery stickers: pick many transparent PNGs at once (e.g. saved from Strava's share screen)
- [x] Touch gestures: drag, two-finger resize/rotate, one-thumb corner handle; snapping to center lines and right angles
- [x] Sticker tools: back / front, opacity, straighten, duplicate, delete
- [x] Mobile-first UI: bottom sheets, large touch targets, iOS safe areas; desktop mouse-wheel zoom
- [x] Export: Instagram size (1080 px) or full photo quality, PNG rendered on-device, Save / Share via the native share sheet
- [x] Empty state: "Choose a photo" only on an empty canvas
- [x] Remember route colors, text style and Strava settings per device
- [x] Confirm prompts before Ungroup and Group all
- [ ] **Undo / redo** 🟡 (needs the reducer state model below)
- [ ] **Auto-save the draft** (IndexedDB) so a reload or the Strava login redirect never loses work 🟡

### Stickers & design
- [x] **Route colors:** solid, gradient (along each route or across runs), multi-color; presets, picker, hex, **from photo**; apply to selection or all
- [x] **Text style:** size S/M/L/XL, metrics layout **Row / Stack / Side**, fonts (Geist, Bebas Neue, Oswald, Space Mono, Playfair), color incl. from photo
- [x] Gallery PNG route recoloring (orange pixels, always from the original)
- [ ] **Route style extras:** line thickness, glow/outline, start/finish dots 🟢
- [ ] **Sticker style presets:** Strava Classic, Minimal, Bold Block, Outline, Glass card 🟡
- [ ] **Unit labels on/off**, label casing, value-only mode 🟢
- [ ] **Text stickers:** free text ("Sub-25 5K!", "Week 12 of marathon block") 🟢
- [ ] **Summary sticker:** "Oct 2026 · 18 runs · 142 km" from the selected runs 🟢
- [ ] **Splits chart sticker:** per-km pace bars 🟡
- [ ] **Elevation profile sticker** 🟡
- [ ] **Heart-rate zone bar** 🟡
- [ ] **Personal best badges** (5K, 10K, half, marathon) 🟡

### Photo
- [ ] **Basic adjustments:** brightness, contrast, warmth, blur, darken overlay for text legibility 🟡
- [ ] **Filters** (film, mono, high-contrast) 🟡
- [ ] **Gradient / solid background** when there's no photo 🟢
- [ ] **Collage backgrounds** with 3+ photos 🟡

---

## Layouts & groups

### Layout presets
- [x] Stack, Corner (Strava style), Bottom bar, Circle, Hero
- [x] **Grid:** 1–8 columns, live
- [x] **Arc:** stickers per arc, bend ∪ to ∩, tilt along the curve
- [x] **Timeline:** line with node dots, vertical/horizontal, zigzag, race finale at the end
- [x] **Scatter:** random tilt, no overlaps
- [x] **Honeycomb:** offset rows, no overlaps
- [x] **Spiral:** center outward, size grows or follows distance, dotted path
- [x] **Shape from image:** fill or outline any logo/silhouette, invert, optional silhouette
- [x] **Versus:** one sticker per half, badge on the divider (Then vs Now)
- [x] **Wrap around subject:** a tilted field of stickers that flows around the person in the photo (on-device person detection), adjustable angle and spacing, optional big hero sticker placed near the center but off the person
- [x] All layouts stay inside Instagram's safe area
- [ ] **Number:** stickers fill "5", "10", "21", "42" 🟡
- [ ] **Calendar:** Mon–Sun grid, each run on its day 🟡
- [ ] **Frame / border:** stickers around the edges, middle (you) stays clear 🟢
- [ ] **Split bands:** top and bottom bands only, for selfies 🟢
- [ ] **Heart** 🟢
- [ ] **Wave** 🟢
- [ ] **Diagonal / zigzag** 🟢
- [ ] **Podium / staircase** (by distance or pace) 🟢
- [ ] **Track oval** (400 m loop) 🟢
- [ ] **Masonry** (uneven columns) 🟢
- [ ] **Sorted grid** (by date, distance, pace) 🟢
- [ ] **Route mosaic** (tight puzzle collage) 🔴
- [ ] **Timeline extras:** spacing by real dates, phase labels (Base/Build/Peak/Taper), weekly-km bars 🟡
- [ ] **Shape extras:** draw a shape, text-to-shape ("42K"), fill + outline mix, tolerance slider, AI subject cut-out 🟡–🔴

### Groups & editing
- [x] Layouts create a group: drag, pinch, rotate, recenter as one; ungroup / group all
- [x] Re-layout keeps the group where you placed it; Adjust panel (columns, bend, zigzag, size by distance…)
- [x] **Double-tap** a sticker inside a group to edit just that one
- [x] **Re-arrange** to fill gaps
- [x] **Swap run** in any Strava sticker (keeps spot, size, design, color)
- [x] **Add runs** to a group from its original date range (Scatter: free spots; other layouts re-arrange)
- [x] **Edit finisher card** in place (metrics, finish time, PR)
- [ ] **Spacing / padding slider** for Grid and Arc 🟢
- [ ] **Alignment tools:** align / distribute a multi-selection 🟡
- [ ] **Multi-select stickers** (long-press) without grouping everything 🟡
- [ ] **Lock sticker** against accidental moves 🟢
- [ ] **Keep-clear box** that every layout avoids (face, medal, banner) 🟡
- [ ] **Remember last format & layout** 🟢

---

## Strava

- [x] OAuth login with httpOnly session and automatic token refresh; safe with a shared API app (never deauthorizes)
- [x] **Installed-app login on iPhone:** web flow from the home-screen app, plus a one-time login code if iOS lands in Safari
- [x] Runs only (Run, Trail Run, Virtual Run)
- [x] Activity grid with route preview, distance and pace; Load more
- [x] Distance filter; km / miles
- [x] Multi-select (selection order = sticker order); **Select all shown**
- [x] **Random pick:** N runs from last 1/3/6/12 months or a custom range; re-roll
- [x] **Metrics step:** route, distance, pace/speed, time, elevation, HR, cadence, calories, date, title (same for all runs, remembered)
- [x] Sticker modes: **per run**, **separate** (one per metric), **routes only** (constellation / spiral)
- [x] **Training timeline:** by week (totals, long run, rest weeks) or by run, with a chosen **race finale**
- [x] Race badge for runs marked as Race
- [x] **Race result:** finisher card (choose up to 6 metrics, elapsed/moving, PR) + goal vs actual
- [x] **Then vs Now:** compare pace/time/distance/HR, difference badge with total time change, split photos
- [x] Big batches skip per-activity requests to stay within rate limits
- [ ] **Activity search** by name 🟢
- [ ] **Sort** by date, distance or pace 🟢
- [ ] **Date range in the main list** (not only in Random/Timeline) 🟢
- [ ] **Sport filter toggle** to include walks, hikes or rides 🟢
- [ ] **Recap presets:** "This week", "This month", "Year in review" 🟡

---

## Story styles by use case

### 1. "Look how far I've come": improvement over time
- [x] **Then vs Now** with split before/after photos
- [x] **Before/after photo split**
- [ ] **Weekly volume bars:** weekly km across the block, taper visible, race week orange 🟡 (data already in Timeline)
- [ ] **Timeline + trend:** "+38% volume" badges per phase 🟢
- [ ] **Pace trend line:** pace per week/month, best point highlighted 🟡
- [ ] **Same route, faster:** one regular loop over time, time shrinking 🟡
- [ ] **PR ladder:** 5K → 10K → HM → FM, or one distance over time 🟡
- [ ] **Streak heatmap:** GitHub-style run calendar 🟡

### 2. "I did it!": race result
- [x] **Finisher card**
- [x] **Goal vs actual**
- [ ] **Road to race header:** "19 weeks · 712 km · 84 runs" on the timeline 🟢
- [ ] **Medal frame:** medal/bib photo with stats around the edges 🟢 (needs Frame layout)
- [ ] **Splits story:** per-km bars, negative split highlighted 🟡
- [ ] **Race elevation profile:** the "wall" marked, pace overlaid 🟡
- [ ] **Heart-rate zones** as a stacked bar 🟡
- [ ] **Animated finish:** route draws itself, time counts up (video) 🔴

### 3. "Look at all my runs": creative
- [x] **Route constellation**
- [x] **Spiral of runs**
- [x] **Shape from image** (runs fill a logo or silhouette)
- [ ] **Polaroid memories:** polaroid frame style for Random pick 🟢
- [ ] **Route overlay:** all routes stacked at real map scale ("home turf") 🟡
- [ ] **Calendar month:** a route in each day's cell 🟡
- [ ] **Distance number:** runs filling "142" 🟡
- [ ] **Year in review / wrapped** 🟡
- [ ] **Strava photo collage** 🔴

**Suggested next:** Weekly volume bars + Road to race header (finishes the training-block story), then Year in review, then the chart engine (Splits, Race profile, Pace trend).

---

## Platform

- [x] Next.js 16 App Router, React 19, Tailwind 4, TypeScript, lucide-react icons; no canvas or gesture libraries
- [x] Deployed on HTTPS at **paceframe.hamdan.id** (Strava callback domain set)
- [x] **Installable PWA:** manifest, standalone full screen, install banner (Android button, iOS how-to)
- [x] Offline editor via service worker (Strava API always online)
- [x] **App icons from the Paceframe logo** (any, maskable, Apple touch icon, favicon)
- [x] LAN dev origins for phone testing
- [x] README and roadmap
- [x] Strava secrets only in `.env.local` (git-ignored)
- [x] Sticker fonts load only when picked
- [x] Big Strava batches stay within rate limits
- [ ] **Share target:** "Share → Paceframe" from Photos or Strava (Android) 🟡

### Later (bigger bets)
- [ ] **Templates gallery:** one-tap full designs, shareable as links 🔴
- [ ] **Animated stories:** MP4/WebM export with the route drawing itself 🔴
- [ ] **Route on map tiles** (satellite/street basemap) 🔴
- [ ] **Photo-from-route:** suggest the photo taken during the run (EXIF) 🟡
- [x] **Smart layout:** detect the person and keep stickers off them (Wrap preset); other layouts could use it too 🟡
- [ ] **Friends & clubs** recaps (needs Strava capacity approval) 🔴
- [ ] **Other sources:** Garmin, Apple Health, GPX/FIT upload 🔴
- [ ] **Native wrapper** (Capacitor) for direct "Share to Instagram Stories" 🔴

---

## Tech debt & quality

- [ ] **Tests:** unit tests for `layouts.ts` and `stravaStickers.ts`; Playwright for gestures and export
- [ ] **Split `Editor.tsx`** (now ~1,700 lines): gestures hook, toolbars, sheets
- [ ] **Reducer state model** (also enables undo/redo)
- [ ] **Performance:** single `<canvas>` stage for 30+ stickers
- [ ] **Accessibility:** keyboard nudging, focus management in sheets, labels for stickers
- [ ] **Error tracking & privacy-friendly analytics**
- [ ] **Strava rate limits:** surface 429s with retry-after; cache activity lists per session
- [ ] **Security:** encrypt the session cookie (it's plain JSON today); **rotate the Strava client secret** (it was shared in chat during development)
- [ ] **`npm audit`** findings from existing dependencies

---

## Constraints to remember

- **Strava API:** a new app is limited to **1 athlete** (the owner) until a capacity increase is approved. One **callback domain** per app (localhost always allowed; `hamdan.id` covers subdomains). Show **"Powered by Strava"**; "Strava" can't be in the app name.
- **iOS:** canvas limit ~16.7 MP (export cap); the share sheet needs HTTPS; home-screen apps have cookies separate from Safari.
- **Instagram** re-compresses uploads, so 1080 px wide is the effective quality ceiling.
