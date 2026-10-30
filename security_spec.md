# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Zero-Sign-In Auto-Sync Workspace Scope Invariant**: Because the user explicitly requested a zero-sign-in automatic cross-device clipboard (`"dont want sign in and i want auto sync"`), every `Clip` and `ClipChunk` document is scoped to the workspace identifier `ownerId == 'public-workspace'`.
2. **Ownership & Scope Immutability Invariant**: A `Clip` document's `ownerId` must strictly equal `'public-workspace'` on creation and is immutable on update (`incoming().ownerId == existing().ownerId`). Queries (`get`, `list`, `update`, `delete`) must match `resource.data.ownerId == 'public-workspace'`.
3. **Master Gate Relational Invariant**: A `ClipChunk` document at `/clips/{clipId}/chunks/{chunkId}` can only be read, created, or deleted if the parent `/clips/{clipId}` document exists and its `ownerId == 'public-workspace'` (verified via `get(/databases/$(database)/documents/clips/$(clipId)).data.ownerId == 'public-workspace'`).
4. **Strict Schema & Boundary Invariant**: All incoming writes must pass `isValidClip(incoming())` or `isValidClipChunk(incoming(), clipId)`, enforcing `hasAll` and `hasOnly` key allowlists, string `.size()` bounds, numeric range bounds, and regex ID guards (`isValidId`).
5. **Temporal Integrity & Immutability Invariant**: `createdAt` and `updatedAt` must equal `request.time` on creation; on update, `createdAt`, `id`, `ownerId`, `sha256`, and `createdAtIso` are strictly immutable while `updatedAt == request.time`.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Workspace Scope Spoofing on Clip Create)**:
   ```json
   { "id": "clip-1", "ownerId": "rogue-tenant", "title": "Spoofed", "category": "text" }
   ```
   *Expected*: `PERMISSION_DENIED` (`ownerId != 'public-workspace'`).

2. **Payload 2 (Invalid Category Enum Write)**:
   Attempts to create a clip with `"category": "executable"`.
   *Expected*: `PERMISSION_DENIED` (`isValidClip` category enum guard fails).

3. **Payload 3 (Shadow / Ghost Field Injection on Create)**:
   Includes all required Clip fields plus `"isAdmin": true`.
   *Expected*: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` fails).

4. **Payload 4 (Update-Gap / Shadow Key on Update)**:
   Updates `title` plus unauthorized field `"sha256": "hacked"`.
   *Expected*: `PERMISSION_DENIED` (`affectedKeys().hasOnly(...)` and immutability check fail).

5. **Payload 5 (Ownership Hijack on Update)**:
   Attempts to mutate `ownerId` from `'public-workspace'` to `'private-user'`.
   *Expected*: `PERMISSION_DENIED` (`incoming().ownerId == existing().ownerId` fails).

6. **Payload 6 (Value Poisoning on Whitelisted Update Field)**:
   Attempts to update `title` to a 10,000-character string or a boolean `true`.
   *Expected*: `PERMISSION_DENIED` (`isValidClip(incoming())` enforces `title is string && title.size() >= 1 && title.size() <= 256`).

7. **Payload 7 (Path ID Poisoning)**:
   Attempts to create `/clips/invalid id with spaces!$%` or ID > 128 chars.
   *Expected*: `PERMISSION_DENIED` (`isValidId(clipId)` fails).

8. **Payload 8 (Timestamp Forgery on Create/Update)**:
   Supplies a forged past or future `createdAt` or `updatedAt` timestamp != `request.time`.
   *Expected*: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

9. **Payload 9 (Orphaned Subcollection Chunk Write)**:
   Attempts to create `/clips/non-existent-clip/chunks/chunk-0` without a parent clip in the workspace.
   *Expected*: `PERMISSION_DENIED` (Master Gate `exists()` + `get()` parent check fails).

10. **Payload 10 (Mismatched Parent-Child Chunk Write)**:
    Attempts to write a chunk under `/clips/clip-a/chunks/chunk_0000` with `data.clipId = 'clip-b'`.
    *Expected*: `PERMISSION_DENIED` (`data.clipId == clipId` check fails).

11. **Payload 11 (Unscoped List Query Scraping)**:
    Attempts an unfiltered `list` query on `/clips` without `where('ownerId', '==', 'public-workspace')`.
    *Expected*: `PERMISSION_DENIED` (`allow list` enforces `resource.data.ownerId == 'public-workspace'`).

12. **Payload 12 (Denial of Wallet Oversized Chunk Payload)**:
    Attempts to write a `ClipChunk` where `data.size() > 400000`.
    *Expected*: `PERMISSION_DENIED` (`isValidClipChunk` enforces `data.size() <= 400000`).
