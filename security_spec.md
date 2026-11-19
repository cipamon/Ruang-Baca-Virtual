# Security Specification: RUANG BACA VIRTUAL

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Public Catalog Isolation**: Unauthenticated visitors and standard users can ONLY `get` and `list` documents in `/books/{bookId}` where `status == 'published'`. Hidden books (`status == 'hidden'`) are readable exclusively by verified admins.
3. **Admin-Only Catalog Mutations**: Only verified administrators (`isAdmin()`) can `create`, `update`, or `delete` documents in `/books`, `/categories`, and `/settings`. Standard users cannot mutate library collections.
4. **Strict Payload & Size Validation**: Every document creation and update is guarded by `isValid[Entity]()` validating key allowlists (`hasAll`/`hasOnly`), field types, string lengths, numeric ranges, and server timestamps (`request.time`).
5. **Path ID Hardening**: All document IDs are validated with `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
6. **Private User Favorites**: `/users/{userId}/favorites/{bookId}` is strictly readable and writable only by the verified owner (`request.auth.uid == userId`).
7. **Admin Privilege Protection**: Non-bootstrapped users cannot add themselves or others to `/admins/{adminId}` or forge `email_verified` claims.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Book Create**: Anonymous client attempts `POST /books/hack1` -> `PERMISSION_DENIED`.
2. **Verified Non-Admin Book Create**: Signed-in normal user attempts `POST /books/hack2` -> `PERMISSION_DENIED`.
3. **Hidden Book Read by Guest**: Guest attempts `GET /books/hidden-book-1` where `status == 'hidden'` -> `PERMISSION_DENIED`.
4. **Unfiltered Book List by Guest**: Guest attempts `list /books` without `where('status', '==', 'published')` -> `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection**: Admin attempts to create/update a book with an extra undocumented field `isVerified: true` -> `PERMISSION_DENIED` (`keys().hasOnly()`).
6. **Spoofed Email Without Verification**: Token has `email == 'faniku2021@gmail.com'` with `email_verified == false` -> `PERMISSION_DENIED`.
7. **ID Poisoning Attack**: Attempt to write `/books/aaa...2000chars` -> `PERMISSION_DENIED` (`isValidId()`).
8. **1MB Description Exhaustion**: Admin attempts to write `description` > 5000 chars -> `PERMISSION_DENIED`.
9. **Spoofed Client Timestamp**: Client supplies past `createdAt` or `updatedAt != request.time` -> `PERMISSION_DENIED`.
10. **Immutable CreatedAt Overwrite**: Update tries to alter `createdAt` -> `PERMISSION_DENIED`.
11. **Cross-User Favorite Hijack**: User A attempts to read/write `/users/userB/favorites/book1` -> `PERMISSION_DENIED`.
12. **Self-Promotion to Admin**: User A attempts to create `/admins/userA` -> `PERMISSION_DENIED`.
