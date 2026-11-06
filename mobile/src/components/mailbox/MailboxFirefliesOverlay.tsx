import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'petalpal-fireflies-style';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      @keyframes mailboxFireflyFloatA {
        0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.85; }
        50% { transform: translate(12px, -18px) scale(1.18); opacity: 0.35; }
      }
      @keyframes mailboxFireflyFloatB {
        0%, 100% { transform: translate(0, 0) scale(0.9); opacity: 0.40; }
        50% { transform: translate(-16px, -14px) scale(1.25); opacity: 0.95; }
      }
      @keyframes mailboxFireflyFloatC {
        0%, 100% { transform: translate(0, 0) scale(1.1); opacity: 0.90; }
        50% { transform: translate(8px, 15px) scale(0.85); opacity: 0.45; }
      }
      .mailbox-firefly-a { animation: mailboxFireflyFloatA 4.8s ease-in-out infinite; }
      .mailbox-firefly-b { animation: mailboxFireflyFloatB 5.6s ease-in-out infinite; }
      .mailbox-firefly-c { animation: mailboxFireflyFloatC 6.2s ease-in-out infinite; }
    `;
    document.head.appendChild(styleEl);
  }
}

interface FireflyCoord {
  id: number;
  top: number | string;
  left: number | string;
  size: number;
  animClass: string;
}

const FIREFLIES: FireflyCoord[] = [
  { id: 1, top: '14%', left: '18%', size: 6, animClass: 'mailbox-firefly-a' },
  { id: 2, top: '22%', left: '78%', size: 7, animClass: 'mailbox-firefly-b' },
  { id: 3, top: '38%', left: '12%', size: 5, animClass: 'mailbox-firefly-c' },
  { id: 4, top: '48%', left: '88%', size: 6, animClass: 'mailbox-firefly-a' },
  { id: 5, top: '65%', left: '22%', size: 7, animClass: 'mailbox-firefly-b' },
  { id: 6, top: '72%', left: '74%', size: 5, animClass: 'mailbox-firefly-c' },
  { id: 7, top: '82%', left: '44%', size: 6, animClass: 'mailbox-firefly-a' },
];

export const MailboxFirefliesOverlay = memo(function MailboxFirefliesOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {FIREFLIES.map((f) => (
        <View
          key={f.id}
          style={[
            styles.fireflyHalo,
            {
              top: f.top as any,
              left: f.left as any,
              width: f.size * 3.5,
              height: f.size * 3.5,
            },
            Platform.OS === 'web' ? ({ className: f.animClass } as any) : {},
          ]}
        >
          <View
            style={[
              styles.fireflyCore,
              {
                width: f.size,
                height: f.size,
                borderRadius: f.size / 2,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  fireflyHalo: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 215, 95, 0.16)',
    ...Platform.select({
      web: {
        filter: 'blur(2px)',
      },
    }),
  },
  fireflyCore: {
    backgroundColor: '#FFF2A8',
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px 3px rgba(255, 205, 70, 0.92)',
      },
    }),
  },
});

export default MailboxFirefliesOverlay;
