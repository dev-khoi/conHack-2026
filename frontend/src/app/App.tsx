import React from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { MainWindow } from '@/features/main-window/components/MainWindow'
import { OverlayShell } from '@/features/overlay/components/OverlayShell'

export function App() {
  const isOverlay = window.location.hash === '#overlay'
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user, getAccessTokenSilently } = useAuth0()

  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [syncError, setSyncError] = React.useState<string | null>(null)

  const attemptedSyncForSubRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (isOverlay) {
      document.documentElement.classList.add('overlay-mode')
    } else {
      document.documentElement.classList.remove('overlay-mode')
    }
  }, [isOverlay])

  const syncUser = React.useCallback(async () => {
    if (isOverlay) return
    if (!isAuthenticated) return
    if (syncStatus === 'syncing' || syncStatus === 'synced') return

    const audience = import.meta.env.VITE_AUTH0_AUDIENCE
    if (!audience) {
      setSyncStatus('error')
      setSyncError('Missing VITE_AUTH0_AUDIENCE (restart dev server after editing .env).')
      return
    }

    setSyncStatus('syncing')
    setSyncError(null)

    try {
      const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
      const token = await getAccessTokenSilently({
        authorizationParams: { audience },
      })

      const res = await fetch(`${backendBaseUrl}/auth/whoami`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const whoami = (await res.json()) as {
        sub?: string
        aud?: string | string[]
        iss?: string
        detail?: string
      }
      if (!res.ok) {
        throw new Error(whoami.detail || `HTTP ${res.status} (whoami)`)
      }

      // Help debug common 401 causes without opening backend logs.
      const expectedIssuer = `https://${import.meta.env.VITE_AUTH0_DOMAIN}/`
      const audList = Array.isArray(whoami.aud) ? whoami.aud : whoami.aud ? [whoami.aud] : []
      if (whoami.iss && whoami.iss !== expectedIssuer) {
        throw new Error(`Token iss mismatch: ${whoami.iss} (expected ${expectedIssuer})`)
      }
      if (audList.length && !audList.includes(audience)) {
        throw new Error(`Token aud mismatch: ${audList.join(', ')} (expected ${audience})`)
      }

      const res2 = await fetch(`${backendBaseUrl}/auth/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const payload = (await res2.json()) as { status?: string; detail?: string }
      if (!res2.ok) {
        throw new Error(payload.detail || `HTTP ${res2.status} (sync)`)
      }

      setSyncStatus('synced')
    } catch (e: unknown) {
      setSyncStatus('error')
      setSyncError(e instanceof Error ? e.message : String(e))
    }
  }, [getAccessTokenSilently, isAuthenticated, isOverlay, syncStatus])

  React.useEffect(() => {
    if (isOverlay) return
    if (isLoading) return
    if (!isAuthenticated) return

    const sub = typeof user?.sub === 'string' ? user.sub : null
    if (!sub) return

    if (attemptedSyncForSubRef.current === sub) return
    attemptedSyncForSubRef.current = sub

    void syncUser()
  }, [isAuthenticated, isLoading, isOverlay, syncUser, user?.sub])

  if (isOverlay) {
    return <OverlayShell />
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading authentication...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground">Please sign in with Auth0 to continue.</p>
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="absolute right-4 top-4 z-10 flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
        <span className="text-muted-foreground">{user?.name ?? user?.email}</span>
        <span
          className={
            'rounded px-2 py-1 ' +
            (syncStatus === 'synced'
              ? 'bg-emerald-500/15 text-emerald-700'
              : syncStatus === 'syncing'
                ? 'bg-amber-500/15 text-amber-700'
                : syncStatus === 'error'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-muted text-muted-foreground')
          }
          title={syncError || undefined}
        >
          {syncStatus === 'synced'
            ? 'Synced'
            : syncStatus === 'syncing'
              ? 'Syncing'
              : syncStatus === 'error'
                ? 'Sync failed'
                : 'Not synced'}
        </span>
        {syncStatus === 'error' && syncError ? (
          <span className="max-w-80 truncate text-destructive" title={syncError}>
            {syncError}
          </span>
        ) : null}
        {syncStatus === 'error' || syncStatus === 'idle' ? (
          <button
            type="button"
            onClick={() => void syncUser()}
            className="rounded bg-secondary px-2 py-1 text-secondary-foreground"
          >
            Sync
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          className="rounded bg-secondary px-2 py-1 text-secondary-foreground"
        >
          Sign out
        </button>
      </div>
      <MainWindow />
    </>
  )
}
