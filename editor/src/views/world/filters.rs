use std::collections::{BTreeMap, BTreeSet};

use game::core::content::ContentRow;
use game::systems::area::{self, AreaDef, AreaModuleKind};
use game::systems::item::ItemDef;
use game::systems::npc::NpcDef;
use game::systems::quest::QuestDef;
use game::systems::shop::ShopDef;
use serde_json::Value;
use strum::VariantArray;

use super::atlas::{OpenTarget, RowSource, RowSourceKind, WorldAtlas};
use crate::app::Editor;
use crate::forms;
use crate::project::{ProjectFiles, row_file};
use crate::schema;

#[derive(Clone, Debug, PartialEq)]
pub enum MapLens {
    Row { table: String, key: String },
    Module(AreaModuleKind),
    Text(String),
}

impl MapLens {
    pub fn chip(&self) -> String {
        match self {
            MapLens::Row { table, key } => format!("{table}: {key}"),
            MapLens::Module(kind) => format!("module: {}", kind.tag()),
            MapLens::Text(text) => format!("text: {text}"),
        }
    }

    pub fn crumb(&self) -> String {
        match self {
            MapLens::Row { table, key } => format!("{table}/{key}"),
            MapLens::Module(kind) => format!("module/{}", kind.tag()),
            MapLens::Text(text) => format!("text/{text}"),
        }
    }

    fn group(&self) -> LensGroup<'_> {
        match self {
            MapLens::Row { table, .. } => LensGroup::Table(table),
            MapLens::Module(_) => LensGroup::Module,
            MapLens::Text(_) => LensGroup::Text,
        }
    }

    fn sources(&self, atlas: &WorldAtlas, area: area::Id) -> Vec<RowSource> {
        let info = &atlas.areas[&area];
        let here = |kind: RowSourceKind, name: String| RowSource {
            kind,
            name,
            opens: OpenTarget::Area {
                key: info.key.clone(),
                module: None,
            },
        };
        match self {
            MapLens::Row { table, key } => atlas.sources(area, table, key).to_vec(),
            MapLens::Module(kind) if info.modules.contains(kind) => {
                vec![here(RowSourceKind::Module, kind.tag().to_owned())]
            }
            MapLens::Text(text) if info.text.contains(&text.to_lowercase()) => {
                vec![here(RowSourceKind::Mention, text.clone())]
            }
            MapLens::Module(_) | MapLens::Text(_) => Vec::new(),
        }
    }
}

pub fn lit_areas(
    atlas: &WorldAtlas,
    lenses: &[MapLens],
) -> Option<BTreeMap<area::Id, Vec<RowSource>>> {
    if lenses.is_empty() {
        return None;
    }
    let mut groups: BTreeMap<LensGroup, Vec<&MapLens>> = BTreeMap::new();
    for lens in lenses {
        groups.entry(lens.group()).or_default().push(lens);
    }
    let mut lit = BTreeMap::new();
    for &area in atlas.areas.keys() {
        let mut sources = Vec::new();
        let every_group = groups.values().all(|group| {
            let before = sources.len();
            sources.extend(group.iter().flat_map(|lens| lens.sources(atlas, area)));
            sources.len() > before
        });
        if every_group {
            lit.insert(area, sources);
        }
    }
    Some(lit)
}

pub fn tag_line(sources: &[RowSource]) -> String {
    let mut counts: BTreeMap<RowSourceKind, usize> = BTreeMap::new();
    for source in sources {
        *counts.entry(source.kind).or_default() += 1;
    }
    counts
        .iter()
        .map(|(kind, count)| kind.tag(*count))
        .collect::<Vec<_>>()
        .join(" · ")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, VariantArray)]
pub enum ColourTable {
    Npc,
    Item,
    Quest,
    Shop,
    Area,
}

impl ColourTable {
    pub fn table(self) -> &'static str {
        match self {
            ColourTable::Npc => NpcDef::TABLE,
            ColourTable::Item => ItemDef::TABLE,
            ColourTable::Quest => QuestDef::TABLE,
            ColourTable::Shop => ShopDef::TABLE,
            ColourTable::Area => AreaDef::TABLE,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ColourField {
    pub table: ColourTable,
    pub path: Vec<String>,
}

impl ColourField {
    pub fn all(editor: &Editor) -> Vec<ColourField> {
        ColourTable::VARIANTS
            .iter()
            .filter_map(|&table| Some((table, editor.shapes.table(table.table())?)))
            .flat_map(|(table, shape)| {
                schema::number_paths(&shape.shape)
                    .into_iter()
                    .map(move |path| ColourField { table, path })
            })
            .collect()
    }

    pub fn parse(text: &str) -> Option<ColourField> {
        let mut parts = text.split('.');
        let head = parts.next()?;
        let table = *ColourTable::VARIANTS
            .iter()
            .find(|table| table.table() == head)?;
        Some(ColourField {
            table,
            path: parts.map(str::to_owned).collect(),
        })
    }

    pub fn name(&self) -> &str {
        self.path.last().map_or("", String::as_str)
    }

    pub fn path_text(&self) -> String {
        self.path.join(" · ")
    }

    pub fn text(&self) -> String {
        format!("{} · {}", self.table.table(), self.path_text())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ColourBy {
    pub field: ColourField,
    pub of: ColourOf,
    pub show: ColourShow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, VariantArray)]
pub enum ColourOf {
    Placed,
    Hostile,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, VariantArray)]
pub enum ColourShow {
    Highest,
    Lowest,
}

impl ColourOf {
    pub fn label(self) -> &'static str {
        match self {
            ColourOf::Placed => "npcs placed here",
            ColourOf::Hostile => "hostile npcs placed here",
        }
    }
}

impl ColourShow {
    pub fn label(self) -> &'static str {
        match self {
            ColourShow::Highest => "the highest",
            ColourShow::Lowest => "the lowest",
        }
    }
}

