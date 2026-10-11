use std::borrow::Cow;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, RwLock};

use bevy::asset::io::{
    AssetReader, AssetReaderError, AssetSourceBuilder, ErasedAssetReader, PathStream, Reader,
    VecReader,
};
use bevy::prelude::Resource;
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

#[derive(Resource, Clone, Default)]
pub struct SyncedFiles(Arc<RwLock<HashMap<String, Arc<[u8]>>>>);

impl SyncedFiles {
    pub fn replace(&self, files: HashMap<String, Arc<[u8]>>) {
        *self.0.write().expect("synced files lock") = files;
    }

    pub fn source(&self) -> AssetSourceBuilder {
        let files = self.clone();
        AssetSourceBuilder::new(move || Box::new(files.clone()) as Box<dyn ErasedAssetReader>)
    }

    fn get(&self, path: &Path) -> Option<Arc<[u8]>> {
        let files = self.0.read().expect("synced files lock");
        files.get(path.to_str()?).cloned()
    }
}

impl AssetReader for SyncedFiles {
    async fn read<'a>(&'a self, path: &'a Path) -> Result<impl Reader + 'a, AssetReaderError> {
        self.get(path)
            .map(|bytes| VecReader::new(bytes.to_vec()))
            .ok_or_else(|| AssetReaderError::NotFound(path.to_path_buf()))
    }

    async fn read_meta<'a>(&'a self, path: &'a Path) -> Result<impl Reader + 'a, AssetReaderError> {
        Err::<VecReader, _>(AssetReaderError::NotFound(path.to_path_buf()))
    }

    async fn read_directory<'a>(
        &'a self,
        path: &'a Path,
    ) -> Result<Box<PathStream>, AssetReaderError> {
        Err(AssetReaderError::NotFound(path.to_path_buf()))
    }

    async fn is_directory<'a>(&'a self, _path: &'a Path) -> Result<bool, AssetReaderError> {
        Ok(false)
    }
}
