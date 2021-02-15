import { AStarSearch } from './A*-search';

describe('AStarSearch', () => {
  /**
   * @see {@link https://www.101computing.net/wp/wp-content/uploads/A-Star-Search-Algorithm.png}
   */
  class GraphNode {
    constructor(
      public name: string,
      public nodeToDistance: Map<GraphNode, number>,
      public straightDistanceToZ: number
    ) {}
  }

  function addUndirectedEdge(node1: GraphNode, node2: GraphNode, distance: number) {
    node1.nodeToDistance.set(node2, distance);
    node2.nodeToDistance.set(node1, distance);
  }

  const nodeA: GraphNode = new GraphNode('A', new Map(), 14);
  const nodeB: GraphNode = new GraphNode('B', new Map(), 12);
  const nodeC: GraphNode = new GraphNode('C', new Map(), 11);
  const nodeD: GraphNode = new GraphNode('D', new Map(), 6);
  const nodeE: GraphNode = new GraphNode('E', new Map(), 4);
  const nodeF: GraphNode = new GraphNode('F', new Map(), 11);
  const nodeZ: GraphNode = new GraphNode('Z', new Map(), 0);
  addUndirectedEdge(nodeA, nodeB, 4);
  addUndirectedEdge(nodeA, nodeC, 3);
  addUndirectedEdge(nodeB, nodeF, 5);
  addUndirectedEdge(nodeB, nodeE, 12);
  addUndirectedEdge(nodeC, nodeE, 10);
  addUndirectedEdge(nodeC, nodeD, 7);
  addUndirectedEdge(nodeD, nodeE, 2);
  addUndirectedEdge(nodeE, nodeZ, 5);
  addUndirectedEdge(nodeF, nodeZ, 16);

  test('exploring all nodes', () => {
    const ordering: Array<GraphNode> = [];
    AStarSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      (node1, node2) => node1.straightDistanceToZ - node2.straightDistanceToZ,
      (node) => ordering.push(node)
    );

    expect(ordering).toEqual([nodeA, nodeC, nodeE, nodeZ, nodeD, nodeF, nodeB]);

    // compute shortest distances (Dijkstra)
    const distances: Map<GraphNode, number> = new Map();
    distances.set(nodeA, 0);
    distances.set(nodeB, Number.POSITIVE_INFINITY);
    distances.set(nodeC, Number.POSITIVE_INFINITY);
    distances.set(nodeD, Number.POSITIVE_INFINITY);
    distances.set(nodeE, Number.POSITIVE_INFINITY);
    distances.set(nodeF, Number.POSITIVE_INFINITY);
    distances.set(nodeZ, Number.POSITIVE_INFINITY);

    AStarSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      (node1, node2) => distances.get(node1) - distances.get(node2),
      (node) => {
        const nodeDistance = distances.get(node);
        for (const [childNode, distance] of node.nodeToDistance) {
          const childNodeDistance = distances.get(childNode);
          const newDistance = nodeDistance + distance;
          if (newDistance < childNodeDistance) {
            distances.set(childNode, newDistance);
          }
        }
      }
    );

    expect(distances.get(nodeA)).toEqual(0);
    expect(distances.get(nodeB)).toEqual(4);
    expect(distances.get(nodeC)).toEqual(3);
    expect(distances.get(nodeD)).toEqual(10);
    expect(distances.get(nodeE)).toEqual(12);
    expect(distances.get(nodeF)).toEqual(9);
    expect(distances.get(nodeZ)).toEqual(17);
  });

  test('find a node using terminateWhen', () => {
    // nonexisting node
    const result = AStarSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      (node1, node2) => node1.straightDistanceToZ - node2.straightDistanceToZ,
      undefined,
      (node) => node.name === 'NOT EXISTING NODE NAME'
    );
    expect(result).toBeUndefined();

    // existing node
    const result2 = AStarSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      (node1, node2) => node1.straightDistanceToZ - node2.straightDistanceToZ,
      undefined,
      (node) => node.name === 'D'
    );
    expect(result2).toBe(nodeD);
  });
});
