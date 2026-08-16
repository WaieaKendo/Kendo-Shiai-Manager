# KSM v3.15.15 — UI & Permissions Lock

This patch locks the final v3.15 interface and closes a spectator write path in team representative matches.

## Changes

### Static Undo and Redo labels

The court action-history buttons now always display **Undo** and **Redo**. The underlying action labels, per-court history stacks, redo stacks, persistence, and cloud-save behavior are unchanged.

### Representative-player permissions

Representative-player controls remain interactive only for authorized sessions:

- Local, Admin, and Director sessions may select representatives.
- Scorekeepers may select representatives only for their assigned court.
- Spectators receive a read-only player label and cannot mutate the representative match.

The same rule is enforced inside `setRepresentative`, so hiding the control is not the only protection.

## Preserved baseline

The v3.15.14 fixed 1920×1080 TV renderer, tournament data model, cloud protocol, and Tournament Management Engine v3.12.9 remain unchanged.
