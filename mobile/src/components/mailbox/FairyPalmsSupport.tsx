import { memo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

const FAIRY_PALMS_ASSET = require('../../../assets/mailbox/fairy_palms_foreground.webp');

interface FairyPalmsSupportProps {
  isReadingMode?: boolean;
  floatOffset?: number;
}

export const FairyPalmsSupport = memo(function FairyPalmsSupport({
  isReadingMode = false,
  floatOffset = 0,
}: FairyPalmsSupportProps) {
  return (
    <View
      style={[
        styles.handsLayerContainer,
        {
          opacity: isReadingMode ? 0.70 : 0.95,
          transform: [
            { translateY: isReadingMode ? 22 : floatOffset * 0.35 },
          ],
        },
      ]}
      pointerEvents="none"
    >
      {/* ── Soft Ethereal Palms Glow ── */}
      <View style={styles.palmsGlowAura} />

      {/* ── Graceful First-Person Fairy Hands Foreground Layer ── */}
      <Image
        source={FAIRY_PALMS_ASSET}
        style={styles.fairyPalmsImage}
        resizeMode="contain"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  handsLayerContainer: {
    position: 'absolute',
    bottom: -15,
    left: 0,
    right: 0,
    height: 195,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  fairyPalmsImage: {
    width: '100%',
    height: '100%',
    maxWidth: 500,
  },
  palmsGlowAura: {
    position: 'absolute',
    bottom: 25,
    width: 260,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 240, 200, 0.16)',
    ...Platform.select({
      web: {
        filter: 'blur(20px)',
      },
    }),
  },
});

export default FairyPalmsSupport;
