// Transient UI state shared across navigators (not persisted).

import { create } from 'zustand';

type UiState = {
  isSidebarOpen: boolean;
  /** The server said this build is too old (426): only the update screen shows. */
  updateRequired: boolean;
  requireUpdate: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
};

export const useUiStore = create<UiState>()(set => ({
  isSidebarOpen: false,
  updateRequired: false,
  requireUpdate: () => set({ updateRequired: true }),
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
}));
