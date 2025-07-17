import type { VectorKey } from "@mp/math";
import { Vector } from "@mp/math";
import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";

export class VectorGraph<T extends number> {
  private nodeIds = new Set<VectorGraphNodeId>();
  private ng = createGraph<NodeData<T>, LinkData>();

  getNode(id: VectorGraphNodeId): VectorGraphNode<T> {
    const node = this.ng.getNode(id);

    if (!node) {
      throw new Error(`Node ${id} not found`);
    }

    // Forceful assert instead of constructing a new object since this function is called a lot
    // and we want to avoid allocating new objects. The VectorGraphNode type should have a matching
    // shape to the ngraph node, except with stricter id types, so this should be a safe assert, albeit fragile.
    return node as unknown as VectorGraphNode<T>;
  }

  getNodes(): Iterable<VectorGraphNode<T>> {
    return this.nodeIds.values().map((n) => this.getNode(n));
  }

  getNearestNode(vector?: Vector<T>): VectorGraphNode<T> | undefined {
    if (!vector) {
      return;
    }
    const [nearestNode] = this.getAdjacentNodes(vector).toSorted(
      (a, b) =>
        // We dont need the real distance since we're only sorting.
        // Squared distance is faster to calculate.
        a.data.vector.squaredDistance(vector) -
        b.data.vector.squaredDistance(vector),
    );
    return nearestNode;
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

  getAdjacentNodes(v: Vector<T>): VectorGraphNode<T>[] {
    const from = v.round();
    const xOffset = (v.x - 0.5) % 1 < 0.5 ? -1 : 1;
    const yOffset = (v.y - 0.5) % 1 < 0.5 ? -1 : 1;

    return [
      Vector.keyFrom(from),
      Vector.key(from.x + xOffset, from.y),
      Vector.key(from.x, from.y + yOffset),
      Vector.key(from.x + xOffset, from.y + yOffset),
    ]
      .filter((key) => this.hasNode(key))
      .map((key) => this.getNode(key));
  }

  getLinkedNodes(v: VectorGraphNode<T>): VectorGraphNode<T>[] {
    return v.links
      .values()
      .map((link) => (link.fromId === v.id ? link.toId : link.fromId))
      .map((n) => this.getNode(n))
      .toArray();
  }

  beginUpdate() {
    this.ng.beginUpdate();
  }

  endUpdate() {
    this.ng.endUpdate();
  }

  addNode(vector: Vector<T>) {
    const key = Vector.keyFrom(vector);
    this.nodeIds.add(key);
    this.ng.addNode(key, { vector });
  }

  addLink(fromVector: Vector<T>, toVector: Vector<T>) {
    const fromKey = Vector.keyFrom(fromVector);
    const toKey = Vector.keyFrom(toVector);
    this.ng.addLink(fromKey, toKey, {
      // Use square distance to avoid the square root operation
      distance: fromVector.squaredDistance(toVector),
    });
  }

  hasNode(id: VectorGraphNodeId): boolean {
    return this.ng.hasNode(id) !== undefined;
  }

  removeNode(id: VectorGraphNodeId) {
    this.nodeIds.delete(id);
    this.ng.removeNode(id);
  }

  createPathFinder(): VectorPathFinder<T> {
    const pathFinder = aStar(this.ng, {
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
    return (start, end) => {
      // Skip the first node since it's the start node
      const [, ...path] = pathFinder
        .find(end, start) // aStar seems to return the path in reverse order, so we flip the args to avoid having to reverse the path
        .map((node) => node.data.vector);
      return path;
    };
  }
}

export type VectorPathFinder<T extends number> = (
  start: VectorGraphNodeId,
  target: VectorGraphNodeId,
) => Vector<T>[] | undefined;

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
