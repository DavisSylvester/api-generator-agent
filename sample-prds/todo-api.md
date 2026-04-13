# Todo API - Product Requirements Document

## Overview
Build a simple Todo API with user authentication. Users can create, read, update, and delete todos. Each todo belongs to a user.

## Data Models

### User
- id: UUID (auto-generated)
- email: string (unique, required)
- name: string (required)
- createdAt: datetime

### Todo
- id: UUID (auto-generated)
- title: string (required, max 200 chars)
- description: string (optional, max 2000 chars)
- completed: boolean (default false)
- priority: enum (low, medium, high)
- userId: UUID (foreign key to User)
- createdAt: datetime
- updatedAt: datetime

## Endpoints

### Auth
- POST /api/v1/auth/register - Register a new user (email, name, password)
- POST /api/v1/auth/login - Login and receive a JWT token

### Users
- GET /api/v1/users/me - Get current user profile (requires auth)

### Todos
- GET /api/v1/todos - List all todos for the authenticated user (supports pagination: page, limit)
- POST /api/v1/todos - Create a new todo
- GET /api/v1/todos/:id - Get a specific todo
- PUT /api/v1/todos/:id - Update a todo
- DELETE /api/v1/todos/:id - Delete a todo
- PATCH /api/v1/todos/:id/complete - Toggle todo completion status

## Business Rules
- Users can only see and modify their own todos
- Pagination defaults: page=1, limit=20, max limit=100
- Todo title is required and cannot be empty
- Priority defaults to "medium" if not specified

## Non-Functional
- All responses in JSON
- Standard error format: { error: string, statusCode: number }
- Health check at GET /healthz
