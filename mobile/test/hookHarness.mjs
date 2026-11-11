export function hookHarness(context = () => null) {
  const slots = [];
  let cursor = 0, dirty = false, renderSource, latest;
  const pending = [];
  const changed = (before, after) => !before || !after || before.length !== after.length ||
    before.some((value, i) => !Object.is(value, after[i]));
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => context(),
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) {
        slots[i] = { value: typeof initial === 'function' ? initial() : initial };
        slots[i].set = (next) => {
          const value = typeof next === 'function' ? next(slots[i].value) : next;
          if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
        };
      }
      return [slots[i].value, slots[i].set];
    },
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!previous || changed(previous.deps, deps)) {
        const slot = slots[i] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
      }
    },
  };
  const harness = {
    react,
    mount(fn) { renderSource = fn; return harness.render(); },
    render() {
      cursor = 0; dirty = false; latest = renderSource();
      while (pending.length) pending.shift()();
      return latest;
    },
    async flush() {
      for (let i = 0; i < 20; i++) {
        if (dirty) harness.render();
        await new Promise((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error('Source hooks did not settle');
    },
  };
  return harness;
}
