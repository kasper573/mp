export class Vec2 {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  distance(b: Vec2): number {
    return Math.sqrt((this.x - b.x) ** 2 + (this.y - b.y) ** 2);
  }

  angle(b: Vec2): number {
    return Math.atan2(b.y - this.y, b.x - this.x);
  }

  direction(b: Vec2): Vec2 {
    const angle = this.angle(b);
    return new Vec2(Math.cos(angle), Math.sin(angle));
  }

  mult(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  add(b: Vec2): Vec2 {
    return new Vec2(this.x + b.x, this.y + b.y);
  }
}
