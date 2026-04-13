# BJJ Open Mat Finder — Flutter Mobile App PRD

> **Date:** 2026-04-13
> **Backend API:** BJJ Open Mat Finder API (Elysia + BunJS + MongoDB)
> **Design System:** Google Stitch (token-based, 2026 visual trends)
> **Auth:** Auth0 Social Login Only (Google, Apple — no email/password)
> **Target:** iOS + Android via Flutter

---

## Executive Summary & Core Value Proposition

The BJJ Open Mat Finder mobile app is a next-generation companion for the Brazilian Jiu-Jitsu community. It connects practitioners to free, informal training sessions at gyms worldwide. The app replaces the fragmented discovery process (Instagram DMs, Facebook groups, word-of-mouth) with a single, location-aware, beautifully designed mobile experience.

**Core value:** Open your phone, see what's rolling near you today, check in with one tap, and navigate there. For gym owners: post your schedule once, fill your mats, and track attendance without spreadsheets.

The app is designed around 2026 UX principles — multimodal interaction (voice, haptics, sensors), emotionally aware theming, and zero-friction onboarding via social login. No passwords. No forms. Tap Google or Apple, and you're in.

---

## 1. Competitive Analysis Synthesis

### Future (Async Coaching)
- **What we take:** Personalized, async communication between gym owners and practitioners. Push notifications for session reminders and cancellations. Post-session summary cards with stats.
- **What we skip:** Live coaching (not relevant to open mats).

### Strava (Social Validation & GPS)
- **What we take:** Check-in streaks and training consistency badges. Social feed showing who trained where. GPS-based nearby discovery with distance sorting. Community challenges (e.g., "Train at 5 different gyms this month").
- **What we skip:** Route tracking (not applicable to mat-based training).

### Strong / Fitbod (Frictionless Logging)
- **What we take:** One-tap check-in during the session (no multi-step flows). Post-session rating and review with minimal friction (star tap + optional text). Adaptive UI that surfaces the most relevant open mat based on time, location, and history.
- **What we skip:** Rep/set tracking (not relevant).

---

## 2. Multimodal UX Strategy

### Voice (Speech + Intent)
- **"Hey, find open mats near me today"** — triggers nearby search with current GPS + today's date
- **"Check me in"** — when at a gym with an active session, auto-detects and checks in
- **"Navigate to [gym name]"** — opens Google Maps or Waze directions
- **Fallback:** If voice fails (loud gym), show a floating action button that does the same thing

### Vision (Camera)
- **QR code check-in** — gym owners can display a QR code; practitioners scan to check in instantly
- **Profile photo capture** — in-app camera for avatar upload

### Touch (Haptics)
- **Check-in confirmation** — strong haptic pulse on successful check-in
- **Nearby alert** — gentle haptic when passing within 1km of a gym with an active open mat
- **Rating tap** — light haptics on each star selection

### Sensors (Wearable Data)
- **Location services** — GPS for nearby search and geo-fenced check-in suggestions
- **Activity recognition** — detect when user arrives at a gym location, prompt check-in
- **Health integration** — optional Apple Health / Google Fit sync for training frequency tracking

### Temporal & Auditory Cues
- **Morning Mode (6 AM - 12 PM):** Energetic gradients, bold typography, "Today's sessions" front and center
- **Evening Mode (6 PM - 10 PM):** Warmer tones, calm transitions, "Winding down" messaging
- **Session active now:** Pulsing indicator with subtle audio chime when a favorited gym has a live session

---

## 3. Google Stitch Design System Architecture

### Design Token Structure (`design.md`)

