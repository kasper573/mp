import type { VectorKey, VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import createGraph from "ngraph.graph";
import type { PathFinder } from "ngraph.path";
import ngraph from "ngraph.path";

export class VectorGraph<T extends number> {
  #nodeIds = new Set<VectorGraphNodeId>();
  #ng = createGraph<NodeData<T>, LinkData>();
  #pathFinder: PathFinder<NodeData<T>>;

  get nodeIds(): ReadonlySet<VectorGraphNodeId> {
    return this.#nodeIds;
  }

  constructor() {
    this.#pathFinder = ngraph.aGreedy(this.#ng, {
      distance: (fromNode, toNode, link) => {
        return link.data.distance;
      },
      heuristic: (from, to) => from.data.vector.squaredDistance(to.data.vector),
    });
  }

  getNode(id: VectorGraphNodeId): VectorGraphNode<T> | undefined {
    // Forceful assert instead of constructing a new object since this function is called a lot
    // and we want to avoid allocating new objects. The VectorGraphNode type should have a matching
    // shape to the ngraph node, except with stricter id types, so this should be a safe assert, albeit fragile.
    return this.#ng.getNode(id) as unknown as VectorGraphNode<T>;
  }

  /**
   * Gets the node directly at the given vector, rounded to the nearest integer.
   * @param fVector A fractional vector (which means itself never matches a node exactly)
   */
  getNodeAt(fVector: VectorLike<T>): VectorGraphNode<T> | undefined {
    // This is a hot code path so we write a bit more verbose code for higher performance:
    // 1. Avoid Vector allocations, just do manual math operations.
    const x = Math.floor(fVector.x + 0.5);
    const y = Math.floor(fVector.y + 0.5);
    return this.getNode(Vector.key(x, y));
  }

  /**
   * Gets the node directly at the given vector, or an arbitrary adjacent node.
   * Returns undefined if no node is found.
   * @param fVector A fractional vector (which means itself never matches a node exactly)
   */
  getProximityNode(fVector: VectorLike<T>): VectorGraphNode<T> | undefined {
    // This is a hot code path so we write a bit more verbose code for higher performance:
    // 1. Avoid Vector allocations, just do manual math operations.
    const flooredX = Math.floor(fVector.x + 0.5);
    const flooredY = Math.floor(fVector.y + 0.5);

    for (const [xOffset, yOffset] of nearestNodeOffsets) {
      const x = flooredX + xOffset;
      const y = flooredY + yOffset;
      const node = this.getNode(Vector.key(x, y));
      if (node) {
        return node;
      }
    }
  }

  beginUpdate() {
    this.#ng.beginUpdate();
  }

  endUpdate() {
    this.#ng.endUpdate();
  }

  addNode(vector: Vector<T>) {
    const key = Vector.keyFrom(vector);
    this.#nodeIds.add(key);
    this.#ng.addNode(key, { vector });
  }

  addLink(fromVector: Vector<T>, toVector: Vector<T>) {
    const fromKey = Vector.keyFrom(fromVector);
    const toKey = Vector.keyFrom(toVector);
    this.#ng.addLink(fromKey, toKey, {
      // Use square distance to avoid the square root operation
      distance: fromVector.squaredDistance(toVector),
    });
  }

  removeNode(id: VectorGraphNodeId) {
    this.#nodeIds.delete(id);
    this.#ng.removeNode(id);
  }

  findPath(
    start: VectorGraphNode<T>,
    end: VectorGraphNode<T>,
  ): Vector<T>[] | undefined {
    // Skip the first node since it's the start node
    const path = this.#pathFinder
      .find(start.id, end.id)
      .map((node) => node.data.vector);

    // ngraph seems to return the path in reverse order, so we flip the args to avoid having to reverse the path
    // (nba and aStar consistently return the path reversed while aGreedy returns it seemingly randomly reversed)
    if (!path[0]?.equals(start.data.vector)) {
      path.reverse();
    }

    // Skip the first node since it's the start node
    return path.slice(1);
  }
}

let nearestNodeOffsets: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Identical to ngraph's node type, but with stricter types.
 */
export interface VectorGraphNode<T extends number> {
  readonly data: NodeData<T>;
  readonly id: VectorGraphNodeId;
  readonly links: ReadonlySet<{
    readonly id: string;
    readonly fromId: VectorGraphNodeId;
    readonly toId: VectorGraphNodeId;
    readonly data: LinkData;
  }>;
}

interface LinkData {
  distance: number;
}

interface NodeData<T extends number> {
  readonly vector: Vector<T>;
}

export type VectorGraphNodeId = VectorKey;
