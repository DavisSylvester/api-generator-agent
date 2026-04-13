# BJJ Open Mat Finder — PRD

## Overview

A global API for the Brazilian Jiu-Jitsu community to discover, register, and navigate to Open Mat sessions. Open Mats are informal, instructor-free training sessions hosted at gyms where practitioners can roll/train without paying gym fees. Gym owners register their facilities and post Open Mat schedules; practitioners search by location and date to find the nearest sessions, get directions via Google Maps or Waze, and check in to track attendance.

The system uses **Auth0** for authentication with **OAuth 2.0** authorization code flow and **JWT** access tokens. Location data is verified against the **Google Places API** to ensure accuracy. All data is stored in **MongoDB**.

## Authentication & Authorization

- **Auth0** handles all user authentication — no local password storage
- OAuth 2.0 authorization code flow with PKCE for mobile/SPA clients
- Auth0 issues JWTs — the API validates them using Auth0's JWKS endpoint
- JWTs contain `sub` (Auth0 user ID), `roles` (array: `practitioner`, `gym_owner`, `admin`), `email`
- Two primary roles:
  - **practitioner** — can search open mats, check in, leave reviews, manage their profile
  - **gym_owner** — can register gyms, create/manage open mat sessions, view attendance
- Role is assigned at registration and stored in Auth0 user metadata
- All authenticated endpoints require a valid Bearer token in the Authorization header
- The API does NOT implement login/register endpoints — Auth0 handles that. The API only has a `/api/v1/auth/me` endpoint to return the current user profile from the local DB (created on first authenticated request)

## Core Entities

### User
- id, auth0Id (unique, from JWT sub), email, displayName, role (practitioner/gym_owner), beltRank (white/blue/purple/brown/black), weight (optional), bio (optional), avatarUrl (optional), homeGymId (optional ref to Gym), createdAt, updatedAt
- Created automatically on first authenticated API call if not already in DB
- auth0Id maps to the `sub` claim in the JWT

### Gym
- id, ownerId (ref to User), name, description, address, city, state, country, postalCode, location (GeoJSON Point: { type: "Point", coordinates: [lng, lat] }), googlePlaceId (verified against Google Places API), phone (optional), website (optional), amenities (array of strings: showers, parking, water, changing_rooms, etc.), isVerified (boolean, default false), createdAt, updatedAt
- Location stored as GeoJSON for MongoDB geospatial queries ($nearSphere)
- googlePlaceId is required — the API calls Google Places to validate the gym address and retrieve canonical lat/lng

### OpenMat
- id, gymId (ref to Gym), hostId (ref to User), title, description (optional), dayOfWeek (0=Sunday through 6=Saturday), startTime (HH:mm, 24h format), endTime (HH:mm, 24h format), isRecurring (boolean, default true), specificDate (ISO date string, only when isRecurring=false), maxParticipants (optional, 0 = unlimited), skillLevel (all/beginner/intermediate/advanced), isGiSession (boolean — gi or no-gi), isCancelled (boolean, default false), createdAt, updatedAt
- Recurring sessions repeat weekly on dayOfWeek
- One-off sessions use specificDate instead of dayOfWeek

### CheckIn
- id, openMatId (ref to OpenMat), userId (ref to User), sessionDate (ISO date string — the actual date of the session), checkedInAt (ISO datetime), rating (1-5, optional — set after session), review (string, optional — set after session), createdAt
- One check-in per user per openMat per sessionDate (unique compound index)
- Rating and review can be added/updated within 48 hours of the session

### Favorite
- id, userId (ref to User), gymId (ref to Gym), createdAt
- Unique compound index on userId + gymId — no duplicates

## API Endpoints

### Auth
- GET /api/v1/auth/me — Get or create current user profile from JWT claims (auth required). On first call, creates a User record from JWT sub/email. Returns the full User object.

### Users (auth required)
- GET /api/v1/users/me — Get current user profile
- PUT /api/v1/users/me — Update profile (displayName, beltRank, weight, bio, avatarUrl, homeGymId)
- GET /api/v1/users/:id — Get public profile of another user (returns displayName, beltRank, avatarUrl only)

