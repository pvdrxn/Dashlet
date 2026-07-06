import { useState, useCallback, useRef } from 'react';

interface NotesConfig {
  title?: string;
  content?: string;
  lastModified?: string;
}

interface NotesWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

export function NotesWidget({ config, onConfigChange }: NotesWidgetProps) {
  const { title = 'Notes', content = '', lastModified } = config as NotesConfig;
  const [localTitle, setLocalTitle] = useState(title);
  const [localContent, setLocalContent] = useState(content);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((newTitle: string, newContent: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onConfigChange({
        title: newTitle,
        content: newContent,
        lastModified: new Date().toISOString(),
      });
    }, 500);
  }, [onConfigChange]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setLocalTitle(newTitle);
    scheduleSave(newTitle, localContent);
  }, [localContent, scheduleSave]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    scheduleSave(localTitle, newContent);
  }, [localTitle, scheduleSave]);

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
      <div className="flex items-center gap-2">
        <input
          value={localTitle}
          onChange={handleTitleChange}
          className="flex-1 border-none bg-transparent text-sm font-semibold text-gray-200 outline-none"
          aria-label="Note title"
        />
        {modifiedDate && <span className="shrink-0 text-xs text-gray-500">Saved {modifiedDate}</span>}
      </div>
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
}
