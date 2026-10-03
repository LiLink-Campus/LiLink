---
kind: reference
lang: en
---

# Fixed responsive image behavior contract

The fixed illustrations and team portraits remain same-origin Vercel assets. Their
responsive variants are generated from an explicit list of published source WebP
files, never from generated variants or an ignored master-image directory.

Failure modes to verify through the existing browser E2E and resource ledger:

- A missing, animated, renamed, or hash-mismatched source must stop generation;
  publishing a manifest pointing to missing output is not acceptable.
- Running generation twice with the same sources and sharp version must produce
  identical variants and manifest. A changed image gets a changed content URL.
- Every rendered variant and preload URL stays on the application origin and
  bypasses `/_next/image`; fixed-image delivery must not use another CDN.
- Mobile and desktop browsers choose variants through `srcset` and `sizes`.
  The highest useful source resolution is retained, without fabricated upscaling.
- Layout dimensions, fill positioning, CSS cropping, alt text, and loading state
  remain intact. Portraits retain their current CSS aspect ratio.
- First-screen artwork is eager, and its preload and rendered image share the
  same `srcset` and `sizes`; a preload must not trigger a duplicate image fetch.
- Images marked `data-page-image` still gate `ImageReadyPage` until decoded;
  failed or stalled images retain the existing bounded reveal fallback.
- Below-fold images remain lazy, and the inactive dashboard carousel slide
  retains its existing lazy policy.

The generator changes static files and image markup only. It does not change
route revalidation intervals, data-cache keys, cache tags, or API invalidation.
