// The Flower Language Collection's 26 flower illustrations, keyed by the collection's imageFile
// names (flowerLanguageCollection.json). Each is one painted middle cluster with transparency:
// the Garden's medium clusters (assets/garden/flower-clusters/<id>-m.webp), and for the three
// flowers the Garden does not grow (Rose, Tumi, White Magnolia) the same middle cluster cut from
// their delivered sheets into assets/reflection/flowers/.
export const FLOWER_ASSETS: Record<string, number> = {
  // Happy
  'Coreopsis.png': require('../../assets/garden/flower-clusters/coreopsis-m.webp'),
  'Daisy.png': require('../../assets/garden/flower-clusters/daisy-m.webp'),
  'Gerbera Daisy.png': require('../../assets/garden/flower-clusters/gerbera-daisy-m.webp'),
  'Sunflower.png': require('../../assets/garden/flower-clusters/sunflower-m.webp'),

  // Anger & Frustration
  'Gentian.png': require('../../assets/garden/flower-clusters/gentian-m.webp'),
  'Petunia.png': require('../../assets/garden/flower-clusters/petunia-m.webp'),
  'Poppy.png': require('../../assets/garden/flower-clusters/poppy-m.webp'),

  // Anxiety & Stress & Fear
  'Chamomile.png': require('../../assets/garden/flower-clusters/chamomile-m.webp'),
  'Snowdrop.png': require('../../assets/garden/flower-clusters/snowdrop-m.webp'),

  // Calm & Peace
  'Chinese-Violet-Cress.png': require('../../assets/garden/flower-clusters/chinese-violet-cress-m.webp'),
  'Lavender.png': require('../../assets/garden/flower-clusters/lavender-m.webp'),
  'Olive.png': require('../../assets/garden/flower-clusters/olive-m.webp'),
  'white-Magnolia.png': require('../../assets/reflection/flowers/white-magnolia.webp'),

  // Love & Caring & Gratitude
  'Hydrangea.png': require('../../assets/garden/flower-clusters/hydrangea-m.webp'),
  'Rose.png': require('../../assets/reflection/flowers/rose.webp'),

  // Sadness & Loneliness
  'Anemone.png': require('../../assets/garden/flower-clusters/anemone-m.webp'),
  'Bluebell.png': require('../../assets/garden/flower-clusters/bluebell-m.webp'),
  'Heather.png': require('../../assets/garden/flower-clusters/heather-m.webp'),
  'Tumi.png': require('../../assets/reflection/flowers/tumi.webp'),

  // Surprise & Excitement & Curiosity
  'Bird of Paradise.png': require('../../assets/garden/flower-clusters/bird-of-paradise-m.webp'),
  'Tulip.png': require('../../assets/garden/flower-clusters/tulip-m.webp'),
  'White-Rose.png': require('../../assets/garden/flower-clusters/white-rose-m.webp'),
  'Yellow-Daffodil.png': require('../../assets/garden/flower-clusters/yellow-daffodil-m.webp'),

  // Tiredness, Numbness, Confusion
  'Aster.png': require('../../assets/garden/flower-clusters/aster-m.webp'),
  'Dandelion.png': require('../../assets/garden/flower-clusters/dandelion-m.webp'),
  'Yellow-Rapeseed-Flower.png': require('../../assets/garden/flower-clusters/yellow-rapeseed-flower-m.webp'),
};
