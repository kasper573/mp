use std::fmt;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::{ErrorPlace, LoadError};
use crate::core::math::Pos;
use crate::core::tiling::{GridSize, Tiles};

use super::tileset;

#[derive(JsonSchema, Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

    pub fn apply(self, p: Pos<Tiles>) -> Pos<Tiles> {
        Pos::new(
            if self.horizontal() { -p.x } else { p.x },
            if self.vertical() { -p.y } else { p.y },
        )
    }

    pub fn parse(text: &str) -> Option<Flip> {
        match text {
            "" | "none" => Some(Flip::None),
            "horizontal" => Some(Flip::Horizontal),
            "vertical" => Some(Flip::Vertical),
            "both" => Some(Flip::Both),
            _ => None,
        }
    }

    pub fn csv(self) -> &'static str {
        match self {
            Flip::None => "",
            Flip::Horizontal => "horizontal",
            Flip::Vertical => "vertical",
            Flip::Both => "both",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PaletteEntry {
    pub tileset: tileset::Id,
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
    pub palette_keys: Vec<(String, u32, Flip)>,
    pub ground: Vec<GroundLayer>,
    pub walk: Vec<Option<bool>>,
}

impl AreaGrids {
    pub fn entry(&self, cell: Option<u32>) -> Option<PaletteEntry> {
        self.palette.get(cell? as usize).copied()
    }

    pub fn write_palette(&self) -> String {
        let mut text = String::from("tileset,tile,flip\n");
        for (tileset, tile, flip) in &self.palette_keys {
            text.push_str(&format!("{tileset},{tile},{}\n", flip.csv()));
        }
        text
    }

    pub fn write_layer(&self, layer: &GroundLayer) -> String {
        write_grid(self.size, &layer.cells, |cell| match cell {
            Some(index) => index.to_string(),
            None => String::new(),
        })
    }

    pub fn write_walk(&self) -> String {
        write_grid(self.size, &self.walk, |cell| match cell {
            Some(true) => "1".to_owned(),
            Some(false) => "0".to_owned(),
            None => String::new(),
        })
    }
}

fn write_grid<T>(size: GridSize, cells: &[T], show: impl Fn(&T) -> String) -> String {
    let mut text = String::new();
    for row in cells.chunks(size.width.max(1) as usize) {
        let fields: Vec<String> = row.iter().map(&show).collect();
        text.push_str(&fields.join(","));
        text.push('\n');
    }
    text
}

pub struct GridFile<'a> {
    pub path: &'a str,
    pub text: &'a str,
}

pub fn read_grid<T>(
    file: GridFile,
    size: GridSize,
    mut cell: impl FnMut(&str) -> Result<T, String>,
    errors: &mut Vec<LoadError>,
) -> Option<Vec<T>>
where
    T: Default + Clone,
{
    let records: Vec<Vec<&str>> = file
        .text
        .lines()
        .map(|line| line.split(',').collect())
        .collect();
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
            rule: "grid size",
            found,
            expected: format!("{height} rows of {width} columns, the area's size"),
            nearest: None,
        });
        return None;
    }
    let mut cells = vec![T::default(); width * height];
    let mut ok = true;
    for (row, record) in records.iter().enumerate() {
        for (column, field) in record.iter().enumerate() {
            match cell(field.trim()) {
                Ok(value) => cells[row * width + column] = value,
                Err(expected) => {
                    ok = false;
                    errors.push(LoadError {
                        file: file.path.to_owned(),
                        at: ErrorPlace::Csv {
                            row: row + 1,
                            column: column + 1,
                        },
                        rule: if expected.starts_with("0 to") {
                            "palette out of range"
                        } else {
                            "bad cell"
                        },
                        found: format!("{field:?}"),
                        expected,
                        nearest: None,
                    });
                }
            }
        }
    }
    ok.then_some(cells)
}

pub struct PaletteRow {
    pub tileset: String,
    pub tile: u32,
    pub flip: Flip,
}

pub fn read_palette(file: GridFile, errors: &mut Vec<LoadError>) -> Option<Vec<PaletteRow>> {
    let mut lines = file.text.lines().enumerate();
    match lines.next() {
        Some((_, "tileset,tile,flip")) => {}
        other => {
            errors.push(LoadError {
                file: file.path.to_owned(),
                at: ErrorPlace::Csv { row: 1, column: 1 },
                rule: "bad cell",
                found: format!("{:?}", other.map_or("", |(_, line)| line)),
                expected: "the header tileset,tile,flip".to_owned(),
                nearest: None,
            });
            return None;
        }
    }
    let mut rows = Vec::new();
    let mut ok = true;
    for (index, line) in lines {
        let fields: Vec<&str> = line.split(',').map(str::trim).collect();
        let row = index + 1;
        let mut bad = |column: usize, found: &str, expected: &str| {
            errors.push(LoadError {
                file: file.path.to_owned(),
                at: ErrorPlace::Csv { row, column },
                rule: "bad cell",
                found: format!("{found:?}"),
                expected: expected.to_owned(),
                nearest: None,
            });
        };
        if fields.len() != 3 {
            bad(1, line, "three fields: tileset,tile,flip");
            ok = false;
            continue;
        }
        let tile = match fields[1].parse::<u32>() {
            Ok(tile) => tile,
            Err(_) => {
                bad(2, fields[1], "a tile number");
                ok = false;
                continue;
            }
        };
        let Some(flip) = Flip::parse(fields[2]) else {
            bad(3, fields[2], "empty, horizontal, vertical or both");
            ok = false;
            continue;
        };
        rows.push(PaletteRow {
            tileset: fields[0].to_owned(),
            tile,
            flip,
        });
    }
    ok.then_some(rows)
}

impl fmt::Display for Flip {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(match self {
            Flip::None => "none",
            other => other.csv(),
        })
    }
}
