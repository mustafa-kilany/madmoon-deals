// Global toast queue, matching the prototype's showToast: a short message
// that auto-dismisses after ~2.6 s. Call `toast.success(t('…'))` from anywhere.

import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'error';
export type ToastMessage = { id: number; message: string; tone: ToastTone };

const TOAST_DURATION_MS = 2600;

type ToastState = {
  toasts: ToastMessage[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, tone = 'success') => {
    const id = nextId++;
    set(state => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS);
  },
  dismiss: id =>
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (message: string) =>
    useToastStore.getState().show(message, 'success'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
  error: (message: string) =>
    useToastStore.getState().show(message, 'error'),
};
