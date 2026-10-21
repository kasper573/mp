use engine::core::content::{self, Content, ContentScope};
use engine::systems::script::ScriptModule;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

// `serde_json::to_value` widens an f32 bit-exactly, so 538.33 lands in the folder as
// 538.3300170898438 and the engine's writer, which prints the shortest form, rewrites the file.
// Going through text keeps both sides byte-identical.
pub fn json<T: Serialize>(value: &T) -> serde_json::Result<Value> {
    serde_json::from_str(&serde_json::to_string(value)?)
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

// Rows the engine refuses still open in the editor, so a missing field is an ordinary case here,
// never an error.
pub trait RowValue {
    fn kind(&self) -> &str;
    fn kind_or<'a>(&'a self, default: &'a str) -> &'a str;
    fn text(&self, field: &str) -> &str;
    fn text_or<'a>(&'a self, field: &str, default: &'a str) -> &'a str;
    fn remove_field(&mut self, field: &str);

    fn is_script_module(&self) -> bool {
        self.kind() == ScriptModule::TAG
    }
}

impl RowValue for Value {
    fn kind(&self) -> &str {
        self.text("type")
    }

    fn kind_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.text_or("type", default)
    }

    fn text(&self, field: &str) -> &str {
        self.text_or(field, "")
    }

    fn text_or<'a>(&'a self, field: &str, default: &'a str) -> &'a str {
        self[field].as_str().unwrap_or(default)
    }

    fn remove_field(&mut self, field: &str) {
        if let Some(map) = self.as_object_mut() {
            map.remove(field);
        }
    }
}

impl RowValue for serde_json::Map<String, Value> {
    fn kind(&self) -> &str {
        self.text("type")
    }

    fn kind_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.text_or("type", default)
    }

    fn text(&self, field: &str) -> &str {
        self.text_or(field, "")
    }

    fn text_or<'a>(&'a self, field: &str, default: &'a str) -> &'a str {
        self.get(field).and_then(Value::as_str).unwrap_or(default)
    }

    fn remove_field(&mut self, field: &str) {
        self.remove(field);
    }
}
