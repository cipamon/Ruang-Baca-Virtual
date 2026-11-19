import React from 'react';
import { BookOpen, Heart, Trash2 } from 'lucide-react';
import type { Book, UserFavorite } from '../types/library';
import { BookCard } from './BookCard';

interface FavoritesViewProps {
  books: Book[];
  favorites: UserFavorite[];
  isSignedIn: boolean;
  onToggleFavorite: (book: Book) => void;
  onRemoveFavoriteById: (bookId: string) => void;
  onOpenDetail: (book: Book) => void;
  onReadNow: (book: Book) => void;
  onBrowseCatalog: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  books,
  favorites,
  isSignedIn,
  onToggleFavorite,
  onRemoveFavoriteById,
  onOpenDetail,
  onReadNow,
  onBrowseCatalog,
}) => {
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const matchedBooks = favorites
    .map((f) => ({ fav: f, book: bookMap.get(f.bookId) }))
    .filter((entry) => entry.book !== undefined || entry.fav.bookId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="pb-6 mb-8 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-3xl font-bold text-[#0F2342]">Buku Favorit Saya</h1>
          <p className="text-sm text-slate-600 mt-1.5">
            {isSignedIn
              ? 'Daftar buku favorit tersinkronkan dengan akun Anda di Cloud Firestore.'
              : 'Daftar buku favorit tersimpan secara lokal di peramban perangkat ini.'}
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          Total tersimpan: <strong className="text-[#0F2342]">{favorites.length}</strong> buku
        </span>
      </div>

      {matchedBooks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 text-sky-700">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="font-editorial text-xl font-semibold text-[#0F2342] mb-2">
            Belum Ada Buku Favorit
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            Tandai buku yang ingin Anda simpan dengan menekan ikon hati pada kartu buku atau halaman detail.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
          >
            <BookOpen className="w-4 h-4 text-sky-300" />
            Jelajahi Katalog
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {matchedBooks.map(({ fav, book }) => {
            if (book) {
              return (
                <BookCard
                  key={book.id}
                  book={book}
                  isFavorite={true}
                  onToggleFavorite={onToggleFavorite}
                  onOpenDetail={onOpenDetail}
                  onReadNow={onReadNow}
                />
              );
            }
            return (
              <div
                key={fav.bookId}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <p className="text-xs text-slate-500 mb-1">{fav.category || 'Koleksi'}</p>
                  <h3 className="font-editorial text-base font-semibold text-slate-900 mb-1">{fav.title}</h3>
                  <p className="text-sm text-slate-600 mb-3">{fav.author}</p>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Buku ini saat ini disembunyikan atau tidak lagi tersedia di katalog publik.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFavoriteById(fav.bookId)}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus dari Favorit
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
