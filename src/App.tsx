import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://snyyukojboitojcdcslr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueXl1a29qYm9pdG9qY2Rjc2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NjcyODgsImV4cCI6MjEwODE0MzI4OH0.S4fIgtormOtWi41xqlVzLJ3LS2d9lFRMKlnSxW3USWg';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent as ReactMouseEvent } from 'react';

interface Tab {
  id: string;
  title: string;
  icon?: string;
  content: string;
}

interface Note {
  id: string;
  title: string;
  icon?: string;
  tabs: Tab[];
  activeTabId: string;
}

interface Folder {
  id: string;
  name: string;
  icon?: string;
  notes: Note[];
}

type PickerState = { kind: 'text' | 'highlight' | 'cellBg'; x: number; y: number } | null;
type DropdownState = { kind: 'style' | 'font' | 'size' | 'lineHeight' | 'zoom'; x: number; y: number } | null;
type TopMenuState = 'file' | 'edit' | 'view' | 'insert' | 'format' | 'tools' | null;
type Snapshot = { html: string; caret: number };

const EDITOR_FONT_SIZE = 16;
const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36];
const LINE_HEIGHTS = ['1', '1.15', '1.25', '1.5', '1.75', '2'];
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];

const SYSTEM_FONTS = [
  'IBM Plex Sans',
  'Arial',
  'Inter',
  'Roboto',
  'Merriweather',
  'Playfair Display',
  'Lora',
  'Montserrat',
  'Fira Code',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS'
];

const SPECIAL_CHARS = [
  '©', '®', '™', '°', '±', '≠', '≈', '≤', '≥', '÷', '×', '∞', '√', '∑', 'π',
  '←', '→', '↑', '↓', '↔', '⇒', '⇔', '✓', '✗', '★', '☆', '♥', '♦', '♣', '♠',
  '«', '»', '“', '”', '‘', '’', '—', '–', '…', '§', '¶', '€', '\$', '£', '¥'
];

const BLOCK_STYLE_LABELS: Record<string, string> = {
  p: 'Normal',
  h1: 'Titre 1',
  h2: 'Titre 2',
  h3: 'Titre 3',
};

const hslToHex = (h: number, sat: number, light: number): string => {
  const sN = sat / 100;
  const lN = light / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(255 * v).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
};

const COLOR_PALETTE: string[] = (() => {
  const grays = Array.from({ length: 10 }, (_, i) => hslToHex(0, 0, (i / 9) * 100));
  const hues = [0, 25, 45, 60, 120, 165, 200, 220, 270, 320];
  const lights = [90, 78, 65, 52, 40, 28, 18];
  const rows = lights.flatMap((l) => hues.map((h) => hslToHex(h, l >= 52 ? 85 : 75, l)));
  return [...grays, ...rows];
})();

const TEXT_COLORS = COLOR_PALETTE;
const HIGHLIGHT_COLORS = COLOR_PALETTE;

const ROOT_ID = '__root__';
const STORAGE_KEY = 'notes-app-v23';

const createDefaultNote = (id: string, title: string): Note => ({
  id,
  title,
  icon: '📄',
  tabs: [{ id: `${id}-t1`, title: 'Principal', icon: '📝', content: '' }],
  activeTabId: `${id}-t1`,
});

const DEFAULT_FOLDERS: Folder[] = [
  {
    id: '1',
    name: 'Notes personnelles',
    icon: '📁',
    notes: [createDefaultNote('n1', 'Première note')],
  },
  { id: ROOT_ID, name: 'Sans dossier', icon: '📄', notes: [] },
];

type SavedState = {
  folders: Folder[];
  activeFolderId: string;
  activeNoteId: string;
  collapsedFolders: Record<string, boolean>;
};

const loadSavedState = (): SavedState => {
  const fallback: SavedState = {
    folders: DEFAULT_FOLDERS,
    activeFolderId: '1',
    activeNoteId: 'n1',
    collapsedFolders: {},
  };
  try {
    // Utilisation de sessionStorage : survit au rafraîchissement, s'efface à la fermeture de l'onglet
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.folders)) return fallback;
    const folders: Folder[] = data.folders.map((f: any) => ({
      ...f,
      notes: (f.notes || []).map((n: any) => {
        if (!n.tabs || !Array.isArray(n.tabs) || n.tabs.length === 0) {
          const defaultTabId = `${n.id}-t1`;
          return {
            ...n,
            tabs: [{ id: defaultTabId, title: 'Principal', icon: '📝', content: n.content || '' }],
            activeTabId: defaultTabId,
          };
        }
        return {
          ...n,
          tabs: n.tabs.map((t: any) => ({ ...t, icon: t.icon || '📝' })),
        };
      }),
    }));
    if (!folders.some((f) => f.id === ROOT_ID)) {
      folders.push({ id: ROOT_ID, name: 'Sans dossier', icon: '📄', notes: [] });
    }
    return {
      folders,
      activeFolderId: typeof data.activeFolderId === 'string' ? data.activeFolderId : fallback.activeFolderId,
      activeNoteId: typeof data.activeNoteId === 'string' ? data.activeNoteId : '',
      collapsedFolders: data.collapsedFolders && typeof data.collapsedFolders === 'object' ? data.collapsedFolders : {},
    };
  } catch {
    return fallback;
  }
};

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
};

const htmlToMarkdown = (html: string): string => {
  const root = document.createElement('div');
  root.innerHTML = html;

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof HTMLElement)) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    const inner = Array.from(node.childNodes).map(inline).join('');
    if (!inner.trim()) return inner;
    const style = node.style;
    let out = inner;
    if (tag === 'a') out = `[${inner}](${node.getAttribute('href') || ''})`;
    if (tag === 'b' || tag === 'strong' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) out = `**${out}**`;
    if (tag === 'i' || tag === 'em' || style.fontStyle === 'italic') out = `*${out}*`;
    if (tag === 's' || tag === 'strike' || tag === 'del' || style.textDecoration.includes('line-through')) out = `~~${out}~~`;
    return out;
  };

  const blocks: string[] = [];
  const pushBlock = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    const text = Array.from(el.childNodes).map(inline).join('').trim();
    if (/^h[1-3]$/.test(tag)) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
    else if (tag === 'blockquote') blocks.push(text.split('\n').map((l) => `> ${l}`).join('\n'));
    else if (tag === 'ul') {
      blocks.push(
        Array.from(el.children).map((li) => `- ${Array.from(li.childNodes).map(inline).join('').trim()}`).join('\n')
      );
    } else if (tag === 'ol') {
      blocks.push(
        Array.from(el.children).map((li, i) => `${i + 1}. ${Array.from(li.childNodes).map(inline).join('').trim()}`).join('\n')
      );
    } else if (text) blocks.push(text);
  };

  let loose = '';
  const flushLoose = () => {
    if (loose.trim()) blocks.push(loose.trim());
    loose = '';
  };
  root.childNodes.forEach((child) => {
    if (child instanceof HTMLElement && ['div', 'p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol'].includes(child.tagName.toLowerCase())) {
      flushLoose();
      pushBlock(child);
    } else {
      loose += inline(child);
    }
  });
  flushLoose();
  return blocks.join('\n\n') + '\n';
};

