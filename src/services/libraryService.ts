import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AdminUser,
  type AutoFillBookResult,
  type Book,
  type BookFileFormat,
  type BookFormData,
  type Category,
  type LibrarySettings,
  type ScrapeEbooksResult,
  type UrlCheckResult,
  type UserFavorite,
} from '../types/library';
import { DEFAULT_SETTINGS, DEMO_BOOKS, DEMO_CATEGORIES } from '../data/demoData';

const LOCAL_FAVORITES_KEY = 'rbv_favorites_v1';

function toMillis(val: unknown, fallback = Date.now()): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && 'seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
    return (val as { seconds: number }).seconds * 1000;
  }
  return fallback;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'kategori'
  );
}

export function generateBookCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RBV-${year}-${rand}`;
}

export function createSafeId(prefix: string): string {
  const raw = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function sanitizeString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.trim().slice(0, maxLen);
}

function sanitizeBookPayload(input: BookFormData, isCreate: boolean) {
  const yearNum = Number(input.year);
  const safeYear = Number.isInteger(yearNum) && yearNum >= 1000 && yearNum <= 2100 ? yearNum : new Date().getFullYear();
  const allowedFormats: BookFileFormat[] = ['PDF', 'EPUB', 'DRIVE_PDF', 'EXTERNAL'];
  const fileFormat: BookFileFormat = allowedFormats.includes(input.fileFormat) ? input.fileFormat : 'PDF';
  const status = input.status === 'hidden' ? 'hidden' : 'published';

  const payload: Record<string, unknown> = {
    bookCode: sanitizeString(input.bookCode, BLUEPRINT_LIMITS.BOOK_CODE_MAX, generateBookCode()) || generateBookCode(),
    title: sanitizeString(input.title, BLUEPRINT_LIMITS.TITLE_MAX, 'Tanpa Judul') || 'Tanpa Judul',
    author: sanitizeString(input.author, BLUEPRINT_LIMITS.AUTHOR_MAX, 'Penulis') || 'Penulis',
    publisher: sanitizeString(input.publisher, BLUEPRINT_LIMITS.PUBLISHER_MAX, 'Pustaka Digital') || 'Pustaka Digital',
    year: safeYear,
    category: sanitizeString(input.category, BLUEPRINT_LIMITS.CATEGORY_MAX, 'Pengetahuan Umum') || 'Pengetahuan Umum',
    description:
      sanitizeString(input.description, BLUEPRINT_LIMITS.DESCRIPTION_MAX, 'Ringkasan buku belum tersedia.') ||
      'Ringkasan buku belum tersedia.',
    fileUrl: sanitizeString(input.fileUrl, BLUEPRINT_LIMITS.URL_MAX, ''),
    fileFormat,
    status,
    isDemo: Boolean(input.isDemo),
    recommended: Boolean(input.recommended),
    viewsCount: Math.max(0, Math.floor(Number(input.viewsCount ?? 0) || 0)),
    downloadsCount: Math.max(0, Math.floor(Number(input.downloadsCount ?? 0) || 0)),
    updatedAt: serverTimestamp(),
  };

  const isbn = sanitizeString(input.isbn, BLUEPRINT_LIMITS.ISBN_MAX);
  if (isbn) payload.isbn = isbn;
  const coverUrl = sanitizeString(input.coverUrl, BLUEPRINT_LIMITS.URL_MAX);
  if (coverUrl) payload.coverUrl = coverUrl;
  const fileSize = sanitizeString(input.fileSize, BLUEPRINT_LIMITS.FILE_SIZE_MAX);
  if (fileSize) payload.fileSize = fileSize;

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

function mapDocToBook(id: string, data: Record<string, unknown>): Book {
  return {
    id,
    bookCode: String(data.bookCode || id),
    title: String(data.title || 'Tanpa Judul'),
    author: String(data.author || 'Anonim'),
    publisher: String(data.publisher || '-'),
    year: Number(data.year || 2025),
    isbn: data.isbn ? String(data.isbn) : '',
    category: String(data.category || 'Pengetahuan Umum'),
    description: String(data.description || ''),
    coverUrl: data.coverUrl ? String(data.coverUrl) : '',
    fileUrl: String(data.fileUrl || ''),
    fileFormat: (data.fileFormat as BookFileFormat) || 'PDF',
    fileSize: data.fileSize ? String(data.fileSize) : '',
    status: data.status === 'hidden' ? 'hidden' : 'published',
    isDemo: Boolean(data.isDemo),
    recommended: Boolean(data.recommended),
    viewsCount: Number(data.viewsCount || 0),
    downloadsCount: Number(data.downloadsCount || 0),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export function subscribePublicBooks(
  onData: (books: Book[], fromFirestore: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'books'), where('status', '==', 'published'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => mapDocToBook(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => b.createdAt - a.createdAt);
      onData(items, !snap.empty);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'books');
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAllBooksAdmin(
  onData: (books: Book[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'books'),
    (snap) => {
      const items = snap.docs.map((d) => mapDocToBook(d.id, d.data() as Record<string, unknown>));
      items.sort((a, b) => b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'books');
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeCategories(
  onData: (categories: Category[], fromFirestore: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'categories'),
    (snap) => {
      const items: Category[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          name: String(data.name || ''),
          slug: String(data.slug || d.id),
          description: data.description ? String(data.description) : '',
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
        };
      });
      items.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      onData(items, !snap.empty);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'categories');
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeSettings(onData: (settings: LibrarySettings) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'library'),
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SETTINGS);
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      onData({
        libraryName: String(d.libraryName || DEFAULT_SETTINGS.libraryName),
        tagline: String(d.tagline || DEFAULT_SETTINGS.tagline),
        heroTitle: String(d.heroTitle || DEFAULT_SETTINGS.heroTitle),
        heroDescription: String(d.heroDescription || DEFAULT_SETTINGS.heroDescription),
        allowGuestDownload: d.allowGuestDownload !== false,
        itemsPerPage: Number(d.itemsPerPage || DEFAULT_SETTINGS.itemsPerPage),
        updatedAt: toMillis(d.updatedAt),
      });
    },
    () => {
      onData(DEFAULT_SETTINGS);
    }
  );
}

export async function createBook(input: BookFormData, customId?: string): Promise<string> {
  const id = customId && BLUEPRINT_LIMITS.ID_PATTERN.test(customId) ? customId : createSafeId('book');
  const path = `books/${id}`;
  try {
    const payload = sanitizeBookPayload(input, true);
    await setDoc(doc(db, 'books', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBook(id: string, input: BookFormData): Promise<void> {
  const path = `books/${id}`;
  try {
    const payload = sanitizeBookPayload(input, false);
    await updateDoc(doc(db, 'books', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setBookStatus(id: string, status: 'published' | 'hidden'): Promise<void> {
  const path = `books/${id}`;
  try {
    await updateDoc(doc(db, 'books', id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBook(id: string): Promise<void> {
  const path = `books/${id}`;
  try {
    await deleteDoc(doc(db, 'books', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function bulkUpdateBookStatus(ids: string[], status: 'published' | 'hidden'): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, 'books', id), {
        status,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'books/bulk-status');
  }
}

export async function bulkDeleteBooks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.delete(doc(db, 'books', id));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'books/bulk-delete');
  }
}

export async function saveCategory(name: string, description = '', existingId?: string): Promise<string> {
  const cleanName = sanitizeString(name, BLUEPRINT_LIMITS.CATEGORY_MAX);
  const slug = slugify(cleanName);
  const id = existingId || `cat-${slug}`.slice(0, 120);
  const path = `categories/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'categories', existingId), {
        name: cleanName,
        slug,
        description: sanitizeString(description, BLUEPRINT_LIMITS.CATEGORY_DESC_MAX),
        updatedAt: serverTimestamp(),
      });
      return existingId;
    }
    await setDoc(doc(db, 'categories', id), {
      name: cleanName,
      slug,
      description: sanitizeString(description, BLUEPRINT_LIMITS.CATEGORY_DESC_MAX),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const path = `categories/${id}`;
  try {
    await deleteDoc(doc(db, 'categories', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveLibrarySettings(settings: Omit<LibrarySettings, 'updatedAt'>): Promise<void> {
  const path = 'settings/library';
  try {
    await setDoc(doc(db, 'settings', 'library'), {
      libraryName: sanitizeString(settings.libraryName, 120, DEFAULT_SETTINGS.libraryName),
      tagline: sanitizeString(settings.tagline, 240, DEFAULT_SETTINGS.tagline),
      heroTitle: sanitizeString(settings.heroTitle, 200, DEFAULT_SETTINGS.heroTitle),
      heroDescription: sanitizeString(settings.heroDescription, 500, DEFAULT_SETTINGS.heroDescription),
      allowGuestDownload: Boolean(settings.allowGuestDownload),
      itemsPerPage: Math.min(48, Math.max(6, Math.round(Number(settings.itemsPerPage || 12)))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function seedDemoDataToFirestore(): Promise<{ categoriesCount: number; booksCount: number }> {
  try {
    const existingCatsSnap = await getDocs(collection(db, 'categories'));
    const existingCatNames = new Set(existingCatsSnap.docs.map((d) => String(d.data().name || '').toLowerCase()));

    const batch = writeBatch(db);
    let categoriesCount = 0;
    for (const cat of DEMO_CATEGORIES) {
      if (!existingCatNames.has(cat.name.toLowerCase())) {
        batch.set(doc(db, 'categories', cat.id), {
          name: cat.name,
          slug: cat.slug,
          description: cat.description || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        categoriesCount += 1;
      }
    }

    const existingBooksSnap = await getDocs(collection(db, 'books'));
    const existingIds = new Set(existingBooksSnap.docs.map((d) => d.id));
    let booksCount = 0;

    for (const book of DEMO_BOOKS) {
      if (!existingIds.has(book.id)) {
        const payload = sanitizeBookPayload(
          {
            bookCode: book.bookCode,
            title: book.title,
            author: book.author,
            publisher: book.publisher,
            year: book.year,
            isbn: book.isbn,
            category: book.category,
            description: book.description,
            coverUrl: book.coverUrl,
            fileUrl: book.fileUrl,
            fileFormat: book.fileFormat,
            fileSize: book.fileSize,
            status: book.status,
            isDemo: true,
            recommended: book.recommended,
            viewsCount: book.viewsCount,
            downloadsCount: book.downloadsCount,
          },
          true
        );
        batch.set(doc(db, 'books', book.id), payload);
        booksCount += 1;
      }
    }

    const settingsSnap = await getDoc(doc(db, 'settings', 'library'));
    if (!settingsSnap.exists()) {
      batch.set(doc(db, 'settings', 'library'), {
        libraryName: DEFAULT_SETTINGS.libraryName,
        tagline: DEFAULT_SETTINGS.tagline,
        heroTitle: DEFAULT_SETTINGS.heroTitle,
        heroDescription: DEFAULT_SETTINGS.heroDescription,
        allowGuestDownload: DEFAULT_SETTINGS.allowGuestDownload,
        itemsPerPage: DEFAULT_SETTINGS.itemsPerPage,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { categoriesCount, booksCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed-demo-data');
  }
}

// --- Admin Management (Bootstrapped Admin Only) ---
export function subscribeAdmins(onData: (admins: AdminUser[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snap) => {
      const items: AdminUser[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          email: String(data.email || ''),
          name: String(data.name || ''),
          addedBy: String(data.addedBy || ''),
          createdAt: toMillis(data.createdAt),
        };
      });
      onData(items);
    },
    () => {
      onData([]);
    }
  );
}

export async function addAdminUid(uid: string, email: string, name: string): Promise<void> {
  const cleanUid = uid.trim();
  if (!BLUEPRINT_LIMITS.ID_PATTERN.test(cleanUid)) {
    throw new Error('Format UID tidak valid.');
  }
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      email: sanitizeString(email, 200),
      name: sanitizeString(name, 150),
      addedBy: auth.currentUser?.uid || cleanUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `admins/${cleanUid}`);
  }
}

export async function removeAdminUid(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
  }
}

// --- Favorites (Firestore for Signed-In Users + LocalStorage for Guests) ---
export function loadLocalFavorites(): UserFavorite[] {
  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UserFavorite[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalFavorites(items: UserFavorite[]): void {
  try {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function subscribeUserFavorites(
  uid: string,
  onData: (favorites: UserFavorite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/favorites`;
  return onSnapshot(
    collection(db, 'users', uid, 'favorites'),
    (snap) => {
      const items: UserFavorite[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          bookId: String(data.bookId || d.id),
          title: String(data.title || ''),
          author: String(data.author || ''),
          coverUrl: data.coverUrl ? String(data.coverUrl) : '',
          category: String(data.category || ''),
          addedAt: toMillis(data.addedAt),
        };
      });
      items.sort((a, b) => b.addedAt - a.addedAt);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export async function addUserFavorite(uid: string, book: Book): Promise<void> {
  const path = `users/${uid}/favorites/${book.id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'favorites', book.id), {
      bookId: book.id,
      title: sanitizeString(book.title, BLUEPRINT_LIMITS.TITLE_MAX),
      author: sanitizeString(book.author, BLUEPRINT_LIMITS.AUTHOR_MAX),
      coverUrl: sanitizeString(book.coverUrl, BLUEPRINT_LIMITS.URL_MAX),
      category: sanitizeString(book.category, BLUEPRINT_LIMITS.CATEGORY_MAX),
      addedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeUserFavorite(uid: string, bookId: string): Promise<void> {
  const path = `users/${uid}/favorites/${bookId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'favorites', bookId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- URL Verification, Stats Tracking & Named Download ---
export async function checkExternalUrl(url: string): Promise<UrlCheckResult> {
  const res = await fetch('/api/check-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as UrlCheckResult;
}

export async function fetchServerStats(): Promise<Record<string, { views: number; downloads: number }>> {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return {};
    const data = (await res.json()) as { stats?: Record<string, { views: number; downloads: number }> };
    return data.stats || {};
  } catch {
    return {};
  }
}

export async function trackBookMetric(bookId: string, type: 'view' | 'download'): Promise<void> {
  try {
    await fetch('/api/stats/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, type }),
    });
  } catch {
    // non-fatal
  }
}

export function resolveBookReaderUrl(book: Book): {
  pdfUrl: string;
  isGoogleDrive: boolean;
  drivePreviewUrl: string;
} {
  const raw = book.fileUrl.trim();
  if (raw.startsWith('/api/sample-pdf')) {
    return { pdfUrl: raw, isGoogleDrive: false, drivePreviewUrl: '' };
  }
  const driveMatch =
    raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    raw.match(/drive\.google\.com.*[?&]id=([a-zA-Z0-9_-]+)/);

  if (driveMatch) {
    const driveId = driveMatch[1];
    return {
      pdfUrl: `/api/proxy-pdf?url=${encodeURIComponent(raw)}&title=${encodeURIComponent(book.title)}`,
      isGoogleDrive: true,
      drivePreviewUrl: `https://drive.google.com/file/d/${driveId}/preview`,
    };
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return {
      pdfUrl: `/api/proxy-pdf?url=${encodeURIComponent(raw)}&title=${encodeURIComponent(book.title)}`,
      isGoogleDrive: false,
      drivePreviewUrl: '',
    };
  }

  return { pdfUrl: raw, isGoogleDrive: false, drivePreviewUrl: '' };
}

export async function downloadBookWithProgress(
  book: Book,
  onProgress: (percent: number | null) => void
): Promise<void> {
  const raw = book.fileUrl.trim();
  const safeBaseName =
    book.title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'Buku_Digital';
  const ext = book.fileFormat === 'EPUB' ? 'epub' : 'pdf';
  const filename = `${safeBaseName}.${ext}`;

  const downloadEndpoint = raw.startsWith('/api/sample-pdf')
    ? `${raw}${raw.includes('?') ? '&' : '?'}download=1`
    : `/api/proxy-pdf?url=${encodeURIComponent(raw)}&title=${encodeURIComponent(book.title)}&download=1`;

  onProgress(5);
  const response = await fetch(downloadEndpoint);
  if (!response.ok) {
    let errText = 'Gagal mengunduh berkas buku.';
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) errText = json.error;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (!response.body) {
    const blob = await response.blob();
    triggerBlobDownload(blob, filename);
    onProgress(100);
    return;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        onProgress(Math.min(98, Math.round((received / contentLength) * 100)));
      } else {
        onProgress(null);
      }
    }
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: response.headers.get('content-type') || 'application/pdf',
  });
  triggerBlobDownload(blob, filename);
  onProgress(100);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function bulkUpdateBooksMetadata(
  ids: string[],
  updates: {
    category?: string;
    year?: number;
    status?: 'published' | 'hidden';
    recommended?: boolean;
  }
): Promise<void> {
  if (ids.length === 0) return;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.category !== undefined && updates.category.trim()) {
    payload.category = sanitizeString(updates.category, BLUEPRINT_LIMITS.CATEGORY_MAX);
  }
  if (updates.year !== undefined && Number.isInteger(updates.year) && updates.year >= 1000 && updates.year <= 2100) {
    payload.year = updates.year;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }
  if (updates.recommended !== undefined) {
    payload.recommended = updates.recommended;
  }

  try {
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, 'books', id), payload);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'books/bulk-edit');
  }
}

export async function autoFillBookInfo(params: {
  title?: string;
  author?: string;
  isbn?: string;
  fileUrl?: string;
  categories: string[];
}): Promise<AutoFillBookResult> {
  const res = await fetch('/api/auto-fill-book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as AutoFillBookResult;
  if (!res.ok) {
    throw new Error(json.error || 'Gagal melengkapi informasi buku secara otomatis.');
  }
  return json;
}

export async function scrapeEbooksFromUrl(
  url: string,
  categories: string[]
): Promise<ScrapeEbooksResult> {
  const res = await fetch('/api/scrape-ebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, categories }),
  });
  const json = (await res.json()) as ScrapeEbooksResult;
  if (!res.ok) {
    throw new Error(json.error || 'Gagal mengambil daftar e-book dari halaman web.');
  }
  return json;
}

export async function batchCreateBooks(
  items: BookFormData[],
  onProgress?: (done: number, total: number) => void
): Promise<{ created: number; failed: number }> {
  if (items.length === 0) return { created: 0, failed: 0 };
  const CHUNK_SIZE = 300;
  let created = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item, offset) => {
      const id = createSafeId(`book${i + offset}`);
      const payload = sanitizeBookPayload(item, true);
      batch.set(doc(db, 'books', id), payload);
    });
    try {
      await batch.commit();
      created += chunk.length;
    } catch (error) {
      // Fallback to per-doc creation if any batch fails
      console.warn('Batch commit fallback triggered:', error);
      for (const item of chunk) {
        try {
          await createBook(item);
          created += 1;
        } catch {
          failed += 1;
        }
      }
    }
    onProgress?.(Math.min(items.length, i + chunk.length), items.length);
  }

  return { created, failed };
}
