use std::collections::BTreeSet;
use std::sync::Arc;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum::{AsRefStr, EnumString};

use super::tileset::TilesetDef;
use super::{AreaDef, AreaId, Tilemap};
use crate::core::content::id::Leaf;
use crate::core::content::media::ImageSizes;
use crate::core::content::{
    BesideFile, BesideName, Content, ContentProblem, ContentRow, ContentScope, ErrorPlace,
    LoadError, Loading, RowName, ScopeReader, row_folder, with_content,
};
use crate::core::math::{Pos, Rect};
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

    pub fn place(self, r: Rect<Tiles>, at: Pos<Tiles>) -> Rect<Tiles> {
        let x = if self.horizontal() {
            at.x - (r.origin.x + r.size.width)
        } else {
            at.x + r.origin.x
        };
        let y = if self.vertical() {
            at.y - (r.origin.y + r.size.height)
        } else {
            at.y + r.origin.y
        };
        Rect::new(Pos::new(x, y), r.size)
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

/// The palette as a file beside each area that names tilesets.
pub fn palette_beside() -> BesideFile {
    BesideFile {
        table: AreaDef::TABLE,
        name: PALETTE_FILE,
        names: palette_names,
        rename: rename_in_palette,
    }
}

fn palette_names(text: &str) -> Vec<BesideName> {
    let file = GridFile { path: "", text };
    read_palette(file, &mut Vec::new())
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, row)| BesideName {
            table: TilesetDef::TABLE,
            key: row.tileset,
            line: index + 2,
            column: 1,
        })
        .collect()
}

