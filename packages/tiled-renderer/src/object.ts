import type { FillStyle, StrokeStyle, ViewContainer } from "@mp/graphics";
import { TextStyle } from "@mp/graphics";
import { Graphics, Text } from "@mp/graphics";
import type {
  VectorEllipseObject,
  VectorPointObject,
  VectorPolygonObject,
  VectorPolylineObject,
  VectorRectangleObject,
  VectorTextObject,
  VectorTileObject,
  VectorTiledObjectUnion,
  TiledText,
} from "@mp/tiled-loader";

export function createObjectView(obj: VectorTiledObjectUnion): ViewContainer {
  switch (obj.objectType) {
    case "ellipse": {
      return createEllipseGraphics(obj);
    }
    case "point": {
      return createPointGraphics(obj);
    }
    case "polygon": {
      return createPolygonGraphics(obj);
    }
    case "polyline": {
      return createPolylineGraphics(obj);
    }
    case "text": {
      return createTextRenderer(obj);
    }
    case "rectangle": {
      return createRectangleGraphics(obj);
    }
    case "tile": {
      return createTileGraphics(obj);
    }
  }
}

const strokeStyle: StrokeStyle = { width: 2, color: "rgba(150,150,150,0.9)" };
const fillStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };

function createEllipseGraphics(obj: VectorEllipseObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.fillStyle = fillStyle;
  g.angle = obj.rotation;
  g.ellipse(obj.position.x, obj.position.y, obj.size.x / 2, obj.size.y / 2);
  g.fill();
  g.stroke();
  return g;
}

function createPointGraphics(obj: VectorPointObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.ellipse(obj.position.x, obj.position.y, 2, 2);
  g.stroke();
  return g;
}

function createPolygonGraphics(obj: VectorPolygonObject): Graphics {
  const g = new Graphics();
  g.fillStyle = fillStyle;
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.moveTo(
    obj.position.x + obj.polygon[0].x,
    obj.position.y + obj.polygon[0].y,
  );
  for (const point of obj.polygon) {
    g.lineTo(obj.position.x + point.x, obj.position.y + point.y);
  }
  g.fill();
  g.stroke();
  return g;
}

function createPolylineGraphics(obj: VectorPolylineObject): Graphics {
  const g = new Graphics();
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.moveTo(
    obj.position.x + obj.polyline[0].x,
    obj.position.y + obj.polyline[0].y,
  );
  for (const point of obj.polyline) {
    g.lineTo(obj.position.x + point.x, obj.position.y + point.y);
  }
  g.stroke();
  return g;
}

function createTextRenderer({
  text,
  position,
  size,
  rotation,
}: VectorTextObject): Text {
  const view = new Text({
    text: text.text,
    x: position.x,
    y: position.y,
    style: createTextStyle(text, size.x),
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

function createRectangleGraphics(obj: VectorRectangleObject): Graphics {
  const g = new Graphics();
  g.fillStyle = fillStyle;
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.rect(obj.position.x, obj.position.y, obj.size.x, obj.size.y);
  g.fill();
  g.stroke();
  return g;
}

function createTileGraphics(obj: VectorTileObject): Graphics {
  const g = new Graphics();
  g.fillStyle = fillStyle;
  g.strokeStyle = strokeStyle;
  g.angle = obj.rotation;
  g.rect(obj.position.x, obj.position.y, obj.size.x, obj.size.y);
  g.fill();
  g.stroke();
  return g;
}
