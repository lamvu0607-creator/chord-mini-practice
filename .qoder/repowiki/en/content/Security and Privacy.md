# Security and Privacy

<cite>
**Referenced Files in This Document**
- [local-persistence/sqlite.rules](file://local-persistence/sqlite.rules)
- [local-persistence/storage.rules](file://local-persistence/storage.rules)
- [local-persistence/local-persistence.json](file://local-persistence/local-persistence.json)
- [src/config/local-persistence.ts](file://src/config/local-persistence.ts)
- [src/utils/serverRateLimit.ts](file://src/utils/serverRateLimit.ts)
- [src/services/api/apiService.ts](file://src/services/api/apiService.ts)
- [src/hooks/api/useRateLimiting.ts](file://src/hooks/api/useRateLimiting.ts)
- [src/utils/rateLimiting.ts](file://src/utils/rateLimiting.ts)
- [python_backend/app.py](file://python_backend/app.py)
- [python_backend/extensions.py](file://python_backend/extensions.py)
- [python_backend/config.py](file://python_backend/config.py)
- [src/utils/urlValidationUtils.ts](file://src/utils/urlValidationUtils.ts)
- [src/app/privacy/page.tsx](file://src/app/privacy/page.tsx)
- [src/app/terms/page.tsx](file://src/app/terms/page.tsx)
- [src/app/api/config/route.ts](file://src/app/api/config/route.ts)
- [scripts/verify-local-persistence-audio-cors.mjs](file://scripts/verify-local-persistence-audio-cors.mjs)
</cite>

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
10. [Appendices](#appendices)

## Introduction
This document details the security and privacy measures implemented in ChordMiniApp. It covers authentication and authorization, data protection strategies, API security protocols, Local persistence security rules, server-side protections (IP rate limiting, rate limiting, input validation), client-side security (secure communication, cookies, XSS), data handling (encryption, anonymization, secure deletion), compliance documentation (privacy policy, terms of service), security monitoring, and user rights.

## Project Structure
Security-related components span the frontend, backend, and Local persistence infrastructure:
- Frontend: Local persistence initialization, IP rate limiting integration, API service with rate limiting, environment-aware error handling, and CORS verification utilities.
- Backend: Flask application factory, CORS and rate limiting configuration, and environment-specific settings.
- Local persistence: SQLite and Storage security rules enforcing access control, data validation, and permission management.

```mermaid
graph TB
subgraph "Frontend"
FE_Fire["Local persistence Config<br/>src/config/local-persistence.ts"]
FE_API["API Service<br/>src/services/api/apiService.ts"]
FE_RL["Client Rate Limiting<br/>src/utils/rateLimiting.ts"]
FE_Hooks["Rate Limiting Hooks<br/>src/hooks/api/useRateLimiting.ts"]
FE_URL["URL Validation<br/>src/utils/urlValidationUtils.ts"]
end
subgraph "Backend"
BE_App["Flask App Factory<br/>python_backend/app.py"]
BE_Ext["Extensions (CORS/Limiter)<br/>python_backend/extensions.py"]
BE_Config["Config (Rate Limits)<br/>python_backend/config.py"]
end
subgraph "Local persistence"
FB_JSON["Local persistence Config<br/>local-persistence/local-persistence.json"]
FB_FS["SQLite Rules<br/>local-persistence/sqlite.rules"]
FB_ST["Storage Rules<br/>local-persistence/storage.rules"]
end
FE_Fire --> FB_JSON
FE_API --> BE_App
FE_API --> FB_FS
FE_API --> FB_ST
FE_RL --> FE_API
FE_Hooks --> FE_API
BE_Ext --> BE_App
BE_Config --> BE_Ext
FB_JSON --> FB_FS
FB_JSON --> FB_ST
```

**Diagram sources**
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [src/utils/rateLimiting.ts:1-266](file://src/utils/rateLimiting.ts#L1-L266)
- [src/hooks/api/useRateLimiting.ts:1-322](file://src/hooks/api/useRateLimiting.ts#L1-L322)
- [python_backend/app.py:1-186](file://python_backend/app.py#L1-L186)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [python_backend/config.py:1-215](file://python_backend/config.py#L1-L215)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

**Section sources**
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [src/utils/rateLimiting.ts:1-266](file://src/utils/rateLimiting.ts#L1-L266)
- [src/hooks/api/useRateLimiting.ts:1-322](file://src/hooks/api/useRateLimiting.ts#L1-L322)
- [python_backend/app.py:1-186](file://python_backend/app.py#L1-L186)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [python_backend/config.py:1-215](file://python_backend/config.py#L1-L215)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

## Core Components
- Local persistence initialization and IP rate limiting enforcement on the client and server.
- API service with client-side rate limiting and IP rate limiting token attachment.
- Server-side rate limiting via Flask-Limiter with Redis support.
- Local persistence security rules for SQLite and Storage with validation and access control.
- URL validation utilities to prevent insecure inputs.
- Privacy and Terms pages outlining data practices and user rights.

**Section sources**
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [src/utils/serverRateLimit.ts:1-122](file://src/utils/serverRateLimit.ts#L1-L122)
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)
- [src/utils/urlValidationUtils.ts:58-85](file://src/utils/urlValidationUtils.ts#L58-L85)
- [src/app/privacy/page.tsx:1-146](file://src/app/privacy/page.tsx#L1-L146)
- [src/app/terms/page.tsx:1-176](file://src/app/terms/page.tsx#L1-L176)

## Architecture Overview
The security architecture integrates client-side Local persistence IP rate limiting, server-side IP rate limiting verification, backend rate limiting, and Local persistence security rules.

```mermaid
sequenceDiagram
participant Client as "Browser Client"
participant FE as "Frontend API Service<br/>apiService.ts"
participant FB as "Local persistence IP rate limiting<br/>local-persistence.ts"
participant BE as "Backend Flask App<br/>app.py"
participant SVR as "Server IP rate limiting Verifier<br/>serverRateLimit.ts"
Client->>FE : "Send request with optional IP rate limiting token"
FE->>FB : "Get IP rate limiting token (if available)"
FB-->>FE : "Token string or null"
FE->>BE : "Attach X-Local persistence-RateLimit header"
BE->>SVR : "Verify token"
SVR-->>BE : "Allow or block"
BE-->>FE : "Response"
FE-->>Client : "Parsed response or error"
```

**Diagram sources**
- [src/services/api/apiService.ts:106-121](file://src/services/api/apiService.ts#L106-L121)
- [src/config/local-persistence.ts:522-536](file://src/config/local-persistence.ts#L522-L536)
- [src/utils/serverRateLimit.ts:76-121](file://src/utils/serverRateLimit.ts#L76-L121)
- [python_backend/app.py:15-25](file://python_backend/app.py#L15-L25)

## Detailed Component Analysis

### Local persistence Security Rules (SQLite and Storage)
- SQLite rules define:
  - Helper functions for validating video IDs, timestamps, and data structures.
  - Collections with explicit read/write permissions, including admin-only deletions.
  - Basic rate-limiting helper and relaxed validation for cold-start scenarios.
  - Public reads for caching, restricted writes with validation, and admin-only deletes for sensitive collections.
- Storage rules define:
  - Audio/video content type validation and size limits.
  - Filename pattern enforcement requiring YouTube video ID inclusion.
  - Separate temp path for large uploads with stricter naming and cleanup.
  - Deny-by-default policy for other paths.

```mermaid
flowchart TD
Start(["Incoming SQLite Write"]) --> CheckAuth["Check request.auth presence"]
CheckAuth --> SelectCol{"Which collection?"}
SelectCol --> |audioCache| AC["Validate audio data<br/>and rate limit"]
SelectCol --> |transcriptionCache| TC["Validate transcription data<br/>and rate limit"]
SelectCol --> |transcriptions| TR["TEMPORARY: Allow all<br/>Admin delete only"]
SelectCol --> |translations| TL["SIMPLIFIED: Allow all<br/>Admin delete only"]
SelectCol --> |lyrics| LY["TEMPORARY: Allow all<br/>Admin delete only"]
SelectCol --> |segmentationJobs| SJ["Admin delete only"]
SelectCol --> |melody| ML["Admin delete only"]
SelectCol --> |admin| ADM["Admin emails only"]
SelectCol --> |metrics| MET["Admin write only"]
SelectCol --> |feedback/errorLogs| FE["Private submissions<br/>rate-limited"]
AC --> End(["Allow/Deny"])
TC --> End
TR --> End
TL --> End
LY --> End
SJ --> End
ML --> End
ADM --> End
MET --> End
FE --> End
```

**Diagram sources**
- [local-persistence/sqlite.rules:64-104](file://local-persistence/sqlite.rules#L64-L104)
- [local-persistence/sqlite.rules:106-121](file://local-persistence/sqlite.rules#L106-L121)
- [local-persistence/sqlite.rules:123-140](file://local-persistence/sqlite.rules#L123-L140)
- [local-persistence/sqlite.rules:159-194](file://local-persistence/sqlite.rules#L159-L194)
- [local-persistence/sqlite.rules:196-206](file://local-persistence/sqlite.rules#L196-L206)
- [local-persistence/sqlite.rules:208-218](file://local-persistence/sqlite.rules#L208-L218)
- [local-persistence/sqlite.rules:220-231](file://local-persistence/sqlite.rules#L220-L231)
- [local-persistence/sqlite.rules:233-242](file://local-persistence/sqlite.rules#L233-L242)
- [local-persistence/sqlite.rules:244-264](file://local-persistence/sqlite.rules#L244-L264)

**Section sources**
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)

### Client-Side Authentication and IP rate limiting
- Local persistence initialization supports runtime configuration loading and anonymous authentication with persistence and retry logic.
- IP rate limiting is initialized with reCAPTCHA v3 provider and attaches tokens to outgoing API requests.
- The IP rate limiting token is retrieved asynchronously and attached to the X-Local persistence-RateLimit header.

```mermaid
sequenceDiagram
participant Init as "initializeLocal persistence()"
participant RateLimit as "initializeRateLimit()"
participant Token as "getRateLimitTokenForApi()"
participant API as "apiService.ts"
Init->>RateLimit : "Initialize provider with site key"
RateLimit-->>Init : "IP rate limiting ready"
API->>Token : "Fetch token (non-fatal)"
Token-->>API : "Token or null"
API->>API : "Attach header if token"
```

**Diagram sources**
- [src/config/local-persistence.ts:475-536](file://src/config/local-persistence.ts#L475-L536)
- [src/services/api/apiService.ts:106-121](file://src/services/api/apiService.ts#L106-L121)

**Section sources**
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)

### Server-Side IP rate limiting Verification
- The server verifies the X-Local persistence-RateLimit header using local-persistence-admin/app-check.
- Behavior varies by environment and enforcement flag:
  - Non-production always allows.
  - Monitor mode logs failures but allows.
  - Enforced mode rejects missing or invalid tokens with 401/403.

```mermaid
flowchart TD
Req["Incoming Request"] --> Env{"Production?"}
Env --> |No| Allow["Allow request"]
Env --> |Yes| CheckHdr["Extract X-Local persistence-RateLimit"]
CheckHdr --> HasToken{"Token present?"}
HasToken --> |No| Enf{"Enforce=1?"}
Enf --> |Yes| Block401["Block 401"]
Enf --> |No| LogMon["Log monitor"] --> Allow
HasToken --> |Yes| Verify["VerifyToken()"]
Verify --> Ok{"Valid?"}
Ok --> |Yes| Allow
Ok --> |No| Enf2{"Enforce=1?"}
Enf2 --> |Yes| Block403["Block 403"]
Enf2 --> |No| LogMon2["Log monitor"] --> Allow
```

**Diagram sources**
- [src/utils/serverRateLimit.ts:76-121](file://src/utils/serverRateLimit.ts#L76-L121)

**Section sources**
- [src/utils/serverRateLimit.ts:1-122](file://src/utils/serverRateLimit.ts#L1-L122)

### API Security Protocols and Rate Limiting
- Client-side:
  - ClientRateLimiter enforces per-endpoint limits.
  - fetchWithRetry handles 429 and retry logic with exponential backoff and jitter.
  - getRateLimitMessage provides user-friendly messages.
- Server-side:
  - Flask-Limiter with configurable storage (Redis or in-memory).
  - Configurable rate limits per endpoint category.
  - CORS configured centrally with support for multiple origins.

```mermaid
flowchart TD
Start(["Client Request"]) --> CheckClient["Check ClientRateLimiter"]
CheckClient --> Allowed{"Allowed?"}
Allowed --> |No| ReturnRL["Return rate-limited response"]
Allowed --> |Yes| Fetch["fetchWithRetry()"]
Fetch --> Resp{"Response"}
Resp --> |429| Parse["Parse headers and retry-after"]
Parse --> Retry["Exponential backoff or server retry-after"]
Retry --> Fetch
Resp --> |2xx| ParseJSON["Parse JSON/text"]
ParseJSON --> Done(["Return success"])
Resp --> |Other| HandleErr["Handle error"]
HandleErr --> Done
```

**Diagram sources**
- [src/utils/rateLimiting.ts:20-54](file://src/utils/rateLimiting.ts#L20-L54)
- [src/utils/rateLimiting.ts:120-187](file://src/utils/rateLimiting.ts#L120-L187)
- [src/utils/rateLimiting.ts:210-265](file://src/utils/rateLimiting.ts#L210-L265)
- [src/services/api/apiService.ts:74-83](file://src/services/api/apiService.ts#L74-L83)
- [src/services/api/apiService.ts:125-146](file://src/services/api/apiService.ts#L125-L146)
- [python_backend/extensions.py:17-93](file://python_backend/extensions.py#L17-L93)
- [python_backend/config.py:47-103](file://python_backend/config.py#L47-L103)

**Section sources**
- [src/utils/rateLimiting.ts:1-266](file://src/utils/rateLimiting.ts#L1-L266)
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [python_backend/config.py:1-215](file://python_backend/config.py#L1-L215)

### Input Validation and Secure Communication
- URL validation enforces HTTPS, disallows credentials, restricts domains and ports.
- CORS verification script helps ensure local audio storage CORS configuration is correct.
- Environment-aware error messages and safe timeout signals mitigate cross-environment issues.

```mermaid
flowchart TD
InURL["Input URL"] --> Parse["Parse URL"]
Parse --> Proto{"HTTPS?"}
Proto --> |No| ErrProto["Reject: Only HTTPS allowed"]
Proto --> |Yes| Creds{"Has username/password?"}
Creds --> |Yes| ErrCreds["Reject: Credentials not allowed"]
Creds --> |No| Host{"Allowed domain/port?"}
Host --> |No| ErrHost["Reject: Domain/port not allowed"]
Host --> |Yes| OK["Accept URL"]
```

**Diagram sources**
- [src/utils/urlValidationUtils.ts:58-85](file://src/utils/urlValidationUtils.ts#L58-L85)
- [scripts/verify-local-persistence-audio-cors.mjs:60-83](file://scripts/verify-local-persistence-audio-cors.mjs#L60-L83)

**Section sources**
- [src/utils/urlValidationUtils.ts:58-85](file://src/utils/urlValidationUtils.ts#L58-L85)
- [scripts/verify-local-persistence-audio-cors.mjs:60-83](file://scripts/verify-local-persistence-audio-cors.mjs#L60-L83)

### Data Handling Procedures
- Data transmission is secured via HTTPS.
- Local persistence security rules enforce validation and access control for SQLite and Storage.
- Temporary file handling and cleanup are supported for large uploads in Storage temp path.
- Admin-only deletions for sensitive collections reduce accidental data loss.

**Section sources**
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)

### Compliance Documentation
- Privacy Policy outlines information collected, use, storage, security measures, third-party services, and user rights.
- Terms of Service describe research purpose, acceptable use, intellectual property, disclaimers, and data use.

**Section sources**
- [src/app/privacy/page.tsx:1-146](file://src/app/privacy/page.tsx#L1-L146)
- [src/app/terms/page.tsx:1-176](file://src/app/terms/page.tsx#L1-L176)

### Security Monitoring and Incident Response
- Monitor mode logs blocked requests without rejecting them.
- Enforcement mode blocks invalid tokens with explicit status codes.
- Environment-aware error messages assist in diagnosing production issues.
- CORS verification script aids in detecting misconfigurations.

**Section sources**
- [src/utils/serverRateLimit.ts:76-121](file://src/utils/serverRateLimit.ts#L76-L121)
- [src/utils/environmentUtils.ts:89-131](file://src/utils/environmentUtils.ts#L89-L131)
- [scripts/verify-local-persistence-audio-cors.mjs:60-83](file://scripts/verify-local-persistence-audio-cors.mjs#L60-L83)

### User Rights
- Privacy Policy documents rights including information about collected data, deletion of cached results, opting out of research data collection, and reporting privacy concerns.
- Terms of Service emphasize research and academic use, acceptable use guidelines, and disclaimers.

**Section sources**
- [src/app/privacy/page.tsx:124-138](file://src/app/privacy/page.tsx#L124-L138)
- [src/app/terms/page.tsx:40-94](file://src/app/terms/page.tsx#L40-L94)

## Dependency Analysis
Security components depend on:
- Local persistence configuration and rules for data access control.
- Client-side IP rate limiting and server-side verification for API attestation.
- Centralized rate limiting configuration and enforcement.
- Environment-specific behavior for production vs development.

```mermaid
graph LR
FE_API["apiService.ts"] --> FE_FB["local-persistence.ts"]
FE_API --> BE_CFG["config.py"]
FE_API --> BE_EXT["extensions.py"]
BE_EXT --> BE_APP["app.py"]
FE_FB --> FB_JSON["local-persistence.json"]
FB_JSON --> FB_RULES["sqlite.rules / storage.rules"]
```

**Diagram sources**
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [python_backend/config.py:1-215](file://python_backend/config.py#L1-L215)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [python_backend/app.py:1-186](file://python_backend/app.py#L1-L186)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

**Section sources**
- [src/services/api/apiService.ts:1-407](file://src/services/api/apiService.ts#L1-L407)
- [src/config/local-persistence.ts:1-537](file://src/config/local-persistence.ts#L1-L537)
- [python_backend/config.py:1-215](file://python_backend/config.py#L1-L215)
- [python_backend/extensions.py:1-93](file://python_backend/extensions.py#L1-L93)
- [python_backend/app.py:1-186](file://python_backend/app.py#L1-L186)
- [local-persistence/local-persistence.json:1-10](file://local-persistence/local-persistence.json#L1-L10)
- [local-persistence/sqlite.rules:1-289](file://local-persistence/sqlite.rules#L1-L289)
- [local-persistence/storage.rules:1-92](file://local-persistence/storage.rules#L1-L92)

## Performance Considerations
- Client-side rate limiting prevents excessive requests and reduces server load.
- Exponential backoff with jitter mitigates thundering herd and improves resilience.
- Local persistence security rules minimize unnecessary writes and enforce data size limits.
- IP rate limiting reduces bot traffic and protects APIs from abuse.

## Troubleshooting Guide
Common issues and resolutions:
- Missing IP rate limiting token in production:
  - Ensure NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY is configured and IP rate limiting initializes successfully.
  - In non-production, tokens are optional; verify environment detection.
- Rate limiting:
  - Client-side: Respect retry-after and reduce request frequency.
  - Server-side: Adjust Redis configuration or increase limits via environment variables.
- CORS errors for local audio storage:
  - Use the verification script to inspect headers and confirm allow-origin/methods/headers.
- Timeout errors:
  - Environment-aware messages indicate Vercel timeout limits or production server constraints.
  - Reduce file sizes or shorten processing windows.

**Section sources**
- [src/utils/serverRateLimit.ts:76-121](file://src/utils/serverRateLimit.ts#L76-L121)
- [src/utils/rateLimiting.ts:120-187](file://src/utils/rateLimiting.ts#L120-L187)
- [scripts/verify-local-persistence-audio-cors.mjs:60-83](file://scripts/verify-local-persistence-audio-cors.mjs#L60-L83)
- [src/utils/environmentUtils.ts:89-131](file://src/utils/environmentUtils.ts#L89-L131)

## Conclusion
ChordMiniApp implements a layered security approach combining Local persistence security rules, client/server IP rate limiting, centralized rate limiting, input validation, and environment-aware error handling. While some collections use simplified validation for development, the system provides strong defaults and opt-in enforcement for production. Privacy and terms documentation outline user rights and data practices. Ongoing improvements should focus on tightening validation rules, enabling enforced rate limiting, and expanding monitoring coverage.

## Appendices
- API configuration endpoint restricts methods to GET and returns Method Not Allowed for others.

**Section sources**
- [src/app/api/config/route.ts:82-99](file://src/app/api/config/route.ts#L82-L99)
