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
  if ("ellipse" in obj) return createEllipseGraphics(obj);
  if ("point" in obj) return createPointGraphics(obj);
  if ("polygon" in obj) return createPolygonGraphics(obj);
  if ("polyline" in obj) return createPolylineGraphics(obj);
  if ("text" in obj) return createTextRenderer(obj);
  if ("object" in obj) return createObjectTemplateGraphics(obj);
  return createRectangleGraphics(obj);
}

const strokeStyle: StrokeStyle = { width: 2, color: 0xff0000 };
const fillStyle: FillStyle = { color: 0x00ff00 };

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
