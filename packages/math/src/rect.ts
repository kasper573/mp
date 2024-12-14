export class Rect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}

  toString(): string {
    return `(${this.x},${this.y},${this.width},${this.height})`;
  }
}
