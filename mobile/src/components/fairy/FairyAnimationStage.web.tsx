import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Asset } from 'expo-asset';
import { FAIRY_ANIMATION_ASSETS, type FairyAnimationState, type FairyAnimationStageProps } from './fairyAnimationAssets';

/** Actions report their real last frame (the video's `ended`), so the tour moves on from it, never from a clock. */
export const STAGE_REPORTS_END = true;

// Web. Actions play as <video> (preloaded, restarted from frame 0 each request): VP9-alpha WebM in Chrome,
// Edge and Firefox; in WebKit (Safari, and every iOS browser), which does not draw WebM alpha, the HEVC-with-
// alpha copies the iPhone app plays (the same approved frames), decoded by the video hardware so a busy page
// cannot hold a frame back. Each action ends when its video reports `ended`. Only if a video cannot play does
// that action fall back to the animated WebP; an <img> of a URL the page has already shown continues that
// image's shared animation rather than starting over, so each play gets its own blob: URL of the once-fetched
// file, and its end is timed from its first frame. In every mode the new picture is drawn only once its first
// frame is ready, and the previous one stays until then.
type Action = Exclude<FairyAnimationState, 'idle'>;
const ACTIONS: Action[] = ['greet', 'celebrate', 'fly'];
const WEBM: Record<Action, number> = {
  greet: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.webm'),
  celebrate: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.webm'),
  fly: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.webm'),
};
const HEVC: Record<Action, number> = {
  greet: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.mov'),
  celebrate: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.mov'),
  fly: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.mov'),
};
// The tour guide's copy, made at the 370 px it is drawn (as on iPhone).
const HEVC_FLY_GUIDE = { video: require('@/assets/garden/fairy/onboarding-suite/fairy-fly-guide.mov'), pixelHeight: 370 };
const uri = (module: number) => Asset.fromModule(module).uri;

const webkit = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return iOS || (/Safari\//.test(ua) && !/(Chrome|Chromium|Edg|OPR|Firefox|Android)/.test(ua));
})();
function videoSource(action: Action, height: number) {
  if (!webkit) return uri(WEBM[action]);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return uri(action === 'fly' && height * dpr <= HEVC_FLY_GUIDE.pixelHeight ? HEVC_FLY_GUIDE.video : HEVC[action]);
}

const blobs = new Map<Action, Promise<Blob>>();
function webpBlob(action: Action) {
  let blob = blobs.get(action);
  if (!blob) {
    blob = fetch(uri(FAIRY_ANIMATION_ASSETS[action].webp)).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
    blob.catch(() => blobs.delete(action));
    blobs.set(action, blob);
  }
  return blob;
}

const HOVER_STYLE_ID = 'petalpal-fairy-hover-style';
function ensureHoverStyle() {
  if (typeof document === 'undefined' || document.getElementById(HOVER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOVER_STYLE_ID;
  style.textContent = `
    @keyframes petalpal-fairy-float {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
      100% { transform: translateY(0px); }
    }
    .petalpal-fairy-hover-anim { animation: petalpal-fairy-float 2.6s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

const layer = (visible: boolean): CSSProperties => ({
  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
  backgroundColor: 'transparent', display: 'block', pointerEvents: 'none',
  opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden',
});

export function FairyAnimationStage({ play, loop, reduced, onStart, onEnd, height }: FairyAnimationStageProps) {
  const wanted = play.state === 'idle' ? 'idle' : `${play.state}:${play.id}`;
  const [onScreen, setOnScreen] = useState<string | null>(wanted === 'idle' ? 'idle' : null);
  if (wanted === 'idle' && onScreen !== 'idle') setOnScreen('idle');
  const [noVideo, setNoVideo] = useState<ReadonlySet<Action>>(() => new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const liveUrls = useRef(urls);
  liveUrls.current = urls;
  const videos = useRef(new Map<Action, HTMLVideoElement | null>());
  const wantedAction = play.state === 'idle' ? null : play.state;
  const shownAction = onScreen && onScreen !== 'idle' ? onScreen.split(':')[0] as Action : null;
  const resting = onScreen === 'idle' || onScreen === null;

  useEffect(ensureHoverStyle, []);

  const shown = (key: string) => { if (key !== wanted) return; setOnScreen(key); onStart(play.id); };
  const ended = (action: Action) => { if (action === wantedAction && !loop) onEnd?.(play.id); };
  // A WebP fallback cannot report its last frame: end it its natural length after its first frame showed.
  const webpEnd = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(webpEnd.current), [wanted]);
  const videoFailed = (action: Action) => setNoVideo(set => new Set(set).add(action));

  // Start the wanted action from its first frame; freeze every other video where it is.
  useEffect(() => {
    for (const [action, video] of videos.current) {
      if (!video) continue;
      if (action !== wantedAction || noVideo.has(action)) { video.pause(); continue; }
      video.muted = true;
      video.currentTime = 0;
      const playing = video.play();
      playing?.catch?.(() => videoFailed(action));
    }
  }, [wanted, noVideo]);

  // WebP plays: a fresh blob: URL per request, released once that play is off screen.
  useEffect(() => {
    if (!wantedAction || !noVideo.has(wantedAction) || urls[wanted]) return;
    let live = true;
    webpBlob(wantedAction).then(blob => {
      if (live) setUrls(all => ({ ...all, [wanted]: URL.createObjectURL(blob) }));
    }, () => { if (live) setOnScreen('idle'); }); // she rests; the controller's grace timer finishes the action
    return () => { live = false; };
  }, [wanted, noVideo]);
  useEffect(() => {
    const keep = new Set([wanted, onScreen]);
    const stale = Object.keys(urls).filter(key => !keep.has(key));
    if (!stale.length) return;
    stale.forEach(key => URL.revokeObjectURL(urls[key]));
    setUrls(all => Object.fromEntries(Object.entries(all).filter(([key]) => keep.has(key))));
  }, [wanted, onScreen, urls]);
  useEffect(() => () => { Object.values(liveUrls.current).forEach(url => URL.revokeObjectURL(url)); }, []);


  const imageKeys = [onScreen, wanted].filter((key, i, all): key is string =>
    !!key && key !== 'idle' && all.indexOf(key) === i && noVideo.has(key.split(':')[0] as Action) && !!urls[key]);

  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    className={resting && !reduced ? 'petalpal-fairy-hover-anim' : undefined}>
    <img src={uri(FAIRY_ANIMATION_ASSETS.idle.webp)} alt="" style={layer(resting)} />
    {ACTIONS.filter(action => !noVideo.has(action)).map(action => <video
      key={action}
      ref={video => { videos.current.set(action, video); }}
      src={videoSource(action, height)}
      preload="auto"
      playsInline
      muted
      loop={action === wantedAction && loop}
      onPlaying={() => { if (action === wantedAction) shown(wanted); }}
      onEnded={() => ended(action)}
      onError={() => videoFailed(action)}
      style={layer(shownAction === action && (onScreen === wanted || action !== wantedAction))}
    />)}
    {imageKeys.map(key => <img key={key} src={urls[key]} alt=""
      onLoad={() => {
        if (key !== wanted) return;
        shown(key);
        const action = key.split(':')[0] as Action;
        clearTimeout(webpEnd.current);
        if (!loop) webpEnd.current = setTimeout(() => ended(action), FAIRY_ANIMATION_ASSETS[action].durationMs);
      }} onError={() => { if (key === wanted) setOnScreen('idle'); }}
      style={layer(onScreen === key)} />)}
  </div>;
}
