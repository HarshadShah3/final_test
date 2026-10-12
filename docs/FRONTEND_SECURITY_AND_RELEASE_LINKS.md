# Frontend security and release links

Changes prepared from the supplied Iteration 2 penetration-testing report and release-link screenshot. The frontend security fix was deployed to the Iteration 2 Vercel production project on 17 September 2026. The default Iteration 1 URL has not been reassigned.

## Existing Iteration 2 result retained

This work continues from the previously completed Iteration 2 implementation and QA; it does not replace that result with a new interpretation of the screenshots. The release identity and runtime rules are:

- Build `0915 1445`, built 15 September 2026, from `fix/iteration2-api-error-state`.
- The deployed Iteration 2 `/api/health` response identifies `aiven-mysql` as the expected provider and `localRuntimeFallback: false`.
- The current source uses the password access gate and same-origin `/api` requests in production.
- Regional pages must expose API failures rather than silently substituting preview or local business data.
- Existing desktop and mobile layout QA artifacts remain the visual baseline; this security-header change does not redesign those pages.

Where older working drafts conflict with these points, use the later release record, current source and verified live health response. In particular, the older architecture draft describing only the forecast path as Aiven-backed does not describe the final `0915 1445` runtime rule recorded by the release and current README.

## Frontend finding: missing document security headers

Vite development and preview responses, Netlify static responses and Vercel frontend responses now include:

- Content-Security-Policy: same-origin scripts, images, fonts and API requests; no plugins, base URL overrides or framing; same-origin forms.
- X-Frame-Options: DENY.
- X-Content-Type-Options: nosniff.
- Referrer-Policy: strict-origin-when-cross-origin.
- Permissions-Policy: camera, geolocation and microphone disabled.
- Cross-Origin-Opener-Policy: same-origin.

Inline styles remain permitted for React/Recharts dynamic styles and Vite development CSS. Inline scripts and eval remain disallowed. Development additionally allows the local API on port 3001 and localhost WebSockets for hot reload. Production hosting uses same-origin `/api`; local development allowances do not enter its CSP. API handlers retain their separate JSON-response policies.

If deploying with `VITE_API_BASE_URL` on another origin, explicitly add that API origin to `connect-src` in both hosting configurations before deployment. Vite development/preview reads the configured origin automatically. Do not broaden the production policy to arbitrary HTTPS endpoints.

Configuration references: [Netlify custom headers](https://docs.netlify.com/manage/routing/headers/), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [Vite preview headers](https://vite.dev/config/preview-options).

## Release-link mapping

The current source is Iteration 2 and already serves its landing page at `/`, with the browser title `Australia 2050`. Keep that name and path for the latest build. Publishing future iterations to the same hosting project/domain preserves the stable review URL requested in the screenshot.

The confirmed live mapping supplied by the team is:

| Current URL | Confirmed build | Live API evidence checked 17 September 2026 |
| --- | --- | --- |
| <https://lifebeyondthecity.vercel.app/> | Iteration 1 | `/api/health` returns `{"status":"ok"}` only |
| <https://lifebeyondthecity-iteration2.vercel.app/> | Iteration 2 with frontend security fix | `/api/health` reports build `0915 1445`, branch `fix/iteration2-api-error-state` and Aiven with no local runtime fallback; HTML responses include the new security headers |

The requested target is for the current Iteration 2 build to replace Iteration 1 at the stable default URL:

| Target URL | Build |
| --- | --- |
| <https://lifebeyondthecity.vercel.app/> | Current Iteration 2 frontend and its matching API |
| Separate archive URL | Preserved Iteration 1 frontend and its matching API |

Reassigning these URLs is a Vercel project/domain operation, not a React route or page-title change. The authenticated `livebeyond-city` Vercel team can manage only the Iteration 2 project; the Vercel API returns `404` for the default alias in that team scope. The screenshot says to append `I2` to the Iteration 1 website name; that would mislabel the archived Iteration 1 build. Keep its final archive alias pending confirmation and access to the Vercel scope that owns the default URL.

The supplied Iteration 2 password is a deployment secret. It is intentionally not stored in source, release notes or frontend configuration.

After the eventual alias/deployment change, accept the stable URL only when all of the previously established result remains intact: the access password works, the session cookie persists, the root and direct page refreshes load, `/api/health` reports build `0915 1445` and no local runtime fallback, the data-source check confirms Aiven, API failures remain visible, desktop/mobile layouts remain usable, and the HTML security headers are present. A header configuration in this repository is not evidence that a live hosting response has changed.

## Other report findings

The report also identifies API rate limiting and stack-trace disclosure. Those are backend findings and remain outside this frontend-only change. The CORS test found no vulnerability. This work does not claim that the entire penetration report is resolved.

## Local verification

Run `npm run build`, then `npm --prefix frontend test`. Frontend security tests check real Vite dev/preview HTML responses, direct SPA links, CSP restrictions and parity between local and hosting policies. The preview tests require the production build first.

Local results: production build passed; 15 frontend tests passed; 38 backend tests passed. The Iteration 2 production deployment `dpl_HEbnHTmcvP22DGV17gRfrhSTcsRj` is Ready. A live response check confirmed HTTP 200 and the expected CSP, `X-Frame-Options`, `X-Content-Type-Options`, referrer, permissions and cross-origin opener headers. `/api/health` also confirms Aiven and no local runtime fallback. Browser visual verification is still pending because the connected browser tool reported no available browser.

GitHub source: branch `fix/iteration2-api-error-state`, frontend fix commit `1dd7edb`, deployment lockfile commit `38d3a03`. The `main` branch was not changed.
