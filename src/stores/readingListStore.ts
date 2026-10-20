import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { SavedPaper } from '../types'

interface ReadingListState {
  papers: SavedPaper[]
  isSaved: (key: string) => boolean
  addPaper: (paper: Omit<SavedPaper, 'savedAt'>) => void
  removePaper: (key: string) => void
  clearAll: () => void
}

export const useReadingListStore = create<ReadingListState>()(
  persist(
    immer((set, get) => ({
      papers: [],

      isSaved: (key) => get().papers.some((p) => p.key === key),

      addPaper: (paper) =>
        set((state) => {
          if (state.papers.some((p) => p.key === paper.key)) return
          state.papers.unshift({ ...paper, savedAt: Date.now() })
        }),

      removePaper: (key) =>
        set((state) => {
          state.papers = state.papers.filter((p) => p.key !== key)
        }),

      clearAll: () =>
        set((state) => {
          state.papers = []
        }),
    })),
    {
      name: 'papyrus-reading-list',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
