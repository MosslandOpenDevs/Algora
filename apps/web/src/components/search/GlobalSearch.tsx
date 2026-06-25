'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Search, User, FileText, AlertCircle, Radio, MessageSquare, Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface SearchResult {
  id: string;
  type: 'agent' | 'proposal' | 'issue' | 'signal' | 'session';
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
  url: string;
}

interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

const typeIcons = {
  agent: User,
  proposal: FileText,
  issue: AlertCircle,
  signal: Radio,
  session: MessageSquare,
};

const typeColors = {
  agent: 'text-purple-500',
  proposal: 'text-blue-500',
  issue: 'text-orange-500',
  signal: 'text-green-500',
  session: 'text-pink-500',
};

const typeBadgeVariants = {
  agent: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  proposal: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  issue: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  signal: 'bg-green-500/10 text-green-500 border-green-500/20',
  session: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
};

const typeLabels = {
  agent: 'Agent',
  proposal: 'Proposal',
  issue: 'Issue',
  signal: 'Signal',
  session: 'Session',
};

export function GlobalSearch() {
  const t = useTranslations('Search');
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split('/')[1] || 'en';

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search query
  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = useCallback((url: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(`/${locale}${url}`);
  }, [router, locale]);

  // Group results by type
  const groupedResults = data?.results?.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>) || {};

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-agora-border dark:border-agora-dark-border bg-agora-darker dark:bg-agora-dark-card px-2 sm:px-3 py-1.5 text-sm text-agora-muted hover:bg-agora-card dark:hover:bg-agora-dark-border transition-colors min-h-[36px]"
      >
        <Search className="h-4 w-4 flex-shrink-0" />
        <span className="hidden md:inline">{t('button')}</span>
        <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-agora-border dark:border-agora-dark-border bg-agora-dark dark:bg-agora-dark-darker px-1.5 text-[10px] font-medium text-agora-muted">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Command palette dialog */}
      <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
        <CommandInput
          placeholder={t('placeholder') || 'Search agents, proposals, issues...'}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[60vh]">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-agora-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!isLoading && query.length >= 2 && (!data?.results || data.results.length === 0) && (
            <CommandEmpty>{t('noResults') || 'No results found'}</CommandEmpty>
          )}

          {!isLoading && Object.entries(groupedResults).map(([type, results], index) => {
            const Icon = typeIcons[type as keyof typeof typeIcons];
            return (
              <div key={type}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={typeLabels[type as keyof typeof typeLabels]}>
                  {results.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.title}`}
                      onSelect={() => handleResultClick(result.url)}
                      className="flex items-start gap-3 py-3"
                    >
                      <div className={`flex-shrink-0 mt-0.5 ${typeColors[result.type]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{result.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${typeBadgeVariants[result.type]}`}>
                            {typeLabels[result.type]}
                          </span>
                        </div>
                        {result.description && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {result.description}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}

          {query.length < 2 && !isLoading && (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">{t('typeToSearch') || 'Type at least 2 characters to search'}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">Agents</Badge>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Proposals</Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Issues</Badge>
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Signals</Badge>
                <Badge variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/20">Sessions</Badge>
              </div>
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
