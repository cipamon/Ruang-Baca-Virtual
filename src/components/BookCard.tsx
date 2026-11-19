import React from 'react';
import { BookOpen, Eye, Heart } from 'lucide-react';
import type { Book } from '../types/library';
import { BookCover } from './BookCover';

interface BookCardProps {
  book: Book;
  isFavorite: boolean;
  onToggleFavorite: (book: Book) => void;
  onOpenDetail: (book: Book) => void;
  onReadNow: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  isFavorite,
  onToggleFavorite,
  onOpenDetail,
  onReadNow,
}) => {
  return (
    <article className="group bg-white border border-slate-200 rounded-xl p-4 flex flex-col transition-shadow duration-200 hover:shadow-md">
      <div className="relative mb-3.5">
        <button
          type="button"
          onClick={() => onOpenDetail(book)}
          className="block w-full text-left rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          aria-label={`Lihat detail ${book.title}`}
        >
          <BookCover
            coverUrl={book.coverUrl}
            fileUrl={book.fileUrl}
            fileFormat={book.fileFormat}
            title={book.title}
            author={book.author}
            category={book.category}
            isDemo={book.isDemo}
          />
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(book)}
          aria-label={isFavorite ? `Hapus ${book.title} dari favorit` : `Tambahkan ${book.title} ke favorit`}
          aria-pressed={isFavorite}
          className={`absolute top-2.5 right-2.5 w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
            isFavorite
              ? 'bg-[#0F2342] border-[#0F2342] text-sky-300'
              : 'bg-white/95 border-slate-200 text-slate-600 hover:text-[#0F2342] hover:border-slate-300'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Zero-pill unboxed metadata */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5 truncate">
        <span className="font-medium text-sky-700 truncate">{book.category}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums shrink-0">{book.year}</span>
      </div>

      <h3 className="font-editorial text-base font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
        <button
          type="button"
          onClick={() => onOpenDetail(book)}
          className="text-left hover:text-sky-800 transition-colors"
        >
          {book.title}
        </button>
      </h3>

      <p className="text-sm text-slate-600 truncate mb-4">{book.author}</p>

      <div className="mt-auto pt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenDetail(book)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
        >
          <Eye className="w-3.5 h-3.5" />
          Detail
        </button>
        <button
          type="button"
          onClick={() => onReadNow(book)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] transition-colors whitespace-nowrap"
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-300" />
          Baca
        </button>
      </div>
    </article>
  );
};
