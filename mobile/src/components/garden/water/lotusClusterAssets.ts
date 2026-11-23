export type LotusClusterVariant =
  | 'triple_a'
  | 'wide_a'
  | 'large_a'
  | 'pair_a'
  | 'dual_a'
  | 'trio_b'
  | 'single_a'
  | 'single_b';

export type LotusClusterSource = {
  static: number;
  swayA: number;
  swayB: number;
  width: number;
  height: number;
};

export const LOTUS_CLUSTER_ASSETS: Record<LotusClusterVariant, LotusClusterSource> = {
  triple_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_triple_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_triple_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_triple_a_sway_b.png'),
    width: 167,
    height: 114,
  },
  wide_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_wide_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_wide_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_wide_a_sway_b.png'),
    width: 181,
    height: 105,
  },
  large_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_large_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_large_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_large_a_sway_b.png'),
    width: 163,
    height: 113,
  },
  pair_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_pair_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_pair_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_pair_a_sway_b.png'),
    width: 141,
    height: 143,
  },
  dual_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_dual_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_dual_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_dual_a_sway_b.png'),
    width: 120,
    height: 95,
  },
  trio_b: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_trio_b_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_trio_b_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_trio_b_sway_b.png'),
    width: 186,
    height: 119,
  },
  single_a: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_single_a_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_single_a_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_single_a_sway_b.png'),
    width: 92,
    height: 66,
  },
  single_b: {
    static: require('@/assets/garden/water/lotus-clusters/lotus_single_b_static.webp'),
    swayA: require('@/assets/garden/water/lotus-clusters/lotus_single_b_sway_a.png'),
    swayB: require('@/assets/garden/water/lotus-clusters/lotus_single_b_sway_b.png'),
    width: 81,
    height: 60,
  },
};
