import React from 'react';

import type { ScreenshotItem, TimelineItem } from '@/features/main-window/types';

type UseTimelineDataResult = {
  timeline: TimelineItem[];
  timelineLoading: boolean;
  screenshots: ScreenshotItem[];
  screenshotsLoading: boolean;
};

export function useTimelineData(backendBaseUrl: string): UseTimelineDataResult {
  const [timeline, setTimeline] = React.useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = React.useState(false);
  const [screenshots, setScreenshots] = React.useState<ScreenshotItem[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = React.useState(false);

  React.useEffect(() => {
    setScreenshotsLoading(true);
    fetch(`${backendBaseUrl}/screenshots?limit=12&offset=0`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ items?: ScreenshotItem[] }>;
      })
      .then((json) => {
        setScreenshots(Array.isArray(json.items) ? json.items : []);
      })
      .catch(() => {
        setScreenshots([]);
      })
      .finally(() => {
        setScreenshotsLoading(false);
      });
  }, [backendBaseUrl]);

  React.useEffect(() => {
    setTimelineLoading(true);
    fetch(`${backendBaseUrl}/memory/timeline?limit=30&offset=0`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ items?: TimelineItem[] }>;
      })
      .then((json) => {
        setTimeline(Array.isArray(json.items) ? json.items : []);
      })
      .catch(() => {
        setTimeline([]);
      })
      .finally(() => {
        setTimelineLoading(false);
      });
  }, [backendBaseUrl]);

  return { timeline, timelineLoading, screenshots, screenshotsLoading };
}
