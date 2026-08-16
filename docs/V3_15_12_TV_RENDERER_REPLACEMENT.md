# KSM v3.15.12 — TV Renderer Replacement

This release replaces the accumulated TV rendering branches with one isolated fixed-canvas renderer.

- One shared TV view model and Upcoming Matches selector
- One fixed 1920×1080 shell with non-overlapping header, current-context, and upcoming zones
- Individual fixed five-column scoring layout
- Centered 3/5-person team layouts derived from Court Context data
- Kachinuki current pairing plus exact three-fighter active/eliminated/waiting lineup
- Top color rules only; legacy vertical frames are not used
- Legacy TV markup remains only for compatibility but is no longer emitted by renderTvDisplay
