# Cloudflare migration baseline — WAY UP

Status: preparation/audit branch only. This document does not change runtime behavior.

## Source snapshot
- Repository: francopdimauro-cyber/WAYUP
- Base branch: main
- Base commit at branch creation: a8c2f8a6455ed7d0e855a1d35f1c591681c11493

## Current architecture observed in source
- Frontend: React 19 + TanStack Start + TanStack Router + React Query.
- Build toolchain: Vite 8 and Nitro.
- vite.config.ts imports @lovable.dev/vite-tanstack-config.
- src/server.ts dynamically imports @tanstack/react-start/server-entry and wraps SSR errors.
- Root shell loads WAY.APP floating embed script from wayappdef.francopdimauro.workers.dev.
- App uses extensive Radix UI, Tailwind 4, Framer Motion, React Hook Form, Zod, Recharts and other frontend dependencies.
- Internationalized routes and SEO metadata are present.

## Migration-critical findings to validate
1. @lovable.dev/vite-tanstack-config is a development/build dependency and should be removed from the final build chain. Reconstruct its required plugins/config explicitly and compare generated behavior.
2. Nitro is pinned to a beta version. Verify the exact Cloudflare preset/adapter and compatibility with current TanStack Start and Vite versions; avoid blind upgrades.
3. src/server.ts imports the TanStack server entry dynamically and relies on Nitro/h3 behavior. Validate SSR, route handlers, error handling, and request env bindings in Workers.
4. src/routes/__root.tsx injects the WAY.APP embed script globally. Keep the floating widget and verify script load, CSP, iframe origin, API path, and cookie behavior.
5. src/routes/__root.tsx imports reportLovableError from lovable-error-reporting. Trace all Lovable runtime/build integrations and replace or remove only after preserving required error observability.
6. Verify all server-only modules and secrets are excluded from client bundles.
7. Verify redirects, locale routing, metadata, static assets, forms, and dynamic routes under Workers.
8. Build configuration must be reproducible without Lovable-managed tooling or services.

## Preserve
- All routes, page content, layouts, responsive behavior, animation, and styling.
- Locale routing and language metadata.
- SEO/Open Graph metadata.
- Forms and validation.
- Server-side rendering and error handling.
- Floating WAY.APP widget and its placement/behavior.

## Required acceptance tests
- Clean install from lockfile.
- TypeScript, lint, unit tests and production build pass.
- Worker starts and SSR renders all public routes.
- Locale routes, redirects, and not-found behavior work.
- All forms and server actions/API routes work.
- Metadata and assets are correct.
- No Lovable runtime/service dependency remains.
- WAY.APP widget loads once, opens, sends a message, receives streaming response, and preserves visitor identity.
- CSP/security headers allow only the intended widget origin.
- Production preview tested before domain cutover.

## Safety
No secrets, production settings, DNS changes, or production deployments belong in this branch until separately reviewed.
