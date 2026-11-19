import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Book } from '../types/library';
import { downloadBookWithProgress, resolveBookReaderUrl } from '../services/libraryService';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfReaderModalProps {
  book: Book | null;
  onClose: () => void;
  onDownloaded: (book: Book) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const PdfReaderModal: React.FC<PdfReaderModalProps> = ({
  book,
  onClose,
  onDownloaded,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [useDriveIframe, setUseDriveIframe] = useState(false);
  const [useExternalGoogleViewer, setUseExternalGoogleViewer] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const resolved = book ? resolveBookReaderUrl(book) : null;

  useEffect(() => {
    if (!book || !resolved) return;

    let cancelled = false;
    setLoading(true);
    setErrorMsg('');
    setPdfDoc(null);
    setPageNumber(1);
    setNumPages(0);
    setUseDriveIframe(false);
    setUseExternalGoogleViewer(false);

    if (book.fileFormat === 'EPUB' || book.fileFormat === 'EXTERNAL') {
      setLoading(false);
      setErrorMsg(
        `Format berkas (${book.fileFormat}) tidak kompatibel dengan PDF Viewer bawaan. Gunakan tombol Unduh atau buka tautan sumber eksternal.`
      );
      return;
    }

    const loadingTask = pdfjsLib.getDocument({
      url: resolved.pdfUrl,
      withCredentials: false,
    });

    loadingTask.promise
      .then((docProxy) => {
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(docProxy);
        setNumPages(docProxy.numPages);
        setLoading(false);
      })
      .catch(async (err) => {
        if (cancelled) return;
        console.error('PDF load error:', err);
        if (resolved.isGoogleDrive && resolved.drivePreviewUrl) {
          setUseDriveIframe(true);
          setLoading(false);
          return;
        }

        let detailedError = '';
        if (resolved.pdfUrl.startsWith('/api/proxy-pdf')) {
          try {
            const probe = await fetch(resolved.pdfUrl);
            if (!probe.ok) {
              const json = (await probe.json().catch(() => null)) as { error?: string } | null;
              if (json?.error) detailedError = json.error;
            }
          } catch {
            // ignore probe error
          }
        }

        if (cancelled) return;
        setErrorMsg(
          detailedError ||
            'Dokumen PDF tidak dapat dimuat langsung di PDF Viewer. Anda masih dapat mencoba mode Google Docs Viewer, mengunduh berkas, atau membuka tautan asli.'
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [book?.id, book?.fileUrl, retryToken]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || useDriveIframe || useExternalGoogleViewer) return;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let active = true;

    pdfDoc.getPage(pageNumber).then((page) => {
      if (!active || !canvasRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        background: '#FFFFFF',
      });

      renderTask.promise.catch(() => {
        // ignore cancel errors during fast paging/zoom
      });
    });

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale, useDriveIframe, useExternalGoogleViewer]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!book) return null;

  const isIframeMode = useDriveIframe || useExternalGoogleViewer;
  const googleDocsViewerUrl = book.fileUrl.startsWith('http')
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(book.fileUrl)}`
    : '';

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      onNotify('info', 'Mode layar penuh tidak didukung oleh peramban saat ini.');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBookWithProgress(book, () => {});
      onDownloaded(book);
      onNotify('success', `Mengunduh "${book.title}".`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal mengunduh file buku.'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#0B192E] text-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Pembaca PDF ${book.title}`}
    >
      {/* Reader Toolbar */}
      <header className="bg-[#0F2342] border-b border-white/10 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-semibold text-white truncate">{book.title}</h2>
          <p className="text-xs text-sky-200/80 truncate">{book.author}</p>
        </div>

        {/* Page & Zoom Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {!isIframeMode && numPages > 0 && (
            <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono tabular-nums whitespace-nowrap">
                {pageNumber} / {numPages}
              </span>
              <button
                type="button"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                aria-label="Halaman berikutnya"
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isIframeMode && numPages > 0 && (
            <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))))}
                aria-label="Perkecil tampilan"
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-1.5 text-xs font-mono tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.2, Number((s + 0.15).toFixed(2))))}
                aria-label="Perbesar tampilan"
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{downloading ? 'Mengunduh...' : 'Download'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pembaca PDF"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-red-500/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Reader Viewport */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-slate-900">
        {loading && (
          <div className="my-auto text-center">
            <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-sky-100">Memuat dokumen PDF...</p>
          </div>
        )}

        {!loading && errorMsg && !useExternalGoogleViewer && (
          <div className="my-auto max-w-lg w-full bg-white text-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200">
            <div className="flex items-center gap-3 text-amber-700 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-lg font-semibold">Berkas Tidak Dapat Ditampilkan di PDF Viewer</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">{errorMsg}</p>
            <div className="flex flex-wrap gap-2.5">
              {googleDocsViewerUrl && book.fileFormat !== 'EPUB' && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setUseExternalGoogleViewer(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                >
                  <Globe className="w-4 h-4 text-sky-300" />
                  Coba Pembaca Alternatif
                </button>
              )}
              <button
                type="button"
                onClick={() => setRetryToken((n) => n + 1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
              >
                <RotateCw className="w-4 h-4 text-sky-700" />
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                <Download className="w-4 h-4" />
                Coba Unduh Berkas
              </button>
              {book.fileUrl.startsWith('http') && (
                <a
                  href={book.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buka Tautan Asli
                </a>
              )}
            </div>
          </div>
        )}

        {!loading && useDriveIframe && resolved?.drivePreviewUrl && (
          <div className="w-full max-w-5xl h-full min-h-[75vh] bg-white rounded-xl overflow-hidden border border-slate-700">
            <iframe
              src={resolved.drivePreviewUrl}
              title={`Pratinjau Google Drive - ${book.title}`}
              className="w-full h-full min-h-[75vh]"
              allow="autoplay"
            />
          </div>
        )}

        {!loading && useExternalGoogleViewer && googleDocsViewerUrl && (
          <div className="w-full max-w-5xl h-full min-h-[75vh] bg-white rounded-xl overflow-hidden border border-slate-700">
            <iframe
              src={googleDocsViewerUrl}
              title={`Pembaca Alternatif - ${book.title}`}
              className="w-full h-full min-h-[75vh]"
            />
          </div>
        )}

        {!loading && !errorMsg && !isIframeMode && pdfDoc && (
          <div className="bg-white shadow-2xl rounded overflow-hidden max-w-full">
            <canvas ref={canvasRef} className="block max-w-full h-auto" />
          </div>
        )}
      </div>

      {/* Mobile-Friendly Bottom Page Bar */}
      {!isIframeMode && numPages > 0 && (
        <footer className="sm:hidden bg-[#0F2342] border-t border-white/10 px-4 py-2.5 flex items-center justify-between">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-xs font-medium bg-white/10 rounded-lg disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="text-xs font-mono tabular-nums">
            Hal {pageNumber} / {numPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            className="px-3 py-1.5 text-xs font-medium bg-white/10 rounded-lg disabled:opacity-40"
          >
            Berikutnya
          </button>
        </footer>
      )}
    </div>
  );
};
