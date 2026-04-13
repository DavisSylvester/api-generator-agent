# Beautician Scheduling Platform — PRD

## Overview

A multi-tenant appointment scheduling API for beauticians. Each beautician operates as an isolated tenant with their own customers, services, and availability. Clients browse available time slots and book appointments. The system enforces service durations and 1-hour grace periods between appointments.

## Core Entities

### Tenant (Beautician)
- id, name, email, passwordHash, businessName, timezone
- Each tenant is fully isolated — customers, services, appointments belong to one tenant only

### Customer
- id, tenantId, name, email, phone
- Scoped to a single tenant — no cross-tenant visibility

### Service
- id, tenantId, name, description, durationMinutes, priceInCents, isActive
- Duration is used to calculate time slot blocking
- Price supports discounts

### Availability
- id, tenantId, dayOfWeek (0-6), startTime (HH:mm), endTime (HH:mm), isRecurring
- Beauticians set weekly recurring availability windows
- Can also set one-off availability overrides with a specific date

### Appointment
- id, tenantId, customerId, serviceId, startTime (ISO datetime), endTime (ISO datetime), status (pending/confirmed/cancelled), notes
- endTime = startTime + service.durationMinutes
- 1-hour grace period after each appointment blocks the next slot

### DiscountCode
- id, tenantId, code, discountType (percentage/fixed), discountValue, expiresAt, maxUses, currentUses, isActive

## API Endpoints

### Auth
- POST /api/v1/auth/register — Register a new beautician (tenant)
- POST /api/v1/auth/login — Login, returns JWT

### Services (tenant-scoped, auth required)
- GET /api/v1/services — List all services for the authenticated tenant
- POST /api/v1/services — Create a service (name, duration, price)
- PUT /api/v1/services/:id — Update a service
- DELETE /api/v1/services/:id — Deactivate a service

### Availability (tenant-scoped, auth required)
- GET /api/v1/availability — Get current availability windows
- POST /api/v1/availability — Set an availability window
- DELETE /api/v1/availability/:id — Remove an availability window

### Customers (tenant-scoped, auth required)
- GET /api/v1/customers — List customers
- POST /api/v1/customers — Add a customer
- GET /api/v1/customers/:id — Get customer details

### Appointments (tenant-scoped)
- GET /api/v1/appointments — List appointments (auth required)
- POST /api/v1/appointments/book — Book an appointment (public, requires tenantId + customerId + serviceId + requestedTime)
- PATCH /api/v1/appointments/:id/cancel — Cancel an appointment (auth required)
- GET /api/v1/appointments/available-slots?tenantId=X&serviceId=Y&date=YYYY-MM-DD — Get available time slots for a date (public)

### Discount Codes (tenant-scoped, auth required)
- POST /api/v1/discounts — Create a discount code
- GET /api/v1/discounts — List discount codes
- POST /api/v1/discounts/validate — Validate a discount code and return adjusted price

## Business Rules

1. All data is tenant-scoped — queries always filter by tenantId
2. Available slots = availability windows minus booked appointments minus grace periods
3. Grace period is 60 minutes after each appointment's endTime
4. Appointments cannot overlap or fall outside availability windows
5. Discount codes are tenant-scoped and track usage counts
6. Services must have a minimum duration of 15 minutes
7. Availability windows must not overlap for the same tenant and day
