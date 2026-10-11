import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBox } from './SearchBox'
import { useSearchStore } from '../stores/searchStore'

// Regression test for a real bug found and fixed in this same session: the
// search-history dropdown was mouse-only. Tabbing from the input closed it
// (via an onBlur timeout) before a keyboard user could ever reach an item.

beforeEach(() => {
  localStorage.clear()
  useSearchStore.getState().reset()
  useSearchStore.setState({ modelsLoaded: true, stage: 'ready' })
})

describe('SearchBox history dropdown', () => {
  it('is reachable and activatable via keyboard alone', async () => {
    const user = userEvent.setup()
    useSearchStore.getState().addToHistory('diffusion models')
    useSearchStore.getState().addToHistory('graph neural networks')
    const onSearch = vi.fn()

    render(<SearchBox onSearch={onSearch} />)

    await user.click(screen.getByRole('combobox', { name: 'Search papers' }))
    expect(screen.getByRole('listbox', { name: 'Recent searches' })).toBeInTheDocument()

    // Tab from the input: focus should land on the Search button, and the
    // dropdown must still be open (this is exactly what was broken).
    await user.tab()
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus()
    expect(screen.getByRole('listbox', { name: 'Recent searches' })).toBeInTheDocument()

    // Tab again: should reach the most recent history entry.
    await user.tab()
    const mostRecentItem = screen.getByRole('option', { name: 'graph neural networks' })
    expect(mostRecentItem.querySelector('button')).toHaveFocus()

    // Activate it with the keyboard.
    await user.keyboard('{Enter}')

    expect(onSearch).toHaveBeenCalledWith('graph neural networks')
    expect(screen.queryByRole('listbox', { name: 'Recent searches' })).not.toBeInTheDocument()
  })

  it('stays open when focus moves from the input to the Search button, closes once focus leaves entirely', async () => {
    const user = userEvent.setup()
    useSearchStore.getState().addToHistory('quantum computing')

    render(
      <div>
        <SearchBox onSearch={vi.fn()} />
        <button>outside</button>
      </div>
    )

    await user.click(screen.getByRole('combobox', { name: 'Search papers' }))
    expect(screen.getByRole('listbox', { name: 'Recent searches' })).toBeInTheDocument()

    await user.tab() // -> Search button, still inside the search box
    expect(screen.getByRole('listbox', { name: 'Recent searches' })).toBeInTheDocument()

    await user.tab() // -> the history item, still inside
    await user.tab() // -> leaves the search box entirely, to "outside"
    expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus()
    expect(screen.queryByRole('listbox', { name: 'Recent searches' })).not.toBeInTheDocument()
  })

  it('does not submit an empty query when the Search button is disabled', async () => {
    useSearchStore.setState({ modelsLoaded: true, stage: 'idle' }) // not 'ready'
    const onSearch = vi.fn()
    render(<SearchBox onSearch={onSearch} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(onSearch).not.toHaveBeenCalled()
  })
})
