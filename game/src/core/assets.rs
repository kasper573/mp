use std::borrow::Cow;

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct AssetRef(pub String);

impl AssetRef {
    pub fn new(path: impl Into<String>) -> AssetRef {
        AssetRef(path.into())
    }

    pub fn path(&self) -> String {
        format!("assets/{}", self.0)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl JsonSchema for AssetRef {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("AssetPath")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        String::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

impl<'de> Deserialize<'de> for AssetRef {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<AssetRef, D::Error> {
        let human = deserializer.is_human_readable();
        let path = String::deserialize(deserializer)?;
        if human {
            crate::core::content::id::scope_asset(&path);
        }
        Ok(AssetRef(path))
    }
}
