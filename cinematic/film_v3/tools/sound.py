"""Procedural sound design for PetalPal film v2 (free, synthesised; 48 kHz stereo), timed to the v2 edit.
Writes audio/sfx_proc.wav. Reused beds (score_v2, MMAudio sfx_a/sfx_b) are mixed in mix.sh."""
import numpy as np, json, wave, os
SR = 48000; DUR = 58.4; N = int(SR * DUR)
rng = np.random.default_rng(2026)
L = np.zeros(N); R = np.zeros(N)
def at(t): return int(t * SR)
def add(sig, t0, gain=1.0, pan=0.0):
    if t0 >= 10.4: t0 -= 0.5                     # V3 timeline: phone shot is 6.5 s
    i0 = at(t0); n = min(len(sig), N - i0)
    if n <= 0: return
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i0:i0 + n] += sig[:n] * gain * l * 1.414; R[i0:i0 + n] += sig[:n] * gain * r * 1.414
def env(n, a, d, shape=4.0):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * shape / d); return e
def bandnoise(n, lo, hi, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    x = r.normal(0, 1, n); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0; y = np.fft.irfft(X, n); return y / (np.abs(y).max() + 1e-9)
def bell(freq, dur=2.5, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for k, (m, a, dk) in enumerate([(1, 1.0, 1.0), (2.76, 0.45 * bright, 1.8), (5.4, 0.22 * bright, 2.6), (8.93, 0.10 * bright, 3.5)]):
        s += a * np.sin(2 * np.pi * freq * m * t + rng.uniform(0, 6.28)) * np.exp(-t * 2.2 * dk / dur * 2)
    return s * env(n, 0.004, dur, 3.0) / 1.8
def mixpad(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out
def reverb(x, secs=2.2, wet=0.35, seed=5):
    n = int(secs * SR); r = np.random.default_rng(seed); ir = r.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 6.9 / secs)
    ir[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR)); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; F = 1 << int(np.ceil(np.log2(m)))
    y = np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x) + n]
    out = np.zeros(len(x) + n); out[:len(x)] += x * (1 - wet); out += y * wet * 3; return out
def shimmer(dur, density=60, lo=2200, hi=7500, decay=0.35, ramp=(0.2, 0.7)):
    n = int(dur * SR); s = np.zeros(n); cnt = int(density * dur)
    for _ in range(cnt):
        t0 = rng.uniform(0, dur); u = t0 / dur
        w = np.clip((u - 0) / ramp[0], 0, 1) * np.clip((1 - u) / (1 - ramp[1]), 0, 1)
        f = rng.uniform(lo, hi); m = int(rng.uniform(0.08, decay) * SR); tt = np.arange(m) / SR
        g = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 18) * w * rng.uniform(0.3, 1.0)
        i0 = int(t0 * SR); k = min(m, n - i0); s[i0:i0 + k] += g[:k]
    return s / (np.abs(s).max() + 1e-9)
def whoosh(dur, f0=250, f1=2400, seed=None):
    n = int(dur * SR); x = np.random.default_rng(seed).normal(0, 1, n); out = np.zeros(n); blk = 1024
    for b in range(0, n, blk):
        u = b / n; fc = f0 * (f1 / f0) ** u; seg = x[b:b + blk + 256]
        X = np.fft.rfft(seg); f = np.fft.rfftfreq(len(seg), 1 / SR); X *= np.exp(-((np.log(f + 1) - np.log(fc)) ** 2) / (2 * 0.45 ** 2))
        y = np.fft.irfft(X, len(seg))[:blk]; out[b:b + len(y)] = y
    e = np.sin(np.pi * np.clip(np.arange(n) / n, 0, 1)) ** 1.6
    return out * e / (np.abs(out * e).max() + 1e-9)

# ----- 1. rain on the window + room tone (3.5-12.2 s; V01's own rain 0-3.5 comes from the reused bed)
rain_n = at(7.4); rain = bandnoise(rain_n, 500, 7000, 1) * 0.35 + bandnoise(rain_n, 120, 600, 2) * 0.25
for _ in range(900):                                             # droplets on glass
    i0 = int(rng.uniform(0, rain_n - 3000)); m = int(rng.uniform(300, 1500)); f = rng.uniform(1500, 5000); tt = np.arange(m) / SR
    rain[i0:i0 + m] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 300) * rng.uniform(0.1, 0.5)
fade = np.ones(rain_n); fade[:at(0.4)] = np.linspace(0, 1, at(0.4)); fade[-at(2.2):] = np.linspace(1, 0, at(2.2)) ** 1.5
add(rain * fade, 3.3, 0.16, -0.2); add(np.roll(rain, 9000) * fade, 3.3, 0.16, 0.2)
# ----- 2. phone: haptic buzz + soft PetalPal chime (notification at 4.3 s), tap at 5.65 s
for k in range(2):
    n = at(0.11); tt = np.arange(n) / SR; bz = np.sign(np.sin(2 * np.pi * 168 * tt)) * np.sin(np.pi * tt / tt[-1]) ** 0.5
    add(bandnoise(n, 100, 400, 7 + k) * 0.3 + bz * 0.25, 4.10 + k * 0.16, 0.10)
