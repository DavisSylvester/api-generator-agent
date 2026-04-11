# Bookmark Manager API - Product Requirements Document

## Overview

Build a bookmark manager API where users can save, organize, and search web bookmarks. Users register an account, create folders to organize bookmarks, and tag bookmarks for easy filtering. The API supports full CRUD on bookmarks with search by title, tag, and folder.

## Data Models

### User
- id: UUID (auto-generated)
- email: string (unique, required)
- displayName: string (required)
- passwordHash: string
- createdAt: datetime

### Folder
- id: UUID (auto-generated)
- userId: UUID (foreign key to User, required)
- name: string (required, max 100 chars)
- parentFolderId: UUID (optional, self-referencing for nested folders)
- createdAt: datetime

### Bookmark
- id: UUID (auto-generated)
- userId: UUID (foreign key to User, required)
- folderId: UUID (optional, foreign key to Folder)
- url: string (required, valid URL)
- title: string (required, max 200 chars)
- description: string (optional, max 1000 chars)
- tags: string array (default empty)
- isFavorite: boolean (default false)
- createdAt: datetime
- updatedAt: datetime

## Endpoints

### Auth
- POST /api/v1/auth/register - Register a new user (email, displayName, password)
- POST /api/v1/auth/login - Login and receive a JWT token

### Users
- GET /api/v1/users/me - Get current user profile (requires auth)

### Folders (auth required)
- GET /api/v1/folders - List all folders for the authenticated user
- POST /api/v1/folders - Create a folder (name, optional parentFolderId)
- PUT /api/v1/folders/:id - Rename a folder
- DELETE /api/v1/folders/:id - Delete a folder (moves contained bookmarks to unfiled)

### Bookmarks (auth required)
- GET /api/v1/bookmarks - List bookmarks with pagination and optional filters (folderId, tag, isFavorite, search)
- POST /api/v1/bookmarks - Create a bookmark (url, title, optional description, tags, folderId)
- GET /api/v1/bookmarks/:id - Get a single bookmark
- PUT /api/v1/bookmarks/:id - Update a bookmark
- DELETE /api/v1/bookmarks/:id - Delete a bookmark
- PATCH /api/v1/bookmarks/:id/favorite - Toggle favorite status

### Tags (auth required)
- GET /api/v1/tags - List all unique tags used by the authenticated user with counts

## Business Rules

1. Users can only access their own folders, bookmarks, and tags
2. Folder names must be unique within the same parent folder for a given user
3. Deleting a folder does not delete its bookmarks - they become unfiled (folderId set to null)
4. Bookmark URLs must be valid URLs (start with http:// or https://)
5. Tags are stored as lowercase, trimmed, and deduplicated
6. The search filter on GET /api/v1/bookmarks matches against title and description (case-insensitive)
7. Pagination defaults: page=1, limit=20, max limit=100
8. The tags endpoint returns each unique tag with a count of how many bookmarks use it

## Non-Functional

- All responses in JSON
- Health check at GET /healthz
- Standard error responses with statusCode and message
