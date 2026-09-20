# Edmonds Blossom

Vendored from `edmonds-blossom-fixed@1.0.1`, `app/blossom.js` (MIT).
Original source SHA-256: `d747ac7d01bc819e3f97dd47d4cb35cd3c5bc9cc271cf752ee81b925786c502c`.

The only algorithm-file change replaces the element-by-element `filledArray` helper with `new Array(len).fill(fill)`. The values, array type, traversal order, weights, and exact matching decisions remain unchanged. Native filling reduces allocation overhead on dense graphs. The upstream package is retained as the parity-test oracle.

`index.spec.ts` compares complete mate arrays with upstream across deterministic sparse, dense, odd-sized and weighted graphs. Nest copies this directory into the production build.
