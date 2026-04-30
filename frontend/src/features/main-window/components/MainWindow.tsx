import React from "react";

import Prism from '@/components/Prism';
import { RagAnswerCard } from "@/features/main-window/components/RagAnswerCard";
import { useRag } from "@/features/main-window/hooks/useRag";
import { useTimelineData } from "@/features/main-window/hooks/useTimelineData";
import { useHoldToTalkRecorder } from '@/features/voice/useHoldToTalkRecorder'

type MainWindowProps = {
  screenshotEnabled: boolean
}

export function MainWindow({ screenshotEnabled }: MainWindowProps) {
  const backendBaseUrl =
    import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

  const {
    query,
    setQuery,
    ragLoading,
    ragError,
    ragAnswer,
    citations,
    runAskAi,
    handleSubmit,
  } = useRag(backendBaseUrl, screenshotEnabled);

  const { timeline } = useTimelineData(backendBaseUrl);

  const { asrError } = useHoldToTalkRecorder({
    backendBaseUrl,
    onTranscription: (text) => {
      setQuery(text);
      void runAskAi(text);
    },
  });

  const suggestedQueries = React.useMemo(() => {
    const fromTitles = timeline
      .map((item) => item.title)
      .filter((title) => typeof title === "string" && title.trim().length > 0)
      .slice(0, 3);
    return Array.from(new Set(fromTitles));
  }, [timeline]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-75">
        <Prism
          animationType='rotate'
          timeScale={0.45}
          height={3.2}
          baseWidth={5.3}
          scale={3.2}
          hueShift={0}
          colorFrequency={1}
          noise={0}
          glow={0.9}
        />
      </div>
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col gap-20 px-6 py-8">
        <div className="gap-10">
          <RagAnswerCard
            query={query}
            setQuery={setQuery}
            suggestedQueries={suggestedQueries}
            ragError={ragError}
            asrError={asrError}
            ragLoading={ragLoading}
            ragAnswer={ragAnswer}
            citations={citations}
            runAskAi={runAskAi}
            onSubmit={handleSubmit}
          />
        </div>

        {/* <ScreenshotLibraryCard screenshots={screenshots} screenshotsLoading={screenshotsLoading} /> */}

        {/* <RecordingsFeedCard
          timelineLoading={timelineLoading}
          filteredTimeline={filteredTimeline}
        /> */}
      </div>
    </main>
  );
}
