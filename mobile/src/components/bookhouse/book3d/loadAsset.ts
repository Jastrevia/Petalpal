import { Image, Platform } from 'react-native';
import { Skia, type SkData } from '@shopify/react-native-skia';

// Loading a bundled file (a require() result) into Skia without `loadData`: that helper is not part of every build of
// @shopify/react-native-skia (a project's web build may keep it private), so the Treehouse resolves the file's URI itself,
// exactly as Skia's own loaders do on each platform, and reads it with Skia.Data.fromURI, which every build provides.

/** A bundled file: a number on iOS and Android, `{ uri }` (images) or a URL string (fonts) on the web. */
export type AssetSource = number | string | { uri?: string; default?: string } | null | undefined;

type RegisteredAsset = { httpServerLocation: string; name: string; type: string };

/** The file's URI: iOS/Android through React Native's asset resolver; the web from the bundle's own URL. */
export function assetUri(source: AssetSource): string | null {
  if (source === null || source === undefined) return null;
  if (typeof source === 'string') return source;
  if (typeof source === 'number') {
    if (Platform.OS !== 'web') return Image.resolveAssetSource(source)?.uri ?? null;
    // A numeric asset on the web: the bundler's asset registry (the one Expo's Metro config registers assets in).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const registry = require('@react-native/assets-registry/registry') as { getAssetByID: (id: number) => RegisteredAsset | undefined };
    const asset = registry.getAssetByID(source);
    return asset ? `${asset.httpServerLocation}/${asset.name}.${asset.type}` : null;
  }
  return source.uri ?? source.default ?? null;
}

/** Reads a bundled file and builds a Skia object from its bytes (an image, a typeface); null if it cannot be read. */
export async function loadAsset<T>(source: AssetSource, make: (data: SkData) => T | null): Promise<T | null> {
  const uri = assetUri(source);
  if (!uri) return null;
  try {
    return make(await Skia.Data.fromURI(uri));
  } catch {
    return null;
  }
}
