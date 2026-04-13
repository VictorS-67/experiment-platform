# Security

## Security Headers (set in `hooks.server.ts`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: {SUPABASE_URL};
  media-src 'self' blob: {SUPABASE_URL};
  connect-src 'self' {SUPABASE_URL};
  frame-ancestors 'none'
```

## File Upload Validation

- **Allowed types**: audio/webm, audio/ogg, audio/mp4, audio/mpeg
- **Max size**: 50MB (Content-Length pre-check + actual size check)
- **Magic byte detection**: Server validates file signatures (OGG, WebM, MP4, MP3) before upload
- **Path traversal protection**: Iterative sanitization removing `..` and `//`; IDs validated against `/^[a-zA-Z0-9_.-]+$/`

## Rate Limiting

In-memory sliding window per client IP (in `hooks.server.ts`):
- `/auth`: 20 requests/min
- `/save`: 60 requests/min
- `/upload`: 30 requests/min
- Applies to all non-GET/HEAD methods
- Stale entries cleaned every 5 minutes; returns 429 when exceeded
- **Serverless caveat**: Resets on cold starts. Needs Redis/Upstash for stateless deployments.

## CSRF Protection

- SvelteKit form actions have built-in CSRF protection
- API endpoints verify `Origin` header on POST/PUT/DELETE
- Production blocks empty `Origin` headers
- URL matching uses `endsWith`/`includes` patterns to prevent bypass

## Session Security

- **Participant tokens**: UUID session tokens in httpOnly cookies (90-day maxAge)
- **Token rotation**: Fresh token generated on every login via `rotateSessionToken()`
- **DB expiry**: Tokens inactive >90 days are rejected; `last_active_at` updated on each request
- **Admin tokens**: Supabase Auth JWTs in httpOnly cookies, verified + refreshed in middleware

## Data Validation

- **Registration**: Server validates required fields against config schema (50KB max)
- **Responses**: Validates phaseId, stimulusId (except review phases), widget keys against config (100KB max)
- **XSS**: Tutorial overlay content escaped via `escapeHtml()` before HTML interpolation
- **CSV export**: Values sanitized against formula injection (leading `=`, `+`, `-`, `@`, `\t`, `\r`)

## Error Messages

All server functions use generic messages. Raw Supabase/Postgres errors logged server-side only via `console.error()`.
