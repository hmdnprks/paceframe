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
- **Presets:** Stack, Corner (Strava style), Grid, Arc, Timeline, Bottom bar, Circle, Hero, Scatter
- **Grid:** 1–8 columns, updates live
- **Arc:** stickers per arc, bend slider from ∪ to ∩ (±240°), tilt along the curve, inner arcs for overflow
- **Timeline:** stickers in order along a line with node dots, vertical or horizontal, optional zigzag (auto-on for more than 8 stops); the line is a generated sticker that moves and exports with the group
- **Scatter:** random tilt with **no overlaps**, auto-shrinks to fit
- **Honeycomb:** offset rows packed like a honeycomb, adjustable columns, no overlaps
- **Spiral:** first sticker in the center, winding outward; sizes grow along the spiral or follow run distance; optional dotted path
- **Shape from image:** upload a logo or silhouette (e.g. a hand sign) and stickers take its shape
  - The shape is detected on-device, from transparency or by separating it from a plain background; **Invert** swaps shape and background
  - **Fill** spreads stickers evenly inside the shape (thin parts like fingers included), **Outline** places them along its edge, with no overlaps
  - Optional faint **silhouette** behind the stickers
- All layouts stay inside **Instagram's safe area**
- **Groups:** a layout groups its stickers. Drag, pinch, rotate or recenter the whole group; ungroup to edit one sticker; "Group all" to regroup
- Re-layout (e.g. changing columns) keeps the group where you placed it
- **Edit one sticker inside a group:** double-tap it to select just that sticker (move, delete, recolor) without ungrouping; **Re-arrange** re-applies the layout to fill gaps
- **Swap run:** replace the run in any Strava sticker with another run; it keeps its spot, size, design and color

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
- **Training timeline:** pick a date range (e.g. a 19-week block from Jun 14 to race week)
  - **One stop per week:** week number and dates, total distance, run count, long run, and the long run's route. Race week (Strava "Race" workout type) gets an orange RACE pill plus race name, distance and time. Empty weeks show as "Rest"; empty trailing weeks are dropped
  - **One stop per run:** all runs in range, oldest first, with your chosen metrics (adds a **Date** metric)
  - **Race finale:** choose the hero run (auto-picks the run marked as Race in Strava; the longest runs are suggested first). It's shown big at the end of the line with route, metrics, title and a RACE pill, and the RACE badge follows your pick
- **Race badge** on per-run stickers for activities marked as Race
- Big batches (more than 10 runs) skip per-activity detail requests to stay within Strava rate limits
- **Race result:** pick a run (races and the longest runs listed first, or the run selected in the grid)
  - **Finisher card:** FINISHER (+ optional PR) badges, race name (wraps to 2 lines), date, big finish time, route, and up to 6 **chosen metrics** (distance, avg pace, avg/max HR, elevation, cadence, calories, moving/elapsed time; only ones with data are offered)
  - **Edit card in place:** select the card, or its group, and tap **Edit card** to change metrics, finish time or PR; it re-renders keeping position, width and rotation
  - **Goal vs actual:** "GOAL 2:30:00 → FINISHED 2:26:10" with a margin badge: orange "−3:50 under goal", or grey "+6:10 over goal"
  - Finish time can be **Elapsed** (closest to chip time) or **Moving**; both stickers are stacked automatically and stay movable
- **Then vs Now:** pick an older and a recent run (searches the last 12 months; similar-distance runs within ±15% are suggested for "then")
  - Compare **pace**, **time**, **distance** or **avg HR**; the difference badge is orange when improved ("−1:25 /km · 21% faster") and grey otherwise
  - THEN / NOW stickers: label + month, route, the compared value large, distance · time
  - **Versus** layout: one sticker per half and the badge on the divider
- **Routes only** sticker mode: bold route outlines, no text, oldest first
  - **Constellation:** routes in a Honeycomb (columns picked to fill the Story)
  - **Spiral of runs:** oldest in the center, longer runs bigger, with a dotted spiral path
  - Runs without GPS are skipped; **Select all shown** in the run grid selects every run in the current filter
