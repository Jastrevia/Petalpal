import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import HomeScreen from './index';

/**
 * DEV-only Onboarding Preview (/onboarding-preview).
 *
 * The real Garden screen and the real first-time tour, signed in as a synthetic preview owner
 * whose requests are answered in memory (components/onboarding/preview). No sign-in, no
 * Render, no Firebase, no database. The layout swaps in the preview shell for this route.
 */
export default function OnboardingPreviewRoute() {
  const [generation, setGeneration] = useState(0);
  if (!__DEV__) return <Redirect href="/" />;
  const { OnboardingPreviewControls } = require('../components/onboarding/preview/OnboardingPreviewControls') as
    typeof import('../components/onboarding/preview/OnboardingPreviewControls');
  return <View style={{ flex: 1 }}>
    <HomeScreen key={generation} />
    <OnboardingPreviewControls onRemount={() => setGeneration(value => value + 1)} />
  </View>;
}
