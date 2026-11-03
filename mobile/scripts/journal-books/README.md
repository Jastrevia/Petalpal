# Monthly journal book textures

Generated once, offline; the app only ships the outputs in `assets/bookhouse/journal/`.

1. Crop each month's spine (97 × 313 px) from `assets/bookhouse/objects.png`.
2. Upscale ×4 with Real-ESRGAN x4plus (ncnn build from the official Real-ESRGAN v0.2.5.0 release, CPU):
   `python upscaleSpineRobust.py <model dir>/realesrgan-x4plus spine-src-XX.png spine-esr-XX.png <darkened cloth colour>`
   (three passes, per-pixel median, compared against a Lanczos upscale to reject corrupted tiles).
3. `python bakeJournalBooks.py <dir with spine-src/spine-esr> ../../assets/fonts/EBGaramond-MediumItalic.ttf <out dir>`
   bakes: `spine-XX` (opaque, 30 % original grain blended back in), `cover-XX` (leather in the spine's cloth colour,
   embossed gold frame, vines, corner protectors, month title, inlaid plate of the month's own flower),
   `parchment`, `page-edges`, `leather-grain`.

Requires numpy, scipy, Pillow and ncnn. The year is lettered at runtime, so covers serve every year.

`spine-atlas.webp` (shelf): the twelve baked spines at half size, 6 × 2 cells of 194 × 626 px, Lanczos
(`Image.resize`), January top-left. The shelf draws all twelve books from this one image.
