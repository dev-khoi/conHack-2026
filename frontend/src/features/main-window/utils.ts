export const TAG_STYLES = [
  'bg-sky-500/20 text-sky-200 border-sky-400/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  'bg-amber-500/20 text-amber-200 border-amber-400/40',
  'bg-rose-500/20 text-rose-200 border-rose-400/40',
  'bg-violet-500/20 text-violet-200 border-violet-400/40',
];

export function prettyDate(value: string): string {
  if (!value.trim()) return 'unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
