import { create } from 'zustand';

export interface Toast { id: number; tone: 'success' | 'error' | 'info'; text: string }
interface ToastState { toasts: Toast[]; push: (tone: Toast['tone'], text: string) => void; dismiss: (id: number) => void }

let tid = 0;
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (tone, text) => {
    const id = ++tid;
    set({ toasts: [...get().toasts, { id, tone, text }].slice(-4) });
    setTimeout(() => get().dismiss(id), 3800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (t: string) => useToasts.getState().push('success', t),
  error: (t: string) => useToasts.getState().push('error', t),
  info: (t: string) => useToasts.getState().push('info', t),
};
