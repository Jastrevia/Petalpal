// Must run before any Skia module defines its classes (see the polyfill).
import './src/polyfills/symbolDispose';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb';
import { configureGardenWebCanvasCache, isOwnedGardenWebView } from './src/components/garden/webCanvasCache';
import { configureGardenWebDeletedImageGuard, configureGardenWebDispose, configureGardenWebNativeOwnership, configureGardenWebRootCleanup } from './src/components/garden/webNativeHandles';

// Boot screen (public/index.html): put its wingbeat and waiting dots on the page clock (performance.now), the clock the
// app's loading screen (PigeonLoadingExperience) uses too, so they continue unbroken when React takes over. It runs here,
// first thing in the bundle, because the page may load scripts only from /_expo/ (no inline or other script files).
(function syncBootScreenClock() {
  const boot = typeof document !== 'undefined' && document.getElementById('pp-boot'); if (!boot) return;
  const now = performance.now() / 1000;
  const delays = { '.strip': now % 5.1667, '.bob': now % 5.2 };
  for (const selector in delays) { const element = boot.querySelector(selector); if (element) element.style.animationDelay = -delays[selector] + 's'; }
  // The waiting dots pulse one after another (0.2 s apart) on the same 1.2 s cycle as React's.
  boot.querySelectorAll('.dot').forEach((dot, i) => { dot.style.animationDelay = (-(now % 1.2) + i * 0.2) + 's'; });
})();

LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })
  .then(() => {
    configureGardenWebCanvasCache(globalThis.CanvasKit);
    // Configure before the public entry binds useImage's encoded-image factory.
    const { Skia } = require('@shopify/react-native-skia/lib/module/skia/Skia');
    // Exact Web classes from the pinned Skia 2.6.2 dependency.
    const { JsiSkPaint } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkPaint');
    const { JsiSkPictureRecorder } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkPictureRecorder');
    const { JsiSkRuntimeEffect } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkRuntimeEffect');
    const { JsiSkImage } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkImage');
    configureGardenWebNativeOwnership(JsiSkPaint.prototype, [
      // MakeVertices: the Garden walkers' skinned meshes, rebuilt every frame.
      [Skia, ['Paint', 'PictureRecorder', 'MakeVertices']],
      [JsiSkPictureRecorder.prototype, ['finishRecordingAsPicture']],
      [JsiSkPaint.prototype, ['copy']],
      [Skia.Path, ['MakeFromSVGString']],
      [Skia.Image, ['MakeImageFromEncoded']],
      [Skia.MaskFilter, ['MakeBlur']],
      [Skia.Shader, ['MakeLinearGradient', 'MakeRadialGradient', 'MakeSweepGradient', 'MakeTwoPointConicalGradient', 'MakeBlend']],
      [Skia.ColorFilter, ['MakeMatrix', 'MakeCompose', 'MakeBlend']],
      [Skia.ImageFilter, ['MakeBlur', 'MakeDropShadow', 'MakeCompose']],
      [JsiSkRuntimeEffect.prototype, ['makeShader', 'makeShaderWithChildren']],
      [JsiSkImage.prototype, ['makeShaderOptions', 'makeShaderCubic']],
    ]);
    // Belt and braces for Symbol.dispose mismatches: dispose() falls back to the
    // key the class was defined with, then to deleting the native handle.
    const { BaseHostObject } = require('@shopify/react-native-skia/lib/module/skia/web/Host');
    const { JsiSkFontMgr } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkFontMgr');
    configureGardenWebDispose([BaseHostObject.prototype, JsiSkFontMgr.prototype]);
    // A released image (another Garden root closing mid-frame) skips one draw instead of crashing.
    const { JsiSkCanvas } = require('@shopify/react-native-skia/lib/module/skia/web/JsiSkCanvas');
    configureGardenWebDeletedImageGuard(JsiSkCanvas.prototype, JsiSkImage.prototype,
      () => Skia.Shader.MakeColor(Skia.Color('transparent')));
    const { SkiaSGRoot } = require('@shopify/react-native-skia/lib/module/sksg/Reconciler');
    configureGardenWebRootCleanup(SkiaSGRoot.prototype, nativeId => isOwnedGardenWebView(globalThis.SkiaViewApi, nativeId));
    return require('expo-router/entry');
  })
  .catch(error => {
    console.error('Garden graphics initialization failed', error);
    // The boot loading screen (public/index.html) is still up: say so and offer a reload
    // instead of leaving the bar waiting forever.
    const message = typeof document !== 'undefined' && document.getElementById('pp-boot-message');
    if (message) {
      message.textContent = 'PetalPal couldn\u2019t start. ';
      const retry = document.createElement('a');
      retry.href = ''; retry.textContent = 'Reload';
      retry.onclick = event => { event.preventDefault(); window.location.reload(); };
      message.appendChild(retry);
    }
  });
