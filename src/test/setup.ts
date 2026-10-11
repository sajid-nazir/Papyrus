import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react's auto-cleanup relies on detecting global test
// hooks (vitest's `globals: true`), which this project deliberately
// doesn't enable (app code shouldn't have test globals leak into its own
// type-checking) — so it's wired up explicitly here instead.
afterEach(() => {
  cleanup()
})
