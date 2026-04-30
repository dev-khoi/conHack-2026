import React from "react";

import { RagAnswerCard } from "@/features/main-window/components/RagAnswerCard";
import { useRag } from "@/features/main-window/hooks/useRag";
import { useTimelineData } from "@/features/main-window/hooks/useTimelineData";
import { useHoldToTalkRecorder } from '@/features/voice/useHoldToTalkRecorder'

export function MainWindow() {
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
  } = useRag(backendBaseUrl);

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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-6">
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