```
tokens/
  colors/
    primary: #1A1A2E (deep navy — trust, discipline)
    secondary: #E94560 (coral red — energy, martial arts)
    surface: #F5F5F7 (light mode) / #0F0F23 (dark mode)
    accent: #16C79A (teal — success, check-in)
    warning: #F7B731
    error: #EB3B5A
    text-primary: #1A1A2E / #F5F5F7
    text-secondary: #6B7280
    glassmorphism-bg: rgba(255, 255, 255, 0.08)
    glassmorphism-border: rgba(255, 255, 255, 0.15)

  typography/
    display: Inter Display, 32px, weight 700
    heading: Inter, 24px, weight 600
    subheading: Inter, 18px, weight 500
    body: Inter, 16px, weight 400
    caption: Inter, 13px, weight 400
    mono: JetBrains Mono, 14px (for stats/numbers)

  spacing/
    xs: 4px
    sm: 8px
    md: 16px
    lg: 24px
    xl: 32px
    xxl: 48px

  radius/
    sm: 8px
    md: 12px
    lg: 16px
    xl: 24px
    pill: 9999px

  elevation/
    card: 0 2px 8px rgba(0,0,0,0.08)
    modal: 0 8px 32px rgba(0,0,0,0.16)
    glassmorphism: backdrop-filter blur(20px) + glassmorphism-bg

  motion/
    duration-fast: 150ms
    duration-normal: 300ms
    duration-slow: 500ms
    curve-default: cubic-bezier(0.4, 0, 0.2, 1)
    curve-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Visual Trends (2026 Dribbble)
- **Glassmorphism:** Frosted glass cards for session details overlaying map backgrounds
- **Organic minimalism:** Rounded shapes, generous whitespace, no sharp borders
- **High-contrast typography:** Large display text for gym names, belt ranks as colored badges
- **Emotionally aware modes:** Theme shifts based on time of day (see Temporal Cues above)
- **Micro-interactions:** Card expand/collapse with spring physics, check-in celebration animation

---

## 4. Auth0 Social Login User Flow

### Onboarding (3 screens max)
1. **Splash** — App logo + tagline ("Find your next roll") over a blurred mat photo. Auto-advances after 2s.
2. **Social Login** — Two buttons only: "Continue with Google" and "Continue with Apple". No email/password fields. No "sign up" vs "log in" distinction — Auth0 handles both.
3. **Role Selection** — "I'm a Practitioner" or "I'm a Gym Owner". Sets Auth0 user metadata. Practitioner is default.

### Auth0 Configuration
- **Connection:** Google OAuth 2.0 + Apple Sign In
- **Flow:** Authorization Code + PKCE (mobile-native)
- **Token storage:** Secure storage (flutter_secure_storage)
- **Silent auth:** Refresh tokens for seamless re-login
- **Logout:** Clear tokens + Auth0 `/v2/logout` redirect
- **First API call:** `GET /api/v1/auth/me` auto-creates user record from JWT claims

### Post-Login Flow
- If new user (no profile in API): prompt for displayName + beltRank (optional)
- If returning user: go straight to home screen
- Location permission request: after login, before home screen

---

## 5. Screen Map — All API Endpoints Covered

### Tab Bar Navigation (Practitioner)
1. **Discover** (home) — Map + nearby sessions
2. **Search** — List-based search with filters
3. **My Training** — Check-in history, stats, favorites
4. **Profile** — User profile, settings

### Tab Bar Navigation (Gym Owner)
1. **Dashboard** — Overview of gyms, sessions, attendance
2. **My Gyms** — Manage gyms
3. **Sessions** — Manage open mat sessions
4. **Profile** — User profile, settings

---

### Screen Details

#### S01: Splash Screen
- App logo, tagline, blurred background
- Auto-advance to login or home (if token valid)

#### S02: Social Login Screen
- "Continue with Google" button
- "Continue with Apple" button
- Auth0 Universal Login (WebView or native SDK)
- **API:** None (Auth0 handles)

#### S03: Role Selection Screen
- Two large cards: Practitioner / Gym Owner
- Sets role in Auth0 metadata
- **API:** `GET /api/v1/auth/me` (auto-creates user)

#### S04: Profile Setup Screen (new users only)
- displayName input
- beltRank picker (white/blue/purple/brown/black)
- Optional: bio, weight, avatar photo
- **API:** `PUT /api/v1/users/me`

#### S05: Discover Screen (Home — Practitioner)
- Full-bleed map with gym pins (color-coded by active/upcoming sessions)
- Bottom sheet: list of nearby open mats, sorted by distance
- "Today" / "This Week" toggle
- Current location dot with accuracy ring
- Tap pin → gym detail card slides up
- **API:** `GET /api/v1/open-mats/nearby?lat=X&lng=Y&radiusKm=Z&date=YYYY-MM-DD`
- **API:** `GET /api/v1/gyms/nearby?lat=X&lng=Y&radiusKm=Z`

#### S06: Search Screen
- Search bar with text input
- Filter chips: dayOfWeek, skillLevel (all/beginner/intermediate/advanced), gi/no-gi
- Results list with gym card + open mat schedule
- **API:** `GET /api/v1/open-mats` (with filters: dayOfWeek, skillLevel, isGiSession, gymId)
- **API:** `GET /api/v1/gyms` (with filters: city, state, country, search)

#### S07: Gym Detail Screen
- Hero image / gym photo
- Gym name, address, amenities badges
- "Get Directions" button (Google Maps / Waze chooser)
- Upcoming open mat schedule (list)
- Reviews section (from check-in reviews)
- Favorite heart toggle
- Contact info (phone, website)
- **API:** `GET /api/v1/gyms/:id`
- **API:** `GET /api/v1/gyms/:id/directions?mode=google|waze&fromLat=X&fromLng=Y`
- **API:** `POST /api/v1/gyms/:id/favorite`
- **API:** `DELETE /api/v1/gyms/:id/favorite`

#### S08: Open Mat Detail Screen
- Session title, description
- Gym name (tappable → S07)
- Date/time, duration
- Skill level badge, gi/no-gi badge
- Participant count (current / max)
- Host profile card
- Check-in button (if session is today and user hasn't checked in)
- Cancel button (if user is host)
- **API:** `GET /api/v1/open-mats/:id`
- **API:** `POST /api/v1/open-mats/:id/checkin`

#### S09: Check-In Success Screen
- Celebration animation (confetti / belt-colored burst)
- Strong haptic feedback
- Session summary card
- "Leave a review after your session" reminder
- Share button (generate shareable card image)
- **API:** `POST /api/v1/open-mats/:id/checkin` (response)

#### S10: Review Screen (post-session)
- Star rating (1-5, large tappable stars with haptics)
- Optional review text
- Submit button
- Accessible from check-in history (within 48h)
- **API:** `POST /api/v1/checkins/:id/review`

#### S11: My Training Screen (Practitioner)
- Training streak counter (days/weeks)
- Check-in history list (most recent first, paginated)
- Each entry: gym name, session title, date, rating given
- Stats cards: total sessions, gyms visited, average rating given
- **API:** `GET /api/v1/users/me/checkins?page=X&limit=Y`

#### S12: Favorites Screen
- List of favorited gyms with distance
- Swipe-to-remove
- Tap → S07 (Gym Detail)
- **API:** `GET /api/v1/users/me/favorites`
- **API:** `DELETE /api/v1/gyms/:id/favorite`

#### S13: Profile Screen
- Avatar, displayName, beltRank badge
- Bio
- Edit profile button → S14
- Settings section: notifications, location, theme, logout
- **API:** `GET /api/v1/users/me`

#### S14: Edit Profile Screen
- Edit: displayName, beltRank, weight, bio, avatarUrl, homeGymId
- Home gym picker (search gyms)
- Save button
- **API:** `PUT /api/v1/users/me`

#### S15: Public Profile Screen
- Another user's displayName, beltRank, avatarUrl
- Read-only
- Accessible from check-in lists, host cards
- **API:** `GET /api/v1/users/:id`

---

### Gym Owner Screens (Admin)

#### S20: Owner Dashboard Screen
- Summary cards: total gyms, total sessions, total check-ins this week
- Quick actions: "Add Gym", "Create Session"
- Recent activity feed (latest check-ins across all gyms)
- **API:** `GET /api/v1/gyms` (filtered by owner)
- **API:** `GET /api/v1/open-mats` (filtered by owner's gyms)

#### S21: My Gyms Screen (Admin)
- List of owner's gyms with status (active/deactivated)
- Tap → S22 (Gym Admin Detail)
- FAB: "Add New Gym"
- **API:** `GET /api/v1/gyms` (filtered by owner)

#### S22: Gym Admin Detail Screen
- All fields from S07 plus edit controls
- Edit gym info inline or via modal
- Open mat schedule management
- Attendance stats per session
- Deactivate gym button
- **API:** `GET /api/v1/gyms/:id`
- **API:** `PUT /api/v1/gyms/:id`
- **API:** `DELETE /api/v1/gyms/:id`

#### S23: Add/Edit Gym Screen
- Form: name, description, address, city, state, country, postalCode
- Google Places autocomplete for address
- Phone, website (optional)
- Amenities multi-select (showers, parking, water, changing_rooms, etc.)
- Save triggers Google Places validation
- **API:** `POST /api/v1/gyms` (create)
- **API:** `PUT /api/v1/gyms/:id` (edit)

#### S24: Session Management Screen (Admin)
- List of open mat sessions for a specific gym
- Each entry: title, day/time, recurring badge, participant count
- Tap → S25 (Session Admin Detail)
- FAB: "Create Open Mat"
- **API:** `GET /api/v1/open-mats?gymId=X`

#### S25: Session Admin Detail Screen
- Full session info + attendance list
- Check-in list with user names, belt ranks, ratings
- Edit session button → S26
- Cancel session button (soft-cancel)
- **API:** `GET /api/v1/open-mats/:id`
- **API:** `GET /api/v1/open-mats/:id/checkins?date=YYYY-MM-DD`
- **API:** `DELETE /api/v1/open-mats/:id`

#### S26: Create/Edit Open Mat Screen
- Form: title, description, dayOfWeek picker, startTime, endTime
- Recurring toggle (if not recurring, show date picker)
- Skill level selector (all/beginner/intermediate/advanced)
- Gi/No-gi toggle
- Max participants (optional, 0 = unlimited)
- Gym selector (from owner's gyms)
- **API:** `POST /api/v1/open-mats` (create)
- **API:** `PUT /api/v1/open-mats/:id` (edit)

#### S27: Attendance Screen (Admin)
- Date picker for session date
- List of checked-in users with: name, belt rank, check-in time, rating, review
- Export button (CSV)
- **API:** `GET /api/v1/open-mats/:id/checkins?date=YYYY-MM-DD`

---

### Shared Screens

#### S30: Directions Screen
- Chooser: Google Maps or Waze
- Launches external app with directions
- **API:** `GET /api/v1/gyms/:id/directions?mode=google|waze&fromLat=X&fromLng=Y`

#### S31: Notifications Screen
- Push notification history
- Types: session reminder, cancellation, new session at favorite gym, check-in streak milestone
- Tap → relevant detail screen

#### S32: Settings Screen
- Theme: Auto / Light / Dark
- Notification preferences
- Location precision (while using / always / never)
- Default search radius
- Logout button (clears Auth0 tokens)

#### S33: Error / Empty States
- No internet: offline indicator + cached data
- No results: illustration + "No open mats nearby" + "Expand your radius" button
- API error: retry button + "Something went wrong" message

---

## 6. High-Level Flutter App Architecture

```
lib/
  main.dart                     # Entry point, Auth0 init, router
  app/
    router.dart                 # GoRouter with auth guard
    theme.dart                  # Google Stitch theme (light/dark/time-aware)
    di.dart                     # GetIt service locator
  
  core/
    api/
      api_client.dart           # Dio HTTP client with Auth0 token interceptor
      endpoints.dart            # All endpoint URL constants
    auth/
      auth_service.dart         # Auth0 Flutter SDK wrapper
      auth_guard.dart           # Route guard for authenticated screens
    storage/
      secure_storage.dart       # Token + preferences storage
    location/
      location_service.dart     # GPS + permission handling
    haptics/
      haptic_service.dart       # Haptic feedback patterns
  
  features/
    discover/
      screens/
        discover_screen.dart    # S05: Map + nearby
      widgets/
        session_card.dart
        gym_pin.dart
      providers/
        discover_provider.dart  # Riverpod state
    
    search/
      screens/
        search_screen.dart      # S06
      widgets/
        filter_chips.dart
      providers/
        search_provider.dart
    
    gyms/
      screens/
        gym_detail_screen.dart  # S07
        add_gym_screen.dart     # S23
        gym_admin_screen.dart   # S22
      widgets/
        amenity_badge.dart
        directions_chooser.dart
      providers/
        gym_provider.dart
      models/
        gym.dart
    
    open_mats/
      screens/
        open_mat_detail.dart    # S08
        create_session.dart     # S26
        session_admin.dart      # S25
      widgets/
        skill_badge.dart
        participant_counter.dart
      providers/
        open_mat_provider.dart
      models/
        open_mat.dart
    
    checkins/
      screens/
        checkin_success.dart    # S09
        review_screen.dart      # S10
        attendance.dart         # S27
      widgets/
        star_rating.dart
        streak_counter.dart
      providers/
        checkin_provider.dart
      models/
        checkin.dart
    
    favorites/
      screens/
        favorites_screen.dart   # S12
      providers/
        favorites_provider.dart
    
    profile/
      screens/
        profile_screen.dart     # S13
        edit_profile.dart       # S14
        public_profile.dart     # S15
      widgets/
        belt_badge.dart
        avatar_picker.dart
      providers/
        profile_provider.dart
      models/
        user.dart
    
    admin/
      screens/
        dashboard.dart          # S20
        my_gyms.dart            # S21
        session_mgmt.dart       # S24
      providers/
        admin_provider.dart
    
    onboarding/
      screens/
        splash_screen.dart      # S01
        login_screen.dart       # S02
        role_select.dart        # S03
        profile_setup.dart      # S04
    
    settings/
      screens/
        settings_screen.dart    # S32
        notifications.dart      # S31

  shared/
    widgets/
      glass_card.dart           # Glassmorphism container
      shimmer_loader.dart       # Skeleton loading
      error_state.dart          # S33 error/empty states
      pull_to_refresh.dart
    models/
      paginated_response.dart
    utils/
      date_helpers.dart
      distance_formatter.dart
