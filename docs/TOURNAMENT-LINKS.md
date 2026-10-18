# Tournament switching and friendly links (#42, #43)

The Library (`/`) is the start page. Opening or creating a tournament pushes its
address into browser history. Back returns to the Library; Forward, reload and
bookmarks reopen the tournament as a spectator. Staff Login stays per tournament.
Each screen has a path. Tab navigation replaces the current entry; only opening
or switching tournaments adds an entry, so Back skips all intervening tabs.
Overview and Results reopen on their bookmarked screen. Setup, Registration and
Pools require staff: a spectator opening or reloading those paths lands on the
tournament default (Overview). Reload still ends staff access as before.

On tournament screens the header shows the logo and a quiet, truncated tournament
name linked to the tournament home (Overview). The logo opens Overview for spectators and returns signed-in staff to the Library
through the save guard. Direct access to `/` remains public. `TOURNAMENT_HOME` in `app/engine/routes.ts` defines the
home route, screen and label together. Staff edit short URLs beside the tournament name in Setup. Tournament Access
shows and copies the link without an editing control.
At 900px or less, a hamburger opens the navigation; Escape, outside click or
choosing a destination closes it. Spectator order: Overview, Live Scores, Courts,
Results. Staff order: Overview, Live Scores, Courts, TV, Results, Export, Save /
Load, Registration, Setup. The Library retains its full branding and
shows the build version in its About footer; diagnostics retain the same version. New UI uses existing theme tokens. Returning to the Library and New Tournament
share a save gate: pending work must reach the server before leaving. If it cannot,
the app warns and stays put with the outbox and staff session intact. Successful
exits clear runtime state, court preferences, match timers, queued callbacks and
credentials. A new tournament starts from the original setup and division defaults.
Saved per-tournament records remain cached for offline reading. The Library does
not generate autosaves or offline outboxes of its own.
An active local-only draft is protected even without a cloud ID, staff session,
outbox or pending mutation counter: switching warns and retains its autosave and
runtime data. Save it to the cloud before switching; Tournament File download is
also available for backup. This guard starts after bootstrap; the initial Library
transition keeps the autosave recovery copy without an exit warning. If Back is
blocked before creation has an ID, the app
restores its previous draft address with `replaceState`, without adding a null-ID
history entry.

## Friendly addresses

New tournaments suggest a short name from the tournament name and year. A year
already present in the name is retained. Creation asks for the short name; staff
can change it in **Setup → Edit short URL**. It accepts lowercase
letters, digits and single dashes (1–80 characters), with no leading/trailing dash.
App screen names (`overview`, `results`, `setup`, `registration`, `pools`), API
and static-resource roots are reserved; the shared list is in
`app/slug-rules.mjs`. Clients without a short name still use `/t/<id>`; existing
tournaments gain a name through the staff editor. Older clients creating without
a slug get a server suggestion with a numeric suffix if needed.

These forms work with either a slug or `/t/<id>`:

- The base address: Overview (the configured tournament home).
- `/live`: Live Scores.
- `/court/a` and `/court/b`: a court assignment.
- `/tv/a` and `/tv/b`: TV for the chosen court.
- `/overlay/a` and `/overlay/b`: the live stream overlay.
- `/overview` and `/results`: spectator-accessible app screens.
- `/setup`, `/registration` and `/pools`: staff screens; spectator links fall back
  to `/overview` and Overview. Pools selects Registration’s Pools tab.

Every generated access, QR, TV and overlay link uses the current short name when
known. Existing ID paths and old query links remain supported.

## Rename and deletion policy

**An old short name remains permanently owned by its original tournament.**
Online page requests return a 308 redirect to the current name, preserving the
screen suffix and query parameters. The resolution API returns the original
stable tournament ID and its current name. An alias cannot be claimed by another
tournament, even after a rename or deletion. The original tournament may select
one of its own aliases again.

**Owner decision for this revision:** a tournament may own at most five names,
including its current name and all aliases. A sixth new name returns `slug-limit`
(409) without reserving it. Selecting an already-owned alias does not consume a
slot. Staff cannot release names; administrative release is deferred to #9.

Deletion keeps all reservations as tombstones; both current names and aliases
return 410. The Worker also checks the tournament tombstone before serving a slug
page, covering an interrupted delete before the Library update. A device that
learns of deletion removes its cached record. An offline device can only know the
last state it observed, until it reconnects.

