import React, { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { ArrowRight, Check, Copy, LogOut, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, googleProvider } from '../firebase';

interface AdminLoginModalProps {
  open: boolean;
  currentUser: User | null;
  isAdmin: boolean;
  checkingAdmin: boolean;
  onClose: () => void;
  onEnterDashboard: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  open,
  currentUser,
  isAdmin,
  checkingAdmin,
  onClose,
  onEnterDashboard,
  onNotify,
}) => {
  const [loading, setLoading] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onNotify('success', 'Berhasil masuk dengan akun Google.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (!msg.includes('popup-closed-by-user')) {
        onNotify('error', `Autentikasi gagal: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    onNotify('info', 'Anda telah keluar dari akun.');
  };

  const handleCopyUid = async () => {
    if (!currentUser?.uid) return;
    try {
      await navigator.clipboard.writeText(currentUser.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      onNotify('info', `UID Anda: ${currentUser.uid}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-login-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 mb-1">
              Autentikasi Terproteksi
            </p>
            <h2 id="admin-login-title" className="font-editorial text-2xl font-bold text-[#0F2342]">
              Portal Administrator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog login"
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!currentUser ? (
          <>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Masuk menggunakan akun Google yang terdaftar sebagai Administrator untuk mengelola katalog buku, kategori, import/export data, dan pengaturan perpustakaan.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361] transition-colors disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4 text-sky-300" />
              {loading ? 'Memproses Autentikasi...' : 'Masuk dengan Google'}
            </button>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              Pembaca umum juga dapat masuk dengan Google untuk menyinkronkan daftar Favorit antar perangkat secara otomatis.
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="text-xs text-slate-500">Akun Aktif</p>
              <p className="text-sm font-semibold text-slate-900">{currentUser.displayName || 'Pengguna'}</p>
              <p className="text-xs font-mono text-slate-600 break-all">{currentUser.email}</p>
              <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-200/80">
                <span className="text-[11px] font-mono text-slate-500 truncate">
                  UID: {currentUser.uid}
                </span>
                <button
                  type="button"
                  onClick={handleCopyUid}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-[#0F2342] shrink-0"
                >
                  {copiedUid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedUid ? 'Tersalin' : 'Salin UID'}
                </button>
              </div>
            </div>

            {checkingAdmin ? (
              <p className="text-sm text-slate-600">Memeriksa hak akses administrator...</p>
            ) : isAdmin ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-2.5 text-xs text-[#0F2342]">
                  <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                  <span>Akun Anda terverifikasi sebagai Administrator Ruang Baca Virtual.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnterDashboard();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0F2342] rounded-lg hover:bg-[#173361]"
                >
                  Buka Dashboard Admin
                  <ArrowRight className="w-4 h-4 text-sky-300" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p>
                    Akun ini masuk sebagai <strong>Pembaca</strong> (Favorit tersinkronkan ke Cloud Firestore), bukan akun Administrator.
                  </p>
                  <p className="mt-1.5">
                    Untuk membuka Dashboard Admin, klik <strong>Ganti Akun Google</strong> dan masuk dengan akun admin terdaftar (<span className="font-mono">{BOOTSTRAPPED_ADMIN_EMAIL}</span>), atau salin UID Anda di atas untuk didaftarkan oleh Admin utama.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-[#0F2342] bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Ganti Akun Google
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
