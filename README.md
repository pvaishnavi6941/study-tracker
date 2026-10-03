# Cadence

A personal study tracker based on the provided Cadence screens. React 19, TypeScript, Tailwind CSS 4, Vite, Supabase Auth/PostgreSQL, Phosphor icons, and Recharts. No sample sessions, seeded topics, or fabricated progress. The existing glass design is preserved.

## Supabase setup

1. Use `.env.example` to configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The supplied project connection is already in the ignored local `.env`. Use only a publishable or legacy anon key. Never supply a secret or service-role key to Vite.
2. Run `supabase/migrations/202610030001_cadence.sql` once in your project's SQL Editor. It creates tables, indexes, RLS policies, owner foreign keys, empty profiles for new/existing Auth users, and the transactional data RPCs. Alternatively apply the migration through an authenticated, linked Supabase CLI using `supabase db push`. The publishable key cannot apply SQL migrations. The migration is transactional and intentionally fails if conflicting tables already exist, so existing schemas are not silently overwritten.
3. In Auth → URL Configuration, set your production Site URL. Add the exact local and production callback URLs and their `?flow=recovery` variants to Redirect URLs. For the running preview these are `http://127.0.0.1:4173/` and `http://127.0.0.1:4173/?flow=recovery`. If using `localhost`, allow that origin separately. Do not use wildcard production redirect URLs.
4. Keep email/password sign-in enabled. With email confirmation enabled, sign up, confirm the inbox email, and then sign in. Configure SMTP in Supabase for reliable production confirmation/recovery delivery. Password reset uses Supabase's recovery session and `updateUser`.
5. On a deployed build, set the two public Vite variables in the build environment before building. `.openai/hosting.json` stays unchanged: Supabase is accessed directly through its SDK, not a D1 database. This change does not automatically publish a site.

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Running

```sh
npm ci
npm run dev
```

Production: `npm run build`. Static client output: `dist/client`. Serve it with `npm run preview` or a static host. Hash navigation works on static hosts without route rewriting.

## Checks

```sh
npm run typecheck
npm test
npm run test:database
npm run build
npm run test:sites
npm run check:supabase
npm run test:browser
```

## Data and calculations

- Supabase is the source of truth. Only authenticated accounts can open the app. Auth tokens are persisted by the SDK; study data is fetched from the database after login/refresh and is never loaded from localStorage as an account fallback.
- Skills, topics, sessions, and plans each carry `user_id`. All tables use RLS. Composite foreign keys prevent linking to another user's skill, topic, or session. App RPCs run as the caller, so RLS applies inside them. The signup-profile trigger is the only security-definer function and cannot be invoked as a frontend RPC.
- Related changes are saved transactionally. A profile revision prevents stale devices from overwriting newer changes. UI shows pending saves, keeps failed forms, reloads on conflicts/uncertain failures, and only reports success after the database confirms it. Request timeouts are 20 seconds.
- Realtime profile changes trigger a full account refresh; the app also refreshes every 15 seconds while visible, on focus, and after reconnecting. Different devices see the same authenticated database records. User changes remount the app and abort old requests.
- Setup offers optional skill suggestions. None exist in the application until the user chooses them. Each selected skill starts with zero study time and zero completed topics.
- Skill/overall progress is completed topics divided by total topics. A topic is complete when manually checked or linked to at least one session with its completion switch enabled. Removing the last completing session makes it pending unless it is also manually checked.
- Every logged session counts toward study time. Completed sessions count toward streaks; pending sessions do not. Session duration is numeric minutes in PostgreSQL to preserve actual timer seconds without rounding up.
- A study day is a unique stored calendar date with a completed session. The current streak ends today or yesterday; longer gaps reset it. Longest streak and milestones derive from existing completed history and recalculate after deletion. Consistency uses fixed rolling 7/30/90-day windows.
- The timer persists its start timestamp and accumulated paused duration, so navigating or refreshing does not lose it. Background time is counted while running. Midnight-spanning sessions are assigned to their starting date, displayed in the finish dialog. Sessions longer than 24 hours must be cancelled and logged manually.
- Unknown topic names entered in Log become actual user-created topics. Existing names within the skill are linked automatically.
- Deleting a skill deletes associated topics, sessions, and plans. Deleting a topic preserves its sessions as unlinked history. Destructive changes require confirmation; a full reset requires typing DELETE.
- JSON backups include skills, topics, sessions, plans, preferences, and the timer. Imports validate types, dates, durations, IDs, and references before asking to replace this account's study data. Imported IDs are remapped to avoid collisions between users' rows. Dates, study duration, completion, notes, and relationships are retained. Import is replacement, not merge.
- Learning history reconstructs the progress of currently existing topics from their creation dates, manual completion timestamps, and dated sessions. It is not an immutable historical snapshot. Edits and deletions therefore recalculate historical values.

