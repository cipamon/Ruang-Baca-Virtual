import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckSquare,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  AdminSection,
  AdminUser,
  Book,
  BookFileFormat,
  BookFormData,
  Category,
  LibrarySettings,
} from '../../types/library';
import {
  addAdminUid,
  bulkDeleteBooks,
  bulkUpdateBooksMetadata,
  bulkUpdateBookStatus,
  createBook,
  deleteBook,
  deleteCategory,
  removeAdminUid,
  saveCategory,
  saveLibrarySettings,
  seedDemoDataToFirestore,
  setBookStatus,
  updateBook,
} from '../../services/libraryService';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../../firebase';
import { BookFormPanel } from './BookFormPanel';
import { ImportExportPanel } from './ImportExportPanel';
import { BookCover } from '../BookCover';

interface AdminDashboardProps {
  currentUser: User;
  books: Book[];
  categories: Category[];
  settings: LibrarySettings;
  admins: AdminUser[];
  onExitAdmin: () => void;
  onLogout: () => void;
  onInspectBook: (book: Book) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  books,
  categories,
  settings,
  admins,
  onExitAdmin,
  onLogout,
  onInspectBook,
  onNotify,
}) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [adminDetailBook, setAdminDetailBook] = useState<Book | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Management filters & bulk selection
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');
  const [filterYear, setFilterYear] = useState('Semua');
  const [filterFormat, setFilterFormat] = useState<'all' | BookFileFormat>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'hidden'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adminTablePage, setAdminTablePage] = useState(1);

  // Delete confirmation modal state
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);

  // Bulk Edit modal state
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkApplyCategory, setBulkApplyCategory] = useState(false);
  const [bulkCategory, setBulkCategory] = useState(categories[0]?.name || 'Pengetahuan Umum');
  const [bulkApplyYear, setBulkApplyYear] = useState(false);
  const [bulkYear, setBulkYear] = useState(String(new Date().getFullYear()));
  const [bulkApplyStatus, setBulkApplyStatus] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<'published' | 'hidden'>('published');
  const [bulkApplyRecommended, setBulkApplyRecommended] = useState(false);
  const [bulkRecommended, setBulkRecommended] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Category state
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Settings form state
  const [libName, setLibName] = useState(settings.libraryName);
  const [libTagline, setLibTagline] = useState(settings.tagline);
  const [heroTitle, setHeroTitle] = useState(settings.heroTitle);
  const [heroDescription, setHeroDescription] = useState(settings.heroDescription);
  const [allowGuestDownload, setAllowGuestDownload] = useState(settings.allowGuestDownload);
  const [itemsPerPage, setItemsPerPage] = useState(String(settings.itemsPerPage));
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');

  useEffect(() => {
    setLibName(settings.libraryName);
    setLibTagline(settings.tagline);
    setHeroTitle(settings.heroTitle);
    setHeroDescription(settings.heroDescription);
    setAllowGuestDownload(settings.allowGuestDownload);
    setItemsPerPage(String(settings.itemsPerPage));
  }, [settings]);

  const isBootstrappedAdmin =
    currentUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const metrics = useMemo(() => {
    const published = books.filter((b) => b.status === 'published').length;
    const hidden = books.filter((b) => b.status === 'hidden').length;
    const recommended = books.filter((b) => b.recommended).length;
    const totalViews = books.reduce((acc, b) => acc + b.viewsCount, 0);
    const totalDownloads = books.reduce((acc, b) => acc + b.downloadsCount, 0);
    return {
      totalBooks: books.length,
      published,
      hidden,
      recommended,
      totalCategories: categories.length,
      totalViews,
      totalDownloads,
    };
  }, [books, categories]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(books.map((b) => b.year))).sort((a, b) => b - a);
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return books.filter((b) => {
      if (section === 'hidden' && b.status !== 'hidden') return false;
      if (section === 'books' && filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (filterCategory !== 'Semua' && b.category !== filterCategory) return false;
      if (filterYear !== 'Semua' && String(b.year) !== filterYear) return false;
      if (filterFormat !== 'all' && b.fileFormat !== filterFormat) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.publisher.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        String(b.year).includes(q) ||
        b.bookCode.toLowerCase().includes(q) ||
        (b.isbn || '').toLowerCase().includes(q)
      );
    });
  }, [books, section, searchTerm, filterCategory, filterYear, filterFormat, filterStatus]);

  const ADMIN_PAGE_SIZE = 50;
  const adminTotalPages = Math.max(1, Math.ceil(filteredBooks.length / ADMIN_PAGE_SIZE));
  const currentAdminPage = Math.min(adminTablePage, adminTotalPages);
  const paginatedAdminBooks = filteredBooks.slice(
    (currentAdminPage - 1) * ADMIN_PAGE_SIZE,
    currentAdminPage * ADMIN_PAGE_SIZE
  );

  const categoryBreakdown = useMemo(() => {
    return categories.map((cat) => {
      const catBooks = books.filter((b) => b.category === cat.name);
      return {
        ...cat,
        count: catBooks.length,
        views: catBooks.reduce((s, b) => s + b.viewsCount, 0),
        downloads: catBooks.reduce((s, b) => s + b.downloadsCount, 0),
      };
    });
  }, [books, categories]);

  const formatBreakdown = useMemo(() => {
    const formats: BookFileFormat[] = ['PDF', 'DRIVE_PDF', 'EPUB', 'EXTERNAL'];
    return formats.map((fmt) => ({
      format: fmt,
      count: books.filter((b) => b.fileFormat === fmt).length,
    }));
  }, [books]);

  const topViewedBooks = useMemo(
    () => [...books].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 8),
    [books]
  );

  const topDownloadedBooks = useMemo(
    () => [...books].sort((a, b) => b.downloadsCount - a.downloadsCount).slice(0, 8),
    [books]
  );

  const categoryUsageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of books) {
      map.set(b.category, (map.get(b.category) || 0) + 1);
    }
    return map;
  }, [books]);

  const sidebarLinks: { id: AdminSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'books', label: 'Manajemen Buku', icon: <BookOpen className="w-4 h-4" />, badge: metrics.totalBooks },
    { id: 'add', label: 'Tambah Buku', icon: <PlusCircle className="w-4 h-4" /> },
    { id: 'categories', label: 'Kategori', icon: <FolderTree className="w-4 h-4" />, badge: metrics.totalCategories },
    { id: 'hidden', label: 'Buku Disembunyikan', icon: <EyeOff className="w-4 h-4" />, badge: metrics.hidden },
    { id: 'import', label: 'Import Data', icon: <Upload className="w-4 h-4" /> },
    { id: 'export', label: 'Export Data', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistik', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Pengaturan', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await seedDemoDataToFirestore();
      onNotify(
        'success',
        `Sinkronisasi selesai: ${res.booksCount} buku demo dan ${res.categoriesCount} kategori ditambahkan ke Cloud Firestore.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Gagal menyinkronkan data demo.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveBook = async (data: BookFormData, editingId?: string) => {
    if (editingId) {
      await updateBook(editingId, data);
      onNotify('success', `Perubahan pada "${data.title}" berhasil disimpan.`);
      setEditingBook(null);
      setSection('books');
    } else {
      await createBook(data);
      onNotify('success', `Buku "${data.title}" berhasil ditambahkan ke Cloud Firestore.`);
      setSection('books');
    }
  };

  const handleToggleVisibility = async (book: Book) => {
    const next = book.status === 'published' ? 'hidden' : 'published';
    await setBookStatus(book.id, next);
    if (adminDetailBook?.id === book.id) {
      setAdminDetailBook({ ...adminDetailBook, status: next });
    }
    onNotify(
      'success',
      next === 'published'
        ? `"${book.title}" sekarang tayang di halaman publik.`
        : `"${book.title}" disembunyikan dari halaman publik.`
    );
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.ids.length === 1) {
      await deleteBook(confirmDelete.ids[0]);
    } else {
      await bulkDeleteBooks(confirmDelete.ids);
    }
    setSelectedIds(new Set());
    if (adminDetailBook && confirmDelete.ids.includes(adminDetailBook.id)) {
      setAdminDetailBook(null);
    }
    onNotify('success', `${confirmDelete.ids.length} buku berhasil dihapus secara permanen.`);
    setConfirmDelete(null);
  };

  const openBulkEditModal = () => {
    setBulkApplyCategory(false);
    setBulkCategory(categories[0]?.name || 'Pengetahuan Umum');
    setBulkApplyYear(false);
    setBulkYear(String(new Date().getFullYear()));
    setBulkApplyStatus(false);
    setBulkStatus('published');
    setBulkApplyRecommended(false);
    setBulkRecommended(false);
    setBulkEditOpen(true);
  };

  const handleConfirmBulkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const updates: {
      category?: string;
      year?: number;
      status?: 'published' | 'hidden';
      recommended?: boolean;
    } = {};

    if (bulkApplyCategory && bulkCategory.trim()) {
      updates.category = bulkCategory.trim();
    }
    if (bulkApplyYear) {
      const parsedYear = Number(bulkYear);
      if (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 2100) {
        onNotify('error', 'Tahun terbit harus berupa angka valid antara 1000 hingga 2100.');
        return;
      }
      updates.year = parsedYear;
    }
    if (bulkApplyStatus) {
      updates.status = bulkStatus;
    }
    if (bulkApplyRecommended) {
      updates.recommended = bulkRecommended;
    }

    if (Object.keys(updates).length === 0) {
      onNotify('error', 'Pilih minimal satu kolom yang ingin diubah secara massal.');
      return;
    }

    setBulkSaving(true);
    try {
      await bulkUpdateBooksMetadata(ids, updates);
      setBulkEditOpen(false);
      setSelectedIds(new Set());
      onNotify('success', `Berhasil memperbarui informasi ${ids.length} buku terpilih.`);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal memperbarui beberapa buku secara massal.'
      );
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkAction = async (
    action: 'publish' | 'hide' | 'delete' | 'export_xlsx' | 'export_csv' | 'edit_selected'
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === 'edit_selected') {
      if (ids.length === 1) {
        const target = books.find((b) => b.id === ids[0]);
        if (target) {
          setEditingBook(target);
          return;
        }
      }
      openBulkEditModal();
      return;
    }

    if (action === 'export_xlsx' || action === 'export_csv') {
      const selectedBooks = books.filter((b) => selectedIds.has(b.id));
      const rows = selectedBooks.map((b) => ({
        Kode_Buku: b.bookCode,
        Judul: b.title,
        Penulis: b.author,
        Penerbit: b.publisher,
        Tahun: b.year,
        ISBN: b.isbn || '',
        Kategori: b.category,
        Status: b.status,
        Deskripsi: b.description,
        URL_Cover: b.coverUrl || '',
        URL_File: b.fileUrl,
        Format: b.fileFormat,
        Ukuran: b.fileSize || '',
        Pembaca: b.viewsCount,
        Unduhan: b.downloadsCount,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const dateStr = new Date().toISOString().slice(0, 10);

      if (action === 'export_csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Koleksi_Terpilih_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        onNotify('success', `Berhasil mengekspor ${selectedBooks.length} buku terpilih ke CSV.`);
      } else {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Buku_Terpilih');
        XLSX.writeFile(wb, `Koleksi_Terpilih_${dateStr}.xlsx`);
        onNotify('success', `Berhasil mengekspor ${selectedBooks.length} buku terpilih ke Excel.`);
      }
      return;
    }

    if (action === 'delete') {
      setConfirmDelete({
        ids,
        label: `${ids.length} buku terpilih`,
      });
      return;
    }

    await bulkUpdateBookStatus(ids, action === 'publish' ? 'published' : 'hidden');
    setSelectedIds(new Set());
    onNotify(
      'success',
      action === 'publish'
        ? `${ids.length} buku berhasil ditayangkan.`
        : `${ids.length} buku berhasil disembunyikan.`
    );
  };

  const toggleSelectAll = () => {
    if (filteredBooks.length === 0) return;
    const allSelected = filteredBooks.every((b) => selectedIds.has(b.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBooks.map((b) => b.id)));
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    await saveCategory(catName.trim(), catDesc.trim(), editingCat?.id);
    onNotify(
      'success',
      editingCat ? `Kategori "${catName}" diperbarui.` : `Kategori "${catName}" ditambahkan.`
    );
    setCatName('');
    setCatDesc('');
    setEditingCat(null);
  };

  const handleDeleteCategory = async (cat: Category) => {
    const usedCount = categoryUsageCounts.get(cat.name) || 0;
    if (usedCount > 0) {
      onNotify(
        'error',
        `Kategori "${cat.name}" sedang digunakan oleh ${usedCount} buku dan tidak dapat dihapus.`
      );
      return;
    }
    await deleteCategory(cat.id);
    onNotify('success', `Kategori "${cat.name}" berhasil dihapus.`);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveLibrarySettings({
      libraryName: libName,
      tagline: libTagline,
      heroTitle,
      heroDescription,
      allowGuestDownload,
      itemsPerPage: Number(itemsPerPage) || 12,
    });
    onNotify('success', 'Pengaturan perpustakaan berhasil disimpan ke Cloud Firestore.');
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUid.trim() || !newAdminEmail.trim()) return;
    await addAdminUid(newAdminUid.trim(), newAdminEmail.trim(), newAdminName.trim() || 'Admin');
    setNewAdminUid('');
    setNewAdminEmail('');
    setNewAdminName('');
    onNotify('success', 'Administrator baru berhasil ditambahkan.');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilterCategory('Semua');
    setFilterYear('Semua');
    setFilterFormat('all');
    setFilterStatus('all');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="lg:hidden bg-[#0F2342] text-white px-4 py-3 flex items-center justify-between">
        <span className="font-editorial font-bold text-base">Admin — {settings.libraryName}</span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center"
          aria-label="Toggle sidebar admin"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Admin Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:flex w-full lg:w-64 bg-[#0F2342] text-white shrink-0 flex-col justify-between`}
      >
        <div className="p-5">
          <div className="pb-5 mb-5 border-b border-white/10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300 mb-1">
              Panel Pengelola
            </p>
            <h1 className="font-editorial text-lg font-bold leading-snug">{settings.libraryName}</h1>
            <p className="text-xs text-slate-300 mt-1 truncate">{currentUser.email}</p>
          </div>

          <nav className="space-y-1" aria-label="Navigasi Dashboard Admin">
            {sidebarLinks.map((item) => {
              const active = section === item.id && !editingBook;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    if (item.id !== 'add') setEditingBook(null);
                    setSelectedIds(new Set());
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-500/20 text-white border border-sky-400/30'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span className="text-xs font-mono tabular-nums text-sky-200">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-sky-200 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Lihat Halaman Publik
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        {/* Top Context Header */}
        <div className="pb-5 mb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Admin / {editingBook ? 'Edit Buku' : sidebarLinks.find((l) => l.id === section)?.label}
            </p>
            <h2 className="font-editorial text-2xl font-bold text-[#0F2342] mt-0.5">
              {editingBook
                ? `Edit: ${editingBook.title}`
                : sidebarLinks.find((l) => l.id === section)?.label}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedDemo}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 whitespace-nowrap"
            >
              <Database className="w-4 h-4 text-sky-700" />
              {seeding ? 'Menyinkronkan...' : 'Sinkronkan Data Demo'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingBook(null);
                setSection('add');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4 text-sky-300" />
              Tambah Buku
            </button>
          </div>
        </div>

        {/* SECTION: OVERVIEW */}
        {section === 'overview' && !editingBook && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatTile label="Total Seluruh Buku" value={metrics.totalBooks} />
              <StatTile label="Buku Tayang" value={metrics.published} accent="sky" />
              <StatTile label="Buku Disembunyikan" value={metrics.hidden} />
              <StatTile label="Total Kategori" value={metrics.totalCategories} />
              <StatTile label="Total Pembaca" value={metrics.totalViews} />
              <StatTile label="Total Download" value={metrics.totalDownloads} accent="sky" />
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setSection('add')}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-400 transition-colors"
              >
                <PlusCircle className="w-5 h-5 text-sky-700 mb-2" />
                <p className="text-sm font-semibold text-[#0F2342]">Tambah Buku Baru</p>
                <p className="text-xs text-slate-500 mt-0.5">Input katalog & verifikasi link PDF/Drive</p>
              </button>
              <button
                type="button"
                onClick={() => setSection('import')}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-400 transition-colors"
              >
                <Upload className="w-5 h-5 text-sky-700 mb-2" />
                <p className="text-sm font-semibold text-[#0F2342]">Import Web / CSV / XLSX</p>
                <p className="text-xs text-slate-500 mt-0.5">Ambil e-book dari URL web atau unggah CSV/XLSX</p>
              </button>
              <button
                type="button"
                onClick={() => setSection('export')}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-400 transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-sky-700 mb-2" />
                <p className="text-sm font-semibold text-[#0F2342]">Export Koleksi</p>
                <p className="text-xs text-slate-500 mt-0.5">Unduh laporan lengkap Excel atau CSV</p>
              </button>
              <button
                type="button"
                onClick={() => setSection('categories')}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-400 transition-colors"
              >
                <FolderTree className="w-5 h-5 text-sky-700 mb-2" />
                <p className="text-sm font-semibold text-[#0F2342]">Kelola Kategori</p>
                <p className="text-xs text-slate-500 mt-0.5">Atur {metrics.totalCategories} klasifikasi subjek</p>
              </button>
            </div>

            {books.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <h3 className="font-editorial text-xl font-bold text-[#0F2342] mb-2">
                  Database Cloud Firestore Masih Kosong
                </h3>
                <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6">
                  Tambahkan buku pertama Anda secara manual, impor melalui CSV/XLSX, atau muat 8 koleksi demo beserta 10 kategori awal langsung ke Cloud Firestore.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    disabled={seeding}
                    onClick={handleSeedDemo}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                  >
                    <Database className="w-4 h-4 text-sky-300" />
                    {seeding ? 'Memuat Data Demo...' : 'Sinkronkan Data Demo ke Firestore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection('add')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                  >
                    <PlusCircle className="w-4 h-4 text-sky-700" />
                    Tambah Buku Manual
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#0F2342]">Buku Terbaru Ditambahkan</h3>
                    <button
                      type="button"
                      onClick={() => setSection('books')}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Kelola Semua
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {books.slice(0, 5).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setAdminDetailBook(b)}
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{b.title}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {b.author} · {b.category}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            b.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {b.status === 'published' ? 'Tayang' : 'Disembunyikan'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#0F2342]">Paling Sering Dibaca</h3>
                    <button
                      type="button"
                      onClick={() => setSection('stats')}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Detail Statistik
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {topViewedBooks.slice(0, 5).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setAdminDetailBook(b)}
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{b.title}</p>
                          <p className="text-xs text-slate-500 truncate">{b.author}</p>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-semibold text-[#0F2342] shrink-0">
                          {b.viewsCount.toLocaleString('id-ID')} pembaca
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#0F2342]">Paling Banyak Diunduh</h3>
                    <button
                      type="button"
                      onClick={() => setSection('stats')}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Lihat Statistik
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {topDownloadedBooks.slice(0, 5).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setAdminDetailBook(b)}
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{b.title}</p>
                          <p className="text-xs text-slate-500 truncate">{b.author}</p>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-semibold text-sky-700 shrink-0">
                          {b.downloadsCount.toLocaleString('id-ID')} unduhan
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION: MANAJEMEN BUKU & BUKU DISEMBUNYIKAN */}
        {(section === 'books' || section === 'hidden') && !editingBook && (
          <div className="space-y-5">
            {/* Search & Filter Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari judul, penulis, penerbit, kode buku, atau ISBN..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Semua">Semua Kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Semua">Semua Tahun</option>
                  {availableYears.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>

                <select
                  value={filterFormat}
                  onChange={(e) => setFilterFormat(e.target.value as 'all' | BookFileFormat)}
                  className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="all">Semua Format</option>
                  <option value="PDF">PDF</option>
                  <option value="DRIVE_PDF">Google Drive</option>
                  <option value="EPUB">EPUB</option>
                  <option value="EXTERNAL">Eksternal</option>
                </select>

                {section === 'books' && (
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(e.target.value as 'all' | 'published' | 'hidden')
                    }
                    className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="all">Semua Status</option>
                    <option value="published">Tayang</option>
                    <option value="hidden">Disembunyikan</option>
                  </select>
                )}

                {(searchTerm ||
                  filterCategory !== 'Semua' ||
                  filterYear !== 'Semua' ||
                  filterFormat !== 'all' ||
                  filterStatus !== 'all') && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Reset
                  </button>
                )}

                <div className="flex items-center gap-2 lg:pl-2 lg:border-l border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSection('import')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-700" />
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection('export')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                    Export
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
              <div className="bg-[#0F2342] text-white rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium tabular-nums">
                    <CheckSquare className="w-4 h-4 inline mr-1.5 text-sky-300" />
                    <strong>{selectedIds.size}</strong> buku dipilih
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[11px] text-sky-200 hover:text-white underline underline-offset-2"
                  >
                    Batal pilih
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkAction('edit_selected')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-[#0F2342] rounded-lg hover:bg-sky-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {selectedIds.size === 1 ? 'Edit Buku' : 'Edit Massal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('publish')}
                    className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400"
                  >
                    Tayangkan Terpilih
                  </button>
                  {section !== 'hidden' && (
                    <button
                      type="button"
                      onClick={() => handleBulkAction('hide')}
                      className="px-3 py-1.5 text-xs font-semibold bg-white/15 text-white rounded-lg hover:bg-white/25"
                    >
                      Hide Terpilih
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleBulkAction('export_xlsx')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white/15 text-white rounded-lg hover:bg-white/25"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('export_csv')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white/15 text-white rounded-lg hover:bg-white/25"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('delete')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Terpilih
                  </button>
                </div>
              </div>
            )}

            {/* Books Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filteredBooks.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-600">
                  {section === 'hidden'
                    ? 'Tidak ada buku yang sedang disembunyikan.'
                    : 'Tidak ada buku yang cocok dengan kriteria pencarian atau filter.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            aria-label="Pilih semua buku"
                            checked={
                              filteredBooks.length > 0 &&
                              filteredBooks.every((b) => selectedIds.has(b.id))
                            }
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold">Buku</th>
                        <th className="px-4 py-3 font-semibold">Kategori</th>
                        <th className="px-4 py-3 font-semibold">Tahun</th>
                        <th className="px-4 py-3 font-semibold">Format</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Pembaca</th>
                        <th className="px-4 py-3 font-semibold text-right">Unduhan</th>
                        <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedAdminBooks.map((book) => {
                        const checked = selectedIds.has(book.id);
                        return (
                          <tr key={book.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                aria-label={`Pilih ${book.title}`}
                                onChange={() => {
                                  const next = new Set(selectedIds);
                                  if (next.has(book.id)) next.delete(book.id);
                                  else next.add(book.id);
                                  setSelectedIds(next);
                                }}
                                className="w-4 h-4 rounded border-slate-300"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3 min-w-[220px]">
                                <div className="w-9 shrink-0">
                                  <BookCover
                                    coverUrl={book.coverUrl}
                                    fileUrl={book.fileUrl}
                                    fileFormat={book.fileFormat}
                                    title={book.title}
                                    author={book.author}
                                    category={book.category}
                                    size="sm"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setAdminDetailBook(book)}
                                    className="font-semibold text-slate-900 hover:text-sky-700 truncate max-w-[240px] block text-left"
                                  >
                                    {book.title}
                                  </button>
                                  <p className="text-slate-500 truncate max-w-[240px]">
                                    {book.author} · <span className="font-mono">{book.bookCode}</span>
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                              {book.category}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                              {book.year}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                              {book.fileFormat}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  book.status === 'published'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {book.status === 'published' ? 'Tayang' : 'Disembunyikan'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                              {book.viewsCount.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                              {book.downloadsCount.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Detail Admin"
                                  onClick={() => setAdminDetailBook(book)}
                                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Edit Buku"
                                  onClick={() => setEditingBook(book)}
                                  className="p-2 rounded-lg border border-slate-200 text-sky-700 hover:bg-sky-50"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title={book.status === 'published' ? 'Sembunyikan' : 'Tayangkan'}
                                  onClick={() => handleToggleVisibility(book)}
                                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 text-amber-800 hover:bg-amber-50 whitespace-nowrap"
                                >
                                  {book.status === 'published' ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span className="hidden xl:inline">Hide</span>
                                    </>
                                  ) : (
                                    <>
                                      <BookOpen className="w-3.5 h-3.5" />
                                      <span>Tayangkan</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  title="Hapus Permanen"
                                  onClick={() =>
                                    setConfirmDelete({ ids: [book.id], label: book.title })
                                  }
                                  className="p-2 rounded-lg border border-slate-200 text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {adminTotalPages > 1 && (
                <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span className="tabular-nums">
                    Halaman <strong>{currentAdminPage}</strong> dari{' '}
                    <strong>{adminTotalPages}</strong> ({filteredBooks.length} buku)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentAdminPage <= 1}
                      onClick={() => setAdminTablePage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={currentAdminPage >= adminTotalPages}
                      onClick={() => setAdminTablePage((p) => Math.min(adminTotalPages, p + 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION: TAMBAH / EDIT BUKU */}
        {(section === 'add' || editingBook) && (
          <BookFormPanel
            key={editingBook?.id || 'new-book'}
            initialBook={editingBook}
            categories={categories}
            onSubmit={handleSaveBook}
            onCancel={editingBook ? () => setEditingBook(null) : undefined}
            onNotify={onNotify}
          />
        )}

        {/* SECTION: KATEGORI */}
        {section === 'categories' && !editingBook && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveCategory}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit"
            >
              <h3 className="font-editorial text-lg font-bold text-[#0F2342]">
                {editingCat ? 'Edit Kategori' : 'Tambah Kategori Baru'}
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Kategori *
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Contoh: Teknologi"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Deskripsi Singkat (Opsional)
                </label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Keterangan cakupan kategori..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                >
                  {editingCat ? 'Simpan Perubahan' : 'Tambah Kategori'}
                </button>
                {editingCat && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCat(null);
                      setCatName('');
                      setCatDesc('');
                    }}
                    className="px-3 py-2.5 text-xs font-medium border border-slate-300 rounded-lg"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>

            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-[#0F2342]">
                  Daftar Kategori ({categories.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {categories.map((cat) => {
                  const usedCount = categoryUsageCounts.get(cat.name) || 0;
                  return (
                    <div
                      key={cat.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{cat.name}</p>
                          <span className="text-xs font-mono text-slate-500 tabular-nums">
                            · {usedCount} buku
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCat(cat);
                            setCatName(cat.name);
                            setCatDesc(cat.description || '');
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-sky-700 border border-slate-200 rounded-lg hover:bg-sky-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={usedCount > 0}
                          title={
                            usedCount > 0
                              ? 'Kategori masih digunakan oleh buku'
                              : 'Hapus kategori'
                          }
                          className="px-3 py-1.5 text-xs font-medium text-red-700 border border-slate-200 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SECTION: IMPORT / EXPORT */}
        {section === 'import' && !editingBook && (
          <ImportExportPanel
            mode="import"
            books={books}
            categories={categories}
            onNotify={onNotify}
          />
        )}
        {section === 'export' && !editingBook && (
          <ImportExportPanel
            mode="export"
            books={books}
            categories={categories}
            onNotify={onNotify}
          />
        )}

        {/* SECTION: STATISTIK */}
        {section === 'stats' && !editingBook && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatTile label="Total Buku" value={metrics.totalBooks} />
              <StatTile label="Total Pembaca" value={metrics.totalViews} accent="sky" />
              <StatTile label="Total Download" value={metrics.totalDownloads} accent="sky" />
              <StatTile label="Buku Rekomendasi" value={metrics.recommended} />
              <StatTile
                label="Rata-rata Unduh / Buku"
                value={books.length ? Math.round(metrics.totalDownloads / books.length) : 0}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Category Distribution */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="font-editorial text-lg font-bold text-[#0F2342] mb-4">
                  Distribusi Buku, Pembaca & Unduhan per Kategori
                </h3>
                <div className="space-y-3.5">
                  {categoryBreakdown.map((cat) => {
                    const pct = books.length > 0 ? Math.round((cat.count / books.length) * 100) : 0;
                    return (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-slate-800">{cat.name}</span>
                          <span className="font-mono tabular-nums text-slate-600">
                            {cat.count} buku ({pct}%) · {cat.views.toLocaleString('id-ID')} baca ·{' '}
                            {cat.downloads.toLocaleString('id-ID')} unduh
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0F2342] rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Format & Status Summary */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-editorial text-lg font-bold text-[#0F2342] mb-4">
                    Distribusi Format File
                  </h3>
                  <div className="space-y-3">
                    {formatBreakdown.map((item) => {
                      const pct =
                        books.length > 0 ? Math.round((item.count / books.length) * 100) : 0;
                      return (
                        <div key={item.format} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono font-semibold text-slate-800">
                              {item.format}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {item.count} buku ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-sky-600 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-editorial text-lg font-bold text-[#0F2342] mb-3">
                    Ringkasan Status Publikasi
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-xs text-emerald-800">Tayang Publik</p>
                      <p className="text-xl font-bold text-emerald-900 tabular-nums mt-0.5">
                        {metrics.published}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-800">Disembunyikan</p>
                      <p className="text-xl font-bold text-amber-900 tabular-nums mt-0.5">
                        {metrics.hidden}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Leaderboards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-[#0F2342]">Peringkat Buku Paling Populer</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {topViewedBooks.map((b, i) => (
                    <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono tabular-nums text-slate-400 w-5">{i + 1}.</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{b.title}</p>
                          <p className="text-slate-500 truncate">{b.author}</p>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-[#0F2342] shrink-0">
                        {b.viewsCount.toLocaleString('id-ID')} baca
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-[#0F2342]">Peringkat Buku Paling Banyak Diunduh</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {topDownloadedBooks.map((b, i) => (
                    <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono tabular-nums text-slate-400 w-5">{i + 1}.</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{b.title}</p>
                          <p className="text-slate-500 truncate">{b.author}</p>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-sky-700 shrink-0">
                        {b.downloadsCount.toLocaleString('id-ID')} unduh
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: PENGATURAN */}
        {section === 'settings' && !editingBook && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveSettings}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h3 className="font-editorial text-lg font-bold text-[#0F2342] pb-3 border-b border-slate-200">
                Identitas & Konfigurasi Perpustakaan
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Aplikasi Perpustakaan
                </label>
                <input
                  type="text"
                  required
                  value={libName}
                  onChange={(e) => setLibName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tagline</label>
                <input
                  type="text"
                  required
                  value={libTagline}
                  onChange={(e) => setLibTagline(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Judul Hero Beranda
                </label>
                <input
                  type="text"
                  required
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Deskripsi Hero Beranda
                </label>
                <textarea
                  rows={3}
                  required
                  value={heroDescription}
                  onChange={(e) => setHeroDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jumlah Buku per Halaman
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={48}
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowGuestDownload}
                      onChange={(e) => setAllowGuestDownload(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Izinkan unduhan oleh pengunjung umum
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                >
                  <Download className="w-4 h-4 text-sky-300" />
                  Simpan Pengaturan
                </button>
              </div>
            </form>

            {/* Admin Access Management */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4 h-fit">
              <h3 className="font-editorial text-lg font-bold text-[#0F2342] pb-3 border-b border-slate-200">
                Hak Akses Administrator
              </h3>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <p className="text-slate-500">Admin Utama Terdaftar:</p>
                <p className="font-mono text-slate-900 mt-0.5">{BOOTSTRAPPED_ADMIN_EMAIL}</p>
              </div>

              {isBootstrappedAdmin && (
                <form onSubmit={handleAddAdmin} className="space-y-2.5 pt-2">
                  <p className="text-xs font-semibold text-slate-700">Tambah Admin Tambahan (via UID Firebase)</p>
                  <input
                    type="text"
                    required
                    value={newAdminUid}
                    onChange={(e) => setNewAdminUid(e.target.value)}
                    placeholder="Firebase User UID"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="Email Google"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="Nama Pengelola"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 text-xs font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                  >
                    Tambahkan Admin
                  </button>
                </form>
              )}

              {admins.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Daftar Admin Tambahan</p>
                  {admins.map((adm) => (
                    <div
                      key={adm.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{adm.name}</p>
                        <p className="text-slate-500 truncate">{adm.email}</p>
                      </div>
                      {isBootstrappedAdmin && (
                        <button
                          type="button"
                          onClick={() => removeAdminUid(adm.id)}
                          className="text-red-700 hover:underline shrink-0"
                        >
                          Cabut
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Dedicated Admin Book Detail Modal */}
      {adminDetailBook && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-xl my-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  ID Dokumen: {adminDetailBook.id} · Kode: {adminDetailBook.bookCode}
                </p>
                <h3 className="font-editorial text-lg font-bold text-[#0F2342]">
                  Detail Lengkap Buku (Admin)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAdminDetailBook(null)}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                aria-label="Tutup detail admin"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
              <div className="md:col-span-4">
                <BookCover
                  coverUrl={adminDetailBook.coverUrl}
                  fileUrl={adminDetailBook.fileUrl}
                  fileFormat={adminDetailBook.fileFormat}
                  title={adminDetailBook.title}
                  author={adminDetailBook.author}
                  category={adminDetailBook.category}
                  isDemo={adminDetailBook.isDemo}
                  size="lg"
                />
              </div>
              <div className="md:col-span-8 space-y-4">
                <div>
                  <h4 className="font-editorial text-2xl font-bold text-[#0F2342]">
                    {adminDetailBook.title}
                  </h4>
                  <p className="text-sm text-slate-700 mt-1">{adminDetailBook.author}</p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-xs py-3 border-y border-slate-200">
                  <div>
                    <dt className="text-slate-500">Penerbit</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">{adminDetailBook.publisher}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tahun & ISBN</dt>
                    <dd className="font-mono text-slate-900 mt-0.5">
                      {adminDetailBook.year} · {adminDetailBook.isbn || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Kategori</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">{adminDetailBook.category}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Status & Rekomendasi</dt>
                    <dd className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                      <span
                        className={
                          adminDetailBook.status === 'published'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }
                      >
                        {adminDetailBook.status === 'published' ? 'Tayang' : 'Disembunyikan'}
                      </span>
                      {adminDetailBook.recommended && (
                        <span className="inline-flex items-center gap-0.5 text-sky-700">
                          · <Star className="w-3 h-3 fill-current" /> Rekomendasi
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Format & Ukuran</dt>
                    <dd className="font-mono text-slate-900 mt-0.5">
                      {adminDetailBook.fileFormat} {adminDetailBook.fileSize ? `(${adminDetailBook.fileSize})` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Statistik</dt>
                    <dd className="font-mono tabular-nums text-slate-900 mt-0.5">
                      {adminDetailBook.viewsCount} pembaca · {adminDetailBook.downloadsCount} unduh
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">URL Berkas</dt>
                    <dd className="font-mono text-[11px] text-slate-700 break-all mt-0.5">
                      {adminDetailBook.fileUrl}
                    </dd>
                  </div>
                </dl>

                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Sinopsis</p>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {adminDetailBook.description}
                  </p>
                </div>

                <div className="pt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = adminDetailBook;
                      setAdminDetailBook(null);
                      onInspectBook(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-300" />
                    Buka di Pembaca Publik
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = adminDetailBook;
                      setAdminDetailBook(null);
                      setEditingBook(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Informasi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(adminDetailBook)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                  >
                    {adminDetailBook.status === 'published' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Sembunyikan
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-3.5 h-3.5" />
                        Tayangkan
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDelete({
                        ids: [adminDetailBook.id],
                        label: adminDetailBook.title,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="font-editorial text-xl font-bold text-[#0F2342] mb-2">
              Konfirmasi Penghapusan Permanen
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              Anda akan menghapus <strong>{confirmDelete.label}</strong> secara permanen dari Cloud Firestore. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmBulkEdit}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#0F2342]">
                  Edit Massal ({selectedIds.size} Buku)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Centang bidang yang ingin diperbarui sekaligus pada semua buku terpilih.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                aria-label="Tutup edit massal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Category */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyCategory}
                    onChange={(e) => setBulkApplyCategory(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Ubah Kategori
                </label>
                {bulkApplyCategory && (
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Year */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyYear}
                    onChange={(e) => setBulkApplyYear(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Ubah Tahun Terbit
                </label>
                {bulkApplyYear && (
                  <input
                    type="number"
                    min={1000}
                    max={2100}
                    value={bulkYear}
                    onChange={(e) => setBulkYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                  />
                )}
              </div>

              {/* Status */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyStatus}
                    onChange={(e) => setBulkApplyStatus(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Ubah Status Publikasi
                </label>
                {bulkApplyStatus && (
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value as 'published' | 'hidden')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="published">Tayang (Publik)</option>
                    <option value="hidden">Disembunyikan</option>
                  </select>
                )}
              </div>

              {/* Recommended */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyRecommended}
                    onChange={(e) => setBulkApplyRecommended(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Ubah Status Rekomendasi Pilihan
                </label>
                {bulkApplyRecommended && (
                  <select
                    value={bulkRecommended ? 'yes' : 'no'}
                    onChange={(e) => setBulkRecommended(e.target.value === 'yes')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="yes">Tandai sebagai Rekomendasi Pilihan</option>
                    <option value="no">Hapus dari Rekomendasi Pilihan</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={bulkSaving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] disabled:opacity-60"
              >
                {bulkSaving ? 'Menyimpan...' : 'Terapkan ke Buku Terpilih'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: number; accent?: 'sky' }> = ({
  label,
  value,
  accent,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
    <p
      className={`text-2xl font-bold tabular-nums ${
        accent === 'sky' ? 'text-sky-700' : 'text-[#0F2342]'
      }`}
    >
      {value.toLocaleString('id-ID')}
    </p>
  </div>
);