fn rename_in_palette(text: &str, table: &str, from: &str, to: &str) -> String {
    let file = GridFile { path: "", text };
    match read_palette(file, &mut Vec::new()) {
        Some(mut rows) if table == TilesetDef::TABLE => {
            for row in rows.iter_mut().filter(|row| row.tileset == from) {
                row.tileset = to.to_owned();
            }
            write_palette(&rows)
        }
        _ => text.to_owned(),
    }
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

/// Reads an area's grids from the files beside its row, reporting everything wrong with them.
pub fn read_area(
    loading: &mut Loading,
    content: &Content,
    sizes: &ImageSizes,
    id: AreaId,
    map: &Tilemap,
) -> Option<AreaGrids> {
    let folder = folder(id.key(content));
    let files = loading.row_folder(id);
    refuse_strays(loading, &folder, &files, map);
    let read = |name: &str, pointer: &str, loading: &mut Loading| -> Option<String> {
        let file = format!("{folder}/{name}");
        if !files.iter().any(|listed| listed == name) {
            loading.row_error(
                id,
                pointer,
                ContentProblem::new(
                    "missing file",
                    format!("no {name} in {folder}/"),
                    format!("{file} beside the row"),
                ),
            );
            return None;
        }
        loading
            .read_text(&file)
            .map_err(|error| {
                loading.file_error(
                    file.clone(),
                    ErrorPlace::WholeFile,
                    ContentProblem::new("unreadable file", error, "a UTF-8 CSV file"),
                )
            })
            .ok()
    };
    let palette = read(PALETTE_FILE, "/map", loading);
    let walk = read(WALK_FILE, "/map", loading);
    let layers: Vec<Option<String>> = map
        .ground
        .iter()
        .enumerate()
        .map(|(index, layer)| read(&layer_file(layer), &format!("/map/ground/{index}"), loading))
        .collect();
    let texts = AreaTexts {
        palette: palette?,
        walk: walk?,
        layers: layers.into_iter().collect::<Option<_>>()?,
    };
    let mut errors = Vec::new();
    let area = RowName::new(AreaDef::TABLE, id.key(content));
    let grids = parse_area(content, sizes, map, &area, &texts, &mut errors);
    loading.extend_errors(errors);
    grids
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

struct AreaTexts {
    palette: String,
    walk: String,
    layers: Vec<String>,
}

fn refuse_strays(loading: &mut Loading, folder: &str, files: &[String], map: &Tilemap) {
    let mut expected = vec![PALETTE_FILE.to_owned(), WALK_FILE.to_owned()];
    expected.extend(map.ground.iter().map(|layer| layer_file(layer)));
    for file in files.iter().filter(|file| !expected.contains(file)) {
        loading.file_error(
            format!("{folder}/{file}"),
            ErrorPlace::WholeFile,
            ContentProblem::new(
                "unknown entry",
                format!("file {file}"),
                format!("only {}", expected.join(", ")),
            ),
        );
    }
}

fn parse_area(
    content: &Content,
    sizes: &ImageSizes,
    map: &Tilemap,
    area: &RowName,
    texts: &AreaTexts,
    errors: &mut Vec<LoadError>,
) -> Option<AreaGrids> {
    let folder = folder(&area.key);
    let size = map.size.grid();
    let palette_file = format!("{folder}/{PALETTE_FILE}");
    let palette_keys = read_palette(
        GridFile {
            path: &palette_file,
            text: &texts.palette,
        },
        errors,
    )?;
    let palette = resolve_palette(
        content,
        sizes,
        map,
        area,
        &palette_file,
        &palette_keys,
        errors,
    );
    let entries = palette_keys.len();
    let ground: Vec<Option<GroundLayer>> = map
        .ground
        .iter()
        .zip(&texts.layers)
        .map(|(layer, text)| {
            let file = format!("{folder}/{}", layer_file(layer));
            let cells = read_grid(
                GridFile { path: &file, text },
                size,
                |field| palette_cell(field, entries),
                errors,
            )?;
            Some(GroundLayer {
                name: layer.clone(),
                cells,
            })
        })
        .collect();
    let walk_file = format!("{folder}/{WALK_FILE}");
    let walk = read_grid(
        GridFile {
            path: &walk_file,
            text: &texts.walk,
        },
        size,
        walk_cell,
        errors,
    );
    Some(AreaGrids {
        size,
        palette: palette?,
        palette_keys,
        ground: ground.into_iter().collect::<Option<_>>()?,
        walk: walk?,
    })
}

/// The palette's rows as the tiles they name, when every row names a tile its tileset has at the
/// area's tile size.
fn resolve_palette(
    content: &Content,
    sizes: &ImageSizes,
    map: &Tilemap,
    area: &RowName,
    file: &str,
    rows: &[PaletteRow],
    errors: &mut Vec<LoadError>,
) -> Option<Vec<PaletteEntry>> {
    let tilesets = content.table::<TilesetDef>();
    let reader = ScopeReader {
        row: Some(area.clone()),
        owners: Arc::new(content.owners().clone()),
    };
    let (ids, scope) = with_content(ContentScope::of(content).reading(reader), || {
        rows.iter()
            .map(|row| serde_json::from_value::<TilesetId>(Value::String(row.tileset.clone())).ok())
            .collect::<Vec<_>>()
    });
    let mut fault = |row: usize, column: usize, problem: ContentProblem| {
        errors.push(LoadError {
            file: file.to_owned(),
            at: ErrorPlace::Csv {
                row: row + 2,
                column,
            },
            problem,
        });
        None
    };
    let entries: Vec<Option<PaletteEntry>> = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            if let Some(problem) = scope.leaves().get(index).and_then(Leaf::reported) {
                return fault(index, 1, problem);
            }
            let tileset = ids[index]?;
            let def = tilesets.get(tileset)?;
            if def.tile != map.tile {
                return fault(
                    index,
                    1,
                    ContentProblem::new(
                        "tile size mismatch",
                        format!("{} against {}", map.tile, def.tile),
                        format!("tilesets of {} px tiles, the area's", map.tile),
                    ),
                );
            }
            if let Some(&(width, height)) = sizes.0.get(def.image.as_str()) {
                let count = def.grid(width, height).count();
                if row.tile >= count {
                    return fault(
                        index,
                        2,
                        ContentProblem::new(
                            "tile out of range",
                            format!("tile {} of {count}", row.tile),
                            format!("0 to {}", count.saturating_sub(1)),
                        ),
                    );
                }
            }
            Some(PaletteEntry {
                tileset,
                tile: row.tile,
                flip: row.flip,
            })
        })
        .collect();
    entries.into_iter().collect()
}

fn palette_cell(field: &str, entries: usize) -> Result<Option<u32>, BadCell> {
    if field.is_empty() {
        return Ok(None);
    }
    let index: u32 = field.parse().map_err(|_| BadCell {
        rule: "bad cell",
        expected: "empty or a palette index".to_owned(),
    })?;
    if index as usize >= entries {
        return Err(BadCell {
            rule: "palette out of range",
            expected: format!(
                "0 to {}, an index into the area's {entries} palette entries",
                entries.saturating_sub(1)
            ),
        });
    }
    Ok(Some(index))
}

fn walk_cell(field: &str) -> Result<Option<bool>, BadCell> {
    match field {
        "" => Ok(None),
        "1" => Ok(Some(true)),
        "0" => Ok(Some(false)),
        _ => Err(BadCell {
            rule: "bad cell",
            expected: "empty, 1 or 0".to_owned(),
        }),
    }
}
