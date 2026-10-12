use serde::Serialize;
use serde_json::Value;

// `serde_json::to_value` widens an f32 bit-exactly, so 538.33 lands in the folder as
// 538.3300170898438 and the engine's writer, which prints the shortest form, rewrites the file.
// Going through text keeps both sides byte-identical.
pub fn json<T: Serialize>(value: &T) -> serde_json::Result<Value> {
    serde_json::from_str(&serde_json::to_string(value)?)
}

/// Rows the engine refuses still open in the editor, so a missing field is an ordinary case here,
/// never an error.
pub trait RowValue {
    fn kind(&self) -> &str;
    fn kind_or<'a>(&'a self, default: &'a str) -> &'a str;
    fn text(&self, field: &str) -> &str;
    fn text_or<'a>(&'a self, field: &str, default: &'a str) -> &'a str;
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
}
