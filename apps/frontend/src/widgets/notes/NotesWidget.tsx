import { memo, useState, useEffect, useCallback, useRef } from 'react';

interface NotesConfig {
  title?: string;
  content?: string;
  lastModified?: string;
}

interface NotesWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

export const NotesWidget = memo(function NotesWidget({ config, onConfigChange }: NotesWidgetProps) {
  const { title = 'Notes', content = '', lastModified } = config as NotesConfig;
  const [localContent, setLocalContent] = useState(content);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((newContent: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onConfigChange({
        title,
        content: newContent,
        lastModified: new Date().toISOString(),
      });
    }, 500);
  }, [onConfigChange, title]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    scheduleSave(newContent);
  }, [scheduleSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const modifiedDate = lastModified
    ? new Date(lastModified).toLocaleString()
    : null;

  return (
    <div className="flex h-full flex-col gap-2">
      {modifiedDate && <span className="shrink-0 text-xs text-gray-500">Saved {modifiedDate}</span>}
      <textarea
        value={localContent}
        onChange={handleContentChange}
        placeholder="Write your notes here..."
        className="flex-1 resize-none rounded border border-gray-600 bg-gray-700 p-2 text-sm text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
        style={{ minHeight: '120px' }}
        aria-label="Note content"
      />
    </div>
  );
});
