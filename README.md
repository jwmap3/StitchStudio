# Stitch Studio

Phone-first embroidery digitizer. Trace an image into stitches by hand or automatically, then export **VP3** (Husqvarna Viking / Pfaff) or **DST** (Tajima).

**Windows PC:** from [the latest release](../../releases/latest) download `StitchStudio-Setup.exe` (installs, adds a Start-menu shortcut) or `StitchStudio-Portable.exe` (runs without installing). Windows may show "Windows protected your PC" because the app isn't code-signed: click *More info → Run anyway*.

**Any browser on a PC:** turn on GitHub Pages once (repo *Settings → Pages → Source: GitHub Actions*), then open `https://jwmap3.github.io/StitchStudio/pc.html`.

**Install on Android:** open [the latest release](../../releases/latest) on your phone, download `StitchStudio.apk`, and open it. Android will ask you to allow installs from your browser/files app the first time.

## Tools
- **Edit points**: after tracing, drag any white dot to adjust the outline (works in Pick and Draw too); in Select, tap an edge to add a point.
- **Add VP3 / DST file** (menu): opens an embroidery file into the current design as ONE layer (all its threads), kept stitch-for-stitch with jumps skipped; drag to place it, recolour any of its threads, sew it earlier/later to put it over or under other layers.
- **Transform** (Select → any layer): width/height in inches, −10% / +10% / ½ / 2×, rotate 15° or 90°, flip; or drag the blue corner on the canvas.
- **Picture**: in Select, tap the picture to select it, drag to move, drag the blue corner to resize; it has its own row in Layers with show/hide.
- **Panel**: minimise or maximise the tool panel with the arrows on its title bar.
- **Pick**: tap a colour in your picture (touching area or whole colour) to make a layer, then swipe to set the thread direction (a curved swipe makes the thread curve). Satin look or tatami, density presets down to 0.18 mm.
- **Draw → Fill**: choose a thread colour and trace around any part of the picture with your finger (or tap points); it fills with dense satin, then swipe for direction.
- **Brush**: stitch brushes. Satin, line (single or triple), fill paint, eraser, and **flow** (draw how the thread should run across a fill).
- **Draw → Satin**: centre-line with width, or **point–counterpoint** (tap alternating edges). **Draw → Line**: running or triple (bean) stitch.
- **Hoops (Designer Topaz 30)**: tap the hoop button on the canvas. Splendid Square 120×120 and Royal 360×200 (included), Crown 260×200, Jewel 240×150, metal 180×130, 100×100, or a custom size up to the machine's 360×200 mm field; landscape/portrait; fit warnings.
- **Inches**: inch grid and rulers, image and design size set in inches (menu).
- **Text**: lettering with arch (up or smile), satin-look or fill, stitch angle, and **borders**: one or two dense satin outlines in any colours (varsity look). Bundled fonts: Graduate (collegiate), Anton (condensed block), Roboto Slab — all SIL Open Font License (see web/fonts). One-tap looks: Varsity outline, Block + border, Varsity + border, Plain slab.
- **Auto**: auto-digitize into thread layers with options: 2–24 colours matched to a 60-colour thread chart (or exact image colours), or **Colours: I choose** — detect the picture's colours, add more by tapping the picture, set the thread each one becomes, or skip a colour entirely, stitch style Mixed / Satin shine / Tatami, density presets, direction (follow shape / one angle / varied), underlay, pull comp, optional thin or bold outline in any colour, quality, detail and edge smoothing, replace-or-add on re-run.
- **Thread chart & My threads**: every colour picker has "All 60 threads" with names, plus your 7 personal quick-access threads (set them in Pick → My threads → Edit). In Pick, tap one of your threads to stitch new picks in it.
- **Layers**: sew order, hide/show. Per-object angle, density, stitch length, pull compensation, underlay.
- **Realistic thread view** while you edit (sheen by stitch direction, shadows, fabric texture; toggle in the header) and **Preview** with sew-out slider, fabric colours, stitch count, trims, colours, time.

Files are saved to `Downloads/StitchStudio`.

## Desktop edition (PC)
Same engine as the phone app, with a desktop interface (`web/pc.html` + `web/js/pc.js`, packaged by `electron/`):
- Menu bar, toolbar, tool palette, docked Properties and Layers panels, inch rulers, status bar (cursor position, zoom, stitches, colours, trims, size, sew time, hoop fit).
- Layers: drag to reorder, double-click to rename, show/hide, sew first/last.
- Keyboard shortcuts (press `?` in the app), arrow-key nudging, right-click layer menu, space/middle-mouse pan, actual-size zoom.
- Drag & drop pictures, VP3/DST and projects; paste screenshots straight from the clipboard; copy/paste layers.
- **Patch maker** (M): around-the-design or circle / oval / rounded / rectangle / shield; stitched background, twill appliqué (placement line → stop → tack-down → stop → trim) or none; thick satin edge up to a 6 mm merrow look, sewn last.
- **Outline / offset** (O): run, bean or satin outline at a set distance around the whole design or one layer.
- Sew-out simulation with speed control; realistic PNG mockup export; printable production worksheet (thread sequence, stitch counts, size, hoop, time); Save / Save As to a folder you choose.

## Layout
- `web/`: the editor (HTML/JS, no dependencies). Open `web/index.html` in a browser to try it on a computer.
  - `js/stitch.js`: stitch engine (tatami, flow fill, satin, run, ties/trims) and DST/VP3 writers
  - `js/trace.js`: colour reduction and outline tracing
  - `js/app.js`: the editor UI
- `android/`: thin WebView app that packages `web/` and saves exports to Downloads.
- `electron/`: Windows desktop wrapper (installer + portable exe).
- `.github/workflows/build.yml`: on every push builds the APK and the Windows apps, publishes them to the `latest` release, and deploys the web version to GitHub Pages (if enabled).
