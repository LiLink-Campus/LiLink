// Generate all fixed assets before Next compiles their manifests and styles.
await import('./generate-responsive.mjs');
await import('./school-atlases.mjs');
await import('./version-shell-assets.mjs');
