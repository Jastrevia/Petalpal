type NativeHandle = { delete(): void; isDeleted(): boolean };
type NativeOwner = { ref: NativeHandle };
type HandleRegistry = {
  register(owner: object, handle: NativeHandle, token: object): void;
  unregister(token: object): boolean;
};
type RegistryFactory = (release: (handle: NativeHandle) => void) => HandleRegistry;
type Method = (this: NativeOwner, ...args: unknown[]) => unknown;
const configured = new WeakSet<object>();
const rootsConfigured = new WeakSet<object>();

type ImageNode = { props?: { image?: unknown; gardenImageReferences?: readonly unknown[] }; children?: ImageNode[] };
type GardenRoot = { container: {
  nativeId: number; root: ImageNode[]; unmounted?: boolean;
  mapperId?: number | null; redraw?(): void;
} };

// GC can lag behind a rapid re-login. Release Garden's drawn image handles only
// after the pinned Web reconciler confirms its root has completely unmounted.
// This leaves route blur, mounted trees and unrelated canvases untouched.
export function configureGardenWebRootCleanup(
  prototype: { unmount(this: GardenRoot): Promise<unknown> },
  isGarden: (nativeId: number) => boolean,
) {
  if (rootsConfigured.has(prototype)) return;
  rootsConfigured.add(prototype);
  const unmount = prototype.unmount;
  prototype.unmount = function () {
    if (!isGarden(this.container.nativeId)) return unmount.call(this);
    const handles = new Set<NativeHandle>();
    const visit = (nodes: ImageNode[]) => {
      for (const node of nodes) {
        // Cached vector pictures retain the same decoded sources without
        // individual image nodes. Retire those sources with their owning root.
        const images = [node.props?.image, ...(node.props?.gardenImageReferences ?? [])];
        for (const value of images) {
          const image = value as { __typename__?: string; ref?: NativeHandle } | undefined;
          if (image?.__typename__ === 'Image' && image.ref) handles.add(image.ref);
        }
        if (node.children) visit(node.children);
      }
    };
    visit(this.container.root);
    const result = unmount.call(this);
    // 2.6.2's Container.unmount only sets a flag. ReanimatedContainer.redraw
    // stops its mapper before checking that flag, without recording a picture.
    // Stop it now so no scheduled animation replay can use retired image refs.
    if (this.container.unmounted && 'mapperId' in this.container) this.container.redraw?.();
    return result.then(result => {
      for (const handle of handles) if (!handle.isDeleted()) handle.delete();
      handles.clear();
      return result;
    });
  };
}

// Skia 2.6.2 Web HostObjects do not finalize their Embind handles. Garden
// replay creates temporary paints, clip paths, shaders and filters every frame;
// useImage also leaves decoded native images alive after its JS owner unmounts.
// Tie each native handle to its JS owner's lifetime, keeping pooled/live objects
// alive. Native paints/pictures retain their own references to shader/filter data.
// This shim is installed only by the Web bootstrap; native Skia is untouched.
export function configureGardenWebNativeOwnership(
  paintPrototype: object,
  factories: ReadonlyArray<readonly [unknown, readonly string[]]>,
  makeRegistry?: RegistryFactory,
) {
  if (configured.has(paintPrototype)) return;
  if (!makeRegistry && typeof FinalizationRegistry === 'undefined') return;
  configured.add(paintPrototype);
  const registry = (makeRegistry ?? (release => new FinalizationRegistry(release)))(handle => {
    if (!handle.isDeleted()) handle.delete();
  });
  const own = (value: unknown) => {
    const owner = value as NativeOwner | null;
    if (owner?.ref && typeof owner.ref.delete === 'function' && typeof owner.ref.isDeleted === 'function') {
      registry.unregister(owner);
      registry.register(owner, owner.ref, owner);
    }
    return value;
  };
  const prototype = paintPrototype as Record<string, Method>;
  for (const name of ['assign', 'reset']) {
    const original = prototype[name];
    if (typeof original !== 'function') continue;
    prototype[name] = function (...args) {
      const previous = this.ref;
      const result = original.apply(this, args);
      // assign/reset replace ref in 2.6.2 without deleting the old native Paint.
      // Transfer ownership only after success; failed calls retain the old ref.
      if (previous !== this.ref) {
        registry.unregister(this);
        if (!previous.isDeleted()) previous.delete();
        own(this);
      }
      return result;
    };
  }
  for (const [value, names] of factories) {
    if (!value || typeof value !== 'object') continue;
    const factory = value as Record<string, Method>;
    for (const name of names) {
      const original = factory[name];
      if (typeof original !== 'function') continue;
      factory[name] = function (...args) {
        return own(original.apply(this, args));
      };
    }
  }
}

