# KSM v3.16.2 — Cloud-First Tournament Library and Branding

The Home Tournament Library is populated from a singleton cloud metadata index. Tournament snapshots remain stored in their own Durable Objects. Creating or saving a tournament updates its card metadata automatically. Local storage is retained as an offline cache and as a migration source for tournaments remembered by earlier v3.16 builds.

Tournament cards use the uploaded logo, with the tournament name centered below the square card. Branding is edited only in Setup. Uploaded images are resized to a maximum dimension of 512 pixels and stored as PNG data in the tournament setup snapshot, so the logo travels with cloud sync and downloaded backups.

The v3.16.2 Pools selection stability fix remains included.
