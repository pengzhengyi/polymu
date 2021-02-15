/**
 * @module
 *
 * This module exposes common types used by graph searching algorithms.
 */

/**
 * A callback function used to get child nodes from a node.
 * @callback TGetChildren
 * @param {TNode} node - A node to get child nodes of.
 * @returns {IterableIterator<TNode>} An iterable of child nodes.
 */
export type TGetChildren<TNode> = (node: TNode) => IterableIterator<TNode> | Iterable<TNode>;
