// Must run before any Skia module defines its classes (see the polyfill).
import './src/polyfills/symbolDispose';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb';
import { configureGardenWebCanvasCache, isOwnedGardenWebView } from './src/components/garden/webCanvasCache';
import { configureGardenWebDeletedImageGuard, configureGardenWebDispose, configureGardenWebNativeOwnership, configureGardenWebRootCleanup } from './src/components/garden/webNativeHandles';

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
  .catch(error => console.error('Garden graphics initialization failed', error));
