use crate::value::RowValue;
use game::core::math::{Pos, Rect, Size};
use game::core::tiling::Tiles;
use game::systems::area::AreaModuleKind;
use serde_json::Value;

pub fn bounds(module: &Value, placement_bounds: Option<Rect<Tiles>>) -> Option<Rect<Tiles>> {
    match module.module_kind()? {
        AreaModuleKind::Object => shape_rect(&module["shape"]),
        AreaModuleKind::SafeZone => rect_of(&module["rect"]),
        AreaModuleKind::Soundscape => rect_of(&module["shape"]),
        AreaModuleKind::Scenery => scenery_rect(module),
        AreaModuleKind::Blueprint => placement_bounds.or_else(|| {
            let at = pos_of(&module["at"])?;
            Some(Rect::new(
                at - game::core::math::Offset::new(0.5, 0.5),
                Size::splat(1.0),
            ))
        }),
        AreaModuleKind::Population => rect_of(&module["roams"]),
        AreaModuleKind::Resident => {
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
    match module.module_kind() {
        Some(AreaModuleKind::Object) => module["shape"]["type"] == "point",
        Some(AreaModuleKind::Resident) => true,
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
    match module.module_kind() {
        Some(AreaModuleKind::Object) => shift_xy(&mut module["shape"]),
        Some(AreaModuleKind::SafeZone) => shift_xy(&mut module["rect"]),
        Some(AreaModuleKind::Soundscape) => shift_xy(&mut module["shape"]),
        Some(AreaModuleKind::Scenery)
        | Some(AreaModuleKind::Blueprint)
        | Some(AreaModuleKind::Resident) => shift_xy(&mut module["at"]),
        Some(AreaModuleKind::Population) if module["roams"].is_object() => {
            shift_xy(&mut module["roams"])
        }
        _ => {}
    }
}

pub fn resize(module: &mut Value, w: f32, h: f32) {
    let target = match module.module_kind() {
        Some(AreaModuleKind::Object) if module["shape"]["type"] == "rect" => &mut module["shape"],
        Some(AreaModuleKind::SafeZone) => &mut module["rect"],
        Some(AreaModuleKind::Soundscape) => &mut module["shape"],
        Some(AreaModuleKind::Population) if module["roams"].is_object() => &mut module["roams"],
        _ => return,
    };
    target["w"] = round(w.max(0.0625));
    target["h"] = round(h.max(0.0625));
}

pub fn has_size(module: &Value) -> bool {
    match module.module_kind() {
        Some(AreaModuleKind::Object) => module["shape"]["type"] == "rect",
        Some(AreaModuleKind::SafeZone) | Some(AreaModuleKind::Soundscape) => true,
        Some(AreaModuleKind::Population) => module["roams"].is_object(),
        _ => false,
    }
}

pub fn flip_field(module: &mut Value, horizontal: bool) {
    if !matches!(
        module.module_kind(),
        Some(AreaModuleKind::Scenery | AreaModuleKind::Blueprint)
    ) {
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
    match module.module_kind() {
        Some(AreaModuleKind::Object) => module["name"]
            .as_str()
            .or(module["label"].as_str())
            .map_or("object".to_owned(), |name| format!("object {name}")),
        Some(AreaModuleKind::Blueprint) => {
            format!("{} placement", module.text_or("blueprint", "blueprint"))
        }
        Some(AreaModuleKind::Population) => format!(
            "{} × {}",
            module.text_or("npc", "npc"),
            module["count"].as_u64().unwrap_or(0)
        ),
        Some(AreaModuleKind::Resident) => format!("resident {}", module.text_or("npc", "npc")),
        Some(AreaModuleKind::Scenery) => format!("scenery {}", module.text("tileset")),
        Some(AreaModuleKind::SharedScript) => format!("script {}", module.text("script")),
        Some(AreaModuleKind::InlineScript) => "inline script".to_owned(),
        Some(other) => other.tag().replace('_', " "),
        None => module.kind_or("module").replace('_', " "),
    }
}

pub fn rect_union(a: Rect<Tiles>, b: Rect<Tiles>) -> Rect<Tiles> {
    let min: Pos<Tiles> = Pos::new(a.min().x.min(b.min().x), a.min().y.min(b.min().y));
    let max: Pos<Tiles> = Pos::new(a.max().x.max(b.max().x), a.max().y.max(b.max().y));
    Rect::new(min, Size::new(max.x - min.x, max.y - min.y))
}
