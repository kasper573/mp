use egui::Ui;
use engine::core::content::{ContentRow, row_file};
use engine::systems::actor::ModelDef;
use engine::systems::area::tileset::TilesetDef;
use engine::systems::area::{self, AreaDef, AreaModule};
use engine::systems::attention::AttentionDef;
use engine::systems::class::ClassDef;
use engine::systems::interface::{CursorDef, InterfaceIconDef};
use engine::systems::item::ItemDef;
use engine::systems::npc::{self, NpcDef};
use engine::systems::player::PlayerDef;
use engine::systems::quest::QuestDef;
use engine::systems::script::{OwnerKind, RiftScripts, ScriptDef};
use engine::systems::skill::SkillDef;
use serde_json::Value;

use super::{Candidate, Category, Dragged, Pick, PickSource};
use crate::forms::{FormAction, FormCx};
use crate::project::ProjectFiles;
use crate::thumbs;
use crate::value::RowValue;
use crate::views::model::{self, ModelStrip};
use crate::views::tileset;

const PICTURE_TABLES: [&str; 6] = [
    ModelDef::TABLE,
    ItemDef::TABLE,
    TilesetDef::TABLE,
    AttentionDef::TABLE,
    InterfaceIconDef::TABLE,
    CursorDef::TABLE,
];

/// Rows of one or more tables. Several tables become the popover's category chips; a single
/// script table offers its owner kinds instead.
pub struct RowSource {
    tables: Vec<String>,
    path: String,
}

impl RowSource {
    pub fn table(table: &str, path: &str) -> RowSource {
        RowSource::tables(&[table], path)
    }

    pub fn tables(tables: &[&str], path: &str) -> RowSource {
        RowSource {
            tables: tables.iter().map(|table| (*table).to_string()).collect(),
            path: path.to_owned(),
        }
    }

    fn several(&self) -> bool {
        self.tables.len() > 1
    }

    fn spoken(&self) -> String {
        self.tables
            .iter()
            .map(|table| table.replace('_', " "))
            .collect::<Vec<_>>()
            .join(" or ")
    }

    fn only_scripts(&self) -> bool {
        self.tables.as_slice() == [ScriptDef::TABLE]
    }
}

impl PickSource for RowSource {
    fn placeholder(&self) -> String {
        self.spoken()
    }

    fn categories(&self, cx: &FormCx) -> Vec<Category> {
        if self.several() {
            return self
                .tables
                .iter()
                .map(|table| Category {
                    id: table.clone(),
                    label: table.replace('_', " "),
                })
                .collect();
        }
        if self.only_scripts() {
            let mut owners: Vec<String> = cx
                .files
                .keys_of(ScriptDef::TABLE)
                .map(|key| script_owner(cx, key))
                .filter(|owner| !owner.is_empty())
                .collect();
            owners.sort();
            owners.dedup();
            return owners
                .into_iter()
                .map(|owner| Category {
                    label: owner.clone(),
                    id: owner,
                })
                .collect();
        }
        Vec::new()
    }

    fn candidates(&self, cx: &FormCx) -> Vec<Candidate> {
        let mut listed = Vec::new();
        for table in &self.tables {
            for key in cx.files.keys_of(table) {
                let category = if self.only_scripts() {
                    script_owner(cx, key)
                } else {
                    table.clone()
                };
                listed.push(Candidate {
                    pick: Pick::new(table.as_str(), key),
                    category,
                    name: display_name(cx, table, key),
                    hint: pick_hint(cx, table, key),
                    blocked: blocked(cx, table, &self.path, key),
                });
            }
        }
        listed
    }

    fn accepts(&self, cx: &FormCx, dragged: &Dragged) -> Result<Pick, String> {
        let Dragged::Row { table, key } = dragged else {
            return Err(format!("this field takes {}, not a file", self.spoken()));
        };
        if !self.tables.iter().any(|listed| listed == table) {
            return Err(format!("this field takes {}, not {table}", self.spoken()));
        }
        if let Some(reason) = blocked(cx, table, &self.path, key) {
            return Err(format!("{table}/{key}: {reason}"));
        }
        Ok(Pick::new(table.as_str(), key.as_str()))
    }

