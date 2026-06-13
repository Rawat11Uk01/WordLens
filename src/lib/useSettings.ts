import { useCallback, useEffect, useState } from 'react'
import { getSettings, saveSettings } from './storage'
import { applyTheme } from './theme'
import { DEFAULT_SETTINGS, type Settings } from './types'

/** Load + persist settings, and keep the document theme in sync. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      applyTheme(s.theme)
      setLoaded(true)
    })
  }, [])

  // React to OS theme changes when in 'system' mode.
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [settings.theme])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (patch.theme) applyTheme(patch.theme)
      void saveSettings(next)
      return next
    })
  }, [])

  return { settings, update, loaded }
}
