import GradientText from '@/components/GradientText'
import { MainWindow } from '@/features/main-window/components/MainWindow'

type MainTabsProps = {
  activeTab: 'main' | 'sessions'
}

export function MainTabs({ activeTab }: MainTabsProps) {
  if (activeTab === 'main') {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-3xl items-center justify-center px-6 py-10">
        <div className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
          <GradientText
            colors={['#5227FF', '#FF9FFC', '#B497CF']}
            animationSpeed={8}
            showBorder={false}
            className="custom-class"
          >
            <h1 className="text-9xl">AURA</h1>
          </GradientText>
          <p className="mt-3 text-sm text-muted-foreground">
            Press <span className="font-medium text-foreground">Shift+Space</span> to record.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open <span className="font-medium text-foreground">Sessions</span> to search and ask AI across your captures.
          </p>
        </div>
      </main>
    )
  }

  return <MainWindow />
}