impl ColourBy {
    pub fn new(field: ColourField) -> ColourBy {
        let of = match field.table {
            ColourTable::Npc => ColourOf::Hostile,
            _ => ColourOf::Placed,
        };
        ColourBy {
            field,
            of,
            show: ColourShow::Highest,
        }
    }

    pub fn chip(&self) -> String {
        format!("colour: {} {}", self.rows(), self.field.name())
    }

    pub fn sentence(&self) -> String {
        format!(
            "coloured by {} {} of {}s",
            self.show.label(),
            self.field.name(),
            self.rows()
        )
    }

    fn rows(&self) -> &'static str {
        match (self.field.table, self.of) {
            (ColourTable::Npc, ColourOf::Hostile) => "hostile npc",
            (table, _) => table.table(),
        }
    }
}

#[derive(Clone, Copy)]
pub struct AreaRange {
    pub low: f64,
    pub high: f64,
}

impl AreaRange {
    pub fn text(&self) -> String {
        if self.low == self.high {
            forms::trim_number(self.low)
        } else {
            format!(
                "{}–{}",
                forms::trim_number(self.low),
                forms::trim_number(self.high)
            )
        }
    }

    pub fn shown(&self, show: ColourShow) -> f64 {
        match show {
            ColourShow::Highest => self.high,
            ColourShow::Lowest => self.low,
        }
    }

    fn widen(range: Option<AreaRange>, value: f64) -> AreaRange {
        match range {
            Some(range) => AreaRange {
                low: range.low.min(value),
                high: range.high.max(value),
            },
            None => AreaRange {
                low: value,
                high: value,
            },
        }
    }
}

pub struct ColourRanges {
    pub areas: BTreeMap<area::Id, AreaRange>,
    pub low: f64,
    pub high: f64,
}

impl ColourRanges {
    pub fn of(atlas: &WorldAtlas, files: &ProjectFiles, colour: &ColourBy) -> ColourRanges {
        let areas: BTreeMap<area::Id, AreaRange> = atlas
            .areas
            .keys()
            .filter_map(|&area| Some((area, range_in(atlas, files, area, colour)?)))
            .collect();
        let shown = areas.values().map(|range| range.shown(colour.show));
        let low = shown.clone().fold(f64::INFINITY, f64::min);
        let high = shown.fold(f64::NEG_INFINITY, f64::max);
        match areas.is_empty() {
            true => ColourRanges {
                areas,
                low: 0.0,
                high: 1.0,
            },
            false => ColourRanges { areas, low, high },
        }
    }

    pub fn fraction(&self, value: f64) -> f32 {
        ((value - self.low) / (self.high - self.low).max(1e-9)) as f32
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum LensGroup<'a> {
    Table(&'a str),
    Module,
    Text,
}

fn range_in(
    atlas: &WorldAtlas,
    files: &ProjectFiles,
    area: area::Id,
    colour: &ColourBy,
) -> Option<AreaRange> {
    let info = &atlas.areas[&area];
    let table = colour.field.table;
    let keys: BTreeSet<&str> = match table {
        ColourTable::Area => BTreeSet::from([info.key.as_str()]),
        ColourTable::Npc => info
            .residents
            .iter()
            .chain(&info.populations)
            .filter(|placed| colour.of == ColourOf::Placed || atlas.hostile(placed.npc))
            .map(|placed| placed.key.as_str())
            .collect(),
        _ => info.rows_found(table.table()).collect(),
    };
    let mut range = None;
    for key in keys {
        let Some(row) = files.json(&row_file(table.table(), key)) else {
            continue;
        };
        for value in numbers_at(&row, &colour.field.path) {
            range = Some(AreaRange::widen(range, value));
        }
    }
    range
}

fn numbers_at(value: &Value, path: &[String]) -> Vec<f64> {
    let Some((head, rest)) = path.split_first() else {
        return match value {
            Value::Number(number) => number.as_f64().into_iter().collect(),
            Value::Array(items) => items.iter().filter_map(Value::as_f64).collect(),
            _ => Vec::new(),
        };
    };
    match value {
        Value::Object(fields) => match fields.get(head) {
            Some(field) => numbers_at(field, rest),
            None => fields
                .get("modules")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter(|module| module["type"] == *head)
                .flat_map(|module| numbers_at(module, rest))
                .collect(),
        },
        Value::Array(items) => items
            .iter()
            .flat_map(|item| numbers_at(item, path))
            .collect(),
        _ => Vec::new(),
    }
}
