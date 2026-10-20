import { useState, useEffect, useCallback, useRef } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'papyrus-theme'
// Matches the transition duration in the .theme-transitioning rule in App.css.
const TRANSITION_MS = 800

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
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    }
  }, [])

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
    const root = document.documentElement
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    root.classList.add('theme-transitioning')
    transitionTimeoutRef.current = setTimeout(() => {
      root.classList.remove('theme-transitioning')
      transitionTimeoutRef.current = null
    }, TRANSITION_MS)

    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
