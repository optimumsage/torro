import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  SearchX,
  Plus,
  Loader2,
  ChevronDown,
  Check,
  ArrowUpDown,
  Film,
  HardDrive,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/EmptyState';
import { TorrentFileSelector } from './TorrentFileSelector';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearch, useSearchStatus, useAddSearchResult } from '@/hooks/useSearch';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import { apiErrorMessage } from '@/api/client';
import type { FileType, SearchResult, SearchSortBy } from '@/types';

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const DAY = 24 * 3600_000;

const FILE_TYPES: { label: string; value: FileType | 'all' }[] = [
  { label: 'All types', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Software', value: 'software' },
  { label: 'Books', value: 'books' },
  { label: 'Other', value: 'other' },
];

const SIZE_BUCKETS: { label: string; value: string; min: number; max: number }[] = [
  { label: 'Any size', value: 'any', min: 0, max: Infinity },
  { label: '< 500 MB', value: 's', min: 0, max: 500 * MB },
  { label: '500 MB – 2 GB', value: 'm', min: 500 * MB, max: 2 * GB },
  { label: '2 – 5 GB', value: 'l', min: 2 * GB, max: 5 * GB },
  { label: '> 5 GB', value: 'xl', min: 5 * GB, max: Infinity },
];

const DATE_BUCKETS: { label: string; value: string; ms: number }[] = [
  { label: 'Any time', value: 'any', ms: Infinity },
  { label: 'Past 24 hours', value: 'd', ms: DAY },
  { label: 'Past week', value: 'w', ms: 7 * DAY },
  { label: 'Past month', value: 'm', ms: 30 * DAY },
  { label: 'Past year', value: 'y', ms: 365 * DAY },
];

const SORTS: { label: string; value: SearchSortBy }[] = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Seeders', value: 'seeders' },
  { label: 'Upload date', value: 'date' },
  { label: 'Size', value: 'size' },
];

function FilterMenu<T extends string>({
  icon: Icon,
  options,
  value,
  onChange,
}: {
  icon: LucideIcon;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{current?.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            {o.value === value ? <Check className="h-4 w-4" /> : <span className="w-4" />}
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const rowKey = (r: SearchResult) => `${r.tracker}|${r.title}|${r.size}`;

export function SearchTorrents() {
  const status = useSearchStatus();

  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 400);
  const { data, isFetching, isError, error } = useSearch(debounced);

  const [refine, setRefine] = useState('');
  const [type, setType] = useState<FileType | 'all'>('all');
  const [size, setSize] = useState('any');
  const [date, setDate] = useState('any');
  const [sort, setSort] = useState<SearchSortBy>('relevance');

  const add = useAddSearchResult();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [pending, setPending] = useState<{ hash: string } | null>(null);

  const onAdd = async (r: SearchResult) => {
    setAddingKey(rowKey(r));
    try {
      const { hash } = await add.mutateAsync(r.ref);
      setPending({ hash });
    } catch {
      // toast handled in the hook
    } finally {
      setAddingKey(null);
    }
  };

  const visible = useMemo(() => {
    if (!data) return [];
    const bucket = SIZE_BUCKETS.find((b) => b.value === size)!;
    const window = DATE_BUCKETS.find((b) => b.value === date)!.ms;
    const cutoff = Number.isFinite(window) ? Date.now() - window : -Infinity;
    const needle = refine.trim().toLowerCase();

    const filtered = data.results.filter((r) => {
      if (type !== 'all' && r.fileType !== type) return false;
      if (r.size < bucket.min || r.size >= bucket.max) return false;
      if (cutoff !== -Infinity && (!r.publishDate || r.publishDate < cutoff)) return false;
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === 'seeders') sorted.sort((a, b) => b.seeders - a.seeders);
    else if (sort === 'date') sorted.sort((a, b) => b.publishDate - a.publishDate);
    else if (sort === 'size') sorted.sort((a, b) => b.size - a.size);
    // 'relevance' keeps the backend order (seeders-ranked).
    return sorted;
  }, [data, type, size, date, sort, refine]);

  if (status.data && !status.data.enabled) {
    return (
      <EmptyState
        icon={SearchX}
        title="Search isn't configured"
        description="Torrent search needs the Jackett indexer service. Once it's running and an indexer (e.g. YTS) is added, search will appear here."
      />
    );
  }

  const showResults = debounced.length >= 2;

  return (
    <section className="space-y-3">
      {/* Search box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search torrents across all indexers…"
          className="pl-9"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Filters + sort */}
      {showResults && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu icon={Film} options={FILE_TYPES} value={type} onChange={setType} />
          <FilterMenu
            icon={HardDrive}
            options={SIZE_BUCKETS.map((b) => ({ label: b.label, value: b.value }))}
            value={size}
            onChange={setSize}
          />
          <FilterMenu
            icon={CalendarClock}
            options={DATE_BUCKETS.map((b) => ({ label: b.label, value: b.value }))}
            value={date}
            onChange={setDate}
          />
          <FilterMenu icon={ArrowUpDown} options={SORTS} value={sort} onChange={setSort} />
          <Input
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            placeholder="Filter results…"
            className="h-9 w-full sm:w-44"
          />
        </div>
      )}

      {/* Indexer warnings */}
      {data?.warnings.length ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Some indexers didn't respond: {data.warnings.join('; ')}</span>
        </div>
      ) : null}

      {/* Results */}
      {!showResults ? (
        <EmptyState
          icon={Search}
          title="Search for torrents"
          description="Type at least two characters to search across your configured indexers."
        />
      ) : isError ? (
        <EmptyState
          icon={SearchX}
          title="Search failed"
          description={apiErrorMessage(error, 'The search engine is unavailable. Try again shortly.')}
        />
      ) : isFetching && !data ? (
        <Card className="divide-y p-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matching results"
          description="Try a different search, or loosen the filters."
        />
      ) : (
        <Card className="divide-y p-0">
          {visible.map((r) => {
            const key = rowKey(r);
            return (
              <div key={key} className="flex items-center gap-3 p-3 hover:bg-accent/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={r.title}>
                    {r.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant="muted" className="capitalize">
                      {r.fileType}
                    </Badge>
                    <span>{r.tracker}</span>
                    <span>{formatBytes(r.size)}</span>
                    <span className="text-success">▲ {r.seeders}</span>
                    <span className="text-destructive">▼ {r.leechers}</span>
                    {r.publishDate ? <span>{formatRelativeTime(r.publishDate)}</span> : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={addingKey === key}
                  onClick={() => onAdd(r)}
                >
                  {addingKey === key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Add</span>
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      {pending && (
        <TorrentFileSelector hash={pending.hash} onClose={() => setPending(null)} />
      )}
    </section>
  );
}
