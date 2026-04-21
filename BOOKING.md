# Chodex Booking System

Multi-tenant meeting booking, built into the Chodex platform with deep RAG agent integration.

## Architecture

### Data Model

| Table | Purpose |
|---|---|
| `availability_rules` | Per-org weekly schedule (one window per day, v1) |
| `availability_blackouts` | One-off blocked date/time ranges |
| `bookings` | Visitor bookings with 8-char code |
| `organizations.timezone` | IANA timezone (default `Europe/Stockholm`) |
| `organizations.slot_duration_minutes` | Slot length: 15/30/60 min (default 30) |

All three booking tables are RLS-protected. Public inserts go through the `create_booking_atomic` SECURITY DEFINER function which uses a pg advisory lock to prevent double-booking.

### Booking Code Format

8 uppercase alphanumeric characters, excluding visually ambiguous chars (`0`, `O`, `1`, `I`, `L`). Unique per org. Up to 5 retries on collision.

Example: `K7PRNB4X`

### Availability Computation

`lib/booking/availability.ts` → `getAvailableSlots(orgId, fromDate, toDate)`

1. Reads `availability_rules` for the org
2. Reads `availability_blackouts` overlapping the range
3. Reads existing confirmed `bookings` in the range
4. Iterates each day (using noon-UTC to safely handle any timezone offset)
5. Generates slot times using a two-iteration UTC offset correction (handles DST transitions correctly via `Intl.DateTimeFormat`)
6. Filters slots: removes past slots (with 15-min buffer), blocked ranges, and existing bookings

### Booking Flow

```
Visitor picks slot (public /book/[orgSlug] page or chat widget)
  → POST /api/bookings { orgSlug, name, email, description, startAt }
    → createBooking() validates slot + availability rules
    → generateBookingCode() (retry on collision)
    → create_booking_atomic() RPC (advisory lock + overlap check + INSERT)
    → sendBookingConfirmationEmail() to visitor
    → sendBookingNotificationEmail() to org admin
  → Returns { bookingCode, startAt, endAt }
```

## Agent Integration

Two tools are registered on the RAG agent (`/api/chat`):

### `check_availability`

```json
{
  "fromDate": "YYYY-MM-DD",
  "toDate": "YYYY-MM-DD"   // optional, defaults to fromDate+7
}
```

Returns: available slots grouped by day with both UTC (`startAt`) and local time strings (`localTime`). The agent uses this to present options like "Tuesday 10:00 AM, 11:00 AM or Wednesday 9:00 AM."

### `create_booking`

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "description": "I'd like to discuss the enterprise pricing.",
  "startAt": "2024-03-19T08:00:00.000Z"
}
```

Returns: `{ booking_code, start_at, end_at, local_time }` on success or `{ error }` on conflict.

The agent is instructed to:
1. Always call `check_availability` before suggesting times
2. Collect name, email, and one-sentence description before booking
3. Confirm the chosen time with the visitor
4. Read back the booking code on success

## Pages

| URL | Access | Purpose |
|---|---|---|
| `/book/[orgSlug]` | Public | Multi-step booking wizard |
| `/bookings` | Dashboard | List + weekly calendar view |
| `/settings/availability` | Dashboard | Configure schedule + blackouts |

## API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/bookings/availability?orgSlug&from&to` | None | Free slots |
| `POST` | `/api/bookings` | None | Create booking |
| `DELETE` | `/api/bookings/[id]` | Org member | Cancel booking |
| `GET` | `/api/settings/availability` | Org member | Load settings |
| `POST` | `/api/settings/availability` | Org member | Save settings |

## Defaults

- **Slot duration**: 30 min (configurable per org: 15/30/60)
- **Timezone**: `Europe/Stockholm` (IANA, configurable per org)
- **Booking window**: Next 14 days shown on public page
- **Agent collection**: name + email + short description in-chat before booking
- **One window per day**: v1 — multiple windows per day is a future enhancement (noted in `availability_rules` schema)
- **Visitor cancel**: not exposed in v1; org admins can cancel from `/bookings` dashboard

## Email Notifications

Uses the existing Resend integration. If `RESEND_API_KEY` is not set, emails are silently skipped — the booking still succeeds.

- **Visitor**: confirmation with booking code, time, topic
- **Org admin**: notification with visitor details and booking code

The org admin email is looked up from `profiles` (first `admin` role member), falling back to the `EMAIL_TO` environment variable.
