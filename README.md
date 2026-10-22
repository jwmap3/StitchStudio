# Stitch Studio

Phone-first embroidery digitizer. Trace an image into stitches by hand or automatically, then export **VP3** (Husqvarna Viking / Pfaff) or **DST** (Tajima).

**Install on Android:** open [the latest release](../../releases/latest) on your phone, download `StitchStudio.apk`, and open it. Android will ask you to allow installs from your browser/files app the first time.

## Tools
- **Brush**: stitch brushes. Satin, line (single or triple), fill paint, eraser, and **flow** (draw how the thread should run across a fill).
- **Fill**: tap points around an area (with holes), or **Quick Draw**: tap inside a colour area of the picture and it is traced for you.
- **Satin**: centre-line with width, or **point–counterpoint** (tap alternating edges).
- **Line**: running or triple (bean) stitch.
- **Text**: lettering with arch, satin-look or fill.
- **Auto**: one-tap auto-digitize into colour layers.
- **Layers**: sew order, hide/show. Per-object angle, density, stitch length, pull compensation, underlay.
- **Preview**: realistic thread render with sew-out slider, stitch count, trims, colours, time.

Files are saved to `Downloads/StitchStudio`.

## Layout
- `web/`: the editor (HTML/JS, no dependencies). Open `web/index.html` in a browser to try it on a computer.
  - `js/stitch.js`: stitch engine (tatami, flow fill, satin, run, ties/trims) and DST/VP3 writers
  - `js/trace.js`: colour reduction and outline tracing
  - `js/app.js`: the editor UI
- `android/`: thin WebView app that packages `web/` and saves exports to Downloads.
- `.github/workflows/build-apk.yml`: builds the APK on every push and publishes it as the `latest` release.