- **Route colors:** Solid, **Gradient** (along each route start → finish, or across runs from first to last) or **Multi-color** (one color per run)
  - Pick from 12 preset swatches and 8 gradient presets, the native color picker, a hex input, or **From photo** (tap the background photo to sample a color)
  - Apply to the selected sticker or group, or to all routes; new Strava stickers use the current colors; remembered per device
  - Strava stickers are re-drawn sharply from their recipe; gallery PNGs (e.g. saved from Strava) get their orange pixels recolored, always from the original
- **Text style:** size S/M/L/XL (relative to the route), metrics layout **Row / Stack / Side** (route beside the stacked metrics), font (Geist, Bebas Neue, Oswald, Space Mono, Playfair), and color (presets, picker, hex, from photo); apply to the selection or all Strava stickers, remembered and used for new stickers; fonts load only when picked
- **Split background:** one photo, **side by side**, or **top & bottom**, with a white divider; each half has its own photo that you pan and pinch separately; export clips each photo to its half at full quality
- **km / miles** toggle

### Platform
- Next.js 16 App Router, React 19, Tailwind 4, TypeScript, lucide-react icons
- No canvas or gesture libraries; all rendering is custom
- LAN dev origins allowed for phone testing
- **Installable PWA:** web app manifest, app icons (any + maskable + Apple touch icon), standalone full-screen, dark theme color
  - Service worker: the editor works offline (cached app shell and build assets); Strava API calls always go to the network
  - Install banner: native **Install** button on Android/Chrome, "Share → Add to Home Screen" how-to on iOS; dismissible

---

## 🎬 Story styles by use case

Ready-made story **styles**: one tap picks the runs, the stickers and the layout for a goal. **Effort:** 🟢 mostly reuses what's built · 🟡 needs new stickers or data · 🔴 new subsystem.

### 1. "Look how far I've come": showing improvement over time

| Style | What it shows | Effort |
|---|---|---|
| **Then vs Now** | Two runs side by side: "Jan · 6:45 /km" vs "Oct · 5:20 /km", with a big orange delta badge ("−1:25 /km") | ✅ **Shipped**, with split photos |
| **Pace trend line** | A line chart of average pace (or distance) per week or month over the block, with the best point highlighted | 🟡 chart sticker |
| **Same route, faster** | Every run on one recurring route (e.g. your Sunday loop), stacked oldest to newest with the time shrinking each time; the route is drawn once | 🟡 match runs by route similarity |
| **PR ladder** | Personal bests as steps (5K → 10K → HM → FM) or one distance's PRs over time (28:10 → 25:42 → 23:58) | 🟡 Strava best efforts API |
| **Weekly volume bars** | Weekly km as vertical bars across the training block (taper visible), with the race week in orange | 🟡 bar chart sticker; data already in Training timeline |
| **Training timeline + trend** | Existing timeline with a small sparkline or "+38% volume" badge per phase (Base / Build / Peak / Taper) | 🟢 extends Timeline |
| **Before/after photo split** | Two photos (first run vs latest), each with its stats sticker | ✅ **Shipped** (part of Then vs Now; split also available from the Photo button) |
| **Streak / consistency** | "24 weeks in a row" with a GitHub-style calendar heatmap of run days | 🟡 heatmap sticker; Strava streak data |

### 2. "I did it!": showing the race result

| Style | What it shows | Effort |
|---|---|---|
| **Finisher card** | Big finish time, race name, distance, avg pace, the route, and a FINISHER / PR badge, in the style of a finisher certificate | ✅ **Shipped** |
| **Medal frame** | Your medal or bib photo as background, stats arranged around it (Frame layout) | 🟢 needs the Frame layout |
| **Splits story** | Per-km splits as bars (negative split highlighted), fastest and slowest km labeled | 🟡 splits from activity detail |
| **Race profile** | Elevation profile with the "wall" (e.g. km 30–35) marked and pace overlaid | 🟡 activity streams API |
| **Goal vs actual** | "Goal 2:00:00 → Finished 1:57:42" with the margin highlighted; the user types the goal | ✅ **Shipped** |
| **Road to race** | Training timeline ending in the race finale (**shipped**), plus total block stats (19 weeks · 712 km · 84 runs) as a header | 🟢 add a summary header |
| **HR / effort zones** | Time in each heart-rate zone as a stacked bar | 🟡 zones + streams API |
| **Animated finish** | The route draws itself, then the time counts up to the finish time (video export) | 🔴 animated export |

