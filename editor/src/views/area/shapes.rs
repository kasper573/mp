use game::core::audio::soundscape::SoundscapeShape;
use game::core::content::serial;
use game::core::math::{Offset, Pos, Rect, Size};
use game::core::tiling::Tiles;
use game::systems::area::{AreaModuleKind, Flip, ObjectShape};
use serde::Deserialize;
use serde_json::Value;

use crate::value::RowValue;

pub fn bounds(module: &Value, placement_bounds: Option<Rect<Tiles>>) -> Option<Rect<Tiles>> {
    match module.module_kind()? {
        AreaModuleKind::Object => object_shape(module).map(|shape| shape.bounds()),
        AreaModuleKind::SafeZone => rect_of(&module["rect"]),
        AreaModuleKind::Soundscape => soundscape_shape(module).map(SoundscapeShape::bounds),
        AreaModuleKind::Scenery => scenery_rect(module),
        AreaModuleKind::Blueprint => {
            placement_bounds.or_else(|| pos_of(&module["at"]).map(cell_rect))
        }
        AreaModuleKind::Population => rect_of(&module["roams"]),
        AreaModuleKind::Resident => pos_of(&module["at"]).map(cell_rect),
        _ => None,
    }
}

pub fn is_ellipse(module: &Value) -> bool {
    matches!(soundscape_shape(module), Some(SoundscapeShape::Ellipse(_)))
}

pub fn is_point(module: &Value) -> bool {
    match module.module_kind() {
        Some(AreaModuleKind::Object) => {
            matches!(object_shape(module), Some(ObjectShape::Point(_)))
        }
        Some(AreaModuleKind::Resident) => true,
        _ => false,
    }
}

pub fn rect_of(value: &Value) -> Option<Rect<Tiles>> {
    serial::rect_from(value).ok()
}

pub fn cell_rect(at: Pos<Tiles>) -> Rect<Tiles> {
    Rect::new(at - Offset::new(0.5, 0.5), Size::splat(1.0))
}

pub fn pos_of(value: &Value) -> Option<Pos<Tiles>> {
    serial::pos_from(value).ok()
}

pub fn scenery_rect(module: &Value) -> Option<Rect<Tiles>> {
    let at = pos_of(&module["at"])?;
    let rows = module["tiles"].as_array()?;
    let width = rows.first().and_then(Value::as_array).map_or(0, Vec::len);
    let size = Size::new(width as f32, rows.len() as f32);
    Some(flip_of(module).place(Rect::new(Pos::new(0.0, 0.0), size), at))
}

pub fn shift(module: &mut Value, dx: f32, dy: f32) {
    let Some(field) = placed_field(module) else {
        return;
    };
    let at = &mut module[field];
    if let Some(x) = at.get("x").and_then(Value::as_f64) {
        at["x"] = sixteenth_json(x as f32 + dx);
    }
    if let Some(y) = at.get("y").and_then(Value::as_f64) {
        at["y"] = sixteenth_json(y as f32 + dy);
    }
}

pub fn resize(module: &mut Value, w: f32, h: f32) {
    let Some(field) = sized_field(module) else {
        return;
    };
    module[field]["w"] = sixteenth_json(w.max(0.0625));
    module[field]["h"] = sixteenth_json(h.max(0.0625));
}

pub fn has_size(module: &Value) -> bool {
    sized_field(module).is_some()
}

pub fn flip_field(module: &mut Value, horizontal: bool) {
    if !matches!(
        module.module_kind(),
        Some(AreaModuleKind::Scenery | AreaModuleKind::Blueprint)
    ) {
        return;
    }
    let flip = flip_of(module).compose(Flip::of(horizontal, !horizontal));
    if flip.is_none() {
        module.remove_field("flip");
    } else {
        module["flip"] = Value::String(flip.as_ref().to_owned());
    }
}

pub fn sixteenth_json(v: f32) -> Value {
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

fn object_shape(module: &Value) -> Option<ObjectShape> {
    ObjectShape::deserialize(&module["shape"]).ok()
}

fn soundscape_shape(module: &Value) -> Option<SoundscapeShape> {
    SoundscapeShape::deserialize(&module["shape"]).ok()
}

fn flip_of(module: &Value) -> Flip {
    Flip::deserialize(&module["flip"]).unwrap_or_default()
}

fn placed_field(module: &Value) -> Option<&'static str> {
    match module.module_kind()? {
        AreaModuleKind::Object | AreaModuleKind::Soundscape => Some("shape"),
        AreaModuleKind::SafeZone => Some("rect"),
        AreaModuleKind::Scenery | AreaModuleKind::Blueprint | AreaModuleKind::Resident => {
            Some("at")
        }
        AreaModuleKind::Population if module["roams"].is_object() => Some("roams"),
        _ => None,
    }
}

fn sized_field(module: &Value) -> Option<&'static str> {
    match module.module_kind()? {
        AreaModuleKind::Object => {
            matches!(object_shape(module), Some(ObjectShape::Rect(_))).then_some("shape")
        }
        AreaModuleKind::Soundscape => Some("shape"),
        AreaModuleKind::SafeZone => Some("rect"),
        AreaModuleKind::Population if module["roams"].is_object() => Some("roams"),
        _ => None,
    }
}
