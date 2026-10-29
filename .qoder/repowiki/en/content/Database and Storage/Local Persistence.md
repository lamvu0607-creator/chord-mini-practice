# Local persistence Integration

<cite>
**Referenced Files in This Document**
- [local-persistence.json](file://local-persistence/local-persistence.json)
- [sqlite.rules](file://local-persistence/sqlite.rules)
- [storage.rules](file://local-persistence/storage.rules)
- [sqlite.indexes.json](file://local-persistence/sqlite.indexes.json)
- [.local-persistencerc](file://.local-persistencerc)
- [local-persistence.ts](file://src/config/local-persistence.ts)
- [Local persistenceInitializer.tsx](file://src/components/layout/Local persistenceInitializer.tsx)
- [clientOnlyLocal persistence.ts](file://src/utils/clientOnlyLocal persistence.ts)
- [local-persistenceConnectionManager.ts](file://src/utils/local-persistenceConnectionManager.ts)
- [sqliteService.ts](file://src/services/local-persistence/sqliteService.ts)
- [local-persistenceStorageService.ts](file://src/services/local-persistence/local-persistenceStorageService.ts)
- [local-persistenceService.ts](file://src/services/local-persistence/local-persistenceService.ts)
</cite>

## Update Summary
**Changes Made**
- Enhanced SQLite transcription data structure documentation to include audioUrl field
- Updated SQLite service documentation to reflect comprehensive caching of both analysis results and audio sources
- Added detailed explanation of audioUrl field usage for cached audio file URL storage
- Updated security rules documentation to accommodate the new audioUrl field
- Enhanced troubleshooting guidance for audio caching scenarios

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the Local persistence integration in ChordMiniApp, covering configuration, database structure, storage setup, security rules, initialization, connection management, real-time behavior, and operational guidance. The integration has been enhanced with improved transcription data structure that includes audioUrl field for comprehensive caching of both analysis results and audio sources, enabling more efficient audio playback and reduced bandwidth usage.

## Project Structure
Local persistence-related configuration and integration are organized as follows:
- Local persistence CLI configuration and security/indexes files under the local-persistence/ directory
- Runtime client-side initialization and utilities under src/config/local-persistence.ts
- Client component that preloads Local persistence under src/components/layout/Local persistenceInitializer.tsx
- Utilities for client-only operations and connection monitoring under src/utils/*
- Services for SQLite and Storage under src/services/local-persistence/*

```mermaid
graph TB
subgraph "Local persistence Config"
FJSON["local-persistence.json"]
FS_RULES["sqlite.rules"]
STOR_RULES["storage.rules"]
IDX["sqlite.indexes.json"]
RC[".local-persistencerc"]
end
subgraph "Client Runtime"
FBTS["src/config/local-persistence.ts"]
INIT["src/components/layout/Local persistenceInitializer.tsx"]
UTIL1["src/utils/clientOnlyLocal persistence.ts"]
UTIL2["src/utils/local-persistenceConnectionManager.ts"]
end
subgraph "Services"
FSS["src/services/local-persistence/sqliteService.ts"]
FSTS["src/services/local-persistence/local-persistenceStorageService.ts"]
FBS["src/services/local-persistence/local-persistenceService.ts"]
end
FJSON --> FS_RULES
FJSON --> STOR_RULES
FJSON --> IDX
RC --> FJSON
INIT --> FBTS
UTIL1 --> FBTS
UTIL2 --> FBTS
FBTS --> FSS
FBTS --> FSTS
FBTS --> FBS
```

**Diagram sources**
- [local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)
- [sqlite.indexes.json:1-38](file://local-persistence/sqlite.indexes.json#L1-L38)
- [.local-persistencerc:1-6](file://.local-persistencerc#L1-L6)
- [local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [Local persistenceInitializer.tsx:1-62](file://src/components/layout/Local persistenceInitializer.tsx#L1-L62)
- [clientOnlyLocal persistence.ts:1-146](file://src/utils/clientOnlyLocal persistence.ts#L1-L146)
- [local-persistenceConnectionManager.ts:1-163](file://src/utils/local-persistenceConnectionManager.ts#L1-L163)
- [sqliteService.ts:1-1178](file://src/services/local-persistence/sqliteService.ts#L1-L1178)
- [local-persistenceStorageService.ts:1-414](file://src/services/local-persistence/local-persistenceStorageService.ts#L1-L414)
- [local-persistenceService.ts:1-156](file://src/services/local-persistence/local-persistenceService.ts#L1-L156)

**Section sources**
- [local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [Local persistenceInitializer.tsx:1-62](file://src/components/layout/Local persistenceInitializer.tsx#L1-L62)

## Core Components
- Local persistence configuration loader and initialization with runtime config support
- Authentication with anonymous fallback and persistence
- IP rate limiting integration via reCAPTCHA v3
- SQLite service for transcriptions, melody, and enrichment operations with enhanced audio caching
- Storage service for audio/video uploads and metadata resolution
- Client-only wrappers and connection monitoring utilities

Key responsibilities:
- src/config/local-persistence.ts: Initializes Local persistence, sets persistence, handles anonymous auth, and exposes helpers for services
- src/services/local-persistence/sqliteService.ts: Manages transcription and melody documents, caching, and batch operations with audioUrl field support
- src/services/local-persistence/local-persistenceStorageService.ts: Handles uploads, URL generation, and file discovery
- src/utils/local-persistenceConnectionManager.ts: Monitors activity, tests connectivity, and refreshes connections as needed
- src/utils/clientOnlyLocal persistence.ts: Guards client-only imports and operations

**Section sources**
- [local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [sqliteService.ts:1-1178](file://src/services/local-persistence/sqliteService.ts#L1-L1178)
- [local-persistenceStorageService.ts:1-414](file://src/services/local-persistence/local-persistenceStorageService.ts#L1-L414)
- [clientOnlyLocal persistence.ts:1-146](file://src/utils/clientOnlyLocal persistence.ts#L1-L146)
- [local-persistenceConnectionManager.ts:1-163](file://src/utils/local-persistenceConnectionManager.ts#L1-L163)

## Architecture Overview
The Local persistence integration follows a layered approach:
- Configuration layer: local-persistence.json points to SQLite rules, indexes, and Storage rules
- Client initialization: src/config/local-persistence.ts loads runtime config, initializes app, auth, and IP rate limiting
- Services: SQLite and Storage services encapsulate CRUD and caching logic with enhanced audio URL caching
- Utilities: Client-only wrappers and connection manager ensure robustness and resilience

```mermaid
sequenceDiagram
participant Browser as "Browser"
participant Init as "Local persistenceInitializer.tsx"
participant Config as "src/config/local-persistence.ts"
participant Auth as "Local persistence Auth"
participant RateLimit as "IP rate limiting"
participant SQLite as "SQLite Service"
participant Storage as "Storage Service"
Browser->>Init : Mount component
Init->>Config : preloadLocal persistence()
Config->>Config : load runtime config
Config->>Auth : setupAuthPersistence()
Config->>Auth : setupAnonymousAuth()
Config->>RateLimit : initializeRateLimit()
Init->>SQLite : initTranslationsCollection()
Init->>Storage : (lazy usage)
```

**Diagram sources**
- [Local persistenceInitializer.tsx:1-62](file://src/components/layout/Local persistenceInitializer.tsx#L1-L62)
- [local-persistence.ts:43-125](file://src/config/local-persistence.ts#L43-L125)
- [local-persistence.ts:127-197](file://src/config/local-persistence.ts#L127-L197)
- [local-persistence.ts:475-514](file://src/config/local-persistence.ts#L475-L514)

## Detailed Component Analysis

### Local persistence Configuration and Deployment
- local-persistence.json defines SQLite rules, indexes, and Storage rules locations
- .local-persistencerc binds the project ID for CLI deployments
- sqlite.indexes.json declares composite indexes for transcriptions queries
- sqlite.rules and storage.rules define access policies for documents and files

Operational notes:
- Use Local persistence CLI from the repository root to deploy rules and indexes
- Indexes are configured for transcriptions collection group queries

**Section sources**
- [local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [.local-persistencerc:1-6](file://.local-persistencerc#L1-L6)
- [sqlite.indexes.json:1-38](file://local-persistence/sqlite.indexes.json#L1-L38)
- [sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

### SQLite Database Structure and Indexing
Collections and schemas:
- transcriptions: Stores beat/chord analysis with fields for models, beats, chords, synchronized chords, timestamps, and enrichment metadata, including enhanced audioUrl field for cached audio file URLs
- melody: Stores Sheet Sage melody transcription results
- translations, translationCache: Caches translated lyrics
- transcriptionCache: Caches raw transcription outputs
- lyrics: Public cache for Music.AI transcriptions
- keyDetections: Caches key detection results
- audioCache: Legacy cache for audio metadata
- admin, metrics: Admin-only and metrics collections
- feedback, errorLogs: Private collections for submissions and logs
- segmentationJobs: Async job state and results for SongFormer

Enhanced transcription data structure with audioUrl field:
The transcription schema now includes an audioUrl field that enables comprehensive caching of both analysis results and audio sources. This field stores the URL of cached audio files, allowing the application to serve audio content directly from local audio storage while maintaining analysis data in SQLite.

Indexing strategy:
- Composite indexes for transcriptions collection group:
  - isPrimaryVariant ascending, createdAt descending
  - isPrimaryVariant ascending, searchableKeys array contains, createdAt descending

These indexes optimize queries filtering by primary variant and searchable keys.

**Section sources**
- [sqlite.rules:124-218](file://local-persistence/sqlite.rules#L124-L218)
- [sqlite.indexes.json:1-38](file://local-persistence/sqlite.indexes.json#L1-L38)
- [sqliteService.ts:64-108](file://src/services/local-persistence/sqliteService.ts#L64-L108)
- [sqliteService.ts:893-896](file://src/services/local-persistence/sqliteService.ts#L893-L896)

### local audio storage Configuration
Storage paths and rules:
- audio/: public read; write validated by content-type and size; filenames must include the video ID in brackets
- video/: optional; public read; write validated by content-type and size
- temp/: read allowed for URL resolution; write/update for temporary offload uploads; delete allowed for cleanup

Security and access control:
- Anonymous uploads permitted for audio files with strict validation
- Deletion is disabled for audio and video buckets by default
- Temporary path allows controlled uploads for processing

**Section sources**
- [storage.rules:44-84](file://local-persistence/storage.rules#L44-L84)
- [local-persistenceStorageService.ts:196-301](file://src/services/local-persistence/local-persistenceStorageService.ts#L196-L301)

### Security Rules Implementation
Authentication requirements:
- Anonymous authentication is supported and used for cold start scenarios
- Admin-only operations restrict reads/writes to trusted emails
- Public caches allow unauthenticated reads; writes are relaxed or temporarily permissive to isolate validation issues

Role-based access control:
- Admin collection: only specific emails can read/write
- Metrics: read publicly, write restricted to admins
- Feedback and error logs: private creation with rate limits

Data protection measures:
- Field-level validation functions enforce shape and sizes
- Rate limiting helper included for basic throttling
- Deletion controls enforced for sensitive collections

**Section sources**
- [sqlite.rules:64-286](file://local-persistence/sqlite.rules#L64-L286)
- [storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

### Local persistence Initialization and Connection Management
Initialization process:
- Runtime config loading from /api/config on client or process.env on server
- Lazy initialization of SQLite, Storage, and Auth
- IP rate limiting with reCAPTCHA v3; debug token enabled locally
- Anonymous authentication with exponential backoff retries and extended timeouts for cold starts

Connection management:
- Activity timestamps and periodic health checks
- Connection refresh on staleness detection
- Operation wrapper with retries and timeouts

**Section sources**
- [local-persistence.ts:43-125](file://src/config/local-persistence.ts#L43-L125)
- [local-persistence.ts:147-252](file://src/config/local-persistence.ts#L147-L252)
- [local-persistence.ts:475-537](file://src/config/local-persistence.ts#L475-L537)
- [Local persistenceInitializer.tsx:1-62](file://src/components/layout/Local persistenceInitializer.tsx#L1-L62)
- [local-persistenceConnectionManager.ts:1-163](file://src/utils/local-persistenceConnectionManager.ts#L1-L163)

### Real-Time and Offline Persistence
Observations:
- SQLite service does not explicitly set offline persistence; caching relies on local memory and client-side caches
- Authentication persistence is configured with browser local persistence to survive refreshes
- Connection monitoring proactively detects and refreshes stale connections

Implications:
- Real-time listeners are not implemented in the reviewed code; offline persistence is not configured in SQLite
- Robust retry and fallback strategies are implemented for authentication and network failures

**Section sources**
- [local-persistence.ts:127-145](file://src/config/local-persistence.ts#L127-L145)
- [local-persistenceConnectionManager.ts:1-163](file://src/utils/local-persistenceConnectionManager.ts#L1-L163)

### SQLite Service: Transcriptions and Melody
Responsibilities:
- Normalize and sanitize transcription data including audioUrl field for cached audio file URLs
- Retrieve, save, and enrich transcription documents
- Increment usage counters atomically
- Sync homepage variant metadata across multiple transcription variants
- Handle CORS/network errors by disabling SQLite for the session

Enhanced audio caching capabilities:
The SQLite service now supports comprehensive audio caching through the audioUrl field. This enhancement enables the application to store and retrieve cached audio file URLs alongside analysis data, reducing bandwidth usage and improving playback performance.

Patterns:
- Cache-first retrieval with in-memory cache
- Batch writes for metadata synchronization
- Defensive normalization for beat numbers, chord sequences, and key/modulation fields
- Audio URL validation and sanitization for reliable caching

**Section sources**
- [sqliteService.ts:64-108](file://src/services/local-persistence/sqliteService.ts#L64-L108)
- [sqliteService.ts:203-248](file://src/services/local-persistence/sqliteService.ts#L203-L248)
- [sqliteService.ts:405-469](file://src/services/local-persistence/sqliteService.ts#L405-L469)
- [sqliteService.ts:524-577](file://src/services/local-persistence/sqliteService.ts#L524-L577)
- [sqliteService.ts:688-747](file://src/services/local-persistence/sqliteService.ts#L688-L747)
- [sqliteService.ts:893-896](file://src/services/local-persistence/sqliteService.ts#L893-L896)

### Storage Service: Uploads and Metadata
Responsibilities:
- Upload audio/video files with validated filenames and content types
- Generate public download URLs
- Discover existing files by video ID pattern
- Delete files by storage path
- Skip deprecated metadata writes to SQLite for audio files

Patterns:
- Unique filename pattern with bracketed video ID and timestamp
- Blob conversion for ArrayBuffer inputs
- Graceful error handling without falling back to local storage

**Section sources**
- [local-persistenceStorageService.ts:196-301](file://src/services/local-persistence/local-persistenceStorageService.ts#L196-L301)
- [local-persistenceStorageService.ts:322-346](file://src/services/local-persistence/local-persistenceStorageService.ts#L322-L346)
- [local-persistenceStorageService.ts:385-413](file://src/services/local-persistence/local-persistenceStorageService.ts#L385-L413)

### Legacy Service: Public Cache Writes
The legacy local-persistenceService.ts demonstrates public cache writes to SQLite and Storage for lyrics and audio metadata. While the current architecture emphasizes client-side caching and Storage as the source of truth, this service illustrates historical patterns.

**Section sources**
- [local-persistenceService.ts:34-72](file://src/services/local-persistence/local-persistenceService.ts#L34-L72)
- [local-persistenceService.ts:110-123](file://src/services/local-persistence/local-persistenceService.ts#L110-L123)
- [local-persistenceService.ts:132-153](file://src/services/local-persistence/local-persistenceService.ts#L132-L153)

## Dependency Analysis
High-level dependencies among Local persistence integration modules:

```mermaid
graph LR
RC[".local-persistencerc"] --> FJSON["local-persistence.json"]
FJSON --> FS_RULES["sqlite.rules"]
FJSON --> STOR_RULES["storage.rules"]
FJSON --> IDX["sqlite.indexes.json"]
INIT["Local persistenceInitializer.tsx"] --> CFG["src/config/local-persistence.ts"]
UTIL1["clientOnlyLocal persistence.ts"] --> CFG
UTIL2["local-persistenceConnectionManager.ts"] --> CFG
CFG --> FSS["sqliteService.ts"]
CFG --> FSTS["local-persistenceStorageService.ts"]
CFG --> FBS["local-persistenceService.ts"]
```

**Diagram sources**
- [.local-persistencerc:1-6](file://.local-persistencerc#L1-L6)
- [local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)
- [sqlite.indexes.json:1-38](file://local-persistence/sqlite.indexes.json#L1-L38)
- [Local persistenceInitializer.tsx:1-62](file://src/components/layout/Local persistenceInitializer.tsx#L1-L62)
- [local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [clientOnlyLocal persistence.ts:1-146](file://src/utils/clientOnlyLocal persistence.ts#L1-L146)
- [local-persistenceConnectionManager.ts:1-163](file://src/utils/local-persistenceConnectionManager.ts#L1-L163)
- [sqliteService.ts:1-1178](file://src/services/local-persistence/sqliteService.ts#L1-L1178)
- [local-persistenceStorageService.ts:1-414](file://src/services/local-persistence/local-persistenceStorageService.ts#L1-L414)
- [local-persistenceService.ts:1-156](file://src/services/local-persistence/local-persistenceService.ts#L1-L156)

**Section sources**
- [local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [sqliteService.ts:1-1178](file://src/services/local-persistence/sqliteService.ts#L1-L1178)
- [local-persistenceStorageService.ts:1-414](file://src/services/local-persistence/local-persistenceStorageService.ts#L1-L414)

## Performance Considerations
- Indexes: Composite indexes on transcriptions improve query performance for primary variant and searchable keys
- Caching: SQLite service uses in-memory cache to avoid redundant reads, enhanced with audioUrl field for comprehensive audio caching
- Connection monitoring: Periodic checks and refresh mitigate inactivity-induced staleness
- Client-only wrappers: Guard against SSR issues and provide graceful fallbacks
- Upload optimization: Unique filenames and metadata retrieval minimize redundant operations
- Audio caching: The audioUrl field enables efficient audio playback by serving cached audio files directly from local audio storage

## Troubleshooting Guide
Common issues and resolutions:
- CORS or network errors accessing SQLite: The SQLite service disables SQLite for the session upon detecting CORS/network errors; verify CORS configuration and network connectivity
- Anonymous authentication failures: Check Local persistence Console for anonymous auth enabled; review retry logs and error codes
- Stale connections: Use connection monitoring utilities to detect and refresh stale connections
- Missing runtime config: Ensure environment variables are provided at runtime; initialization warns when required variables are missing
- Storage upload failures: Validate content type and size constraints; confirm filename pattern includes the video ID in brackets
- Audio caching issues: Verify audioUrl field is properly populated in transcription documents; check local audio storage permissions for cached audio files

Operational tips:
- Use IP rate limiting in production to mitigate abuse
- Monitor admin and metrics collections for anomalies
- Keep security rules aligned with intended access patterns
- Monitor audioUrl field usage for optimal caching performance

**Section sources**
- [sqliteService.ts:456-468](file://src/services/local-persistence/sqliteService.ts#L456-L468)
- [local-persistence.ts:200-252](file://src/config/local-persistence.ts#L200-L252)
- [local-persistenceConnectionManager.ts:62-89](file://src/utils/local-persistenceConnectionManager.ts#L62-L89)
- [storage.rules:44-84](file://local-persistence/storage.rules#L44-L84)

## Conclusion
ChordMiniApp integrates Local persistence with a robust configuration, resilient initialization, and pragmatic caching strategies. The enhanced SQLite integration now includes comprehensive audio caching capabilities through the audioUrl field, enabling efficient storage and retrieval of both analysis results and audio sources. SQLite and Storage are governed by explicit rules and indexes, while client-side utilities ensure reliability across cold starts and inactivity. The documented patterns provide a foundation for secure, scalable Local persistence usage, with clear guidance for troubleshooting and optimization of both analysis data and audio caching scenarios.
