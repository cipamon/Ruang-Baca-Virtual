import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Link2,
  Save,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  type Book,
  type BookFileFormat,
  type BookFormData,
  type Category,
  type UrlCheckResult,
} from '../../types/library';
import { BookCover } from '../BookCover';
import {
  autoFillBookInfo,
  checkExternalUrl,
  generateBookCode,
} from '../../services/libraryService';
import { buildSamplePdfUrl } from '../../data/demoData';

interface BookFormPanelProps {
  initialBook?: Book | null;
  categories: Category[];
  onSubmit: (data: BookFormData, editingId?: string) => Promise<void>;
  onCancel?: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const BookFormPanel: React.FC<BookFormPanelProps> = ({
  initialBook,
  categories,
  onSubmit,
  onCancel,
  onNotify,
}) => {
  const [bookCode, setBookCode] = useState(initialBook?.bookCode || generateBookCode());
  const [title, setTitle] = useState(initialBook?.title || '');
  const [author, setAuthor] = useState(initialBook?.author || '');
  const [publisher, setPublisher] = useState(initialBook?.publisher || '');
  const [year, setYear] = useState<string>(String(initialBook?.year || new Date().getFullYear()));
  const [yearTouched, setYearTouched] = useState(Boolean(initialBook));
  const [isbn, setIsbn] = useState(initialBook?.isbn || '');
  const [category, setCategory] = useState(
    initialBook?.category || categories[0]?.name || 'Pengetahuan Umum'
  );
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initialBook));
  const [description, setDescription] = useState(initialBook?.description || '');
  const [coverUrl, setCoverUrl] = useState(initialBook?.coverUrl || '');
  const [fileUrl, setFileUrl] = useState(initialBook?.fileUrl || '');
  const [fileFormat, setFileFormat] = useState<BookFileFormat>(initialBook?.fileFormat || 'PDF');
  const [fileSize, setFileSize] = useState(initialBook?.fileSize || '');
  const [status, setStatus] = useState<'published' | 'hidden'>(initialBook?.status || 'published');
  const [recommended, setRecommended] = useState<boolean>(Boolean(initialBook?.recommended));

  const [checkingUrl, setCheckingUrl] = useState(false);
  const [urlCheck, setUrlCheck] = useState<UrlCheckResult | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const [overwriteOnAutoFill, setOverwriteOnAutoFill] = useState(false);
  const [autoFillStatus, setAutoFillStatus] = useState<{
    type: 'success' | 'error';
    text: string;
    sources?: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAutoFill = async () => {
    if (!title.trim() && !isbn.trim() && !fileUrl.trim()) {
      const msg =
        'Masukkan minimal Judul Buku, ISBN, atau URL File PDF/Drive terlebih dahulu agar sistem dapat melengkapi data otomatis.';
      setAutoFillStatus({ type: 'error', text: msg });
      onNotify('error', msg);
      return;
    }

    setAutoFilling(true);
    setAutoFillStatus(null);
    try {
      const res = await autoFillBookInfo({
        title: title.trim() || undefined,
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
        categories: categories.map((c) => c.name),
      });

      const d = res.data;
      if (!res.ok || !d) {
        const msg = res.error || 'Informasi buku tidak ditemukan dari sumber yang tersedia.';
        setAutoFillStatus({ type: 'error', text: msg });
        onNotify('error', msg);
        return;
      }

      const filledFields: string[] = [];
      const shouldSet = (current: string) => overwriteOnAutoFill || !current.trim();

      if (d.title && shouldSet(title)) {
        setTitle(d.title);
        filledFields.push('Judul');
      }
      if (d.author && shouldSet(author)) {
        setAuthor(d.author);
        filledFields.push('Penulis');
      }
      if (d.publisher && shouldSet(publisher)) {
        setPublisher(d.publisher);
        filledFields.push('Penerbit');
      }
      if (d.year && (overwriteOnAutoFill || !yearTouched)) {
        setYear(String(d.year));
        filledFields.push('Tahun');
      }
      if (d.isbn && shouldSet(isbn)) {
        setIsbn(d.isbn);
        filledFields.push('ISBN');
      }
      if (
        d.category &&
        categories.some((c) => c.name === d.category) &&
        (overwriteOnAutoFill || !categoryTouched)
      ) {
        setCategory(d.category);
        filledFields.push('Kategori');
      }
      if (d.description && shouldSet(description)) {
        setDescription(d.description);
        filledFields.push('Sinopsis');
      }
      if (d.coverUrl && shouldSet(coverUrl)) {
        setCoverUrl(d.coverUrl);
        filledFields.push('Cover');
      }
      if (d.fileFormat && (overwriteOnAutoFill || !initialBook)) {
        setFileFormat(d.fileFormat);
      }
      if (d.fileSize && shouldSet(fileSize)) {
        setFileSize(d.fileSize);
        filledFields.push('Ukuran File');
      }

      const summary =
        filledFields.length > 0
          ? `Berhasil melengkapi ${filledFields.join(', ')}.`
          : 'Semua kolom sudah terisi. Centang opsi "Timpa kolom terisi" jika ingin memperbarui data yang sudah ada.';

      setAutoFillStatus({
        type: 'success',
        text: summary,
        sources: res.sources,
      });
      onNotify('success', summary);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal melengkapi informasi buku secara otomatis.';
      setAutoFillStatus({ type: 'error', text: msg });
      onNotify('error', msg);
    } finally {
      setAutoFilling(false);
    }
  };

  const handleCheckUrl = async () => {
    if (!fileUrl.trim()) {
      onNotify('error', 'Masukkan URL file buku terlebih dahulu sebelum memeriksa.');
      return;
    }
    setCheckingUrl(true);
    try {
      const res = await checkExternalUrl(fileUrl.trim());
      setUrlCheck(res);
      if (res.format) setFileFormat(res.format);
      if (res.fileSize) setFileSize(res.fileSize);
    } catch {
      onNotify('error', 'Gagal memeriksa tautan eksternal.');
    } finally {
      setCheckingUrl(false);
    }
  };

  const handleUseInternalSample = () => {
    const sampleUrl = buildSamplePdfUrl({
      bookCode,
      title: title || 'Koleksi Ruang Baca Virtual',
      author: author || 'Tim Pustaka',
      publisher: publisher || 'Ruang Baca Virtual',
      year: Number(year) || 2026,
      category,
      isbn,
      description: description || 'Edisi digital resmi Ruang Baca Virtual.',
    });
    setFileUrl(sampleUrl);
    setFileFormat('PDF');
    setFileSize('48 KB');
    setUrlCheck({
      ok: true,
      accessible: true,
      compatibleWithPdfViewer: true,
      isGoogleDrive: false,
      format: 'PDF',
      fileSize: '48 KB',
      directDownloadUrl: `${sampleUrl}&download=1`,
      previewUrl: sampleUrl,
      message: 'Tautan PDF pratinjau internal siap dibaca dan diunduh.',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedYear = Number(year);
    if (!title.trim() || !author.trim() || !publisher.trim() || !description.trim() || !fileUrl.trim()) {
      onNotify('error', 'Harap lengkapi semua kolom wajib (Judul, Penulis, Penerbit, Sinopsis, dan URL File).');
      return;
    }
    if (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 2100) {
      onNotify('error', 'Tahun terbit harus berupa angka valid antara 1000 hingga 2100.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(
        {
          bookCode: bookCode.trim() || generateBookCode(),
          title: title.trim(),
          author: author.trim(),
          publisher: publisher.trim(),
          year: parsedYear,
          isbn: isbn.trim(),
          category,
          description: description.trim(),
          coverUrl: coverUrl.trim(),
          fileUrl: fileUrl.trim(),
          fileFormat,
          fileSize: fileSize.trim(),
          status,
          isDemo: initialBook?.isDemo ?? false,
          recommended,
          viewsCount: initialBook?.viewsCount ?? 0,
          downloadsCount: initialBook?.downloadsCount ?? 0,
        },
        initialBook?.id
      );
      if (!initialBook) {
        setBookCode(generateBookCode());
        setTitle('');
        setAuthor('');
        setPublisher('');
        setYear(String(new Date().getFullYear()));
        setYearTouched(false);
        setCategoryTouched(false);
        setIsbn('');
        setDescription('');
        setCoverUrl('');
        setFileUrl('');
        setFileSize('');
        setUrlCheck(null);
        setAutoFillStatus(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-editorial text-xl font-bold text-[#0F2342]">
              {initialBook ? 'Edit Informasi Buku' : 'Tambah Koleksi Buku Baru'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kode Katalog Otomatis: <span className="font-mono text-slate-700">{bookCode}</span>
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" />
              Batal
            </button>
          )}
        </div>

        {/* Asisten Pengisian Informasi Buku Otomatis */}
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F2342]">
                <Sparkles className="w-4 h-4 text-sky-700 shrink-0" />
                Asisten Pengisian Informasi Buku Otomatis
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cukup isi <strong>Judul Buku</strong>, <strong>ISBN</strong>, atau{' '}
                <strong>URL File PDF / Google Drive</strong>, lalu sistem akan membantu melengkapi
                penulis, penerbit, tahun terbit, kategori, sinopsis, dan cover buku secara otomatis.
              </p>
            </div>
            <button
              type="button"
              disabled={autoFilling}
              onClick={handleAutoFill}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {autoFilling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-300" />
                  Melengkapi Info...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                  Lengkapi Info Buku Otomatis
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-sky-200/70">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteOnAutoFill}
                onChange={(e) => setOverwriteOnAutoFill(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-[#0F2342]"
              />
              Timpa kolom yang sudah terisi
            </label>
            {!fileUrl.trim() && (
              <span className="text-[11px] text-slate-500">
                Belum punya file PDF? Gunakan tombol{' '}
                <strong className="text-sky-800">Generator PDF Sampel</strong> di bawah.
              </span>
            )}
          </div>

          {autoFillStatus && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                autoFillStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {autoFillStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-medium">{autoFillStatus.text}</p>
                {autoFillStatus.sources && autoFillStatus.sources.length > 0 && (
                  <p className="text-[11px] text-emerald-800">
                    Sumber data: {autoFillStatus.sources.join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Judul Buku *
            </label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Laskar Pelangi atau Pengantar Arsitektur Sistem Modern"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Penulis *</label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.AUTHOR_MAX}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nama lengkap penulis (atau klik Lengkapi Otomatis)"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Penerbit *</label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.PUBLISHER_MAX}
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Nama penerbit"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tahun Terbit *</label>
            <input
              type="number"
              required
              min={1000}
              max={2100}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setYearTouched(true);
              }}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">ISBN (Opsional)</label>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.ISBN_MAX}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="978-602-..."
              className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kategori *</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCategoryTouched(true);
              }}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status Publikasi</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'published' | 'hidden')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            >
              <option value="published">Tayang (Publik)</option>
              <option value="hidden">Disembunyikan</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Sinopsis / Deskripsi *
            </label>
            <textarea
              required
              rows={4}
              maxLength={BLUEPRINT_LIMITS.DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tuliskan ringkasan isi buku..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                URL Cover Buku (Opsional)
              </label>
              {coverUrl.trim() && fileUrl.trim() && (
                <button
                  type="button"
                  onClick={() => setCoverUrl('')}
                  className="text-xs font-medium text-sky-700 hover:text-[#0F2342] underline underline-offset-2"
                >
                  Pakai Halaman Pertama PDF
                </button>
              )}
            </div>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.URL_MAX}
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://... (kosongkan untuk otomatis memakai halaman pertama PDF)"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                URL File Buku (PDF / Google Drive / Tautan Eksternal) *
              </label>
              <button
                type="button"
                onClick={handleUseInternalSample}
                className="text-xs font-medium text-sky-700 hover:text-[#0F2342] underline underline-offset-2"
              >
                Gunakan Generator PDF Sampel
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.URL_MAX}
                value={fileUrl}
                onChange={(e) => {
                  setFileUrl(e.target.value);
                  setUrlCheck(null);
                }}
                placeholder="https://contoh.com/buku.pdf atau https://drive.google.com/file/d/..."
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
              <button
                type="button"
                disabled={checkingUrl}
                onClick={handleCheckUrl}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" />
                {checkingUrl ? 'Memeriksa...' : 'Periksa Link'}
              </button>
            </div>

            {urlCheck && (
              <div
                className={`mt-2.5 p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  urlCheck.ok && urlCheck.compatibleWithPdfViewer
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : urlCheck.accessible
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {urlCheck.ok && urlCheck.compatibleWithPdfViewer ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{urlCheck.message}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Format File</label>
            <select
              value={fileFormat}
              onChange={(e) => setFileFormat(e.target.value as BookFileFormat)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            >
              <option value="PDF">PDF (Pembaca Langsung)</option>
              <option value="DRIVE_PDF">Google Drive PDF</option>
              <option value="EPUB">EPUB (Unduhan)</option>
              <option value="EXTERNAL">Tautan Eksternal Lainnya</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Ukuran File (Opsional)
            </label>
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.FILE_SIZE_MAX}
              value={fileSize}
              onChange={(e) => setFileSize(e.target.value)}
              placeholder="Contoh: 2.4 MB"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div className="sm:col-span-2 pt-2">
            <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-slate-700">
              <input
                type="checkbox"
                checked={recommended}
                onChange={(e) => setRecommended(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#0F2342] focus:ring-sky-600"
              />
              Tampilkan dalam daftar Rekomendasi Pilihan di Beranda
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-60"
          >
            <Save className="w-4 h-4 text-sky-300" />
            {saving ? 'Menyimpan...' : initialBook ? 'Simpan Perubahan' : 'Simpan Buku ke Database'}
          </button>
        </div>
      </div>

      {/* Live Cover Preview Column */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Pratinjau Tampilan Kartu
          </h3>
          <BookCover
            coverUrl={coverUrl}
            fileUrl={fileUrl}
            fileFormat={fileFormat}
            title={title || 'Judul Buku Baru'}
            author={author || 'Nama Penulis'}
            category={category}
            size="lg"
          />
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <p>
              <strong>Kode:</strong> <span className="font-mono">{bookCode}</span>
            </p>
            <p>
              <strong>Status:</strong> {status === 'published' ? 'Tayang Publik' : 'Disembunyikan'}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};
