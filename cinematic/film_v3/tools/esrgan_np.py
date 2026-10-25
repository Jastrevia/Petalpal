"""Real-ESRGAN (RRDBNet) x4 inference in pure numpy (no torch available here). Weights: official xinntao .pth files.
python esrgan_np.py in.png out.png [anime|photo]"""
import sys, zipfile, pickle, numpy as np, time, cv2
def load_pth(path):
    z = zipfile.ZipFile(path); names = z.namelist(); root = names[0].split('/')[0]
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2':
                def rb(storage, offset, size, stride, *a):
                    arr = storage[offset:offset + int(np.prod(size)) if size else offset + 1]
                    return np.lib.stride_tricks.as_strided(storage[offset:], shape=size, strides=[s * 4 for s in stride]).copy() if size else storage[offset]
                return rb
            if name in ('FloatStorage', 'HalfStorage'): return name
            if mod == 'collections' and name == 'OrderedDict':
                import collections; return collections.OrderedDict
            if mod == 'torch._utils' and name == '_rebuild_parameter':
                return lambda t, *a: t
            return super().find_class(mod, name)
        def persistent_load(self, pid):
            _, stype, key, loc, n = pid
            raw = z.read(f'{root}/data/{key}')
            return np.frombuffer(raw, np.float32 if stype == 'FloatStorage' else np.float16).astype(np.float32)
    d = U(z.open(f'{root}/data.pkl')).load()
    return d.get('params_ema', d.get('params', d))
def conv(x, w, b):            # x: C,H,W (already padded by 1), w: O,C,3,3
    C, H, W = x.shape; O = w.shape[0]
    win = np.lib.stride_tricks.sliding_window_view(x, (3, 3), axis=(1, 2))      # C,H-2,W-2,3,3
    col = win.transpose(1, 2, 0, 3, 4).reshape((H - 2) * (W - 2), C * 9)
    y = col @ w.reshape(O, C * 9).T + b
    return y.T.reshape(O, H - 2, W - 2)
def c(x, P, k): return conv(np.pad(x, ((0, 0), (1, 1), (1, 1)), mode='edge'), P[k + '.weight'], P[k + '.bias'])
lrelu = lambda x: np.where(x > 0, x, 0.2 * x)
def rrdbnet(x, P, nb):
    f = c(x, P, 'conv_first'); b = f
    for i in range(nb):
        r_in = b
        for j in (1, 2, 3):
            p = f'body.{i}.rdb{j}.'; xs = [b]
            for k in range(1, 5): xs.append(lrelu(c(np.concatenate(xs, 0), P, p + f'conv{k}')))
            b = c(np.concatenate(xs, 0), P, p + 'conv5') * 0.2 + b
        b = b * 0.2 + r_in
    f = f + c(b, P, 'conv_body')
    f = lrelu(c(f.repeat(2, 1).repeat(2, 2), P, 'conv_up1')); f = lrelu(c(f.repeat(2, 1).repeat(2, 2), P, 'conv_up2'))
    return c(lrelu(c(f, P, 'conv_hr')), P, 'conv_last')
def upscale(img, P, nb, tile=160, pad=12):
    H, W = img.shape[:2]; x = img.astype(np.float32).transpose(2, 0, 1) / 255.0; out = np.zeros((3, H * 4, W * 4), np.float32)
    t0 = time.time(); n = 0; tot = ((H + tile - 1) // tile) * ((W + tile - 1) // tile)
    for y0 in range(0, H, tile):
        for x0 in range(0, W, tile):
            ya, yb, xa, xb = max(0, y0 - pad), min(H, y0 + tile + pad), max(0, x0 - pad), min(W, x0 + tile + pad)
            o = rrdbnet(x[:, ya:yb, xa:xb], P, nb)
            oy, ox = (y0 - ya) * 4, (x0 - xa) * 4; h, w = (min(H, y0 + tile) - y0) * 4, (min(W, x0 + tile) - x0) * 4
            out[:, y0 * 4:y0 * 4 + h, x0 * 4:x0 * 4 + w] = o[:, oy:oy + h, ox:ox + w]; n += 1
            print(f'tile {n}/{tot}  {time.time() - t0:.0f}s', flush=True)
    return (np.clip(out, 0, 1).transpose(1, 2, 0) * 255 + 0.5).astype(np.uint8)
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]; kind = sys.argv[3] if len(sys.argv) > 3 else 'anime'
    P = load_pth('/mnt/user-data/outputs/film_v2/models/' + ('RealESRGAN_x4plus_anime_6B.pth' if kind == 'anime' else 'RealESRGAN_x4plus.pth'))
    nb = 6 if kind == 'anime' else 23
    im = cv2.imread(src, cv2.IMREAD_UNCHANGED); alpha = None
    if im.ndim == 3 and im.shape[2] == 4: alpha = im[..., 3]; im = im[..., :3]
    rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB); up = cv2.cvtColor(upscale(rgb, P, nb), cv2.COLOR_RGB2BGR)
    if alpha is not None: up = np.dstack([up, cv2.resize(alpha, (up.shape[1], up.shape[0]), interpolation=cv2.INTER_CUBIC)])
    cv2.imwrite(dst, up); print('wrote', dst, up.shape)
