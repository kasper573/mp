use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{AsRefStr, EnumString};

use super::AreaDef;
use crate::core::content::{ContentProblem, ContentRow, ErrorPlace, LoadError, row_folder};
use crate::core::math::{Pos, Rect, Size};
use crate::core::tiling::{GridSize, Tiles};
use crate::systems::area::tileset::TilesetId;

#[derive(
    JsonSchema,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    EnumString,
    AsRefStr,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Flip {
    #[default]
    None,
    Horizontal,
    Vertical,
    Both,
}

impl Flip {
    pub fn is_none(&self) -> bool {
        *self == Flip::None
    }

    pub fn of(horizontal: bool, vertical: bool) -> Flip {
        match (horizontal, vertical) {
            (false, false) => Flip::None,
            (true, false) => Flip::Horizontal,
            (false, true) => Flip::Vertical,
            (true, true) => Flip::Both,
        }
    }

    pub fn horizontal(self) -> bool {
        matches!(self, Flip::Horizontal | Flip::Both)
    }

    pub fn vertical(self) -> bool {
        matches!(self, Flip::Vertical | Flip::Both)
    }

    pub fn compose(self, other: Flip) -> Flip {
        Flip::of(
            self.horizontal() ^ other.horizontal(),
            self.vertical() ^ other.vertical(),
        )
    }

    pub fn anchored(self, at: Pos<Tiles>, size: Size<Tiles>) -> Rect<Tiles> {
        let min = Pos::new(
            if self.horizontal() {
                at.x - size.width
            } else {
                at.x
            },
            if self.vertical() {
                at.y - size.height
            } else {
                at.y
            },
        );
        Rect::new(min, size)
    }

    pub fn apply(self, p: Pos<Tiles>) -> Pos<Tiles> {
        Pos::new(
            if self.horizontal() { -p.x } else { p.x },
            if self.vertical() { -p.y } else { p.y },
        )
    }
}

pub const PALETTE_FILE: &str = "palette.csv";
pub const WALK_FILE: &str = "walk.csv";

pub fn folder(area_key: &str) -> String {
    row_folder(AreaDef::TABLE, area_key)
}

pub fn palette_file(area_key: &str) -> String {
    format!("{}/{PALETTE_FILE}", folder(area_key))
}

pub fn area_of_palette_file(path: &str) -> Option<&str> {
    path.strip_prefix(&format!("{}/", row_folder(AreaDef::TABLE, "")))?
        .strip_suffix(&format!("/{PALETTE_FILE}"))
}

pub fn write_palette(rows: &[PaletteRow]) -> String {
    let header = PALETTE_HEADER.map(str::to_owned).to_vec();
    write_records(std::iter::once(header).chain(rows.iter().map(|row| {
        let flip = if row.flip.is_none() {
            ""
        } else {
            row.flip.as_ref()
        };
        vec![row.tileset.clone(), row.tile.to_string(), flip.to_owned()]
    })))
}

