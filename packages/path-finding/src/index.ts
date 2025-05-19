import { Vector } from "@mp/math";
import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";
import type { Branded } from "@mp/std";

export class VectorGraph<T extends number> {
  private nodeIds = new Set<VectorGraphNodeId>();
  private ng = createGraph<NodeData<T>, LinkData>();

  readonly getNode = (id: VectorGraphNodeId): VectorGraphNode<T> => {
    const node = this.ng.getNode(id);

    if (!node) {
      throw new Error(`Node ${id} not found`);
    }

    // Forceful assert instead of constructing a new object since this function is called a lot
    // and we want to avoid allocating new objects. The VectorGraphNode type should have a matching
    // shape to the ngraph node, except with stricter id types, so this should be a safe assert, albeit fragile.
    return node as unknown as VectorGraphNode<T>;
  };

  readonly getNodes = (): Iterable<VectorGraphNode<T>> => {
    return this.nodeIds.values().map(this.getNode);
  };

  getNearestNode(vector?: Vector<T>): VectorGraphNode<T> | undefined {
    if (!vector) {
      return;
    }
    const [nearestNode] = this.getAdjacentNodes(vector).toSorted(
      (a, b) => a.data.vector.distance(vector) - b.data.vector.distance(vector),
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
      from,
      from.add(new Vector<T>(xOffset as T, 0 as T)),
      from.add(new Vector<T>(0 as T, yOffset as T)),
      from.add(new Vector<T>(xOffset as T, yOffset as T)),
    ]
      .map(nodeIdFromVector)
      .filter(this.hasNode)
      .map(this.getNode);
  }

  getLinkedNodes(v: VectorGraphNode<T>): VectorGraphNode<T>[] {
    return v.links
      .values()
      .map((link) => (link.fromId === v.id ? link.toId : link.fromId))
      .map(this.getNode)
      .toArray();
  }

  readonly addNode = (vector: Vector<T>) => {
    const id = nodeIdFromVector(vector);
    this.nodeIds.add(id);
    this.ng.addNode(id, { vector });
  };

  readonly addLink = (fromVector: Vector<T>, toVector: Vector<T>) => {
    this.ng.addLink(nodeIdFromVector(fromVector), nodeIdFromVector(toVector), {
      distance: fromVector.distance(toVector),
    });
  };

  readonly hasNode = (id: VectorGraphNodeId): boolean => {
    return this.ng.hasNode(id) !== undefined;
  };

  readonly removeNode = (id: VectorGraphNodeId) => {
    this.nodeIds.delete(id);
    this.ng.removeNode(id);
  };

  readonly createPathFinder = (): VectorPathFinder<T> => {
    const pathFinder = aStar(this.ng, {
      distance: (fromNode, toNode, link) => {
        const base = link.data.distance;
        const w =
          this.nodeWeight?.(toNode as unknown as VectorGraphNode<T>) ?? 0;
        return base + w;
      },
      heuristic: (from, to) => from.data.vector.distance(to.data.vector),
    });
    return (start, end) => {
      // Skip the first node since it's the start node
      const [, ...path] = pathFinder
        .find(end, start) // aStar seems to return the path in reverse order, so we flip the args to avoid having to reverse the path
        .map((node) => node.data.vector);
      return path;
    };
  };
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

export type VectorGraphNodeId = Branded<string, "NodeId">;

function nodeIdFromVector<T extends number>({
  x,
  y,
}: Vector<T>): VectorGraphNodeId {
  return `${x}:${y}` as VectorGraphNodeId;
}
