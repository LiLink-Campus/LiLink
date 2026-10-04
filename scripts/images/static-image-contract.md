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
- The homepage renders its hero without a client reveal gate. Its 96-pixel WebP
  preview is generated from the same published source, embedded once in page CSS,
  and uses the same cover crop as the eager responsive image. Image or script
  failure must leave the preview, heading and links visible. No runtime image
  processor, extra image request or per-frame product script is introduced.
- About renders three complete inline atlas previews with its initial HTML and
  keeps the existing CSS entrance animation. The three original HD crops retain
  their URL, dimensions, masking and placement, share one atlas request, and
  replace previews without a client reveal gate. The primary `data-page-image`
  remains mandatory for strict HD readiness; image or script failures must leave
  the previews, text and native links visible.
- On one-to-one, images marked `data-page-image` still gate `ImageReadyPage`
  until decoded; its existing bounded fallback is unchanged.
- Below-fold images remain lazy, and the inactive dashboard carousel slide
  retains its existing lazy policy.
- Fixed SVG branding and pre-generated QR previews use native images, retaining
  their dimensions, alt text, lazy loading and original-image links. They must
  remain visible before hydration and never introduce optimizer requests.

The generator changes static files and image markup only. It does not change
route revalidation intervals, data-cache keys, cache tags, or API invalidation.