    fn shown(&self, pick: &Pick) -> (String, String) {
        (format!("{}/", pick.category), pick.key.clone())
    }

    fn thumbnail(&self, ui: &mut Ui, cx: &mut FormCx, pick: &Pick, size: f32) {
        thumbnail(ui, cx, &pick.category, &pick.key, size);
    }

    fn footer(&self, cx: &FormCx, pick: &Pick) -> String {
        let uses = cx.usages.of_row(&pick.category, &pick.key).len();
        let mut footer = format!("{}/{}", pick.category, pick.key);
        if let Some(picture) = picture_of(cx.files, &pick.category, &pick.key) {
            footer.push_str(&format!(" · {}", picture.path));
        }
        footer.push_str(&format!(" · used by {uses}"));
        footer
    }

    fn grid(&self) -> bool {
        !self.several() && PICTURE_TABLES.contains(&self.tables[0].as_str())
    }

    fn opens(&self, pick: &Pick) -> Option<FormAction> {
        Some(FormAction::OpenRow {
            table: pick.category.clone(),
            key: pick.key.clone(),
        })
    }

    fn creates(&self, cx: &FormCx) -> Option<(String, FormAction)> {
        if self.several() || cx.shapes.is_closed(&self.tables[0]) {
            return None;
        }
        let table = &self.tables[0];
        Some((
            format!("New {}…", table.replace('_', " ")),
            FormAction::NewRow {
                table: table.clone(),
                path: self.path.clone(),
            },
        ))
    }
}

pub struct Picture {
    pub path: String,
    pub frame: PictureFrame,
}

pub enum PictureFrame {
    Sprite { size: (u32, u32), frame: u32 },
    Whole,
    Tile(u32),
}

pub fn picture_of(files: &ProjectFiles, table: &str, key: &str) -> Option<Picture> {
    let row = files.json(&row_file(table, key))?;
    match table {
        ModelDef::TABLE => sprite(&row),
        NpcDef::TABLE | PlayerDef::TABLE => {
            sprite(&*files.json(&row_file(ModelDef::TABLE, row["model"].as_str()?))?)
        }
        ItemDef::TABLE
        | SkillDef::TABLE
        | AttentionDef::TABLE
        | InterfaceIconDef::TABLE
        | CursorDef::TABLE => Some(Picture {
            path: row["icon"].as_str().or(row["image"].as_str())?.to_owned(),
            frame: PictureFrame::Whole,
        }),
        TilesetDef::TABLE => Some(Picture {
            path: row["image"].as_str()?.to_owned(),
            frame: PictureFrame::Tile(tileset::tile_size(&row).ok()?),
        }),
        _ => None,
    }
}

fn blocked(cx: &FormCx, table: &str, path: &str, key: &str) -> Option<String> {
    match table {
        ScriptDef::TABLE => {
            let kind = owner_kind(cx.owner_table.as_deref()?);
            let owner = script_owner(cx, key);
            (owner_kind(&owner) != kind).then(|| format!("owner {owner}"))
        }
        SkillDef::TABLE if path.ends_with("/basic_attack") => {
            let row = cx.files.json(&row_file(SkillDef::TABLE, key))?;
            (row["basic_attack"] != true).then(|| "not flagged as a basic attack".to_owned())
        }
        SkillDef::TABLE if cx.owner_table.as_deref() == Some(ClassDef::TABLE) => {
            let node = path.strip_prefix("/tree/")?.strip_suffix("/skill")?;
            let class = cx
                .files
                .json(&row_file(ClassDef::TABLE, cx.owner_key.as_deref()?))?;
            let (holder, _) = class["tree"]
                .as_object()?
                .iter()
                .find(|(other, held)| *other != node && held["skill"] == key)?;
            Some(format!("already the node {holder}"))
        }
        NpcDef::TABLE
            if cx.owner_table.as_deref() == Some(QuestDef::TABLE) && path.ends_with("/npc") =>
        {
            let content = cx.content.as_ref()?;
            let scripts = content
                .has_built::<RiftScripts>()
                .then(|| content.built::<RiftScripts>())?;
            let id = content.by_key::<NpcDef>(key)?;
            (!npc::can_be_fought(scripts, id)).then(|| "no script sets it hostile".to_owned())
        }
        _ => None,
    }
}

