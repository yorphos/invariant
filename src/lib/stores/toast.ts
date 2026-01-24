/**
 * Toast Notification Store
 * 
 * Provides a global toast notification system for user feedback.
 * Replaces alert() dialogs with non-blocking notifications.
 */

import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  dismissible: boolean;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function addToast(
    message: string,
    type: ToastType = 'info',
    options: { duration?: number; dismissible?: boolean } = {}
  ): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = options.duration ?? (type === 'error' ? 8000 : 5000);
    const dismissible = options.dismissible ?? true;

    const toast: Toast = { id, type, message, duration, dismissible };

    update(toasts => [...toasts, toast]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }

    return id;
  }

  function dismiss(id: string) {
    update(toasts => toasts.filter(t => t.id !== id));
  }

  function clear() {
    update(() => []);
  }

  return {
    subscribe,
    success: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
      addToast(message, 'success', options),
    error: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
      addToast(message, 'error', options),
    warning: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
      addToast(message, 'warning', options),
    info: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
      addToast(message, 'info', options),
    dismiss,
    clear
  };
}

export const toasts = createToastStore();
