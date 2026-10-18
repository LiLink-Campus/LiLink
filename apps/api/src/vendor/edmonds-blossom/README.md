# Edmonds Blossom

Vendored from `edmonds-blossom-fixed@1.0.1`, `app/blossom.js` (MIT).
Original source SHA-256: `d747ac7d01bc819e3f97dd47d4cb35cd3c5bc9cc271cf752ee81b925786c502c`.

Allocation changes: `filledArray` uses `new Array(len).fill(fill)`, and the boolean-only `allowEdge` flags use one `Uint8Array` cleared at each stage. All accesses to these flags use truthiness; writes of `true` become `1`. Reusing a byte buffer avoids repeated multi-million-entry array allocations. `addBlossom` reads existing adjacency lists and converts endpoint indices while iterating, avoiding temporary copies of each neighbour list.

Exact priority weights: the same solver accepts homogeneous finite Number weights or BigInt integer weights. `weights.cjs` selects the zero and two constants once; weights, slack, dual variables and delta then stay in that domain, while graph indices remain Numbers. Integer-weight Blossom keeps even slack for the half-slack delta, so BigInt division preserves the algorithm. Number traversal and arithmetic retain upstream behavior; the upstream package remains the parity-test oracle. Application priorities use BigInt after rounding each raw compatibility score to one millionth; display scores retain their existing Number calculation. This avoids a pool-size-dependent precision failure in the existing 2000-person release rehearsal.

`index.spec.ts` compares complete Number-weight mate arrays with upstream across deterministic sparse, dense, odd-sized and weighted graphs. Existing matching engine and PostgreSQL E2E exercise BigInt priorities, including the 2000-person pool, preview serialization, reveal and dashboard state. Nest copies this directory into the production build.
