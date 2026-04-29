import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { TimelineItem } from '@/features/main-window/types';
import { prettyDate, TAG_STYLES } from '@/features/main-window/utils';

type RecordingsFeedCardProps = {
  timelineLoading: boolean;
  filteredTimeline: TimelineItem[];
};

export function RecordingsFeedCard({
  timelineLoading,
  filteredTimeline,
}: RecordingsFeedCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl font-semibold tracking-tight'>Recordings Feed</CardTitle>
        <CardDescription>Memory timeline from your indexed captures.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className='max-h-[460px] space-y-3 overflow-y-auto pt-4'>
        {timelineLoading ? <div className='text-sm text-muted-foreground'>Loading recordings...</div> : null}
        {!timelineLoading && filteredTimeline.length === 0 ? (
          <div className='text-sm text-muted-foreground'>No recordings match your query.</div>
        ) : null}
        {filteredTimeline.map((item) => (
          <Card key={item.id} className='border border-border'>
            <CardHeader className='pb-2'>
              <div className='flex items-start justify-between gap-2'>
                <CardTitle className='text-base'>{item.title || 'Untitled recording'}</CardTitle>
                <Badge variant='secondary'>{item.source_type || 'unknown'}</Badge>
              </div>
              <CardDescription className='text-muted-foreground'>
                {prettyDate(item.created_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className='pt-0'>
              {typeof item.screenshot_url === 'string' && item.screenshot_url.trim() ? (
                <a
                  href={item.screenshot_url}
                  target='_blank'
                  rel='noreferrer'
                  className='mb-3 block overflow-hidden rounded-md border border-border bg-background'>
                  <img
                    src={item.screenshot_url}
                    alt={item.title || 'Recording screenshot'}
                    className='h-28 w-full object-cover'
                    loading='lazy'
                  />
                </a>
              ) : null}
              <div className='flex flex-wrap gap-2'>
                {(item.topic_tags || []).slice(0, 5).map((tag, index) => (
                  <Badge
                    key={`${item.id}-${tag}`}
                    variant='outline'
                    className={TAG_STYLES[index % TAG_STYLES.length]}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
