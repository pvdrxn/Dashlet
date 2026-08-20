import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { FaHeading } from 'react-icons/fa6';
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiBold, FiChevronDown, FiItalic, FiLink, FiList, FiUnderline } from 'react-icons/fi';

interface NotesConfig {
  title?: string;
  content?: string;
  lastModified?: string;
}

interface NotesWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const HEADINGS = [
  { tag: 'h1', label: 'Heading 1' },
  { tag: 'h2', label: 'Heading 2' },
  { tag: 'h3', label: 'Heading 3' },
  { tag: 'p', label: 'Text' },
] as const;

const LIST_OPTIONS = [
  { type: 'ul', label: 'Bulleted list', preview: '\u2022' },
  { type: 'dash', label: 'Dash list', preview: '\u2212' },
  { type: 'ol', label: 'Numbered list', preview: '1.' },
] as const;

function sanitizeContent(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('ul, ol').forEach((list) => {
    const items = Array.from(list.children).filter((c) => c.tagName === 'LI');
    const hasContent = items.some((li) => li.textContent?.trim());
    if (!hasContent) {
      const div = document.createElement('div');
      list.replaceWith(div);
    }
  });
  return template.innerHTML;
}

export const NotesWidget = memo(function NotesWidget({ config, onConfigChange }: NotesWidgetProps) {
  const { title = 'Notes', content = '' } = config as NotesConfig;
  const editorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formats, setFormats] = useState({ bold: false, italic: false, underline: false });
  const [linkMenu, setLinkMenu] = useState<{ top: number; left: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [align, setAlign] = useState(0);

  useEffect(() => {
    if (editingRef.current || linkMenu) return;
    const editor = editorRef.current;
    if (!editor) return;
    const clean = sanitizeContent(content);
    if (editor.innerHTML !== clean) {
      editor.innerHTML = clean;
      onConfigChange({
        title,
        content: clean,
        lastModified: new Date().toISOString(),
      });
    }
  }, [content, linkMenu, title, onConfigChange]);

  const scheduleSave = useCallback(
    (newContent: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onConfigChange({
          title,
          content: newContent,
          lastModified: new Date().toISOString(),
        });
      }, 500);
    },
    [onConfigChange, title],
  );

  const handleInput = useCallback(() => {
    if (editorRef.current) scheduleSave(editorRef.current.innerHTML);
  }, [scheduleSave]);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const editor = editorRef.current;
      if (!editor) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
      const caret = selection.getRangeAt(0);
      const node = caret.startContainer;

      const li = (() => {
        if (!(node instanceof HTMLElement || node instanceof Text)) return null;
        const container = node instanceof HTMLElement ? node : node.parentElement;
        const insideLi = container?.closest('li');
        if (insideLi) return insideLi;
        const list = container?.closest('ul, ol');
        if (list) {
          const listStart = document.createRange();
          listStart.selectNodeContents(list);
          listStart.collapse(true);
          if (caret.compareBoundaryPoints(Range.START_TO_START, listStart) === 0) {
            return list.querySelector(':scope > li');
          }
          const items = Array.from(list.children) as HTMLLIElement[];
          for (const item of items) {
            const itemStart = document.createRange();
            itemStart.selectNodeContents(item);
            itemStart.collapse(true);
            if (caret.compareBoundaryPoints(Range.START_TO_START, itemStart) === 0) {
              return item;
            }
          }
          return null;
        }
        const lists = Array.from(editor.querySelectorAll('ul, ol'));
        for (const l of lists) {
          const firstLi = l.querySelector(':scope > li');
          if (!firstLi) continue;
          const itemStart = document.createRange();
          itemStart.selectNodeContents(firstLi);
          itemStart.collapse(true);
          if (caret.compareBoundaryPoints(Range.START_TO_START, itemStart) > 0) continue;
          const between = document.createRange();
          between.setStart(caret.startContainer, caret.startOffset);
          between.setEnd(itemStart.startContainer, itemStart.startOffset);
          if (!/\S/.test(between.toString())) return firstLi;
        }
        return null;
      })();

      if (!li) return;
      const liStart = document.createRange();
      liStart.selectNodeContents(li);
      liStart.collapse(true);
      const before = document.createRange();
      before.setStart(liStart.startContainer, liStart.startOffset);
      before.setEnd(caret.startContainer, caret.startOffset);
      if (!/\S/.test(before.toString())) {
        e.preventDefault();
        const div = document.createElement('div');
        div.innerHTML = li.innerHTML;
        li.replaceWith(div);
        const list = li.closest('ul, ol');
        if (list && list.children.length === 0) list.remove();
        const caretRange = document.createRange();
        caretRange.selectNodeContents(div);
        caretRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(caretRange);
        scheduleSave(editor.innerHTML);
        return;
      }
      const liEnd = document.createRange();
      liEnd.selectNodeContents(li);
      liEnd.collapse(false);
      const after = document.createRange();
      after.setStart(caret.startContainer, caret.startOffset);
      after.setEnd(liEnd.startContainer, liEnd.startOffset);
      if (!/\S/.test(after.toString())) {
        e.preventDefault();
        document.execCommand('delete');
        scheduleSave(editor.innerHTML);
      }
    },
    [scheduleSave],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const listMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (listMenuRef.current && !listMenuRef.current.contains(e.target as Node)) {
        setListMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [listMenuOpen]);

  const applyList = useCallback(
    (type: 'ul' | 'dash' | 'ol') => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      if (type === 'ol') {
        document.execCommand('insertOrderedList');
      } else {
        document.execCommand('insertUnorderedList');
        if (type === 'dash') {
          const selection = window.getSelection();
          const node = selection?.anchorNode;
          const li =
            node && node instanceof HTMLElement
              ? node.closest('li')
              : node?.parentElement?.closest('li');
          const ul = li?.closest('ul');
          if (ul) ul.classList.add('dash-list');
        }
      }
      scheduleSave(editorRef.current.innerHTML);
      setListMenuOpen(false);
    },
    [scheduleSave],
  );

  const cycleAlign = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const next = (align + 1) % 3;
    const cmd = next === 1 ? 'justifyCenter' : next === 2 ? 'justifyRight' : 'justifyLeft';
    document.execCommand(cmd);
    setAlign(next);
    scheduleSave(editorRef.current.innerHTML);
  }, [align, scheduleSave]);

  const applyHeading = useCallback(
    (tag: string) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      document.execCommand('formatBlock', false, `<${tag}>`);
      scheduleSave(editorRef.current.innerHTML);
      setMenuOpen(false);
    },
    [scheduleSave],
  );

  useEffect(() => {
    const updateFormats = () => {
      if (!editingRef.current) return;
      setFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
      setAlign(
        document.queryCommandState('justifyCenter')
          ? 1
          : document.queryCommandState('justifyRight')
            ? 2
            : 0,
      );
    };
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, []);

  const execFormat = useCallback(
    (command: string) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      document.execCommand(command);
      scheduleSave(editorRef.current.innerHTML);
    },
    [scheduleSave],
  );

  const linkRangeRef = useRef<Range | null>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);

  const openLinkMenu = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    linkRangeRef.current = range.cloneRange();
    const container =
      range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const anchor = container?.closest('a');
    setLinkUrl(anchor ? anchor.getAttribute('href') ?? '' : '');
    setLinkMenu({ top: rect.bottom + 4, left: rect.left });
  }, []);

  const applyLink = useCallback(() => {
    const rawUrl = linkUrl.trim();
    const range = linkRangeRef.current;
    const editor = editorRef.current;
    if (!rawUrl || !range || !editor) return;
    const url = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const fragment = range.extractContents();
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.appendChild(fragment);
    range.insertNode(anchor);
    scheduleSave(editor.innerHTML);
  }, [linkUrl, scheduleSave]);

  useEffect(() => {
    if (!linkMenu) return;
    const onClick = (e: MouseEvent) => {
      if (linkMenuRef.current && !linkMenuRef.current.contains(e.target as Node)) {
        applyLink();
        setLinkMenu(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [linkMenu, applyLink]);

  return (
    <div className="relative flex h-full flex-col gap-1">
      <div className="flex shrink-0 items-center justify-start">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex items-center gap-1 rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200 ${
                menuOpen ? 'bg-gray-700 text-gray-200' : ''
              }`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Heading options"
            >
              <FaHeading size={14} />
              <FiChevronDown size={12} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-md border border-gray-600 bg-gray-800 shadow-xl"
              >
                {HEADINGS.map((h) => (
                  <button
                    key={h.tag}
                    type="button"
                    role="menuitem"
                    onClick={() => applyHeading(h.tag)}
                    className={`block w-full px-3 py-1.5 text-left text-gray-200 hover:bg-gray-700 ${
                      h.tag === 'h1' ? 'text-2xl' : h.tag === 'h2' ? 'text-xl' : h.tag === 'h3' ? 'text-lg' : 'text-sm'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-1 flex items-center gap-0.5 border-l border-gray-700 pl-1">
            {(
              [
                { command: 'bold', active: formats.bold, icon: <FiBold size={14} />, label: 'Bold' },
                { command: 'italic', active: formats.italic, icon: <FiItalic size={14} />, label: 'Italic' },
                { command: 'underline', active: formats.underline, icon: <FiUnderline size={14} />, label: 'Underline' },
              ] as const
            ).map(({ command, active, icon, label }) => (
              <button
                key={command}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execFormat(command)}
                className={`rounded p-1 hover:bg-gray-700 ${
                  active ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
                aria-label={label}
                aria-pressed={active}
              >
                {icon}
              </button>
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openLinkMenu}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              aria-label="Insert link"
            >
              <FiLink size={14} />
            </button>
            <div className="ml-1 flex items-center gap-0.5 border-l border-gray-700 pl-1">
            <div ref={listMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setListMenuOpen((v) => !v)}
                className={`flex items-center gap-1 rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200 ${
                  listMenuOpen ? 'bg-gray-700 text-gray-200' : ''
                }`}
                aria-haspopup="menu"
                aria-expanded={listMenuOpen}
                aria-label="List options"
              >
                <FiList size={14} />
                <FiChevronDown size={12} />
              </button>
              {listMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-600 bg-gray-800 shadow-xl"
                >
                  {LIST_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      type="button"
                      role="menuitem"
                      onClick={() => applyList(opt.type)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700"
                    >
                      <span className="w-4 text-left text-gray-400">{opt.preview}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="ml-1 flex items-center gap-0.5 border-l border-gray-700 pl-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cycleAlign}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              aria-label="Text alignment"
              title={
                align === 0 ? 'Alignment: left' : align === 1 ? 'Alignment: center' : 'Alignment: right'
              }
            >
              {align === 0 ? (
                <FiAlignLeft size={14} />
              ) : align === 1 ? (
                <FiAlignCenter size={14} />
              ) : (
                <FiAlignRight size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => (editingRef.current = true)}
        onBlur={() => (editingRef.current = false)}
        onInput={handleInput}
        onKeyDown={handleEditorKeyDown}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          const anchor = el.closest('a') as HTMLAnchorElement | null;
          if (anchor?.href) {
            e.preventDefault();
            const url = anchor.href;
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (!win) {
              window.location.href = url;
            }
          }
        }}
        spellCheck={false}
        data-placeholder="Write your notes here..."
        className="relative flex-1 overflow-auto rounded border border-gray-600 bg-gray-800 p-2 text-sm text-gray-200 outline-none focus:border-blue-400 [&_h1]:my-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-100 [&_h2]:my-1 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-100 [&_h3]:my-0.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-100 [&_a]:text-blue-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul.dash-list]:list-none [&_ul.dash-list_li]:relative [&_ul.dash-list_li]:pl-4 [&_ul.dash-list_li:before]:absolute [&_ul.dash-list_li:before]:left-0 [&_ul.dash-list_li:before]:content-['-'] [&:empty:before]:pointer-events-none [&:empty:before]:absolute [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-gray-500"
        style={{ minHeight: '120px' }}
        aria-label="Note content"
      />
      {linkMenu && (
        <div
          ref={linkMenuRef}
          role="dialog"
          aria-label="Insert link"
          className="fixed z-20 flex items-center gap-1 rounded-md border border-gray-600 bg-gray-800 p-1 shadow-xl"
          style={{ top: linkMenu.top, left: linkMenu.left }}
        >
          <input
            autoFocus
            value={linkUrl}
            spellCheck={false}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                applyLink();
                setLinkMenu(null);
              }
            }}
            placeholder="https://..."
            className="w-44 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
            aria-label="Link URL"
          />
        </div>
      )}
    </div>
  );
});