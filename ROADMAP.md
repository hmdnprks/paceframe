# Paceframe: Product Roadmap

Turn runs into Instagram stories and posts: a photo, Strava stickers, arranged your way, exported at full quality. Mobile-first.

_Last updated: 2026-10-31_

---

## ✅ Shipped

### Editor core
- **Formats:** Story 9:16 (1080×1920), Post 4:5 (1080×1350), Square 1:1 (1080×1080), switchable at any time
- **Background photo** from the gallery, auto-fit to cover; drag and pinch to reframe
- **Gallery stickers:** pick many transparent PNGs at once (e.g. saved from Strava's share screen)
- **Touch gestures:** one finger drags, two fingers resize and rotate, plus a one-thumb corner handle
- **Snapping** to the canvas center lines and to 0°/90°/180°/270°
- **Sticker tools:** send back / bring front, opacity, straighten, duplicate, delete
- **Desktop support:** mouse wheel zoom
- **Mobile-first UI:** bottom sheets, large touch targets, iOS safe areas, no accidental page zoom

### Layouts & groups
- **Presets:** Stack, Corner (Strava style), Grid, Arc, Bottom bar, Circle, Hero, Scatter
- **Grid:** 1–8 columns, updates live
- **Arc:** stickers per arc, bend slider from ∪ to ∩ (±240°), tilt along the curve, inner arcs for overflow
- **Scatter:** random tilt with **no overlaps**, auto-shrinks to fit
- All layouts stay inside **Instagram's safe area**
- **Groups:** a layout groups its stickers. Drag, pinch, rotate or recenter the whole group; ungroup to edit one sticker; "Group all" to regroup
- Re-layout (e.g. changing columns) keeps the group where you placed it

### Export
- **Instagram size** (exact 1080 px) or **full photo quality** (keeps the photo's native resolution, up to the iOS canvas limit)
- PNG, rendered on-device; nothing is uploaded
- **Save / Share** through the native share sheet (Save to Photos, post to Instagram), with download as fallback

### Strava integration
- **OAuth login:** httpOnly session cookie, automatic token refresh, opens the Strava app on mobile
- Safe with a **shared Strava API app**: logout never calls `/deauthorize`
- **Runs only:** Run, Trail Run, Virtual Run; walks, rides and others are excluded
- **Activity grid** with route preview, distance and pace; paginated "Load more"
- **Distance filter:** < 5 · 5–10 · 10–21 · 21 km+ (mile buckets when imperial)
- **Multi-select**, where selection order sets sticker order
- **Random pick:** N runs (1–50, typed or stepper) from the last 1/3/6/12 months or a custom date range; respects the distance filter; re-roll
- **Metrics step:** choose route, distance, pace/speed, time, elevation, avg HR, cadence, calories, title + date. The same set applies to all selected runs and is remembered per device
- **Sticker modes:**
  - **One sticker per run:** Strava-style route (`#FC5200`, transparent) with a metrics grid underneath
  - **Separate stickers:** one per metric; Grid suggests one row per run
- **km / miles** toggle

### Platform
- Next.js 16 App Router, React 19, Tailwind 4, TypeScript, lucide-react icons
- No canvas or gesture libraries; all rendering is custom
- LAN dev origins allowed for phone testing

---

## 🔜 Next up (high value, low effort)

| Idea | Why |
|---|---|
| **Undo / redo** | The most-missed editor feature; gestures are easy to overshoot |
| **Sticker color themes** (white, black, orange, custom) | White text disappears on bright photos |
| **Route style options:** color, thickness, glow/outline, start/finish dots on or off | Match the photo's mood; make routes readable on busy backgrounds |
| **Remember last format & layout** | Fewer taps for repeat users |
| **Auto-save the draft** (IndexedDB) | Don't lose work when the app reloads, including the Strava OAuth redirect |
| **Deploy to Vercel + HTTPS domain** | Strava login on phones and the native share sheet both need it |
| **"Add to Home Screen" PWA** (manifest, icon, offline shell) | Feels like a native app on iOS and Android |
| **Empty-state polish:** hide "Choose a photo" once stickers exist | Avoid the label showing through stickers |

## 🧭 Soon (medium effort)

### Stickers & design
- **Sticker style presets:** Strava Classic, Minimal, Bold Block, Outline, Glass card
- **Custom fonts:** a few curated display fonts (condensed, mono, serif)
- **Unit labels on or off**, label casing, value-only mode
- **Text stickers:** free text (e.g. "Sub-25 5K!", "Week 12 of marathon block")
- **Date range / summary sticker:** "Oct 2026 · 18 runs · 142 km" from the selected runs
- **Splits chart sticker:** per-km pace bars
- **Elevation profile sticker**
- **Heart-rate zone bar**
- **Personal best badges** (from best efforts: 5K, 10K, half, marathon)

### Layout
- **Spacing / padding slider** for Grid and Arc
- **Alignment tools:** align left/center/right and distribute evenly for a multi-selection
- **Multi-select stickers** (long-press) without grouping everything
- **Lock sticker** so it can't be moved by accident
- **Custom shapes:** heart, number shape (e.g. "10" for a 10K), letter paths
- **Route mosaic:** fit many routes into a tight puzzle-like collage

### Photo
- **Basic adjustments:** brightness, contrast, warmth, blur, darken overlay for text legibility
- **Filters** (film, mono, high-contrast)
- **Gradient / solid background** when there's no photo
- **Multiple photos:** collage backgrounds (2-up, 3-up)

### Strava
- **Activity search** by name
- **Sort** by date, distance or pace
- **Date range in the main list**, not only for random pick
- **Sport filter toggle** to optionally include walks, hikes or rides
- **Recap modes:** "This week", "This month", "Year in review" presets that auto-select runs and pick a layout

## 🚀 Later (bigger bets)

- **Templates gallery:** one-tap full designs (photo slot + stickers + layout), shareable as links
- **Animated stories:** export MP4/WebM with the route drawing itself and stats counting up (Remotion or WebCodecs)
- **Route on map tiles:** optional satellite or street basemap behind the route (needs a map provider and attribution)
- **Photo-from-route:** auto-suggest the photo taken closest to the run's time and location from the gallery (EXIF)
- **Smart layout:** detect faces or subjects in the photo and keep stickers off them
- **Friends & clubs:** club leaderboards, group run recaps (needs Strava capacity approval)
- **Other sources:** Garmin Connect, Apple Health / HealthKit (native wrapper), GPX/FIT file upload
- **Native wrapper** (Capacitor) for direct "Share to Instagram Stories" with a sticker layer

---

## ⚙️ Tech debt & quality

- **Tests:** unit tests for `layouts.ts` (no-overlap, safe area, arc math) and `stravaStickers.ts` (polyline decode, formatting); Playwright for gestures and export
- **Split `Editor.tsx`**, now ~900 lines: gestures hook, toolbars, sheets
- **State model:** move to a reducer, which also enables undo/redo
- **Performance:** render the stage with a single `<canvas>` once sticker counts get large (30+); memoize transforms
- **Accessibility:** keyboard nudging, focus management in sheets, screen-reader labels for stickers
- **Error tracking & analytics** (privacy-friendly)
- **Rate-limit handling:** surface Strava 429s with retry-after; cache activity lists per session
- **Security:** encrypt the session cookie (iron-session / JWE) instead of plain JSON; rotate the Strava client secret (it was shared in chat during development)
- **`npm audit`** findings from existing dependencies

## 📌 Constraints to remember

- **Strava API:** a new app is limited to **1 athlete** (the owner) until a capacity increase is approved. The **callback domain** is a single host (localhost is always allowed). Data must be shown with **"Powered by Strava"** attribution, and "Strava" can't be in the app name.
- **iOS:** the canvas is limited to ~16.7 MP (export cap), and the share sheet requires HTTPS.
- **Instagram** re-compresses uploads, so 1080 px wide is the effective quality ceiling on their side.
