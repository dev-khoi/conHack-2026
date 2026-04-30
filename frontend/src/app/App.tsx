import React from 'react'

import { AppShell } from '@/app/components/AppShell'
import { AuthGate } from '@/app/components/AuthGate'
import { MainTabs } from '@/app/components/MainTabs'
import { useAuthSync } from '@/app/hooks/useAuthSync'
import { OverlayShell } from '@/features/overlay/components/OverlayShell'

type AppTab = 'main' | 'sessions'

export function App() {
  const isOverlay = window.location.hash === '#overlay'
  const [activeTab, setActiveTab] = React.useState<AppTab>('main')
  const [screenshotEnabled, setScreenshotEnabled] = React.useState(() => {
    const raw = localStorage.getItem('aura.screenshotEnabled')
    if (raw === '0') return false
    if (raw === '1') return true
    return true
  })

  React.useEffect(() => {
    document.documentElement.classList.toggle('overlay-mode', isOverlay)
  }, [isOverlay])

  useAuthSync({ enabled: !isOverlay })

  if (isOverlay) return <OverlayShell />

  return (
    <AuthGate>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        screenshotEnabled={screenshotEnabled}
        onScreenshotToggle={setScreenshotEnabled}
      >
        <MainTabs activeTab={activeTab} screenshotEnabled={screenshotEnabled} />
      </AppShell>
    </AuthGate>
  )
}
