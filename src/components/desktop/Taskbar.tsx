'use client'

import { Clock } from 'lucide-react'
import { useWindowManager } from './WindowManager'
import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'

export function Taskbar() {
  const { windows, restoreWindow, focusWindow } = useWindowManager()
  const [time, setTime] = useState('')

  // Track session duration
  useEffect(() => {
    const sessionStartTime = Date.now()

    // Log session start
    Sentry.logger.info("Desktop session started", {
      component: "Taskbar",
      timestamp: new Date().toISOString()
    })

    return () => {
      // Log session end with duration
      const sessionDuration = Date.now() - sessionStartTime
      Sentry.logger.info("Desktop session ended", {
        component: "Taskbar",
        sessionDuration,
        timestamp: new Date().toISOString()
      })

      // Track session duration metric
      Sentry.metrics.distribution("sentryos.session.duration", sessionDuration, {
        unit: "millisecond"
      })
    }
  }, [])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleWindowClick = (id: string, isMinimized: boolean) => {
    if (isMinimized) {
      // Log window restoration from taskbar
      const window = windows.find(w => w.id === id)
      if (window) {
        Sentry.logger.info("Window restored from taskbar click", {
          component: "Taskbar",
          action: "taskbar_restore",
          windowId: id,
          windowType: window.type,
          windowTitle: window.title
        })
      }
      restoreWindow(id)
    } else {
      focusWindow(id)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-12 bg-[#15121d] border-t border-[#362552] flex items-center justify-between px-2 z-[9999]">
      {/* Start button area */}
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#2a2438] transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sentryglyph.png"
            alt="Sentry"
            width={20}
            height={20}
            className="w-5 h-5"
          />
          <span className="text-sm font-medium text-[#e8e4f0]">SentryOS</span>
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-[#362552]" />

        {/* Open windows */}
        <div className="flex items-center gap-1">
          {windows.map((win) => (
            <button
              key={win.id}
              onClick={() => handleWindowClick(win.id, win.isMinimized)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded min-w-[120px] max-w-[200px]
                transition-colors text-sm
                ${win.isFocused && !win.isMinimized
                  ? 'bg-[#7553ff]/20 border border-[#7553ff]/50'
                  : 'hover:bg-[#2a2438] border border-transparent'
                }
                ${win.isMinimized ? 'opacity-60' : ''}
              `}
              title={win.title}
            >
              <span className="text-base">{win.icon}</span>
              <span className="truncate text-[#9086a3]">{win.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* System tray area */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex items-center gap-1.5 text-[#9086a3] text-sm">
          <Clock className="w-4 h-4" />
          <span className="tabular-nums">{time}</span>
        </div>
      </div>
    </div>
  )
}
