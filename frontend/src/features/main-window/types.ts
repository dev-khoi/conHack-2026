export type TimelineItem = {
  id: string;
  title: string;
  created_at: string;
  source_type: string;
  topic_tags: string[];
  screenshot_url?: string | null;
};

export type Citation = {
  title: string;
  capture_date: string;
  source_type: string;
  topic_tags: string[];
};

export type ScreenshotItem = {
  id: string;
  url: string;
  created_at: string;
  source: string;
};
