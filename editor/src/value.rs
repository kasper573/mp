use engine::core::content::{self, Content, ContentScope};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

pub fn json<T: Serialize>(value: &T) -> serde_json::Result<Value> {
    content::serial::json_of(value)
}

pub fn typed<T: DeserializeOwned>(content: &Content, json: Value) -> Option<T> {
    content::with_content(ContentScope::of(content), || serde_json::from_value(json))
        .0
        .ok()
}

pub fn untyped<T: Serialize>(content: &Content, value: &T) -> Option<Value> {
    content::with_content(ContentScope::of(content), || json(value))
        .0
        .ok()
}

pub fn rgba(value: &Value) -> [u8; 4] {
    serde_json::from_value(value.clone()).unwrap_or([255; 4])
}
