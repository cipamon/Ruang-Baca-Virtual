import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'book_stats.json');

interface BookStatDelta {
  views: number;
  downloads: number;
}

type StatsMap = Record<string, BookStatDelta>;

function loadStats(): StatsMap {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf-8');
      return JSON.parse(raw) as StatsMap;
    }
  } catch {
    // ignore corrupted cache and start clean
  }
  return {};
}

function saveStats(stats: StatsMap): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch {
    // non-fatal if filesystem is read-only
  }
}

let statsCache: StatsMap = loadStats();

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function extractGoogleDriveId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes('drive.google.com') && !u.hostname.includes('docs.google.com')) {
      return null;
    }
    const filePathMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch) return filePathMatch[1];
    const docPathMatch = u.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docPathMatch) return docPathMatch[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return idParam;
    return null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizeFilename(input: string): string {
  const cleaned = input
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned.slice(0, 80) || 'Buku_Ruang_Baca_Virtual';
}

function wrapTextLines(text: string, maxChars: number): string[] {
  const words = text.replace(/\r?\n/g, ' ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function toAsciiSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
}

async function generateSamplePdfBytes(params: {
  title: string;
  author: string;
  publisher: string;
  year: string;
  category: string;
  isbn: string;
  bookCode: string;
  description: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const navy = rgb(15 / 255, 35 / 255, 66 / 255);
  const sky = rgb(2 / 255, 132 / 255, 199 / 255);
  const slate = rgb(71 / 255, 85 / 255, 105 / 255);
  const darkInk = rgb(15 / 255, 23 / 255, 42 / 255);
  const lightBg = rgb(248 / 255, 250 / 255, 252 / 255);
  const borderCol = rgb(203 / 255, 213 / 255, 225 / 255);

  const safeTitle = toAsciiSafe(params.title || 'Koleksi Digital');
  const safeAuthor = toAsciiSafe(params.author || 'Penulis Terdaftar');
  const safePublisher = toAsciiSafe(params.publisher || 'Pustaka Ruang Baca Virtual');
  const safeCategory = toAsciiSafe(params.category || 'Pengetahuan Umum');
  const safeYear = toAsciiSafe(params.year || '2026');
  const safeIsbn = toAsciiSafe(params.isbn || '-');
  const safeCode = toAsciiSafe(params.bookCode || 'RBV-DEMO');
  const safeDesc = toAsciiSafe(
    params.description ||
      'Dokumen pratinjau edisi digital dari Ruang Baca Virtual untuk mendukung pembacaan langsung di peramban.'
  );

  // Page 1: Cover Page
  const p1 = pdfDoc.addPage([595, 842]);
  p1.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: navy });
  p1.drawRectangle({ x: 36, y: 36, width: 523, height: 770, borderColor: sky, borderWidth: 1.5 });
  p1.drawText('RUANG BACA VIRTUAL', {
    x: 64,
    y: 748,
    size: 11,
    font: sansBold,
    color: rgb(125 / 255, 211 / 255, 252 / 255),
  });
  p1.drawText('MEMBACA TANPA BATAS, PENGETAHUAN TANPA JARAK', {
    x: 64,
    y: 730,
    size: 8.5,
    font: sans,
    color: rgb(186 / 255, 230 / 255, 253 / 255),
  });

  p1.drawLine({
    start: { x: 64, y: 706 },
    end: { x: 531, y: 706 },
    thickness: 0.8,
    color: rgb(56 / 255, 189 / 255, 248 / 255),
  });

  p1.drawText(`KATEGORI: ${safeCategory.toUpperCase()}`, {
    x: 64,
    y: 590,
    size: 10,
    font: sansBold,
    color: rgb(125 / 255, 211 / 255, 252 / 255),
  });

  const titleLines = wrapTextLines(safeTitle, 28).slice(0, 4);
  let yCursor = 548;
  for (const line of titleLines) {
    p1.drawText(line, {
      x: 64,
      y: yCursor,
      size: 28,
      font: serifBold,
      color: rgb(1, 1, 1),
    });
    yCursor -= 36;
  }

  p1.drawText(`Oleh ${safeAuthor}`, {
    x: 64,
    y: yCursor - 18,
    size: 15,
    font: serif,
    color: rgb(226 / 255, 232 / 255, 240 / 255),
  });

  p1.drawText(`Penerbit: ${safePublisher}  |  Tahun: ${safeYear}`, {
    x: 64,
    y: 110,
    size: 10,
    font: sans,
    color: rgb(203 / 255, 213 / 255, 225 / 255),
  });
  p1.drawText(`Kode Katalog: ${safeCode}  |  ISBN: ${safeIsbn}`, {
    x: 64,
    y: 92,
    size: 9.5,
    font: sans,
    color: rgb(148 / 255, 163 / 255, 184 / 255),
  });

  // Page 2: Katalog & Sinopsis
  const p2 = pdfDoc.addPage([595, 842]);
  p2.drawRectangle({ x: 54, y: 690, width: 487, height: 92, color: lightBg, borderColor: borderCol, borderWidth: 1 });
  p2.drawText('KARTU KATALOG DIGITAL', { x: 70, y: 760, size: 10, font: sansBold, color: sky });
  p2.drawText(`Judul       : ${safeTitle.slice(0, 62)}`, { x: 70, y: 740, size: 10, font: sans, color: darkInk });
  p2.drawText(`Penulis     : ${safeAuthor}`, { x: 70, y: 724, size: 10, font: sans, color: darkInk });
  p2.drawText(`Penerbit    : ${safePublisher} (${safeYear})  |  Kode: ${safeCode}`, {
    x: 70,
    y: 708,
    size: 10,
    font: sans,
    color: slate,
  });

  p2.drawText('Sinopsis & Ringkasan Karya', { x: 54, y: 642, size: 18, font: serifBold, color: navy });
  p2.drawLine({ start: { x: 54, y: 632 }, end: { x: 541, y: 632 }, thickness: 1, color: borderCol });

  const descLines = wrapTextLines(safeDesc, 74);
  let dy = 606;
  for (const line of descLines) {
    if (dy < 100) break;
    p2.drawText(line, { x: 54, y: dy, size: 11.5, font: serif, color: darkInk });
    dy -= 18;
  }

  p2.drawText(
    'Catatan Edisi: Dokumen ini adalah edisi bacaan resmi yang disediakan pada platform Ruang Baca Virtual.',
    { x: 54, y: 120, size: 9.5, font: sans, color: slate }
  );
  p2.drawText('Halaman 2 dari 5', { x: 262, y: 42, size: 9, font: sans, color: slate });

  // Pages 3 - 5: Chapters
  const chapters = [
    {
      heading: 'Bab 1: Kerangka Pemikiran dan Konteks',
      paragraphs: [
        `Pembahasan dalam "${safeTitle}" diawali dengan pemetaan konseptual mengenai topik ${safeCategory.toLowerCase()} di era transformasi informasi modern. Penulis (${safeAuthor}) menekankan pentingnya literasi kritis dan pemahaman metodologis yang terstruktur.`,
        'Dalam beberapa dekade terakhir, akses terhadap pengetahuan tidak lagi dibatasi oleh ruang fisik perpustakaan konvensional. Kehadiran repositori digital memungkinkan peneliti, pelajar, dan masyarakat umum menelusuri gagasan lintas disiplin secara cepat dan terukur.',
        'Pada bagian pembuka ini, pembaca diajak meninjau prinsip-prinsip dasar, istilah kunci, serta landasan historis yang membentuk topik utama karya ini sehingga setiap bab berikutnya dapat diikuti secara runtut.',
      ],
    },
    {
      heading: 'Bab 2: Analisis Mendalam dan Studi Kasus',
      paragraphs: [
        `Memasuki bagian inti, ${safeAuthor} menguraikan bagaimana konsep teoritis dalam bidang ${safeCategory.toLowerCase()} diterapkan ke dalam studi kasus nyata. Pendekatan yang digunakan memadukan observasi empiris dengan refleksi analitis yang jernih.`,
        'Setiap argumen disusun dengan memperhatikan keseimbangan antara kedalaman materi dan keterbacaan bagi audiens luas. Contoh-contoh konkret disajikan untuk memperlihatkan keterkaitan antara kebijakan, praktik lapangan, dan dampak jangka panjang.',
        'Pembaca dapat memanfaatkan struktur sub-bahasan ini sebagai bahan referensi akademik maupun panduan praktis dalam pengembangan wawasan mandiri.',
      ],
    },
    {
      heading: 'Bab 3: Sintesis, Refleksi, dan Arah Masa Depan',
      paragraphs: [
        'Pada bagian penutup pratinjau ini, seluruh temuan utama dirangkum menjadi poin-poin strategis yang relevan bagi perkembangan ilmu pengetahuan masa kini.',
        `Karya terbitan ${safePublisher} (${safeYear}) ini menegaskan bahwa pembelajaran berkelanjutan memerlukan ekosistem baca yang terbuka, inklusif, dan mudah diakses dari berbagai perangkat.`,
        'Terima kasih telah membaca melalui Ruang Baca Virtual. Anda dapat menyimpan buku ini ke daftar Favorit atau mengunduh salinan PDF untuk dibaca secara luring.',
      ],
    },
  ];

  chapters.forEach((chapter, idx) => {
    const page = pdfDoc.addPage([595, 842]);
    page.drawText(`${safeTitle.slice(0, 55)} - ${safeAuthor}`, {
      x: 54,
      y: 786,
      size: 9,
      font: sans,
      color: slate,
    });
    page.drawLine({ start: { x: 54, y: 778 }, end: { x: 541, y: 778 }, thickness: 0.6, color: borderCol });

    page.drawText(chapter.heading, {
      x: 54,
      y: 734,
      size: 18,
      font: serifBold,
      color: navy,
    });

    let py = 696;
    for (const para of chapter.paragraphs) {
      const pLines = wrapTextLines(para, 72);
      for (const line of pLines) {
        page.drawText(line, { x: 54, y: py, size: 11.5, font: serif, color: darkInk });
        py -= 19;
      }
      py -= 14;
    }

    page.drawText(`Halaman ${idx + 3} dari 5`, { x: 262, y: 42, size: 9, font: sans, color: slate });
  });

  return pdfDoc.save();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Sample Multi-Page PDF Endpoint for Demo Catalog Books
  app.get('/api/sample-pdf', async (req, res) => {
    try {
      const title = String(req.query.title || 'Koleksi Ruang Baca Virtual');
      const author = String(req.query.author || 'Tim Pustaka');
      const publisher = String(req.query.publisher || 'Pustaka Ruang Baca Virtual');
      const year = String(req.query.year || '2026');
      const category = String(req.query.category || 'Pengetahuan Umum');
      const isbn = String(req.query.isbn || '-');
      const bookCode = String(req.query.bookCode || 'RBV-DEMO');
      const description = String(req.query.description || '');
      const isDownload = req.query.download === '1';

      const bytes = await generateSamplePdfBytes({
        title,
        author,
        publisher,
        year,
        category,
        isbn,
        bookCode,
        description,
      });

      const filename = `${sanitizeFilename(title)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`
      );
      if (!isDownload) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      res.setHeader('Content-Length', String(bytes.length));
      res.send(Buffer.from(bytes));
    } catch (err) {
      console.error('Error generating sample PDF:', err);
      res.status(500).json({ error: 'Gagal membuat dokumen PDF pratinjau.' });
    }
  });

  // 2. External URL & Google Drive Link Compatibility Checker
  app.post('/api/check-url', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({
        ok: false,
        accessible: false,
        compatibleWithPdfViewer: false,
        isGoogleDrive: false,
        format: 'EXTERNAL',
        fileSize: '',
        directDownloadUrl: '',
        previewUrl: '',
        message: 'URL file buku tidak boleh kosong.',
      });
      return;
    }

    // Internal sample PDF route is always valid
    if (rawUrl.startsWith('/api/sample-pdf')) {
      res.json({
        ok: true,
        accessible: true,
        compatibleWithPdfViewer: true,
        isGoogleDrive: false,
        format: 'PDF',
        fileSize: '48 KB',
        directDownloadUrl: `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}download=1`,
        previewUrl: rawUrl,
        message: 'File PDF internal siap dibaca langsung di PDF Viewer dan dapat diunduh.',
      });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({
        ok: false,
        accessible: false,
        compatibleWithPdfViewer: false,
        isGoogleDrive: false,
        format: 'EXTERNAL',
        fileSize: '',
        directDownloadUrl: '',
        previewUrl: '',
        message: 'Format URL tidak valid. Pastikan URL diawali dengan https:// atau http://.',
      });
      return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({
        ok: false,
        accessible: false,
        compatibleWithPdfViewer: false,
        isGoogleDrive: false,
        format: 'EXTERNAL',
        fileSize: '',
        directDownloadUrl: '',
        previewUrl: '',
        message: 'Protokol URL tidak didukung. Gunakan HTTP atau HTTPS.',
      });
      return;
    }

    if (isPrivateOrLocalHostname(parsed.hostname)) {
      res.status(400).json({
        ok: false,
        accessible: false,
        compatibleWithPdfViewer: false,
        isGoogleDrive: false,
        format: 'EXTERNAL',
        fileSize: '',
        directDownloadUrl: '',
        previewUrl: '',
        message: 'URL lokal atau jaringan privat tidak diizinkan demi keamanan.',
      });
      return;
    }

    const driveId = extractGoogleDriveId(rawUrl);
    const targetToFetch = driveId
      ? `https://drive.google.com/uc?export=download&id=${driveId}`
      : rawUrl;
    const drivePreviewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : '';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(targetToFetch, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-2047',
          'User-Agent': 'RuangBacaVirtual-LinkVerifier/1.0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const contentLengthHeader = response.headers.get('content-length');
      const contentRangeHeader = response.headers.get('content-range');
      let totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
      if (contentRangeHeader) {
        const match = contentRangeHeader.match(/\/(\d+)$/);
        if (match) totalBytes = Number(match[1]);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const magic = buffer.subarray(0, 5).toString('ascii');
      const isPdfMagic = magic === '%PDF-';
      const isPdfMime = contentType.includes('application/pdf') || isPdfMagic;
      const isEpub = contentType.includes('epub') || rawUrl.toLowerCase().endsWith('.epub');
      const isHtml = contentType.includes('text/html');

      if (!response.ok && response.status !== 206) {
        res.json({
          ok: false,
          accessible: false,
          compatibleWithPdfViewer: false,
          isGoogleDrive: Boolean(driveId),
          format: driveId ? 'DRIVE_PDF' : 'EXTERNAL',
          fileSize: '',
          directDownloadUrl: targetToFetch,
          previewUrl: drivePreviewUrl,
          message: driveId
            ? `File Google Drive tidak dapat diakses (HTTP ${response.status}). Pastikan akses berbagi diatur ke "Siapa saja yang memiliki link".`
            : `Tautan eksternal mengembalikan status HTTP ${response.status} dan tidak dapat diakses.`,
        });
        return;
      }

      if (driveId) {
        if (isPdfMime) {
          res.json({
            ok: true,
            accessible: true,
            compatibleWithPdfViewer: true,
            isGoogleDrive: true,
            format: 'DRIVE_PDF',
            fileSize: formatBytes(totalBytes),
            directDownloadUrl: targetToFetch,
            previewUrl: drivePreviewUrl,
            message:
              'Link Google Drive publik valid dan berisi file PDF langsung. Mendukung pembacaan melalui proxy PDF Viewer dan pengunduhan.',
          });
          return;
        }

        const snippet = buffer.toString('utf-8').toLowerCase();
        const needsPermission =
          snippet.includes('servicelogin') ||
          snippet.includes('access denied') ||
          snippet.includes('request access');

        if (needsPermission) {
          res.json({
            ok: false,
            accessible: false,
            compatibleWithPdfViewer: false,
            isGoogleDrive: true,
            format: 'DRIVE_PDF',
            fileSize: '',
            directDownloadUrl: targetToFetch,
            previewUrl: drivePreviewUrl,
            message:
              'File Google Drive bersifat privat atau meminta login. Ubah izin berbagi menjadi "Siapa saja yang memiliki link" agar pembaca dapat mengaksesnya.',
          });
          return;
        }

        res.json({
          ok: true,
          accessible: true,
          compatibleWithPdfViewer: false,
          isGoogleDrive: true,
          format: 'DRIVE_PDF',
          fileSize: formatBytes(totalBytes),
          directDownloadUrl: targetToFetch,
          previewUrl: drivePreviewUrl,
          message:
            'Link Google Drive dapat diakses, namun Google Drive mengembalikan halaman konfirmasi HTML (bukan stream PDF mentah). Sistem akan menggunakan mode Pratinjau Google Drive dan tautan unduh eksternal.',
        });
        return;
      }

      if (isPdfMime) {
        res.json({
          ok: true,
          accessible: true,
          compatibleWithPdfViewer: true,
          isGoogleDrive: false,
          format: 'PDF',
          fileSize: formatBytes(totalBytes),
          directDownloadUrl: rawUrl,
          previewUrl: rawUrl,
          message:
            'Link file PDF eksternal terverifikasi valid. Mendukung pembacaan langsung di PDF Viewer dan pengunduhan.',
        });
        return;
      }

      if (isEpub) {
        res.json({
          ok: true,
          accessible: true,
          compatibleWithPdfViewer: false,
          isGoogleDrive: false,
          format: 'EPUB',
          fileSize: formatBytes(totalBytes),
          directDownloadUrl: rawUrl,
          previewUrl: '',
          message:
            'File EPUB terdeteksi. File dapat diunduh ke perangkat pembaca, namun tidak dapat dirender di PDF Viewer.',
        });
        return;
      }

      if (isHtml) {
        res.json({
          ok: false,
          accessible: true,
          compatibleWithPdfViewer: false,
          isGoogleDrive: false,
          format: 'EXTERNAL',
          fileSize: '',
          directDownloadUrl: rawUrl,
          previewUrl: '',
          message:
            'URL mengarah ke halaman web HTML, bukan berkas PDF langsung. Link ini tidak kompatibel dengan PDF Viewer.',
        });
        return;
      }

      res.json({
        ok: true,
        accessible: true,
        compatibleWithPdfViewer: false,
        isGoogleDrive: false,
        format: 'EXTERNAL',
        fileSize: formatBytes(totalBytes),
        directDownloadUrl: rawUrl,
        previewUrl: '',
        message: `Tautan dapat diakses (Content-Type: ${contentType || 'tidak diketahui'}), namun tidak terdeteksi sebagai PDF standar. Pembaca mungkin perlu mengunduh berkas secara langsung.`,
      });
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Waktu pemeriksaan habis (timeout 8 detik). Server tujuan tidak merespons.'
        : 'Gagal menghubungi URL tujuan. Pastikan tautan aktif dan dapat diakses publik.';
      res.json({
        ok: false,
        accessible: false,
        compatibleWithPdfViewer: false,
        isGoogleDrive: Boolean(driveId),
        format: driveId ? 'DRIVE_PDF' : 'EXTERNAL',
        fileSize: '',
        directDownloadUrl: targetToFetch,
        previewUrl: drivePreviewUrl,
        message: msg,
      });
    }
  });

  // 3. CORS-safe PDF Proxy for PDF.js Viewer & Direct Named Downloads
  app.get('/api/proxy-pdf', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    const title = String(req.query.title || 'Buku_Digital');
    const isDownload = req.query.download === '1';

    if (!rawUrl) {
      res.status(400).json({ error: 'Parameter url wajib diisi.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'URL tidak valid.' });
      return;
    }

    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || isPrivateOrLocalHostname(parsed.hostname)) {
      res.status(403).json({ error: 'URL tidak diizinkan.' });
      return;
    }

    const driveId = extractGoogleDriveId(rawUrl);
    const targetUrl = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : rawUrl;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const upstream = await fetch(targetUrl, {
        headers: { 'User-Agent': 'RuangBacaVirtual-Reader/1.0' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Gagal memuat berkas dari sumber eksternal (HTTP ${upstream.status}).` });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const arrayBuf = await upstream.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const isPdf = buf.subarray(0, 5).toString('ascii') === '%PDF-' || contentType.includes('application/pdf');

      if (!isPdf && !isDownload) {
        res.status(422).json({
          error:
            'Sumber eksternal tidak mengembalikan berkas PDF yang valid (kemungkinan berupa halaman HTML atau memerlukan izin akses Google Drive).',
        });
        return;
      }

      const filename = `${sanitizeFilename(title)}.pdf`;
      res.setHeader('Content-Type', isPdf ? 'application/pdf' : contentType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`
      );
      if (!isDownload && isPdf) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch {
      res.status(502).json({ error: 'Tidak dapat mengambil berkas dari server eksternal.' });
    }
  });

  // 4. Lightweight Book Views & Downloads Tracker
  app.get('/api/stats', (_req, res) => {
    res.json({ stats: statsCache });
  });

  app.post('/api/stats/track', (req, res) => {
    const bookId = String(req.body?.bookId || '').trim();
    const type = req.body?.type === 'download' ? 'downloads' : req.body?.type === 'view' ? 'views' : null;
    if (!bookId || !type || bookId.length > 128) {
      res.status(400).json({ error: 'Parameter statistik tidak valid.' });
      return;
    }
    if (!statsCache[bookId]) {
      statsCache[bookId] = { views: 0, downloads: 0 };
    }
    statsCache[bookId][type] += 1;
    saveStats(statsCache);
    res.json({ ok: true, stat: statsCache[bookId] });
  });

  // 5. Intelligent Book Metadata Auto-Fill (PDF Metadata + Open Library + Gemini)
  app.post('/api/auto-fill-book', async (req, res) => {
    const rawTitle = String(req.body?.title || '').trim();
    const rawAuthor = String(req.body?.author || '').trim();
    const rawIsbn = String(req.body?.isbn || '').trim();
    const rawFileUrl = String(req.body?.fileUrl || '').trim();
    const availableCategories: string[] = Array.isArray(req.body?.categories)
      ? req.body.categories.map((c: unknown) => String(c).trim()).filter(Boolean)
      : [
          'Pendidikan',
          'Teknologi',
          'Sejarah',
          'Agama',
          'Fiksi',
          'Novel',
          'Psikologi',
          'Kesehatan',
          'Ekonomi',
          'Pengetahuan Umum',
        ];

    if (!rawTitle && !rawIsbn && !rawFileUrl) {
      res.status(400).json({
        error: 'Masukkan minimal salah satu dari Judul Buku, ISBN, atau URL File agar sistem dapat melengkapi informasi.',
      });
      return;
    }

    const sources: string[] = [];
    let pdfMeta: {
      title?: string;
      author?: string;
      publisher?: string;
      subject?: string;
      year?: number;
      pageCount?: number;
      fileName?: string;
      fileSize?: string;
      format?: string;
    } = {};

    // Step A: Inspect PDF URL & extract embedded PDF metadata if accessible
    if (rawFileUrl && (rawFileUrl.startsWith('http://') || rawFileUrl.startsWith('https://'))) {
      try {
        const parsed = new URL(rawFileUrl);
        if (!isPrivateOrLocalHostname(parsed.hostname)) {
          const driveId = extractGoogleDriveId(rawFileUrl);
          const fetchUrl = driveId
            ? `https://drive.google.com/uc?export=download&id=${driveId}`
            : rawFileUrl;
          pdfMeta.format = driveId ? 'DRIVE_PDF' : 'PDF';

          const pathName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
          if (pathName && pathName.toLowerCase().endsWith('.pdf')) {
            pdfMeta.fileName = pathName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 9000);
          const resp = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'RuangBacaVirtual-AutoCatalog/1.0' },
            redirect: 'follow',
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (resp.ok) {
            const cLen = Number(resp.headers.get('content-length') || 0);
            if (cLen > 0) pdfMeta.fileSize = formatBytes(cLen);
            const cType = (resp.headers.get('content-type') || '').toLowerCase();
            if (cLen <= 8 * 1024 * 1024) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (!pdfMeta.fileSize && buf.length > 0) {
                pdfMeta.fileSize = formatBytes(buf.length);
              }
              if (buf.subarray(0, 5).toString('ascii') === '%PDF-' || cType.includes('pdf')) {
                try {
                  const doc = await PDFDocument.load(buf, {
                    ignoreEncryption: true,
                    updateMetadata: false,
                  });
                  const t = doc.getTitle()?.trim();
                  const a = doc.getAuthor()?.trim();
                  const s = doc.getSubject()?.trim();
                  const creator = doc.getCreator()?.trim() || doc.getProducer()?.trim();
                  const cDate = doc.getCreationDate();
                  if (t) pdfMeta.title = t;
                  if (a) pdfMeta.author = a;
                  if (s) pdfMeta.subject = s;
                  if (creator) pdfMeta.publisher = creator;
                  if (cDate && cDate.getFullYear() >= 1900 && cDate.getFullYear() <= 2100) {
                    pdfMeta.year = cDate.getFullYear();
                  }
                  pdfMeta.pageCount = doc.getPageCount();
                  sources.push('Metadata PDF');
                } catch {
                  // PDF could not be parsed for metadata
                }
              }
            }
          }
        }
      } catch {
        // non-fatal URL inspection error
      }
    }

    // Step B: Query Open Library by ISBN or Title for public bibliographic details & cover
    let openLib: {
      title?: string;
      author?: string;
      publisher?: string;
      year?: number;
      isbn?: string;
      coverUrl?: string;
      description?: string;
      subjects?: string[];
    } = {};

    try {
      const cleanIsbn = rawIsbn.replace(/[^0-9Xx]/g, '');
      if (cleanIsbn.length >= 10) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const olRes = await fetch(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (olRes.ok) {
          const json = (await olRes.json()) as Record<string, Record<string, unknown>>;
          const entry = json[`ISBN:${cleanIsbn}`];
          if (entry) {
            openLib.title = entry.title ? String(entry.title) : undefined;
            const authorsArr = Array.isArray(entry.authors) ? entry.authors : [];
            if (authorsArr.length > 0 && authorsArr[0]?.name) {
              openLib.author = authorsArr.map((x: { name?: string }) => x.name).filter(Boolean).join(', ');
            }
            const pubArr = Array.isArray(entry.publishers) ? entry.publishers : [];
            if (pubArr.length > 0 && pubArr[0]?.name) {
              openLib.publisher = String(pubArr[0].name);
            }
            if (entry.publish_date) {
              const yrMatch = String(entry.publish_date).match(/\b(1[89]\d{2}|20\d{2})\b/);
              if (yrMatch) openLib.year = Number(yrMatch[1]);
            }
            const coverObj = entry.cover as { large?: string; medium?: string } | undefined;
            if (coverObj?.large || coverObj?.medium) {
              openLib.coverUrl = coverObj.large || coverObj.medium;
            }
            if (Array.isArray(entry.subjects)) {
              openLib.subjects = entry.subjects
                .map((s: { name?: string }) => (typeof s === 'string' ? s : s?.name || ''))
                .filter(Boolean)
                .slice(0, 10);
            }
            if (entry.notes) {
              openLib.description =
                typeof entry.notes === 'string'
                  ? entry.notes
                  : String((entry.notes as { value?: string })?.value || '');
            }
            openLib.isbn = rawIsbn;
            sources.push('Open Library');
          }
        }
      } else if (rawTitle || pdfMeta.title || pdfMeta.fileName) {
        const searchTitle = rawTitle || pdfMeta.title || pdfMeta.fileName || '';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const olRes = await fetch(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(searchTitle)}&limit=1`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (olRes.ok) {
          const json = (await olRes.json()) as { docs?: Array<Record<string, unknown>> };
          const doc = json.docs?.[0];
          if (doc) {
            if (doc.title) openLib.title = String(doc.title);
            if (Array.isArray(doc.author_name) && doc.author_name.length > 0) {
              openLib.author = String(doc.author_name[0]);
            }
            if (Array.isArray(doc.publisher) && doc.publisher.length > 0) {
              openLib.publisher = String(doc.publisher[0]);
            }
            if (typeof doc.first_publish_year === 'number') {
              openLib.year = doc.first_publish_year;
            }
            if (Array.isArray(doc.isbn) && doc.isbn.length > 0) {
              openLib.isbn = String(doc.isbn[0]);
            }
            if (typeof doc.cover_i === 'number') {
              openLib.coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
            }
            if (Array.isArray(doc.subject)) {
              openLib.subjects = doc.subject.map((s) => String(s)).slice(0, 10);
            }
            if (typeof doc.key === 'string' && doc.key.startsWith('/works/')) {
              try {
                const wCtrl = new AbortController();
                const wTimer = setTimeout(() => wCtrl.abort(), 3500);
                const wRes = await fetch(`https://openlibrary.org${doc.key}.json`, {
                  signal: wCtrl.signal,
                });
                clearTimeout(wTimer);
                if (wRes.ok) {
                  const wJson = (await wRes.json()) as {
                    description?: string | { value?: string };
                    subjects?: string[];
                  };
                  if (typeof wJson.description === 'string') {
                    openLib.description = wJson.description;
                  } else if (wJson.description && typeof wJson.description.value === 'string') {
                    openLib.description = wJson.description.value;
                  }
                  if (!openLib.subjects && Array.isArray(wJson.subjects)) {
                    openLib.subjects = wJson.subjects.slice(0, 10);
                  }
                }
              } catch {
                // optional work detail fetch
              }
            }
            sources.push('Open Library');
          }
        }
      }
    } catch {
      // non-fatal Open Library lookup error
    }

    // Step C: Gemini structured metadata enrichment
    type AutoFillAiData = {
      title?: string;
      author?: string;
      publisher?: string;
      year?: number;
      isbn?: string;
      category?: string;
      description?: string;
    };
    let aiData: AutoFillAiData | null = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const contextSummary = JSON.stringify({
          inputAdmin: {
            title: rawTitle || null,
            author: rawAuthor || null,
            isbn: rawIsbn || null,
            fileUrl: rawFileUrl || null,
          },
          pdfMetadata: pdfMeta,
          openLibraryMatch: openLib,
          allowedCategories: availableCategories,
        });

        const aiResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Lengkapi metadata buku perpustakaan digital berdasarkan data petunjuk berikut:\n${contextSummary}`,
          config: {
            systemInstruction:
              'Anda adalah pustakawan katalog digital profesional berbahasa Indonesia. Tugas Anda melengkapi informasi buku yang masih kosong secara akurat dan rapi dalam Bahasa Indonesia. Pilih category yang paling cocok HANYA dari daftar allowedCategories. Jangan mengarang nomor ISBN jika tidak ada dalam petunjuk atau pengetahuan bibliografis yang pasti (kosongkan string jika tidak diketahui). Tulis description berupa sinopsis informatif sepanjang 2 sampai 4 kalimat dalam Bahasa Indonesia yang jelas dan alami.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Judul buku yang rapi dan lengkap.' },
                author: { type: Type.STRING, description: 'Nama penulis buku.' },
                publisher: { type: Type.STRING, description: 'Nama penerbit buku.' },
                year: { type: Type.INTEGER, description: 'Tahun terbit (4 digit angka).' },
                isbn: { type: Type.STRING, description: 'Nomor ISBN jika diketahui, atau string kosong.' },
                category: { type: Type.STRING, description: 'Salah satu kategori dari allowedCategories.' },
                description: { type: Type.STRING, description: 'Sinopsis atau ringkasan buku dalam Bahasa Indonesia.' },
              },
              required: ['title', 'author', 'publisher', 'year', 'category', 'description'],
            },
          },
        });

        const parsedText = (aiResp.text ?? '{}').trim();
        aiData = JSON.parse(parsedText) as AutoFillAiData;
        sources.push('Asisten Katalog AI');
      } catch (err) {
        console.error('Gemini auto-fill error:', err);
        if (sources.length === 0) {
          res.status(502).json({
            error:
              err instanceof Error
                ? `Gagal memanggil asisten katalog otomatis: ${err.message}`
                : 'Gagal melengkapi informasi buku secara otomatis.',
          });
          return;
        }
      }
    } else if (sources.length === 0) {
      res.status(503).json({
        error:
          'Metadata PDF/Open Library tidak ditemukan untuk masukan ini dan GEMINI_API_KEY belum dikonfigurasi pada server.',
      });
      return;
    }

    const subjectHint = [
      ...(openLib.subjects || []),
      pdfMeta.subject || '',
      rawTitle,
    ]
      .join(' ')
      .toLowerCase();

    const matchedCategoryFromSubjects = availableCategories.find((cat) => {
      const c = cat.toLowerCase();
      if (subjectHint.includes(c)) return true;
      if (c === 'fiksi' && /fiction|novel|story|cerita/.test(subjectHint)) return true;
      if (c === 'novel' && /novel|fiction|sastra|romance/.test(subjectHint)) return true;
      if (c === 'teknologi' && /technology|computer|software|programming|system|ai/.test(subjectHint)) return true;
      if (c === 'pendidikan' && /education|textbook|learning|study|akademik/.test(subjectHint)) return true;
      if (c === 'sejarah' && /history|sejarah|historical|biografi/.test(subjectHint)) return true;
      if (c === 'psikologi' && /psychology|mental|behavior|psikologi/.test(subjectHint)) return true;
      if (c === 'ekonomi' && /economics|business|finance|management|bisnis/.test(subjectHint)) return true;
      if (c === 'kesehatan' && /health|medicine|medical|nutrition|kesehatan/.test(subjectHint)) return true;
      if (c === 'agama' && /religion|islam|theology|spiritual|agama/.test(subjectHint)) return true;
      return false;
    });

    const bestCategory =
      (aiData?.category && availableCategories.includes(aiData.category) && aiData.category) ||
      matchedCategoryFromSubjects ||
      availableCategories[0] ||
      'Pengetahuan Umum';

    const resolvedYear =
      openLib.year ||
      pdfMeta.year ||
      (aiData?.year && aiData.year >= 1000 && aiData.year <= 2100 ? aiData.year : new Date().getFullYear());

    const resolvedTitle =
      rawTitle || openLib.title || pdfMeta.title || aiData?.title || pdfMeta.fileName || '';
    const resolvedAuthor =
      rawAuthor || openLib.author || pdfMeta.author || aiData?.author || '';
    const resolvedPublisher =
      openLib.publisher || pdfMeta.publisher || aiData?.publisher || 'Pustaka Digital';
    const bibliographicFallbackDesc =
      sources.length > 0 && resolvedTitle
        ? `${resolvedTitle}${resolvedAuthor ? ` oleh ${resolvedAuthor}` : ''} (${resolvedYear})${resolvedPublisher && resolvedPublisher !== 'Pustaka Digital' ? `, diterbitkan oleh ${resolvedPublisher}` : ''}.${pdfMeta.pageCount ? ` Berkas digital terdiri dari ${pdfMeta.pageCount} halaman.` : ''}`
        : '';

    res.json({
      ok: true,
      sources,
      data: {
        title: resolvedTitle,
        author: resolvedAuthor,
        publisher: resolvedPublisher,
        year: resolvedYear,
        isbn: rawIsbn || openLib.isbn || aiData?.isbn || '',
        category: bestCategory,
        description:
          aiData?.description ||
          openLib.description ||
          pdfMeta.subject ||
          bibliographicFallbackDesc,
        coverUrl: openLib.coverUrl || '',
        fileFormat: pdfMeta.format || undefined,
        fileSize: pdfMeta.fileSize || undefined,
      },
    });
  });

  // 6. Web Page E-Book Collection Scraper (extracts PDF/Drive books from a public webpage)
  app.post('/api/scrape-ebooks', async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const availableCategories: string[] = Array.isArray(req.body?.categories)
      ? req.body.categories.map((c: unknown) => String(c).trim()).filter(Boolean)
      : [
          'Pendidikan',
          'Teknologi',
          'Sejarah',
          'Agama',
          'Fiksi',
          'Novel',
          'Psikologi',
          'Kesehatan',
          'Ekonomi',
          'Pengetahuan Umum',
        ];

    if (!rawUrl) {
      res.status(400).json({ error: 'URL halaman web wajib diisi.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'Format URL tidak valid. Gunakan awalan https:// atau http://.' });
      return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).json({ error: 'Hanya protokol HTTP dan HTTPS yang didukung.' });
      return;
    }

    if (isPrivateOrLocalHostname(parsed.hostname)) {
      res.status(400).json({ error: 'URL lokal atau jaringan privat tidak diizinkan.' });
      return;
    }

    const decodeEntities = (text: string): string =>
      text
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&ndash;/gi, '–')
        .replace(/&mdash;/gi, '—')
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();

    const toSmartAuthorCase = (name: string): string => {
      const cleaned = name.replace(/^[\s\-–—:;,.]+|[\s\-–—:;,.]+$/g, '').trim();
      if (!cleaned) return '';
      if (cleaned === cleaned.toUpperCase() && cleaned.length > 4) {
        return cleaned
          .toLowerCase()
          .replace(/\b([a-z])/g, (m) => m.toUpperCase());
      }
      return cleaned;
    };

    const pickCategory = (text: string): string => {
      const hint = text.toLowerCase();
      const matched = availableCategories.find((cat) => {
        const c = cat.toLowerCase();
        if (hint.includes(c)) return true;
        if (
          c === 'novel' &&
          /\b(novel|hikayat|werther|faust|adventures|roman|cerita|kadiroen)\b/.test(hint)
        ) {
          return true;
        }
        if (
          c === 'fiksi' &&
          /\b(fiction|fiksi|sastra|story|tale|poetry|puisi|drama)\b/.test(hint)
        ) {
          return true;
        }
        if (
          c === 'sejarah' &&
          /\b(history|sejarah|1965|pembunuhan massal|kemerdekaan|indonesia|soekarno|hatta|tan malaka|ham|kolonial|england|pekalongan|republik|hammurabi|civil government|rights of man|social contract|american crisis|political|negara)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'ekonomi' &&
          /\b(ekonomi|economy|economics|kapital|capital|wealth|trade|sawit|kelapa sawit|kemiskinan|poverty|world bank|agrarian|upah|harga|laba|bastiat|marx|engels|buruh|pajak|industri)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'psikologi' &&
          /\b(psychology|psikologi|human nature|human understanding|pessimism|wisdom of life|mind|mental|freud|william james|moral|confessions|passions)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'agama' &&
          /\b(religion|agama|theology|theologico|natural religion|islam|spiritual|christian|toleration|god|tuhan|kitab)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'teknologi' &&
          /\b(technology|teknologi|mathematics|analyst|vision|geometrical|computer|digital|science|ilmu|engineering)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'pendidikan' &&
          /\b(education|pendidikan|logic|essay|treatise|discourse|dialogue|dialogues|philosophy|filsafat|panduan|ethics|metaphysics|monadology|pragmatism|plato|locke|hume|berkeley|spinoza|schopenhauer|mill|rousseau|paine|lucretius)\b/.test(
            hint
          )
        ) {
          return true;
        }
        if (
          c === 'kesehatan' &&
          /\b(health|kesehatan|medicine|medical|coronavirus|covid|pandemi|gizi|medis)\b/.test(hint)
        ) {
          return true;
        }
        return false;
      });
      if (matched) return matched;
      const umum = availableCategories.find((c) => c.toLowerCase().includes('umum'));
      return umum || availableCategories[0] || 'Pengetahuan Umum';
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(parsed.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RuangBacaVirtual/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        res.status(502).json({
          error: `Halaman web mengembalikan status HTTP ${response.status} dan gagal diakses.`,
        });
        return;
      }

      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '')) : parsed.hostname;

      // Narrow to main post/article content when available
      let contentHtml = html;
      const postIdx = html.search(/class="[^"]*\b(?:entry-content|post-content|post|hentry)\b[^"]*"|id="post-\d+"/i);
      if (postIdx !== -1) {
        contentHtml = html.slice(postIdx);
      } else {
        const mainIdx = html.search(/<main\b|<article\b|<body\b/i);
        if (mainIdx !== -1) contentHtml = html.slice(mainIdx);
      }

      const commentsIdx = contentHtml.search(/id="(?:comments|respond|sidebar|footer)"/i);
      if (commentsIdx > 200) {
        contentHtml = contentHtml.slice(0, commentsIdx);
      }

      contentHtml = contentHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

      const lines = contentHtml
        .replace(/<\/p>|<br\s*\/?>|<\/li>|<\/tr>|<\/h[1-6]>|<\/div>/gi, '\n')
        .split('\n');

      let currentSection = 'Koleksi Utama';
      const seenUrls = new Set<string>();
      const items: Array<{
        title: string;
        author: string;
        publisher: string;
        year: number;
        category: string;
        description: string;
        fileUrl: string;
        fileFormat: 'PDF' | 'DRIVE_PDF';
        section: string;
      }> = [];

      const sitePublisher =
        parsed.hostname === 'rowlandpasaribu.wordpress.com'
          ? 'Pustaka Rowland Pasaribu'
          : parsed.hostname.replace(/^www\./, '');

      for (const rawLine of lines) {
        const trimmedLine = rawLine.trim();
        if (!trimmedLine) continue;

        if (!/<a\b/i.test(trimmedLine) && /<(?:strong|b|h[1-4])\b/i.test(trimmedLine)) {
          const headingText = decodeEntities(trimmedLine.replace(/<[^>]+>/g, '')).replace(/:$/, '').trim();
          if (
            headingText &&
            headingText.length >= 3 &&
            headingText.length <= 100 &&
            !/leave a comment|go to comments|share this|like this/i.test(headingText)
          ) {
            currentSection = headingText;
          }
          continue;
        }

        const anchorMatches = [
          ...trimmedLine.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
        ];
        if (anchorMatches.length === 0) continue;

        for (const aMatch of anchorMatches) {
          const rawHref = decodeEntities(aMatch[1]);
          let resolvedHref = '';
          try {
            resolvedHref = new URL(rawHref, parsed.href).href;
          } catch {
            continue;
          }

          const isDrive = Boolean(extractGoogleDriveId(resolvedHref));
          const isPdf = /\.pdf(?:$|\?)/i.test(resolvedHref);
          if (!isPdf && !isDrive) continue;
          if (resolvedHref.length > 1000) continue;

          const normUrl = resolvedHref.replace(/^http:\/\//i, 'https://');
          if (seenUrls.has(resolvedHref) || seenUrls.has(normUrl)) continue;
          seenUrls.add(resolvedHref);

          const beforeRaw = trimmedLine.slice(0, aMatch.index || 0);
          const beforeText = decodeEntities(beforeRaw.replace(/<[^>]+>/g, ''));
          const anchorText = decodeEntities(aMatch[2].replace(/<[^>]+>/g, ''));
          if (!anchorText || anchorText.length < 2) continue;

          let author = '';
          let title = anchorText;
          let year: number | null = null;

          // Extract year from beforeText e.g. "Jean-Jacques Rousseau (1762)"
          const beforeYearMatch = beforeText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
          if (beforeYearMatch) {
            year = Number(beforeYearMatch[1]);
          }

          if (beforeText) {
            const cleanBefore = beforeText
              .replace(/\(\s*(1[4-9]\d{2}|20[0-2]\d)\s*\)/g, '')
              .replace(/^[\s\-–—:;,.]+|[\s\-–—:;,.]+$/g, '')
              .trim();
            if (cleanBefore && cleanBefore.length <= 120) {
              author = toSmartAuthorCase(cleanBefore);
            }
          }

          // If no author before <a>, check if anchorText itself contains "Author – Title" or "Author; Title"
          if (!author) {
            const sepMatch = anchorText.match(/^(.{3,65}?)\s+(?:–|—|-)\s+(.{3,})$/);
            const semiMatch = !sepMatch ? anchorText.match(/^([A-Z][A-Za-z.\s()&]{2,55}?);\s+(.{3,})$/) : null;
            const capsPrefixMatch =
              !sepMatch && !semiMatch
                ? anchorText.match(/^([A-Z]{3,}(?:\s+[A-Z]{2,}){0,2})\s+([A-Z][a-z].{3,})$/)
                : null;

            if (sepMatch) {
              const candAuthor = sepMatch[1].replace(/\(\s*(1[4-9]\d{2}|20[0-2]\d)\s*\)/g, '').trim();
              const yrInCand = sepMatch[1].match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
              if (!year && yrInCand) year = Number(yrInCand[1]);
              if (candAuthor) {
                author = toSmartAuthorCase(candAuthor);
                title = sepMatch[2].trim();
              }
            } else if (semiMatch) {
              author = toSmartAuthorCase(semiMatch[1]);
              title = semiMatch[2].trim();
            } else if (capsPrefixMatch) {
              author = toSmartAuthorCase(capsPrefixMatch[1]);
              title = capsPrefixMatch[2].trim();
            }
          }

          if (!year) {
            const anchorYr = title.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
            const urlYr = resolvedHref.match(/\/(?:uploads|publication|training)\/(20\d{2})\//i);
            if (urlYr) year = Number(urlYr[1]);
            else if (anchorYr) year = Number(anchorYr[1]);
            else year = new Date().getFullYear();
          }

          if (!author) {
            author =
              currentSection && !/karya penting|karya terjemahan|karya anak bangsa|mereka bicara|koleksi utama/i.test(currentSection)
                ? currentSection.slice(0, 150)
                : 'Koleksi Pustaka Klasik';
          }

          const finalTitle = title.slice(0, 200);
          const finalAuthor = author.slice(0, 150);
          const finalPublisher = (
            /forest peoples programme/i.test(currentSection) ? 'Forest Peoples Programme' : sitePublisher
          ).slice(0, 150);

          const category = pickCategory(`${currentSection} ${finalTitle} ${finalAuthor}`);
          const description = `E-book digital "${finalTitle}" karya ${finalAuthor} (bagian: ${currentSection}). Tersedia dalam format ${isDrive ? 'Google Drive PDF' : 'PDF'} untuk dibaca langsung di peramban maupun diunduh.`.slice(
            0,
            5000
          );

          items.push({
            title: finalTitle,
            author: finalAuthor,
            publisher: finalPublisher,
            year,
            category,
            description,
            fileUrl: resolvedHref,
            fileFormat: isDrive ? 'DRIVE_PDF' : 'PDF',
            section: currentSection,
          });
        }
      }

      if (items.length === 0) {
        res.status(404).json({
          error:
            'Tidak ditemukan tautan file PDF atau Google Drive yang dapat dibaca pada halaman web tersebut.',
        });
        return;
      }

      res.json({
        ok: true,
        sourceUrl: parsed.href,
        pageTitle,
        totalFound: items.length,
        items,
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error && err.name === 'AbortError'
            ? 'Waktu pengambilan halaman habis (timeout 15 detik).'
            : err instanceof Error
              ? `Gagal mengambil halaman web: ${err.message}`
              : 'Gagal memproses halaman web.',
      });
    }
  });

  // Serve Vite in development or static dist in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RUANG BACA VIRTUAL server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
