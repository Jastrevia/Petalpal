import type {FairyAssets} from './fairyRuntime';

/** Byte-identical copy of Resources/icon/fairy.png, the authoritative reference.
 * This is the complete sheet, NOT extracted poses or animation frames. */
export const FAIRY_ASSETS:FairyAssets={
  reference:{source:require('../../../assets/garden/fairy/reference/fairy.webp'),
    geometry:{width:1448,height:1086,anchorX:.5,anchorY:1}},
  animations:{},
};
