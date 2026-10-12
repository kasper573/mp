use crate::value::RowValue;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::Tiles;
use serde_json::Value;

pub fn bounds(module: &Value, placement_bounds: Option<Rect<Tiles>>) -> Option<Rect<Tiles>> {
    match module["type"].as_str()? {
        "object" => shape_rect(&module["shape"]),
        "safe_zone" => rect_of(&module["rect"]),
        "soundscape" => rect_of(&module["shape"]),
        "scenery" => scenery_rect(module),
        "blueprint" => placement_bounds.or_else(|| {
            let at = pos_of(&module["at"])?;
            Some(Rect::new(
                at - game::core::math::Offset::new(0.5, 0.5),
                Size::splat(1.0),
            ))
        }),
        "population" => rect_of(&module["roams"]),
        "resident" => {
            let at = pos_of(&module["at"])?;
            Some(Rect::new(
                at - game::core::math::Offset::new(0.5, 0.5),
                Size::splat(1.0),
            ))
        }
        _ => None,
    }
}

pub fn is_point(module: &Value) -> bool {
    match module.kind() {
        "object" => module["shape"]["type"] == "point",
        "resident" => true,
        _ => false,
    }
}

pub fn shape_rect(shape: &Value) -> Option<Rect<Tiles>> {
    match shape["type"].as_str()? {
        "point" => {
            let at = Pos::new(shape["x"].as_f64()? as f32, shape["y"].as_f64()? as f32);
            Some(Rect::new(
                at - game::core::math::Offset::new(0.5, 0.5),
                Size::splat(1.0),
            ))
        }
        _ => rect_of(shape),
    }
}

pub fn rect_of(value: &Value) -> Option<Rect<Tiles>> {
    Some(Rect::new(
        Pos::new(value["x"].as_f64()? as f32, value["y"].as_f64()? as f32),
        Size::new(value["w"].as_f64()? as f32, value["h"].as_f64()? as f32),
    ))
}

pub fn pos_of(value: &Value) -> Option<Pos<Tiles>> {
    Some(Pos::new(
        value["x"].as_f64()? as f32,
        value["y"].as_f64()? as f32,
    ))
}

pub fn scenery_rect(module: &Value) -> Option<Rect<Tiles>> {
    let at = pos_of(&module["at"])?;
    let rows = module["tiles"].as_array()?;
    let height = rows.len() as f32;
    let width = rows.first().and_then(Value::as_array).map_or(0, Vec::len) as f32;
    let flip = module.text_or("flip", "none");
    let x = if matches!(flip, "horizontal" | "both") {
        at.x - width
    } else {
        at.x
    };
    let y = if matches!(flip, "vertical" | "both") {
        at.y - height
    } else {
        at.y
    };
    Some(Rect::new(Pos::new(x, y), Size::new(width, height)))
}

pub fn shift(module: &mut Value, dx: f32, dy: f32) {
    let shift_xy = |value: &mut Value| {
        if let Some(x) = value.get("x").and_then(Value::as_f64) {
            value["x"] = round(x as f32 + dx);
        }
        if let Some(y) = value.get("y").and_then(Value::as_f64) {
            value["y"] = round(y as f32 + dy);
        }
    };
    match module["type"].as_str() {
        Some("object") => shift_xy(&mut module["shape"]),
        Some("safe_zone") => shift_xy(&mut module["rect"]),
        Some("soundscape") => shift_xy(&mut module["shape"]),
        Some("scenery") | Some("blueprint") | Some("resident") => shift_xy(&mut module["at"]),
        Some("population") if module["roams"].is_object() => shift_xy(&mut module["roams"]),
        _ => {}
    }
}

pub fn resize(module: &mut Value, w: f32, h: f32) {
    let target = match module["type"].as_str() {
        Some("object") if module["shape"]["type"] == "rect" => &mut module["shape"],
        Some("safe_zone") => &mut module["rect"],
        Some("soundscape") => &mut module["shape"],
        Some("population") if module["roams"].is_object() => &mut module["roams"],
        _ => return,
    };
    target["w"] = round(w.max(0.0625));
    target["h"] = round(h.max(0.0625));
}

pub fn has_size(module: &Value) -> bool {
    match module["type"].as_str() {
        Some("object") => module["shape"]["type"] == "rect",
        Some("safe_zone") | Some("soundscape") => true,
        Some("population") => module["roams"].is_object(),
        _ => false,
    }
}

pub fn flip_field(module: &mut Value, horizontal: bool) {
    if !matches!(module.kind(), "scenery" | "blueprint") {
        return;
    }
    let current = module.text_or("flip", "none");
    let (mut h, mut v) = match current {
        "horizontal" => (true, false),
        "vertical" => (false, true),
        "both" => (true, true),
        _ => (false, false),
    };
    if horizontal {
        h = !h;
    } else {
        v = !v;
    }
    let next = match (h, v) {
        (false, false) => None,
        (true, false) => Some("horizontal"),
        (false, true) => Some("vertical"),
        (true, true) => Some("both"),
    };
    match next {
        Some(flip) => module["flip"] = Value::String(flip.to_owned()),
        None => {
            module.as_object_mut().map(|m| m.remove("flip"));
        }
    }
}

pub fn round(v: f32) -> Value {
    let snapped = (v * 16.0).round() / 16.0;
    serde_json::json!(snapped)
}

pub fn label(module: &Value) -> String {
    let kind = module.kind_or("module");
    match kind {
        "object" => module["name"]
            .as_str()
            .or(module["label"].as_str())
            .map_or("object".to_owned(), |name| format!("object {name}")),
        "blueprint" => format!("{} placement", module.text_or("blueprint", "blueprint")),
        "population" => format!(
            "{} × {}",
            module.text_or("npc", "npc"),
            module["count"].as_u64().unwrap_or(0)
        ),
        "resident" => format!("resident {}", module.text_or("npc", "npc")),
        "scenery" => format!("scenery {}", module.text("tileset")),
        "shared_script" => format!("script {}", module.text("script")),
        "inline_script" => "inline script".to_owned(),
        other => other.replace('_', " "),
    }
}

pub fn rect_union(a: Rect<Tiles>, b: Rect<Tiles>) -> Rect<Tiles> {
    let min: Pos<Tiles> = Pos::new(a.min().x.min(b.min().x), a.min().y.min(b.min().y));
    let max: Pos<Tiles> = Pos::new(a.max().x.max(b.max().x), a.max().y.max(b.max().y));
    Rect::new(min, Size::new(max.x - min.x, max.y - min.y))
}
