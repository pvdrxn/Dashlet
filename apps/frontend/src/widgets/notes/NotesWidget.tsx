import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { FaHeading } from 'react-icons/fa6';
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiBold, FiChevronDown, FiItalic, FiLink, FiList, FiSearch, FiUnderline, FiX } from 'react-icons/fi';

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
  const [activeHeading, setActiveHeading] = useState('p');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef('');
  const highlightOverlayRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (editingRef.current || linkMenu || searchOpen) return;
    const editor = editorRef.current;
    if (!editor) return;
    const clean = sanitizeContent(content);
    if (editor.innerHTML !== clean) {
      editor.innerHTML = clean;
      contentRef.current = clean;
      onConfigChange({
        title,
        content: clean,
        lastModified: new Date().toISOString(),
      });
    }
  }, [content, linkMenu, title, onConfigChange, searchOpen]);

  useEffect(() => {
    const overlay = highlightOverlayRef.current;
    const editor = editorRef.current;
    if (!overlay || !editor) return;

    if (!searchOpen || !searchQuery.trim()) {
      overlay.innerHTML = '';
      setSearchCount(0);
      return;
    }

    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const walk = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walk.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    let count = 0;
    const frag = document.createDocumentFragment();
    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      if (!regex.test(text)) {
        frag.appendChild(document.createTextNode(text));
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        count++;
        const mark = document.createElement('mark');
        mark.textContent = match[0];
        frag.appendChild(mark);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
    }
    overlay.innerHTML = '';
    overlay.appendChild(frag);
    setSearchCount(count);
  }, [searchQuery, searchOpen]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      contentRef.current = editorRef.current.innerHTML;
      scheduleSave(editorRef.current.innerHTML);
    }
  }, [scheduleSave]);

  const isCaretAtBlockStart = useCallback((container: Node, offset: number): boolean => {
    if (container instanceof Text && offset === 0) {
      const prev = container.previousSibling;
      if (!prev) {
        const parent = container.parentElement;
        if (!parent) return true;
        const block = parent.closest('h1, h2, h3, p, li');
        if (!block || block === parent) return true;
        return false;
      }
      return false;
    }
    if (container instanceof HTMLElement && offset === 0) {
      return !container.previousSibling;
    }
    return false;
  }, []);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;

      const getBlock = (): HTMLElement | null => {
        if (node instanceof HTMLElement) return node.closest('h1, h2, h3, p, li');
        return node.parentElement?.closest('h1, h2, h3, p, li') ?? null;
      };

      const getListItem = (): HTMLLIElement | null => {
        if (node instanceof HTMLElement) return node.closest('li');
        return node.parentElement?.closest('li') ?? null;
      };

      const isAtStart = isCaretAtBlockStart(node, offset);

      const replaceBlockWith = (tag: string) => {
        const block = getBlock();
        if (!block || block.tagName.toLowerCase() === tag) return false;
        const newEl = document.createElement(tag);
        newEl.innerHTML = block.innerHTML;
        block.replaceWith(newEl);
        const r = document.createRange();
        r.selectNodeContents(newEl);
        r.collapse(false);
        selection.removeAllRanges();
        selection.addRange(r);
        return true;
      };

      const removeListAndCreateParagraph = (li: HTMLLIElement) => {
        const list = li.closest('ul, ol');
        const text = li.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        if (list) {
          list.replaceWith(p);
        } else {
          li.replaceWith(p);
        }
        const r = document.createRange();
        r.selectNodeContents(p);
        r.collapse(false);
        selection.removeAllRanges();
        selection.addRange(r);
      };

      if (e.key === 'Enter' && !e.shiftKey) {
        const block = getBlock();
        const tag = block?.tagName.toLowerCase();

        if (tag && ['h1', 'h2', 'h3'].includes(tag)) {
          e.preventDefault();
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          block!.after(p);
          const r = document.createRange();
          r.selectNodeContents(p);
          r.collapse(false);
          selection.removeAllRanges();
          selection.addRange(r);
          scheduleSave(editor.innerHTML);
          return;
        }

        const li = getListItem();
        if (li && !li.textContent?.trim()) {
          e.preventDefault();
          removeListAndCreateParagraph(li);
          scheduleSave(editor.innerHTML);
          return;
        }
      }

      if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const li = getListItem();
        if (li && isAtStart) {
          e.preventDefault();
          if (!li.textContent?.trim()) {
            removeListAndCreateParagraph(li);
          } else {
            const prevLi = li.previousElementSibling as HTMLLIElement | null;
            if (prevLi) {
              const prevText = prevLi.textContent || '';
              const thisText = li.textContent || '';
              prevLi.textContent = prevText + thisText;
              li.remove();
              const list = prevLi.closest('ul, ol');
              if (list && !list.querySelector('li')) list.remove();
              const r = document.createRange();
              r.setStart(prevLi.childNodes[0] || prevLi, prevText.length);
              r.collapse(true);
              selection.removeAllRanges();
              selection.addRange(r);
            } else {
              removeListAndCreateParagraph(li);
            }
          }
          scheduleSave(editor.innerHTML);
          return;
        }

        const block = getBlock();
        if (block && block.tagName.toLowerCase() !== 'p' && isAtStart) {
          e.preventDefault();
          replaceBlockWith('p');
          scheduleSave(editor.innerHTML);
          return;
        }

        if (block?.tagName.toLowerCase() === 'p' && isAtStart) {
          const prev = block.previousElementSibling;
          if (prev && prev instanceof HTMLElement) {
            e.preventDefault();
            const prevText = prev.textContent || '';
            const thisText = block.textContent || '';
            if (prev.tagName === 'P' || prev.tagName.match(/^H[1-3]$/)) {
              prev.textContent = prevText + thisText;
              block.remove();
              const r = document.createRange();
              r.setStart(prev.childNodes[0] || prev, prevText.length);
              r.collapse(true);
              selection.removeAllRanges();
              selection.addRange(r);
            } else {
              const li = prev.closest('li');
              if (li) {
                li.textContent = prevText + thisText;
                const list = li.closest('ul, ol');
                block.remove();
                if (list && !list.querySelector('li')) list.remove();
                const r = document.createRange();
                r.setStart(li.childNodes[0] || li, prevText.length);
                r.collapse(true);
                selection.removeAllRanges();
                selection.addRange(r);
              }
            }
            scheduleSave(editor.innerHTML);
            return;
          }
        }
      }

      if (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const li = getListItem();
        if (li) {
          const liEnd = document.createRange();
          liEnd.selectNodeContents(li);
          liEnd.collapse(false);
          const after = document.createRange();
          after.setStart(node, offset);
          after.setEnd(liEnd.startContainer, liEnd.startOffset);
          if (!/\S/.test(after.toString())) {
            e.preventDefault();
            document.execCommand('delete');
            scheduleSave(editor.innerHTML);
            return;
          }
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const li = getListItem();
        if (li) {
          if (e.shiftKey) {
            const nestedList = li.querySelector(':scope > ul, :scope > ol');
            if (nestedList) {
              const fragment = document.createDocumentFragment();
              while (nestedList.firstChild) fragment.appendChild(nestedList.firstChild);
              nestedList.remove();
              li.after(...Array.from(fragment.childNodes));
            } else {
              const parentList = li.closest('ul, ol');
              const parentLi = parentList?.closest('li');
              if (parentLi) {
                const parentParentList = parentLi.closest('ul, ol');
                parentParentList?.insertBefore(li, parentLi.nextSibling);
              }
            }
          } else {
            const prevLi = li.previousElementSibling;
            if (prevLi && prevLi instanceof HTMLLIElement) {
              let subList = prevLi.querySelector(':scope > ul, :scope > ol') as HTMLElement;
              if (!subList) {
                subList = document.createElement(li.parentElement?.tagName === 'OL' ? 'ol' : 'ul');
                prevLi.appendChild(subList);
              }
              subList.appendChild(li);
            }
          }
          const r = document.createRange();
          r.selectNodeContents(li);
          r.collapse(false);
          selection.removeAllRanges();
          selection.addRange(r);
          scheduleSave(editor.innerHTML);
        }
      }
    },
    [scheduleSave, isCaretAtBlockStart],
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
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const node = selection.getRangeAt(0).startContainer;
      const li = node instanceof HTMLElement
        ? node.closest('li')
        : node.parentElement?.closest('li');
      const existingList = li?.closest('ul, ol');
      const isAlreadySameType =
        existingList &&
        ((type === 'ol' && existingList.tagName === 'OL') ||
          (type !== 'ol' && existingList.tagName === 'UL'));
      if (isAlreadySameType) {
        const items = Array.from(existingList.querySelectorAll(':scope > li'));
        const fragment = document.createDocumentFragment();
        items.forEach((item) => {
          const p = document.createElement('p');
          p.innerHTML = item.innerHTML;
          fragment.appendChild(p);
        });
        existingList.replaceWith(fragment);
      } else {
        if (type === 'ol') {
          document.execCommand('insertOrderedList');
        } else {
          document.execCommand('insertUnorderedList');
          if (type === 'dash') {
            const sel = window.getSelection();
            const n = sel?.anchorNode;
            const liEl = n && n instanceof HTMLElement
              ? n.closest('li')
              : n?.parentElement?.closest('li');
            const ul = liEl?.closest('ul');
            if (ul) ul.classList.add('dash-list');
          }
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
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const node = selection.getRangeAt(0).startContainer;
      const block = node instanceof HTMLElement
        ? node.closest('h1, h2, h3, p')
        : node.parentElement?.closest('h1, h2, h3, p');
      const currentTag = block?.tagName.toLowerCase() || 'p';
      document.execCommand('formatBlock', false, `<${currentTag === tag ? 'p' : tag}>`);
      setActiveHeading(currentTag === tag ? 'p' : tag);
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

  useEffect(() => {
    const updateActiveHeading = () => {
      if (!editingRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const node = selection.getRangeAt(0).startContainer;
      const block = node instanceof HTMLElement
        ? node.closest('h1, h2, h3, p')
        : node.parentElement?.closest('h1, h2, h3, p');
      setActiveHeading(block ? block.tagName.toLowerCase() : 'p');
    };
    document.addEventListener('selectionchange', updateActiveHeading);
    return () => document.removeEventListener('selectionchange', updateActiveHeading);
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
                    className={`block w-full px-3 py-1.5 text-left hover:bg-gray-700 ${
                      activeHeading === h.tag ? 'bg-gray-700 text-white' : 'text-gray-200'
                    } ${
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
          <div className="ml-1 flex items-center gap-0.5 border-l border-gray-700 pl-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearchQuery('');
              }}
              className={`rounded p-1 hover:bg-gray-700 ${
                searchOpen ? 'bg-gray-700 text-gray-200' : 'text-gray-400 hover:text-gray-200'
              }`}
              aria-label="Search in note"
              title="Search"
            >
              <FiSearch size={14} />
            </button>
          </div>
        </div>
      </div>
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-1 rounded border border-blue-500/50 bg-gray-800 px-2 py-1">
          <FiSearch size={12} className="shrink-0 text-gray-400" />
          <input
            ref={searchInputRef}
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder-gray-500"
            aria-label="Search in note"
          />
          {searchQuery && (
            <span className="shrink-0 text-xs text-gray-500">
              {searchCount > 0 ? `${searchCount} found` : 'No matches'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-200"
            aria-label="Close search"
          >
            <FiX size={12} />
          </button>
        </div>
      )}
      <div ref={editorContainerRef} className="relative flex-1 overflow-auto rounded border border-gray-600 bg-gray-800" style={{ minHeight: '120px' }}>
        {searchOpen && searchQuery.trim() && (
          <div
            ref={highlightOverlayRef}
            className="pointer-events-none absolute inset-0 p-2 text-sm leading-[1.4] text-transparent whitespace-pre-wrap break-words [font-family:inherit] [&_mark]:visible [&_mark]:bg-blue-500/30 [&_mark]:text-blue-100 [&_mark]:rounded-sm"
            aria-hidden="true"
          />
        )}
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
          className="relative z-[1] p-2 text-sm leading-[1.4] text-gray-200 outline-none [font-family:inherit] [&_h1]:my-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-100 [&_h2]:my-1 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-100 [&_h3]:my-0.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-100 [&_a]:text-blue-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul.dash-list]:list-none [&_ul.dash-list_li]:relative [&_ul.dash-list_li]:pl-4 [&_ul.dash-list_li:before]:absolute [&_ul.dash-list_li:before]:left-0 [&_ul.dash-list_li:before]:content-['-'] [&:empty:before]:pointer-events-none [&:empty:before]:absolute [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-gray-500"
          style={{ minHeight: '120px' }}
          aria-label="Note content"
        />
      </div>
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