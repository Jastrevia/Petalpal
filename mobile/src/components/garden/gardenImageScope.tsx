import { loadData, Skia, useImage, type DataSourceParam, type SkData, type SkImage } from '@shopify/react-native-skia';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// One decode per image per Garden. The water field, the submerged rocks and the ripples each asked for the same
// shore and wet masks, and every lotus of a kind for its own copy, so the first load fetched and decoded them two to
// four times (about 4 MB extra on the web, and the same decodes and textures again on a phone).
//
// The cache lives with one Garden's scene (a provider inside its canvas), never across Gardens: when a Garden root
// unmounts, its drawn images are released (webNativeHandles.ts), so an image shared with another Garden — a
// friend's Garden opened over your own — would be released under the one still open. Within a Garden, a shared
// image stays alive while any user holds it, as each separate copy did.
type Entry = { promise: Promise<SkImage | null>; image: SkImage | null; users: number };
type Scope = Map<unknown, Entry>;
const ImageScope = createContext<Scope | null>(null);

const decode = (data: SkData) => Skia.Image.MakeImageFromEncoded(data);

export function GardenImageScope({ children }: { children: ReactNode }) {
  const [scope] = useState<Scope>(() => new Map());
  return <ImageScope.Provider value={scope}>{children}</ImageScope.Provider>;
}

// Drop-in for Skia's useImage: null until decoded, then the image. Outside a GardenImageScope it loads its own copy.
export function useGardenImage(source: DataSourceParam): SkImage | null {
  const scope = useContext(ImageScope);
  // Without a scope this is exactly Skia's useImage (and tests that stand in for useImage keep working).
  const own = useImage(scope ? null : source);
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    let live = true;
    if (!scope) return () => { live = false; };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Garden: no source clears the shared image (scoped image cache)
    if (source === null || source === undefined) { setImage(null); return () => { live = false; }; }
    let entry = scope.get(source);
    if (!entry) {
      const created: Entry = { image: null, users: 0, promise: loadData(source, decode).then(value => { created.image = value; return value; }) };
      entry = created;
      scope.set(source, entry);
    }
    entry.users++;
    const held = entry;
    if (held.image) setImage(held.image);
    else void held.promise.then(value => { if (live) setImage(value); });
    return () => {
      live = false;
      held.users--;
      // Forgotten by the scope, not disposed: users still drawing it keep it alive, as before.
      if (held.users <= 0 && scope.get(source) === held) scope.delete(source);
    };
  }, [scope, source]);
  return scope ? image : own;
}