add(reverb(mixpad(bell(1318.5, 1.6) * 0.7, np.concatenate([np.zeros(at(0.12)), bell(1975.5, 1.4)]) * 0.5), 1.6, 0.4), 4.13, 0.16)
n = at(0.03); add(bandnoise(n, 1500, 6000, 9) * env(n, 0.001, 0.02, 6), 5.65, 0.10)
# ----- 3. invitation: shimmer as it glows, rising whoosh as it lifts, light flood, fairy sparkle at the cut
add(reverb(shimmer(3.2, 45, ramp=(0.35, 0.8)), 2.0, 0.45), 6.1, 0.09, 0.1)
add(whoosh(2.6, 220, 2600, 11), 6.9, 0.16)
add(reverb(shimmer(1.6, 110, 3000, 9000, ramp=(0.6, 0.85)), 2.5, 0.5), 8.9, 0.10)
add(reverb(mixpad(bell(1046.5, 2.2, 0.6) * 0.6, np.concatenate([np.zeros(at(0.09)), bell(1568, 2.0, 0.6)]) * 0.45), 2.6, 0.5), 10.48, 0.15)
# ----- 4. fairy (A01 12.2-19.2): soft wing whisper and sparkle
n = at(7.0); tt = np.arange(n) / SR; wing = bandnoise(n, 1800, 6000, 13) * (0.55 + 0.45 * np.sin(2 * np.pi * 9 * tt)) * np.clip(tt / 0.8, 0, 1) * np.clip((7 - tt) / 0.8, 0, 1)
add(wing, 10.5, 0.035, 0.15); add(reverb(shimmer(7.0, 10, ramp=(0.1, 0.9)), 2.0, 0.5), 10.5, 0.05, -0.1)
add(reverb(shimmer(3.0, 30, ramp=(0.1, 0.8)), 2.0, 0.5), 17.5, 0.07, 0.2)                            # she presents the invitation
# ----- 5. touch: warm bell chord at contact (20.8 s), rising swell into the swirl, petal whoosh
chord = sum(bell(f, 3.2, 0.5) * a for f, a in [(523.25, 1.0), (783.99, 0.7), (1174.66, 0.5), (1318.5, 0.4)])
add(reverb(chord, 3.0, 0.5), 22.1, 0.16)
add(reverb(shimmer(2.4, 80, ramp=(0.2, 0.75)), 2.5, 0.5), 22.13, 0.09)
add(whoosh(2.0, 180, 1800, 17), 22.9, 0.13)
add(whoosh(2.8, 400, 3200, 19), 24.1, 0.15, -0.3); add(whoosh(2.6, 500, 3000, 23), 24.4, 0.12, 0.3)
# ----- 6. second half accents (garden bed comes from the reused sfx_b)
add(reverb(bell(1760, 1.0, 0.7), 1.5, 0.5), 29.2, 0.05, 0.3)                                   # light over the water
add(reverb(shimmer(2.1, 22, 3500, 8000), 1.5, 0.4), 33.4, 0.05)                                # nib light
arp = np.zeros(at(1.4))
for k, f in enumerate([1046.5, 1174.66, 1318.5, 1568.0, 1760.0, 2093.0]):
    b = bell(f, 1.0, 0.7); i0 = at(0.12 * k); arp[i0:i0 + len(b)] += b[:len(arp) - i0] * 0.6
add(reverb(arp, 2.2, 0.5), 35.6, 0.14)                                                          # words become motes -> seed
add(reverb(bell(880, 1.6, 0.5), 2.0, 0.5), 37.15, 0.10)                                         # seed lands in the moss
add(reverb(shimmer(2.5, 25), 2.0, 0.5), 39.5, 0.05, 0.4)                                        # her light by the crocus
add(reverb(bell(1318.5, 1.6, 0.6), 2.0, 0.5), 42.4, 0.09, -0.2)                                 # the letter glows
n = at(1.9); tt = np.arange(n) / SR; flut = bandnoise(n, 900, 4500, 29) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 3.1 * tt))) * np.sin(np.pi * tt / tt[-1])
add(flut, 42.8, 0.05)                                                                           # paper floating down
n = at(0.25); add(bandnoise(n, 80, 900, 31) * env(n, 0.005, 0.2, 5), 44.9, 0.12)
add(reverb(bell(1568, 1.4, 0.6), 2.0, 0.5), 45.4, 0.08)                                          # the seal opens
n = at(1.2); tt = np.arange(n) / SR; add(bandnoise(n, 1200, 6000, 33) * np.sin(np.pi * tt / tt[-1]) ** 2, 46.0, 0.05)   # letter slides out               # lands in the palms
add(reverb(shimmer(2.3, 18, 3500, 8000), 1.5, 0.4), 47.2, 0.05)
add(reverb(bell(1046.5, 2.0, 0.5), 2.0, 0.5), 50.2, 0.07)                                         # morning                                  # words appear
chord2 = sum(bell(f, 3.5, 0.45) * a for f, a in [(392.0, 0.8), (587.33, 0.6), (783.99, 0.5), (1174.66, 0.35)])
add(reverb(chord2, 3.5, 0.55), 53.8, 0.12)                                                      # title
m = np.maximum(np.abs(L).max(), np.abs(R).max()); L /= m; R /= m
os.makedirs('/mnt/user-data/outputs/film_v3/audio', exist_ok=True)
pcm = (np.stack([L, R], 1) * 0.89 * 32767).astype(np.int16)
with wave.open('/mnt/user-data/outputs/film_v3/audio/sfx_proc.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote sfx_proc.wav', DUR, 's  peak normalised')
