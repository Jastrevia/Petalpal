import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useFairyRuntime } from '../../../services/fairyRuntime';
import type { FairyHandle } from './GardenFairy';
import { FIRST_STROLL_MS, RETRY_MS, RUNTIME_WAIT_MS, scheduleAction, scheduleRest, standableNodes, wanderPause, wanderTarget } from './fairySchedule';
import { isGardenGroundBlocked } from './gardenGround';
import { WALK_NETWORK } from './walkNetwork';

const NOWHERE = { x: -1e9, y: -1e9 };
// Dry-ground path points only: never the stepping stones in the pond or the flower beds.
const STANDABLE = standableNodes(WALK_NETWORK.nodes, isGardenGroundBlocked);

// Drives the Garden Fairy from her server-side day (fairySchedule.ts) once a second. Returns the
// call the Garden makes whenever the user sends her somewhere, which holds the schedule off a minute.
export function useFairySchedule(fairyRef: RefObject<FairyHandle | null>, enabled: boolean) {
  const runtime = useFairyRuntime();
  // No day to follow (no first flower yet, offline, guest) or a state this build does not know: she strolls.
  const rest = !enabled ? null : (runtime?.gardenSchedule === true && scheduleRest(runtime.currentState)) || 'path';
  const memory = useRef({ placed: false, startedAt: 0, userAt: 0, idleSince: 0, pauseMs: wanderPause(Math.random), retryAt: 0, lastState: '' });
  const restRef = useRef(rest); restRef.current = rest;
  const hasDay = useRef(false); hasDay.current = runtime?.gardenSchedule === true;
  useEffect(() => { if (!rest) memory.current.placed = false; }, [rest]);
  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const fairy = fairyRef.current, current = restRef.current;
      if (!fairy || !current) return;
      const m = memory.current, now = Date.now(), navState = fairy.getState();
      // Opening the Garden: give her day a moment to arrive, so she appears where she should be.
      m.startedAt ||= now;
      if (!m.placed && !hasDay.current && now - m.startedAt < RUNTIME_WAIT_MS) return;
      if (navState !== m.lastState) {
        if (navState === 'idle' && m.lastState) { m.idleSince = now; m.pauseMs = wanderPause(Math.random); }
        m.lastState = navState;
      }
      const action = scheduleAction({ rest: current, navState,
        placed: m.placed, now, userAt: m.userAt, idleSince: m.idleSince, pauseMs: m.pauseMs, retryAt: m.retryAt });
      let started: boolean;
      if (action === 'place') {
        started = fairy.place(current, current === 'path' ? wanderTarget(STANDABLE, NOWHERE, Math.random, [0, Infinity]) ?? undefined : undefined);
        m.placed = started; m.idleSince = now; m.pauseMs = FIRST_STROLL_MS;
      } else if (action === 'go') {
        started = current === 'tea' ? fairy.visitTea() : current === 'swing' ? fairy.visitSwing() : fairy.visitMoonBed();
      } else if (action === 'wander') {
        // Dry ground only; a point she cannot reach right now is retried with another.
        started = false;
        for (let attempt = 0; attempt < 5 && !started; attempt++) {
          const target = wanderTarget(STANDABLE, fairy.getPosition(), Math.random);
          started = !!target && fairy.move(target);
        }
      } else return;
      if (!started) m.retryAt = now + RETRY_MS;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [rest, fairyRef]);
  return useCallback(() => { memory.current.userAt = Date.now(); }, []);
}
