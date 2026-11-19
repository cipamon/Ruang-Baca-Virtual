import React, { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { BookFileFormat } from '../types/library';
import {
  getCachedPdfCover,
  getPdfFirstPageCover,
  isPdfCoverCandidate,
} from '../services/pdfCoverService';

interface BookCoverProps {
  coverUrl?: string;
  fileUrl?: string;
  fileFormat?: BookFileFormat;
  title: string;
  author: string;
  category: string;
  isDemo?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SPINE_PALETTES = [
  'from-[#0F2342] via-[#173663] to-[#1E4B8A]',
  'from-[#12294A] via-[#1B3E6E] to-[#0284C7]',
  'from-[#0B1D38] via-[#14305B] to-[#2563EB]',
  'from-[#102A43] via-[#1D4068] to-[#0369A1]',
];

function pickPalette(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return SPINE_PALETTES[Math.abs(hash) % SPINE_PALETTES.length];
}

export const BookCover: React.FC<BookCoverProps> = ({
  coverUrl,
  fileUrl,
  fileFormat,
  title,
  author,
  category,
  isDemo,
  className = '',
  size = 'md',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [inView, setInView] = useState(false);

  const normalizedCoverUrl = coverUrl?.trim() || '';
  const normalizedFileUrl = fileUrl?.trim() || '';

  const [pdfCoverState, setPdfCoverState] = useState<{
    sourceUrl: string;
    dataUrl: string | null;
  } | null>(() => {
    const cached = getCachedPdfCover(normalizedFileUrl);
    return cached ? { sourceUrl: normalizedFileUrl, dataUrl: cached } : null;
  });

  useEffect(() => {
    setCoverFailed(false);
  }, [normalizedCoverUrl]);

  const hasExplicitCover = Boolean(normalizedCoverUrl.length > 0 && !coverFailed);
  const needsPdfCover = !hasExplicitCover && isPdfCoverCandidate(normalizedFileUrl, fileFormat);

  useEffect(() => {
    if (!needsPdfCover) return;
    const cached = getCachedPdfCover(normalizedFileUrl);
    if (cached !== undefined) {
      setPdfCoverState({ sourceUrl: normalizedFileUrl, dataUrl: cached });
      return;
    }

    if (!inView && typeof IntersectionObserver !== 'undefined') {
      return;
    }

    let cancelled = false;
    void getPdfFirstPageCover(normalizedFileUrl, fileFormat).then((dataUrl) => {
      if (!cancelled) {
        setPdfCoverState({ sourceUrl: normalizedFileUrl, dataUrl });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [needsPdfCover, normalizedFileUrl, fileFormat, inView]);

  useEffect(() => {
    if (!needsPdfCover || inView) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [needsPdfCover, inView, normalizedFileUrl]);

  const pdfCoverUrl =
    !hasExplicitCover &&
    pdfCoverState &&
    pdfCoverState.sourceUrl === normalizedFileUrl
      ? pdfCoverState.dataUrl
      : null;

  const activeImageUrl = hasExplicitCover ? normalizedCoverUrl : pdfCoverUrl;
  const isPdfPageCover = !hasExplicitCover && Boolean(pdfCoverUrl);
  const gradient = pickPalette(title + category);

  return (
    <div
      ref={containerRef}
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-slate-100 border border-slate-200/80 select-none ${className}`}
    >
      {activeImageUrl ? (
        <img
          src={activeImageUrl}
          alt={
            isPdfPageCover
              ? `Sampul halaman pertama buku ${title}`
              : `Sampul buku ${title}`
          }
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (hasExplicitCover) setCoverFailed(true);
          }}
          className={`h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03] ${
            isPdfPageCover ? 'object-cover object-top bg-white' : 'object-cover'
          }`}
        />
      ) : (
        <div
          className={`h-full w-full bg-gradient-to-br ${gradient} p-4 flex flex-col justify-between text-white relative`}
        >
          {/* Subtle spine groove */}
          <div className="absolute inset-y-0 left-2.5 w-px bg-white/20" aria-hidden="true" />
          <div className="pl-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium tracking-wider uppercase text-sky-200 truncate">
              {category}
            </span>
            <BookOpen className="w-3.5 h-3.5 text-sky-300/80 shrink-0" />
          </div>

          <div className="pl-3 my-auto">
            <div className="w-8 h-0.5 bg-sky-300/70 mb-3" />
            <h4
              className={`font-editorial font-semibold leading-snug text-white line-clamp-4 ${
                size === 'lg' ? 'text-xl sm:text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm sm:text-base'
              }`}
            >
              {title}
            </h4>
          </div>

          <div className="pl-3 pt-2 border-t border-white/15">
            <p className="text-[11px] text-sky-100/90 truncate font-medium">{author}</p>
          </div>
        </div>
      )}

      {isDemo && (
        <span
          title="Koleksi Contoh / Demo"
          className="absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-medium tracking-wide bg-white/90 text-[#0F2342] rounded border border-slate-200 shadow-xs"
        >
          Demo
        </span>
      )}
    </div>
  );
};
