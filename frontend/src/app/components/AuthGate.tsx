import React from 'react'
import { useAuth0 } from '@auth0/auth0-react'

type AuthGateProps = {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0()

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

  return <>{children}</>
}
