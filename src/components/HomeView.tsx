import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Book, Category } from '../types/library';
import { BookCard } from './BookCard';

interface HomeViewProps {
  books: Book[];
  categories: Category[];
  favoriteIds: Set<string>;
  usingDemoFallback: boolean;
  loading: boolean;
  onToggleFavorite: (book: Book) => void;
  onOpenDetail: (book: Book) => void;
  onReadNow: (book: Book) => void;
  onBrowseCatalog: (opts?: { category?: string; sort?: 'newest' | 'popular' | 'most_downloaded' | 'az' }) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  books,
  categories,
  favoriteIds,
  usingDemoFallback,
  loading,
  onToggleFavorite,
  onOpenDetail,
  onReadNow,
  onBrowseCatalog,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  const newestBooks = useMemo(
    () => [...books].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt).slice(0, 4),
    [books]
  );

  const popularBooks = useMemo(
    () => [...books].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 4),
    [books]
  );

  const mostDownloadedBooks = useMemo(
    () => [...books].sort((a, b) => b.downloadsCount - a.downloadsCount).slice(0, 4),
    [books]
  );

  const recommendedBooks = useMemo(() => {
    const flagged = books.filter((b) => b.recommended);
    return (flagged.length >= 4 ? flagged : books).slice(0, 4);
  }, [books]);

  const categoryBooks = useMemo(() => {
    if (selectedCategory === 'Semua') return books.slice(0, 8);
    return books.filter((b) => b.category === selectedCategory).slice(0, 8);
  }, [books, selectedCategory]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="aspect-[3/4] bg-slate-100 rounded-lg mb-4" />
              <div className="h-3 w-20 bg-slate-100 rounded mb-2" />
              <div className="h-5 w-4/5 bg-slate-100 rounded mb-2" />
              <div className="h-4 w-1/2 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
      {usingDemoFallback && (
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-[#0F2342]">
            Menampilkan <strong>koleksi demo awal</strong> agar katalog langsung dapat dijelajahi. Login sebagai Admin untuk menyinkronkan data ke Cloud Firestore atau menambahkan koleksi baru.
          </p>
          <button
            type="button"
            onClick={() => onBrowseCatalog()}
            className="text-xs font-semibold text-sky-800 hover:text-[#0F2342] whitespace-nowrap shrink-0 underline underline-offset-4"
          >
            Lihat Katalog Lengkap
          </button>
        </div>
      )}

      {/* 1. Buku Terbaru */}
      <CollectionSection
        title="Buku Terbaru"
        subtitle="Rilis dan penambahan koleksi terkini dalam katalog digital."
        books={newestBooks}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onOpenDetail={onOpenDetail}
        onReadNow={onReadNow}
        onSeeAll={() => onBrowseCatalog({ sort: 'newest' })}
      />

      {/* 2. Buku Populer */}
      <CollectionSection
        title="Buku Populer"
        subtitle="Koleksi yang paling sering dibaca oleh pengunjung."
        books={popularBooks}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onOpenDetail={onOpenDetail}
        onReadNow={onReadNow}
        onSeeAll={() => onBrowseCatalog({ sort: 'popular' })}
      />

      {/* 3. Buku Paling Banyak Diunduh */}
      <CollectionSection
        title="Paling Banyak Diunduh"
        subtitle="Buku digital favorit pembaca untuk disimpan secara luring."
        books={mostDownloadedBooks}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onOpenDetail={onOpenDetail}
        onReadNow={onReadNow}
        onSeeAll={() => onBrowseCatalog({ sort: 'most_downloaded' })}
      />

      {/* 4. Rekomendasi Buku */}
      <CollectionSection
        title="Rekomendasi Pilihan"
        subtitle="Kurasi bacaan unggulan lintas bidang keilmuan."
        books={recommendedBooks}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onOpenDetail={onOpenDetail}
        onReadNow={onReadNow}
        onSeeAll={() => onBrowseCatalog()}
      />

      {/* 5. Buku Berdasarkan Kategori */}
      <section aria-labelledby="section-kategori">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
          <div>
            <h2 id="section-kategori" className="font-editorial text-2xl sm:text-3xl font-bold text-[#0F2342]">
              Jelajah Berdasarkan Kategori
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Pilih bidang keilmuan untuk menyaring koleksi secara langsung.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onBrowseCatalog({ category: selectedCategory === 'Semua' ? undefined : selectedCategory })
            }
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-[#0F2342] whitespace-nowrap shrink-0"
          >
            Buka di Katalog
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setSelectedCategory('Semua')}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              selectedCategory === 'Semua'
                ? 'bg-white text-[#0F2342] shadow-xs'
                : 'text-slate-600 hover:text-[#0F2342]'
            }`}
          >
            Semua
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedCategory === cat.name
                  ? 'bg-white text-[#0F2342] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F2342]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {categoryBooks.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600 mb-3">
              Belum ada buku pada kategori <strong>{selectedCategory}</strong>.
            </p>
            <button
              type="button"
              onClick={() => setSelectedCategory('Semua')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
            >
              Tampilkan Semua Kategori
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {categoryBooks.map((book) => (
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
        )}
      </section>
    </div>
  );
};

interface CollectionSectionProps {
  title: string;
  subtitle: string;
  books: Book[];
  favoriteIds: Set<string>;
  onToggleFavorite: (book: Book) => void;
  onOpenDetail: (book: Book) => void;
  onReadNow: (book: Book) => void;
  onSeeAll: () => void;
}

const CollectionSection: React.FC<CollectionSectionProps> = ({
  title,
  subtitle,
  books,
  favoriteIds,
  onToggleFavorite,
  onOpenDetail,
  onReadNow,
  onSeeAll,
}) => {
  if (books.length === 0) return null;

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 mb-6 border-b border-slate-200">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#0F2342]">{title}</h2>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-[#0F2342] whitespace-nowrap shrink-0"
        >
          Lihat Semua
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {books.map((book) => (
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
    </section>
  );
};
