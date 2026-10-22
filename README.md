# Stitch Studio

Phone-first embroidery digitizer. Trace an image into stitches by hand or automatically, then export **VP3** (Husqvarna Viking / Pfaff) or **DST** (Tajima).

**Install on Android:** open [the latest release](../../releases/latest) on your phone, download `StitchStudio.apk`, and open it. Android will ask you to allow installs from your browser/files app the first time.

## Tools
- **Pick**: tap a colour in your picture (touching area or whole colour) to make a layer, then swipe to set the thread direction (a curved swipe makes the thread curve). Satin look or tatami, density presets down to 0.18 mm.
- **Draw → Fill**: choose a thread colour and trace around any part of the picture with your finger (or tap points); it fills with dense satin, then swipe for direction.
- **Brush**: stitch brushes. Satin, line (single or triple), fill paint, eraser, and **flow** (draw how the thread should run across a fill).
- **Draw → Satin**: centre-line with width, or **point–counterpoint** (tap alternating edges). **Draw → Line**: running or triple (bean) stitch.
- **Hoops (Designer Topaz 30)**: tap the hoop button on the canvas. Splendid Square 120×120 and Royal 360×200 (included), Crown 260×200, Jewel 240×150, metal 180×130, 100×100, or a custom size up to the machine's 360×200 mm field; landscape/portrait; fit warnings.
- **Inches**: inch grid and rulers, image and design size set in inches (menu).
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
