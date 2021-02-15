/**
 * @module
 *
 * This module provides an implementation of [Depth First Search Algorithm](http://en.wikipedia.org/wiki/Depth-first_search).
 *
 * This implementation is recursive.
 */

import { TGetChildren } from './types';

/**
 * Implement the Depth First Search algorithm.
 *
 * Instead of requiring specific graph representation, this function uses callback functions to determine child nodes, termination condition, processing step, offering great flexibility.
 *
 * @typedef TNode - A type for all the nodes.
 * @param {TNode} node - A node to start search from: will be the first node to be explored.
 * @param {TGetChildren<TNode>} getChildren - A callback function used to get child nodes from a node.
 * @param {(TNode) => void} [action] - A callback function to execute before each node is about to be explored (before `terminateWhen` is called on this node). The default is to execute no action.
 * @param {(TNode) => boolean} [terminateWhen] - A callback function to execute on each explored node. If true, then search will terminate and this node will be returned. By default, search will proceed until no more nodes can be explored.
 * @param {Set<TNode>} [noExploring = new Set()] - A set of nodes that are excluded from the search -- neither will these nodes be explored nor will `action` be evaluated on them. During search, explored nodes will be added to this set. Therefore, a clone should be passed if this set should not be modified. If a reference to existing empty set is passed, then `noExploring` will contain all explored nodes.
 * @param {(node: TNode, subtreeRootNode: TNode) => void} [afterSubtreeExplored] - A callback function to execute after a subtree of current node is explored.
 * @returns {TNode} If a explored node satisfies `terminateWhen`, then that node is returned. Otherwise, `undefined` is returned.
 */
export function depthFirstSearch<TNode>(
  node: TNode,
  getChildren: TGetChildren<TNode>,
  action: (node: TNode) => void = undefined,
  terminateWhen: (node: TNode) => boolean = undefined,
  noExploring: Set<TNode> = new Set(),
  afterSubtreeExplored: (node: TNode, subtreeRootNode: TNode) => void = undefined
): TNode {
  if (noExploring.has(node)) {
    return undefined;
  } else {
    noExploring.add(node);
  }

  if (action) {
    action(node);
  }

  if (terminateWhen && terminateWhen(node)) {
    return node;
  }

  for (const childNode of getChildren(node)) {
    const found = depthFirstSearch(
      childNode,
      getChildren,
      action,
      terminateWhen,
      noExploring,
      afterSubtreeExplored
    );

    if (afterSubtreeExplored) {
      afterSubtreeExplored(node, childNode);
    }

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
