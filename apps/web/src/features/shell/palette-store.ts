import { create } from 'zustand';

export const usePaletteStore = create<{
  open: boolean;
  initial: string;
  show: (initial?: string) => void;
  hide: () => void;
}>()((set) => ({
  open: false,
  initial: '',
  show: (initial = '') => set({ open: true, initial }),
  hide: () => set({ open: false, initial: '' }),
}));