## Storage and failure boundaries

The existing singleton Library Durable Object owns `slugRegistry`: `owners`
(slug → ID), `current` (ID → current slug) and `deleted` (ID → deletion time).
Claims, renames and deletion reservations use storage transactions. Registry
metadata is separate from tournament snapshots: replaying an older queued save
cannot rename a tournament or release an alias. Public API records and Library
cards include the current slug; the staff-only rename endpoint is
`POST /api/tournaments/<id>/slug`. `GET /api/slugs/<slug>` resolves public links.
No credentials appear in either metadata or resolution caches.

Creation validates the payload and password before claiming a name, then writes
the tournament record, password hash and creator session in one local storage
transaction. A failed transaction rolls back all three and compensates the claim
through an internal Library-only operation. It only releases that tournament's
single initial name, never renamed aliases or deletion tombstones. Successful
creation keeps the permanent reservation. A process crash or unavailable Library
during compensation still needs administrative repair; there is no cross-Object
transaction. Library refresh/discovery never clears reservations.
The existing authenticated test reset explicitly clears its test namespace.

The service worker serves the app shell for slug navigations as well as ID paths.
The browser caches resolution metadata and saved tournament records separately
by slug and ID. After one successful online visit, a slug can reload offline with
its last saved record. Staff login is still required to edit after reload. The
stream overlay remains live-only, as specified in M.9.

## Static request routing

Cloudflare supports negative `run_worker_first` patterns. The configuration sends
page/API/ID/friendly routes to the Worker but excludes static directories, script
and manifest files, and the standalone privacy/overlay assets. Static requests
therefore invoke the Worker zero times, instead of once under `true`; they make
zero registry calls. Friendly pages retain one Worker invocation, one Library
resolution and one tournament-status check. This removes a Worker dispatch from
the static latency path; it does not claim a measured production latency change.
See [Cloudflare's routing rules](https://developers.cloudflare.com/workers/static-assets/binding/).

## Snapshot review

The original switcher/friendly-link work reviewed its 82 changed recordings. This
header revision updates the five Shell and three Library scenarios: Shell changes
are the logo/chip/status-row layout and moved version; Library changes add the
About footer text. Dialogs, saves, roles and tournament content remain exact.
The header is tested at 375 × 812 and 812 × 375 with a 40-character name, with Staff
Login visible and a 44px minimum target.

Following the owner's review preference, 76 additional screen recordings update
only their expected vertical offsets for the new header at each viewport. Every
expanded diff was reviewed: content, visibility, element counts, X positions,
widths and heights are unchanged. Fixed overlays retain their expected positions.
All snapshots continue to compare absolute geometry; no screen-origin tolerance
or relative-position comparison is used.

The subsequent navigation cleanup reviews five Shell recordings (name link,
role-specific order, hamburger state and bounded menus), one Library session
landing change (Overview), and 54 mobile screen-offset-only recordings. The latter
move up by 80px in portrait or 52px in compact landscape as the navigation
collapses; content, visibility, element counts, X positions and dimensions remain
exact. Generated tournament access links now name `/overview`. Hamburger clicks
are excluded from the broad legacy autosave listener and create no mutations.

The Setup geometry check waits for fonts and the resize paint cycle before
measuring native textareas; it retains their original sizes. Socket barriers wait
for an open socket, and timer reads take one DOM snapshot. Results captures its
fixed bracket overlay at a deterministic scroll origin after viewport changes. None of these fixes
adds a longer sleep or relaxes an assertion.

Conflict races explicitly start pending saves and wait for live connections instead
of relying on debounce delays. This exposed a missing retry when an update arrived
just after blur but within the recent-input guard; that path now schedules the same
deferred-update retry as an update received while editing. Court and layout visual
fixtures identify an existing staff tournament so offline autosaves cannot open
creation prompts during a click.
Browser helpers also wait for cloud startup to finish, including the Library
transition, before interacting. Loaded globals or a mounted header alone do not
mean the initial tournament load has finished setting its role and screen.
The runner budgets two CPU cores per browser job (up to six jobs); each browser
launches multiple renderers in addition to local Workers. This avoids saturating
eight-core desktops with six simultaneous browser suites. Timeouts are unchanged.
