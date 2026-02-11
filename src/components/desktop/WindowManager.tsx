'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { WindowState } from './types'
import * as Sentry from '@sentry/nextjs'

interface WindowManagerContextType {
  windows: WindowState[]
  openWindow: (window: Omit<WindowState, 'zIndex' | 'isFocused'>) => void
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  focusWindow: (id: string) => void
  updateWindowPosition: (id: string, x: number, y: number) => void
  updateWindowSize: (id: string, width: number, height: number) => void
  topZIndex: number
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(null)

export function useWindowManager() {
  const context = useContext(WindowManagerContext)
  if (!context) {
    throw new Error('useWindowManager must be used within WindowManagerProvider')
  }
  return context
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const [topZIndex, setTopZIndex] = useState(100)

  const openWindow = useCallback((window: Omit<WindowState, 'zIndex' | 'isFocused'>) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => {
        const existing = prev.find(w => w.id === window.id)
        const isNewWindow = !existing
        const action = existing?.isMinimized ? 'restore' : (existing ? 'focus' : 'open')

        if (isNewWindow) {
          // Log window open
          Sentry.logger.info("Window opened", {
            component: "WindowManager",
            action: "open",
            windowId: window.id,
            windowType: window.type
          })

          // Track window action metric
          Sentry.metrics.count("sentryos.window.action", 1, {
            tags: { action: "open", windowType: window.type }
          })

          // Update window count gauge (will be incremented)
          const newCount = prev.length + 1
          Sentry.metrics.gauge("sentryos.window.open_count", newCount)
        }

        if (existing) {
          if (existing.isMinimized) {
            return prev.map(w =>
              w.id === window.id
                ? { ...w, isMinimized: false, isFocused: true, zIndex: newZ }
                : { ...w, isFocused: false }
            )
          }
          return prev.map(w =>
            w.id === window.id
              ? { ...w, isFocused: true, zIndex: newZ }
              : { ...w, isFocused: false }
          )
        }
        return [
          ...prev.map(w => ({ ...w, isFocused: false })),
          { ...window, zIndex: newZ, isFocused: true }
        ]
      })
      return newZ
    })
  }, [])

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        // Log window close
        Sentry.logger.info("Window closed", {
          component: "WindowManager",
          action: "close",
          windowId: id,
          windowType: window.type
        })

        // Track window action metric
        Sentry.metrics.count("sentryos.window.action", 1, {
          tags: { action: "close", windowType: window.type }
        })

        // Update window count gauge (will be decremented)
        const newCount = prev.length - 1
        Sentry.metrics.gauge("sentryos.window.open_count", newCount)
      }

      return prev.filter(w => w.id !== id)
    })
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        // Log window minimize
        Sentry.logger.info("Window minimized", {
          component: "WindowManager",
          action: "minimize",
          windowId: id,
          windowType: window.type
        })

        // Track window action metric
        Sentry.metrics.count("sentryos.window.action", 1, {
          tags: { action: "minimize", windowType: window.type }
        })
      }

      return prev.map(w =>
        w.id === id ? { ...w, isMinimized: true, isFocused: false } : w
      )
    })
  }, [])

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        const newMaximizedState = !window.isMaximized

        // Log window maximize/restore
        Sentry.logger.info(newMaximizedState ? "Window maximized" : "Window restored from maximize", {
          component: "WindowManager",
          action: newMaximizedState ? "maximize" : "restore",
          windowId: id,
          windowType: window.type
        })

        // Track window action metric
        Sentry.metrics.count("sentryos.window.action", 1, {
          tags: { action: newMaximizedState ? "maximize" : "restore", windowType: window.type }
        })
      }

      return prev.map(w =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      )
    })
  }, [])

  const restoreWindow = useCallback((id: string) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => {
        const window = prev.find(w => w.id === id)
        if (window) {
          // Log window restore
          Sentry.logger.info("Window restored from taskbar", {
            component: "WindowManager",
            action: "restore",
            windowId: id,
            windowType: window.type
          })

          // Track window action metric
          Sentry.metrics.count("sentryos.window.action", 1, {
            tags: { action: "restore", windowType: window.type }
          })
        }

        return prev.map(w =>
          w.id === id
            ? { ...w, isMinimized: false, isFocused: true, zIndex: newZ }
            : { ...w, isFocused: false }
        )
      })
      return newZ
    })
  }, [])

  const focusWindow = useCallback((id: string) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => {
        const window = prev.find(w => w.id === id)
        if (window && !window.isFocused) {
          // Log window focus (only if not already focused)
          Sentry.logger.info("Window focused", {
            component: "WindowManager",
            action: "focus",
            windowId: id,
            windowType: window.type
          })

          // Track window action metric
          Sentry.metrics.count("sentryos.window.action", 1, {
            tags: { action: "focus", windowType: window.type }
          })
        }

        return prev.map(w =>
          w.id === id
            ? { ...w, isFocused: true, zIndex: newZ }
            : { ...w, isFocused: false }
        )
      })
      return newZ
    })
  }, [])

  const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, x, y } : w
    ))
  }, [])

  const updateWindowSize = useCallback((id: string, width: number, height: number) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, width, height } : w
    ))
  }, [])

  return (
    <WindowManagerContext.Provider value={{
      windows,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      updateWindowPosition,
      updateWindowSize,
      topZIndex
    }}>
      {children}
    </WindowManagerContext.Provider>
  )
}
