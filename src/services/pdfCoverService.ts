import * as pdfjsLib from 'pdfjs-dist';
import type { BookFileFormat } from '../types/library';

// Configure PDF.js worker once across the app
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const MAX_CACHE_ENTRIES = 250;
const MAX_CONCURRENT_JOBS = 3;
const TARGET_COVER_WIDTH = 380;

const coverCache = new Map<string, string | null>();
const inFlightRequests = new Map<string, Promise<string | null>>();

interface QueueJob {
  key: string;
  pdfUrl: string;
  resolve: (value: string | null) => void;
}

const jobQueue: QueueJob[] = [];
let activeJobs = 0;

function setCachedCover(key: string, value: string | null): void {
  if (coverCache.has(key)) {
    coverCache.delete(key);
  } else if (coverCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = coverCache.keys().next().value;
    if (oldestKey !== undefined) {
      coverCache.delete(oldestKey);
    }
  }
  coverCache.set(key, value);
}

export function getCachedPdfCover(fileUrl?: string): string | null | undefined {
  const key = fileUrl?.trim();
  if (!key) return undefined;
  return coverCache.get(key);
}

export function isPdfCoverCandidate(fileUrl?: string, fileFormat?: BookFileFormat): boolean {
  const raw = fileUrl?.trim();
  if (!raw) return false;
  if (fileFormat === 'EPUB') return false;
  if (fileFormat === 'EXTERNAL') {
    return /\.pdf($|[?#])/i.test(raw);
  }
  if (raw.startsWith('/api/sample-pdf')) return true;
  if (fileFormat === 'PDF' || fileFormat === 'DRIVE_PDF') return true;
  return /\.pdf($|[?#])/i.test(raw) || raw.includes('drive.google.com');
}

function buildPdfFetchUrl(fileUrl: string): string {
  const raw = fileUrl.trim();
  if (raw.startsWith('/api/sample-pdf') || raw.startsWith('/api/proxy-pdf')) {
    return raw;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return `/api/proxy-pdf?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

async function renderFirstPageToDataUrl(pdfUrl: string): Promise<string | null> {
  const loadingTask = pdfjsLib.getDocument({
    url: pdfUrl,
    withCredentials: false,
    disableAutoFetch: true,
    disableStream: false,
  });

  try {
    const pdfDoc = await loadingTask.promise;
    if (pdfDoc.numPages < 1) {
      return null;
    }

    const page = await pdfDoc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) {
      return null;
    }

    const scale = Math.min(2, Math.max(0.4, TARGET_COVER_WIDTH / baseViewport.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    // Paint crisp white paper backdrop before rendering transparent PDF pages
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      canvas,
    });
    await renderTask.promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return null;
  } finally {
    void loadingTask.destroy();
  }
}

function drainQueue(): void {
  while (activeJobs < MAX_CONCURRENT_JOBS && jobQueue.length > 0) {
    const job = jobQueue.shift()!;
    activeJobs += 1;
    void renderFirstPageToDataUrl(job.pdfUrl)
      .then((result) => {
        setCachedCover(job.key, result);
        job.resolve(result);
      })
      .catch(() => {
        setCachedCover(job.key, null);
        job.resolve(null);
      })
      .finally(() => {
        activeJobs = Math.max(0, activeJobs - 1);
        drainQueue();
      });
  }
}

export function getPdfFirstPageCover(
  fileUrl: string,
  fileFormat?: BookFileFormat
): Promise<string | null> {
  if (!isPdfCoverCandidate(fileUrl, fileFormat)) {
    return Promise.resolve(null);
  }

  const key = fileUrl.trim();
  if (coverCache.has(key)) {
    return Promise.resolve(coverCache.get(key) ?? null);
  }

  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing;
  }

  const pdfUrl = buildPdfFetchUrl(key);
  const promise = new Promise<string | null>((resolve) => {
    jobQueue.push({ key, pdfUrl, resolve });
    drainQueue();
  }).finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}
