import type { FillStyle, StrokeStyle, ViewContainer } from "@mp/pixi";
import { TextStyle } from "@mp/pixi";
import { Graphics, Text } from "@mp/pixi";
import type {
  EllipseObject,
  ObjectTemplate,
  PointObject,
  PolygonObject,
  PolylineObject,
  RectangleObject,
  TextObject,
  TiledObject,
  TiledText,
} from "@mp/tiled-loader";

export * from "./renderer";

export function createObjectView(obj: TiledObject): ViewContainer {
  switch (obj.objectType) {
    case "ellipse":
      return createEllipseGraphics(obj);
    case "point":
      return createPointGraphics(obj);
    case "polygon":
      return createPolygonGraphics(obj);
    case "polyline":
      return createPolylineGraphics(obj);
    case "text":
      return createTextRenderer(obj);
    case "rectangle":
      return createRectangleGraphics(obj);
    case "objectTemplate":
      return createObjectTemplateGraphics(obj);
  }
}

const strokeStyle: StrokeStyle = { width: 2, color: 0xff0000 };
const fillStyle: FillStyle = { color: 0x00ff00 };
const textStyle = new TextStyle({
  fontFamily: "Arial",
  dropShadow: {
    alpha: 0.8,
    angle: 2.1,
    blur: 4,
    color: "0x111111",
    distance: 10,
  },
  fill: "#ffffff",
  stroke: { color: "#004620", width: 12, join: "round" },
  fontSize: 60,
  fontWeight: "lighter",
});

function createEllipseGraphics(obj: EllipseObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.ellipse(obj.x, obj.y, obj.width / 2, obj.height / 2);
  g.stroke();
  return g;
}

function createPointGraphics(obj: PointObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.ellipse(obj.x, obj.y, 2, 2);
  g.stroke();
  return g;
}

function createPolygonGraphics(obj: PolygonObject): Graphics {
  const g = new Graphics();
  g.fillStyle = fillStyle;
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.moveTo(obj.x + obj.polygon[0].x, obj.y + obj.polygon[0].y);
  for (const point of obj.polygon) {
    g.lineTo(obj.x + point.x, obj.y + point.y);
  }
  g.fill();
  g.stroke();
  return g;
}

function createPolylineGraphics(obj: PolylineObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.moveTo(obj.x + obj.polyline[0].x, obj.y + obj.polyline[0].y);
  for (const point of obj.polyline) {
    g.lineTo(obj.x + point.x, obj.y + point.y);
  }
  g.stroke();
  return g;
}

function createTextRenderer({ text, x, y, width, rotation }: TextObject): Text {
  const view = new Text({
    text: text.text,
    x,
    y,
    style: createTextStyle(text, width),
  });

  view.angle = rotation;

  return view;
}

function createTextStyle(
  { bold, color, fontfamily, halign, italic, pixelsize, wrap }: TiledText,
  width: number,
): TextStyle {
  return new TextStyle({
    fontFamily: fontfamily,
    fontSize: pixelsize,
    fontStyle: italic ? "italic" : "normal",
    fontWeight: bold ? "bold" : "normal",
    fill: color,
    align: halign,
    wordWrap: wrap,
    wordWrapWidth: width,
  });
}

function createRectangleGraphics(obj: RectangleObject): Graphics {
  const g = new Graphics();
  g.fillStyle = fillStyle;
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.rect(obj.x, obj.y, obj.width, obj.height);
  g.fill();
  g.stroke();
  return g;
}

function createObjectTemplateGraphics(obj: ObjectTemplate): Graphics {
  throw new Error("Not implemented");
}
