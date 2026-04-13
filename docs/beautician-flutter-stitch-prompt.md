# Beautician Scheduling App — Google Stitch + Claude Code Prompts

## Part 1: Stitch UI Design Prompt

Paste this into Google Stitch to generate the UI screens:

---

Create a clean, modern mobile appointment scheduling application UI for beauticians. The app is a multi-tenant platform where each beautician (tenant) manages their own customers, services, availability, appointments, and discount codes. The design should feel professional yet warm — think soft pastels, rounded cards, elegant typography, and subtle shadows.

### Screen 1: Login / Registration
- A welcoming splash screen with the app logo
- Login form: email field, password field, "Sign In" button
- Registration form (separate screen): name, email, password, business name, timezone dropdown
- "Forgot password?" link below login
- Clean illustration or gradient background

### Screen 2: Dashboard / Home
- Welcome greeting with beautician's business name at the top
- Quick stats row: today's appointments count, total customers, active services
- "Today's Schedule" section showing upcoming appointments as timeline cards
  - Each card: customer name, service name, start time - end time, status badge (pending/confirmed/cancelled)
- Floating action button to quick-book an appointment
- Bottom navigation bar: Home, Services, Calendar, Customers, Profile

### Screen 3: Services Management
- List of services as cards, each showing:
  - Service name (bold)
  - Duration (e.g. "60 min")
  - Price (e.g. "$50.00")
  - Active/inactive toggle
- Swipe actions: edit, deactivate
- "Add Service" floating action button
- Add/Edit Service bottom sheet: name input, description textarea, duration slider (15-240 min), price input, active toggle

### Screen 4: Availability / Weekly Schedule
- Week view with day tabs (Mon-Sun)
- Each day shows availability slots as colored blocks on a timeline (8 AM - 10 PM)
- Tap to add a new availability window: start time picker, end time picker, recurring toggle
- Visual indicator for booked vs available time
- Empty state: "No availability set for this day"

### Screen 5: Appointments List & Booking
- Segmented tabs: Upcoming, Past, Cancelled
- Each appointment card:
  - Customer avatar/initials
  - Customer name
  - Service name and duration
  - Date and time
  - Status chip (pending = yellow, confirmed = green, cancelled = red)
  - Cancel button on pending/confirmed
- "Book Appointment" screen:
  - Customer selector (dropdown or search)
  - Service selector (shows duration and price)
  - Date picker
  - Available time slots grid (generated from availability minus existing bookings)
  - Notes text area
  - "Book" confirmation button
- Available slots shown as tappable time chips

### Screen 6: Customer Management
- Searchable list of customers
- Each customer card: name, email, phone, number of past appointments
- Tap to view customer detail: contact info, appointment history list
- "Add Customer" floating action button
- Add/Edit form: name, email, phone

### Screen 7: Discount Codes
- List of discount codes as cards:
  - Code string (bold, monospace)
  - Type badge: "20% off" or "$10 off"
  - Usage: "5/10 used"
  - Expiry date
  - Active/expired status
- "Create Code" floating action button
- Create form: code string, discount type (percentage/fixed) toggle, value input, expiry date picker, max uses input
- "Validate Code" section: input field + validate button showing result

### Screen 8: Profile / Settings
- Business avatar and name at top
- Business info section: name, email, timezone
- App settings: dark mode toggle, notification preferences
- "Logout" button at bottom
- App version info

### Design Guidelines
- Color palette: primary purple/lavender, accent coral/pink, neutral grays, white cards
- Typography: clean sans-serif, 14-16px body, 20-24px headings
- All cards with 12px border radius and subtle elevation
- Status badges as rounded pills with semantic colors
- Consistent 16px horizontal padding
- Bottom sheet modals for create/edit forms
- Pull-to-refresh on all list screens
- Skeleton loading states for async data
- Empty states with friendly illustrations

---

## Part 2: Claude Code Build Prompt

After exporting Stitch designs as images, create your Flutter project and give Claude Code this prompt:

---

Build a Flutter mobile application for the Beautician Scheduling Platform. I have UI designs from Google Stitch (see the attached screenshots). Use them as the visual reference for all screens.

