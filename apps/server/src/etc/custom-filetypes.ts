export const customFileTypes: readonly FileType[] = [
  {
    name: "Tiled Map (json)",
    extension: ".tmj",
    contentType: "application/json",
  },
  {
    name: "Tiled Tileset (json)",
    extension: ".tsj",
    contentType: "application/json",
  },
];

interface FileType {
  name: string;
  extension: string;
  contentType: string;
}
