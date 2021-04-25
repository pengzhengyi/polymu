/**
 * @module
 *
 * This module provides an implementation of [A* Search Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm).
 *
 * It uses {@link ../collections/Heap.ts:Heap} as a PriorityQueue.
 */

import Heap from '../collections/Heap';
import { SortFunction } from '../view-functions/transformation/Sort';
import { TGetChildren } from './types';

/**
 * Implement the A* Search algorithm.
 *
 * Instead of requiring specific graph representation, this function uses callback functions to determine child nodes, termination condition, processing step, offering great flexibility.
 *
 * @typedef TNode - A type for all the nodes.
 * @param {TNode} startNode - A node to start search from: will be the first node to be explored.
 * @param {TGetChildren<TNode>} getChildren - A callback function used to get child nodes from a node.
 * @param {SortFunction<TNode>} comparator - Take two nodes and determine which node should be explored first.
 * @param {(TNode) => void} [action] - A callback function to execute before each node is about to be explored (before `terminateWhen` is called on this node). The default is to execute no action.
 * @param {(TNode) => boolean} [terminateWhen] - A callback function to execute on each explored node. If true, then search will terminate and this node will be returned. By default, search will proceed until no more nodes can be explored.
 * @returns {TNode} If a explored node satisfies `terminateWhen`, then that node is returned. Otherwise, `undefined` is returned.
 */
export function AStarSearch<TNode>(
  startNode: TNode,
  getChildren: TGetChildren<TNode>,
  comparator: SortFunction<TNode>,
  action: (node: TNode) => void = undefined,
  terminateWhen: (node: TNode) => boolean = undefined
): TNode {
  const priorityQueue: Heap<TNode> = new Heap(comparator, 10);
  const exploredNodes: Set<TNode> = new Set();

  priorityQueue.add(startNode);
  while (priorityQueue.length > 0) {
    const exploringNode = priorityQueue.pop();

    if (exploredNodes.has(exploringNode)) {
      continue;
    } else {
      exploredNodes.add(exploringNode);
    }

    if (action) {
      action(exploringNode);
    }

    if (terminateWhen && terminateWhen(exploringNode)) {
      return exploringNode;
    }

    priorityQueue.extend(getChildren(exploringNode));
  }

  return undefined;
}
