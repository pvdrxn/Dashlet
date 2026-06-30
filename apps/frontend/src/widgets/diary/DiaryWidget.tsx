import { useState, useCallback, useMemo } from 'react';

interface DiaryConfig {
  entries?: Record<string, string>;
}

interface DiaryWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

function snippet(text: string, query: string, maxLen = 60): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - Math.floor((maxLen - query.length) / 2));
  const end = Math.min(text.length, start + maxLen);
  let s = text.slice(start, end);
  if (start > 0) s = '…' + s;
  if (end < text.length) s = s + '…';
  return s;
}

export function DiaryWidget({ config, onConfigChange }: DiaryWidgetProps) {
  const { entries = {} } = config as DiaryConfig;
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const pageKey = String(page);
  const content = entries[pageKey] ?? '';

  const handleChange = useCallback((value: string) => {
    onConfigChange({
      ...config,
      entries: { ...entries, [pageKey]: value },
    });
  }, [config, entries, pageKey, onConfigChange]);

  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPage((p) => p + 1), []);
  const isFirstPage = page === 1;

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return Object.entries(entries)
      .filter(([, text]) => text.toLowerCase().includes(q))
      .map(([p]) => Number(p))
      .sort((a, b) => a - b);
  }, [entries, searchQuery]);

  const goToPage = useCallback((p: number) => {
    setPage(p);
    setShowSearch(false);
    setSearchQuery('');
  }, []);

  const toggleSearch = useCallback(() => {
    setShowSearch((s) => !s);
    setSearchQuery('');
  }, []);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between border-b border-gray-700 pb-1">
        <button
          onClick={goPrev}
          className={`text-lg ${isFirstPage ? 'text-gray-600 cursor-default' : 'text-gray-500 hover:text-gray-300'}`}
          disabled={isFirstPage}
        >
          &#x25C0;
        </button>
        <span className="text-sm font-semibold text-gray-200">Page {page}</span>
        <div className="flex items-center gap-2">
          <button onClick={toggleSearch} className="text-gray-500 hover:text-gray-300" title="Search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
          </button>
          <button onClick={goNext} className="text-lg text-gray-500 hover:text-gray-300">&#x25B6;</button>
        </div>
      </div>
      {showSearch && (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            spellCheck={false}
            autoFocus
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
          />
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-gray-700 bg-gray-800">
              {results.map((p) => {
                const text = entries[String(p)] ?? '';
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-sm hover:bg-gray-700 border-b border-gray-700 last:border-b-0"
                  >
                    <span className="text-xs font-semibold text-blue-400">Page {p}</span>
                    <span className="text-xs text-gray-400 truncate">{snippet(text, searchQuery)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {searchQuery.trim() && results.length === 0 && (
            <p className="text-xs text-gray-500 px-1">No results found</p>
          )}
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Write something..."
        spellCheck={false}
        className="flex-1 resize-none rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
      />
    </div>
  );
}
