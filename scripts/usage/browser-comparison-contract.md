---
kind: reference
lang: en
---

# Browser resource comparison

Failure boundaries declared before implementation:

- A request started by the previous document must not be credited to the next warm navigation. CDP loader IDs own full-document matrix requests; excluded/unassigned requests remain visible in the artifact.
- Cold and warm captures must use the same viewport, route, full-page scrolling and completion checks. Cold contexts have empty browser caches; local server and Vercel caches are not cleared or equated with browser caches.
- A redirect is an additional network request. Memory/disk/SW responses are excluded from outgoing Web requests; 304 responses remain network requests. Incomplete bodies and failures must stay explicit rather than become zero-cost successful responses.
- Incomplete, failed or unavailable network Web bodies make the transfer planning envelope and its budget `UNKNOWN`. Preserve the observed gzip/header model lower bound separately; fixed reserves cannot prove a bound on an unseen tail. A recorded incomplete snapshot remains incomplete even if its mutable resource ledger later finishes. Bodyless 304s and genuine browser-cache hits do not require a body; direct API, external and static CDN bytes are not Web transfer.
- Raw HTML/RSC capture has a shared ten-second deadline for headers and body for each response, before acquiring Chromium. Connection refusal or a body that never finishes must fail without producing a successful capture or retaining browser processes.
- Only network responses through `/_next/image` contribute the estimated optimized-image read envelope, rounded by 8 KiB per response. Static image bytes still contribute delivery requests/transfer, but not this image-optimizer estimate. The estimate does not establish Vercel persistent-cache reads, transformations, writes or bills.
- Actual PWA installation and installed revisit are captured separately, with worker-owned precache requests identified. Synthetic HTTP fetches must not be presented as observed installation costs. Monthly installation rates and real telemetry remain unknown unless separately supplied.
- Before and after must share the disposable runner session, exact required route matrix and browser version. Twenty matching arbitrary cells do not prove coverage of home/about/schools/register/register-school in both viewports and cold/warm states. A resource comparison cannot silently change Sentry reserves, uncertainty, cache-miss assumptions or ISR invalidation policy to improve the result.
- Resource envelopes change as the planning model evolves. Fixed reserves must be separated using the source model's explicit `after.publicBrowserEnvelope`; a missing basis or negative reserve is rejected rather than subtracted from a stale hardcoded envelope.

Run through the disposable production-mode E2E session; never point this collector at developer or production data. Screenshots and JSON contain synthetic public data and credential-free paths. An existing session baseline is accepted only through its canonical performance comparison metadata.

Commands:

```sh
node scripts/usage/capture-browser.mjs artifacts/e2e/<run>/session.json <before-dir> --public-matrix --before artifacts/performance/baseline-<run>/comparison-session.json
node scripts/usage/capture-browser.mjs artifacts/e2e/<run>/session.json <after-dir> --public-matrix
node scripts/usage/compare-browser.mjs <before-dir>/browser-usage.json <after-dir>/browser-usage.json <comparison-dir>
node scripts/usage/verify-browser-comparison.mjs <comparison-verification-dir>
node scripts/usage/verify-browser-capture.mjs <capture-verification-dir>
```

The comparison saves `source-model.json` with its input assumptions, including the explicit public browser request/transfer envelope. To regenerate the report after the planning file evolves, pass that saved file as the fourth argument; do not silently use a newer model for an older before/after pair. Older frozen inputs without `after.publicBrowserEnvelope` need a separate annotated copy with the documented original envelope; preserve the original file.

Comparisons report local browser requests and optimizer-read envelopes, not production usage savings. HTML/RSC output sizes are separately retained because asset URLs, responsive markup and school atlas markup can change ISR storage bytes even when regeneration policy is unchanged.

The comparison verifier invokes the real CLI with synthetic ledgers, covering missing-body failures and legitimate bodyless responses. The capture verifier copies the collector into a temporary workspace and uses synthetic canonical metadata solely to target a test-owned loopback HTTP server. It verifies connection refusal and an unfinished response body, nonzero bounded exit, absent successful capture, and zero surviving child processes using `ps` (macOS/Linux). Neither verifier claims production-mode application or browser user-flow acceptance; reports explicitly identify the synthetic environment and contain no credentials or response bodies.

## Local prerendered output capture

Failure boundaries declared before the route-output collector:

- Reject expired or noncanonical sessions, inactive baselines, and before/after builds belonging to different disposable runs. Derive both workspaces from canonical runner paths rather than accepting arbitrary build directories.
- Reject symlinked paths, traversal outside those workspaces, changing files, empty output, incomplete HTML, invalid metadata, and missing HTML/RSC/metadata or full/tree/page segment companions. Flight payloads remain opaque; stable file boundaries and companion agreement do not prove Vercel storage completeness.
- Preserve all local HTML, RSC, metadata, segments, and cached route bodies as raw evidence with a SHA-256 digest. Round each file independently by 8 KiB, including overlapping full RSC and segments; do not omit metadata or sum bytes before rounding.
- Report the homepage (`index.*` and `index.segments/`) separately. Its observed file envelope may stay at 22 units or change; never force an expected number or infer unchanged billing from unchanged cache policy.
- Local file counts, bytes, and conservatively rounded units are not Vercel billable object counts or measured ISR Writes. New output must use a fresh artifact directory and must not overwrite older evidence.

```sh
node scripts/usage/capture-route-outputs.mjs artifacts/e2e/<run>/session.json artifacts/performance/baseline-<run>/comparison-session.json artifacts/resource-comparison/<run>/cache-outputs
```

Run while both disposable production builds and their canonical sessions remain active. The collector reads build output only and copies synthetic route evidence into the new artifact directory; it does not rebuild, invalidate caches, or contact production.
