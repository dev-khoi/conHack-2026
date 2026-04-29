import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { MainWindow } from "@/features/main-window/components/MainWindow";
import { OverlayShell } from "@/features/overlay/components/OverlayShell";

type AppTab = "main" | "sessions";

export function App() {
  const isOverlay = window.location.hash === "#overlay";
  const {
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
    getAccessTokenSilently,
  } = useAuth0();

  const [syncStatus, setSyncStatus] = React.useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<AppTab>("main");

  const attemptedSyncForSubRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (isOverlay) {
      document.documentElement.classList.add("overlay-mode");
    } else {
      document.documentElement.classList.remove("overlay-mode");
    }
  }, [isOverlay]);

  const syncUser = React.useCallback(async () => {
    if (isOverlay) return;
    if (!isAuthenticated) return;
    if (syncStatus === "syncing" || syncStatus === "synced") return;

    const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
    if (!audience) {
      setSyncStatus("error");
      setSyncError(
        "Missing VITE_AUTH0_AUDIENCE (restart dev server after editing .env).",
      );
      return;
    }

    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const backendBaseUrl =
        import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
      const token = await getAccessTokenSilently({
        authorizationParams: { audience },
      });

      const res = await fetch(`${backendBaseUrl}/auth/whoami`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const whoami = (await res.json()) as {
        sub?: string;
        aud?: string | string[];
        iss?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(whoami.detail || `HTTP ${res.status} (whoami)`);
      }

      // Help debug common 401 causes without opening backend logs.
      const expectedIssuer = `https://${import.meta.env.VITE_AUTH0_DOMAIN}/`;
      const audList = Array.isArray(whoami.aud)
        ? whoami.aud
        : whoami.aud
          ? [whoami.aud]
          : [];
      if (whoami.iss && whoami.iss !== expectedIssuer) {
        throw new Error(
          `Token iss mismatch: ${whoami.iss} (expected ${expectedIssuer})`,
        );
      }
      if (audList.length && !audList.includes(audience)) {
        throw new Error(
          `Token aud mismatch: ${audList.join(", ")} (expected ${audience})`,
        );
      }

      const res2 = await fetch(`${backendBaseUrl}/auth/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await res2.json()) as {
        status?: string;
        detail?: string;
      };
      if (!res2.ok) {
        throw new Error(payload.detail || `HTTP ${res2.status} (sync)`);
      }

      setSyncStatus("synced");
    } catch (e: unknown) {
      setSyncStatus("error");
      setSyncError(e instanceof Error ? e.message : String(e));
    }
  }, [getAccessTokenSilently, isAuthenticated, isOverlay, syncStatus]);

  React.useEffect(() => {
    if (isOverlay) return;
    if (isLoading) return;
    if (!isAuthenticated) return;

    const sub = typeof user?.sub === "string" ? user.sub : null;
    if (!sub) return;

    if (attemptedSyncForSubRef.current === sub) return;
    attemptedSyncForSubRef.current = sub;

    void syncUser();
  }, [isAuthenticated, isLoading, isOverlay, syncUser, user?.sub]);

  if (isOverlay) {
    return <OverlayShell />;
  }

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading authentication...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground">
            Please sign in with Auth0 to continue.
          </p>
          <button
            type="button"
            onClick={() => loginWithRedirect()}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("main")}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (activeTab === "main"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }>
              Main
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (activeTab === "sessions"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }>
              Sessions
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name ?? user?.email}</div>
              {syncStatus === "error" && syncError ? (
                <div className="max-w-64 truncate text-xs text-destructive" title={syncError}>
                  Sync issue
                </div>
              ) : null}
            </div>
            {typeof user?.picture === "string" && user.picture.trim() ? (
              <img
                src={user.picture}
                alt={user?.name || "User avatar"}
                className="h-8 w-8 rounded-full border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border text-xs text-muted-foreground">
                U
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground">
              Logout
            </button>
          </div>
        </div>
      </header>

      {activeTab === "main" ? (
        <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-3xl items-center justify-center px-6 py-10">
          <div className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">AURA</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Press <span className="font-medium text-foreground">Shift+Space</span> to record.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open <span className="font-medium text-foreground">Sessions</span> to search and ask AI across your captures.
            </p>
          </div>
        </main>
      ) : (
        <MainWindow />
      )}
    </div>
  );
}
