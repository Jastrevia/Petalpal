import type { CanvasKit, GrDirectContext, Surface } from 'canvaskit-wasm';

// Lossless transparent-border copies reduce decoded Garden artwork from
// ~552 MiB to ~278 MiB. V2 native assets and terrain add ~75 MiB;
// measured resident textures approach the former 384 MiB ceiling. 512 MiB
// retains headroom for render intermediates and repeated pans without evictions.
// This is a demand-filled ceiling, not an allocation or an image-retention cache.
export const GARDEN_WEB_TEXTURE_CACHE_BYTES = 512 * 1024 * 1024;

type WebCanvasKit = CanvasKit & {
  // CanvasKit's WebGL registry cleanup (present in the bundled runtime).
  deleteContext(handle: number): void;
};

export function configureGardenWebCanvasCache(kit: WebCanvasKit) {
  const makeContext = kit.MakeWebGLContext;
  const makeSurface = kit.MakeWebGLCanvasSurface;
  const surfaces = new WeakMap<object, Surface>();
  let creating: { context?: GrDirectContext; handle?: number } | undefined;
  kit.MakeWebGLContext = function (handle) {
    const context = makeContext.call(this, handle);
    context?.setResourceCacheLimitBytes(GARDEN_WEB_TEXTURE_CACHE_BYTES);
    if (creating && context) Object.assign(creating, { context, handle });
    return context;
  };

  // Skia 2.6.2 Web replaces its renderer on every canvas layout, including
  // hidden-route zero layouts, without disposing the old renderer. Own exactly
  // one surface per canvas and release its otherwise orphaned Gr context too.
  kit.MakeWebGLCanvasSurface = function (canvas, colorSpace, options) {
    const target = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    if (target) surfaces.get(target)?.delete();
    const owner: NonNullable<typeof creating> = {};
    const previous = creating;
    creating = owner;
    let surface: Surface | null;
    try {
      surface = makeSurface.call(this, canvas, colorSpace, options);
    } catch (error) {
      owner.context?.delete();
      if (owner.handle !== undefined) kit.deleteContext(owner.handle);
      throw error;
    } finally {
      creating = previous;
    }
    if (!surface) {
      owner.context?.delete();
      if (owner.handle !== undefined) kit.deleteContext(owner.handle);
      return surface;
    }
    const dispose = surface.delete.bind(surface);
    let deleted = false;
    surface.delete = () => {
      if (deleted) return;
      deleted = true;
      try { dispose(); } finally {
        owner.context?.delete();
        if (owner.handle !== undefined) kit.deleteContext(owner.handle);
        if (target && surfaces.get(target) === surface) surfaces.delete(target);
      }
    };
    if (target) surfaces.set(target, surface);
    return surface;
  };
}

type WebPicture = { dispose(): void };
type WebView = { setPicture(picture: WebPicture): void };
type WebViewApi = {
  views: Record<string, WebView>;
  deferedPictures: Record<string, WebPicture>;
  deferedOnSize: Record<string, unknown>;
  setJsiProperty?(nativeId: number, name: string, value: unknown): void;
};
const retiredGardenViews = new WeakMap<WebViewApi, Set<string>>();
const ownedGardenViews = new WeakMap<WebViewApi, Set<string>>();

export function isOwnedGardenWebView(value: unknown, nativeId: number) {
  return ownedGardenViews.get(value as WebViewApi)?.has(String(nativeId)) ?? false;
}

function gardenRetirementGate(api: WebViewApi) {
  let retired = retiredGardenViews.get(api);
  if (retired) return retired;
  retired = new Set<string>();
  retiredGardenViews.set(api, retired);
  const original = api.setJsiProperty;
  if (original) {
    const closed = retired;
    api.setJsiProperty = function (nativeId, name, value) {
      // React/Skia's asynchronous root unmount can submit its final picture
      // after the view cleanup. Do not let that resurrect a deferred picture.
      // Keep only numeric IDs here, never views, pictures or image references.
      if (name === 'picture' && closed.has(String(nativeId))) {
        (value as WebPicture).dispose();
        return;
      }
      return original.call(this, nativeId, name, value);
    };
  }
  return retired;
}

// Skia 2.6.2 Web retains registered views and replaces pictures without
// disposing them. Own only this Garden's view; other canvases stay untouched.
export function ownGardenWebView(value: unknown, nativeId: number, retire: (picture: WebPicture) => void = picture => picture.dispose()) {
  const api = value as WebViewApi | undefined;
  const id = String(nativeId);
  const view = api?.views?.[id];
  if (!api || !view) return () => {};
  const retired = gardenRetirementGate(api);
  let owned = ownedGardenViews.get(api);
  if (!owned) { owned = new Set(); ownedGardenViews.set(api, owned); }
  owned.add(id);
  retired.delete(id);
  const setPicture = view.setPicture;
  let current: WebPicture | undefined = api.deferedPictures[id];
  delete api.deferedPictures[id];
  view.setPicture = picture => {
    setPicture.call(view, picture);
    const previous = current;
    current = picture;
    if (previous && previous !== picture) retire(previous);
  };
  let released = false;
  return () => {
    if (released) return;
    released = true;
    retired.add(id);
    const last = current;
    if (last) retire(last);
    current = undefined;
    view.setPicture = setPicture;
    if (api.views[id] === view) delete api.views[id];
    const deferred = api.deferedPictures[id];
    if (deferred && deferred !== last) deferred.dispose();
    delete api.deferedPictures[id];
    delete api.deferedOnSize[id];
  };
}
