# Prototype Instructions

In Log > Add study session, the topic input filters the selected skill's topic chips as the user types. Keep the liquid-glass chips, topic selection, completion indicators, and custom session topics available.
Each Log topic chip has an independent delete control. Confirm deletion, remove its plans, keep sessions and study time as unlinked history, and protect topics used by an active timer.

Keep the mobile navbar fixed to the bottom with the existing liquid-glass style. Account for device safe areas and keep page content, session controls, and notifications clear of it.

Mobile navigation taps must open the page at the top, including taps on the current tab. Keep Today's remaining-study-time display compact and aligned on desktop and mobile. Study chart tooltips show minutes below one hour and readable, rounded hours for longer durations.

Log history cards hide notes. Clicking anywhere on a history card opens a glass modal showing one session card with its notes; left and right arrows browse entries in the displayed history order. Edit and delete buttons act independently without opening the viewer.

The study-entry viewer uses a wider card and a stable outer modal height. Scroll only the notes area; keep the header and navigation arrows in the same position when scrolling or browsing entries.

Cadence uses Supabase Auth and PostgreSQL as the source of truth. Preserve the existing liquid-glass design. Never seed production study data or expose secret/service-role keys. Keep original browser study data untouched; cloud migration must be explicitly confirmed. Use owner RLS and composite foreign keys for all user-owned rows, and atomic revision-checked writes for related changes.

Excel topic imports use the unchanged official workbook in public/Cadence_Blank_Topic_Template.xlsx. Read only its Topics sheet with exactly Topic and Priority columns. Assign the skill in Cadence, validate the entire file before an atomic save, reject duplicates within that skill, and preserve High/Medium/Low priority and source order. Never assign topic durations. Today’s Focus selects incomplete topics by priority/order; completion is an explicit user action and study time records actual duration.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
