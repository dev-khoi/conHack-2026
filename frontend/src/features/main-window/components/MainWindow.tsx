import React from 'react'

export function MainWindow() {
  const [health, setHealth] = React.useState<string>('loading')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
    fetch(`${baseUrl}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ status?: string }>
      })
      .then((json) => {
        setHealth(json.status ?? 'unknown')
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setHealth('error')
      })
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-8 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">AURA</h1>
        <p className="mt-2 text-sm text-slate-300">
          Main app window. Use <span className="font-medium text-slate-100">Ctrl+Shift+Space</span> to toggle the overlay.
        </p>

        <section className="mt-8 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-slate-400">Backend</div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="text-lg">/health</div>
            <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm">
              {health}
            </div>
          </div>
          {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
          <div className="mt-3 text-xs text-slate-400">
            Using VITE_BACKEND_URL={import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'}
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/40 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-slate-400">Overlay</div>
          <p className="mt-2 text-sm text-slate-300">
            The overlay is a separate always-on-top window. You can also toggle it from here.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
              onClick={() => window.overlay.toggle()}
            >
              Toggle overlay
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
