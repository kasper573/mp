use std::collections::BTreeMap;

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use crate::core::math::Rect;

pub fn pairs_map<K: Serialize + Ord, T: Serialize, S: Serializer>(
    pairs: &[(K, T)],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let sorted: BTreeMap<&K, &T> = pairs.iter().map(|(key, value)| (key, value)).collect();
    sorted.serialize(serializer)
}

pub fn rect<U, S: Serializer>(rect: &Rect<U>, serializer: S) -> Result<S::Ok, S::Error> {
    let mut map = serializer.serialize_map(Some(4))?;
    map.serialize_entry("x", &rect.origin.x)?;
    map.serialize_entry("y", &rect.origin.y)?;
    map.serialize_entry("w", &rect.size.width)?;
    map.serialize_entry("h", &rect.size.height)?;
    map.end()
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

pub fn with_scope_content<T>(f: impl FnOnce(&super::Content) -> T) -> T {
    let content = super::id::scope_content()
        .expect("rows that name other rows' files are written only inside with_content");
    f(&content)
}

pub fn is_one(count: &u32) -> bool {
    *count == 1
}

pub fn is_false(flag: &bool) -> bool {
    !*flag
}

pub fn is_empty<T>(list: &&[T]) -> bool {
    list.is_empty()
}
