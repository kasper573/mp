import { vec_distance, type Vector, vec, vec_add, vec_round } from "@mp/math";
import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";
import type { Branded } from "@mp/std";

export class VectorGraph {
  private nodeIds = new Set<VectorGraphNodeId>();
  private ng = createGraph<NodeData, LinkData>();

  getNode = (id: VectorGraphNodeId): VectorGraphNode => {
    const node = this.ng.getNode(id);

    if (!node) {
      throw new Error(`Node ${id} not found`);
    }

    // Forceful assert instead of constructing a new object since this function is called a lot
    // and we want to avoid allocating new objects. The VectorGraphNode type should have a matching
    // shape to the ngraph node, except with stricter id types, so this should be a safe assert, albeit fragile.
    return node as unknown as VectorGraphNode;
  };

  getNodes = (): Iterable<VectorGraphNode> => {
    return this.nodeIds.values().map(this.getNode);
  };

  getNearestNode(vector: Vector): VectorGraphNode | undefined {
    const id = nodeIdFromVector(vec_round(vector));
    return this.hasNode(id) ? this.getNode(id) : undefined;
  }

  getAdjacentNodes(v: Vector): VectorGraphNode[] {
    const from = vec_round(v);
    const xOffset = (v.x - 0.5) % 1 < 0.5 ? -1 : 1;
    const yOffset = (v.y - 0.5) % 1 < 0.5 ? -1 : 1;

    return [
      from,
      vec_add(from, vec(xOffset, 0)),
      vec_add(from, vec(0, yOffset)),
      vec_add(from, vec(xOffset, yOffset)),
    ]
      .map(nodeIdFromVector)
      .filter(this.hasNode)
      .map(this.getNode);
  }

  addNode = (vector: Vector) => {
    const id = nodeIdFromVector(vector);
    this.nodeIds.add(id);
    this.ng.addNode(id, { vector });
  };

  addLink = (fromVector: Vector, toVector: Vector) => {
    this.ng.addLink(nodeIdFromVector(fromVector), nodeIdFromVector(toVector), {
      distance: vec_distance(fromVector, toVector),
    });
  };

  hasNode = (id: VectorGraphNodeId): boolean => {
    return this.ng.hasNode(id) !== undefined;
  };

  removeNode = (id: VectorGraphNodeId) => {
    this.nodeIds.delete(id);
    this.ng.removeNode(id);
  };

  createPathFinder = (): VectorPathFinder => {
    const pathFinder = aStar(this.ng, {
      distance: (n1, n2, link) => link.data.distance,
      heuristic: (from, to) => vec_distance(from.data.vector, to.data.vector),
    });
    return (start, end) => {
      // Skip the first node since it's the start node
      const [_, ...path] = pathFinder
        .find(end, start) // aStar seems to return the path in reverse order, so we flip the args to avoid having to reverse the path
        .map((node) => node.data.vector);
      return path;
    };
  };
}

export type VectorPathFinder = (
  start: VectorGraphNodeId,
  target: VectorGraphNodeId,
) => Vector[] | undefined;

/**
 * Identical to ngraph's node type, but with stricter types.
 */
export interface VectorGraphNode {
  readonly data: Readonly<NodeData>;
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

interface NodeData {
  vector: Vector;
}

export type VectorGraphNodeId = Branded<string, "NodeId">;

function nodeIdFromVector({ x, y }: Vector): VectorGraphNodeId {
  return `${x}:${y}` as VectorGraphNodeId;
}
