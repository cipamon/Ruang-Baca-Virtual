import React, { useState } from 'react';
import { BookMarked, LogIn, Menu, ShieldCheck, X } from 'lucide-react';
import type { PublicTab } from '../types/library';
import type { User } from 'firebase/auth';

interface HeaderProps {
  libraryName: string;
  activeTab: PublicTab;
  favoritesCount: number;
  currentUser: User | null;
  isAdmin: boolean;
  onNavigate: (tab: PublicTab) => void;
  onOpenAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  libraryName,
  activeTab,
  favoritesCount,
  currentUser,
  isAdmin,
  onNavigate,
  onOpenAdmin,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: PublicTab; label: string }[] = [
    { id: 'home', label: 'Beranda' },
    { id: 'catalog', label: 'Semua Buku' },
    { id: 'categories', label: 'Kategori' },
    { id: 'favorites', label: `Favorit (${favoritesCount})` },
  ];

  const handleNavClick = (tab: PublicTab) => {
    onNavigate(tab);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 rounded"
        >
          <span className="w-8 h-8 rounded-lg bg-[#0F2342] text-white flex items-center justify-center shrink-0">
            <BookMarked className="w-4 h-4 text-sky-300" />
          </span>
          <span className="font-editorial text-lg font-bold tracking-tight text-[#0F2342]">
            {libraryName}
          </span>
        </button>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Navigasi Utama">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`py-1.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 ${
                  active
                    ? 'border-[#0F2342] text-[#0F2342]'
                    : 'border-transparent text-slate-600 hover:text-[#0F2342] hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action + Mobile Menu Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#0F2342] text-white hover:bg-[#173361] transition-colors whitespace-nowrap shrink-0"
          >
            {isAdmin ? (
              <>
                <ShieldCheck className="w-4 h-4 text-sky-300" />
                Dashboard Admin
              </>
            ) : currentUser ? (
              <>
                <LogIn className="w-4 h-4 text-sky-300" />
                Akun & Admin
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-sky-300" />
                Login Admin
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-sky-50 text-[#0F2342]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenAdmin();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-[#0F2342] text-white"
            >
              {isAdmin ? 'Dashboard Admin' : 'Login Admin'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
