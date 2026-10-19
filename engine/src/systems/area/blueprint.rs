use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::grid::Flip;
use super::{AreaDef, AreaModule, ObjectShape};
use crate::core::audio::soundscape::SoundscapeShape;
use crate::core::content::id::{Leaf, nearest, read_aside};
use crate::core::content::locate::escape;
use crate::core::content::{
    Content, ContentId, ContentProblem, ContentRow, ContentScope, RowCheck, pointer_of, row_file,
    serial, valid_key, with_content,
};
use crate::core::math::{Pos, Rect};
use crate::core::script::{VarValue, Variable, VariableType, Vocabulary};
use crate::core::tiling::Tiles;
use crate::systems::script::{RiftScripting, ScriptModule};

pub type BlueprintId = ContentId<BlueprintDef>;

pub const MAX_DEPTH: usize = 8;
pub const MAX_PARTS: usize = 4096;
pub const MAX_AREA_PARTS: usize = 65_536;
pub const MAX_VARIABLES: usize = 32;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlueprintDef {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub variables: BTreeMap<String, Variable<RiftScripting>>,
    pub parts: Vec<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<BlueprintModule>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BlueprintModule {
    Script(ScriptModule),
}

impl ContentRow for BlueprintDef {
    const TABLE: &'static str = "blueprint";

    fn check(&self, cx: &mut RowCheck) {
        cx.count(
            "/variables",
            self.variables.len(),
            0,
            MAX_VARIABLES,
            "variables",
        );
        for name in self.variables.keys() {
            if !(1..=40).contains(&name.len()) || !valid_key(name) {
                cx.error(
                    format!("/variables/{}", escape(name)),
                    "out of range",
                    format!("{name:?}"),
                    "a variable name of 1 to 40 key characters",
                );
            }
        }
        let mut used: Vec<String> = Vec::new();
        for part in &self.parts {
            holes(part, &mut used);
        }
        for name in self.variables.keys() {
            if !used.contains(name) {
                cx.error(
                    format!("/variables/{}", escape(name)),
                    "unused variable",
                    name,
                    "a variable some hole in the parts names",
                );
            }
        }
    }

    fn read_held(&self) {
        for part in &self.parts {
            let mut json = part.clone();
            stand_in_holes(&mut json, &self.variables);
            read_aside(
                || serde_json::from_value::<AreaModule>(json).ok(),
                |leaf| leaf.value != HOLE,
            );
        }
    }
}

/// What a hole without a value reads as while its part is read for references: a key no row has,
/// whose reference is left out.
const HOLE: &str = "\u{1}hole";

/// Fills each hole with its variable's default, or with a stand-in of the variable's type, so the
/// rest of the part reads as a module would.
fn stand_in_holes(json: &mut Value, variables: &BTreeMap<String, Variable<RiftScripting>>) {
    if let Some(name) = hole_name(json) {
        let variable = variables.get(name);
        let default = variable
            .and_then(|variable| variable.default.as_ref())
            .and_then(|default| serde_json::to_value(default).ok());
        *json = default.unwrap_or_else(|| match variable.map(|variable| variable.ty) {
            Some(VariableType::Integer | VariableType::Number) => Value::from(0),
            Some(VariableType::Boolean) => Value::Bool(false),
            Some(VariableType::Condition) => Value::Bool(true),
            Some(VariableType::Text | VariableType::Name) => Value::String(String::new()),
            Some(VariableType::Place) => serde_json::json!({ "area": HOLE, "x": 0, "y": 0 }),
            Some(VariableType::Row | VariableType::Audio) | None => Value::String(HOLE.to_owned()),
        });
        return;
    }
    match json {
        Value::Object(map) => map
            .values_mut()
            .for_each(|value| stand_in_holes(value, variables)),
        Value::Array(items) => items
            .iter_mut()
            .for_each(|item| stand_in_holes(item, variables)),
        _ => {}
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    pub blueprint: BlueprintId,
    #[schemars(with = "serial::PosRow")]
    #[serde(serialize_with = "serial::pos", deserialize_with = "serial::pos_from")]
    pub at: Pos<Tiles>,
    #[serde(default, skip_serializing_if = "Flip::is_none")]
    pub flip: Flip,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub values: BTreeMap<String, VarValue<RiftScripting>>,
}

#[derive(Clone)]
pub struct Flattened {
    pub module: AreaModule,
    pub origin: usize,
    pub chain: Vec<(BlueprintId, usize)>,
}

impl Flattened {
    pub fn site(&self, content: &Content, area: super::AreaId) -> (String, String) {
        match self.chain.last() {
            None => (
                row_file(AreaDef::TABLE, area.key(content)),
                format!("/modules/{}", self.origin),
            ),
            Some((blueprint, part)) => (
                row_file(BlueprintDef::TABLE, blueprint.key(content)),
                format!("/parts/{part}"),
            ),
        }
    }

    pub fn describe(&self, content: &Content) -> String {
        match self.chain.last() {
            None => format!("module {}", self.origin),
            Some((blueprint, part)) => {
                let through: Vec<&str> = self.chain[..self.chain.len() - 1]
                    .iter()
                    .map(|(blueprint, _)| blueprint.key(content))
                    .collect();
                let mut text = format!("part {part} of {}", blueprint.key(content));
                if !through.is_empty() {
                    text.push_str(&format!(", through {}", through.join(" → ")));
                }
                text
            }
        }
    }
}

pub struct PlacedBlueprint {
    pub blueprint: BlueprintId,
    pub origin: usize,
    pub chain: Vec<(BlueprintId, usize)>,
    pub at: Pos<Tiles>,
    pub flip: Flip,
    pub values: BTreeMap<String, Value>,
    pub scripts: Vec<ScriptModule>,
}

pub struct Flattening {
    pub modules: Vec<Flattened>,
    pub placements: Vec<PlacedBlueprint>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FlattenAt {
    Area(String),
    Blueprint(BlueprintId, String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FlattenError {
    pub at: FlattenAt,
    pub problem: ContentProblem,
}

pub fn flatten(
    content: &Content,
    modules: &[AreaModule],
    errors: &mut Vec<FlattenError>,
) -> Flattening {
    let mut out = Vec::new();
    let mut placements = Vec::new();
    for (index, module) in modules.iter().enumerate() {
        match module {
            AreaModule::Blueprint(placement) => {
                let mut cx = Expansion {
                    content,
                    errors,
                    out: &mut out,
                    placements: &mut placements,
                    origin: index,
                    pointer: format!("/modules/{index}"),
                    chain: Vec::new(),
                };
                cx.expand(placement, placement.at, placement.flip, &placement.values);
            }
            other => out.push(Flattened {
                module: other.clone(),
                origin: index,
                chain: Vec::new(),
            }),
        }
    }
    if out.len() > MAX_AREA_PARTS {
        errors.push(FlattenError {
            at: FlattenAt::Area("/modules".to_owned()),
            problem: ContentProblem::new(
                "too many parts",
                format!("{} modules after flattening", out.len()),
                format!("at most {MAX_AREA_PARTS} per area"),
            ),
        });
    }
    Flattening {
        modules: out,
        placements,
    }
}

struct Expansion<'a> {
    content: &'a Content,
    errors: &'a mut Vec<FlattenError>,
    out: &'a mut Vec<Flattened>,
    placements: &'a mut Vec<PlacedBlueprint>,
    origin: usize,
    pointer: String,
    chain: Vec<(BlueprintId, usize)>,
}

impl Expansion<'_> {
    fn error(&mut self, at: FlattenAt, rule: &'static str, found: String, expected: String) {
        self.errors.push(FlattenError {
            at,
            problem: ContentProblem::new(rule, found, expected),
        });
    }

    fn expand(
        &mut self,
        placement: &Placement,
        at: Pos<Tiles>,
        flip: Flip,
        values: &BTreeMap<String, VarValue<RiftScripting>>,
    ) {
        let content = self.content.clone();
        let Some(def) = content.table::<BlueprintDef>().get(placement.blueprint) else {
            return;
        };
        let key = placement.blueprint.key(&content);
        if self.chain.len() + 1 > MAX_DEPTH {
            let chain = self.chain_text(Some(placement.blueprint));
            self.error(
                FlattenAt::Area(self.pointer.clone()),
                "nested too deep",
                format!("depth {} through {chain}", self.chain.len() + 1),
                format!("at most {MAX_DEPTH} levels of placements"),
            );
            return;
        }
        if self
            .chain
            .iter()
            .any(|(blueprint, _)| *blueprint == placement.blueprint)
        {
            let chain = self.chain_text(Some(placement.blueprint));
            self.error(
                FlattenAt::Blueprint(placement.blueprint, String::new()),
                "blueprint holds itself",
                chain,
                "a blueprint that never contains itself, at any depth".to_owned(),
            );
            return;
        }
        let values_pointer = if self.chain.is_empty() {
            format!("{}/values", self.pointer)
        } else {
            self.pointer.clone()
        };
        let mut filled: BTreeMap<String, Value> = BTreeMap::new();
        let mut supplied: Vec<String> = Vec::new();
        let mut missing = false;
        for name in values.keys() {
            if !def.variables.contains_key(name) {
                let at = FlattenAt::Area(format!("{values_pointer}/{}", escape(name)));
                self.unknown_variable(at, placement.blueprint, def, name);
            }
        }
        for (name, variable) in &def.variables {
            let pointer = format!("{values_pointer}/{}", escape(name));
            let (value, own) = match values.get(name) {
                Some(value) => (value, true),
                None => match &variable.default {
                    Some(default) => (default, false),
                    None => {
                        missing = true;
                        self.error(
                            FlattenAt::Area(values_pointer.clone()),
                            "missing value",
                            format!("no value for {name}"),
                            format!(
                                "a {} value for {name}, which has no default",
                                variable.ty.name()
                            ),
                        );
                        continue;
                    }
                },
            };
            match typed_value(&content, variable, value) {
                Ok(json) => {
                    if own {
                        strings(&json, &mut supplied);
                    }
                    filled.insert(name.clone(), json);
                }
                Err(problem) => {
                    let at = if own {
                        FlattenAt::Area(pointer)
                    } else {
                        FlattenAt::Blueprint(
                            placement.blueprint,
                            format!("/variables/{}/default", escape(name)),
                        )
                    };
                    self.errors.push(FlattenError { at, problem });
                }
            }
        }
        if missing {
            return;
        }
        let scripts = self.filled_scripts(placement.blueprint, def, &filled);
        self.placements.push(PlacedBlueprint {
            blueprint: placement.blueprint,
            origin: self.origin,
            chain: self.chain.clone(),
            at,
            flip,
            values: filled.clone(),
            scripts,
        });
        let start = self.out.len();
        for (index, part) in def.parts.iter().enumerate() {
            let part_pointer = format!("/parts/{index}");
            let mut json = part.clone();
            let mut unknown: Vec<(String, String)> = Vec::new();
            fill(
                &mut json,
                &filled,
                &def.variables,
                &part_pointer,
                &mut unknown,
            );
            for (pointer, name) in unknown {
                let at = FlattenAt::Blueprint(placement.blueprint, pointer);
                self.unknown_variable(at, placement.blueprint, def, &name);
            }
            let module = {
                let (result, scope) = with_content(ContentScope::of(&content), || {
                    serde_path_to_error::deserialize::<_, AreaModule>(json)
                });
                let from_placement = scope
                    .leaves()
                    .iter()
                    .filter(|leaf| supplied.contains(&leaf.value));
                for problem in from_placement.filter_map(Leaf::reported) {
                    self.errors.push(FlattenError {
                        at: FlattenAt::Blueprint(placement.blueprint, part_pointer.clone()),
                        problem,
                    });
                }
                match result {
                    Ok(module) => module,
                    Err(error) => {
                        let pointer = format!("{part_pointer}{}", pointer_of(error.path()));
                        self.error(
                            FlattenAt::Blueprint(placement.blueprint, pointer),
                            "wrong type",
                            error.inner().to_string(),
                            "a part in an area module's shape".to_owned(),
                        );
                        continue;
                    }
                }
            };
            let mut chain = self.chain.clone();
            chain.push((placement.blueprint, index));
            match module {
                AreaModule::Script(_) => self.error(
                    FlattenAt::Blueprint(placement.blueprint, part_pointer),
                    "module not allowed here",
                    "an area script".to_owned(),
                    "any area module but script".to_owned(),
                ),
                AreaModule::Blueprint(nested) => {
                    let nested_at = at + flip.apply(nested.at).to_vector();
                    let nested_flip = nested.flip.compose(flip);
                    let mut inner = Expansion {
                        content: self.content,
                        errors: self.errors,
                        out: self.out,
                        placements: self.placements,
                        origin: self.origin,
                        pointer: self.pointer.clone(),
                        chain,
                    };
                    inner.expand(&nested, nested_at, nested_flip, &nested.values);
                }
                mut module => {
                    place(&mut module, at, flip);
                    self.out.push(Flattened {
                        module,
                        origin: self.origin,
                        chain,
                    });
                }
            }
        }
        if self.out.len() - start > MAX_PARTS {
            self.error(
                FlattenAt::Blueprint(placement.blueprint, "/parts".to_owned()),
                "too many parts",
                format!("{}: {}", key, self.out.len() - start),
                format!("at most {MAX_PARTS} flattened parts per blueprint"),
            );
        }
    }

    fn filled_scripts(
        &mut self,
        blueprint: BlueprintId,
        def: &BlueprintDef,
        filled: &BTreeMap<String, Value>,
    ) -> Vec<ScriptModule> {
        let content = self.content.clone();
        let mut scripts = Vec::new();
        for (index, BlueprintModule::Script(module)) in def.modules.iter().enumerate() {
            let pointer = format!("/modules/{index}");
            let Ok(mut json) =
                with_content(ContentScope::of(&content), || serde_json::to_value(module)).0
            else {
                continue;
            };
            let mut unknown: Vec<(String, String)> = Vec::new();
            fill(&mut json, filled, &def.variables, &pointer, &mut unknown);
            for (pointer, name) in unknown {
                self.unknown_variable(
                    FlattenAt::Blueprint(blueprint, pointer),
                    blueprint,
                    def,
                    &name,
                );
            }
            let (result, _) = with_content(ContentScope::of(&content), || {
                serde_json::from_value::<ScriptModule>(json)
            });
            match result {
                Ok(script) => scripts.push(script),
                Err(error) => self.error(
                    FlattenAt::Blueprint(blueprint, pointer),
                    "wrong type",
                    error.to_string(),
                    "a script module whose holes the placement fills".to_owned(),
                ),
            }
        }
        scripts
    }

    fn unknown_variable(
        &mut self,
        at: FlattenAt,
        blueprint: BlueprintId,
        def: &BlueprintDef,
        name: &str,
    ) {
        self.errors.push(FlattenError {
            at,
            problem: ContentProblem::new(
                "unknown variable",
                format!("{name:?}"),
                format!("a variable {} declares", blueprint.key(self.content)),
            )
            .near(nearest(def.variables.keys(), name).map(|n| format!("{n:?}"))),
        });
    }

    fn chain_text(&self, last: Option<BlueprintId>) -> String {
        let content = self.content;
        let mut names: Vec<&str> = self
            .chain
            .iter()
            .map(|(blueprint, _)| blueprint.key(content))
            .collect();
        if let Some(last) = last {
            names.push(last.key(content));
        }
        names.join(" → ")
    }
}

fn typed_value(
    content: &Content,
    variable: &Variable<RiftScripting>,
    value: &VarValue<RiftScripting>,
) -> Result<Value, ContentProblem> {
    let wrong = |expected: &str| {
        ContentProblem::new(
            "wrong type",
            format!("a {} value", value.kind()),
            format!("a {expected} value"),
        )
    };
    let json = |value: &VarValue<RiftScripting>| {
        with_content(ContentScope::of(content), || serde_json::to_value(value))
            .0
            .map_err(|error| ContentProblem::new("wrong type", error, "a JSON value"))
    };
    match (variable.ty, value) {
        (VariableType::Integer, VarValue::Integer(_))
        | (VariableType::Number, VarValue::Integer(_) | VarValue::Number(_))
        | (VariableType::Boolean, VarValue::Boolean(_))
        | (VariableType::Text | VariableType::Name | VariableType::Audio, VarValue::Str(_))
        | (VariableType::Place, VarValue::Place(_))
        | (VariableType::Condition, VarValue::Condition(_) | VarValue::Boolean(_)) => json(value),
        (VariableType::Row, VarValue::Str(key)) => {
            let table = variable.table.as_deref().unwrap_or("");
            match RiftScripting::row_value(content, table, key) {
                Some(_) => json(value),
                None => Err(ContentProblem::unknown_row(
                    table,
                    key,
                    content
                        .table_named(table)
                        .and_then(|rows| nearest(rows.keys(), key))
                        .as_deref(),
                )),
            }
        }
        _ => Err(wrong(variable.ty.name())),
    }
}

fn fill(
    json: &mut Value,
    values: &BTreeMap<String, Value>,
    declared: &BTreeMap<String, Variable<RiftScripting>>,
    pointer: &str,
    unknown: &mut Vec<(String, String)>,
) {
    if let Some(name) = hole_name(json).map(str::to_owned) {
        match values.get(&name) {
            Some(value) => *json = value.clone(),
            None if !declared.contains_key(&name) => unknown.push((format!("{pointer}/var"), name)),
            None => {}
        }
        return;
    }
    match json {
        Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                let pointer = format!("{pointer}/{}", escape(key));
                fill(value, values, declared, &pointer, unknown);
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter_mut().enumerate() {
                fill(
                    item,
                    values,
                    declared,
                    &format!("{pointer}/{index}"),
                    unknown,
                );
            }
        }
        _ => {}
    }
}

pub fn hole_name(json: &Value) -> Option<&str> {
    let map = json.as_object()?;
    if map.len() != 1 {
        return None;
    }
    map.get("var")?.as_str()
}

fn strings(json: &Value, into: &mut Vec<String>) {
    match json {
        Value::String(text) => into.push(text.clone()),
        Value::Object(map) => map.values().for_each(|value| strings(value, into)),
        Value::Array(items) => items.iter().for_each(|item| strings(item, into)),
        _ => {}
    }
}

pub fn holes(json: &Value, into: &mut Vec<String>) {
    if let Some(name) = hole_name(json) {
        if !into.iter().any(|known| known == name) {
            into.push(name.to_owned());
        }
        return;
    }
    match json {
        Value::Object(map) => {
            for value in map.values() {
                holes(value, into);
            }
        }
        Value::Array(items) => {
            for item in items {
                holes(item, into);
            }
        }
        _ => {}
    }
}

pub fn place(module: &mut AreaModule, at: Pos<Tiles>, flip: Flip) {
    let point = |p: Pos<Tiles>| at + flip.apply(p).to_vector();
    let rect = |r: Rect<Tiles>| flip.place(r, at);
    match module {
        AreaModule::Object(object) => {
            object.shape = match object.shape {
                ObjectShape::Point(p) => ObjectShape::Point(point(p)),
                ObjectShape::Rect(r) => ObjectShape::Rect(rect(r)),
            };
        }
        AreaModule::SafeZone(zone) => zone.rect = rect(zone.rect),
        AreaModule::Soundscape(soundscape) => {
            soundscape.shape = match soundscape.shape {
                SoundscapeShape::Rect(r) => SoundscapeShape::Rect(rect(r)),
                SoundscapeShape::Ellipse(r) => SoundscapeShape::Ellipse(rect(r)),
            };
        }
        AreaModule::Scenery(scenery) => {
            scenery.at = point(scenery.at);
            scenery.flip = scenery.flip.compose(flip);
        }
        AreaModule::Population(population) => {
            population.roams = population.roams.map(rect);
        }
        AreaModule::Resident(resident) => resident.at = point(resident.at),
        AreaModule::Blueprint(_) | AreaModule::Script(_) => {}
    }
}
