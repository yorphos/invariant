import { writable } from 'svelte/store';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
  category: 'navigation' | 'action' | 'general';
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function getShortcutId(shortcut: Pick<Shortcut, 'key' | 'ctrl' | 'alt' | 'shift'>): string {
  return [
    shortcut.ctrl ? 'Ctrl' : null,
    shortcut.alt ? 'Alt' : null,
    shortcut.shift ? 'Shift' : null,
    normalizeKey(shortcut.key)
  ]
    .filter(Boolean)
    .join('+');
}

export function formatShortcut(shortcut: Pick<Shortcut, 'key' | 'ctrl' | 'alt' | 'shift'>): string {
  return [
    shortcut.ctrl ? 'Ctrl' : null,
    shortcut.alt ? 'Alt' : null,
    shortcut.shift ? 'Shift' : null,
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  ]
    .filter(Boolean)
    .join('+');
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  return (
    normalizeKey(event.key) === normalizeKey(shortcut.key) &&
    event.ctrlKey === !!shortcut.ctrl &&
    event.altKey === !!shortcut.alt &&
    event.shiftKey === !!shortcut.shift &&
    !event.metaKey
  );
}

function createKeyboardStore() {
  const { subscribe, update } = writable<Shortcut[]>([]);

  return {
    subscribe,
    register: (shortcut: Shortcut) => {
      const normalizedShortcut = {
        ...shortcut,
        key: normalizeKey(shortcut.key)
      };
      const shortcutId = getShortcutId(normalizedShortcut);

      update((shortcuts) => [
        ...shortcuts.filter((existing) => getShortcutId(existing) !== shortcutId),
        normalizedShortcut
      ]);

      return shortcutId;
    },
    unregister: (key: string) =>
      update((shortcuts) =>
        shortcuts.filter(
          (shortcut) => getShortcutId(shortcut) !== key && normalizeKey(shortcut.key) !== normalizeKey(key)
        )
      ),
    clear: () => update(() => [])
  };
}

export const keyboardStore = createKeyboardStore();
