import { apiRequest } from '../services/api';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useAuth } from '../services/auth';
import { discardRecording, transcribeRecording } from '../services/speech';

type Phase = 'idle' | 'preparing' | 'recording' | 'transcribing';
const MAX_SECONDS = 180;
export function useEventVoiceInput(content: string, setContent: (text: string) => void, saving: boolean, maxLength = 4000, inputName = 'Event') {
  const { session } = useAuth();
  const finished = useRef<() => void>(() => {});
  const webMimeType = Platform.OS === 'web' && typeof MediaRecorder !== 'undefined' &&
    !MediaRecorder.isTypeSupported('audio/webm') ? 'audio/mp4' : 'audio/webm';
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000,
    web: { mimeType: webMimeType, bitsPerSecond: 64000 } }, status => {
    if (status.isFinished) finished.current();
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [overflow, setOverflow] = useState('');
  const live = useRef({ content, setContent, saving });
  live.current = { content, setContent, saving };
  const operation = useRef(0);
  const preparation = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const currentPhase = useRef<Phase>('idle');
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPhase = (next: Phase) => { currentPhase.current = next; if (mounted.current) setPhase(next); };
  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  async function cleanup() {
    try { await recorder.stop(); } catch { /* Not prepared or already stopped. */ }
    if (recorder.uri) await discardRecording(recorder.uri).catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }
  async function cancel() {
    const id = ++operation.current; clearTimer(); abort.current?.abort();
    setCurrentPhase('preparing');
    await preparation.current;
    await cleanup();
    if (id === operation.current) setCurrentPhase('idle');
  }
  useEffect(() => {
    mounted.current = true;
    setCurrentPhase('idle');
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active' && currentPhase.current !== 'idle') void cancel();
    });
    return () => {
      mounted.current = false; operation.current++; clearTimer(); abort.current?.abort(); listener.remove();
      void (async () => { await preparation.current; await cleanup(); })();
    };
  }, []);
  const owner = useRef(session?.user.id);
  useEffect(() => {
    if (owner.current !== session?.user.id) {
      owner.current = session?.user.id;
      setError(''); setOverflow('');
      void cancel();
    }
  }, [session?.user.id]);

  async function done() {
    if (currentPhase.current !== 'recording') return;
    const id = operation.current;
    clearTimer(); setCurrentPhase('transcribing');
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 95_000);
    try {
      if (recorder.getStatus().isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (id !== operation.current) return;
      if (!recorder.uri) throw new Error('No recording was captured. Please try again.');
      const transcript = await transcribeRecording(recorder.uri, controller.signal);
      if (id !== operation.current) return;
      if (!transcript) throw new Error('No speech was detected. Please try again.');
      const draft = live.current.content;
      const combined = draft + (draft && !/\s$/.test(draft) ? '\n' : '') + transcript;
      live.current.setContent(combined.slice(0, maxLength));
      if (combined.length > maxLength) {
        setOverflow(combined.slice(maxLength));
        setError(`The ${inputName} reached ${maxLength} characters. Remaining transcript is shown below so you can copy or edit it.`);
      }
    } catch (err) {
      if (id === operation.current) setError((err as Error).name === 'AbortError'
        ? `Transcription timed out. Please try again or type your ${inputName}.` : (err as Error).message);
    } finally {
      clearTimeout(timeout);
      if (id === operation.current) { await cleanup(); setCurrentPhase('idle'); }
    }
  }
  async function prepare() {
    if (currentPhase.current !== 'idle' || live.current.saving || !session) return;
    const id = ++operation.current;
    setCurrentPhase('preparing'); setError(''); setOverflow(''); setSeconds(0);
    try {
      // In-app browsers (WeChat, some social apps) cannot record audio at all.
      if (Platform.OS === 'web' && (typeof MediaRecorder === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)) {
        throw new Error(`This browser can’t record audio. Open PetalPal in Safari or Chrome to speak, or type your ${inputName}.`);
      }
      const consent = await apiRequest<{aiProcessing:boolean}>(`/users/${session.user.id}/ai-consent`);
      // New accounts start with AI off, so this is the usual reason voice "doesn't work" for them.
      if (!consent.aiProcessing) throw new Error(`Voice input uses AI (Cloudflare Workers AI) to turn speech into text, so AI Processing must be on. Turn it on in Me → Settings → AI & privacy, then tap the microphone again. You can also type your ${inputName}.`);
      if (id !== operation.current) return;
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (id !== operation.current) return;
      if (!permission.granted) throw new Error(`Microphone permission is needed for voice input. You can still type your ${inputName}.`);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (id !== operation.current) { await cleanup(); return; }
      recorder.record(Platform.OS === 'web' ? undefined : { forDuration: MAX_SECONDS });
      setCurrentPhase('recording');
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        if (elapsed >= MAX_SECONDS && recorder.getStatus().isRecording) void done();
      }, 250);
    } catch (err) {
      if (id === operation.current) { setError((err as Error).message); await cleanup(); setCurrentPhase('idle'); }
    }
  }
  finished.current = () => { if (currentPhase.current === 'recording') void done(); };
  function start() {
    if (currentPhase.current !== 'idle') return Promise.resolve();
    const pending = prepare(); preparation.current = pending;
    return pending;
  }
  return { phase, seconds, error, overflow, active: phase !== 'idle', start, done, cancel };
}
