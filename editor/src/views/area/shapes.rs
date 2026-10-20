use engine::core::audio::soundscape::SoundscapeShape;
use engine::core::content::{name_of, serial};
use engine::core::math::{Offset, Pos, Rect, Size};
use engine::core::tiling::Tiles;
use engine::systems::area::{AreaModuleKind, Flip, ObjectShape};
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
    let named = |field: &str| name_of(module[field].as_str().unwrap_or_default()).to_owned();
    match module.module_kind() {
        Some(AreaModuleKind::Object) => module["name"]
            .as_str()
            .or(module["label"].as_str())
            .map_or("object".to_owned(), |name| format!("object {name}")),
        Some(AreaModuleKind::Blueprint) => module["label"].as_str().map_or_else(
            || format!("{} placement", named("blueprint")),
            str::to_owned,
        ),
        Some(AreaModuleKind::Population) => format!(
            "{} × {}",
            named("npc"),
            module["count"].as_u64().unwrap_or(0)
        ),
        Some(AreaModuleKind::Resident) => format!("resident {}", named("npc")),
        Some(AreaModuleKind::Scenery) => format!("scenery {}", named("tileset")),
        Some(AreaModuleKind::Script) => format!("script {}", named("script")),
        Some(other) => other.tag().replace('_', " "),
        None => module.kind_or("module").replace('_', " "),
    }
}

/// What a node reads as in a scene graph: its label, a ground layer's name, or what the module is:
/// a stamp its tileset, a resident its npc.
pub fn node_label(node: &Value) -> String {
    if let Some(label) = node["label"].as_str() {
        return label.to_owned();
    }
    let named = |field: &str| name_of(node[field].as_str().unwrap_or_default()).to_owned();
    match node["type"].as_str() {
        Some("ground_layer") => return node["name"].as_str().unwrap_or_default().to_owned(),
        Some("folder") => return "folder".to_owned(),
        _ => {}
    }
    match node.module_kind() {
        Some(AreaModuleKind::Object) => node["name"].as_str().unwrap_or("object").to_owned(),
        Some(AreaModuleKind::Resident | AreaModuleKind::Population) => named("npc"),
        Some(AreaModuleKind::Scenery) => named("tileset"),
        Some(AreaModuleKind::Script) => named("script"),
        Some(AreaModuleKind::Blueprint) => named("blueprint"),
        Some(other) => other.tag().replace('_', " "),
        None => node.kind_or("module").replace('_', " "),
    }
}

/// What a module node's row says after its name: where a warp leads, how many a population keeps,
/// where a point stands, or how big a shape is.
pub fn node_detail(node: &Value) -> String {
    let kind = node.module_kind();
    if kind == Some(AreaModuleKind::Object)
        && let Some((area, _)) = super::placement::warp_destinations(node).into_iter().next()
    {
        return format!("→ {}", name_of(&area));
    }
    let size = |rect: Rect<Tiles>| {
        format!(
            "{} × {}",
            crate::forms::tiles(rect.size.width),
            crate::forms::tiles(rect.size.height)
        )
    };
    match kind {
        Some(AreaModuleKind::Population) => format!("× {}", node["count"].as_u64().unwrap_or(0)),
        Some(AreaModuleKind::Resident) => pos_of(&node["at"])
            .map(|at| {
                format!(
                    "{}, {}",
                    crate::forms::tiles(at.x),
                    crate::forms::tiles(at.y)
                )
            })
            .unwrap_or_default(),
        Some(AreaModuleKind::Object) if is_point(node) => object_shape(node)
            .map(|shape| {
                let at = shape.bounds().center();
                format!(
                    "{}, {}",
                    crate::forms::tiles(at.x),
                    crate::forms::tiles(at.y)
                )
            })
            .unwrap_or_default(),
        Some(AreaModuleKind::Blueprint | AreaModuleKind::Script) | None => String::new(),
        Some(_) => bounds(node, None).map(size).unwrap_or_default(),
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
