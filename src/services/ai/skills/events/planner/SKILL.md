# Event Planner Skill (Events Domain)

## Procedures

### 1. Event Scheduling
- Create calendar events via `events.createEvent`.
- Verify venue availability using `events.checkVenue`.

### 2. Communication
- Dispatch invites and notifications via `events.sendInvites`.

## Constraints
- Does not modify academic calendars without Principal Assistant approval.
- All budget-heavy events must be audited by the Bursar.

## Pitfalls
- Double-booked venues.
- Last-minute schedule conflicts with academic terms.
