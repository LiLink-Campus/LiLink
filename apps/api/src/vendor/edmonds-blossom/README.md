# Edmonds Blossom

Vendored from `edmonds-blossom-fixed@1.0.1`, `app/blossom.js` (MIT).
Original source SHA-256: `d747ac7d01bc819e3f97dd47d4cb35cd3c5bc9cc271cf752ee81b925786c502c`.

Changes are limited to allocation: `filledArray` uses `new Array(len).fill(fill)`, and the boolean-only `allowEdge` flags use one `Uint8Array` cleared at each stage. All accesses to these flags use truthiness; writes of `true` become `1`. Reusing a byte buffer avoids repeated multi-million-entry array allocations. `addBlossom` reads existing adjacency lists and converts endpoint indices while iterating, avoiding temporary copies of each neighbour list. Traversal order, weights, and exact matching decisions remain unchanged. The upstream package is retained as the parity-test oracle.

`index.spec.ts` compares complete mate arrays with upstream across deterministic sparse, dense, odd-sized and weighted graphs. Nest copies this directory into the production build.
