import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { CheckCircle2, Info, X, AlertCircle } from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL } from './firebase';
import { DEFAULT_SETTINGS, DEMO_BOOKS, DEMO_CATEGORIES } from './data/demoData';
import {
  addUserFavorite,
  checkUserIsAdmin,
  fetchServerStats,
  loadLocalFavorites,
  removeUserFavorite,
  saveLocalFavorites,
  subscribeAdmins,
  subscribeAllBooksAdmin,
  subscribeCategories,
  subscribePublicBooks,
  subscribeSettings,
  subscribeUserFavorites,
  trackBookMetric,
} from './services/libraryService';
import type {
  AdminUser,
  Book,
  Category,
  LibrarySettings,
  PublicTab,
  SortOption,
  ToastMessage,
  UserFavorite,
} from './types/library';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { HomeView } from './components/HomeView';
import { CatalogView } from './components/CatalogView';
import { FavoritesView } from './components/FavoritesView';
import { BookDetailModal } from './components/BookDetailModal';
import { PdfReaderModal } from './components/PdfReaderModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboard } from './components/admin/AdminDashboard';

function LibraryApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  const [publicBooksRaw, setPublicBooksRaw] = useState<Book[]>([]);
  const [hasFirestoreBooks, setHasFirestoreBooks] = useState(false);
  const [adminBooksRaw, setAdminBooksRaw] = useState<Book[]>([]);
  const [categoriesRaw, setCategoriesRaw] = useState<Category[]>([]);
  const [hasFirestoreCategories, setHasFirestoreCategories] = useState(false);
  const [settings, setSettings] = useState<LibrarySettings>(DEFAULT_SETTINGS);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [serverStats, setServerStats] = useState<Record<string, { views: number; downloads: number }>>({});
  const [favorites, setFavorites] = useState<UserFavorite[]>(() => loadLocalFavorites());

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<PublicTab>('home');
  const [inAdminMode, setInAdminMode] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setCheckingAdmin(true);
        const adminStatus = await checkUserIsAdmin(user);
        setIsAdmin(adminStatus);
        setCheckingAdmin(false);
      } else {
        setIsAdmin(false);
        setInAdminMode(false);
        setFavorites(loadLocalFavorites());
      }
    });
    return unsub;
  }, []);

  // Server persisted view/download stats
  useEffect(() => {
    void fetchServerStats().then(setServerStats);
  }, []);

  // Public Firestore subscriptions
  useEffect(() => {
    const unsubBooks = subscribePublicBooks(
      (items, fromDb) => {
        setPublicBooksRaw(items);
        setHasFirestoreBooks(fromDb);
        setLoadingCatalog(false);
      },
      () => {
        setLoadingCatalog(false);
      }
    );

    const unsubCats = subscribeCategories(
      (items, fromDb) => {
        setCategoriesRaw(items);
        setHasFirestoreCategories(fromDb);
      },
      () => {
        // Fallback to DEMO_CATEGORIES handled cleanly
      }
    );

    const unsubSettings = subscribeSettings(setSettings);

    return () => {
      unsubBooks();
      unsubCats();
      unsubSettings();
    };
  }, []);

  // Admin-only Firestore subscriptions
  useEffect(() => {
    if (!isAdmin || !currentUser) {
      setAdminBooksRaw([]);
      setAdmins([]);
      return;
    }
    const unsubAllBooks = subscribeAllBooksAdmin(setAdminBooksRaw, () => {
      // Logged via handleFirestoreError
    });
    const isBootstrapped =
      currentUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    const unsubAdmins = isBootstrapped ? subscribeAdmins(setAdmins) : () => {};
    return () => {
      unsubAllBooks();
      unsubAdmins();
    };
  }, [isAdmin, currentUser]);

  // Signed-in user favorites sync
  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified) return;
    const unsubFavs = subscribeUserFavorites(currentUser.uid, setFavorites, () => {
      // Keep local favorites fallback if Firestore read fails
    });
    return unsubFavs;
  }, [currentUser?.uid, currentUser?.emailVerified]);

  const usingDemoFallback = !hasFirestoreBooks;

  const mergeStats = useCallback(
    (list: Book[]): Book[] =>
      list.map((b) => {
        const delta = serverStats[b.id];
        if (!delta) return b;
        return {
          ...b,
          viewsCount: b.viewsCount + delta.views,
          downloadsCount: b.downloadsCount + delta.downloads,
        };
      }),
    [serverStats]
  );

  const publicBooks = useMemo(
    () => mergeStats(hasFirestoreBooks ? publicBooksRaw : DEMO_BOOKS),
    [hasFirestoreBooks, publicBooksRaw, mergeStats]
  );

  const adminBooks = useMemo(
    () => mergeStats(adminBooksRaw),
    [adminBooksRaw, mergeStats]
  );

  const categories = useMemo(
    () => (hasFirestoreCategories ? categoriesRaw : DEMO_CATEGORIES),
    [hasFirestoreCategories, categoriesRaw]
  );

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.bookId)), [favorites]);

  const heroStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const newestCount = publicBooks.filter((b) => b.year >= currentYear - 1).length;
    const totalDownloads = publicBooks.reduce((sum, b) => sum + b.downloadsCount, 0);
    return {
      totalBooks: publicBooks.length,
      totalCategories: categories.length,
      newestBooksCount: newestCount,
      totalDownloads,
    };
  }, [publicBooks, categories]);

  const handleToggleFavorite = async (book: Book) => {
    const exists = favoriteIds.has(book.id);
    if (currentUser && currentUser.emailVerified) {
      if (exists) {
        await removeUserFavorite(currentUser.uid, book.id);
        notify('info', `"${book.title}" dihapus dari favorit.`);
      } else {
        await addUserFavorite(currentUser.uid, book);
        notify('success', `"${book.title}" ditambahkan ke favorit.`);
      }
      return;
    }

    const next = exists
      ? favorites.filter((f) => f.bookId !== book.id)
      : [
          {
            bookId: book.id,
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl || '',
            category: book.category,
            addedAt: Date.now(),
          },
          ...favorites,
        ];
    setFavorites(next);
    saveLocalFavorites(next);
    notify(
      exists ? 'info' : 'success',
      exists
        ? `"${book.title}" dihapus dari favorit.`
        : `"${book.title}" disimpan ke daftar favorit.`
    );
  };

  const handleRemoveFavoriteById = async (bookId: string) => {
    if (currentUser && currentUser.emailVerified) {
      await removeUserFavorite(currentUser.uid, bookId);
    } else {
      const next = favorites.filter((f) => f.bookId !== bookId);
      setFavorites(next);
      saveLocalFavorites(next);
    }
    notify('info', 'Buku dihapus dari daftar favorit.');
  };

  const handleRecordView = (book: Book) => {
    setServerStats((prev) => ({
      ...prev,
      [book.id]: {
        views: (prev[book.id]?.views || 0) + 1,
        downloads: prev[book.id]?.downloads || 0,
      },
    }));
    void trackBookMetric(book.id, 'view');
  };

  const handleRecordDownload = (book: Book) => {
    setServerStats((prev) => ({
      ...prev,
      [book.id]: {
        views: prev[book.id]?.views || 0,
        downloads: (prev[book.id]?.downloads || 0) + 1,
      },
    }));
    void trackBookMetric(book.id, 'download');
  };

  const handleOpenReader = (book: Book) => {
    handleRecordView(book);
    setDetailBook(null);
    setReadingBook(book);
  };

  const handleOpenAdmin = () => {
    if (isAdmin) {
      setInAdminMode(true);
    } else {
      setLoginModalOpen(true);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setInAdminMode(false);
    notify('info', 'Berhasil keluar dari akun Administrator.');
  };

  const handleBrowseCatalog = (opts?: { category?: string; sort?: SortOption }) => {
    if (opts?.category) setSelectedCategory(opts.category);
    if (opts?.sort) setSortBy(opts.sort);
    setActiveTab('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Protected Admin Dashboard View
  if (inAdminMode && isAdmin && currentUser) {
    return (
      <>
        <AdminDashboard
          currentUser={currentUser}
          books={adminBooks}
          categories={categoriesRaw.length > 0 ? categoriesRaw : categories}
          settings={settings}
          admins={admins}
          onExitAdmin={() => setInAdminMode(false)}
          onLogout={handleLogout}
          onInspectBook={(book) => setDetailBook(book)}
          onNotify={notify}
        />

        <BookDetailModal
          book={detailBook}
          isFavorite={detailBook ? favoriteIds.has(detailBook.id) : false}
          allowGuestDownload={settings.allowGuestDownload}
          onClose={() => setDetailBook(null)}
          onReadNow={handleOpenReader}
          onToggleFavorite={handleToggleFavorite}
          onDownloaded={handleRecordDownload}
          onNotify={notify}
        />

        <PdfReaderModal
          book={readingBook}
          onClose={() => setReadingBook(null)}
          onDownloaded={handleRecordDownload}
          onNotify={notify}
        />

        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <Header
        libraryName={settings.libraryName}
        activeTab={activeTab}
        favoritesCount={favorites.length}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onNavigate={(tab) => {
          setActiveTab(tab);
          if (tab === 'catalog') setSelectedCategory('Semua');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenAdmin={handleOpenAdmin}
      />

      <main className="flex-1">
        {activeTab === 'home' && (
          <>
            <HeroSection
              settings={settings}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={() => {
                setActiveTab('catalog');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              stats={heroStats}
              onExploreAll={() => handleBrowseCatalog()}
            />
            <HomeView
              books={publicBooks}
              categories={categories}
              favoriteIds={favoriteIds}
              usingDemoFallback={usingDemoFallback}
              loading={loadingCatalog}
              onToggleFavorite={handleToggleFavorite}
              onOpenDetail={(b) => setDetailBook(b)}
              onReadNow={handleOpenReader}
              onBrowseCatalog={handleBrowseCatalog}
            />
          </>
        )}

        {(activeTab === 'catalog' || activeTab === 'categories') && (
          <CatalogView
            mode={activeTab}
            books={publicBooks}
            categories={categories}
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            sortBy={sortBy}
            itemsPerPage={settings.itemsPerPage}
            favoriteIds={favoriteIds}
            onSearchChange={setSearchQuery}
            onCategoryChange={setSelectedCategory}
            onSortChange={setSortBy}
            onToggleFavorite={handleToggleFavorite}
            onOpenDetail={(b) => setDetailBook(b)}
            onReadNow={handleOpenReader}
          />
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            books={publicBooks}
            favorites={favorites}
            isSignedIn={Boolean(currentUser && currentUser.emailVerified)}
            onToggleFavorite={handleToggleFavorite}
            onRemoveFavoriteById={handleRemoveFavoriteById}
            onOpenDetail={(b) => setDetailBook(b)}
            onReadNow={handleOpenReader}
            onBrowseCatalog={() => setActiveTab('catalog')}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
          <div>
            <p className="font-editorial text-sm font-bold text-[#0F2342]">{settings.libraryName}</p>
            <p className="mt-0.5">{settings.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => setActiveTab('home')} className="hover:text-[#0F2342]">
              Beranda
            </button>
            <button type="button" onClick={() => setActiveTab('catalog')} className="hover:text-[#0F2342]">
              Semua Buku
            </button>
            <button type="button" onClick={() => setActiveTab('categories')} className="hover:text-[#0F2342]">
              Kategori
            </button>
            <button type="button" onClick={() => setActiveTab('favorites')} className="hover:text-[#0F2342]">
              Favorit
            </button>
            <button type="button" onClick={handleOpenAdmin} className="font-semibold text-[#0F2342] hover:underline">
              {isAdmin ? 'Dashboard Admin' : 'Login Admin'}
            </button>
          </div>
        </div>
      </footer>

      <BookDetailModal
        book={detailBook}
        isFavorite={detailBook ? favoriteIds.has(detailBook.id) : false}
        allowGuestDownload={settings.allowGuestDownload}
        onClose={() => setDetailBook(null)}
        onReadNow={handleOpenReader}
        onToggleFavorite={handleToggleFavorite}
        onDownloaded={handleRecordDownload}
        onNotify={notify}
      />

      <PdfReaderModal
        book={readingBook}
        onClose={() => setReadingBook(null)}
        onDownloaded={handleRecordDownload}
        onNotify={notify}
      />

      <AdminLoginModal
        open={loginModalOpen}
        currentUser={currentUser}
        isAdmin={isAdmin}
        checkingAdmin={checkingAdmin}
        onClose={() => setLoginModalOpen(false)}
        onEnterDashboard={() => setInAdminMode(true)}
        onNotify={notify}
      />

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  );
}

const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl border shadow-lg text-xs font-medium bg-white ${
            t.type === 'success'
              ? 'border-emerald-200 text-emerald-900'
              : t.type === 'error'
                ? 'border-red-200 text-red-900'
                : 'border-sky-200 text-[#0F2342]'
          }`}
        >
          {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />}
          <span className="flex-1 leading-snug">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Tutup notifikasi"
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <LibraryApp />
    </ErrorBoundary>
  );
}
