import type { VectorKey, VectorLike } from "@mp/math";
import { squaredDistance, Vector } from "@mp/math";
import createGraph from "ngraph.graph";
import type { PathFinder } from "ngraph.path";
import { aStar } from "ngraph.path";

export class VectorGraph<T extends number> {
  #nodeIds = new Set<VectorGraphNodeId>();
  #ng = createGraph<NodeData<T>, LinkData>();
  #pathFinder: PathFinder<NodeData<T>>;

  get nodeIds(): ReadonlySet<VectorGraphNodeId> {
    return this.#nodeIds;
  }

  constructor() {
    this.#pathFinder = aStar(this.#ng, {
      distance: (fromNode, toNode, link) => {
        const base = link.data.distance;
        const w = Math.pow(
          this.nodeWeight?.(toNode as unknown as VectorGraphNode<T>) ?? 0,
          2, // Square the weight to align weight with our distance value, which is squared distances
        );
        return base + w;
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
   * @param fVector A fractional vector (which means itself never matches a node exactly)
   */
  getNearestNode(fVector: VectorLike<T>): VectorGraphNode<T> | undefined {
    // This is a hot code path so we write a bit more verbose code for higher performance:
    // 1. Avoid Vector allocations, just do manual math operations.
    // 2. Use squared distance to avoid the square root operation from .distance()
    //   (we don't need a real distance, we just need to compare anyway)

    const roundedX = Math.round(fVector.x);
    const roundedY = Math.round(fVector.y);

    let nearest: VectorGraphNode<T> | undefined;
    let minDist = Infinity;

    for (const [xOffset, yOffset] of quadrantOffsets) {
      const y = roundedX + xOffset;
      const x = roundedY + yOffset;
      const dist = squaredDistance(y, x, fVector.x, fVector.y);

      if (dist < minDist) {
        const node = this.getNode(Vector.key(y, x));
        if (node) {
          nearest = node;
          minDist = dist;
        }
      }
    }

    return nearest;
  }

  private nodeWeight?: (node: VectorGraphNode<T>) => number;
  bindNodeWeightFn(fn: (node: VectorGraphNode<T>) => number) {
    if (this.nodeWeight) {
      throw new Error(
        "Node weight function has already been bound. You must unbind it before binding another function",
      );
    }
    this.nodeWeight = fn;
    return (): void => (this.nodeWeight = undefined);
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
    const [, ...path] = this.#pathFinder
      .find(end.id, start.id) // aStar seems to return the path in reverse order, so we flip the args to avoid having to reverse the path
      .map((node) => node.data.vector);
    return path;
  }
}

let quadrantOffsets: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
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