pub fn layer_file(layer: &str) -> String {
    format!("{layer}.csv")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PaletteEntry {
    pub tileset: TilesetId,
    pub tile: u32,
    pub flip: Flip,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GroundLayer {
    pub name: String,
    pub cells: Vec<Option<u32>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AreaGrids {
    pub size: GridSize,
    pub palette: Vec<PaletteEntry>,
    pub palette_keys: Vec<PaletteRow>,
    pub ground: Vec<GroundLayer>,
    pub walk: Vec<Option<bool>>,
}

impl AreaGrids {
    pub fn layer_names(&self) -> Vec<String> {
        self.ground.iter().map(|layer| layer.name.clone()).collect()
    }

    pub fn tilesets(&self) -> BTreeSet<String> {
        self.palette_keys
            .iter()
            .map(|row| row.tileset.clone())
            .collect()
    }

    pub fn entry(&self, cell: Option<u32>) -> Option<PaletteEntry> {
        self.palette.get(cell? as usize).copied()
    }

    pub fn write_palette(&self) -> String {
        write_palette(&self.palette_keys)
    }

    pub fn write_layer(&self, layer: &GroundLayer) -> String {
        write_layer(self.size, layer)
    }

    pub fn write_walk(&self) -> String {
        write_walk(self.size, &self.walk)
    }
}

pub fn write_layer(size: GridSize, layer: &GroundLayer) -> String {
    write_grid(size, &layer.cells, |cell| match cell {
        Some(index) => index.to_string(),
        None => String::new(),
    })
}

pub fn write_walk(size: GridSize, walk: &[Option<bool>]) -> String {
    write_grid(size, walk, |cell| match cell {
        Some(true) => "1".to_owned(),
        Some(false) => "0".to_owned(),
        None => String::new(),
    })
}

fn write_grid<T>(size: GridSize, cells: &[T], show: impl Fn(&T) -> String) -> String {
    write_records(
        cells
            .chunks(size.width.max(1) as usize)
            .map(|row| row.iter().map(&show).collect()),
    )
}

pub struct GridFile<'a> {
    pub path: &'a str,
    pub text: &'a str,
}

pub struct BadCell {
    pub rule: &'static str,
    pub expected: String,
}

pub fn read_grid<T>(
    file: GridFile,
    size: GridSize,
    mut cell: impl FnMut(&str) -> Result<T, BadCell>,
    errors: &mut Vec<LoadError>,
) -> Option<Vec<T>>
where
    T: Default + Clone,
{
    let records = read_records(&file, errors)?;
    let height = size.height as usize;
    let width = size.width as usize;
    if records.len() != height || records.iter().any(|record| record.len() != width) {
        let found = match records.iter().find(|record| record.len() != width) {
            Some(record) if records.len() == height => format!("a row of {} columns", record.len()),
            _ => format!("{} rows", records.len()),
        };
        errors.push(LoadError {
            file: file.path.to_owned(),
            at: ErrorPlace::WholeFile,
            problem: ContentProblem::new(
                "grid size",
                found,
                format!("{height} rows of {width} columns, the area's size"),
            ),
        });
        return None;
    }
    let mut cells = vec![T::default(); width * height];
    let mut ok = true;
    for (row, record) in records.iter().enumerate() {
        for (column, field) in record.iter().enumerate() {
            match cell(field) {
                Ok(value) => cells[row * width + column] = value,
                Err(bad) => {
                    ok = false;
                    errors.push(LoadError {
                        file: file.path.to_owned(),
                        at: ErrorPlace::Csv {
                            row: row + 1,
                            column: column + 1,
                        },
                        problem: ContentProblem::new(bad.rule, format!("{field:?}"), bad.expected),
                    });
                }
            }
        }
    }
    ok.then_some(cells)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaletteRow {
    pub tileset: String,
    pub tile: u32,
    pub flip: Flip,
}

pub fn read_palette(file: GridFile, errors: &mut Vec<LoadError>) -> Option<Vec<PaletteRow>> {
    let mut records = read_records(&file, errors)?.into_iter();
    let header = records.next();
    if header
        .as_ref()
        .is_none_or(|header| !header.iter().eq(PALETTE_HEADER))
    {
        errors.push(LoadError {
            file: file.path.to_owned(),
            at: ErrorPlace::Csv { row: 1, column: 1 },
            problem: ContentProblem::new(
                "bad cell",
                format!("{:?}", header.as_ref().map(joined).unwrap_or_default()),
                format!("the header {}", PALETTE_HEADER.join(",")),
            ),
        });
        return None;
    }
    let mut rows = Vec::new();
    let mut ok = true;
    for (index, record) in records.enumerate() {
        match palette_row(&record) {
            Ok(row) => rows.push(row),
            Err((column, found, expected)) => {
                ok = false;
                errors.push(LoadError {
                    file: file.path.to_owned(),
                    at: ErrorPlace::Csv {
                        row: index + 2,
                        column,
                    },
                    problem: ContentProblem::new("bad cell", format!("{found:?}"), expected),
                });
            }
        }
    }
    ok.then_some(rows)
}

const PALETTE_HEADER: [&str; 3] = ["tileset", "tile", "flip"];

fn palette_row(record: &csv::StringRecord) -> Result<PaletteRow, (usize, String, &'static str)> {
    if record.len() != PALETTE_HEADER.len() {
        return Err((1, joined(record), "three fields: tileset,tile,flip"));
    }
    let tile = record[1]
        .parse::<u32>()
        .map_err(|_| (2, record[1].to_owned(), "a tile number"))?;
    let flip = match &record[2] {
        "" => Ok(Flip::None),
        text => text.parse::<Flip>(),
    }
    .map_err(|_| {
        (
            3,
            record[2].to_owned(),
            "empty, horizontal, vertical or both",
        )
    })?;
    Ok(PaletteRow {
        tileset: record[0].to_owned(),
        tile,
        flip,
    })
}

fn read_records(file: &GridFile, errors: &mut Vec<LoadError>) -> Option<Vec<csv::StringRecord>> {
    csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(file.text.as_bytes())
        .records()
        .collect::<Result<_, _>>()
        .map_err(|error| {
            errors.push(LoadError {
                file: file.path.to_owned(),
                at: ErrorPlace::WholeFile,
                problem: ContentProblem::new("unreadable file", error, "a UTF-8 CSV file"),
            })
        })
        .ok()
}

fn joined(record: &csv::StringRecord) -> String {
    record.iter().collect::<Vec<_>>().join(",")
}

fn write_records(records: impl Iterator<Item = Vec<String>>) -> String {
    let mut writer = csv::Writer::from_writer(Vec::new());
    for record in records {
        writer
            .write_record(record)
            .expect("a record writes to memory");
    }
    String::from_utf8(writer.into_inner().expect("records write to memory"))
        .expect("records write as UTF-8")
}
