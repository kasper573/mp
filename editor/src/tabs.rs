use engine::core::content::{ContentRow, Fixture};
use engine::systems::actor::model::ModelDef;
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::tileset::TilesetDef;
use engine::systems::area::world_map::{WorldMap, WorldMapDef};
use engine::systems::script::ScriptDef;

use crate::views::character;
use crate::views::script::ScriptOwner;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum EditorTab {
    World,
    Row { table: String, key: String },
    Rows { table: String, keys: Vec<String> },
    Area { key: String },
    Blueprint { key: String },
    Script(ScriptOwner),
    Model { key: String },
    Tileset { key: String },
    Spreadsheet { table: String },
    Game,
    Asset { path: String },
}

/// What a tab's context menu asked to close, done once the dock is no longer being drawn.
#[derive(Clone, Debug, PartialEq)]
pub enum CloseTabs {
    All,
    Others(EditorTab),
    ToTheRight(EditorTab),
}

impl EditorTab {
    pub fn title(&self) -> String {
        match self {
            EditorTab::World => "World".to_owned(),
            EditorTab::Row { table, .. } if table == character::TABLE => {
                "Test characters".to_owned()
            }
            EditorTab::Row { table, key } => format!("{table}/{key}"),
            EditorTab::Rows { table, keys } => format!("{} {table}s", keys.len()),
            EditorTab::Area { key } => format!("{}/{key}", AreaDef::TABLE),
            EditorTab::Blueprint { key } => format!("{}/{key}", BlueprintDef::TABLE),
            EditorTab::Script(owner) => owner.title(),
            EditorTab::Model { key } => format!("{}/{key}", ModelDef::TABLE),
            EditorTab::Tileset { key } => format!("{}/{key}", TilesetDef::TABLE),
            EditorTab::Spreadsheet { table } => format!("{table} table"),
            EditorTab::Game => "game".to_owned(),
            EditorTab::Asset { path } => path.rsplit('/').next().unwrap_or(path).to_owned(),
        }
    }

    pub fn row(&self) -> Option<(String, String)> {
        match self {
            EditorTab::World => Some((
                WorldMapDef::TABLE.to_owned(),
                WorldMap::World.key().to_owned(),
            )),
            EditorTab::Row { table, key } => Some((table.clone(), key.clone())),
            EditorTab::Rows { .. } => None,
            EditorTab::Area { key } => Some((AreaDef::TABLE.to_owned(), key.clone())),
            EditorTab::Blueprint { key } => Some((BlueprintDef::TABLE.to_owned(), key.clone())),
            EditorTab::Script(owner) => Some(owner.row()),
            EditorTab::Model { key } => Some((ModelDef::TABLE.to_owned(), key.clone())),
            EditorTab::Tileset { key } => Some((TilesetDef::TABLE.to_owned(), key.clone())),
            EditorTab::Spreadsheet { .. } | EditorTab::Game | EditorTab::Asset { .. } => None,
        }
    }

    pub fn is_row(&self, table: &str, key: &str) -> bool {
        match self {
            EditorTab::Script(owner) => owner.is_row(table, key),
            other => other.row().is_some_and(|(t, k)| t == table && k == key),
        }
    }

    pub fn for_row(table: &str, key: &str) -> EditorTab {
        match table {
            AreaDef::TABLE => EditorTab::Area {
                key: key.to_owned(),
            },
            BlueprintDef::TABLE => EditorTab::Blueprint {
                key: key.to_owned(),
            },
            ModelDef::TABLE => EditorTab::Model {
                key: key.to_owned(),
            },
            TilesetDef::TABLE => EditorTab::Tileset {
                key: key.to_owned(),
            },
            ScriptDef::TABLE => EditorTab::Script(ScriptOwner::Shared {
                key: key.to_owned(),
            }),
            WorldMapDef::TABLE => EditorTab::World,
            _ => EditorTab::Row {
                table: table.to_owned(),
                key: key.to_owned(),
            },
        }
    }
}
