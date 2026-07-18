---
name: Imported project port routing
description: How to get the correct ports for an imported pnpm monorepo with artifact.toml files when artifacts are not yet registered.
---

# Imported project with artifact.toml — port routing

## The rule
When a project is imported from GitHub and has existing `artifacts/<slug>/.replit-artifact/artifact.toml` files, Replit's application router uses those files for dev-mode routing **before** `createArtifact()` is ever called. The correct local port for each service is whatever `localPort` is in the corresponding `artifact.toml` — not port 5000, not 3000, not anything else.

**Why:** The Replit proxy reads artifact.toml path/port mappings even without formal artifact registration. Running a service on the wrong port produces 502 on the external URL even if the process is healthy.

## How to apply
1. Read `artifacts/<slug>/.replit-artifact/artifact.toml` **before** configuring any workflow.
2. Use the `localPort` value in the `[[services]]` block as the `PORT` env var and `waitForPort`.
3. Do not guess or try standard ports (5000, 3000) — use the toml value directly.
4. After configuring workflows with the correct ports, artifacts auto-register and managed workflows appear; switch to them immediately.
