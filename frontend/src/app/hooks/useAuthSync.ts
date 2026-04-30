import React from 'react'
import { useAuth0 } from '@auth0/auth0-react'

export function useAuthSync({ enabled }: { enabled: boolean }) {
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0()
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [syncError, setSyncError] = React.useState<string | null>(null)
  const attemptedSyncForSubRef = React.useRef<string | null>(null)

  const syncUser = React.useCallback(async () => {
    if (!enabled || !isAuthenticated) return
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
      const token = await getAccessTokenSilently({ authorizationParams: { audience } })

      const whoamiRes = await fetch(`${backendBaseUrl}/auth/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const whoami = (await whoamiRes.json()) as {
        sub?: string
        aud?: string | string[]
        iss?: string
        detail?: string
      }
      if (!whoamiRes.ok) throw new Error(whoami.detail || `HTTP ${whoamiRes.status} (whoami)`)

      const expectedIssuer = `https://${import.meta.env.VITE_AUTH0_DOMAIN}/`
      const audList = Array.isArray(whoami.aud) ? whoami.aud : whoami.aud ? [whoami.aud] : []
      if (whoami.iss && whoami.iss !== expectedIssuer) {
        throw new Error(`Token iss mismatch: ${whoami.iss} (expected ${expectedIssuer})`)
      }
      if (audList.length && !audList.includes(audience)) {
        throw new Error(`Token aud mismatch: ${audList.join(', ')} (expected ${audience})`)
      }

      const syncRes = await fetch(`${backendBaseUrl}/auth/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = (await syncRes.json()) as { detail?: string }
      if (!syncRes.ok) throw new Error(payload.detail || `HTTP ${syncRes.status} (sync)`)

      setSyncStatus('synced')
    } catch (e: unknown) {
      setSyncStatus('error')
      setSyncError(e instanceof Error ? e.message : String(e))
    }
  }, [enabled, getAccessTokenSilently, isAuthenticated, syncStatus])

  React.useEffect(() => {
    if (!enabled || !isAuthenticated) return
    const sub = typeof user?.sub === 'string' ? user.sub : null
    if (!sub) return
    if (attemptedSyncForSubRef.current === sub) return

    attemptedSyncForSubRef.current = sub
    void syncUser()
  }, [enabled, isAuthenticated, syncUser, user?.sub])

  return { syncStatus, syncError }
}
