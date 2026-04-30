import React from 'react'
import { useAuth0 } from '@auth0/auth0-react'

import { Button } from '@/components/ui/button'

type AppShellProps = {
  activeTab: 'main' | 'sessions'
  onTabChange: (tab: 'main' | 'sessions') => void
  children: React.ReactNode
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  const { user, logout } = useAuth0()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTabChange('main')}
              className={
                'rounded-md px-3 py-1.5 text-sm transition ' +
                (activeTab === 'main'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              Main
            </button>
            <button
              type="button"
              onClick={() => onTabChange('sessions')}
              className={
                'rounded-md px-3 py-1.5 text-sm transition ' +
                (activeTab === 'sessions'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              Sessions
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name ?? user?.email}</div>
            </div>
            {typeof user?.picture === 'string' && user.picture.trim() ? (
              <img
                src={user.picture}
                alt={user?.name || 'User avatar'}
                className="h-8 w-8 rounded-full border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border text-xs text-muted-foreground">
                U
              </div>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}
