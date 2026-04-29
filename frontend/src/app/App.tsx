import React from 'react'

import { MainWindow } from '@/features/main-window/components/MainWindow'
import { OverlayShell } from '@/features/overlay/components/OverlayShell'

export function App() {
  const isOverlay = window.location.hash === '#overlay'

  React.useEffect(() => {
    if (isOverlay) {
      document.documentElement.classList.add('overlay-mode')
    } else {
      document.documentElement.classList.remove('overlay-mode')
    }
  }, [isOverlay])

  return isOverlay ? <OverlayShell /> : <MainWindow />
}
