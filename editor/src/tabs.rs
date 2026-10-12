/// Everything the centre can show in a tab.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Tab {
    World,
    Row { table: String, key: String },
    Rows { table: String, keys: Vec<String> },
    Area { key: String },
    Blueprint { key: String },
    Script(crate::views::script::ScriptOwner),
    Model { key: String },
    Tileset { key: String },
    Sheet { table: String },
}

impl Tab {
    pub fn title(&self) -> String {
        match self {
            Tab::World => "World".to_owned(),
            Tab::Row { table, .. } if table == crate::views::character::TABLE => {
                "Test characters".to_owned()
            }
            Tab::Row { table, key } => format!("{table}/{key}"),
            Tab::Rows { table, keys } => format!("{} {table}s", keys.len()),
            Tab::Area { key } => format!("area/{key}"),
            Tab::Blueprint { key } => format!("blueprint/{key}"),
            Tab::Script(owner) => owner.title(),
            Tab::Model { key } => format!("model/{key}"),
            Tab::Tileset { key } => format!("tileset/{key}"),
            Tab::Sheet { table } => format!("{table} table"),
        }
    }

    /// The row a tab edits, when it edits one.
    pub fn row(&self) -> Option<(String, String)> {
        match self {
            Tab::World => Some((
                "world_map".to_owned(),
                crate::views::world::ROW_KEY.to_owned(),
            )),
            Tab::Row { table, key } => Some((table.clone(), key.clone())),
            Tab::Rows { .. } => None,
            Tab::Area { key } => Some(("area".to_owned(), key.clone())),
            Tab::Blueprint { key } => Some(("blueprint".to_owned(), key.clone())),
            Tab::Script(owner) => owner.row(),
            Tab::Model { key } => Some(("model".to_owned(), key.clone())),
            Tab::Tileset { key } => Some(("tileset".to_owned(), key.clone())),
            Tab::Sheet { .. } => None,
        }
    }

    /// The tab a row of `table` opens in.
    pub fn for_row(table: &str, key: &str) -> Tab {
        match table {
            "area" => Tab::Area {
                key: key.to_owned(),
            },
            "blueprint" => Tab::Blueprint {
                key: key.to_owned(),
            },
            "model" => Tab::Model {
                key: key.to_owned(),
            },
            "tileset" => Tab::Tileset {
                key: key.to_owned(),
            },
            "script" => Tab::Script(crate::views::script::ScriptOwner::Shared {
                key: key.to_owned(),
            }),
            "world_map" => Tab::World,
            _ => Tab::Row {
                table: table.to_owned(),
                key: key.to_owned(),
            },
        }
    }
}
