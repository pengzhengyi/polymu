import { depthFirstSearch } from './depth-first-search';

describe('depth first search', () => {
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

  test('find a node using terminateWhen', () => {
    const result = depthFirstSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      undefined,
      (node) => node.name === 'NOT EXISTING NODE NAME'
    );
    expect(result).toBeUndefined();

    // existing node
    const result2 = depthFirstSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      undefined,
      (node) => node.name === 'D'
    );
    expect(result2).toBe(nodeD);
  });

  test('use noExploring', () => {
    // block exploring
    const noExploring = new Set([nodeB, nodeC]);
    const result = depthFirstSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      undefined,
      (node) => node.name === 'D',
      noExploring
    );
    expect(result).toBeUndefined();

    // restrict exploring
    const noExploring2 = new Set([nodeC, nodeD, nodeE]);
    const result2 = depthFirstSearch(
      nodeA,
      (node) => node.nodeToDistance.keys(),
      undefined,
      (node) => node.name === 'Z',
      noExploring2
    );
    expect(result2).toBe(nodeZ);

    // see explored nodes
    const exploredNodes: Set<GraphNode> = new Set();
    depthFirstSearch<GraphNode>(
      nodeZ,
      (node) => node.nodeToDistance.keys(),
      undefined,
      (node) => node.name === 'NOT EXISTING NODES',
      exploredNodes
    );

    expect(exploredNodes).toEqual(new Set([nodeA, nodeB, nodeC, nodeD, nodeE, nodeF, nodeZ]));
  });

  test('dependency tier determination', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E'];
    function getChildren(node: string) {
      switch (node) {
        case 'A':
          return [];
        case 'B':
          return ['A'];
        case 'C':
          return ['B', 'D'];
        case 'D':
          return ['A'];
        case 'E':
          return ['B'];
      }
    }

    const nodeToDependencyTier: Map<string, number> = new Map();
    const exploredNodes: Set<string> = new Set();
    for (const node of nodes) {
      if (!exploredNodes.has(node)) {
        depthFirstSearch(
          node,
          getChildren,
          (node: string) => {
            if (!nodeToDependencyTier.has(node)) {
              nodeToDependencyTier.set(node, 0);
            }
          },
          undefined,
          exploredNodes,
          (node, subtreeRootNode) => {
            const currentTier = nodeToDependencyTier.get(node);
            const newTier = nodeToDependencyTier.get(subtreeRootNode) + 1;
            if (newTier > currentTier) {
              nodeToDependencyTier.set(node, newTier);
            }
          }
        );
      }
    }

    expect(nodeToDependencyTier.get('A')).toEqual(0);
    expect(nodeToDependencyTier.get('B')).toEqual(1);
    expect(nodeToDependencyTier.get('D')).toEqual(1);
    expect(nodeToDependencyTier.get('C')).toEqual(2);
    expect(nodeToDependencyTier.get('E')).toEqual(2);
  });
});
