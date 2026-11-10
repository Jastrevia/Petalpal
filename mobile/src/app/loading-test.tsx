import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { PigeonLoadingScreen } from '../components/loading/PigeonLoadingExperience';

// DEV-only preview of the Letterwing loading screen; production builds send it to the Garden.
export default function LoadingTestPage() {
  useEffect(() => { if (__DEV__) void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;
  return <LoadingTestPreview />;
}

function LoadingTestPreview() {
  const [mode, setMode] = useState<'interactive' | '0' | '25' | '50' | '75' | '100' | 'indeterminate'>('50');
  const [progress, setProgress] = useState<number | null>(0.5);

  const selectMode = (m: typeof mode, p: number | null) => {
    setMode(m);
    setProgress(p);
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <Pressable onPress={() => selectMode('0', 0)} style={[styles.btn, mode === '0' && styles.btnActive]}>
          <Text style={styles.btnText}>0%</Text>
        </Pressable>
        <Pressable onPress={() => selectMode('25', 0.25)} style={[styles.btn, mode === '25' && styles.btnActive]}>
          <Text style={styles.btnText}>25%</Text>
        </Pressable>
        <Pressable onPress={() => selectMode('50', 0.5)} style={[styles.btn, mode === '50' && styles.btnActive]}>
          <Text style={styles.btnText}>50%</Text>
        </Pressable>
        <Pressable onPress={() => selectMode('75', 0.75)} style={[styles.btn, mode === '75' && styles.btnActive]}>
          <Text style={styles.btnText}>75%</Text>
        </Pressable>
        <Pressable onPress={() => selectMode('100', 1.0)} style={[styles.btn, mode === '100' && styles.btnActive]}>
          <Text style={styles.btnText}>100%</Text>
        </Pressable>
        <Pressable onPress={() => selectMode('indeterminate', null)} style={[styles.btn, mode === 'indeterminate' && styles.btnActive]}>
          <Text style={styles.btnText}>Indeterminate</Text>
        </Pressable>
      </View>
      <View style={styles.preview}>
        <PigeonLoadingScreen
          progress={progress}
          message={`Loading PetalPal… (${progress !== null ? Math.round(progress * 100) + '%' : 'Indeterminate'})`}
          hint="Letterwing guiding progress"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eff4e9' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd', zIndex: 10 },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#eee' },
  btnActive: { backgroundColor: '#5AA4AB' },
  btnText: { fontSize: 13, fontWeight: 'bold', color: '#333' },
  preview: { flex: 1 },
});
