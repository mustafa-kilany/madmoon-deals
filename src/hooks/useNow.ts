// One shared clock for auction countdowns: a single 1-second timer for the
// whole app, running only while something on screen subscribes and paused
// while the app is in the background. Components subscribe to exactly what
// they show (TimeLeft: the text; useHasEnded: one boolean), so a grid of
// auctions redraws its countdown labels each second, never the whole screen.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now = Date.now();
  listeners.forEach(listener => listener());
}

function start() {
  if (timer || AppState.currentState === 'background') return;
  now = Date.now();
  timer = setInterval(tick, 1000);
}

function stop() {
  clearInterval(timer);
  timer = undefined;
}

AppState.addEventListener('change', state => {
  if (!listeners.size) return;
  if (state === 'active') {
    start();
    tick();
  } else if (state === 'background') {
    stop();
  }
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

const noSubscription = () => () => {};
const getNow = () => now;

/** Current time (ms), updated every second. Redraws the caller each second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getNow);
}

/** Whether `endsAt` has passed; redraws the caller only when that flips. */
export function useHasEnded(endsAt: number | undefined): boolean {
  return useSyncExternalStore(
    endsAt === undefined ? noSubscription : subscribe,
    () => endsAt !== undefined && now >= endsAt,
  );
}
