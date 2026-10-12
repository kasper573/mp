use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::core::math::{Pos, Rect, Size};

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[schemars(extend("x-rect" = true))]
pub struct RectRow {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

pub fn rect<U, S: Serializer>(rect: &Rect<U>, serializer: S) -> Result<S::Ok, S::Error> {
    RectRow {
        x: rect.origin.x,
        y: rect.origin.y,
        w: rect.size.width,
        h: rect.size.height,
    }
    .serialize(serializer)
}

pub fn rect_from<'de, U, D: Deserializer<'de>>(deserializer: D) -> Result<Rect<U>, D::Error> {
    let RectRow { x, y, w, h } = RectRow::deserialize(deserializer)?;
    Ok(Rect::new(Pos::new(x, y), Size::new(w, h)))
}

pub fn opt_rect<U, S: Serializer>(
    rect: &Option<Rect<U>>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match rect {
        Some(rect) => self::rect(rect, serializer),
        None => serializer.serialize_none(),
    }
}

pub fn opt_rect_from<'de, U, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Rect<U>>, D::Error> {
    rect_from(deserializer).map(Some)
}

pub fn one() -> u32 {
    1
}

pub fn is_one(count: &u32) -> bool {
    *count == 1
}

pub fn is_false(flag: &bool) -> bool {
    !*flag
}

pub fn is_empty<T>(list: &[T]) -> bool {
    list.is_empty()
}

#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[schemars(extend("x-pos" = true))]
pub struct PosRow {
    x: f32,
    y: f32,
}

pub fn pos<U, S: Serializer>(pos: &Pos<U>, serializer: S) -> Result<S::Ok, S::Error> {
    PosRow { x: pos.x, y: pos.y }.serialize(serializer)
}

pub fn pos_from<'de, U, D: Deserializer<'de>>(deserializer: D) -> Result<Pos<U>, D::Error> {
    let PosRow { x, y } = PosRow::deserialize(deserializer)?;
    Ok(Pos::new(x, y))
}

pub fn one_f32() -> f32 {
    1.0
}

pub fn is_one_f32(value: &f32) -> bool {
    *value == 1.0
}

pub fn is_zero_f32(value: &f32) -> bool {
    *value == 0.0
}