The app connects to an existing Elysia + BunJS REST API running at `http://localhost:3111`. Follow Clean Architecture with presentation, domain, and data layers. Use Riverpod for state management and go_router for navigation.

### API Base URL

`http://localhost:3111` (configurable via `--dart-define=API_URL=https://production.example.com`)

### Authentication Flow

- **Register**: `POST /api/v1/auth/register` — returns `{ data: { token: "JWT" } }`
- **Login**: `POST /api/v1/auth/login` — returns `{ data: { token: "JWT" } }`
- Store JWT in `flutter_secure_storage`
- Attach `Authorization: Bearer <token>` to all authenticated requests via Dio interceptor
- On 401 response, clear token and redirect to login
- The logged-in user IS the tenant (beautician). Extract `tenantId` from the JWT `sub` claim. Pass it in request bodies where required — the user never enters it manually.

### API Endpoints

#### Auth (No token required)

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| POST | `/api/v1/auth/register` | `{ name, email, password, businessName, timezone }` | `{ data: { token } }` (201) |
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ data: { token } }` (200) |

#### Services (Bearer token required)

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/services` | — | `Service[]` |
| POST | `/api/v1/services` | `{ tenantId, name, description?, durationMinutes, priceInCents, isActive? }` | `Service` (201) |
| PUT | `/api/v1/services/:id` | Partial fields to update | `Service` (200) |
| DELETE | `/api/v1/services/:id` | — | `{ data: null }` (200) |

```json
Service: {
  "id": "uuid",
  "tenantId": "uuid",
  "name": "Haircut",
  "description": "Classic haircut and styling",
  "durationMinutes": 60,
  "priceInCents": 5000,
  "isActive": true,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

#### Availability (Bearer token required)

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/availability` | — | `Availability[]` |
| POST | `/api/v1/availability` | `{ dayOfWeek, startTime, endTime, isRecurring? }` | `Availability` (201) |
| DELETE | `/api/v1/availability/:id` | — | `{ data: { deleted: true } }` (200) |

```json
Availability: {
  "id": "uuid",
  "tenantId": "uuid",
  "dayOfWeek": "Monday",
  "startTime": "09:00",
  "endTime": "17:00",
  "isRecurring": true
}
```
dayOfWeek enum: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday

#### Appointments

| Method | Path | Auth | Request Body | Response |
|--------|------|------|-------------|----------|
| GET | `/api/v1/appointments` | Yes | — | `Appointment[]` |
| POST | `/api/v1/appointments/book` | **No** | `{ tenantId, customerId, serviceId, startTime, endTime, notes? }` | `Appointment` (201) |
| GET | `/api/v1/appointments/available-slots?tenantId=X` | **No** | — | `Availability[]` |
| PATCH | `/api/v1/appointments/cancel` | Yes | `{ id }` | `Appointment` (200) |

```json
Appointment: {
  "id": "uuid",
  "tenantId": "uuid",
  "customerId": "uuid",
  "serviceId": "uuid",
  "startTime": "2026-04-15T10:00:00.000Z",
  "endTime": "2026-04-15T11:00:00.000Z",
  "status": "pending|confirmed|cancelled|completed",
  "notes": "string or null"
}
```

#### Discounts (Bearer token required)

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/discounts` | — | `DiscountCode[]` |
| POST | `/api/v1/discounts` | `{ tenantId, code, discountType, discountValue, expiresAt, maxUses, isActive? }` | `DiscountCode` (201) |
| POST | `/api/v1/discounts/validate` | `{ discountId }` | `{ data: { valid: true } }` (200) |

```json
DiscountCode: {
  "_id": "string",
  "tenantId": "uuid",
  "code": "SUMMER20",
  "discountType": "percentage|fixed",
  "discountValue": 20,
  "expiresAt": "ISO8601",
  "maxUses": 100,
  "currentUses": 5,
  "isActive": true
}
```

#### Health Check

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/health` | No | `{ "status": "ok" }` |

### API Response Envelope

All endpoints return this shape:
```json
{
  "statusCode": 200,
  "message": "string",
  "date": "ISO8601",
  "source": "/api/v1/services",
  "data": <payload here>
}
```
List endpoints return arrays directly (not wrapped). Error responses use the same envelope with the error message in `message`.

