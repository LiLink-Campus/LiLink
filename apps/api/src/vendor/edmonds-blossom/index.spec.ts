import upstream from 'edmonds-blossom-fixed';
import blossom from './index.cjs';

it('preserves upstream mate arrays across sparse, dense and weighted graphs', () => {
  let state = 20260920;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  expect(blossom([])).toEqual(upstream([]));
  for (let fixture = 0; fixture < 200; fixture++) {
    const count = 3 + (fixture % 22);
    const edges: Array<[number, number, number]> = [];
    const density = [0.15, 0.5, 1][fixture % 3];
    for (let left = 0; left < count; left++) {
      for (let right = left + 1; right < count; right++) {
        if (random() > density) continue;
        const raw = fixture % 4 ? Math.floor(random() * 100) / 4 : 10;
        const priority = (left % 5 === 0 ? 1 : 0) + (right % 5 === 0 ? 1 : 0);
        edges.push([left, right, raw + priority * 100_000]);
      }
    }
    for (const maxCardinality of [false, true]) {
      expect(blossom(edges, maxCardinality)).toEqual(
        upstream(edges, maxCardinality),
      );
    }
  }
});
