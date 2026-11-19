import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import type { Book, Category, SortOption } from '../types/library';
import { BookCard } from './BookCard';

interface CatalogViewProps {
  mode: 'catalog' | 'categories';
  books: Book[];
  categories: Category[];
  searchQuery: string;
  selectedCategory: string;
  sortBy: SortOption;
  itemsPerPage: number;
  favoriteIds: Set<string>;
  onSearchChange: (q: string) => void;
  onCategoryChange: (cat: string) => void;
  onSortChange: (sort: SortOption) => void;
  onToggleFavorite: (book: Book) => void;
  onOpenDetail: (book: Book) => void;
  onReadNow: (book: Book) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  mode,
  books,
  categories,
  searchQuery,
  selectedCategory,
  sortBy,
  itemsPerPage,
  favoriteIds,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onToggleFavorite,
  onOpenDetail,
  onReadNow,
}) => {
  const [page, setPage] = useState(1);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      counts.set(b.category, (counts.get(b.category) || 0) + 1);
    }
    return counts;
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = books.filter((b) => {
      const catMatch = selectedCategory === 'Semua' || b.category === selectedCategory;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.publisher.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        (b.isbn || '').toLowerCase().includes(q) ||
        b.bookCode.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'popular') return b.viewsCount - a.viewsCount;
      if (sortBy === 'most_downloaded') return b.downloadsCount - a.downloadsCount;
      if (sortBy === 'az') return a.title.localeCompare(b.title, 'id');
      return b.year - a.year || b.createdAt - a.createdAt;
    });

    return list;
  }, [books, searchQuery, selectedCategory, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedBooks = filteredBooks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleReset = () => {
    onSearchChange('');
    onCategoryChange('Semua');
    onSortChange('newest');
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="pb-6 mb-8 border-b border-slate-200">
        <h1 className="font-editorial text-3xl font-bold text-[#0F2342]">
          {mode === 'categories' ? 'Kategori Koleksi Buku' : 'Semua Koleksi Buku'}
        </h1>
        <p className="text-sm text-slate-600 mt-1.5">
          {mode === 'categories'
            ? 'Jelajahi koleksi berdasarkan klasifikasi subjek dan disiplin ilmu.'
            : 'Cari berdasarkan judul, penulis, penerbit, kategori, atau ISBN secara real-time.'}
        </p>
      </div>

      {/* Category Overview Cards when on Kategori tab */}
      {mode === 'categories' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <button
            type="button"
            onClick={() => {
              onCategoryChange('Semua');
              setPage(1);
            }}
            className={`text-left p-4 rounded-xl border transition-colors ${
              selectedCategory === 'Semua'
                ? 'bg-[#0F2342] text-white border-[#0F2342]'
                : 'bg-white text-slate-900 border-slate-200 hover:border-sky-400'
            }`}
          >
            <p className="text-sm font-semibold">Semua Kategori</p>
            <p className={`text-xs mt-1 tabular-nums ${selectedCategory === 'Semua' ? 'text-sky-200' : 'text-slate-500'}`}>
              {books.length} buku
            </p>
          </button>
          {categories.map((cat) => {
            const active = selectedCategory === cat.name;
            const count = categoryCounts.get(cat.name) || 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  onCategoryChange(cat.name);
                  setPage(1);
                }}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  active
                    ? 'bg-[#0F2342] text-white border-[#0F2342]'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-sky-400'
                }`}
              >
                <p className="text-sm font-semibold truncate">{cat.name}</p>
                <p className={`text-xs mt-1 tabular-nums ${active ? 'text-sky-200' : 'text-slate-500'}`}>
                  {count} buku
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setPage(1);
            }}
            placeholder="Cari judul, penulis, penerbit, kategori, atau ISBN..."
            aria-label="Filter koleksi buku"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              setPage(1);
            }}
            aria-label="Filter kategori"
            className="px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="Semua">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              onSortChange(e.target.value as SortOption);
              setPage(1);
            }}
            aria-label="Urutkan buku"
            className="px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-sky-600"
          >
            <option value="newest">Terbaru</option>
            <option value="popular">Terpopuler</option>
            <option value="most_downloaded">Paling Banyak Diunduh</option>
            <option value="az">Judul A - Z</option>
          </select>

          {(searchQuery || selectedCategory !== 'Semua' || sortBy !== 'newest') && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-5">
        <span className="tabular-nums">
          Menampilkan <strong>{paginatedBooks.length}</strong> dari <strong>{filteredBooks.length}</strong> buku
        </span>
        {totalPages > 1 && (
          <span className="tabular-nums">
            Halaman {currentPage} dari {totalPages}
          </span>
        )}
      </div>

      {/* Empty Search State */}
      {filteredBooks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center">
          <h3 className="font-editorial text-xl font-semibold text-[#0F2342] mb-2">
            Buku Tidak Ditemukan
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
            Tidak ada buku yang cocok dengan kata kunci atau filter kategori yang dipilih. Coba kata kunci lain atau atur ulang pencarian.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
          >
            <RotateCcw className="w-4 h-4" />
            Tampilkan Semua Buku
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {paginatedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                isFavorite={favoriteIds.has(book.id)}
                onToggleFavorite={onToggleFavorite}
                onOpenDetail={onOpenDetail}
                onReadNow={onReadNow}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
                Sebelumnya
              </button>
              {(() => {
                const pages: Array<number | 'ellipsis'> = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push('ellipsis');
                  const start = Math.max(2, currentPage - 1);
                  const end = Math.min(totalPages - 1, currentPage + 1);
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (currentPage < totalPages - 2) pages.push('ellipsis');
                  pages.push(totalPages);
                }
                return pages.map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-2 text-xs text-slate-400">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={`w-9 h-9 text-xs font-semibold rounded-lg tabular-nums transition-colors ${
                        item === currentPage
                          ? 'bg-[#0F2342] text-white'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item}
                    </button>
                  )
                );
              })()}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
              >
                Berikutnya
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
