import React, { useCallback, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';
import GardenScene, {
  type GardenSceneHandle,
  type MailboxInteractionPhase,
} from './GardenScene';
import type { WaterfallVersion } from './waterfallV2Placement';
import FlowerDensitySandbox from './flower-density-sandbox/FlowerDensitySandbox';
import ProductionGrowthQA from './planting/ProductionGrowthQA';

export type GardenExperienceMode = 'development' | 'player';

export interface GardenExperienceProps {
  mode: GardenExperienceMode;
  initialWaterfallVersion?: WaterfallVersion;
  gardenOwnerUserId?: string;
}

export type GardenExperienceHandle = GardenSceneHandle;

const GardenExperience = forwardRef<GardenExperienceHandle, GardenExperienceProps>(
  function GardenExperience(
    { mode, initialWaterfallVersion = 'v2', gardenOwnerUserId },
    ref
  ) {
    const isDev = mode === 'development';
    const gardenRef = useRef<GardenSceneHandle>(null);
    useImperativeHandle(ref, () => gardenRef.current as GardenSceneHandle, []);

    const [treehouseState, setTreehouseState] = useState<'outside' | 'inside' | 'exiting'>('outside');
    const [showDensitySandbox, setShowDensitySandbox] = useState(false);
    const [showProductionQA, setShowProductionQA] = useState(false);

    // ── Mailbox Interaction State Machine ──
    // Phases: 'idle' | 'walking' | 'retrieving' | 'transitioning'
    const [mailboxPhase, setMailboxPhase] = useState<MailboxInteractionPhase>('idle');
    const mailboxPhaseRef = useRef<MailboxInteractionPhase>('idle');
    mailboxPhaseRef.current = mailboxPhase;
    const isNavigatingRef = useRef(false);

    // When returning to Garden from /mailbox:
    useFocusEffect(
      useCallback(() => {
        // If returning after mailbox handoff, return fairy to idle standing beside mailbox
        if (isNavigatingRef.current || mailboxPhaseRef.current === 'transitioning') {
          gardenRef.current?.returnFromMailbox();
          isNavigatingRef.current = false;
          setMailboxPhase('idle');
          mailboxPhaseRef.current = 'idle';
        }
      }, [])
    );

    const handleMailboxPhaseChange = useCallback((phase: MailboxInteractionPhase) => {
      setMailboxPhase(phase);
      mailboxPhaseRef.current = phase;
    }, []);

    // Completion callback from GardenFairy:
    // Triggered after letter presentation and 800ms hold are completely finished
    const handleMailboxOpened = useCallback(() => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      setMailboxPhase('transitioning');
      mailboxPhaseRef.current = 'transitioning';

      // Navigate to /mailbox using Expo Router
      router.push('/mailbox');
    }, []);

    if (isDev && showProductionQA) {
      return (
        <GestureHandlerRootView style={styles.root}>
          <ProductionGrowthQA onClose={() => setShowProductionQA(false)} />
        </GestureHandlerRootView>
      );
    }

    return (
      <GestureHandlerRootView style={styles.root}>
        {isDev && showDensitySandbox ? (
          <FlowerDensitySandbox onClose={() => setShowDensitySandbox(false)} />
        ) : (
          <>
            <GardenScene
              ref={gardenRef}
              mode={mode}
              initialWaterfallVersion={initialWaterfallVersion}
              enableFairyWalk
              onTreehouseEntered={() => setTreehouseState('inside')}
              onTreehouseExited={() => setTreehouseState('outside')}
              onMailboxOpened={handleMailboxOpened}
              onMailboxPhaseChange={handleMailboxPhaseChange}
              gardenOwnerUserId={gardenOwnerUserId}
            />

            {/* Developer-only floating sandbox and test buttons */}
            {isDev && (
              <>
                {treehouseState !== 'outside' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Return from treehouse"
                    disabled={treehouseState === 'exiting'}
                    style={[styles.sandboxButton, { top: 152 }]}
                    onPress={() => {
                      if (gardenRef.current?.returnFromTreehouse()) setTreehouseState('exiting');
                    }}
                  >
                    <Text style={styles.sandboxLabel}>
                      {treehouseState === 'exiting' ? 'Returning to Garden…' : 'Return from treehouse'}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Visit Garden Mailbox"
                  style={[styles.sandboxButton, { top: 12 }]}
                  onPress={() => {
                    if (gardenRef.current?.isMailboxBusy()) return;
                    gardenRef.current?.visitMailbox();
                  }}
                >
                  <Text style={styles.sandboxLabel}>
                    {mailboxPhase === 'walking'
                      ? 'Fairy walking to mailbox…'
                      : mailboxPhase === 'retrieving'
                        ? 'Retrieving letter…'
                        : mailboxPhase === 'transitioning'
                          ? 'Opening mailbox…'
                          : 'Visit Mailbox 📬'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.sandboxButton, { top: 58 }]}
                  onPress={() => setShowDensitySandbox(true)}
                >
                  <Text style={styles.sandboxLabel}>Flower Density Sandbox</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.sandboxButton, { top: 104 }]}
                  onPress={() => setShowProductionQA(true)}
                >
                  <Text style={styles.sandboxLabel}>Production Growth QA</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </GestureHandlerRootView>
    );
  }
);

export default GardenExperience;

const styles = StyleSheet.create({
  root: { flex: 1 },
  sandboxButton: {
    position: 'absolute',
    right: 154,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#365b42',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3edda',
    zIndex: 20,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sandboxLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
