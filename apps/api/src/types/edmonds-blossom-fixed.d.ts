declare module 'edmonds-blossom-fixed' {
  type WeightedEdge = [number, number, number];

  export default function blossom(
    edges: WeightedEdge[],
    maxCardinality?: boolean,
  ): number[];
}