fn owner_kind(owner: &str) -> OwnerKind {
    owner.parse().unwrap_or(OwnerKind::Any)
}

fn script_owner(cx: &FormCx, key: &str) -> String {
    cx.files
        .json(&row_file(ScriptDef::TABLE, key))
        .map(|row| row.text("owner").to_owned())
        .unwrap_or_default()
}

fn pick_hint(cx: &FormCx, table: &str, key: &str) -> String {
    match table {
        NpcDef::TABLE => {
            let Some(content) = cx.content.clone() else {
                return String::new();
            };
            let Some(id) = content.by_key::<NpcDef>(key) else {
                return String::new();
            };
            let mut places: Vec<String> = Vec::new();
            for area in content.ids::<AreaDef>() {
                let count: u32 = area::placed(&content, area)
                    .iter()
                    .map(|placed| match &placed.module {
                        AreaModule::Resident(resident) if resident.npc == id => 1,
                        AreaModule::Population(population) if population.npc == id => {
                            population.count
                        }
                        _ => 0,
                    })
                    .sum();
                if count > 0 {
                    places.push(format!("{} × {count}", area.key(&content)));
                }
            }
            if places.is_empty() {
                "placed nowhere".to_owned()
            } else {
                places.join(" · ")
            }
        }
        ScriptDef::TABLE => {
            let uses = cx.usages.of_row(ScriptDef::TABLE, key).len();
            format!("{} · used by {uses}", script_owner(cx, key))
        }
        _ => {
            let uses = cx.usages.of_row(table, key).len();
            format!("used by {uses}")
        }
    }
}

fn display_name(cx: &FormCx, table: &str, key: &str) -> String {
    let Some(row) = cx.files.json(&row_file(table, key)) else {
        return String::new();
    };
    ["name", "title", "label"]
        .iter()
        .find_map(|field| row[field].as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn sprite(model: &Value) -> Option<Picture> {
    let idle = model::strip_of(model, ModelStrip::default());
    Some(Picture {
        path: model["sprites"]["image"].as_str()?.to_owned(),
        frame: PictureFrame::Sprite {
            size: model::frame_size(model)?,
            frame: idle.first().map_or(0, |frame| frame.frame),
        },
    })
}

fn thumbnail(ui: &mut Ui, cx: &mut FormCx, table: &str, key: &str, size: f32) {
    let Some(picture) = picture_of(cx.files, table, key) else {
        return;
    };
    let ctx = ui.ctx().clone();
    let Some(thumb) = cx.state.thumbnails.image(&ctx, cx.files, &picture.path) else {
        return;
    };
    match picture.frame {
        PictureFrame::Sprite { size: cell, frame } => {
            let frame = thumbs::sprite_frame(cell, frame, &thumb);
            let scale = size / frame.size.y;
            ui.add(
                egui::Image::from_texture((thumb.texture.id(), frame.size * scale)).uv(frame.uv),
            );
        }
        PictureFrame::Whole => {
            ui.add(
                egui::Image::from_texture((thumb.texture.id(), egui::vec2(size, size)))
                    .fit_to_exact_size(egui::vec2(size, size)),
            );
        }
        PictureFrame::Tile(tile) => {
            let shown = tile as f32 * 2.0;
            let uv = thumbs::uv(thumb.size, 0.0, 0.0, shown, shown);
            ui.add(egui::Image::from_texture((thumb.texture.id(), egui::vec2(size, size))).uv(uv));
        }
    }
}
