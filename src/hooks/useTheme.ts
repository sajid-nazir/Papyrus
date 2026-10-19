import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'papyrus-theme'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

// Dark mode defaults to following the OS/browser (plain CSS media query,
// no JS involved) until the user explicitly picks a theme via the toggle,
// at which point that choice persists and overrides the system setting —
// see the :root[data-theme] rules in App.css.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())

  useEffect(() => {
    const stored = getStoredTheme()
    if (stored) {
      document.documentElement.setAttribute('data-theme', stored)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  useEffect(() => {
    if (getStoredTheme() !== null) return // user already made an explicit choice
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setThemeState(mql.matches ? 'dark' : 'light')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
