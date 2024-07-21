export interface Entity {
  id: string;
  name: string;
  position: Position;
}

export interface Position {
  x: number;
  y: number;
}