## Excel topic import

Apply `supabase/migrations/202610030002_topic_import.sql` once after the original Cadence migration. It adds `priority` and `sort_order` to existing topics, preserves old topics as Medium priority, and updates the existing transactional RPCs. It creates no tables or RLS policies. The app checks the RPC capability marker and blocks Excel confirmation until this update is installed, so priorities cannot silently disappear on an older schema.

In Skills or Manage topics, choose Download Template or Import Topics. The official workbook is served unchanged, including its Instructions sheet; only the Topics worksheet is imported. Use exactly `Topic | Priority`, with High, Medium, or Low values. Select a skill in the app, or enter a new skill name (an existing normalized name is reused). Upload `.xlsx`, review the preview, and confirm. Invalid rows show their Excel row numbers and block the entire import. Duplicates in the workbook or selected skill are rejected. Completely empty rows are ignored. Imports append to existing topics, with a 5 MB/5,000-topic limit per file, and retain priority/order through refresh and JSON backups.

Today’s Focus automatically shows the next three incomplete topics in High/Medium/Low order, retaining topic order within a priority. Imported topics receive no fixed duration or plans. Start times an actual session; Log time records the chosen actual duration. Topic completion switches start unchecked. A pending 20-minute session keeps its topic in the queue; explicitly completing it advances the queue. Existing manually planned focus blocks retain their user-chosen durations. Explicitly reopening a completed topic uses the existing confirmation flow.

Parsing uses [read-excel-file’s browser reader](https://github.com/catamphetamine/read-excel-file), loaded only when uploading a workbook. Browser tests fill the supplied workbook and exercise download, row errors, preview, separate-skill imports, duplicate rejection, refresh, priority focus, actual 20-minute logging, explicit completion, and account isolation against isolated PostgreSQL. Live authenticated tests still require the two configured test accounts and applied priority migration.

## Existing local data

The old `cadence:data:v1` localStorage entry is preserved without modification. After signing in, Settings offers a download of the original local backup and a confirmed import into the current account. Nothing is auto-uploaded or assigned to an account. An unreadable local entry can be downloaded raw; it cannot be imported until repaired. Cloud reset/delete affects only the signed-in account's study data and never deletes the old browser backup or the Auth account.

## Live verification

The automated test suite covers feature/auth flows using mocked API boundaries. `test:database` executes the actual migration and ownership/security operations in an isolated PGlite PostgreSQL engine, including User A/User B select/insert/update/delete denial, anonymous denial, persistence, transactions, and revision conflicts. These are not a claim that your remote project has been fully tested.

After applying SQL, create and confirm two dedicated test accounts in Supabase. Copy `.env.test.example` to ignored `.env.test.local` and enter their email/password values locally. Never put test credentials in chat or use a `VITE_` prefix for them. Run `npm run test:live` to exercise real auth, user isolation, a 45-minute session, reload, a second SDK client, editing/deletion, logout/login, and stale revision protection. It cleans up only its own test-created skill/topic/session rows; it does not erase existing user history. A second SDK client verifies the database sync path; a physical-device browser check remains a separate step.

The migration has been applied by the user. Live endpoint checks confirm that all five tables and both Cadence RPCs exist and deny anonymous access. To inspect the installed RLS definitions, run the read-only `supabase/verify-cadence.sql` in SQL Editor. It creates no tables, policies, or migrations and returns only schema metadata. The frontend key cannot inspect PostgreSQL policy catalogs.

`test:browser` runs Microsoft Edge on Windows against the local app (default Playwright Chromium elsewhere). Its isolated integration test uses the real Supabase SDK, simulated Auth HTTP, and the actual migration in PGlite PostgreSQL. It exercises signup confirmation messaging, login/logout, persisted auth across reload, skills/topics, a 45-minute session, dashboard/streak/analytics calculations, session editing/deletion, a second browser context, two-user isolation, and overflow checks on all account screens at 390px/320px. It writes screenshots under ignored `test-results/browser`. It creates no live project records. The separate live browser test uses confirmed credentials from `.env.test.local` and is explicitly skipped when they are absent.

The user has also confirmed successful application of `202610030002_topic_import.sql`. The live browser suite now includes actual Excel uploads into two temporary skills, preview/confirmation, priority persistence after refresh, and User A/User B isolation through the real project. It removes only its uniquely named test-created skills and restores any onboarding preference temporarily changed by the tests. Both live browser checks explicitly skip when confirmed account credentials are absent.

Authenticated live verification remains blocked until confirmed test credentials are available. A deployed URL and physical-device check are also still outstanding.

Reference orb: cropped from the supplied Cadence image. Fonts and icon assets are bundled locally. No third-party font or image requests are made at runtime.
