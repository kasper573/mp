export interface Vec2 {
  x: number;
  y: number;
}

export function v2(x: number, y: number): Vec2 {
  return { x, y };
}

export function v2_distance(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function v2_angle(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function v2_direction(a: Vec2, b: Vec2): Vec2 {
  const angle = v2_angle(a, b);
  return v2(Math.cos(angle), Math.sin(angle));
}

export function v2_mult(a: Vec2, s: number): Vec2 {
  return v2(a.x * s, a.y * s);
}

export function v2_add(a: Vec2, b: Vec2): Vec2 {
  return v2(a.x + b.x, a.y + b.y);
}
