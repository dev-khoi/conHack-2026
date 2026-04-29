import React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

type PanelState = 'compact' | 'input' | 'expanded'

export function OverlayShell() {
  const [panelState, setPanelState] = React.useState<PanelState>('compact')
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    window.overlay.setPanelState(panelState)
  }, [panelState])

  React.useEffect(() => {
    if (panelState === 'input' || panelState === 'expanded') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [panelState])

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (panelState === 'compact') {
          window.overlay.hide()
          return
        }
        setPanelState('compact')
        return
      }

      if (e.key === 'Enter') {
        if (panelState === 'input') setPanelState('expanded')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panelState])

  return (
    <div className="h-full w-full overflow-hidden">
      <Card className="overlay-glass relative h-full w-full overflow-hidden bg-card/60 backdrop-blur-xl [-webkit-app-region:no-drag]">
        <header className="relative flex h-[60px] items-center justify-between px-4 [-webkit-app-region:drag]">
          <button
            type="button"
            className="flex items-center gap-2 [-webkit-app-region:no-drag]"
            onClick={() => setPanelState(panelState === 'compact' ? 'input' : 'compact')}
          >
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]" />
            <span className="font-heading text-[14px] font-semibold tracking-tight">AURA</span>
            <Badge variant="secondary" className="h-5">overlay</Badge>
          </button>

          <Badge variant="outline" className="h-6 [-webkit-app-region:no-drag]">
            Ctrl+Shift+Space
          </Badge>
        </header>

        <Separator />

        <section className="relative px-4 pb-4">
          <div
            className={
              'transition-all duration-200 ease-out ' +
              (panelState === 'compact'
                ? 'opacity-0 -translate-y-1 pointer-events-none h-0'
                : 'opacity-100 translate-y-0')
            }
          >
            <div className="pb-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-medium text-muted-foreground">Ask</div>
                <div className="flex-1">
                  <Input
                    ref={inputRef}
                    className="h-10 bg-background/40"
                    placeholder="Type a command or question..."
                    onFocus={() => setPanelState((s) => (s === 'compact' ? 'input' : s))}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPanelState(panelState === 'expanded' ? 'input' : 'expanded')}
                >
                  {panelState === 'expanded' ? 'Collapse' : 'Expand'}
                </Button>
              </div>
              <div className="mt-2 text-xs leading-4 text-muted-foreground">
                Enter expands. Esc collapses; Esc again hides.
              </div>
            </div>
          </div>

          <div
            className={
              'transition-all duration-200 ease-out ' +
              (panelState === 'expanded'
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none h-0 overflow-hidden')
            }
          >
            <Card className="bg-muted/30">
              <CardHeader className="py-4">
                <CardTitle className="text-sm">Mock Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-sm font-medium">Draft response</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is a static, hardcoded panel used to validate the overlay shell. No backend calls yet.
                  </p>
                </div>
                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="text-sm font-medium">Next actions</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Hook input to the backend, stream tokens, and replace this section with real results.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div
            className={
              'transition-all duration-200 ease-out ' +
              (panelState === 'compact'
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden')
            }
          >
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full justify-start"
              onClick={() => setPanelState('input')}
            >
              <span className="font-medium">Search / Ask</span>
              <span className="ml-2 text-muted-foreground">Click to type</span>
            </Button>
          </div>
        </section>
      </Card>
    </div>
  )
}
