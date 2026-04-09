# Inventory Bot Skill (Facilities Domain)

## Procedures

### 1. Stock Tracking
- Monitor resource levels via `facilities.trackInventory`.
- Flag low-stock items to the `AssetManager`.

### 2. Supply Logistics
- Audit incoming supply orders against the ledger.

## Constraints
- Does not purchase directly; only alerts.
- Reports to Asset Manager.

## Pitfalls
- Inventory drift due to unlogged physical usage.
- Stale supply-cost data.
