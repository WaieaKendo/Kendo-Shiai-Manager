# Tournament switching and friendly links (#42, #43)

The Library (`/`) is the start page. Opening or creating a tournament pushes its
address into browser history. Back returns to the Library; Forward, reload and
bookmarks reopen the tournament as a spectator. Staff Login stays per tournament.
The address identifies the tournament and any device assignment; ordinary screen
navigation still follows M.9 and does not add a history entry.

The header chip names the tournament and offers **Switch tournament**, including
on TV devices. New UI uses existing theme tokens. Library, Switch and New Tournament
share a save gate: pending work must reach the server before leaving. If it cannot,
the app warns and stays put with the outbox and staff session intact. Successful
exits clear runtime state, court preferences, match timers, queued callbacks and
credentials. A new tournament starts from the original setup and division defaults.
Saved per-tournament records remain cached for offline reading. The Library does
not generate autosaves or offline outboxes of its own.

## Friendly addresses

New tournaments suggest a short name from the tournament name and year. A year
already present in the name is retained. Creation asks for the short name; staff
can change it in **Tournament Access → Edit short name**. It accepts lowercase
letters, digits and single dashes (1–80 characters), with no leading/trailing dash.
App, API and static-resource roots are reserved; the shared list is in
`app/slug-rules.mjs`. Clients without a short name still use `/t/<id>`; existing
tournaments gain a name through the staff editor. Older clients creating without
a slug get a server suggestion with a numeric suffix if needed.

These forms work with either a slug or `/t/<id>`:

- The base address and `/live`: Live Scores.
- `/court/a` and `/court/b`: a court assignment.
- `/tv/a` and `/tv/b`: TV for the chosen court.
- `/overlay/a` and `/overlay/b`: the live stream overlay.

Every generated access, QR, TV and overlay link uses the current short name when
known. Existing ID paths and old query links remain supported.

## Rename and deletion policy

**An old short name remains permanently owned by its original tournament.**
Online page requests return a 308 redirect to the current name, preserving the
screen suffix and query parameters. The resolution API returns the original
stable tournament ID and its current name. An alias cannot be claimed by another
tournament, even after a rename or deletion. The original tournament may select
one of its own aliases again.

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
the tournament. If infrastructure fails after the claim, the name stays reserved
rather than risking reuse. Library refresh/discovery never clears reservations.
The existing authenticated test reset explicitly clears its test namespace.

The service worker serves the app shell for slug navigations as well as ID paths.
The browser caches resolution metadata and saved tournament records separately
by slug and ID. After one successful online visit, a slug can reload offline with
its last saved record. Staff login is still required to edit after reload. The
stream overlay remains live-only, as specified in M.9.

## Snapshot review

All 82 changed golden fixtures were expanded and compared step by step. In 76,
the screen content, visibility and element sizes are unchanged; only vertical
positions move with the tournament header. The remaining six are the
Library cards scenario and five shell scenarios: they cover the chip, staff
short-name controls, the cached slug field, failed-open behavior and blocking an
exit with unsaved work. The Library's request/response scenario now explicitly
answers the save attempted before that blocked exit. Tournament engine outcomes
are unchanged. The menu was also visually checked at 390 × 844 with a long
tournament name.

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
