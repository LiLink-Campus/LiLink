// Vertex indices remain numbers; weights and dual variables share one domain.
module.exports = function weightDomain(edges) {
  const big = typeof edges[0][2] === 'bigint';
  const type = big ? 'bigint' : 'number';
  for (const edge of edges) {
    if (typeof edge[2] !== type || (!big && !Number.isFinite(edge[2]))) {
      throw new TypeError('Matching weights must use one finite numeric domain.');
    }
  }
  return { zero: big ? 0n : 0, two: big ? 2n : 2 };
};