// Skia 2.6.2 Web dispose() calls this[Symbol.dispose](). If Symbol.dispose was
// missing or replaced after a class loaded, that lookup fails. Try the current
// symbol, then the key an undefined symbol produces, then delete the handle.
export function configureGardenWebDispose(prototypes: readonly object[]) {
  for (const prototype of prototypes) {
    const target = prototype as { dispose?: (this: object) => void };
    if (configured.has(target)) continue;
    configured.add(target);
    target.dispose = function (this: object) {
      const owner = this as Record<PropertyKey, unknown> & { ref?: Partial<NativeHandle> | null };
      for (const key of [Symbol.dispose, 'undefined'] as PropertyKey[]) {
        const method = key === undefined ? undefined : owner[key];
        if (typeof method === 'function') { method.call(owner); return; }
      }
      if (owner.ref && typeof owner.ref.delete === 'function' && !owner.ref.isDeleted?.()) owner.ref.delete();
    };
  }
}

// Safety net: an image released by another Garden root (a friend's Garden closing, a remount
// racing a frame) must cost at most one missing image for one frame, never a page crash
// ("Cannot pass deleted object as a pointer of type Image const*"). Draws of a released image
// are skipped, and its shaders become transparent. Counted in globalThis.__gardenSkippedImages.
type CanvasLike = Record<string, Method>;
export function configureGardenWebDeletedImageGuard(canvasPrototype: object, imagePrototype: object,
  transparentShader: () => unknown) {
  if (configured.has(canvasPrototype)) return;
  configured.add(canvasPrototype);
  const released = (value: unknown) => {
    const ref = (value as NativeOwner | null | undefined)?.ref;
    return !!ref && typeof ref.isDeleted === 'function' && ref.isDeleted();
  };
  const skipped = () => {
    const scope = globalThis as { __gardenSkippedImages?: number };
    scope.__gardenSkippedImages = (scope.__gardenSkippedImages ?? 0) + 1;
  };
  const canvas = canvasPrototype as CanvasLike;
  for (const name of ['drawImage', 'drawImageRect', 'drawImageCubic', 'drawImageOptions', 'drawImageNine',
    'drawImageRectCubic', 'drawImageRectOptions', 'drawAtlas']) {
    const original = canvas[name];
    if (typeof original !== 'function') continue;
    canvas[name] = function (this: NativeOwner, ...args) {
      if (released(args[0])) { skipped(); return undefined; }
      return original.apply(this, args);
    };
  }
  const image = imagePrototype as CanvasLike;
  // Skia's ImageShader reads the size before it makes the shader; a released image reads as
  // 1×1 (finite maths) and the shader below then comes back transparent.
  for (const name of ['width', 'height']) {
    const original = image[name];
    if (typeof original !== 'function') continue;
    image[name] = function (this: NativeOwner, ...args) {
      if (released(this)) { skipped(); return 1; }
      return original.apply(this, args);
    };
  }
  for (const name of ['makeShaderOptions', 'makeShaderCubic']) {
    const original = image[name];
    if (typeof original !== 'function') continue;
    image[name] = function (this: NativeOwner, ...args) {
      if (released(this)) { skipped(); return transparentShader(); }
      return original.apply(this, args);
    };
  }
}
