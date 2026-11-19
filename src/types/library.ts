export type BookFileFormat = 'PDF' | 'EPUB' | 'DRIVE_PDF' | 'EXTERNAL';
export type BookStatus = 'published' | 'hidden';

export interface Book {
  id: string;
  bookCode: string;
  title: string;
  author: string;
  publisher: string;
  year: number;
  isbn?: string;
  category: string;
  description: string;
  coverUrl?: string;
  fileUrl: string;
  fileFormat: BookFileFormat;
  fileSize?: string;
  status: BookStatus;
  isDemo?: boolean;
  recommended?: boolean;
  viewsCount: number;
  downloadsCount: number;
  createdAt: number;
  updatedAt: number;
}

export type BookFormData = Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'viewsCount' | 'downloadsCount'> & {
  viewsCount?: number;
  downloadsCount?: number;
};

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserFavorite {
  bookId: string;
  title: string;
  author: string;
  coverUrl?: string;
  category: string;
  addedAt: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  addedBy: string;
  createdAt: number;
}

export interface LibrarySettings {
  libraryName: string;
  tagline: string;
  heroTitle: string;
  heroDescription: string;
  allowGuestDownload: boolean;
  itemsPerPage: number;
  updatedAt: number;
}

export interface UrlCheckResult {
  ok: boolean;
  accessible: boolean;
  compatibleWithPdfViewer: boolean;
  isGoogleDrive: boolean;
  format: BookFileFormat;
  fileSize: string;
  directDownloadUrl: string;
  previewUrl: string;
  message: string;
}

export interface AutoFillBookResult {
  ok: boolean;
  sources: string[];
  error?: string;
  data?: {
    title?: string;
    author?: string;
    publisher?: string;
    year?: number;
    isbn?: string;
    category?: string;
    description?: string;
    coverUrl?: string;
    fileFormat?: BookFileFormat;
    fileSize?: string;
  };
}

export interface ScrapedEbookItem {
  title: string;
  author: string;
  publisher: string;
  year: number;
  category: string;
  description: string;
  fileUrl: string;
  fileFormat: 'PDF' | 'DRIVE_PDF';
  section: string;
}

export interface ScrapeEbooksResult {
  ok: boolean;
  sourceUrl: string;
  pageTitle: string;
  totalFound: number;
  items: ScrapedEbookItem[];
  error?: string;
}

export type PublicTab = 'home' | 'catalog' | 'categories' | 'favorites';
export type SortOption = 'newest' | 'popular' | 'most_downloaded' | 'az';

export type AdminSection =
  | 'overview'
  | 'books'
  | 'add'
  | 'categories'
  | 'hidden'
  | 'import'
  | 'export'
  | 'stats'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

// Blueprint synchronization constants (verbatim from firebase-blueprint.json)
export const BLUEPRINT_LIMITS = {
  BOOK_CODE_MAX: 64,
  TITLE_MAX: 200,
  AUTHOR_MAX: 150,
  PUBLISHER_MAX: 150,
  ISBN_MAX: 40,
  CATEGORY_MAX: 80,
  DESCRIPTION_MAX: 5000,
  URL_MAX: 1000,
  FILE_SIZE_MAX: 40,
  CATEGORY_DESC_MAX: 300,
  SLUG_PATTERN: /^[a-z0-9-]+$/,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
} as const;
