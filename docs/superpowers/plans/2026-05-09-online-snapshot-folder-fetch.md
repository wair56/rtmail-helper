# Online Snapshot and Mail Folder Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the current production deployment into the repository and extend the current mail fetcher so folder fetching is diagnosable and can fetch five messages per folder.

**Architecture:** Keep the production snapshot isolated under `online-snapshot/` as static evidence. Refactor mail provider logic in `lib/mail.ts` to expose mailbox enumeration and folder-set fetching while preserving existing `folder=inbox|trash` behavior. Update dashboard/API types minimally.

**Tech Stack:** Next.js 16, TypeScript, IMAP via imapflow, Gmail REST API, Node test runner.

---

### Task 1: Archive production snapshot

**Files:**
- Create: `online-snapshot/helperis-beta-2026-05-09/README.md`
- Create: `online-snapshot/helperis-beta-2026-05-09/api-status.md`
- Create: `online-snapshot/helperis-beta-2026-05-09/index.html`
- Create: `online-snapshot/helperis-beta-2026-05-09/dashboard.html`
- Create: `online-snapshot/helperis-beta-2026-05-09/admin.html`
- Create: `online-snapshot/helperis-beta-2026-05-09/assets/`

- [ ] Fetch production HTML pages and static chunk assets from `https://helperis-beta.vercel.app/`.
- [ ] Probe key API endpoints and record status codes in `api-status.md`.
- [ ] Document that this is a static snapshot, not deployable source.

### Task 2: Add tests for folder planning and mailbox diagnostics

**Files:**
- Create: `lib/mail.test.mjs`
- Modify: `package.json`
- Modify: `lib/mail.ts`

- [ ] Add a Node test command.
- [ ] Write failing tests for folder set normalization and trash-not-found diagnostics.
- [ ] Run tests and verify they fail before implementation.

### Task 3: Implement folder-set fetching support

**Files:**
- Modify: `lib/mail.ts`
- Modify: `app/api/mail/route.ts`
- Modify: `app/dashboard/page.tsx`

- [ ] Export helpers that normalize `folder=all` to `['inbox','trash']`.
- [ ] Add `listMailByFolders(user, folders)` returning `{ folder, mails, error? }[]`.
- [ ] Improve IMAP trash error to include available mailbox names.
- [ ] Keep single-folder response compatible and add `folder=all` grouped response.
- [ ] Update dashboard to request `folder=all`, keep tabs, and display per-folder errors.

### Task 4: Verification

**Files:**
- All touched files

- [ ] Run tests.
- [ ] Run `npm run build`.
- [ ] Review `git diff --stat` and sensitive-file status.