const uiFontFamily =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TABLE_PICKER_ROWS = 10;
const TABLE_PICKER_COLS = 10;
const TABLE_DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 30;

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Fira+Code:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Roboto:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap');

  :root {
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --parchment: cubic-bezier(0.12, 0.95, 0.28, 1.15);
    --ink: #0f172a;
  }
  html, body, #root {
    margin: 0 !important; padding: 0 !important;
    width: 100vw !important; height: 100vh !important;
    overflow: hidden !important; box-sizing: border-box !important;
  }
  * { box-sizing: border-box; }
  ::selection { background: rgba(100, 116, 139, 0.3); }

  .app-bg {
    position: relative; overflow: hidden; display: flex; flex-direction: column;
    width: 100vw; height: 100vh; color: var(--ink);
    background: linear-gradient(135deg, #eceef2 0%, #dfe3e9 50%, #d0d6df 100%);
  }
  .blob {
    position: absolute; border-radius: 50%; filter: blur(70px);
    opacity: 0.45; pointer-events: none;
    animation: floaty 20s ease-in-out infinite;
  }
  .blob.b1 { width: 460px; height: 460px; background: #ffffff; top: -120px; left: 8%; }
  .blob.b2 { width: 420px; height: 420px; background: #9aa5b8; bottom: -140px; right: 10%; animation-delay: -7s; }
  .blob.b3 { width: 320px; height: 320px; background: #e5e9ef; top: 38%; left: 46%; animation-delay: -13s; }
  @keyframes floaty {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(70px, 40px) scale(1.12); }
    66% { transform: translate(-50px, 80px) scale(0.94); }
  }

  .glass {
    position: relative;
    background: linear-gradient(135deg, rgba(255,255,255,0.64), rgba(255,255,255,0.32));
    backdrop-filter: blur(28px) saturate(190%);
    -webkit-backdrop-filter: blur(28px) saturate(190%);
    box-shadow: 0 10px 40px rgba(30, 41, 90, 0.08);
  }
  .glass::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    pointer-events: none; z-index: 0;
    background: linear-gradient(115deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.12) 32%, transparent 55%);
  }
  .glass > * { position: relative; z-index: 1; }

  .glass.menu, .glass.modal, .glass.picker {
    background: #ffffff;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: 1px solid rgba(15, 23, 42, 0.12);
  }
  .glass.menu::before, .glass.modal::before, .glass.picker::before { display: none; }
  .glass.menu .menu-item:hover { background: #f1f5f9; }
  .glass.menu .menu-item.danger:hover { background: #fee2e2; }

  .parchment-unfurl {
    transform: translateX(-50%);
    white-space: nowrap;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.06);
    border-radius: 14px;
  }
  .glass > .roll-roller {
    position: absolute; left: 0; right: 0; top: 0; height: 14px;
    border-radius: 7px; pointer-events: none; z-index: 5; opacity: 0;
    will-change: transform, opacity;
    background: linear-gradient(180deg, #94a3b8 0%, #e2e8f0 22%, #ffffff 45%, #cbd5e1 72%, #64748b 100%);
    box-shadow: 0 5px 9px rgba(15, 23, 42, 0.35);
  }

  body.resizing-col, body.resizing-col * { cursor: col-resize !important; user-select: none !important; }
  body.resizing-row, body.resizing-row * { cursor: row-resize !important; user-select: none !important; }

  .tool-arrow {
    display: inline-block;
    font-size: 0.62rem;
    opacity: 0.65;
    transition: transform 0.25s var(--spring);
    margin-left: 2px;
  }
  .tool-arrow.open {
    transform: rotate(180deg);
    opacity: 1;
  }

  .top-menubar {
    height: 34px; min-height: 34px; width: 100vw;
    display: flex; align-items: center; gap: 4px; padding: 0 16px;
    background: rgba(255, 255, 255, 0.52);
    border-bottom: 1px solid rgba(15, 23, 42, 0.09);
    z-index: 600;
  }
  .top-menu-item {
    padding: 3px 9px; border-radius: 6px; cursor: pointer;
    font-size: 0.8rem; font-weight: 500; color: #1e293b;
    transition: background 0.15s, color 0.15s;
  }
  .top-menu-item:hover, .top-menu-item.active {
    background: rgba(15, 23, 42, 0.08);
    color: #0f172a;
  }

  .sidebar-pane {
    background: linear-gradient(135deg, rgba(245,247,250,0.8), rgba(235,240,246,0.68));
    border-right: 1.5px solid rgba(15, 23, 42, 0.12) !important;
    box-shadow: 6px 0 24px rgba(15, 23, 42, 0.05);
  }

  .tb-btn {
    position: relative; overflow: hidden; flex-shrink: 0;
    height: 30px; min-width: 30px; padding: 0 8px; gap: 4px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 9px; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: #1e293b;
    background: rgba(255,255,255,0.45);
    border: 1px solid rgba(255,255,255,0.85);
    white-space: nowrap; font-family: inherit;
    box-shadow: 0 2px 6px rgba(30,41,90,0.06);
    transition: transform 0.25s var(--spring), background 0.2s ease, box-shadow 0.25s ease;
  }
  .tb-btn::after {
    content: ''; position: absolute; top: 0; left: -120%; width: 55%; height: 100%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.95), transparent);
    transform: skewX(-20deg); transition: left 0.6s var(--ease); pointer-events: none;
  }
  .tb-btn:hover { background: rgba(255,255,255,0.75); transform: translateY(-1px); box-shadow: 0 5px 12px rgba(30,41,90,0.12); }
  .tb-btn:active { transform: scale(0.92); }
  .tb-btn:active::after { left: 140%; }
  .tb-btn.on {
    background: rgba(15,23,42,0.12); border-color: rgba(15,23,42,0.25);
    box-shadow: inset 0 1px 3px rgba(15,23,42,0.15); animation: btnPop 0.45s var(--spring);
  }
  .tb-btn.on::after { left: 140%; }

  .tb-custom-trigger {
    height: 30px; padding: 0 9px; border-radius: 9px; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.85); background: rgba(255,255,255,0.5);
    font-size: 0.8rem; font-weight: 600; color: #1e293b; cursor: pointer;
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    font-family: inherit; box-shadow: 0 2px 6px rgba(30,41,90,0.05);
    transition: background 0.2s ease, box-shadow 0.25s ease, transform 0.25s var(--spring);
  }
  .tb-custom-trigger:hover { background: rgba(255,255,255,0.85); box-shadow: 0 5px 12px rgba(30,41,90,0.1); transform: translateY(-1px); }
  .tb-custom-trigger:active { transform: scale(0.95); }

  .tb-sep { height: 18px; width: 1.5px; background: rgba(15,23,42,0.15); flex-shrink: 0; }

  .size-box {
    display: flex; align-items: center; height: 30px; width: 84px; min-width: 84px; max-width: 84px;
    padding: 0 1px; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.85); border-radius: 9px; background: rgba(255,255,255,0.5);
    box-shadow: 0 2px 6px rgba(30,41,90,0.05);
  }
  .size-box button {
    border: none; background: transparent; cursor: pointer; width: 23px; height: 100%;
    display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0;
    font-weight: bold; color: #1e293b; border-radius: 7px; transition: background 0.2s, transform 0.2s var(--spring);
  }
  .size-box button:hover { background: rgba(255,255,255,0.9); }
  .size-box button:active { transform: scale(0.85); }
  .size-trigger-btn {
    border: none; background: transparent; font-size: 0.8rem; font-weight: 600; cursor: pointer;
    color: #1e293b; width: 38px; min-width: 38px; max-width: 38px; padding: 0; font-family: inherit; height: 100%;
    display: flex; align-items: center; justify-content: center; gap: 2px;
  }
  .size-trigger-btn span:first-child {
    font-variant-numeric: tabular-nums;
    text-align: center;
    width: 20px;
    display: inline-block;
  }

  .tabs-bar {
    display: flex; align-items: flex-end; gap: 6px; padding: 8px 18px 0 18px;
    background: rgba(230, 235, 243, 0.45);
    border-bottom: 1px solid rgba(15,23,42,0.08);
    overflow-x: auto; flex-shrink: 0;
  }
  .tab-item {
    display: flex; align-items: center; gap: 7px; padding: 7px 14px;
    border-radius: 11px 11px 0 0; font-size: 0.82rem; font-weight: 500; color: #475569;
    cursor: pointer; border: 1px solid rgba(255,255,255,0.65); border-bottom: none;
    background: rgba(255,255,255,0.32); backdrop-filter: blur(12px);
    transition: transform 0.25s var(--spring), background 0.2s, color 0.2s;
    max-width: 200px;
  }
  .tab-item:hover { color: #0f172a; background: rgba(255,255,255,0.65); transform: translateY(-2px); }
  .tab-item.active {
    color: #0f172a; font-weight: 650;
    background: rgba(255,255,255,0.88);
    border-color: rgba(255,255,255,0.95);
    box-shadow: 0 -4px 12px rgba(30,41,90,0.06);
    transform: translateY(0);
  }
  .tab-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tab-close {
    font-size: 0.72rem; border-radius: 5px; padding: 1px 4px; opacity: 0.55;
    transition: opacity 0.2s, background 0.2s;
  }
  .tab-close:hover { opacity: 1; background: rgba(15,23,42,0.1); }
  .tab-add-btn {
    border: 1px solid rgba(255,255,255,0.7); background: rgba(255,255,255,0.45);
    cursor: pointer; padding: 4px 10px; margin-bottom: 3px;
    border-radius: 8px; font-size: 0.95rem; font-weight: 700; color: #334155;
    transition: transform 0.2s var(--spring), background 0.2s;
  }
  .tab-add-btn:hover { background: rgba(255,255,255,0.85); transform: scale(1.08); }

  .action-btn {
    position: relative; overflow: hidden; flex: 1;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 9px 12px; border-radius: 11px; cursor: pointer;
    font-size: 0.8rem; font-weight: 600; color: #1e293b; font-family: inherit;
    background: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.85);
    box-shadow: 0 2px 6px rgba(30,41,90,0.05);
    transition: transform 0.25s var(--spring), background 0.2s, box-shadow 0.25s;
  }
  .action-btn svg { display: block; flex-shrink: 0; }
  .action-btn:hover { background: rgba(255,255,255,0.9); transform: translateY(-2px); box-shadow: 0 10px 20px rgba(30,41,90,0.12); }
  .action-btn:active { transform: translateY(0); }

  .row {
    display: flex; align-items: center; gap: 8px; cursor: pointer; overflow: hidden;
    border-radius: 11px; width: 100%; border: 1px solid transparent;
    transition: background 0.25s ease, transform 0.3s var(--spring), box-shadow 0.3s ease, border-color 0.25s;
  }
  .row:hover { background: rgba(255,255,255,0.5); transform: translateX(3px); }
  .row:active { transform: translateX(3px) scale(0.98); }
  .row.active {
    background: rgba(15,23,42,0.08);
    border-color: rgba(15,23,42,0.06);
  }
  .row.root-note { padding: 9px 11px; font-size: 0.85rem; font-weight: 600; color: #0f172a; }
  .card {
    display: flex; flex-direction: column; gap: 2px; padding: 4px; flex-shrink: 0;
    border-radius: 14px; background: rgba(255,255,255,0.45);
    border: 1px solid rgba(255,255,255,0.8);
    box-shadow: 0 2px 10px rgba(30,41,90,0.05);
    transition: background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  }
  .card:hover { background: rgba(255,255,255,0.65); }
  .card.current {
    background: rgba(255,255,255,0.85); border-color: rgba(255,255,255,0.95);
    box-shadow: 0 8px 22px rgba(30,41,90,0.1), inset 0 1px 0 #fff;
  }
  .row.folder { padding: 9px 11px; justify-content: space-between; font-weight: 650; font-size: 0.86rem; color: #0f172a; }
  .row.note { padding: 8px 11px; font-size: 0.83rem; color: #334155; }
  .row.note.active { color: var(--ink); font-weight: 600; }
  .notes-list { animation: drop 0.35s var(--ease); }
  @keyframes drop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
  .chev { font-size: 0.75rem; padding: 2px 7px; opacity: 0.65; border-radius: 6px; transition: background 0.2s, opacity 0.2s; }
  .chev:hover { background: rgba(255,255,255,0.8); opacity: 1; }

  .toggle-tab {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 20px; height: 52px; border-radius: 0 10px 10px 0; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.62rem; color: #334155; font-weight: bold;
    background: rgba(255,255,255,0.88); backdrop-filter: blur(12px);
    border: 1px solid rgba(15,23,42,0.12); border-left: none;
    box-shadow: 4px 0 14px rgba(30,41,90,0.12);
    transition: left 0.45s var(--ease), width 0.2s var(--spring), background 0.2s;
    z-index: 550; padding: 0; box-sizing: border-box;
  }
  .toggle-tab:hover { width: 26px; background: #ffffff; }

  .brand {
    display: flex; align-items: center; gap: 11px; user-select: none; cursor: default;
    position: relative; overflow: visible;
  }
  .brand-mark {
    position: relative; width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #475569, #1e293b 60%, #0f172a);
    box-shadow: 0 7px 16px rgba(15,23,42,0.28);
    transition: transform 0.4s var(--spring), box-shadow 0.3s ease;
  }
  .brand-mark svg { overflow: visible; }
  
  .brand:hover .brand-mark {
    transform: translateY(-2px) scale(1.04);
    box-shadow: 0 12px 22px rgba(15,23,42,0.32);
  }

  .brand .pg { transform-origin: 12px 12px; opacity: 0; }
  .brand:hover .pg { animation: bookFlip 2s ease-in-out infinite; }
  .brand:hover .pg2 { animation-delay: 0.2s; }
  .brand:hover .pg3 { animation-delay: 0.4s; }
  .brand:hover .ribbon { animation: ribbonWag 0.9s ease-in-out infinite; }
  .brand .ribbon { transform-origin: 16.7px 5px; }

  @keyframes bookFlip {
    0%   { transform: scaleX(1); opacity: 0; }
    8%   { transform: scaleX(1); opacity: 1; }
    38%  { transform: translateY(-0.7px) scaleX(0.05); opacity: 1; }
    64%  { transform: scaleX(-1); opacity: 1; }
    84%  { transform: scaleX(-1); opacity: 1; }
    100% { transform: scaleX(-1); opacity: 0; }
  }
  @keyframes ribbonWag {
    0%, 100% { transform: rotate(0deg); }
    50%      { transform: rotate(7deg); }
  }

  .brand-word {
    font-family: 'Cinzel', 'Playfair Display', Georgia, serif;
    font-style: normal; font-weight: 700; font-size: 1.55rem; line-height: 1;
    letter-spacing: 0.04em; color: #0f172a; padding: 0 2px;
    display: block; position: relative;
    text-transform: lowercase;
    background: linear-gradient(115deg,
      #0f172a 0%, #0f172a 38%,
      #ffffff 48%, #dbeafe 51%, #0f172a 62%, #0f172a 100%);
    background-size: 260% 100%;
    background-position: 100% 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 1px 0 rgba(255,255,255,0.25);
    filter: drop-shadow(0 1px 0 rgba(15,23,42,0.28)) drop-shadow(0 3px 3px rgba(15,23,42,0.16));
    transition: filter 0.35s ease, transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
    transform: translateY(0) scale(1);
  }
  .brand:hover .brand-word {
    animation: textShimmer 2.4s ease-in-out infinite;
    transform: translateY(-2px) scale(1.035);
    filter: drop-shadow(0 2px 0 rgba(255,255,255,0.45)) drop-shadow(0 5px 5px rgba(15,23,42,0.24));
  }
  @keyframes textShimmer {
    0%   { background-position: 100% 0; }
    45%  { background-position: -20% 0; }
    100% { background-position: -20% 0; }
  }

  .bfly-stage {
    position: absolute; inset: 0; width: 40px; height: 40px; pointer-events: none; overflow: visible; z-index: 10;
  }
  .bfly {
    position: absolute; width: 16px; height: 16px; opacity: 0; pointer-events: none;
    top: 50%; left: 50%;
    margin-top: -8px; margin-left: -8px;
    transform-origin: 50% 50%;
    transition: opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: transform, opacity;
  }
  .brand:hover .bfly {
    opacity: 1;
    transition: opacity 0.35s ease;
  }

  .bfly-profile {
    position: relative; width: 100%; height: 100%;
  }
  .bfly-wing-back, .bfly-wing-front {
    position: absolute;
    bottom: 3.5px;
    left: 2px;
    width: 12px;
    height: 10px;
    transform-origin: 5px 9px;
  }
  .bfly-wing-back { filter: brightness(0.7); opacity: 0.78; }
  .bfly-body-side {
    position: absolute;
    z-index: 2;
    left: 3px;
    bottom: 2px;
    width: 9.5px;
    height: 2.2px;
    background: #172033;
    border-radius: 2px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.25);
  }

  .bfly-1 .bfly-wing-front { animation: flapHFront1 0.15s ease-in-out infinite alternate; }
  .bfly-1 .bfly-wing-back  { animation: flapHBack1 0.15s ease-in-out infinite alternate-reverse; }

  .bfly-2 .bfly-wing-front { animation: flapHFront2 0.21s ease-in-out infinite alternate; }
  .bfly-2 .bfly-wing-back  { animation: flapHBack2 0.21s ease-in-out infinite alternate-reverse; }

  .bfly-3 .bfly-wing-front { animation: flapHFront3 0.18s ease-in-out infinite alternate; }
  .bfly-3 .bfly-wing-back  { animation: flapHBack3 0.18s ease-in-out infinite alternate-reverse; }

  @keyframes flapHFront1 {
    from { transform: scaleY(0.2) rotateZ(-4deg); }
    to   { transform: scaleY(1.05) rotateZ(8deg); }
  }
  @keyframes flapHBack1 {
    from { transform: scaleY(0.18) rotateZ(-10deg); }
    to   { transform: scaleY(0.85) rotateZ(4deg); }
  }
  @keyframes flapHFront2 {
    from { transform: scaleY(0.25) rotateZ(-6deg); }
    to   { transform: scaleY(1.15) rotateZ(12deg); }
  }
  @keyframes flapHBack2 {
    from { transform: scaleY(0.2) rotateZ(-12deg); }
    to   { transform: scaleY(0.92) rotateZ(6deg); }
  }
  @keyframes flapHFront3 {
    from { transform: scaleY(0.22) rotateZ(-3deg); }
    to   { transform: scaleY(0.98) rotateZ(7deg); }
  }
  @keyframes flapHBack3 {
    from { transform: scaleY(0.18) rotateZ(-8deg); }
    to   { transform: scaleY(0.8) rotateZ(3deg); }
  }

  .bfly-1 {
    transform: translate(-14px, -8px) scale(0.92);
    animation: flightPathSym1 5.2s ease-in-out infinite;
  }
  .bfly-1 .bfly-wing-front, .bfly-1 .bfly-wing-back { fill: #f59e0b; }
  @keyframes flightPathSym1 {
    0%   { transform: translate(-14px, -8px) scale(0.92); }
    25%  { transform: translate(14px, -12px) scale(1.03); }
    48%  { transform: translate(18px, 12px) scaleX(-1) scale(0.96); }
    72%  { transform: translate(-8px, 16px) scaleX(-1) scale(1.02); }
    88%  { transform: translate(-18px, 4px) scale(0.94); }
    100% { transform: translate(-14px, -8px) scale(0.92); }
  }

  .bfly-2 {
    transform: translate(16px, 10px) scaleX(-1) scale(0.88);
    animation: flightPathSym2 6.6s ease-in-out infinite;
  }
  .bfly-2 .bfly-wing-front, .bfly-2 .bfly-wing-back { fill: #06b6d4; }
  @keyframes flightPathSym2 {
    0%   { transform: translate(16px, 10px) scaleX(-1) scale(0.88); }
    24%  { transform: translate(-12px, 14px) scaleX(-1) scale(0.98); }
    46%  { transform: translate(-16px, -6px) scale(1); }
    68%  { transform: translate(6px, -12px) scale(1.04); }
    85%  { transform: translate(18px, 0px) scaleX(-1) scale(0.92); }
    100% { transform: translate(16px, 10px) scaleX(-1) scale(0.88); }
  }

  .bfly-3 {
    transform: translate(0px, -14px) scale(0.95);
    animation: flightPathSym3 4.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .bfly-3 .bfly-wing-front, .bfly-3 .bfly-wing-back { fill: #ec4899; }
  @keyframes flightPathSym3 {
    0%   { transform: translate(0px, -14px) scale(0.95); }
    25%  { transform: translate(16px, -2px) scaleX(-1) scale(1.04); }
    50%  { transform: translate(4px, 14px) scaleX(-1) scale(0.92); }
    75%  { transform: translate(-16px, 2px) scale(1.02); }
    100% { transform: translate(0px, -14px) scale(0.95); }
  }

  @media (prefers-reduced-motion: reduce) {
    .brand:hover .brand-mark::after,
    .brand:hover .brand-word,
    .brand:hover .bfly,
    .brand:hover .bfly-wing-front,
    .brand:hover .bfly-wing-back,
    .brand:hover .pg,
    .brand:hover .ribbon { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
  }

  .tp-label {
    font-size: 0.82rem; font-weight: 600; color: #1e293b; margin-bottom: 8px; text-align: center;
    min-height: 1.3em; font-variant-numeric: tabular-nums;
  }
  .tp-label b { display: inline-block; font-weight: 700; color: #0f172a; }
  .tp-cell { width: 19px; height: 19px; padding: 2px; cursor: pointer; }
  .tp-cell > i {
    display: block; width: 100%; height: 100%; border-radius: 4px; box-sizing: border-box;
    border: 1px solid rgba(15,23,42,0.18); background: #ffffff;
    transition: background-color 0.1s ease, border-color 0.1s ease, transform 0.1s ease;
  }
  .tp-cell.on > i {
    background: #334155;
    border-color: #0f172a;
    transform: scale(1.05);
  }

  .overlay {
    position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
    background: rgba(15,23,42,0.3); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    animation: fade 0.25s ease;
  }
  .modal {
    width: 360px; padding: 26px 30px; border-radius: 22px; display: flex; flex-direction: column;
    border: 1px solid rgba(255,255,255,0.85);
    box-shadow: 0 16px 40px rgba(15,23,42,0.16);
    animation: pop 0.5s var(--spring);
  }
  .menu {
    position: fixed; z-index: 700; min-width: 160px; padding: 6px; border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.85);
    box-shadow: 0 12px 30px rgba(15,23,42,0.14);
  }
  .menu-item {
    padding: 8px 12px; border-radius: 9px; font-size: 0.84rem; font-weight: 500; color: #1e293b; cursor: pointer;
    display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: background 0.15s, transform 0.2s var(--spring);
  }
  .menu-item:hover { background: rgba(255,255,255,0.85); transform: translateX(2px); }
  .menu-item.active { background: rgba(15,23,42,0.08); font-weight: 650; }
  .menu-item.danger { color: #ef4444; }
  .menu-item.danger:hover { background: rgba(239,68,68,0.12); }
  .menu.compact .menu-item { padding: 6px 12px; }
  
  .picker {
    position: fixed; z-index: 700; padding: 12px; border-radius: 14px;
    display: grid; grid-template-columns: repeat(10, 22px); gap: 4px;
    border: 1px solid rgba(15,23,42,0.15);
  }

  .swatch {
    width: 22px; height: 22px; border-radius: 0 !important; cursor: pointer;
    border: 1px solid rgba(15,23,42,0.22);
    display: flex; align-items: center; justify-content: center; font-size: 10px; color: #64748b;
    box-shadow: none !important;
    transition: transform 0.15s ease;
  }
  .swatch:hover { transform: scale(1.22); z-index: 2; box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important; }
  .swatch.sel { outline: 2px solid #0f172a; outline-offset: 1px; z-index: 3; }

  .dot {
    width: 10px !important;
    height: 10px !important;
    min-width: 10px !important;
    min-height: 10px !important;
    max-width: 10px !important;
    max-height: 10px !important;
    border-radius: 50% !important;
    display: inline-block !important;
    border: 1px solid rgba(15, 23, 42, 0.3) !important;
    flex-shrink: 0 !important;
    box-sizing: border-box !important;
  }

  .picker .m-btn { padding: 6px 12px; font-size: 0.78rem; border-radius: 6px; }
  .picker-none-bottom {
    grid-column: 1 / -1;
    margin-top: 6px;
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .picker-custom {
    grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 6px;
    padding-top: 8px; border-top: 1px solid rgba(15,23,42,0.1); font-size: 0.78rem; color: #475569;
  }
  .picker-custom input[type=color] {
    width: 30px; height: 26px; padding: 0; border: 1px solid rgba(15,23,42,0.2);
    border-radius: 4px; background: none; cursor: pointer;
  }
  .picker-custom span { flex: 1; font-variant-numeric: tabular-nums; }
  .m-input {
    width: 100%; padding: 11px 14px; border-radius: 11px; outline: none; font-size: 0.9rem; font-family: inherit;
    border: 1px solid rgba(255,255,255,0.85); background: rgba(255,255,255,0.7); color: var(--ink);
    box-shadow: inset 0 1px 3px rgba(15,23,42,0.08); transition: box-shadow 0.25s, background 0.25s;
  }
  .m-input:focus { background: rgba(255,255,255,0.95); box-shadow: 0 0 0 3px rgba(15,23,42,0.15); }
  .m-btn {
    padding: 9px 18px; border-radius: 11px; cursor: pointer; font-size: 0.85rem; font-weight: 500; font-family: inherit;
    border: 1px solid rgba(255,255,255,0.85); background: rgba(255,255,255,0.6); color: #334155;
    transition: transform 0.25s var(--spring), box-shadow 0.25s, background 0.2s;
  }
  .m-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.9); }
  .m-btn:active { transform: scale(0.95); }
  .m-btn.primary {
    color: #fff; border-color: rgba(255,255,255,0.35);
    background: linear-gradient(135deg, #475569, #1e293b 60%, #0f172a);
    box-shadow: 0 6px 16px rgba(15,23,42,0.3), inset 0 1px 0 rgba(255,255,255,0.25);
  }
  .m-btn.primary:hover { box-shadow: 0 10px 22px rgba(15,23,42,0.4), inset 0 1px 0 rgba(255,255,255,0.3); }

  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pop { from { opacity: 0; transform: translateY(14px) scale(0.92); } to { opacity: 1; transform: none; } }
  @keyframes noteIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes btnPop { 0% { transform: scale(0.85); } 55% { transform: scale(1.08); } 100% { transform: scale(1); } }

  .note-editor {
    animation: noteIn 0.4s var(--ease);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  .note-editor blockquote { margin: 0.6em 0; padding: 0.3em 1em; border-left: 3px solid #94a3b8; color: #475569; background: rgba(255,255,255,0.4); border-radius: 0 10px 10px 0; }
  .note-editor ul { padding-left: 1.5em; }
  .note-editor a { color: #1e293b; }
  .note-editor hr {
    border: none;
    border-top: 1.5px solid rgba(15, 23, 42, 0.25);
    margin: 18px 0;
  }

  .table-wrapper {
    display: block;
    overflow-x: auto;
    margin: 18px 0;
    user-select: none;
    clear: both;
    position: relative;
    max-width: 100%;
  }

  .note-editor table {
    border-collapse: collapse;
    margin: 0;
    max-width: 100%;
  }
  .table-wrapper.align-center table {
    margin-left: auto !important;
    margin-right: auto !important;
  }
  .table-wrapper.align-right table {
    margin-left: auto !important;
    margin-right: 0 !important;
  }
  .table-wrapper.align-left table {
    margin-left: 0 !important;
    margin-right: auto !important;
  }
  .note-editor table td, .note-editor table th {
    border: 1px solid rgba(15, 23, 42, 0.28);
    padding: 10px 14px;
    height: 40px;
    min-height: 40px;
    min-width: 24px;
    vertical-align: top;
    position: relative;
    word-break: break-word;
    box-sizing: border-box;
    user-select: text;
  }

  .note-editor table td.selected-cell, .note-editor table th.selected-cell {
    background-color: rgba(37, 99, 235, 0.18) !important;
    box-shadow: inset 0 0 0 2px #2563eb;
  }
  .note-editor table td.selected-cell::selection, .note-editor table th.selected-cell::selection {
    background: transparent !important;
  }

  .scroll { scrollbar-width: thin; scrollbar-color: rgba(100,116,139,0.35) transparent; }
  .scroll::-webkit-scrollbar { width: 6px; height: 6px; }
  .scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.35); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
  .scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.6); background-clip: content-box; }
`;

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M7 1.5v11M1.5 7h11" />
  </svg>
);

const TableIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <line x1="2" y1="6.5" x2="14" y2="6.5" />
    <line x1="7.5" y1="2.5" x2="7.5" y2="13.5" />
  </svg>
);

const HrIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <line x1="2" y1="8" x2="14" y2="8" />
    <line x1="3" y1="3.5" x2="9" y2="3.5" opacity="0.45" />
    <line x1="3" y1="12.5" x2="11" y2="12.5" opacity="0.45" />
  </svg>
);

const OmegaIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M2.5 13.5h3.2v-1.6C4 11 3 9.4 3 7.6 3 5 5.2 2.8 8 2.8s5 2.2 5 4.8c0 1.8-1 3.4-2.7 4.3v1.6h3.2" />
  </svg>
);

type Grid = HTMLTableCellElement[][];
type Origins = Map<HTMLTableCellElement, { r: number; c: number }>;
type Box = { rMin: number; rMax: number; cMin: number; cMax: number };

const buildGrid = (table: HTMLTableElement): Grid => {
  const grid: Grid = [];
  const rows = Array.from(table.rows);
  rows.forEach((row, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(row.cells).forEach((cell) => {
      while (grid[r][c]) c++;
      for (let dr = 0; dr < cell.rowSpan && r + dr < rows.length; dr++) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dc = 0; dc < cell.colSpan; dc++) grid[r + dr][c + dc] = cell;
      }
      c += cell.colSpan;
    });
  });
  return grid;
};

const gridOrigins = (grid: Grid): Origins => {
  const map: Origins = new Map();
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell && !map.has(cell)) map.set(cell, { r, c });
    })
  );
  return map;
};

const closeBox = (grid: Grid, origins: Origins, box: Box): Box => {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = box.rMin; r <= box.rMax; r++) {
      for (let c = box.cMin; c <= box.cMax; c++) {
        const cell = grid[r]?.[c];
        if (!cell) continue;
        const o = origins.get(cell)!;
        const r2 = o.r + cell.rowSpan - 1;
        const c2 = o.c + cell.colSpan - 1;
        if (o.r < box.rMin) { box.rMin = o.r; changed = true; }
        if (o.c < box.cMin) { box.cMin = o.c; changed = true; }
        if (r2 > box.rMax) { box.rMax = r2; changed = true; }
        if (c2 > box.cMax) { box.cMax = c2; changed = true; }
      }
    }
  }
  return box;
};

const cellsInBox = (grid: Grid, box: Box): HTMLTableCellElement[] => {
  const seen = new Set<HTMLTableCellElement>();
  const out: HTMLTableCellElement[] = [];
  for (let r = box.rMin; r <= box.rMax; r++) {
    for (let c = box.cMin; c <= box.cMax; c++) {
      const cell = grid[r]?.[c];
      if (cell && !seen.has(cell)) { seen.add(cell); out.push(cell); }
    }
  }
  return out;
};

const makeCell = (): HTMLTableCellElement => {
  const td = document.createElement('td');
  td.contentEditable = 'true';
  td.innerHTML = '<br>';
  return td;
};

const isCellEmpty = (el: HTMLElement) => el.innerHTML === '' || el.innerHTML === '<br>';

const isTableWrapper = (n: Node | null | undefined): n is HTMLElement =>
  n instanceof HTMLElement && n.classList.contains('table-wrapper');

const makeEmptyParagraph = () => {
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  return p;
};

const placeCaret = (node: Node, atEnd: boolean) => {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const off = atEnd ? (node.nodeType === Node.TEXT_NODE ? (node as Text).length : node.childNodes.length) : 0;
  r.setStart(node, off);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
};

const placeCaretBesideTable = (wrapper: HTMLElement, below: boolean): boolean => {
  if (below) {
    const next = wrapper.nextSibling;
    if (next && !isTableWrapper(next)) { placeCaret(next, false); return false; }
    const p = makeEmptyParagraph();
    wrapper.parentNode?.insertBefore(p, next);
    placeCaret(p, false);
    return true;
  }
  const prev = wrapper.previousSibling;
  if (prev && !isTableWrapper(prev)) { placeCaret(prev, true); return false; }
  const p = makeEmptyParagraph();
  wrapper.parentNode?.insertBefore(p, wrapper);
  placeCaret(p, false);
  return true;
};

const keepCaretOffTables = (editor: HTMLElement) => {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.ELEMENT_NODE) return;
  if (!editor.contains(sel.anchorNode)) return;
  const parent = sel.anchorNode;
  const before = parent.childNodes[sel.anchorOffset - 1];
  const after = parent.childNodes[sel.anchorOffset];
  if (isTableWrapper(after)) placeCaretBesideTable(after, false);
  else if (isTableWrapper(before)) placeCaretBesideTable(before, true);
};

const setColWidths = (table: HTMLTableElement, widths: number[]) => {
  let cg = table.querySelector<HTMLTableColElement>(':scope > colgroup[data-cols]');
  if (!cg) {
    cg = document.createElement('colgroup');
    cg.setAttribute('data-cols', '1');
    table.insertBefore(cg, table.firstChild);
  }
  const group = cg;
  group.innerHTML = '';
  widths.forEach((w) => {
    const col = document.createElement('col');
    col.style.width = `${w}px`;
    group.appendChild(col);
  });
  table.style.tableLayout = 'fixed';
  table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
  table.style.maxWidth = 'none';
};

const ensureFixedLayout = (table: HTMLTableElement): number[] => {
  const grid = buildGrid(table);
  const nCols = grid.reduce((m, row) => Math.max(m, row.length), 0);
  const existing = table.querySelector<HTMLTableColElement>(':scope > colgroup[data-cols]');
  if (existing) {
    const w = Array.from(existing.children).map((c) => parseFloat((c as HTMLElement).style.width) || 0);
    if (w.length === nCols && w.every((x) => x > 0)) return w;
  }
  const origins = gridOrigins(grid);
  const widths: number[] = new Array(nCols).fill(0);
  origins.forEach((o, cell) => {
    if (cell.colSpan === 1) widths[o.c] = Math.max(widths[o.c], cell.getBoundingClientRect().width);
  });
  origins.forEach((o, cell) => {
    if (cell.colSpan < 2) return;
    const idx = Array.from({ length: cell.colSpan }, (_, i) => o.c + i);
    const unknown = idx.filter((i) => !widths[i]);
    if (!unknown.length) return;
    const known = idx.reduce((s, i) => s + (widths[i] || 0), 0);
    const each = Math.max(MIN_COL_WIDTH, (cell.getBoundingClientRect().width - known) / unknown.length);
    unknown.forEach((i) => { widths[i] = each; });
  });
  for (let i = 0; i < nCols; i++) if (!widths[i]) widths[i] = TABLE_DEFAULT_COL_WIDTH;
  setColWidths(table, widths);
  table.querySelectorAll<HTMLElement>('td, th').forEach((c) => { c.style.width = ''; });
  return widths;
};

const computeSplit = (widths: number[], c: number, n: number) => {
  const start = widths.slice(0, c).reduce((a, b) => a + b, 0);
  const total = widths.slice(c, c + n).reduce((a, b) => a + b, 0);
  const mid = start + total / 2;
  let acc = start;
  for (let k = c; k < c + n; k++) {
    const colStart = acc;
    acc += widths[k];
    if (k < c + n - 1 && Math.abs(acc - mid) < 0.01) {
      return { leftSpan: k - c + 1, insertCol: -1, widths: widths.slice(), half: total / 2 };
    }
    if (mid > colStart + 0.01 && mid < acc - 0.01) {
      const next = widths.slice();
      next.splice(k, 1, mid - colStart, acc - mid);
      return { leftSpan: k - c + 1, insertCol: k, widths: next, half: total / 2 };
    }
  }
  return null;
};

export default function App() {
  const [saved] = useState<SavedState>(loadSavedState);
  const [folders, setFolders] = useState<Folder[]>(saved.folders);
  const [currentView, setCurrentView] = useState<'editor' | 'account'>('editor');
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [user, setUser] = useState<{ id?: string; name: string; avatarUrl: string; email?: string } | null>(() => {
    try {
      const cached = localStorage.getItem('ksiazka-google-user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [activeFolderId, setActiveFolderId] = useState<string>(saved.activeFolderId);
  const [activeNoteId, setActiveNoteId] = useState<string>(saved.activeNoteId);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>(saved.collapsedFolders);

  const [lastSaveTime, setLastSaveTime] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleGoogleLogin = async (forceSelectAccount = false) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: forceSelectAccount ? { prompt: 'select_account' } : undefined,
      },
    });
    if (error) {
      alert('Erreur de connexion Google : ' + error.message);
    }
  };

  const handleLogout = async () => {
  localStorage.removeItem('ksiazka-google-user');
  await supabase.auth.signOut();
  setUser(null);
  setShowUserMenu(false);
  
  // Réinitialiser les dossiers et notes par défaut
  setFolders(DEFAULT_FOLDERS);
  setActiveFolderId('1');
  setActiveNoteId('n1');
  setCollapsedFolders({});

  // Vider le contenu affiché à l'écran
  if (editorRef.current) {
    editorRef.current.innerHTML = '';
  }

  setCurrentView('editor');
};

  useEffect(() => {
    const saveAndSetUser = (u: { id?: string; name: string; avatarUrl: string; email?: string }) => {
      setUser(u);
      localStorage.setItem('ksiazka-google-user', JSON.stringify(u));
      setCurrentView('editor');
    };

    const extractUser = (u: any) => {
      const meta = u.user_metadata || {};
      const identityData = u.identities?.[0]?.identity_data || {};
      const name =
        meta.full_name ||
        meta.name ||
        identityData.full_name ||
        identityData.name ||
        u.email?.split('@')[0] ||
        'Utilisateur';
      const avatarUrl =
        meta.avatar_url ||
        meta.picture ||
        identityData.avatar_url ||
        identityData.picture ||
        'https://www.gravatar.com/avatar/?d=mp';
      return { id: u.id, name, avatarUrl, email: u.email };
    };

    // 1. Lecture du jeton Google dans l'URL
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      try {
        const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          const base64Url = accessToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          const meta = payload.user_metadata || {};

          saveAndSetUser({
            id: payload.sub,
            name: meta.full_name || meta.name || payload.email?.split('@')[0] || 'Utilisateur',
            avatarUrl: meta.avatar_url || meta.picture || 'https://www.gravatar.com/avatar/?d=mp',
            email: payload.email,
          });

          if (refreshToken) {
            supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => {});
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error('Erreur décodage token :', e);
      }
    }

    // 2. Session active Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        saveAndSetUser(extractUser(session.user));
      }
    });

    // 3. Changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        saveAndSetUser(extractUser(session.user));
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('ksiazka-google-user');
        setUser(null);
        setFolders(DEFAULT_FOLDERS);
        setActiveFolderId('1');
        setActiveNoteId('n1');
        setCollapsedFolders({});
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Charger les notes depuis Supabase dès qu'un utilisateur est connecté
  useEffect(() => {
    let isMounted = true;

    const syncWithCloud = async () => {
      // On récupère directement la session authentifiée officielle
      const { data: { session } } = await supabase.auth.getSession();
      const currentUid = session?.user?.id || user?.id;

      if (!currentUid) return;

      const { data, error } = await supabase
        .from('user_data')
        .select('*')
        .eq('user_id', currentUid)
        .maybeSingle();

      if (error) {
        console.error('Erreur chargement Cloud:', error.message);
        return;
      }

      if (!isMounted) return;

      if (data && Array.isArray(data.folders) && data.folders.length > 0) {
        setFolders(data.folders);
        if (data.active_folder_id) setActiveFolderId(data.active_folder_id);
        if (data.active_note_id) setActiveNoteId(data.active_note_id);
        if (data.collapsed_folders) setCollapsedFolders(data.collapsed_folders);

        // Mise à jour immédiate de l'éditeur avec la note active chargée depuis Supabase
        const activeF = data.folders.find((f: any) => f.id === (data.active_folder_id || '1')) || data.folders[0];
        const activeN = activeF?.notes?.find((n: any) => n.id === (data.active_note_id || 'n1')) || activeF?.notes?.[0];
        const activeT = activeN?.tabs?.find((t: any) => t.id === activeN?.activeTabId) || activeN?.tabs?.[0];

        if (editorRef.current && activeT) {
          editorRef.current.innerHTML = activeT.content || '';
        }
      }
    };

    if (user) {
      syncWithCloud();
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const [fontList, setFontList] = useState<string[]>(SYSTEM_FONTS);
  const [currentFontLabel, setCurrentFontLabel] = useState<string>('IBM Plex Sans');
  const [lineHeight, setLineHeight] = useState<string>('1.5');
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  const [modalType, setModalType] = useState<'folder' | 'note' | null>(null);
  const [modalInput, setModalInput] = useState<string>('');
  const [modalFolderId, setModalFolderId] = useState<string>(ROOT_ID);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'folder' | 'note' | 'tab';
    id: string;
  } | null>(null);

  const [activeTopMenu, setActiveTopMenu] = useState<TopMenuState>(null);
  const [topMenuPos, setTopMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tablePickerPos, setTablePickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSpecialChars, setShowSpecialChars] = useState(false);

  const [tableContextMenu, setTableContextMenu] = useState<{
    x: number;
    cell: HTMLTableCellElement;
    table: HTMLTableElement;
    wrapper: HTMLElement | null;
  } | null>(null);

  const [dropdown, setDropdown] = useState<DropdownState>(null);
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 });

  const [editModal, setEditModal] = useState<{
    type: 'folder' | 'note' | 'tab';
    id: string;
    action: 'rename' | 'icon';
  } | null>(null);
  const [editInput, setEditInput] = useState<string>('');

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrike, setIsStrike] = useState(false);

  const [alignment, setAlignment] = useState<'left' | 'center' | 'right' | 'full'>('left');

  const [isBulletList, setIsBulletList] = useState(false);
  const [isQuote, setIsQuote] = useState(false);
  const [fontSize, setFontSize] = useState<number>(EDITOR_FONT_SIZE);
  const [currentStyle, setCurrentStyle] = useState<string>('p');

  const [picker, setPicker] = useState<PickerState>(null);
  const [textColor, setTextColor] = useState('#0f172a');
  const [highlightColor, setHighlightColor] = useState('transparent');
  const [cellColorTarget, setCellColorTarget] = useState<HTMLTableCellElement | null>(null);
  const [customColor, setCustomColor] = useState('#475569');
  const [saveError, setSaveError] = useState(false);

  const savedRangeRef = useRef<Range | null>(null);
  const ignoreSelectionChangeRef = useRef<boolean>(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Record<string, { stack: Snapshot[]; index: number }>>({});
  const lastPushRef = useRef(0);
  const stepRef = useRef<(dir: -1 | 1) => void>(() => {});

  const selectedCellsRef = useRef<Set<HTMLTableCellElement>>(new Set());
  const isSelectingCellsRef = useRef(false);
  const startSelectCellRef = useRef<HTMLTableCellElement | null>(null);

  const clearCellSelection = () => {
    selectedCellsRef.current.forEach((c) => c.classList.remove('selected-cell'));
    selectedCellsRef.current.clear();
  };

  const resizingRef = useRef<{
    active: boolean;
    type: 'col' | 'row' | null;
    cell: HTMLTableCellElement | null;
    table: HTMLTableElement | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    colIndex: number;
  }>({
    active: false,
    type: null,
    cell: null,
    table: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    colIndex: -1,
  });

  useEffect(() => {
    const onSelectionChange = () => {
      if (editorRef.current) keepCaretOffTables(editorRef.current);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const activeFolder = folders.find((f) => f.id === activeFolderId) || folders[0];
  const activeNote = activeFolder?.notes.find((n) => n.id === activeNoteId) || activeFolder?.notes[0];
  const activeTab = activeNote?.tabs.find((t) => t.id === activeNote?.activeTabId) || activeNote?.tabs[0];

  const query = search.trim().toLowerCase();
  const noteMatches = (n: Note) => {
    if (!query) return true;
    const titleMatch = n.title.toLowerCase().includes(query);
    const tabsMatch = n.tabs.some((t) => htmlToPlainText(t.content).toLowerCase().includes(query));
    return titleMatch || tabsMatch;
  };

  const userFolders = folders
    .filter((f) => f.id !== ROOT_ID)
    .map((f) => (query && f.name.toLowerCase().includes(query) ? f : { ...f, notes: f.notes.filter(noteMatches) }))
    .filter((f) => !query || f.notes.length > 0 || f.name.toLowerCase().includes(query));
  const rootFolder = folders.find((f) => f.id === ROOT_ID);
  const rootNotes = (rootFolder?.notes ?? []).filter(noteMatches);

  const exportMarkdown = () => {
    if (!activeNote || !activeTab) return;
    const md = `# ${activeNote.title} - ${activeTab.title}\n\n${htmlToMarkdown(activeTab.content)}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.title}-${activeTab.title}`.replace(/[\\/:*?"<>|]+/g, '-') + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (user) {
        setIsSaving(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const targetId = authUser?.id || user.id;

        if (targetId) {
          const { error } = await supabase.from('user_data').upsert({
            user_id: targetId,
            folders,
            active_folder_id: activeFolderId,
            active_note_id: activeNoteId,
            collapsed_folders: collapsedFolders,
            updated_at: new Date().toISOString(),
          });

          if (error) {
            console.error('Erreur sauvegarde Supabase:', error.message);
          } else {
            const now = new Date();
            setLastSaveTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          }
        }
        setTimeout(() => setIsSaving(false), 600);
      } else {
        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              folders,
              activeFolderId,
              activeNoteId,
              collapsedFolders,
            } satisfies SavedState)
          );
          setSaveError(false);
        } catch {
          setSaveError(true);
        }
      }
    }, 400);

    return () => window.clearTimeout(t);
  }, [folders, activeFolderId, activeNoteId, collapsedFolders, user]);

  useEffect(() => {
  const handleBeforeUnload = () => {
    if (user && activeFolder) {
      // Sauvegarde d'urgence synchrone ou immédiate si l'utilisateur ferme l'onglet
      const targetId = user.id;
      supabase.from('user_data').upsert({
        user_id: targetId,
        folders,
        active_folder_id: activeFolderId,
        active_note_id: activeNoteId,
        collapsed_folders: collapsedFolders,
        updated_at: new Date().toISOString(),
      });
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [folders, activeFolderId, activeNoteId, collapsedFolders, user]);

  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.innerHTML = GLOBAL_CSS;
    document.head.appendChild(styleTag);
    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.picker') ||
        target?.closest('.menu') ||
        target?.closest('.user-menu-container') ||
        target?.closest('.table-picker-pop') ||
        target?.closest('.tp-cell') ||
        target?.closest('.tb-btn') ||
        target?.closest('.tb-custom-trigger') ||
        target?.closest('.size-box')
      ) {
        return;
      }
      setContextMenu(null);
      setTableContextMenu(null);
      setPicker(null);
      setDropdown(null);
      setActiveTopMenu(null);
      setShowTablePicker(false);
      setShowUserMenu(false);
      if (!target?.closest('td') && !target?.closest('th')) {
        clearCellSelection();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = activeTab?.content ?? '';
    const historyKey = `${activeNote?.id}-${activeTab?.id}`;
    if (activeNote && activeTab && !historyRef.current[historyKey]) {
      historyRef.current[historyKey] = { stack: [{ html: el.innerHTML, caret: 1e9 }], index: 0 };
    }
    const onBeforeInput = (ev: Event) => {
      const type = (ev as InputEvent).inputType;
      if (type === 'historyUndo') { ev.preventDefault(); stepRef.current(-1); }
      else if (type === 'historyRedo') { ev.preventDefault(); stepRef.current(1); }
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, [activeNote?.id, activeTab?.id]);

  const saveCurrentSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (selection && selection.rangeCount > 0 && editor) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  }, []);

  const restoreSelection = useCallback(() => {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  }, []);

  const checkSelectionFormat = useCallback(() => {
    if (ignoreSelectionChangeRef.current) return;
    try {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;

      let node: Node | null = selection.anchorNode;
      if (!node || !editor.contains(node)) return;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      saveCurrentSelection();

      if (node && node instanceof HTMLElement) {
        const computed = window.getComputedStyle(node);
        
        let currentEl: HTMLElement | null = node;
        let detected = '';
        while (currentEl && currentEl !== editor) {
          if (currentEl.style.fontFamily) {
            detected = currentEl.style.fontFamily.replace(/['"]+/g, '').split(',')[0].trim();
            break;
          }
          currentEl = currentEl.parentElement;
        }
        if (!detected) {
          const comp = computed.fontFamily.replace(/['"]+/g, '').split(',')[0].trim();
          if (comp && !comp.includes('apple-system') && !comp.includes('system-ui')) {
            detected = comp;
          }
        }
        if (detected) {
          setCurrentFontLabel(detected);
        }

        const px = Math.round(parseFloat(computed.fontSize));
      if (!isNaN(px)) setFontSize(px);
    }

    // Détection de l'état natif par le navigateur
    setIsBold(document.queryCommandState('bold'));
    setIsItalic(document.queryCommandState('italic'));
    setIsUnderline(document.queryCommandState('underline'));
    setIsStrike(document.queryCommandState('strikeThrough'));
    setIsBulletList(document.queryCommandState('insertUnorderedList'));

    // Détection dynamique de l'alignement sous le curseur
      if (node && node instanceof HTMLElement) {
        let currentEl: HTMLElement | null = node;
        let detectedAlign: 'left' | 'center' | 'right' | 'full' = 'left';
        while (currentEl && currentEl !== editor) {
          const align = currentEl.style.textAlign || window.getComputedStyle(currentEl).textAlign;
          if (align === 'center') { detectedAlign = 'center'; break; }
          if (align === 'right') { detectedAlign = 'right'; break; }
          if (align === 'justify') { detectedAlign = 'full'; break; }
          if (align === 'left' || align === 'start') { detectedAlign = 'left'; break; }
          currentEl = currentEl.parentElement;
        }
        setAlignment(detectedAlign);
      }
      
      const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      setCurrentStyle(['p', 'h1', 'h2', 'h3'].includes(block) ? block : 'p');
      setIsQuote(block === 'blockquote');
    } catch {
      // Ignorer
    }
  }, [saveCurrentSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelectionFormat);
    return () => document.removeEventListener('selectionchange', checkSelectionFormat);
  }, [checkSelectionFormat]);

  const getCaretOffset = (): number => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.endContainer)) return 0;
    const pre = document.createRange();
    pre.selectNodeContents(editor);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  };

  const setCaretOffset = (offset: number) => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let remaining = offset;
    let node = walker.nextNode();
    let placed = false;
    while (node) {
      const len = (node.textContent || '').length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        placed = true;
        break;
      }
      remaining -= len;
      node = walker.nextNode();
    }
    if (!placed) {
      range.selectNodeContents(editor);
      range.collapse(false);
    } else {
      range.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const pushHistory = (key: string, html: string, coalesce: boolean) => {
    let h = historyRef.current[key];
    if (!h) {
      h = { stack: [{ html, caret: getCaretOffset() }], index: 0 };
      historyRef.current[key] = h;
      return;
    }
    if (h.stack[h.index].html === html) return;
    const snap: Snapshot = { html, caret: getCaretOffset() };
    const now = Date.now();
    if (coalesce && h.index > 0 && h.index === h.stack.length - 1 && now - lastPushRef.current < 700) {
      h.stack[h.index] = snap;
    } else {
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > 300) h.stack.shift();
      h.index = h.stack.length - 1;
    }
    lastPushRef.current = now;
  };

  const stepHistory = (dir: -1 | 1) => {
    const editor = editorRef.current;
    if (!editor || !activeNote || !activeTab) return;
    const key = `${activeNote.id}-${activeTab.id}`;
    const h = historyRef.current[key];
    if (!h) return;
    const next = h.index + dir;
    if (next < 0 || next >= h.stack.length) return;
    h.index = next;
    const snap = h.stack[next];
    editor.innerHTML = snap.html;
    editor.focus();
    setCaretOffset(snap.caret);
    lastPushRef.current = 0;
    handleContentChange('history');
    checkSelectionFormat();
  };
  stepRef.current = stepHistory;
  const undo = () => stepHistory(-1);
  const redo = () => stepHistory(1);

  const handleContentChange = (source: 'typing' | 'command' | 'history' = 'command') => {
    const editor = editorRef.current;
    if (!editor || !activeNote || !activeFolder || !activeTab) return;

    const rawText = editor.innerText.replace(/[\n\u200B]/g, '').trim();
    // On ne vide l'éditeur que si l'utilisateur efface du texte au clavier ('typing'),
    // jamais quand il clique sur un bouton de formatage ('command') !
    if (source === 'typing' && !rawText && !editor.querySelector('table') && !editor.querySelector('hr')) {
      editor.innerHTML = '';
    }

    const newContent = editor.innerHTML;
    const folderId = activeFolder.id;
    const noteId = activeNote.id;
    const tabId = activeTab.id;
    const historyKey = `${noteId}-${tabId}`;
    if (source !== 'history') pushHistory(historyKey, newContent, source === 'typing');

    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? {
              ...f,
              notes: f.notes.map((n) =>
                n.id === noteId
                  ? {
                      ...n,
                      tabs: n.tabs.map((t) => (t.id === tabId ? { ...t, content: newContent } : t)),
                    }
                  : n
              ),
            }
          : f
      )
    );
  };

  const applyFontDirectly = (fontName: string) => {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;

    const range = selection.getRangeAt(0);

    if (range.collapsed) {
      let node: Node | null = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (node && node instanceof HTMLElement && node !== editorRef.current) {
        node.style.fontFamily = fontName;
      } else {
        editorRef.current.style.fontFamily = fontName;
      }
    } else {
      const span = document.createElement('span');
      span.style.fontFamily = fontName;
      span.appendChild(range.extractContents());
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }

    handleContentChange();
    checkSelectionFormat();
  };

  const handleSelectFont = (fontName: string) => {
    setCurrentFontLabel(fontName);
    applyFontDirectly(fontName);
    setDropdown(null);
  };

  const handleFontUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const fontName = file.name.replace(/\.[^/.]+$/, '').trim();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontFace = new FontFace(fontName, arrayBuffer);
      const loaded = await fontFace.load();
      document.fonts.add(loaded);

      setFontList((prev) => (prev.includes(fontName) ? prev : [...prev, fontName]));
      setCurrentFontLabel(fontName);
      applyFontDirectly(fontName);
    } catch {
      alert('Format de police non pris en charge.');
    } finally {
      input.value = '';
      setDropdown(null);
    }
  };

  const formatText = (e: ReactMouseEvent, command: string) => {
    e.preventDefault();
    const ed = editorRef.current;
    if (!ed) return;

    ignoreSelectionChangeRef.current = true;

    if (document.activeElement !== ed) {
      restoreSelection();
    } else {
      ed.focus();
    }

    if (!ed.innerHTML.trim() || ed.innerHTML === '<br>') {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      ed.innerHTML = '';
      ed.appendChild(p);
      placeCaret(p, false);
    }

    if (command === 'formatBlock') {
      const currentBlock = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, currentBlock === 'blockquote' ? 'p' : 'blockquote');
      ignoreSelectionChangeRef.current = false;
      checkSelectionFormat();
    } else {
      const sel = window.getSelection();
      const currentText = ed.innerText.replace(/[\n\u200B\s]/g, '');

      // On vérifie si la ligne ou le bloc autour du curseur est totalement vide de texte
      let isLineEmpty = false;
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          let block: Node | null = range.startContainer;
          while (block && block !== ed && !['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'TD'].includes((block as HTMLElement).tagName)) {
            block = block.parentNode;
          }
          const blockText = (block?.textContent || '').replace(/[\n\u200B\s]/g, '');
          isLineEmpty = !currentText || !blockText;
        }
      }

      if (isLineEmpty && sel && sel.rangeCount > 0) {
        // Mode curseur vide : on gère la pile sans jamais risquer de supprimer du texte
        const nextBold = command === 'bold' ? !isBold : isBold;
        const nextItalic = command === 'italic' ? !isItalic : isItalic;
        const nextUnderline = command === 'underline' ? !isUnderline : isUnderline;
        const nextStrike = command === 'strikeThrough' ? !isStrike : isStrike;

        let block: Node | null = sel.getRangeAt(0).startContainer;
        while (block && block !== ed && !['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'TD'].includes((block as HTMLElement).tagName)) {
          block = block.parentNode;
        }

        const targetContainer = (block as HTMLElement) || ed;
        targetContainer.innerHTML = '';

        const zwsp = document.createTextNode('\u200B');
        let currentNode: Node = zwsp;

        if (nextStrike) { const s = document.createElement('s'); s.appendChild(currentNode); currentNode = s; }
        if (nextUnderline) { const u = document.createElement('u'); u.appendChild(currentNode); currentNode = u; }
        if (nextItalic) { const i = document.createElement('i'); i.appendChild(currentNode); currentNode = i; }
        if (nextBold) { const b = document.createElement('b'); b.appendChild(currentNode); currentNode = b; }

        targetContainer.appendChild(currentNode);

        const caretRange = document.createRange();
        caretRange.setStart(zwsp, 1);
        caretRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caretRange);

        setIsBold(nextBold);
        setIsItalic(nextItalic);
        setIsUnderline(nextUnderline);
        setIsStrike(nextStrike);
      } else {
        // Mode avec du texte existant : exécution standard native sans altérer le texte
        document.execCommand(command, false);
        if (command === 'bold') setIsBold((prev) => !prev);
        if (command === 'italic') setIsItalic((prev) => !prev);
        if (command === 'underline') setIsUnderline((prev) => !prev);
        if (command === 'strikeThrough') setIsStrike((prev) => !prev);
      }

      saveCurrentSelection();
      setTimeout(() => {
        ignoreSelectionChangeRef.current = false;
      }, 50);
    }

    handleContentChange('command');
  };

  const applyAlignment = (requested: 'left' | 'center' | 'right' | 'full') => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const cssAlign = requested === 'full' ? 'justify' : requested;
    let node: Node | null = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    while (node && node !== ed && !['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'TD', 'TH'].includes((node as HTMLElement).tagName)) {
      node = node.parentNode;
    }

    if (node && node instanceof HTMLElement && node !== ed) {
      if (requested === 'left') {
        node.style.removeProperty('text-align');
      } else {
        node.style.textAlign = cssAlign;
      }
    } else {
      const p = document.createElement('p');
      if (requested !== 'left') p.style.textAlign = cssAlign;
      p.innerHTML = '<br>';
      ed.appendChild(p);
      placeCaret(p, false);
    }

    setAlignment(requested);
    saveCurrentSelection();
    handleContentChange();
  };

  const applyFontSizePx = (targetPx: number) => {
    restoreSelection();
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (!ed || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (range.collapsed) {
      let node: Node | null = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (node && node instanceof HTMLElement && node !== ed) {
        node.style.fontSize = `${targetPx}px`;
      } else {
        const span = document.createElement('span');
        span.style.fontSize = `${targetPx}px`;
        span.innerHTML = '&#8203;';
        range.insertNode(span);
        const newR = document.createRange();
        newR.setStart(span, 1);
        newR.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newR);
        savedRangeRef.current = newR.cloneRange();
      }
    } else {
      const span = document.createElement('span');
      span.style.fontSize = `${targetPx}px`;
      span.appendChild(range.extractContents());
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }

    setFontSize(targetPx);
    handleContentChange();
  };

  const stepFontSize = (delta: number) => {
    restoreSelection();
    editorRef.current?.focus();
    const cur = fontSize || EDITOR_FONT_SIZE;
    const target = Math.min(36, Math.max(10, cur + delta));
    applyFontSizePx(target);
  };

  const changeFontSize = (newSize: number) => {
    applyFontSizePx(newSize);
    editorRef.current?.focus();
    setDropdown(null);
  };

  const handleSelectLineHeight = (val: string) => {
    setLineHeight(val);
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;

    let node: Node | null = selection.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editorRef.current && !['DIV', 'P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'TD'].includes((node as HTMLElement).tagName)) {
      node = node.parentNode;
    }

    if (node && node instanceof HTMLElement && node !== editorRef.current) {
      node.style.lineHeight = val;
    } else if (editorRef.current) {
      editorRef.current.style.lineHeight = val;
    }
    handleContentChange();
    setDropdown(null);
  };

  const handleSelectZoom = (zoom: number) => {
    setZoomPercent(zoom);
    setDropdown(null);
  };

  const openPicker = (e: ReactMouseEvent<HTMLButtonElement>, kind: 'text' | 'highlight' | 'cellBg') => {
    e.preventDefault();
    e.stopPropagation();
    saveCurrentSelection();
    setDropdown(null);
    setActiveTopMenu(null);
    setShowTablePicker(false);

    if (picker?.kind === kind) {
      setPicker(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    setPicker({ kind, x: targetX, y: rect.bottom + 6 });
  };

  const openDropdown = (e: ReactMouseEvent<HTMLElement>, kind: 'style' | 'font' | 'size' | 'lineHeight' | 'zoom') => {
    e.preventDefault();
    e.stopPropagation();
    saveCurrentSelection();
    setPicker(null);
    setActiveTopMenu(null);
    setShowTablePicker(false);

    if (dropdown?.kind === kind) {
      setDropdown(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    setDropdown({ kind, x: targetX, y: rect.bottom + 6 });
  };

  const toggleTopMenu = (e: ReactMouseEvent<HTMLElement>, menu: TopMenuState) => {
    e.preventDefault();
    e.stopPropagation();
    saveCurrentSelection();
    setPicker(null);
    setDropdown(null);
    setShowTablePicker(false);

    if (activeTopMenu === menu) {
      setActiveTopMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setTopMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setActiveTopMenu(menu);
  };

  const applyColor = (command: 'foreColor' | 'hiliteColor' | 'cellBg', color: string) => {
    if (command === 'cellBg') {
      const applyToCell = (c: HTMLTableCellElement) => {
        c.style.background = color === 'transparent' ? '' : color;
      };
      if (selectedCellsRef.current.size > 0) {
        selectedCellsRef.current.forEach(applyToCell);
        handleContentChange();
      } else if (cellColorTarget) {
        applyToCell(cellColorTarget);
        handleContentChange();
      }
    } else {
      restoreSelection();
      const currentColor = command === 'foreColor' ? textColor : highlightColor;
      const nextColor =
        color.toLowerCase() === currentColor.toLowerCase()
          ? command === 'foreColor' ? '#0f172a' : 'transparent'
          : color;
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(command, false, nextColor);
      if (command === 'foreColor') setTextColor(nextColor);
      else setHighlightColor(nextColor);
      checkSelectionFormat();
      handleContentChange();
    }
    setPicker(null);
  };

  const handleBlockStyleChange = (requested: string) => {
    const value = requested === currentStyle && requested !== 'p' ? 'p' : requested;
    restoreSelection();
    document.execCommand('formatBlock', false, value);
    setCurrentStyle(value);
    checkSelectionFormat();
    handleContentChange();
    setDropdown(null);
  };

  const insertTable = (rows: number, cols: number) => {
    setShowTablePicker(false);
    setActiveTopMenu(null);
    setTableHover({ rows: 0, cols: 0 });

    restoreSelection();
    if (!editorRef.current) return;

    const W = TABLE_DEFAULT_COL_WIDTH;
    let html =
      `<div class="table-wrapper align-left" contenteditable="false">` +
      `<table class="align-left" style="table-layout: fixed; width: ${cols * W}px; max-width: none;">` +
      `<colgroup data-cols="1">${`<col style="width: ${W}px;">`.repeat(cols)}</colgroup><tbody>`;
    for (let r = 0; r < rows; r++) {
      html += `<tr>${'<td contenteditable="true"><br></td>'.repeat(cols)}</tr>`;
    }
    html += '</tbody></table></div><p><br></p>';

    document.execCommand('insertHTML', false, html);
    handleContentChange();
  };

  const insertHorizontalRule = () => {
    restoreSelection();
    document.execCommand('insertHorizontalRule', false);
    handleContentChange();
    setActiveTopMenu(null);
  };

  const insertSpecialChar = (char: string) => {
    restoreSelection();
    document.execCommand('insertText', false, char);
    handleContentChange();
    setShowSpecialChars(false);
  };

  const handleEditorContextMenu = (e: ReactMouseEvent) => {
    let target = e.target as HTMLElement | null;
    let cell: HTMLTableCellElement | null = null;
    let table: HTMLTableElement | null = null;

    while (target && target !== editorRef.current) {
      if (target.tagName === 'TD' || target.tagName === 'TH') {
        cell = target as HTMLTableCellElement;
      }
      if (target.tagName === 'TABLE') {
        table = target as HTMLTableElement;
        break;
      }
      target = target.parentElement;
    }

    if (cell && table) {
      e.preventDefault();
      const wrapper = table.closest('.table-wrapper') as HTMLElement | null;
      setTableContextMenu({ x: e.clientX, cell, table, wrapper });
    }
  };

  const handleEditorMouseMove = (e: ReactMouseEvent) => {
    const startCell = startSelectCellRef.current;
    if (isSelectingCellsRef.current && startCell) {
      let target = e.target as HTMLElement | null;
      while (target && target !== editorRef.current && target.tagName !== 'TD' && target.tagName !== 'TH') {
        target = target.parentElement;
      }
      if (target && (target.tagName === 'TD' || target.tagName === 'TH')) {
        const currentCell = target as HTMLTableCellElement;
        const table = currentCell.closest('table');

        if (table && table === startCell.closest('table')) {
          const grid = buildGrid(table);
          const origins = gridOrigins(grid);
          const ao = origins.get(startCell);
          const bo = origins.get(currentCell);
          if (ao && bo) {
            const box = closeBox(grid, origins, {
              rMin: Math.min(ao.r, bo.r),
              cMin: Math.min(ao.c, bo.c),
              rMax: Math.max(ao.r + startCell.rowSpan - 1, bo.r + currentCell.rowSpan - 1),
              cMax: Math.max(ao.c + startCell.colSpan - 1, bo.c + currentCell.colSpan - 1),
            });
            clearCellSelection();
            cellsInBox(grid, box).forEach((c) => {
              c.classList.add('selected-cell');
              selectedCellsRef.current.add(c);
            });
          }
        }
      }
      return;
    }

    if (resizingRef.current.active) return;

    let target = e.target as HTMLElement | null;
    while (target && target !== editorRef.current && target.tagName !== 'TD' && target.tagName !== 'TH') {
      target = target.parentElement;
    }

    const editor = editorRef.current;
    if (!editor) return;
    if (!target || (target.tagName !== 'TD' && target.tagName !== 'TH')) {
      if (editor.style.cursor === 'col-resize' || editor.style.cursor === 'row-resize') {
        editor.style.cursor = '';
      }
      return;
    }

    const cell = target as HTMLTableCellElement;
    const table = cell.closest('table');
    const o = table ? gridOrigins(buildGrid(table)).get(cell) : undefined;
    const rect = cell.getBoundingClientRect();
    const threshold = 10;

    const nearRight = Math.abs(e.clientX - rect.right) <= threshold;
    const nearLeft = Math.abs(e.clientX - rect.left) <= threshold && (o?.c ?? 0) > 0;
    const nearBottom = Math.abs(e.clientY - rect.bottom) <= threshold;
    const nearTop = Math.abs(e.clientY - rect.top) <= threshold && (o?.r ?? 0) > 0;

    if (nearRight || nearLeft) {
      editor.style.cursor = 'col-resize';
    } else if (nearBottom || nearTop) {
      editor.style.cursor = 'row-resize';
    } else {
      editor.style.cursor = '';
    }
  };

  const handleEditorMouseDown = (e: ReactMouseEvent) => {
    let target = e.target as HTMLElement | null;
    while (target && target !== editorRef.current && target.tagName !== 'TD' && target.tagName !== 'TH') {
      target = target.parentElement;
    }

    if (!target || (target.tagName !== 'TD' && target.tagName !== 'TH')) {
      clearCellSelection();
      const wrapper = (e.target as HTMLElement).closest?.('.table-wrapper') as HTMLElement | null;
      if (wrapper && editorRef.current?.contains(wrapper) && e.button === 0) {
        e.preventDefault();
        editorRef.current.focus();
        const r = wrapper.getBoundingClientRect();
        if (placeCaretBesideTable(wrapper, e.clientY >= r.top + r.height / 2)) handleContentChange();
      }
      return;
    }

    const cell = target as HTMLTableCellElement;
    const table = cell.closest('table');
    if (!table) return;
    const o = gridOrigins(buildGrid(table)).get(cell);
    if (!o) return;

    const rect = cell.getBoundingClientRect();
    const threshold = 10;
    const nearRight = Math.abs(e.clientX - rect.right) <= threshold;
    const nearLeft = Math.abs(e.clientX - rect.left) <= threshold && o.c > 0;
    const nearBottom = Math.abs(e.clientY - rect.bottom) <= threshold;
    const nearTop = Math.abs(e.clientY - rect.top) <= threshold && o.r > 0;

    let resizeCol = -1;
    let resizeRow = -1;
    if (nearRight) resizeCol = o.c + cell.colSpan - 1;
    else if (nearLeft) resizeCol = o.c - 1;
    else if (nearBottom) resizeRow = o.r + cell.rowSpan - 1;
    else if (nearTop) resizeRow = o.r - 1;

    if (resizeCol >= 0 || resizeRow >= 0) {
      if (e.button !== 0) return;
      const rowEl = resizeRow >= 0 ? table.rows[resizeRow] : null;
      if (resizeRow >= 0 && !rowEl) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidths = resizeCol >= 0 ? ensureFixedLayout(table) : [];
      const startHeight = rowEl ? rowEl.getBoundingClientRect().height : 0;

      const handleWindowMouseMove = (ev: MouseEvent) => {
        if (resizeCol >= 0) {
          const next = startWidths.slice();
          next[resizeCol] = Math.max(MIN_COL_WIDTH, startWidths[resizeCol] + ev.clientX - startX);
          setColWidths(table, next);
        } else if (rowEl) {
          const h = Math.max(26, startHeight + ev.clientY - startY);
          rowEl.style.height = `${h}px`;
          Array.from(rowEl.cells).forEach((c) => {
            if (c.rowSpan === 1) c.style.height = `${h}px`;
          });
        }
      };

      const handleWindowMouseUp = () => {
        resizingRef.current.active = false;
        if (editorRef.current) editorRef.current.style.cursor = '';
        handleContentChange();
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };

      resizingRef.current = { ...resizingRef.current, active: true, type: resizeCol >= 0 ? 'col' : 'row' };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      return;
    }

    if (e.button === 0) {
      clearCellSelection();
      isSelectingCellsRef.current = true;
      startSelectCellRef.current = cell;
      cell.classList.add('selected-cell');
      selectedCellsRef.current.add(cell);

      const handleWindowMouseUp = () => {
        isSelectingCellsRef.current = false;
        startSelectCellRef.current = null;
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
  };

  const handleAddRow = (above: boolean) => {
    if (!tableContextMenu) return;
    const { cell, table } = tableContextMenu;
    const grid = buildGrid(table);
    const o = gridOrigins(grid).get(cell);
    if (!o) return;
    const cols = grid[0]?.length ?? 0;
    const insertAt = above ? o.r : o.r + cell.rowSpan;

    const bumped = new Set<HTMLTableCellElement>();
    let newCount = 0;
    for (let c = 0; c < cols; c++) {
      const upper = grid[insertAt - 1]?.[c];
      const lower = grid[insertAt]?.[c];
      if (upper && lower && upper === lower) {
        if (!bumped.has(upper)) { upper.rowSpan += 1; bumped.add(upper); }
      } else {
        newCount++;
      }
    }
    const row = table.insertRow(insertAt);
    for (let i = 0; i < newCount; i++) row.appendChild(makeCell());
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleAddColumn = (left: boolean) => {
    if (!tableContextMenu) return;
    const { cell, table } = tableContextMenu;
    const widths = ensureFixedLayout(table);
    const grid = buildGrid(table);
    const origins = gridOrigins(grid);
    const o = origins.get(cell);
    if (!o) return;
    const b = left ? o.c : o.c + cell.colSpan;

    const bumped = new Set<HTMLTableCellElement>();
    Array.from(table.rows).forEach((row, r) => {
      const before = grid[r]?.[b - 1];
      const after = grid[r]?.[b];
      if (before && after && before === after) {
        if (!bumped.has(before)) { before.colSpan += 1; bumped.add(before); }
        return;
      }
      const idx = Array.from(row.cells).filter((cc) => (origins.get(cc)?.c ?? 0) < b).length;
      row.insertBefore(makeCell(), row.cells[idx] || null);
    });
    const next = widths.slice();
    next.splice(b, 0, TABLE_DEFAULT_COL_WIDTH);
    setColWidths(table, next);
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleDeleteRow = () => {
    if (!tableContextMenu) return;
    const { cell, table, wrapper } = tableContextMenu;
    const grid = buildGrid(table);
    const origins = gridOrigins(grid);
    const o = origins.get(cell);
    if (!o) return;
    const r = o.r;
    const seen = new Set<HTMLTableCellElement>();

    (grid[r] || []).forEach((cc) => {
      if (!cc || seen.has(cc)) return;
      seen.add(cc);
      const co = origins.get(cc)!;
      if (co.r < r) {
        cc.rowSpan -= 1;
      } else if (cc.rowSpan > 1) {
        const nextRow = table.rows[r + 1];
        if (nextRow) {
          const idx = Array.from(nextRow.cells).filter((x) => (origins.get(x)?.c ?? 0) < co.c).length;
          cc.rowSpan -= 1;
          nextRow.insertBefore(cc, nextRow.cells[idx] || null);
        }
      }
    });
    table.deleteRow(r);
    if (table.rows.length === 0) (wrapper || table).remove();
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleDeleteColumn = () => {
    if (!tableContextMenu) return;
    const { cell, table, wrapper } = tableContextMenu;
    const widths = ensureFixedLayout(table);
    const grid = buildGrid(table);
    const origins = gridOrigins(grid);
    const o = origins.get(cell);
    if (!o) return;
    const seen = new Set<HTMLTableCellElement>();

    grid.forEach((row) => {
      const cc = row[o.c];
      if (!cc || seen.has(cc)) return;
      seen.add(cc);
      if (cc.colSpan > 1) cc.colSpan -= 1;
      else cc.remove();
    });
    if (table.querySelectorAll('td, th').length === 0) {
      (wrapper || table).remove();
    } else {
      const next = widths.slice();
      next.splice(o.c, 1);
      setColWidths(table, next);
    }
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleDeleteTable = () => {
    if (!tableContextMenu) return;
    if (tableContextMenu.wrapper) {
      tableContextMenu.wrapper.remove();
    } else {
      tableContextMenu.table.remove();
    }
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleDistributeRows = () => {
    if (!tableContextMenu) return;
    const { table } = tableContextMenu;
    Array.from(table.rows).forEach((r) => {
      r.style.height = 'auto';
      Array.from(r.cells).forEach((c) => (c.style.height = 'auto'));
    });
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleDistributeCols = () => {
    if (!tableContextMenu) return;
    const { table } = tableContextMenu;
    const widths = ensureFixedLayout(table);
    const total = widths.reduce((a, b) => a + b, 0);
    setColWidths(table, widths.map(() => total / widths.length));
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleMergeCell = () => {
    if (!tableContextMenu) return;
    const { cell, table } = tableContextMenu;
    const grid = buildGrid(table);
    const origins = gridOrigins(grid);
    const o = origins.get(cell);
    if (!o) { setTableContextMenu(null); return; }

    const selected = Array.from(selectedCellsRef.current).filter((c) => origins.has(c));
    const base = selected.length > 1 && selectedCellsRef.current.has(cell) ? selected : [cell];

    const box: Box = { rMin: Infinity, rMax: -Infinity, cMin: Infinity, cMax: -Infinity };
    const extend = (c: HTMLTableCellElement) => {
      const p = origins.get(c)!;
      box.rMin = Math.min(box.rMin, p.r);
      box.cMin = Math.min(box.cMin, p.c);
      box.rMax = Math.max(box.rMax, p.r + c.rowSpan - 1);
      box.cMax = Math.max(box.cMax, p.c + c.colSpan - 1);
    };
    base.forEach(extend);

    if (base.length === 1) {
      const right = grid[o.r]?.[o.c + cell.colSpan];
      if (!right) { setTableContextMenu(null); return; }
      extend(right);
    }

    closeBox(grid, origins, box);
    const cells = cellsInBox(grid, box);
    const first = grid[box.rMin][box.cMin];
    cells.forEach((c) => {
      if (c === first) return;
      if (!isCellEmpty(c)) {
        first.innerHTML = isCellEmpty(first) ? c.innerHTML : `${first.innerHTML}<br>${c.innerHTML}`;
      }
      c.remove();
    });
    first.rowSpan = box.rMax - box.rMin + 1;
    first.colSpan = box.cMax - box.cMin + 1;
    first.style.width = '';
    first.style.height = '';

    clearCellSelection();
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleSplitCell = () => {
    if (!tableContextMenu) return;
    const { cell, table } = tableContextMenu;
    const widths = ensureFixedLayout(table);
    const grid = buildGrid(table);
    const o = gridOrigins(grid).get(cell);
    if (!o) { setTableContextMenu(null); return; }

    const plan = computeSplit(widths, o.c, cell.colSpan);
    if (!plan) { setTableContextMenu(null); return; }
    if (plan.half < MIN_COL_WIDTH) {
      alert('Cette cellule est trop étroite pour être scindée.');
      setTableContextMenu(null);
      return;
    }

    const total = cell.colSpan + (plan.insertCol >= 0 ? 1 : 0);

    if (plan.insertCol >= 0) {
      const bumped = new Set<HTMLTableCellElement>();
      grid.forEach((row) => {
        const cc = row[plan.insertCol];
        if (cc && !bumped.has(cc)) { cc.colSpan += 1; bumped.add(cc); }
      });
      setColWidths(table, plan.widths);
    }

    const right = makeCell();
    cell.colSpan = plan.leftSpan;
    right.colSpan = total - plan.leftSpan;
    right.rowSpan = cell.rowSpan;
    if (cell.style.backgroundColor) right.style.backgroundColor = cell.style.backgroundColor;
    cell.after(right);

    clearCellSelection();
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleSetTableAlign = (align: 'left' | 'center' | 'right') => {
    if (!tableContextMenu) return;
    const { wrapper, table } = tableContextMenu;
    const target = wrapper || table;
    target.classList.remove('align-left', 'align-center', 'align-right');
    target.classList.add(`align-${align}`);
    handleContentChange();
    setTableContextMenu(null);
  };

  const handleOpenCellColor = (e: ReactMouseEvent) => {
    if (!tableContextMenu) return;
    setCellColorTarget(tableContextMenu.cell);
    openPicker(e as any, 'cellBg');
    setTableContextMenu(null);
  };

  const handleInsertLink = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    saveCurrentSelection();
    const url = prompt('Entrez le lien URL :');
    restoreSelection();
    if (url) {
      document.execCommand('createLink', false, url);
      handleContentChange();
    }
  };

  const handleAddTab = () => {
    if (!activeNote || !activeFolder) return;
    const newTabId = `${activeNote.id}-t${Date.now()}`;
    const newTab: Tab = {
      id: newTabId,
      title: `Onglet ${activeNote.tabs.length + 1}`,
      icon: '📝',
      content: '',
    };
    setFolders((prev) =>
      prev.map((f) =>
        f.id === activeFolder.id
          ? {
              ...f,
              notes: f.notes.map((n) =>
                n.id === activeNote.id
                  ? { ...n, tabs: [...n.tabs, newTab], activeTabId: newTabId }
                  : n
              ),
            }
          : f
      )
    );
  };

  const handleSelectTab = (tabId: string) => {
    if (!activeNote || !activeFolder) return;
    setFolders((prev) =>
      prev.map((f) =>
        f.id === activeFolder.id
          ? {
              ...f,
              notes: f.notes.map((n) => (n.id === activeNote.id ? { ...n, activeTabId: tabId } : n)),
            }
          : f
      )
    );
  };

  const handleCloseTab = (e: ReactMouseEvent, tabId: string) => {
    e.stopPropagation();
    if (!activeNote || !activeFolder || activeNote.tabs.length <= 1) return;
    const updatedTabs = activeNote.tabs.filter((t) => t.id !== tabId);
    const nextActiveId = activeNote.activeTabId === tabId ? updatedTabs[0].id : activeNote.activeTabId;

    setFolders((prev) =>
      prev.map((f) =>
        f.id === activeFolder.id
          ? {
              ...f,
              notes: f.notes.map((n) =>
                n.id === activeNote.id
                  ? { ...n, tabs: updatedTabs, activeTabId: nextActiveId }
                  : n
              ),
            }
          : f
      )
    );
  };

  const handleModalSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!modalInput.trim()) return;

    if (modalType === 'folder') {
      const stamp = Date.now().toString();
      const newFolder: Folder = {
        id: stamp,
        name: modalInput.trim(),
        icon: '📁',
        notes: [createDefaultNote(stamp + '-n', 'Nouvelle note')],
      };
      setFolders((prev) => [...prev, newFolder]);
      setActiveFolderId(newFolder.id);
      setActiveNoteId(newFolder.notes[0].id);
    } else if (modalType === 'note') {
      const newNote = createDefaultNote(Date.now().toString(), modalInput.trim());
      const targetId = modalFolderId;
      setFolders((prev) => prev.map((f) => (f.id === targetId ? { ...f, notes: [...f.notes, newNote] } : f)));
      setActiveFolderId(targetId);
      setActiveNoteId(newNote.id);
      setCollapsedFolders((prev) => ({ ...prev, [targetId]: false }));
    }

    setModalInput('');
    setModalType(null);
  };

  const handleContextMenuAction = (action: 'rename' | 'icon' | 'delete') => {
    if (!contextMenu) return;
    const { type, id } = contextMenu;

    if (action === 'delete') {
      if (type === 'tab') {
        if (!activeNote || !activeFolder || activeNote.tabs.length <= 1) return;
        const updatedTabs = activeNote.tabs.filter((t) => t.id !== id);
        const nextActiveId = activeNote.activeTabId === id ? updatedTabs[0].id : activeNote.activeTabId;
        setFolders((prev) =>
          prev.map((f) =>
            f.id === activeFolder.id
              ? {
                  ...f,
                  notes: f.notes.map((n) =>
                    n.id === activeNote.id ? { ...n, tabs: updatedTabs, activeTabId: nextActiveId } : n
                  ),
                }
              : f
          )
        );
      } else {
        const pickFallback = (list: Folder[]) => {
          const first = list.flatMap((f) => f.notes.map((n) => ({ fid: f.id, nid: n.id })))[0];
          setActiveFolderId(first ? first.fid : ROOT_ID);
          setActiveNoteId(first ? first.nid : '');
        };
        if (type === 'folder') {
          const remaining = folders.filter((f) => f.id !== id);
          setFolders(remaining);
          if (activeFolder?.id === id) pickFallback(remaining);
        } else {
          const ownerFolder = folders.find((f) => f.notes.some((n) => n.id === id));
          const updated = folders.map((f) => ({ ...f, notes: f.notes.filter((n) => n.id !== id) }));
          setFolders(updated);
          if (activeNote?.id === id && ownerFolder) {
            const owner = updated.find((f) => f.id === ownerFolder.id);
            if (owner && owner.notes.length > 0) {
              setActiveFolderId(owner.id);
              setActiveNoteId(owner.notes[0].id);
            } else {
              pickFallback(updated);
            }
          }
        }
      }
    } else {
      const isRename = action === 'rename';
      let currentVal = '';
      if (type === 'tab') {
        const t = activeNote?.tabs.find((x) => x.id === id);
        currentVal = (isRename ? t?.title : t?.icon) || (isRename ? '' : '📝');
      } else if (type === 'folder') {
        const f = folders.find((x) => x.id === id);
        currentVal = (isRename ? f?.name : f?.icon) || (isRename ? '' : '📁');
      } else {
        const n = folders.flatMap((x) => x.notes).find((x) => x.id === id);
        currentVal = (isRename ? n?.title : n?.icon) || (isRename ? '' : '📄');
      }
      setEditModal({ type, id, action });
      setEditInput(currentVal);
    }

    setContextMenu(null);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editModal || !editInput.trim()) return;
    const { type, id, action } = editModal;
    const value = editInput.trim();

    if (type === 'tab') {
      const key = action === 'rename' ? 'title' : 'icon';
      setFolders((prev) =>
        prev.map((f) => ({
          ...f,
          notes: f.notes.map((n) => ({
            ...n,
            tabs: n.tabs.map((t) => (t.id === id ? { ...t, [key]: value } : t)),
          })),
        }))
      );
    } else if (type === 'folder') {
      const key = action === 'rename' ? 'name' : 'icon';
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
    } else {
      const key = action === 'rename' ? 'title' : 'icon';
      setFolders((prev) =>
        prev.map((f) => ({ ...f, notes: f.notes.map((n) => (n.id === id ? { ...n, [key]: value } : n)) }))
      );
    }

    setEditModal(null);
    setEditInput('');
  };

  const toggleFolderCollapse = (folderId: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const truncateFontName = (name: string, maxLen = 13) =>
    name.length <= maxLen ? name : name.substring(0, maxLen) + '…';

  const fontSizeOptions = FONT_SIZES.includes(fontSize)
    ? FONT_SIZES
    : [...FONT_SIZES, fontSize].sort((a, b) => a - b);

  const sidebarStyle: CSSProperties = {
    width: isSidebarOpen ? '280px' : '1px',
    minWidth: isSidebarOpen ? '280px' : '0px',
    margin: 0,
    height: 'calc(100vh - 34px)',
    borderRadius: 0,
    overflow: 'hidden',
    padding: isSidebarOpen ? '16px' : '16px 0px',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    willChange: 'width, min-width, padding',
    transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.4s cubic-bezier(0.16, 1, 0.3, 1), padding 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const sidebarInnerStyle: CSSProperties = {
    width: '248px',
    minWidth: '248px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    opacity: isSidebarOpen ? 1 : 0,
    transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-20px)',
    willChange: 'opacity, transform',
    transition: 'opacity 0.25s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <div className="app-bg" style={{ fontFamily: uiFontFamily }}>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />

      <input
        id="hidden-font-input"
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        onChange={handleFontUpload}
        style={{ display: 'none' }}
      />

      {currentView === 'editor' && (
        <div className="top-menubar" onClick={(e) => e.stopPropagation()}>
          <div className={`top-menu-item${activeTopMenu === 'file' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'file')}>Fichier</div>
          <div className={`top-menu-item${activeTopMenu === 'edit' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'edit')}>Édition</div>
          <div className={`top-menu-item${activeTopMenu === 'view' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'view')}>Affichage</div>
          <div className={`top-menu-item${activeTopMenu === 'insert' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'insert')}>Insertion</div>
          <div className={`top-menu-item${activeTopMenu === 'format' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'format')}>Format</div>
          <div className={`top-menu-item${activeTopMenu === 'tools' ? ' active' : ''}`} onClick={(e) => toggleTopMenu(e, 'tools')}>Outils</div>

          <div className="user-menu-container" style={{ position: 'relative', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#64748b' }}>
                {lastSaveTime && <span>Enregistré à {lastSaveTime}</span>}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transition: 'transform 0.4s ease, color 0.3s ease',
                    transform: isSaving ? 'rotate(180deg) scale(1.2)' : 'none',
                    color: isSaving ? '#2563eb' : '#64748b',
                  }}
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </div>
            )}

            <button
              onClick={() => {
                if (!user) {
                  setCurrentView('account');
                } else {
                  setShowUserMenu((prev) => !prev);
                }
              }}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                border: user ? '1.5px solid #2563eb' : '1px solid rgba(15, 23, 42, 0.2)',
                background: '#ffffff',
                padding: '1.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 5px rgba(15, 23, 42, 0.08)',
              }}
              title={user ? `${user.name} (Connecté)` : 'Se connecter'}
            >
              {user ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = 'https://www.gravatar.com/avatar/?d=mp';
                  }}
                />
              ) : (
                '👤'
              )}
            </button>

            {/* Menu Pop-up au clic sur l'avatar */}
            {showUserMenu && user && (
              <div
                className="glass menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '40px',
                  minWidth: '230px',
                  padding: '10px',
                  zIndex: 950,
                  background: '#ffffff',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  borderRadius: '12px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px 12px 10px', borderBottom: '1px solid rgba(15,23,42,0.08)', marginBottom: '6px' }}>
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div style={{ overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: '#16a34a', fontWeight: 500, lineHeight: 1 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                      <span>Connecté via Google</span>
                    </div>
                  </div>
                </div>

                <div
                  className="menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    handleGoogleLogin(true);
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7H4" />
                      <path d="M8 3L4 7l4 4" />
                      <path d="M4 17h16" />
                      <path d="M16 21l4-4-4-4" />
                    </svg>
                    Changer de compte
                  </span>
                </div>

                <div
                  className="menu-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowSettingsModal(true);
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Paramètres
                  </span>
                </div>

                <div style={{ height: '1px', background: 'rgba(15,23,42,0.08)', margin: '4px 0' }} />

                <div
                  className="menu-item danger"
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Se déconnecter
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="glass modal" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', textAlign: 'center', fontWeight: 600 }}>
              Paramètres du compte
            </h3>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'rgba(15,23,42,0.04)', marginBottom: '16px' }}>
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#0f172a' }}>{user.name}</div>
                  {user.email && <div style={{ fontSize: '0.78rem', color: '#475569' }}>{user.email}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '2px' }}>● Synchronisation Google active</div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <button
                className="m-btn"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => {
                  setShowSettingsModal(false);
                  handleGoogleLogin(true);
                }}
              >
                🔄 Changer de compte Google
              </button>
              <button
                className="m-btn"
                style={{ width: '100%', textAlign: 'left', color: '#ef4444' }}
                onClick={() => {
                  setShowSettingsModal(false);
                  handleLogout();
                }}
              >
                🚪 Se déconnecter
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="m-btn primary" onClick={() => setShowSettingsModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div style={{ background: '#fef2f2', color: '#991b1b', fontSize: '0.78rem', padding: '6px 16px', borderBottom: '1px solid #fecaca', zIndex: 650 }}>
          ⚠ Sauvegarde impossible : le stockage du navigateur est plein. Exportez vos notes en Markdown et supprimez les contenus volumineux (images).
        </div>
      )}

      {activeTopMenu && (
        <div
          className="glass menu unfurl-scroll-menu"
          style={{ left: topMenuPos.x, top: topMenuPos.y, minWidth: '180px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {activeTopMenu === 'file' && (
            <>
              <div className="menu-item" onClick={() => { setModalFolderId(activeFolder?.id ?? ROOT_ID); setModalType('note'); setActiveTopMenu(null); }}>
                Nouvelle note
              </div>
              <div className="menu-item" onClick={() => { setModalType('folder'); setActiveTopMenu(null); }}>
                Nouveau dossier
              </div>
              <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
              <div className="menu-item" onClick={() => { exportMarkdown(); setActiveTopMenu(null); }}>
                Exporter en Markdown (.md)
              </div>
            </>
          )}

          {activeTopMenu === 'edit' && (
            <>
              <div className="menu-item" onClick={() => { undo(); setActiveTopMenu(null); }}>
                Annuler <span>⌘Z</span>
              </div>
              <div className="menu-item" onClick={() => { redo(); setActiveTopMenu(null); }}>
                Rétablir <span>⌘Y</span>
              </div>
              <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
              <div className="menu-item" onClick={() => { document.execCommand('selectAll'); setActiveTopMenu(null); }}>
                Tout sélectionner <span>⌘A</span>
              </div>
            </>
          )}

          {activeTopMenu === 'view' && (
            <>
              <div className="menu-item" onClick={() => { setIsSidebarOpen(!isSidebarOpen); setActiveTopMenu(null); }}>
                {isSidebarOpen ? 'Masquer le panneau latéral' : 'Afficher le panneau latéral'}
              </div>
            </>
          )}

          {activeTopMenu === 'insert' && (
            <div style={{ position: 'relative' }}>
              <div
                className={`menu-item${showTablePicker ? ' active' : ''}`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTablePickerPos({ x: rect.right + 6, y: rect.top - 6 });
                  setShowTablePicker(true);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTablePickerPos({ x: rect.right + 6, y: rect.top - 6 });
                  setShowTablePicker(true);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TableIcon /> Tableau
                </span>
                <span>▸</span>
              </div>
              <div className="menu-item" onMouseEnter={() => setShowTablePicker(false)} onClick={insertHorizontalRule}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HrIcon /> Ligne horizontale
                </span>
              </div>
              <div
                className="menu-item"
                onMouseEnter={() => setShowTablePicker(false)}
                onClick={() => {
                  saveCurrentSelection();
                  setShowSpecialChars(true);
                  setActiveTopMenu(null);
                  setShowTablePicker(false);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <OmegaIcon /> Caractères spéciaux…
                </span>
              </div>
            </div>
          )}

          {activeTopMenu === 'format' && (
            <>
              <div className="menu-item" onClick={(e) => { formatText(e, 'bold'); setActiveTopMenu(null); }}>
                <strong>Gras</strong> <span>⌘B</span>
              </div>
              <div className="menu-item" onClick={(e) => { formatText(e, 'italic'); setActiveTopMenu(null); }}>
                <em>Italique</em> <span>⌘I</span>
              </div>
              <div className="menu-item" onClick={(e) => { formatText(e, 'underline'); setActiveTopMenu(null); }}>
                <u>Souligné</u> <span>⌘U</span>
              </div>
              <div className="menu-item" onClick={(e) => { formatText(e, 'strikeThrough'); setActiveTopMenu(null); }}>
                <s>Barré</s>
              </div>
              <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
              <div className="menu-item" onClick={(e) => { formatText(e, 'removeFormat'); setActiveTopMenu(null); }}>
                Effacer le formatage
              </div>
            </>
          )}

          {activeTopMenu === 'tools' && (
            <>
              <div
                className="menu-item"
                onClick={() => {
                  const text = editorRef.current?.innerText || '';
                  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                  const chars = text.length;
                  alert(`Nombre de mots : ${words}\nNombre de caractères : ${chars}`);
                  setActiveTopMenu(null);
                }}
              >
                Statistiques du texte…
              </div>
            </>
          )}
        </div>
      )}

      {activeTopMenu === 'insert' && showTablePicker && (
        <div
          className="glass menu table-picker-pop"
          style={{
            left: tablePickerPos.x,
            top: tablePickerPos.y,
            padding: '12px',
            minWidth: 'auto',
            boxShadow: '0 18px 40px rgba(15,23,42,0.2)',
            zIndex: 900,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setTableHover({ rows: 0, cols: 0 })}
        >
          <div className="tp-label">
            {tableHover.rows > 0 ? (
              <>
                <b>{tableHover.cols}</b> × <b>{tableHover.rows}</b>
              </>
            ) : (
              'Choisir la taille'
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 19px)`, gap: '2px' }}>
            {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLS }).map((_, i) => {
              const r = Math.floor(i / TABLE_PICKER_COLS);
              const c = i % TABLE_PICKER_COLS;
              const isOn = r < tableHover.rows && c < tableHover.cols;
              return (
                <div
                  key={i}
                  className={`tp-cell${isOn ? ' on' : ''}`}
                  onMouseEnter={() => setTableHover({ rows: r + 1, cols: c + 1 })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    insertTable(r + 1, c + 1);
                  }}
                >
                  <i />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showSpecialChars && (
        <div className="overlay" onClick={() => setShowSpecialChars(false)}>
          <div className="glass modal" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', textAlign: 'center', fontWeight: 600 }}>
              Caractères spéciaux
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(9, 1fr)',
                gap: '6px',
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '4px',
              }}
            >
              {SPECIAL_CHARS.map((char) => (
                <button
                  key={char}
                  onClick={() => insertSpecialChar(char)}
                  style={{
                    height: '34px',
                    fontSize: '1.1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(15,23,42,0.15)',
                    background: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ffffff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
                >
                  {char}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="m-btn" onClick={() => setShowSpecialChars(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {dropdown && (
        <div
          className="glass menu scroll parchment-unfurl"
          style={{
            left: dropdown.x,
            top: dropdown.y,
            maxHeight: '340px',
            overflowY: 'auto',
            minWidth: dropdown.kind === 'size' ? '68px' : dropdown.kind === 'zoom' ? '88px' : '140px',
            width: dropdown.kind === 'font' ? 'max-content' : dropdown.kind === 'size' ? '72px' : dropdown.kind === 'zoom' ? '92px' : 'auto',
            padding: dropdown.kind === 'size' || dropdown.kind === 'zoom' ? '4px' : '6px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {dropdown.kind === 'style' && (
            <>
              {Object.entries(BLOCK_STYLE_LABELS).map(([tag, label]) => (
                <div
                  key={tag}
                  className={`menu-item${currentStyle === tag ? ' active' : ''}`}
                  onClick={() => handleBlockStyleChange(tag)}
                >
                  {label}
                </div>
              ))}
            </>
          )}

          {dropdown.kind === 'font' && (
            <>
              {fontList.map((font) => (
                <div
                  key={font}
                  className={`menu-item${currentFontLabel === font ? ' active' : ''}`}
                  style={{ fontFamily: font }}
                  onClick={() => handleSelectFont(font)}
                >
                  {font}
                </div>
              ))}
              <div
                style={{
                  height: '1px',
                  background: 'rgba(15,23,42,0.1)',
                  margin: '4px 0',
                }}
              />
              <div
                className="menu-item"
                style={{ fontWeight: 600, color: '#2563eb' }}
                onClick={() => document.getElementById('hidden-font-input')?.click()}
              >
                Importer une police…
              </div>
            </>
          )}

          {dropdown.kind === 'size' && (
            <>
              {fontSizeOptions.map((s) => (
                <div
                  key={s}
                  className={`menu-item${fontSize === s ? ' active' : ''}`}
                  style={{ justifyContent: 'center', padding: '6px 0', textAlign: 'center' }}
                  onClick={() => changeFontSize(s)}
                >
                  {s}
                </div>
              ))}
            </>
          )}

          {dropdown.kind === 'lineHeight' && (
            <>
              {LINE_HEIGHTS.map((lh) => (
                <div
                  key={lh}
                  className={`menu-item${lineHeight === lh ? ' active' : ''}`}
                  onClick={() => handleSelectLineHeight(lh)}
                >
                  {lh}
                </div>
              ))}
            </>
          )}

          {dropdown.kind === 'zoom' && (
            <>
              {ZOOM_LEVELS.map((z) => (
                <div
                  key={z}
                  className={`menu-item${zoomPercent === z ? ' active' : ''}`}
                  style={{ justifyContent: 'center', padding: '6px 0', textAlign: 'center' }}
                  onClick={() => handleSelectZoom(z)}
                >
                  {z}%
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tableContextMenu && (
        <div
          className="glass menu compact scroll unfurl-scroll-menu"
          style={{
            minWidth: '230px',
            boxShadow: '0 20px 48px rgba(15,23,42,0.25)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-item" onClick={() => handleAddRow(true)}>Insérer une ligne au-dessus</div>
          <div className="menu-item" onClick={() => handleAddRow(false)}>Insérer une ligne en dessous</div>
          <div className="menu-item" onClick={() => handleAddColumn(true)}>Insérer une colonne à gauche</div>
          <div className="menu-item" onClick={() => handleAddColumn(false)}>Insérer une colonne à droite</div>
          <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
          <div className="menu-item" onClick={handleMergeCell}>Fusionner les cellules</div>
          <div className="menu-item" onClick={handleSplitCell}>Scinder la cellule</div>
          <div className="menu-item" onClick={handleDistributeRows}>Répartir les lignes</div>
          <div className="menu-item" onClick={handleDistributeCols}>Répartir les colonnes</div>
          <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
          <div className="menu-item" onClick={() => handleSetTableAlign('left')}>Aligner le tableau à gauche</div>
          <div className="menu-item" onClick={() => handleSetTableAlign('center')}>Centrer le tableau</div>
          <div className="menu-item" onClick={() => handleSetTableAlign('right')}>Aligner le tableau à droite</div>
          <div className="menu-item" onClick={handleOpenCellColor}>Couleur d'arrière-plan de la cellule</div>
          <div style={{ height: '1px', background: 'rgba(15,23,42,0.1)', margin: '4px 0' }} />
          <div className="menu-item danger" onClick={handleDeleteRow}>Supprimer la ligne</div>
          <div className="menu-item danger" onClick={handleDeleteColumn}>Supprimer la colonne</div>
          <div className="menu-item danger" style={{ fontWeight: 650 }} onClick={handleDeleteTable}>Supprimer le tableau</div>
        </div>
      )}

      {picker && (
        <div
          className="glass picker parchment-unfurl"
          style={{ left: picker.x, top: picker.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(picker.kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((c) => {
            const current = picker.kind === 'text' ? textColor : highlightColor;
            return (
              <div
                key={c}
                title={c}
                className={`swatch${current === c ? ' sel' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  applyColor(
                    picker.kind === 'text' ? 'foreColor' : picker.kind === 'cellBg' ? 'cellBg' : 'hiliteColor',
                    c
                  );
                }}
                style={{ background: c }}
              />
            );
          })}

          <div className="picker-custom">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>{customColor.toUpperCase()}</span>
            <button
              className="m-btn"
              onClick={(e) => {
                e.stopPropagation();
                applyColor(
                  picker.kind === 'text' ? 'foreColor' : picker.kind === 'cellBg' ? 'cellBg' : 'hiliteColor',
                  customColor
                );
              }}
            >
              Appliquer
            </button>
          </div>

          {(picker.kind === 'highlight' || picker.kind === 'cellBg') && (
            <div className="picker-none-bottom">
              <button
                className="m-btn"
                style={{ width: '100%', padding: '6px 0', fontSize: '0.78rem' }}
                onClick={(e) => {
                  e.stopPropagation();
                  applyColor(picker.kind === 'cellBg' ? 'cellBg' : 'hiliteColor', 'transparent');
                }}
              >
                ✕ Aucune couleur
              </button>
            </div>
          )}
        </div>
      )}

      {modalType && (
        <div className="overlay">
          <div className="glass modal">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', textAlign: 'center', fontWeight: 600 }}>
              {modalType === 'folder' ? 'Nouveau dossier' : 'Nouvelle note'}
            </h3>
            <form onSubmit={handleModalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                className="m-input"
                type="text"
                autoFocus
                placeholder={modalType === 'folder' ? 'Nom du dossier...' : 'Titre de la note...'}
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
              />
              {modalType === 'note' && (
                <select className="m-input" value={modalFolderId} onChange={(e) => setModalFolderId(e.target.value)}>
                  <option value={ROOT_ID}>Sans dossier</option>
                  {userFolders.map((f) => (
                    <option key={f.id} value={f.id}>{(f.icon || '📁') + ' ' + f.name}</option>
                  ))}
                </select>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="m-btn" onClick={() => { setModalType(null); setModalInput(''); }}>
                  Annuler
                </button>
                <button type="submit" className="m-btn primary">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModal && (
        <div className="overlay">
          <div className="glass modal">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', textAlign: 'center', fontWeight: 600 }}>
              {editModal.action === 'rename'
                ? `Renommer ${editModal.type === 'tab' ? "l'onglet" : editModal.type === 'note' ? 'la note' : 'le dossier'}`
                : `Changer l'icône de ${editModal.type === 'tab' ? "l'onglet" : editModal.type === 'note' ? 'la note' : 'du dossier'}`}
            </h3>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                className="m-input"
                type="text"
                autoFocus
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                style={{ textAlign: editModal.action === 'icon' ? 'center' : 'left' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="m-btn" onClick={() => setEditModal(null)}>Annuler</button>
                <button type="submit" className="m-btn primary">Valider</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="glass menu unfurl-scroll-menu"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 150),
            left: Math.min(contextMenu.x, window.innerWidth - 190),
          }}
        >
          <div className="menu-item" onClick={() => handleContextMenuAction('rename')}>Renommer</div>
          <div className="menu-item" onClick={() => handleContextMenuAction('icon')}>Changer l'icône</div>
          {contextMenu.type !== 'tab' || (activeNote && activeNote.tabs.length > 1) ? (
            <div className="menu-item danger" onClick={() => handleContextMenuAction('delete')}>Supprimer</div>
          ) : null}
        </div>
      )}

      {currentView === 'account' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'rgba(255,255,255,0.3)' }}>
          <div className="glass modal" style={{ width: '420px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '1.3rem', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>
              {isSignUp ? 'Créer un compte' : 'Connexion à votre espace'}
            </h2>
            <p style={{ margin: '0 0 15px 0', fontSize: '0.8rem', textAlign: 'center', color: '#64748b' }}>
              {isSignUp ? 'Inscrivez-vous pour synchroniser vos notes.' : 'Synchronisez vos notes en toute sécurité.'}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Adresse e-mail</label>
              <input className="m-input" type="email" placeholder="nom@exemple.com" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Mot de passe</label>
              <input className="m-input" type="password" placeholder="••••••••" />
            </div>

            <button className="m-btn primary" style={{ width: '100%', marginTop: '5px' }} onClick={() => { setUser({ name: 'Utilisateur Local', avatarUrl: 'https://www.gravatar.com/avatar/?d=mp' }); setCurrentView('editor'); }}>
              {isSignUp ? "S'inscrire" : 'Se connecter'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', margin: '5px 0', color: '#94a3b8', fontSize: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(15,23,42,0.1)' }} />
              <span style={{ padding: '0 10px' }}>ou continuer avec</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(15,23,42,0.1)' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="m-btn"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                }}
                onClick={() => handleGoogleLogin(false)}
                title="Continuer avec Google"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '5px', color: '#475569' }}>
              {isSignUp ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
              <a href="#toggle" onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); }} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                {isSignUp ? 'Se connecter' : 'Créer un compte'}
              </a>
            </div>

            <button className="m-btn" style={{ width: '100%', marginTop: '5px' }} onClick={() => setCurrentView('editor')}>
              ← Retour aux notes
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', width: '100vw', height: 'calc(100vh - 34px)', overflow: 'hidden' }}>
          <div className="glass sidebar-pane" style={sidebarStyle}>
            <div style={sidebarInnerStyle}>
              <div
                style={{
                  padding: '0 6px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '48px',
                  minHeight: '48px',
                  overflow: 'visible',
                }}
              >
                <div className="brand" aria-label="książka">
                  <span className="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="31" height="31">
                      <path d="M12 6.6C10.3 5.4 8 5 5.2 5v11.6c2.8 0 5.1.4 6.8 1.6z" fill="#ffffff" fillOpacity="0.95" />
                      <path d="M12 6.6c1.7-1.2 4-1.6 6.8-1.6v11.6c-2.8 0-5.1.4-6.8 1.6z" fill="#ffffff" fillOpacity="0.72" />
                      <g stroke="#0f172a" strokeOpacity="0.28" strokeWidth="0.35">
                        <path className="pg pg1" d="M12 6.6c1.7-1.2 4-1.6 6.8-1.6v11.6c-2.8 0-5.1.4-6.8 1.6z" fill="#ffffff" fillOpacity="0.98" />
                        <path className="pg pg2" d="M12 6.6c1.7-1.2 4-1.6 6.8-1.6v11.6c-2.8 0-5.1.4-6.8 1.6z" fill="#e2e8f0" fillOpacity="0.98" />
                        <path className="pg pg3" d="M12 6.6c1.7-1.2 4-1.6 6.8-1.6v11.6c-2.8 0-5.1.4-6.8 1.6z" fill="#cbd5e1" fillOpacity="0.98" />
                      </g>
                      <path className="ribbon" d="M15.4 5.1v4.3l1.3-1 1.3 1V5" fill="#94a3b8" />
                    </svg>

                    <div className="bfly-stage">
                      <div className="bfly bfly-1">
                        <div className="bfly-profile">
                          <svg className="bfly-wing-back" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                          <div className="bfly-body-side" />
                          <svg className="bfly-wing-front" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                        </div>
                      </div>
                      <div className="bfly bfly-2">
                        <div className="bfly-profile">
                          <svg className="bfly-wing-back" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                          <div className="bfly-body-side" />
                          <svg className="bfly-wing-front" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                        </div>
                      </div>
                      <div className="bfly bfly-3">
                        <div className="bfly-profile">
                          <svg className="bfly-wing-back" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                          <div className="bfly-body-side" />
                          <svg className="bfly-wing-front" viewBox="0 0 12 10">
                            <path d="M1 9 C4 9, 8 8, 11 1 C6 0, 2 3, 1 9 Z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </span>

                  <span className="brand-word">książka</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className="action-btn" onClick={() => setModalType('folder')}><PlusIcon /> Dossier</button>
                <button
                  className="action-btn"
                  onClick={() => { setModalFolderId(activeFolder?.id ?? ROOT_ID); setModalType('note'); }}
                >
                  <PlusIcon /> Note
                </button>
              </div>

              <input
                className="m-input"
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: '14px', padding: '9px 12px', fontSize: '0.85rem' }}
              />

              <div className="scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {query && userFolders.length === 0 && rootNotes.length === 0 && (
                  <div style={{ padding: '12px', fontSize: '0.83rem', color: '#64748b', textAlign: 'center' }}>Aucun résultat</div>
                )}
                {userFolders.map((folder) => {
                  const isCollapsed = !query && collapsedFolders[folder.id];
                  const isActiveFolder = activeFolder?.id === folder.id;
                  return (
                    <div key={folder.id} className={`card${isActiveFolder ? ' current' : ''}`}>
                      <div
                        className="row folder"
                        onClick={() => {
                          setActiveFolderId(folder.id);
                          setActiveNoteId(folder.notes[0]?.id || '');
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, type: 'folder', id: folder.id });
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <span>{folder.icon || '📁'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
                        </div>
                        {folder.notes.length > 0 && (
                          <span className="chev" onClick={(e) => toggleFolderCollapse(folder.id, e)}>
                            {isCollapsed ? '▸' : '▾'}
                          </span>
                        )}
                      </div>

                      {!isCollapsed && folder.notes.length > 0 && (
                        <div
                          className="notes-list"
                          style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '2px' }}
                        >
                          {folder.notes.map((note) => (
                            <div
                              key={note.id}
                              className={`row note${activeNote?.id === note.id ? ' active' : ''}`}
                              onClick={() => { setActiveFolderId(folder.id); setActiveNoteId(note.id); }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id: note.id });
                              }}
                            >
                              <span>{note.icon || '📄'}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {rootNotes.map((note) => {
                  const isActive = activeNote?.id === note.id;
                  return (
                    <div key={note.id} className={`card${isActive ? ' current' : ''}`}>
                      <div
                        className={`row root-note${isActive ? ' active' : ''}`}
                        onClick={() => { setActiveFolderId(ROOT_ID); setActiveNoteId(note.id); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id: note.id });
                        }}
                      >
                        <span>{note.icon || '📄'}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            className="toggle-tab"
            style={{ 
              left: isSidebarOpen ? '281px' : '1px',
              transition: 'left 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? 'Replier le panneau' : 'Déplier le panneau'}
          >
            {isSidebarOpen ? '◀' : '▶'}
          </button>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              height: 'calc(100vh - 34px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
          >
            <div
              className="glass"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '8px 16px',
                minHeight: '48px',
                borderRadius: 0,
                border: 'none',
                flexShrink: 0,
                gap: '6px 8px',
              }}
            >
              <div style={{ display: 'flex', gap: '3px' }}>
                <button className="tb-btn" onMouseDown={(e) => { e.preventDefault(); undo(); }} title="Annuler">↩</button>
                <button className="tb-btn" onMouseDown={(e) => { e.preventDefault(); redo(); }} title="Rétablir">↪</button>
              </div>

              <div className="tb-sep" />

              <button
                className="tb-custom-trigger"
                style={{ minWidth: '95px' }}
                onClick={(e) => openDropdown(e, 'style')}
              >
                <span>{BLOCK_STYLE_LABELS[currentStyle] || 'Normal'}</span>
                <span className={`tool-arrow${dropdown?.kind === 'style' ? ' open' : ''}`}>▾</span>
              </button>

              <div className="tb-sep" />

              <button
                className="tb-custom-trigger"
                style={{ minWidth: '135px' }}
                onClick={(e) => openDropdown(e, 'font')}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {truncateFontName(currentFontLabel === 'Police' || currentFontLabel.includes('system') ? 'IBM Plex Sans' : currentFontLabel)}
                </span>
                <span className={`tool-arrow${dropdown?.kind === 'font' ? ' open' : ''}`}>▾</span>
              </button>

              <div className="tb-sep" />

              <div className="size-box">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    stepFontSize(-1);
                  }}
                  title="Diminuer la taille"
                >
                  −
                </button>
                <button
                  type="button"
                  className="size-trigger-btn"
                  onClick={(e) => openDropdown(e, 'size')}
                >
                  <span>{fontSize}</span>
                  <span className={`tool-arrow${dropdown?.kind === 'size' ? ' open' : ''}`}>▾</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    stepFontSize(1);
                  }}
                  title="Augmenter la taille"
                >
                  +
                </button>
              </div>

              <div className="tb-sep" />

              <div style={{ display: 'flex', gap: '3px' }}>
                <button
                  className={`tb-btn${picker?.kind === 'text' ? ' on' : ''}`}
                  style={{ fontWeight: 'bold' }}
                  onClick={(e) => openPicker(e, 'text')}
                  title="Couleur du texte"
                >
                  A <span className="dot" style={{ background: textColor }} />
                </button>
                <button
                  className={`tb-btn${picker?.kind === 'highlight' ? ' on' : ''}`}
                  onClick={(e) => openPicker(e, 'highlight')}
                  title="Surlignage"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                    <g transform="rotate(45 12 11)">
                      <rect x="8.4" y="1.8" width="7.2" height="10.6" rx="1.5" />
                      <path d="M9.4 12.4h5.2l-1.3 4.6h-2.6z" />
                      <path d="M10.3 5.6h3.4" />
                    </g>
                    <path d="M3.2 21.2h8.2" strokeWidth="2.2" />
                  </svg>
                  <span className="dot" style={{ background: highlightColor === 'transparent' ? '#ffffff' : highlightColor }} />
                </button>
              </div>

              <div className="tb-sep" />

              <div style={{ display: 'flex', gap: '3px' }}>
                <button className={`tb-btn${isBold ? ' on' : ''}`} style={{ fontWeight: 'bold' }} onMouseDown={(e) => formatText(e, 'bold')} title="Gras">G</button>
                <button className={`tb-btn${isItalic ? ' on' : ''}`} style={{ fontStyle: 'italic' }} onMouseDown={(e) => formatText(e, 'italic')} title="Italique">I</button>
                <button className={`tb-btn${isUnderline ? ' on' : ''}`} style={{ textDecoration: 'underline' }} onMouseDown={(e) => formatText(e, 'underline')} title="Souligné">S</button>
                <button className={`tb-btn${isStrike ? ' on' : ''}`} style={{ textDecoration: 'line-through' }} onMouseDown={(e) => formatText(e, 'strikeThrough')} title="Barré">ab</button>
              </div>

              <div className="tb-sep" />

              <div style={{ display: 'flex', gap: '3px' }}>
                <button
                  className={`tb-btn${alignment === 'left' ? ' on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    editorRef.current?.focus();
                    applyAlignment('left');
                  }}
                  title="Aligner à gauche"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></svg>
                </button>
                <button
                  className={`tb-btn${alignment === 'center' ? ' on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    editorRef.current?.focus();
                    applyAlignment('center');
                  }}
                  title="Centrer"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></svg>
                </button>
                <button
                  className={`tb-btn${alignment === 'right' ? ' on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    editorRef.current?.focus();
                    applyAlignment('right');
                  }}
                  title="Aligner à droite"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></svg>
                </button>
                <button
                  className={`tb-btn${alignment === 'full' ? ' on' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    editorRef.current?.focus();
                    applyAlignment('full');
                  }}
                  title="Justifier"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '3px' }}>
                <button className="tb-btn" onMouseDown={(e) => { e.preventDefault(); restoreSelection(); editorRef.current?.focus(); document.execCommand('outdent', false); saveCurrentSelection(); handleContentChange(); }} title="Diminuer le retrait">◀|</button>
                <button className="tb-btn" onMouseDown={(e) => { e.preventDefault(); restoreSelection(); editorRef.current?.focus(); document.execCommand('indent', false); saveCurrentSelection(); handleContentChange(); }} title="Augmenter le retrait">|▶</button>
              </div>

              <button
                className="tb-custom-trigger"
                style={{ minWidth: '48px', padding: '0 6px', gap: '3px' }}
                onClick={(e) => openDropdown(e, 'lineHeight')}
                title="Interligne"
              >
                <span>{lineHeight}</span>
                <span className={`tool-arrow${dropdown?.kind === 'lineHeight' ? ' open' : ''}`}>▾</span>
              </button>

              <div className="tb-sep" />

              <button
                className="tb-custom-trigger"
                style={{ minWidth: '64px', padding: '0 7px', gap: '4px' }}
                onClick={(e) => openDropdown(e, 'zoom')}
                title="Zoom d'affichage"
              >
                <span>{zoomPercent}%</span>
                <span className={`tool-arrow${dropdown?.kind === 'zoom' ? ' open' : ''}`}>▾</span>
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflow: 'visible',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  width: isSidebarOpen ? '0px' : '215px',
                  visibility: isSidebarOpen ? 'hidden' : 'visible',
                  willChange: 'width',
                  transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.4s linear',
                }}
              >
                <div className="tb-sep" style={{ margin: '0 2px', flexShrink: 0 }} />
                <button className="tb-btn" style={{ flexShrink: 0 }} onMouseDown={(e) => { e.preventDefault(); editorRef.current?.focus(); handleInsertLink(e); }} title="Insérer un lien">🔗</button>
                <button 
                  className={`tb-btn${isBulletList ? ' on' : ''}`} 
                  style={{ flexShrink: 0 }} 
                  onMouseDown={(e) => { 
                    e.preventDefault(); 
                    restoreSelection(); 
                    editorRef.current?.focus(); 
                    document.execCommand('insertUnorderedList', false); 
                    setIsBulletList(document.queryCommandState('insertUnorderedList')); 
                    saveCurrentSelection(); 
                    handleContentChange(); 
                  }} 
                  title="Liste à puces"
                >
                  Liste
                </button>
                <button 
                  className={`tb-btn${isQuote ? ' on' : ''}`} 
                  style={{ flexShrink: 0 }} 
                  onMouseDown={(e) => { 
                    e.preventDefault(); 
                    restoreSelection(); 
                    editorRef.current?.focus(); 
                    const currentBlock = (document.queryCommandValue('formatBlock') || '').toLowerCase();
                    const targetBlock = currentBlock === 'blockquote' ? 'p' : 'blockquote';
                    document.execCommand('formatBlock', false, targetBlock);
                    setIsQuote(targetBlock === 'blockquote');
                    saveCurrentSelection(); 
                    handleContentChange(); 
                  }} 
                  title="Citation"
                >
                  ❝ Citation
                </button>
              </div>
            </div>

            {activeNote && (
              <div className="tabs-bar">
                {activeNote.tabs.map((tab) => {
                  const isActive = activeTab?.id === tab.id;
                  return (
                    <div
                      key={tab.id}
                      className={`tab-item${isActive ? ' active' : ''}`}
                      onClick={() => handleSelectTab(tab.id)}
                      onDoubleClick={() => setEditModal({ type: 'tab', id: tab.id, action: 'rename' })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, type: 'tab', id: tab.id });
                      }}
                      title="Double-clic pour renommer / Clic droit pour options"
                    >
                      <span>{tab.icon || '📝'}</span>
                      <span className="tab-title-text">{tab.title}</span>
                      {activeNote.tabs.length > 1 && (
                        <span
                          className="tab-close"
                          onClick={(e) => handleCloseTab(e, tab.id)}
                          title="Fermer l'onglet"
                        >
                          ✕
                        </span>
                      )}
                    </div>
                  );
                })}
                <button className="tab-add-btn" onClick={handleAddTab} title="Ajouter un onglet">
                  +
                </button>
              </div>
            )}

            <div
              className="glass"
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 0,
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                key={activeTab ? `${activeNote?.id}-${activeTab.id}` : 'none'}
                ref={editorRef}
                className="note-editor scroll"
                contentEditable={!!activeTab}
                suppressContentEditableWarning
                onContextMenu={handleEditorContextMenu}
                onMouseMove={handleEditorMouseMove}
                onMouseDown={handleEditorMouseDown}
                onInput={() => handleContentChange('typing')}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const k = e.key.toLowerCase();
                    if (k === 'z') { e.preventDefault(); stepHistory(e.shiftKey ? 1 : -1); }
                    else if (k === 'y') { e.preventDefault(); stepHistory(1); }
                    else if (!e.shiftKey && (k === 'b' || k === 'i' || k === 'u')) {
                     e.preventDefault();
                     ignoreSelectionChangeRef.current = true;
                     const command = k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline';
                     document.execCommand(command, false);
                     
                     if (command === 'bold') setIsBold(prev => !prev);
                     if (command === 'italic') setIsItalic(prev => !prev);
                     if (command === 'underline') setIsUnderline(prev => !prev);
                     
                     setTimeout(() => {
                       ignoreSelectionChangeRef.current = false;
                     }, 50);
                     handleContentChange('command');
                    }
                    else if (!e.shiftKey && k === 'k') handleInsertLink(e);
                  }
                }}
                onMouseUp={checkSelectionFormat}
                onKeyUp={checkSelectionFormat}
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '40px 64px',
                  outline: 'none',
                  fontSize: `${fontSize}px`,
                  zoom: (zoomPercent / 100) * 1.15,
                  lineHeight,
                  color: '#0f172a',
                  overflowY: 'auto',
                  textAlign: 'left',
                  direction: 'ltr',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}