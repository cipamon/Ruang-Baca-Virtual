import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Download,
  ExternalLink,
  Heart,
  X,
} from 'lucide-react';
import type { Book } from '../types/library';
import { BookCover } from './BookCover';
import { downloadBookWithProgress } from '../services/libraryService';

interface BookDetailModalProps {
  book: Book | null;
  isFavorite: boolean;
  allowGuestDownload: boolean;
  onClose: () => void;
  onReadNow: (book: Book) => void;
  onToggleFavorite: (book: Book) => void;
  onDownloaded: (book: Book) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isFavorite,
  allowGuestDownload,
  onClose,
  onReadNow,
  onToggleFavorite,
  onDownloaded,
  onNotify,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  if (!book) return null;

  const isExternalNonPdf = book.fileFormat === 'EXTERNAL' || book.fileFormat === 'EPUB';
  const isDrive = book.fileFormat === 'DRIVE_PDF' || book.fileUrl.includes('drive.google.com');

  const handleDownload = async () => {
    if (!allowGuestDownload) {
      onNotify('info', 'Pengunduhan saat ini dibatasi oleh pengaturan perpustakaan.');
      return;
    }
    setDownloading(true);
    setProgress(5);
    try {
      await downloadBookWithProgress(book, (pct) => setProgress(pct));
      onDownloaded(book);
      onNotify('success', `Berhasil mengunduh "${book.title}".`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error
          ? err.message
          : 'Gagal mengunduh file. Pastikan tautan sumber dapat diakses publik.'
      );
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setProgress(null);
      }, 600);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-book-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span>{book.bookCode}</span>
            <span aria-hidden="true">·</span>
            <span>{book.fileFormat}</span>
            {book.fileSize && (
              <>
                <span aria-hidden="true">·</span>
                <span>{book.fileSize}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail buku"
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-8 max-h-[82vh] overflow-y-auto">
          <div className="md:col-span-4">
            <BookCover
              coverUrl={book.coverUrl}
              fileUrl={book.fileUrl}
              fileFormat={book.fileFormat}
              title={book.title}
              author={book.author}
              category={book.category}
              isDemo={book.isDemo}
              size="lg"
            />
          </div>

          <div className="md:col-span-8 flex flex-col">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-700 mb-2">
              <span>{book.category}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-500 tabular-nums">Terbit {book.year}</span>
            </div>

            <h2
              id="detail-book-title"
              className="font-editorial text-2xl sm:text-3xl font-bold text-[#0F2342] leading-tight mb-2"
            >
              {book.title}
            </h2>
            <p className="text-base font-medium text-slate-700 mb-6">{book.author}</p>

            {/* Metadata Grid */}
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 py-4 border-y border-slate-200 text-sm mb-6">
              <div>
                <dt className="text-xs text-slate-500">Penerbit</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{book.publisher}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tahun Terbit</dt>
                <dd className="font-medium text-slate-900 tabular-nums mt-0.5">{book.year}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ISBN</dt>
                <dd className="font-mono text-xs text-slate-800 mt-1">{book.isbn || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Total Pembaca</dt>
                <dd className="font-medium text-slate-900 tabular-nums mt-0.5">
                  {book.viewsCount.toLocaleString('id-ID')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Total Unduhan</dt>
                <dd className="font-medium text-slate-900 tabular-nums mt-0.5">
                  {book.downloadsCount.toLocaleString('id-ID')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Format & Ukuran</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {book.fileFormat} {book.fileSize ? `(${book.fileSize})` : ''}
                </dd>
              </div>
            </dl>

            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Sinopsis Buku
              </h3>
              <p className="text-sm sm:text-[15px] text-slate-700 leading-relaxed max-w-prose whitespace-pre-line">
                {book.description}
              </p>
            </div>

            {isDrive && (
              <div className="mb-5 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-[#0F2342] flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                <span>
                  Berkas ini ditautkan dari Google Drive. Jika Google Drive membatasi pemuatan PDF langsung, pembaca akan otomatis beralih ke mode pratinjau Google Drive atau unduhan langsung.
                </span>
              </div>
            )}

            {isExternalNonPdf && (
              <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Format berkas adalah <strong>{book.fileFormat}</strong>. Berkas non-PDF tidak dapat ditampilkan langsung di PDF Viewer dan dapat diunduh atau dibuka pada tautan eksternal.
                </span>
              </div>
            )}

            {/* Download Progress Indicator */}
            {downloading && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                  <span>Mengunduh berkas buku...</span>
                  <span className="tabular-nums font-medium">
                    {progress !== null ? `${progress}%` : 'Memproses...'}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 transition-all duration-150"
                    style={{ width: `${progress ?? 60}%` }}
                  />
                </div>
              </div>
            )}

            {/* Primary Actions */}
            <div className="mt-auto pt-4 flex flex-wrap items-center gap-3">
              {isExternalNonPdf ? (
                <a
                  href={book.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-sky-300" />
                  Buka Sumber Eksternal
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onReadNow(book)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-sky-300" />
                  BACA SEKARANG
                </button>
              )}

              <button
                type="button"
                disabled={downloading}
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4 text-sky-700" />
                {downloading ? 'MENGUNDUH...' : 'DOWNLOAD'}
              </button>

              <button
                type="button"
                onClick={() => onToggleFavorite(book)}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg border transition-colors ${
                  isFavorite
                    ? 'bg-[#0F2342] text-white border-[#0F2342]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current text-sky-300' : ''}`} />
                {isFavorite ? 'TERSARING DI FAVORIT' : 'TAMBAHKAN KE FAVORIT'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