### 3. "Look at all my runs": showing multiple runs creatively

| Style | What it shows | Effort |
|---|---|---|
| **Route constellation** | Every route as a small outline, no text, arranged in a grid or honeycomb; it reads like a pattern or art piece | ✅ **Shipped** |
| **Route overlay** | All routes drawn on top of each other at true geographic scale (thin, semi-transparent), showing your "home turf" heatmap | 🟡 shared-projection overlay sticker |
| **Shape from image** | Runs filling a logo, number or silhouette (**shipped**); add text-to-shape (e.g. your bib number or "21K") | 🟢 shipped; text-to-shape is 🟡 |
| **Calendar month** | A month grid with each day's run route in its cell and rest days blank | 🟡 Calendar layout |
| **Distance number** | Runs fill the outline of the total, e.g. "142" km for the month | 🟡 Number layout |
| **Year in review / wrapped** | Total km, runs, longest run, fastest pace, favorite day and time of day, top route; one hero stat per sticker in a bold layout | 🟡 aggregate stats stickers |
| **Spiral of runs** | Oldest runs in the center, newest outside, sized by distance | ✅ **Shipped** |
| **Collage of photos** | Runs that have Strava photos shown as polaroids with mini stats | 🔴 Strava photos API + multi-photo |
| **Random memory** | "5 random runs from this year" (**shipped**: Random pick) in Scatter or Polaroid style | 🟢 shipped; add a polaroid frame style |

### Suggested build order
1. ~~**Finisher card** and **Goal vs actual**~~ ✅ shipped
2. **Weekly volume bars** (~~Then vs Now~~ ✅ shipped): the clearest "improvement" story; the data is already loaded.
3. **Year in review** (~~Route constellation~~ and ~~Spiral~~ ✅ shipped): a high-shareability "creative" style.
4. **Splits story**, **Race profile** and **Pace trend line**: one chart-sticker engine powers all three.

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
| ~~**"Add to Home Screen" PWA**~~ ✅ shipped (temporary icon until the real logo is ready) | Feels like a native app on iOS and Android |
| **Empty-state polish:** hide "Choose a photo" once stickers exist | Avoid the label showing through stickers |

## 🧭 Soon (medium effort)

### Stickers & design
- **Sticker style presets:** Strava Classic, Minimal, Bold Block, Outline, Glass card
- ~~**Custom fonts**~~ ✅ shipped (Text style)
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
- **Route mosaic:** fit many routes into a tight puzzle-like collage
- **Shape from image extras:** draw a shape with your finger, text-to-shape (type "42K" or a name), a mix of fill and outline, a tolerance slider for busy photos, and AI subject cut-out to take the shape from a real photo (e.g. yourself mid-stride)
- **Keep-clear box:** drag a box over the photo (face, medal, finish banner) and every layout avoids it

### More layout shapes
_Running-specific_
- **Number:** stickers fill the outline of a distance, e.g. "5", "10", "21", "42"
- **Calendar:** a Mon–Sun grid with each run on its day and rest days left blank (weekly or monthly recaps)
- **Podium / staircase:** stickers step up by distance or pace, a "getting faster" story
- **Track oval:** stickers around a 400m-track loop, for interval and track sessions
- **Timeline extras:** spacing proportional to real dates, phase labels (Base, Build, Peak, Taper), a weekly-km bar beside each stop

_Expressive_
- **Heart:** stickers along a heart outline
- **Wave:** a sine-wave row with adjustable height and wave count
- **Diagonal / zigzag:** a slanted line across the frame for a "speed" feel

_Practical_
- **Frame / border:** stickers around the edges, keeping the middle (you) clear
- **Split:** top and bottom bands only, for selfies and portraits
- **Masonry:** uneven-height columns for mixed route and metric stickers
- **Sorted grid:** order by date, distance or pace instead of tap order

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
- **Share target:** "Share → Paceframe" from Photos or Strava straight into the editor (Android; needs a service-worker POST handler)
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
