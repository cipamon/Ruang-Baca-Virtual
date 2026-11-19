import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Globe,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import type {
  Book,
  BookFileFormat,
  BookFormData,
  Category,
  ScrapedEbookItem,
} from '../../types/library';
import {
  batchCreateBooks,
  createBook,
  generateBookCode,
  scrapeEbooksFromUrl,
  updateBook,
} from '../../services/libraryService';

interface ImportExportPanelProps {
  mode: 'import' | 'export';
  books: Book[];
  categories: Category[];
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface ParsedImportRow {
  rowIndex: number;
  action: 'create' | 'update' | 'error';
  matchedBookId?: string;
  duplicateReason?: string;
  errorReason?: string;
  data: BookFormData;
}

interface ScrapedPreviewRow extends ScrapedEbookItem {
  key: string;
  isDuplicate: boolean;
}

const DEFAULT_EBOOK_SOURCE_URL = 'https://rowlandpasaribu.wordpress.com/ebook-gue/';

export const ImportExportPanel: React.FC<ImportExportPanelProps> = ({
  mode,
  books,
  categories,
  onNotify,
}) => {
  const [importTab, setImportTab] = useState<'web' | 'file'>('web');

  // File Import state
  const [previewRows, setPreviewRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{ created: number; updated: number; failed: number } | null>(
    null
  );

  // Web URL Import state
  const [webUrl, setWebUrl] = useState(DEFAULT_EBOOK_SOURCE_URL);
  const [scrapingWeb, setScrapingWeb] = useState(false);
  const [scrapedTitle, setScrapedTitle] = useState('');
  const [scrapedRows, setScrapedRows] = useState<ScrapedPreviewRow[]>([]);
  const [selectedWebKeys, setSelectedWebKeys] = useState<Set<string>>(new Set());
  const [webSectionFilter, setWebSectionFilter] = useState('Semua');
  const [webSearch, setWebSearch] = useState('');
  const [webPage, setWebPage] = useState(1);
  const [webImporting, setWebImporting] = useState(false);
  const [webProgress, setWebProgress] = useState<{ done: number; total: number } | null>(null);
  const [webReport, setWebReport] = useState<{ created: number; failed: number } | null>(null);

  // Export state
  const [exportCategory, setExportCategory] = useState('Semua');
  const [exportStatus, setExportStatus] = useState<'all' | 'published' | 'hidden'>('all');

  const existingUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of books) {
      if (b.fileUrl) {
        s.add(b.fileUrl.trim().toLowerCase());
        s.add(b.fileUrl.trim().toLowerCase().replace(/^http:\/\//, 'https://'));
      }
    }
    return s;
  }, [books]);

  const existingTitleSet = useMemo(() => {
    return new Set(books.map((b) => b.title.trim().toLowerCase()));
  }, [books]);

  const webSections = useMemo(() => {
    return Array.from(new Set(scrapedRows.map((r) => r.section))).filter(Boolean);
  }, [scrapedRows]);

  const filteredWebRows = useMemo(() => {
    const q = webSearch.trim().toLowerCase();
    return scrapedRows.filter((row) => {
      if (webSectionFilter !== 'Semua' && row.section !== webSectionFilter) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.author.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        row.section.toLowerCase().includes(q)
      );
    });
  }, [scrapedRows, webSectionFilter, webSearch]);

  const WEB_PAGE_SIZE = 50;
  const webTotalPages = Math.max(1, Math.ceil(filteredWebRows.length / WEB_PAGE_SIZE));
  const currentWebPage = Math.min(webPage, webTotalPages);
  const paginatedWebRows = filteredWebRows.slice(
    (currentWebPage - 1) * WEB_PAGE_SIZE,
    currentWebPage * WEB_PAGE_SIZE
  );

