use std::collections::BTreeMap;
use std::path::PathBuf;

use image::{GenericImage, RgbaImage};
use serde_json::{Value, json};

use super::formats::{self, Export, MAX_IMAGE_PX};
use super::records::ImportRecord;
use crate::views::model::{ACTIONS, DIRECTIONS, FrameData};

pub type Mapping = BTreeMap<String, Option<String>>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Note {
    ByName,
    Normalised,
    ByOrder,
    NoStrip(String),
    Picked,
}

impl Note {
    pub fn text(&self) -> String {
        match self {
            Note::ByName => "by name".to_owned(),
            Note::Normalised => "case and spaces ignored".to_owned(),
            Note::ByOrder => "by order".to_owned(),
            Note::NoStrip(action) => format!("the engine has no {action} action"),
            Note::Picked => "picked".to_owned(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Plan {
    pub strips: Vec<StripPlan>,
    pub missing: Vec<String>,
    pub frame: (u32, u32),
    pub trimmed: bool,
    pub keeps_hitbox: bool,
    pub busts: usize,
    pub cues_total: usize,
}

#[derive(Clone, Debug)]
pub struct StripPlan {
    pub name: String,
    pub action: String,
    pub direction: String,
    pub tag: Option<String>,
    pub before: Vec<FrameData>,
    pub lengths: Vec<u32>,
    pub retimed: Option<Retimed>,
    pub cues: Vec<CueMove>,
    pub origins: Vec<Option<usize>>,
}

#[derive(Clone, Debug)]
pub struct Retimed {
    pub here: Vec<u32>,
    pub recorded: Vec<u32>,
    pub export: Vec<u32>,
    pub keep_here: bool,
}

impl Retimed {
    pub fn frames(&self) -> Vec<usize> {
        self.here
            .iter()
            .enumerate()
            .filter(|(index, ms)| self.recorded.get(*index) != Some(*ms))
            .map(|(index, _)| index + 1)
            .collect()
    }
}

#[derive(Clone, Debug)]
pub struct CueMove {
    pub cue: Cue,
    pub from: usize,
    pub to: Option<usize>,
    pub by_pixels: bool,
    pub choice: Option<Placement>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Cue {
    Apex,
    Step,
    Sound(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Placement {
    Frame(usize),
    Remove,
}

impl Cue {
    pub fn label(&self) -> String {
        match self {
            Cue::Apex => "apex".to_owned(),
            Cue::Step => "step".to_owned(),
            Cue::Sound(sound) => sound.clone(),
        }
    }
}

impl CueMove {
    pub fn settled(&self) -> bool {
        self.to.is_some() || self.choice.is_some()
    }

    pub fn lands(&self) -> Option<usize> {
        match (self.to, self.choice) {
            (Some(to), _) => Some(to),
            (None, Some(Placement::Frame(frame))) => Some(frame),
            _ => None,
        }
    }

    pub fn offered(&self, count: usize) -> usize {
        self.from.min(count.saturating_sub(1))
    }
}

impl StripPlan {
    pub fn after_count(&self) -> usize {
        self.lengths.len()
    }

    pub fn changed_count(&self) -> bool {
        self.tag.is_some() && self.before.len() != self.lengths.len()
    }

    pub fn needs_place(&self) -> usize {
        self.cues.iter().filter(|cue| !cue.settled()).count()
    }

    pub fn final_lengths(&self) -> Vec<u32> {
        match &self.retimed {
            Some(retimed) if retimed.keep_here => (0..self.lengths.len())
                .map(|index| {
                    retimed
                        .here
                        .get(index)
                        .copied()
                        .unwrap_or(self.lengths[index])
                })
                .collect(),
            _ => self.lengths.clone(),
        }
    }

    pub fn after(&self) -> Vec<FrameData> {
        let lengths = self.final_lengths();
        let mut frames: Vec<FrameData> = lengths
            .iter()
            .map(|ms| FrameData {
                frame: 0,
                ms: *ms,
                apex: false,
                step: false,
                sound: None,
            })
            .collect();
        for cue in &self.cues {
            let Some(index) = cue.lands() else {
                continue;
            };
            let Some(frame) = frames.get_mut(index) else {
                continue;
            };
            match &cue.cue {
                Cue::Apex => frame.apex = true,
                Cue::Step => frame.step = true,
                Cue::Sound(sound) => frame.sound = Some(sound.clone()),
            }
        }
        frames
    }
}

impl Plan {
    pub fn ready(&self) -> Result<(), String> {
        if let Some(missing) = self.missing.first() {
            return Err(format!("{} needs a tag", pretty(missing)));
        }
        let unplaced: usize = self.strips.iter().map(StripPlan::needs_place).sum();
        match unplaced {
            0 => Ok(()),
            1 => Err("one cue needs a place".to_owned()),
            n => Err(format!("{n} cues need a place")),
        }
    }

    pub fn cues_kept(&self) -> usize {
        self.strips
            .iter()
            .flat_map(|strip| strip.cues.iter())
            .filter(|cue| cue.to.is_some())
            .count()
    }

    pub fn needs_place(&self) -> usize {
        self.strips.iter().map(StripPlan::needs_place).sum()
    }

    pub fn retimed(&self) -> usize {
        self.strips
            .iter()
            .filter(|strip| strip.retimed.is_some())
            .count()
    }

    pub fn changed(&self) -> Vec<&StripPlan> {
        self.strips
            .iter()
            .filter(|strip| strip.changed_count() || strip.retimed.is_some())
            .collect()
    }

    pub fn decided(&self) -> bool {
        self.missing.is_empty() && self.needs_place() == 0 && self.retimed() == 0
    }

    pub fn strip_mut(&mut self, name: &str) -> Option<&mut StripPlan> {
        self.strips.iter_mut().find(|strip| strip.name == name)
    }
}

pub fn strip_names() -> Vec<String> {
    ACTIONS
        .iter()
        .flat_map(|action| {
            DIRECTIONS
                .iter()
                .map(move |direction| format!("{action}_{direction}"))
        })
        .collect()
}

pub fn pretty(strip: &str) -> String {
    strip.replacen('_', " · ", 1)
}

pub fn strip_of_tag(tag: &str) -> Option<String> {
    let words: Vec<String> = tag
        .split(['_', '-', ' ', '/', '.'])
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect();
    let [action, direction] = words.as_slice() else {
        return None;
    };
    let direction = match direction.as_str() {
        "s" | "south" | "down" => "s",
        "sw" | "southwest" => "sw",
        "nw" | "northwest" => "nw",
        "n" | "north" | "up" => "n",
        "ne" | "northeast" => "ne",
        "se" | "southeast" => "se",
        "e" | "east" | "right" => "e",
        "w" | "west" | "left" => "w",
        _ => return None,
    };
    ACTIONS
        .contains(&action.as_str())
        .then(|| format!("{action}_{direction}"))
}

fn exact(tag: &str) -> bool {
    strip_names().iter().any(|name| name == tag)
}

pub fn default_mapping(export: &Export) -> (Mapping, BTreeMap<String, Note>) {
    let mut mapping = Mapping::new();
    let mut notes = BTreeMap::new();
    let names = strip_names();
    let by_order = export.kind == formats::Kind::Grid && export.strips.len() == names.len();
    for (index, strip) in export.strips.iter().enumerate() {
        let (target, note) = if by_order {
            (Some(names[index].clone()), Note::ByOrder)
        } else if exact(&strip.tag) {
            (Some(strip.tag.clone()), Note::ByName)
        } else if let Some(name) = strip_of_tag(&strip.tag) {
            (Some(name), Note::Normalised)
        } else {
            let action = strip
                .tag
                .split(['_', '-', ' ', '/', '.'])
                .find(|word| !word.is_empty())
                .unwrap_or(&strip.tag)
                .to_lowercase();
            (None, Note::NoStrip(action))
        };
        mapping.insert(strip.tag.clone(), target);
        notes.insert(strip.tag.clone(), note);
    }
    (mapping, notes)
}

pub fn recorded_mapping(record: &ImportRecord, export: &Export) -> Mapping {
    let mut mapping = Mapping::new();
    for strip in &export.strips {
        let target = record
            .mapping
            .get(&strip.tag)
            .and_then(|value| match value {
                Value::String(name) if name == "skip" => None,
                Value::String(name) => Some(name.clone()),
                _ => None,
            });
        mapping.insert(strip.tag.clone(), target);
    }
    mapping
}

pub fn mapping_value(mapping: &Mapping) -> Value {
    Value::Object(
        mapping
            .iter()
            .map(|(tag, target)| {
                (
                    tag.clone(),
                    Value::String(target.clone().unwrap_or_else(|| "skip".to_owned())),
                )
            })
            .collect(),
    )
}

fn targets(mapping: &Mapping, export: &Export) -> BTreeMap<String, String> {
    let mut targets = BTreeMap::new();
    for strip in &export.strips {
        if let Some(Some(target)) = mapping.get(&strip.tag)
            && !targets.contains_key(target)
        {
            targets.insert(target.clone(), strip.tag.clone());
        }
    }
    targets
}

pub fn current_frames(row: &Value, sheet: Option<&RgbaImage>) -> BTreeMap<String, Vec<String>> {
    let width = row["sprites"]["frame_size"]["width"].as_u64().unwrap_or(0) as u32;
    let height = row["sprites"]["frame_size"]["height"].as_u64().unwrap_or(0) as u32;
    let mut hashes = BTreeMap::new();
    let Some(sheet) = sheet else {
        return hashes;
    };
    if width == 0 || height == 0 {
        return hashes;
    }
    let columns = sheet.width() / width;
    for action in ACTIONS {
        for direction in DIRECTIONS {
            let frames = crate::views::model::strip_of(row, action, direction);
            let strip: Vec<String> = frames
                .iter()
                .map(|frame| {
                    if columns == 0 {
                        return String::new();
                    }
                    let x = (frame.frame % columns) * width;
                    let y = (frame.frame / columns) * height;
                    if x + width > sheet.width() || y + height > sheet.height() {
                        return String::new();
                    }
                    formats::pixel_hash(
                        &image::imageops::crop_imm(sheet, x, y, width, height).to_image(),
                    )
                })
                .collect();
            hashes.insert(format!("{action}_{direction}"), strip);
        }
    }
    hashes
}

pub fn plan(
    row: Option<&Value>,
    sheet: Option<&RgbaImage>,
    export: &Export,
    mapping: &Mapping,
    asked: &BTreeMap<String, u32>,
    record: Option<&ImportRecord>,
) -> Plan {
    let targets = targets(mapping, export);
    let current = row
        .map(|row| current_frames(row, sheet))
        .unwrap_or_default();
    let mut strips = Vec::new();
    let mut missing = Vec::new();
    let mut cues_total = 0;
    for action in ACTIONS {
        for direction in DIRECTIONS {
            let name = format!("{action}_{direction}");
            let before = row
                .map(|row| crate::views::model::strip_of(row, action, direction))
                .unwrap_or_default();
            let tag = targets.get(&name).cloned();
            let Some(tag) = tag else {
                missing.push(name.clone());
                strips.push(StripPlan {
                    name,
                    action: action.to_owned(),
                    direction: direction.to_owned(),
                    tag: None,
                    before,
                    lengths: Vec::new(),
                    retimed: None,
                    cues: Vec::new(),
                    origins: Vec::new(),
                });
                continue;
            };
            let Some(source) = export.strip(&tag) else {
                continue;
            };
            let asked_ms = asked.get(&tag).copied().unwrap_or(formats::DEFAULT_MS);
            let lengths: Vec<u32> = source
                .frames
                .iter()
                .map(|frame| frame.ms.unwrap_or(asked_ms))
                .collect();
            let old_hashes = current.get(&name).cloned().unwrap_or_default();
            let new_hashes: Vec<&str> = source
                .frames
                .iter()
                .map(|frame| frame.hash.as_str())
                .collect();
            let same_count = before.len() == lengths.len();
            let mut cues = Vec::new();
            for (from, frame) in before.iter().enumerate() {
                let mut kinds = Vec::new();
                if frame.apex {
                    kinds.push(Cue::Apex);
                }
                if frame.step {
                    kinds.push(Cue::Step);
                }
                if let Some(sound) = &frame.sound {
                    kinds.push(Cue::Sound(sound.clone()));
                }
                for cue in kinds {
                    cues_total += 1;
                    let (to, by_pixels) = if same_count {
                        (Some(from), false)
                    } else {
                        (follow(&old_hashes, from, &new_hashes), true)
                    };
                    cues.push(CueMove {
                        cue,
                        from,
                        to,
                        by_pixels,
                        choice: None,
                    });
                }
            }
            let retimed = record
                .and_then(|record| record.strips.get(&name))
                .filter(|recorded| {
                    let here = crate::views::model::lengths(&before);
                    !before.is_empty() && here != **recorded && here != lengths
                })
                .map(|recorded| Retimed {
                    here: crate::views::model::lengths(&before),
                    recorded: recorded.clone(),
                    export: lengths.clone(),
                    keep_here: true,
                });
            let origins = new_hashes
                .iter()
                .enumerate()
                .map(|(index, hash)| {
                    old_hashes
                        .iter()
                        .enumerate()
                        .filter(|(_, old)| !old.is_empty() && old.as_str() == *hash)
                        .min_by_key(|(old_index, _)| (old_index.abs_diff(index), *old_index))
                        .map(|(old_index, _)| old_index)
                })
                .collect();
            strips.push(StripPlan {
                name,
                action: action.to_owned(),
                direction: direction.to_owned(),
                tag: Some(tag),
                before,
                lengths,
                retimed,
                cues,
                origins,
            });
        }
    }
    let busts = row
        .and_then(|row| row["modules"].as_array())
        .map(|modules| {
            modules
                .iter()
                .filter(|module| module["type"] == "bust")
                .count()
        })
        .unwrap_or(0);
    Plan {
        strips,
        missing,
        frame: export.frame,
        trimmed: export.trimmed,
        keeps_hitbox: row.is_some_and(|row| row.get("hitbox").is_some()),
        busts,
        cues_total,
    }
}

fn follow(old: &[String], from: usize, new: &[&str]) -> Option<usize> {
    let hash = old.get(from)?;
    if hash.is_empty() {
        return None;
    }
    new.iter()
        .enumerate()
        .filter(|(_, candidate)| **candidate == hash)
        .min_by_key(|(index, _)| (index.abs_diff(from), *index))
        .map(|(index, _)| index)
}

pub struct Built {
    pub png: Vec<u8>,
    pub image: String,
    pub row: Value,
    pub lengths: BTreeMap<String, Vec<u32>>,
}

pub fn build(
    plan: &Plan,
    export: &Export,
    row: Option<&Value>,
    key: &str,
) -> Result<Built, String> {
    plan.ready()?;
    let columns = plan
        .strips
        .iter()
        .map(StripPlan::after_count)
        .max()
        .unwrap_or(0) as u32;
    let (fw, fh) = plan.frame;
    let rows = plan.strips.len() as u32;
    if columns == 0 || fw == 0 || fh == 0 {
        return Err("the export has no frames".to_owned());
    }
    if columns * fw > MAX_IMAGE_PX || rows * fh > MAX_IMAGE_PX {
        return Err(format!(
            "the sheet would be {} × {}, over the {MAX_IMAGE_PX} px limit",
            columns * fw,
            rows * fh
        ));
    }
    let mut sheet = RgbaImage::new(columns * fw, rows * fh);
    let mut actions = serde_json::Map::new();
    let mut lengths = BTreeMap::new();
    for (row_index, strip) in plan.strips.iter().enumerate() {
        let Some(tag) = &strip.tag else {
            return Err(format!("{} needs a tag", pretty(&strip.name)));
        };
        let source = export
            .strip(tag)
            .ok_or_else(|| format!("the export has no tag {tag}"))?;
        let mut frames = strip.after();
        for (column, frame) in frames.iter_mut().enumerate() {
            let image = &source.frames[column].image;
            sheet
                .copy_from(image, column as u32 * fw, row_index as u32 * fh)
                .map_err(|error| error.to_string())?;
            frame.frame = row_index as u32 * columns + column as u32;
        }
        lengths.insert(strip.name.clone(), crate::views::model::lengths(&frames));
        let values: Vec<Value> = frames.iter().map(FrameData::to_value).collect();
        actions
            .entry(strip.action.clone())
            .or_insert_with(|| Value::Object(serde_json::Map::new()))
            .as_object_mut()
            .expect("an object")
            .insert(strip.direction.clone(), Value::Array(values));
    }
    let image = row
        .and_then(|row| row["sprites"]["image"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("models/{}.png", key.replace('_', "-")));
    let mut row = row.cloned().unwrap_or_else(|| json!({}));
    row["sprites"] = json!({
        "type": "sheet",
        "image": image,
        "frame_size": { "width": fw, "height": fh },
        "actions": Value::Object(actions),
    });
    Ok(Built {
        png: formats::encode_png(&sheet)?,
        image,
        row,
        lengths,
    })
}

pub fn record(
    export: &Export,
    key: &str,
    mapping: &Mapping,
    lengths: BTreeMap<String, Vec<u32>>,
) -> ImportRecord {
    let mut record = ImportRecord::of_files(&export.files, "model", key);
    record.mapping = mapping_value(mapping);
    record.strips = lengths;
    record
}

pub fn primary_file(files: &[PathBuf]) -> PathBuf {
    files
        .iter()
        .find(|file| file.extension().is_some_and(|ext| ext != "json"))
        .or(files.first())
        .cloned()
        .unwrap_or_default()
}
