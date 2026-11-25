import { Check, Copy, Image as ImageIcon, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SeismicEvent } from '../types/seismic';
import {
  copyEventToClipboard,
  getShareChannelUrls,
  nativeShareEvent,
} from '../utils/shareEvent';

interface ShareMenuButtonProps {
  event: SeismicEvent;
  onOpenGenerator?: (event: SeismicEvent) => void;
  variant?: 'icon' | 'button';
}

export default function ShareMenuButton({
  event,
  onOpenGenerator,
  variant = 'icon',
}: ShareMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const urls = getShareChannelUrls(event);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuW = 208;
      const estimatedH = 220;
      const openUpward = rect.bottom + estimatedH > window.innerHeight - 12;
      const top = openUpward ? Math.max(8, rect.top - estimatedH) : rect.bottom + 6;
      const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
      setMenuPos({ top, left });
    }
    setOpen((v) => !v);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyEventToClipboard(event);
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1100);
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await nativeShareEvent(event);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      {variant === 'button' ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleMenu}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Share2 className="w-3.5 h-3.5" />
          Compartir
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleMenu}
          title="Compartir evento"
          aria-label="Compartir evento"
          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
      )}

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: menuPos.top, left: menuPos.left }}
          className="fixed z-[950] w-52 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5 text-xs"
        >
          <button
            type="button"
            onClick={handleCopy}
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{copied ? 'Resumen copiado' : 'Copiar resumen y enlace'}</span>
          </button>

          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>Compartir con dispositivo</span>
            </button>
          )}

          {onOpenGenerator && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGenerator(event);
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-sky-700 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Crear Tarjeta 4:5</span>
            </button>
          )}

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <a
            href={urls.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Enviar por WhatsApp
          </a>
          <a
            href={urls.telegram}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Enviar por Telegram
          </a>
          <a
            href={urls.xTwitter}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Publicar en X
          </a>
        </div>
      )}
    </div>
  );
}