```

### State Management
- **Riverpod** for reactive state (providers per feature)
- **Dio** for HTTP with Auth0 token interceptor
- **GoRouter** for declarative routing with auth guards

### Key Packages
- `auth0_flutter` — Auth0 native SDK
- `flutter_map` or `google_maps_flutter` — Map display
- `geolocator` — GPS location
- `dio` — HTTP client
- `flutter_riverpod` — State management
- `go_router` — Navigation
- `flutter_secure_storage` — Token storage
- `cached_network_image` — Image caching
- `flutter_haptics` — Haptic feedback
- `lottie` — Animations (check-in celebration)
- `share_plus` — Social sharing
- `url_launcher` — Directions deep links

---

## 7. Asset Generation Strategy (Nano Banana 2 / Gemini 3 Flash Image)

### Pipeline
1. **Onboarding illustrations** — Generate 3 illustrations: "Discover" (map with pins), "Train" (practitioners rolling), "Connect" (community high-five). Style: flat illustration with Stitch color tokens.
2. **Empty state illustrations** — "No sessions nearby" (lonely gi on a mat), "No favorites yet" (empty heart), "No check-ins" (fresh white belt).
3. **Session thumbnails** — Dynamic backgrounds based on skill level: blue wave (beginner), purple gradient (intermediate), brown/black texture (advanced).
4. **Belt rank badges** — SVG badges for each belt color, used in profile and check-in lists.
5. **Achievement badges** — Training streak milestones: 7-day, 30-day, 100-day. Gym visitor badges: 5 gyms, 10 gyms, 25 gyms.
6. **Map pin icons** — Custom pins: green (active session now), blue (upcoming today), gray (no session today).

### Generation Prompts (for Nano Banana 2)
- Style reference: "Flat illustration, minimal, Google Material You aesthetic, warm gradients, no text, centered composition, 1024x1024"
- Color constraint: use only the Stitch design token palette

---

## 8. API Endpoint Coverage Matrix

| Screen | API Endpoint | Method | Auth Required |
|--------|-------------|--------|---------------|
| S02 Login | Auth0 SDK | — | No |
| S03 Role Select | `GET /api/v1/auth/me` | GET | Yes |
| S04 Profile Setup | `PUT /api/v1/users/me` | PUT | Yes |
| S05 Discover | `GET /api/v1/open-mats/nearby` | GET | No |
| S05 Discover | `GET /api/v1/gyms/nearby` | GET | No |
| S06 Search | `GET /api/v1/open-mats` | GET | No |
| S06 Search | `GET /api/v1/gyms` | GET | No |
| S07 Gym Detail | `GET /api/v1/gyms/:id` | GET | No |
| S07 Gym Detail | `POST /api/v1/gyms/:id/favorite` | POST | Yes |
| S07 Gym Detail | `DELETE /api/v1/gyms/:id/favorite` | DELETE | Yes |
| S07 Directions | `GET /api/v1/gyms/:id/directions` | GET | No |
| S08 Open Mat Detail | `GET /api/v1/open-mats/:id` | GET | No |
| S08 Check In | `POST /api/v1/open-mats/:id/checkin` | POST | Yes |
| S10 Review | `POST /api/v1/checkins/:id/review` | POST | Yes |
| S11 My Training | `GET /api/v1/users/me/checkins` | GET | Yes |
| S12 Favorites | `GET /api/v1/users/me/favorites` | GET | Yes |
| S13 Profile | `GET /api/v1/users/me` | GET | Yes |
| S14 Edit Profile | `PUT /api/v1/users/me` | PUT | Yes |
| S15 Public Profile | `GET /api/v1/users/:id` | GET | Yes |
| S20 Dashboard | `GET /api/v1/gyms` + `GET /api/v1/open-mats` | GET | Yes |
| S22 Gym Admin | `PUT /api/v1/gyms/:id` | PUT | Yes |
| S22 Gym Admin | `DELETE /api/v1/gyms/:id` | DELETE | Yes |
| S23 Add/Edit Gym | `POST /api/v1/gyms` | POST | Yes |
| S24 Session Mgmt | `GET /api/v1/open-mats?gymId=X` | GET | Yes |
| S25 Session Admin | `GET /api/v1/open-mats/:id/checkins` | GET | Yes |
| S25 Cancel Session | `DELETE /api/v1/open-mats/:id` | DELETE | Yes |
| S26 Create Session | `POST /api/v1/open-mats` | POST | Yes |
| S26 Edit Session | `PUT /api/v1/open-mats/:id` | PUT | Yes |
| S27 Attendance | `GET /api/v1/open-mats/:id/checkins?date=X` | GET | Yes |

**Coverage: 100% — all 25 API endpoints have at least one dedicated screen.**

---

## 9. Non-Functional Requirements

- **Offline support:** Cache last-viewed gyms, favorites, and check-in history. Show stale data with "Last updated X ago" badge.
- **Performance:** Cold start < 3s, screen transitions < 300ms, map interaction at 60fps.
- **Accessibility:** VoiceOver/TalkBack support on all screens, minimum 4.5:1 contrast ratio, touch targets >= 44x44.
- **Localization:** English first, structure for i18n (arb files).
- **Analytics:** Track screen views, check-in funnel, search-to-navigate conversion.
- **Deep links:** `openmat://gym/{id}`, `openmat://session/{id}` for sharing.
- **Push notifications:** Firebase Cloud Messaging for session reminders, cancellations, and streak milestones.
