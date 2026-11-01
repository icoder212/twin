import type { KeyValueStore } from '@twindesk/core';

/**
 * Web Storage adapters. Every access is guarded: storage can be disabled, full or blocked in
 * private windows and embedded iframes, and the app must keep working when it is.
 */
function wrap(getStorage: () => Storage): KeyValueStore {
  return {
    get(key) {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        getStorage().setItem(key, value);
      } catch {
        // Ignore quota and access errors.
      }
    },
    remove(key) {
      try {
        getStorage().removeItem(key);
      } catch {
        // Ignore access errors.
      }
    },
  };
}

/** Cleared when the tab closes. Used for the demo backend's data. */
export const sessionStore = wrap(() => window.sessionStorage);

/** Survives restarts. Only for non-sensitive preferences such as the colour scheme. */
export const preferenceStore = wrap(() => window.localStorage);
