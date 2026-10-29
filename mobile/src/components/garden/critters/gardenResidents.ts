// What the Garden's animals know about each other (plain module state, JS thread): which lawn
// each lawn animal and the butterfly are on, so no two share one, and when the bluebird and the
// butterfly are in the air, so they never fly at the same time. The bluebird's flights are also
// announced, so the puppy can chase it.
import type { Point } from '../fairy/walkNetwork';

export type Flight = { start: number; end: number; to: Point };
export const residents = {
  lawns: {} as Partial<Record<'rabbit' | 'hedgehog' | 'butterfly', number>>,
  bird: null as Flight | null,
  butterfly: null as Flight | null,
};

const birdListeners = new Set<(flight: Flight) => void>();
export function announceBirdFlight(flight: Flight) {
  residents.bird = flight;
  birdListeners.forEach(listener => listener(flight));
}
export function onBirdFlight(listener: (flight: Flight) => void) {
  birdListeners.add(listener);
  return () => { birdListeners.delete(listener); };
}

// Whether `who` would share the sky with the other flyer at `now` (Garden clock seconds).
export function skyTaken(who: 'bird' | 'butterfly', now: number) {
  const other = who === 'bird' ? residents.butterfly : residents.bird;
  return Boolean(other && now < other.end);
}
