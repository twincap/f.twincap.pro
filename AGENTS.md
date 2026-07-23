# f.twincap.pro agent guide

## Purpose

This repository contains the private archive file-management website deployed
at `f.twincap.pro`.

The browser talks only to Next.js server API routes. Server routes use either
the mock adapter or Nextcloud WebDAV through the `ArchiveStorage` interface.

## Required architecture

`Browser -> f.twincap.pro -> Next.js server API -> Nextcloud WebDAV`

- Use Next.js App Router and TypeScript strict mode.
- Keep file operations behind the `ArchiveStorage` server interface.
- Never import server environment or storage modules into client components.
- Never read or modify the Nextcloud data directory directly.
- Never modify the existing Nextcloud containers, volumes, configuration, or
  deployment.

## Security rules

- Read the Nextcloud URL, username, and app password from server environment
  variables only.
- Never use `NEXT_PUBLIC_` for credentials or authentication data.
- Never return Nextcloud credentials to the browser or logs.
- Require server-side authentication before reading or mutating any file
  metadata.
- Normalize and validate every user-controlled path and file name. Block
  absolute paths, dot segments, backslashes, control characters, and traversal.
- Do not commit `.env`, credentials, app passwords, session secrets, or real
  server details.
- Fail closed when production authentication configuration is missing.

## Deployment rules

- Use Docker.
- Bind published ports to `127.0.0.1` only.
- Do not expose the service directly to the public internet.
- External access is provided by Cloudflare Tunnel.
- Do not guess existing container names, Docker network names, server paths, or
  credentials.

## Validation

After changes, run:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

Explain any remaining failure clearly.
