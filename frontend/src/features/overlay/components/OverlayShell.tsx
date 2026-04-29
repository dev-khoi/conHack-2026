import React from 'react'

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
      <div
        className={
          'overlay-glass relative h-full w-full rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-xl ' +
          'shadow-[0_20px_80px_rgba(0,0,0,0.55)]'
        }
      >
        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/5" />

        <header
          className={
            'relative flex h-[60px] items-center justify-between gap-3 px-5 ' +
            'text-slate-100 [-webkit-app-region:drag]'
          }
        >
          <button
            type="button"
            className="flex items-center gap-2 text-left [-webkit-app-region:no-drag]"
            onClick={() => setPanelState(panelState === 'compact' ? 'input' : 'compact')}
          >
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400/90 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
            <span className="text-[14px] font-semibold tracking-wide">AURA</span>
            <span className="text-[12px] text-slate-400">overlay</span>
          </button>

          <div className="flex items-center gap-2 text-[12px] text-slate-400 [-webkit-app-region:no-drag]">
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Ctrl+Shift+Space</span>
          </div>
        </header>

        <section className="relative px-5 pb-5">
          <div
            className={
              'transition-all duration-200 ease-out ' +
              (panelState === 'compact'
                ? 'opacity-0 -translate-y-1 pointer-events-none h-0'
                : 'opacity-100 translate-y-0')
            }
          >
            <div className="pb-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-[12px] font-medium text-slate-300">Ask</div>
                <input
                  ref={inputRef}
                  className={
                    'min-w-0 flex-1 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 ' +
                    'outline-none [-webkit-app-region:no-drag]'
                  }
                  placeholder="Type a command or question..."
                  onFocus={() => setPanelState((s) => (s === 'compact' ? 'input' : s))}
                />
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-slate-200 hover:bg-white/10 [-webkit-app-region:no-drag]"
                  onClick={() => setPanelState(panelState === 'expanded' ? 'input' : 'expanded')}
                >
                  {panelState === 'expanded' ? 'Collapse' : 'Expand'}
                </button>
              </div>
              <div className="mt-2 text-[12px] leading-4 text-slate-500">
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
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mock Result</div>
              <div className="mt-2 space-y-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[13px] font-medium text-slate-100">Draft response</div>
                  <p className="mt-1 text-[12px] leading-5 text-slate-300">
                    This is a static, hardcoded panel used to validate the overlay shell. No backend calls yet.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[13px] font-medium text-slate-100">Next actions</div>
                  <p className="mt-1 text-[12px] leading-5 text-slate-300">
                    Hook input to the backend, stream tokens, and replace this section with real results.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            className={
              'transition-all duration-200 ease-out ' +
              (panelState === 'compact'
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden')
            }
          >
            <button
              type="button"
              className={
                'mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left ' +
                'text-[12px] text-slate-300 hover:bg-white/10 [-webkit-app-region:no-drag]'
              }
              onClick={() => setPanelState('input')}
            >
              <span className="font-medium text-slate-100">Search / Ask</span>
              <span className="ml-2 text-slate-500">Click to type</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