### Gyms
- GET /api/v1/gyms — List gyms with optional filters (city, state, country, search by name). Supports pagination (page, limit). Public.
- GET /api/v1/gyms/nearby?lat=X&lng=Y&radiusKm=Z — Find gyms near coordinates, sorted by distance. radiusKm defaults to 25, max 100. Public. Returns distance in km for each result.
- POST /api/v1/gyms — Register a new gym (auth required, gym_owner role). Requires name, address, city, state, country, postalCode. API calls Google Places to validate address and store googlePlaceId + canonical coordinates.
- GET /api/v1/gyms/:id — Get gym details including upcoming open mats. Public.
- PUT /api/v1/gyms/:id — Update gym details (auth required, must be gym owner)
- DELETE /api/v1/gyms/:id — Soft-delete / deactivate a gym (auth required, must be gym owner)
- GET /api/v1/gyms/:id/directions?mode=google|waze&fromLat=X&fromLng=Y — Returns a redirect URL for Google Maps or Waze navigation to the gym. Public.

### Open Mats
- GET /api/v1/open-mats — List open mats with filters (dayOfWeek, skillLevel, isGiSession, gymId). Supports pagination. Public.
- GET /api/v1/open-mats/nearby?lat=X&lng=Y&radiusKm=Z&date=YYYY-MM-DD — Find open mats near coordinates on a specific date, sorted by distance. Matches both recurring sessions (by dayOfWeek) and one-off sessions (by specificDate). Default radius 25km. Public.
- POST /api/v1/open-mats — Create an open mat session (auth required, gym_owner role, must own the gym)
- GET /api/v1/open-mats/:id — Get open mat details with gym info and check-in count for next session. Public.
- PUT /api/v1/open-mats/:id — Update an open mat (auth required, must be host)
- DELETE /api/v1/open-mats/:id — Cancel an open mat (sets isCancelled=true, auth required, must be host)
- GET /api/v1/open-mats/:id/checkins?date=YYYY-MM-DD — List check-ins for a specific session date (auth required, must be host or gym owner)

### Check-Ins (auth required)
- POST /api/v1/open-mats/:id/checkin — Check in to an open mat for today. Fails if already checked in, session is cancelled, or max participants reached.
- POST /api/v1/checkins/:id/review — Add or update rating (1-5) and review text. Must be within 48 hours of session.
- GET /api/v1/users/me/checkins — List the current user's check-in history with gym and open mat details. Supports pagination.

### Favorites (auth required)
- POST /api/v1/gyms/:id/favorite — Add gym to favorites. Idempotent (no error if already favorited).
- DELETE /api/v1/gyms/:id/favorite — Remove gym from favorites
- GET /api/v1/users/me/favorites — List the current user's favorite gyms with distance if lat/lng provided

### Health
- GET /healthz — Health check, returns { status: "ok", statusCode: 200 }

## Business Rules

1. All authenticated endpoints validate the JWT against Auth0's JWKS — do NOT verify signatures locally with a secret; use jose library to fetch JWKS from Auth0
2. Users are auto-provisioned on first authenticated API call using JWT claims (sub, email)
3. Gym registration requires Google Places validation — the API sends the address to Google Places API and stores the returned placeId and coordinates. If Google Places cannot find the address, the request fails with 400.
4. Geospatial queries use MongoDB's `$nearSphere` with a `2dsphere` index on `location`
5. The `/nearby` endpoints return distance in kilometers calculated from the query point
6. Direction URLs are constructed (not proxied): Google Maps = `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`, Waze = `https://waze.com/ul?ll={lat},{lng}&navigate=yes`
7. Open mat search by date matches: recurring sessions where `dayOfWeek` matches the date's day, OR one-off sessions where `specificDate` matches the date
8. Check-in is only allowed on the day of the session (comparing sessionDate to current UTC date)
9. A user cannot check in twice to the same open mat on the same date
10. If maxParticipants > 0, check-in fails with 409 when the count is reached
11. Reviews can only be added within 48 hours after the session date
12. Rating must be an integer between 1 and 5
13. Gym owners can only modify/delete their own gyms and open mats
14. All list endpoints support pagination with page (default 1) and limit (default 20, max 100)
15. Soft-deleted gyms and cancelled open mats are excluded from public listings but visible to their owners
16. The `amenities` field is a free-form string array — no fixed enum, but common values are suggested in docs

## Non-Functional

- All responses in JSON
- Standard error format: `{ error: string, statusCode: number }`
- Health check at GET /healthz
- MongoDB with `2dsphere` index on `gyms.location`
- Auth0 JWKS endpoint cached with a TTL (use jose `createRemoteJWKSet`)
- Google Places API calls should be cached per address to avoid redundant lookups
- All timestamps in ISO 8601 UTC format
