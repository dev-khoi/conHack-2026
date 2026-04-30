import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import GooeyNav from "@/components/GooeyNav";

type AppShellProps = {
  activeTab: "main" | "sessions";
  onTabChange: (tab: "main" | "sessions") => void;
  screenshotEnabled: boolean;
  onScreenshotToggle: (enabled: boolean) => void;
  children: React.ReactNode;
};

export function AppShell({
  activeTab,
  onTabChange,
  screenshotEnabled,
  onScreenshotToggle,
  children,
}: AppShellProps) {
  const screenshotSettingKey = "aura.screenshotEnabled";
  const { user, logout } = useAuth0();
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const profileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const navItems = React.useMemo(
    () => [
      { label: "Main", href: "#main" },
      { label: "Sessions", href: "#sessions" },
    ],
    [],
  );

  React.useEffect(() => {
    if (!isProfileOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProfileOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isProfileOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8 py-3">
          <nav
            className="h-11"
            onClick={(event) => {
              const target = event.target as HTMLElement;
              const anchor = target.closest("a");
              if (!anchor) return;
              const href = anchor.getAttribute("href") || "";
              if (href === "#main") {
                event.preventDefault();
                onTabChange("main");
              }
              if (href === "#sessions") {
                event.preventDefault();
                onTabChange("sessions");
              }
            }}>
            <GooeyNav
              items={navItems}
              particleCount={15}
              particleDistances={[90, 10]}
              particleR={100}
              initialActiveIndex={activeTab === "main" ? 0 : 1}
              animationTime={600}
              timeVariance={300}
              colors={[1, 2, 3, 1, 2, 3, 1, 4]}
            />
          </nav>

          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen((open) => !open)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-haspopup="menu"
              aria-expanded={isProfileOpen}
              aria-label="Open profile menu">
              {typeof user?.picture === "string" && user.picture.trim() ? (
                <img
                  src={user.picture}
                  alt={user?.name || "User avatar"}
                  className="h-9 w-9 rounded-full border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border text-xs text-muted-foreground">
                  U
                </div>
              )}
            </button>

            {isProfileOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-2 py-2">
                  <span className="text-xs text-muted-foreground">
                    Screenshot {screenshotEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={screenshotEnabled}
                    onCheckedChange={(enabled) => {
                      localStorage.setItem(screenshotSettingKey, enabled ? "1" : "0");
                      onScreenshotToggle(enabled);
                    }}
                    aria-label="Toggle screenshot capture"
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    logout({
                      logoutParams: { returnTo: window.location.origin },
                    })
                  }
                  className="mt-2 w-full">
                  Logout
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
