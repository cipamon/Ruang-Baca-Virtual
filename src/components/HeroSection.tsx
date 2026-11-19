import React from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type { LibrarySettings } from '../types/library';

interface HeroSectionProps {
  settings: LibrarySettings;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSearchSubmit: () => void;
  stats: {
    totalBooks: number;
    totalCategories: number;
    newestBooksCount: number;
    totalDownloads: number;
  };
  onExploreAll: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  settings,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  stats,
  onExploreAll,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit();
  };

  return (
    <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        {/* 2-Column Balanced Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-wider uppercase text-sky-700 mb-3">
              {settings.tagline}
            </p>
            <h1 className="font-editorial text-3xl sm:text-4xl lg:text-[2.85rem] font-bold text-[#0F2342] leading-[1.15] tracking-tight mb-4 max-w-2xl">
              {settings.heroTitle}
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-7">
              {settings.heroDescription}
            </p>

            {/* Real-time Search Bar */}
            <form onSubmit={handleSubmit} className="max-w-xl w-full">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Cari judul buku, penulis, penerbit, atau ISBN..."
                    aria-label="Cari buku"
                    className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] transition-colors whitespace-nowrap shrink-0"
                >
                  Cari Koleksi
                  <ArrowRight className="w-4 h-4 text-sky-300" />
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>Akses baca langsung PDF di peramban</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onExploreAll}
                className="font-semibold text-sky-700 hover:text-[#0F2342] underline underline-offset-4"
              >
                Jelajahi Semua Koleksi
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <img
                src="/src/assets/images/hero_library_editorial_1795052966461.jpg"
                alt="Ruang baca digital modern dengan pencahayaan alami"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Collection Statistics Strip */}
        <div className="mt-10 pt-8 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Total Buku</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#0F2342] tabular-nums">
              {stats.totalBooks.toLocaleString('id-ID')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Total Kategori</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#0F2342] tabular-nums">
              {stats.totalCategories.toLocaleString('id-ID')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Buku Terbaru</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#0F2342] tabular-nums">
              {stats.newestBooksCount.toLocaleString('id-ID')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Total Unduhan</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#0F2342] tabular-nums">
              {stats.totalDownloads.toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