  const handleScrapeWeb = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!webUrl.trim()) {
      onNotify('error', 'Masukkan URL halaman web sumber e-book terlebih dahulu.');
      return;
    }

    setScrapingWeb(true);
    setWebReport(null);
    setWebProgress(null);
    try {
      const res = await scrapeEbooksFromUrl(
        webUrl.trim(),
        categories.map((c) => c.name)
      );
      const rows: ScrapedPreviewRow[] = res.items.map((item, idx) => {
        const normUrl = item.fileUrl.trim().toLowerCase().replace(/^http:\/\//, 'https://');
        const isDuplicate =
          existingUrlSet.has(item.fileUrl.trim().toLowerCase()) ||
          existingUrlSet.has(normUrl) ||
          existingTitleSet.has(item.title.trim().toLowerCase());
        return {
          ...item,
          key: `web-${idx}-${normUrl.slice(-24)}`,
          isDuplicate,
        };
      });

      const initialSelected = new Set(rows.filter((r) => !r.isDuplicate).map((r) => r.key));
      setScrapedTitle(res.pageTitle);
      setScrapedRows(rows);
      setSelectedWebKeys(initialSelected);
      setWebSectionFilter('Semua');
      setWebSearch('');
      setWebPage(1);

      const newCount = initialSelected.size;
      const dupCount = rows.length - newCount;
      onNotify(
        'success',
        `Ditemukan ${rows.length} e-book PDF/Drive (${newCount} buku baru siap diimpor${dupCount > 0 ? `, ${dupCount} sudah ada di katalog` : ''}).`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal mengambil daftar e-book dari halaman web.'
      );
    } finally {
      setScrapingWeb(false);
    }
  };

  const handleWebCategoryChange = (key: string, nextCategory: string) => {
    setScrapedRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, category: nextCategory } : row))
    );
  };

  const handleBatchWebImport = async () => {
    const selectedRows = scrapedRows.filter((r) => selectedWebKeys.has(r.key) && !r.isDuplicate);
    if (selectedRows.length === 0) {
      onNotify('error', 'Pilih minimal satu buku baru untuk disimpan ke Cloud Firestore.');
      return;
    }

    setWebImporting(true);
    setWebReport(null);
    setWebProgress({ done: 0, total: selectedRows.length });

    const payloads: BookFormData[] = selectedRows.map((item, index) => ({
      bookCode: `RBV-${new Date().getFullYear()}-${String(1000 + ((Date.now() + index) % 8999))}`,
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      year: item.year,
      isbn: '',
      category: item.category,
      description: item.description,
      coverUrl: '',
      fileUrl: item.fileUrl,
      fileFormat: item.fileFormat,
      fileSize: '',
      status: 'published',
      isDemo: false,
      recommended: false,
      viewsCount: 0,
      downloadsCount: 0,
    }));

    try {
      const result = await batchCreateBooks(payloads, (done, total) => {
        setWebProgress({ done, total });
      });
      setWebReport(result);
      // Mark newly created items as duplicates in preview so they aren't re-imported
      const createdKeys = new Set(selectedRows.map((r) => r.key));
      setScrapedRows((prev) =>
        prev.map((r) => (createdKeys.has(r.key) ? { ...r, isDuplicate: true } : r))
      );
      setSelectedWebKeys(new Set());
      onNotify(
        'success',
        `Berhasil menginput ${result.created} buku dari web ke Cloud Firestore${result.failed > 0 ? ` (${result.failed} gagal)` : ''}.`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan koleksi ke Firestore.'
      );
    } finally {
      setWebImporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);

    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        onNotify('error', 'Berkas tidak memiliki sheet data.');
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
        defval: '',
      });

      if (rawRows.length === 0) {
        onNotify('error', 'Berkas tidak berisi baris data.');
        return;
      }

      const byCode = new Map<string, Book>();
      const byIsbn = new Map<string, Book>();
      for (const b of books) {
        if (b.bookCode) byCode.set(b.bookCode.toLowerCase(), b);
        if (b.isbn) byIsbn.set(b.isbn.toLowerCase(), b);
      }

      const parsed: ParsedImportRow[] = rawRows.map((row, idx) => {
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const matchKey = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
            if (matchKey !== undefined && String(row[matchKey]).trim() !== '') {
              return String(row[matchKey]).trim();
            }
          }
          return '';
        };

        const bookCode = getVal('bookCode', 'ID Buku', 'Kode Buku', 'id');
        const title = getVal('title', 'Judul', 'Judul Buku');
        const author = getVal('author', 'Penulis', 'Nama Penulis');
        const publisher = getVal('publisher', 'Penerbit') || 'Pustaka Digital';
        const yearRaw = Number(getVal('year', 'Tahun', 'Tahun Terbit') || new Date().getFullYear());
        const isbn = getVal('isbn', 'ISBN');
        const category = getVal('category', 'Kategori') || 'Pengetahuan Umum';
        const description =
          getVal('description', 'Deskripsi', 'Sinopsis') || `Buku digital ${title || 'tanpa deskripsi'}.`;
        const coverUrl = getVal('coverUrl', 'URL Cover', 'Cover');
        const fileUrl = getVal('fileUrl', 'URL File', 'URL File Buku', 'Link');
        const rawFormat = getVal('fileFormat', 'Format', 'Format File').toUpperCase();
        const allowedFormats: BookFileFormat[] = ['PDF', 'EPUB', 'DRIVE_PDF', 'EXTERNAL'];
        const fileFormat: BookFileFormat = allowedFormats.includes(rawFormat as BookFileFormat)
          ? (rawFormat as BookFileFormat)
          : fileUrl.includes('drive.google.com')
            ? 'DRIVE_PDF'
            : 'PDF';
        const fileSize = getVal('fileSize', 'Ukuran', 'Ukuran File');
        const rawStatus = getVal('status', 'Status', 'Status Publikasi').toLowerCase();
        const status: 'published' | 'hidden' =
          rawStatus === 'hidden' || rawStatus === 'disembunyikan' ? 'hidden' : 'published';

        const missing: string[] = [];
        if (!title) missing.push('Judul');
        if (!author) missing.push('Penulis');
        if (!fileUrl) missing.push('URL File');
        if (!Number.isInteger(yearRaw) || yearRaw < 1000 || yearRaw > 2100) {
          missing.push('Tahun valid');
        }

        const matched =
          (bookCode && byCode.get(bookCode.toLowerCase())) ||
          (isbn && byIsbn.get(isbn.toLowerCase())) ||
          undefined;

        return {
          rowIndex: idx + 2,
          action: missing.length > 0 ? 'error' : matched ? 'update' : 'create',
          matchedBookId: matched?.id,
          duplicateReason: matched
            ? `Cocok dengan ${matched.bookCode}${matched.isbn ? ` (ISBN: ${matched.isbn})` : ''} — akan diperbarui`
            : undefined,
          errorReason: missing.length > 0 ? `Kolom wajib kosong/tidak valid: ${missing.join(', ')}` : undefined,
          data: {
            bookCode: bookCode || matched?.bookCode || generateBookCode(),
            title,
            author,
            publisher,
            year: Number.isInteger(yearRaw) ? yearRaw : new Date().getFullYear(),
            isbn,
            category,
            description,
            coverUrl,
            fileUrl,
            fileFormat,
            fileSize,
            status,
            isDemo: false,
            recommended: matched?.recommended ?? false,
            viewsCount: matched?.viewsCount ?? 0,
            downloadsCount: matched?.downloadsCount ?? 0,
          },
        };
      });

      setPreviewRows(parsed);
    } catch {
      onNotify('error', 'Gagal membaca file CSV/XLSX. Pastikan format file valid.');
    }
  };

  const handleExecuteImport = async () => {
    const validRows = previewRows.filter((r) => r.action !== 'error');
    if (validRows.length === 0) {
      onNotify('error', 'Tidak ada baris valid untuk diimpor.');
      return;
    }

    setImporting(true);
    let created = 0;
    let updated = 0;
    let failed = previewRows.filter((r) => r.action === 'error').length;

    const toCreate: BookFormData[] = [];
    for (const row of validRows) {
      if (row.action === 'update' && row.matchedBookId) {
        try {
          await updateBook(row.matchedBookId, row.data);
          updated += 1;
        } catch {
          failed += 1;
        }
      } else {
        toCreate.push(row.data);
      }
    }

    if (toCreate.length > 0) {
      const batchRes = await batchCreateBooks(toCreate);
      created += batchRes.created;
      failed += batchRes.failed;
    }

    setImporting(false);
    setReport({ created, updated, failed });
    onNotify(
      'success',
      `Import selesai: ${created} ditambahkan, ${updated} diperbarui, ${failed} gagal.`
    );
  };

  const handleDownloadTemplate = (fmt: 'xlsx' | 'csv') => {
    const templateData = [
      {
        bookCode: 'RBV-2026-8801',
        title: 'Contoh Judul Buku Digital',
        author: 'Nama Penulis',
        publisher: 'Nama Penerbit',
        year: 2026,
        isbn: '978-602-000-001-1',
        category: categories[0]?.name || 'Teknologi',
        description: 'Ringkasan singkat isi buku.',
        coverUrl: '',
        fileUrl: 'https://example.com/dokumen.pdf',
        fileFormat: 'PDF',
        fileSize: '1.5 MB',
        status: 'published',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Buku');
    XLSX.writeFile(wb, `Template_Import_RuangBacaVirtual.${fmt}`);
  };

  const handleExport = (fmt: 'xlsx' | 'csv') => {
    const filtered = books.filter((b) => {
      const catOk = exportCategory === 'Semua' || b.category === exportCategory;
      const statusOk = exportStatus === 'all' || b.status === exportStatus;
      return catOk && statusOk;
    });

    if (filtered.length === 0) {
      onNotify('info', 'Tidak ada data buku yang sesuai filter export.');
      return;
    }

    const rows = filtered.map((b) => ({
      ID_Dokumen: b.id,
      Kode_Buku: b.bookCode,
      Judul: b.title,
      Penulis: b.author,
      Penerbit: b.publisher,
      Tahun_Terbit: b.year,
      ISBN: b.isbn || '',
      Kategori: b.category,
      Deskripsi: b.description,
      URL_Cover: b.coverUrl || '',
      URL_File: b.fileUrl,
      Format_File: b.fileFormat,
      Ukuran_File: b.fileSize || '',
      Status_Publikasi: b.status,
      Rekomendasi: b.recommended ? 'Ya' : 'Tidak',
      Total_Pembaca: b.viewsCount,
      Total_Unduhan: b.downloadsCount,
      Tanggal_Ditambahkan: new Date(b.createdAt).toISOString(),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Koleksi_Buku');
    XLSX.writeFile(wb, `Koleksi_RuangBacaVirtual_${new Date().toISOString().slice(0, 10)}.${fmt}`);
    onNotify('success', `Berhasil mengekspor ${filtered.length} buku ke ${fmt.toUpperCase()}.`);
  };

  if (mode === 'export') {
    const matchCount = books.filter((b) => {
      const catOk = exportCategory === 'Semua' || b.category === exportCategory;
      const statusOk = exportStatus === 'all' || b.status === exportStatus;
      return catOk && statusOk;
    }).length;

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl space-y-6">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="font-editorial text-xl font-bold text-[#0F2342]">Export Data Koleksi Buku</h2>
          <p className="text-sm text-slate-600 mt-1">
            Unduh seluruh metadata katalog buku ke format Excel (.xlsx) atau CSV.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Filter Kategori</label>
            <select
              value={exportCategory}
              onChange={(e) => setExportCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="Semua">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Filter Status Publikasi
            </label>
            <select
              value={exportStatus}
              onChange={(e) => setExportStatus(e.target.value as 'all' | 'published' | 'hidden')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="all">Semua Status</option>
              <option value="published">Tayang (Published)</option>
              <option value="hidden">Disembunyikan (Hidden)</option>
            </select>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <span className="text-sm text-slate-700">Jumlah data siap ekspor:</span>
          <span className="text-lg font-bold text-[#0F2342] tabular-nums">{matchCount} buku</span>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-300" />
            Export Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
          >
            <Download className="w-4 h-4 text-sky-700" />
            Export CSV (.csv)
          </button>
        </div>
      </div>
    );
  }

  // Import Mode
  const validCreateCount = previewRows.filter((r) => r.action === 'create').length;
  const validUpdateCount = previewRows.filter((r) => r.action === 'update').length;
  const errorCount = previewRows.filter((r) => r.action === 'error').length;
  const webNewCount = scrapedRows.filter((r) => !r.isDuplicate).length;
  const webDupCount = scrapedRows.length - webNewCount;

  return (
    <div className="space-y-6">
      {/* Import Method Tabs */}
      <div className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-xl">
        <button
          type="button"
          onClick={() => setImportTab('web')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            importTab === 'web'
              ? 'bg-white text-[#0F2342] shadow-xs'
              : 'text-slate-600 hover:text-[#0F2342]'
          }`}
        >
          <Globe className="w-4 h-4 text-sky-700" />
          Import dari Halaman Web / URL
        </button>
        <button
          type="button"
          onClick={() => setImportTab('file')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            importTab === 'file'
              ? 'bg-white text-[#0F2342] shadow-xs'
              : 'text-slate-600 hover:text-[#0F2342]'
          }`}
        >
          <Upload className="w-4 h-4 text-sky-700" />
          Import Berkas CSV / XLSX
        </button>
      </div>

      {/* TAB 1: IMPORT DARI HALAMAN WEB */}
      {importTab === 'web' && (
        <>
          <form
            onSubmit={handleScrapeWeb}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="pb-4 border-b border-slate-200">
              <h2 className="font-editorial text-xl font-bold text-[#0F2342]">
                Import Koleksi E-Book dari Halaman Web
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Masukkan tautan halaman web yang berisi daftar tautan PDF atau Google Drive (seperti halaman{' '}
                <span className="font-mono text-xs text-sky-800">rowlandpasaribu.wordpress.com/ebook-gue/</span>
                ). Sistem akan memindai judul, penulis, tahun, bagian, dan tautan PDF untuk langsung diinput ke Cloud Firestore.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="url"
                required
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://rowlandpasaribu.wordpress.com/ebook-gue/"
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
              <button
                type="submit"
                disabled={scrapingWeb}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {scrapingWeb ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-sky-300" />
                    Memindai Halaman...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 text-sky-300" />
                    Ambil Daftar E-Book
                  </>
                )}
              </button>
            </div>

            {webReport && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <span>
                  Berhasil menyimpan <strong>{webReport.created}</strong> e-book ke Cloud Firestore
                  {webReport.failed > 0 ? ` (${webReport.failed} gagal)` : ''}. Koleksi kini langsung tampil di katalog publik dan Manajemen Buku.
                </span>
              </div>
            )}
          </form>

          {scrapedRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                      Sumber: {scrapedTitle || webUrl}
                    </p>
                    <div className="text-sm text-slate-700 flex flex-wrap items-center gap-4 mt-1 tabular-nums">
                      <span>
                        Total Ditemukan: <strong>{scrapedRows.length}</strong>
                      </span>
                      <span className="text-emerald-700">
                        Buku Baru: <strong>{webNewCount}</strong>
                      </span>
                      <span className="text-slate-500">
                        Sudah Ada: <strong>{webDupCount}</strong>
                      </span>
                      <span className="text-[#0F2342]">
                        Dipilih: <strong>{selectedWebKeys.size}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={webImporting || selectedWebKeys.size === 0}
                    onClick={handleBatchWebImport}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-50 whitespace-nowrap"
                  >
                    {webImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-sky-300" />
                        {webProgress
                          ? `Menyimpan ${webProgress.done} / ${webProgress.total}...`
                          : 'Menyimpan ke Firestore...'}
                      </>
                    ) : (
                      `Simpan ${selectedWebKeys.size} Buku ke Cloud Firestore`
                    )}
                  </button>
                </div>

                {/* Filter & Selection Toolbar */}
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={webSearch}
                        onChange={(e) => {
                          setWebSearch(e.target.value);
                          setWebPage(1);
                        }}
                        placeholder="Filter judul, penulis, atau kategori..."
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <select
                      value={webSectionFilter}
                      onChange={(e) => {
                        setWebSectionFilter(e.target.value);
                        setWebPage(1);
                      }}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Semua">Semua Bagian ({scrapedRows.length})</option>
                      {webSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWebKeys(
                          new Set(filteredWebRows.filter((r) => !r.isDuplicate).map((r) => r.key))
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                    >
                      Pilih Semua Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWebKeys(
                          new Set(
                            filteredWebRows
                              .filter((r) => !r.isDuplicate)
                              .slice(0, 50)
                              .map((r) => r.key)
                          )
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Pilih 50 Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedWebKeys(new Set())}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Batal Pilih
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 w-10">Pilih</th>
                      <th className="px-4 py-3 font-semibold">Judul & Bagian</th>
                      <th className="px-4 py-3 font-semibold">Penulis</th>
                      <th className="px-4 py-3 font-semibold">Tahun</th>
                      <th className="px-4 py-3 font-semibold">Kategori</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedWebRows.map((row) => {
                      const checked = selectedWebKeys.has(row.key);
                      return (
                        <tr
                          key={row.key}
                          className={row.isDuplicate ? 'bg-slate-50/70 opacity-70' : 'hover:bg-slate-50'}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              disabled={row.isDuplicate}
                              checked={checked}
                              aria-label={`Pilih ${row.title}`}
                              onChange={() => {
                                const next = new Set(selectedWebKeys);
                                if (next.has(row.key)) next.delete(row.key);
                                else next.add(row.key);
                                setSelectedWebKeys(next);
                              }}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-4 py-3 max-w-sm">
                            <p className="font-semibold text-slate-900 truncate">{row.title}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {row.section} · <span className="font-mono">{row.fileFormat}</span>
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">
                            {row.author}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                            {row.year}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              disabled={row.isDuplicate}
                              value={row.category}
                              onChange={(e) => handleWebCategoryChange(row.key, e.target.value)}
                              className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.isDuplicate ? (
                              <span className="text-slate-500 font-medium">Sudah ada</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">Siap diimpor</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {webTotalPages > 1 && (
                <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span className="tabular-nums">
                    Halaman <strong>{currentWebPage}</strong> dari <strong>{webTotalPages}</strong> (
                    {filteredWebRows.length} buku)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentWebPage <= 1}
                      onClick={() => setWebPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={currentWebPage >= webTotalPages}
                      onClick={() => setWebPage((p) => Math.min(webTotalPages, p + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Berikutnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: IMPORT CSV / XLSX */}
      {importTab === 'file' && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="font-editorial text-xl font-bold text-[#0F2342]">
                  Import Data Buku (CSV / XLSX)
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Tambahkan atau perbarui data buku tanpa menghapus koleksi yang sudah ada. Duplikat dideteksi berdasarkan Kode Buku atau ISBN.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('xlsx')}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Template XLSX
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('csv')}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Template CSV
                </button>
              </div>
            </div>

            <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-sky-500 hover:bg-sky-50/30 transition-colors">
              <Upload className="w-8 h-8 text-sky-700 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#0F2342]">
                {fileName
                  ? `Berkas dipilih: ${fileName}`
                  : 'Pilih berkas CSV atau Excel (.xlsx) untuk dipratinjau'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Kolom wajib: Judul (title), Penulis (author), Tahun (year), URL File (fileUrl)
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {report && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <span>
                  Laporan Import: <strong>{report.created}</strong> buku baru ditambahkan,{' '}
                  <strong>{report.updated}</strong> buku diperbarui, <strong>{report.failed}</strong>{' '}
                  gagal.
                </span>
              </div>
            )}
          </div>

          {previewRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-sm text-slate-700 flex flex-wrap items-center gap-4 tabular-nums">
                  <span>
                    Total Baris: <strong>{previewRows.length}</strong>
                  </span>
                  <span className="text-emerald-700">
                    Baru: <strong>{validCreateCount}</strong>
                  </span>
                  <span className="text-sky-700">
                    Perbarui (Duplikat ID/ISBN): <strong>{validUpdateCount}</strong>
                  </span>
                  <span className="text-red-700">
                    Tidak Valid: <strong>{errorCount}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={importing || validCreateCount + validUpdateCount === 0}
                  onClick={handleExecuteImport}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-50 whitespace-nowrap"
                >
                  {importing ? 'Menyimpan Data...' : 'Simpan ke Cloud Firestore'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Baris</th>
                      <th className="px-4 py-3 font-semibold">Aksi</th>
                      <th className="px-4 py-3 font-semibold">Kode / ISBN</th>
                      <th className="px-4 py-3 font-semibold">Judul</th>
                      <th className="px-4 py-3 font-semibold">Penulis</th>
                      <th className="px-4 py-3 font-semibold">Kategori</th>
                      <th className="px-4 py-3 font-semibold">Keterangan Validasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                          {row.rowIndex}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {row.action === 'create' && (
                            <span className="text-emerald-700">Tambah Baru</span>
                          )}
                          {row.action === 'update' && (
                            <span className="text-sky-700">Update</span>
                          )}
                          {row.action === 'error' && <span className="text-red-700">Gagal</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.data.bookCode}
                          {row.data.isbn ? ` / ${row.data.isbn}` : ''}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 max-w-xs truncate">
                          {row.data.title || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.data.author || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.data.category}</td>
                        <td className="px-4 py-3">
                          {row.errorReason ? (
                            <span className="text-red-700 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {row.errorReason}
                            </span>
                          ) : row.duplicateReason ? (
                            <span className="text-sky-700">{row.duplicateReason}</span>
                          ) : (
                            <span className="text-emerald-700">Siap diimpor</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