### Dart Data Models

Generate these with `json_serializable` using `@JsonSerializable(fieldRename: FieldRename.snake)`:

- **User** — id, name, email, businessName, timezone
- **Service** — id, tenantId, name, description?, durationMinutes, priceInCents, isActive, createdAt, updatedAt
- **Availability** — id, tenantId, dayOfWeek, startTime, endTime, isRecurring
- **Appointment** — id, tenantId, customerId, serviceId, startTime, endTime, status, notes?
- **DiscountCode** — id, tenantId, code, discountType, discountValue, expiresAt, maxUses, currentUses, isActive
- **Customer** — id, tenantId, name, email, phone?

### Packages

```yaml
dependencies:
  flutter_riverpod: latest
  go_router: latest
  dio: latest
  flutter_secure_storage: latest
  json_annotation: latest
  intl: latest
  flutter_slidable: latest

dev_dependencies:
  json_serializable: latest
  build_runner: latest
```

### Screens to Build

1. **Splash** — check for stored token, navigate to login or home
2. **Login** — email + password, link to register
3. **Register** — name, email, password, business name, timezone
4. **Home/Dashboard** — today's appointments, quick stats, bottom nav
5. **Services** — CRUD list with add/edit bottom sheet
6. **Availability** — weekly day tabs, time slot management
7. **Appointments** — tabbed list (upcoming/past/cancelled), booking flow with slot picker
8. **Customers** — searchable list, detail view, add/edit
9. **Discounts** — code list, create form, validate
10. **Profile/Settings** — business info, logout

### Business Logic

- All prices stored in cents. Display as dollars: `(priceInCents / 100).toStringAsFixed(2)`
- Availability times are "HH:MM" 24h strings. Appointment times are ISO 8601 UTC. Display in local timezone.
- Available slots = availability windows minus booked appointments minus 60-min grace periods
- Appointments cannot overlap or fall outside availability windows
- tenantId is injected from the JWT — never shown to or entered by the user

---

## Part 3: CLAUDE.md for Flutter Project

Save this as `CLAUDE.md` in the root of your Flutter project:

---

```markdown
# Beautician Scheduling — Flutter App

## Stack
- Flutter (latest stable)
- Dart 3.x
- Riverpod for state management
- go_router for navigation
- Dio for HTTP
- flutter_secure_storage for JWT persistence
- json_serializable for model serialization

## Architecture
Clean Architecture with three layers:
- **data/** — API clients, repositories, DTOs with json_serializable
- **domain/** — entities, use cases, repository interfaces
- **presentation/** — screens, widgets, Riverpod providers

## API
- Base URL: configurable via `--dart-define=API_URL=http://localhost:3111`
- Auth: JWT Bearer token in Authorization header
- Response envelope: `{ statusCode, message, date, source, data }`
- All prices in cents — display as dollars (divide by 100)
- All appointment times in UTC ISO 8601 — display in local timezone
- tenantId extracted from JWT sub claim — never entered by user

## Conventions
- Use `@JsonSerializable(fieldRename: FieldRename.snake)` for all models
- Use `AsyncValue` from Riverpod for loading/error/data states
- Use `go_router` with auth redirect — if no token, redirect to /login
- Dio interceptor attaches Bearer token to all requests except auth and public endpoints
- On 401 response: clear stored token, redirect to login
- Pull-to-refresh on all list screens
- Bottom sheets for create/edit forms
- Slidable list items for swipe actions (edit, delete)

## Public Endpoints (no token)
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/appointments/book
- GET /api/v1/appointments/available-slots
- GET /health

## Authenticated Endpoints (Bearer token required)
All other /api/v1/* endpoints

## Running the API
```bash
cd ../api-generator-agent/.workspace/14bee6f2-c39d-4796-a5fe-878d422d429e/output
bun install
MONGODB_URI=mongodb://localhost:27018/beautician JWT_SECRET=dev-secret PORT=3111 bun run dev
```

## Running the Flutter App
```bash
flutter run --dart-define=API_URL=http://localhost:3111
```
```
