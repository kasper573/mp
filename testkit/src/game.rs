use std::collections::BTreeMap;
use std::sync::{Arc, LazyLock};

use engine::core::content::{Content, ContentRegistry, LoadReport, MemoryFolder, version};
use engine::core::math::Direction;
use engine::systems::actor::Action;
use serde_json::{Value, json};
use strum::VariantArray;

use crate::art::{png, wav};

/// A game folder held in memory, of only the rows a test declares, loaded by the engine's own loader
/// against every table a game is made of. A row the test leaves out is simply absent, so a test that
/// leans on more than it declares fails loudly at load or where the engine reads the row.
pub struct Game {
    files: BTreeMap<String, Arc<[u8]>>,
    settings: Option<Value>,
}

// Built once a process: hashing every shape for the content version takes a while.
static TABLES: LazyLock<ContentRegistry> = LazyLock::new(engine::systems::tables);
static SETTLED_TABLES: LazyLock<ContentRegistry> = LazyLock::new(engine::systems::settled_tables);

/// Every table a game is made of and the settings its `game.json` holds, built once a process.
pub fn settled_tables() -> &'static ContentRegistry {
    &SETTLED_TABLES
}

/// An area's ground as text, one string per row: `.` walkable, `#` blocked.
#[derive(Clone)]
pub struct Map(pub Vec<String>);

impl Game {
    pub fn new() -> Game {
        let mut game = Game {
            files: BTreeMap::new(),
            settings: None,
        };
        game.put("game.json", b"{}".to_vec());
        game
    }

    pub fn row(mut self, table: &str, key: &str, row: Value) -> Game {
        self.put(&format!("tables/{table}/{key}.json"), json_bytes(&row));
        self
    }

    /// A file under the folder's `assets/`.
    pub fn asset(mut self, path: &str, bytes: Vec<u8>) -> Game {
        self.put(&format!("assets/{path}"), bytes);
        self
    }

    /// A file at `path` in the folder, as is.
    pub fn file(mut self, path: &str, bytes: impl Into<Vec<u8>>) -> Game {
        self.put(path, bytes.into());
        self
    }

    pub fn remove(mut self, path: &str) -> Game {
        self.files
            .remove(path)
            .unwrap_or_else(|| panic!("no file `{path}` declared"));
        self
    }

    /// The game's own settings, read from `game.json`, at the content version this build reads
    /// unless they name one.
    pub fn settings(mut self, settings: Value) -> Game {
        self.settings = Some(settings);
        self
    }

    /// Changes the settings declared before.
    pub fn edit_settings(mut self, change: impl FnOnce(&mut Value)) -> Game {
        change(self.settings.as_mut().expect("settings declared"));
        self
    }

    /// A playable character (its model, class and player row) and settings that start every new
    /// character at `x`, `y` in `area`.
    pub fn hero(self, area: &str, x: f32, y: f32) -> Game {
        self.model("hero", 2.0, json!([]))
            .row(
                "class",
                "hero",
                json!({
                    "name": "Hero",
                    "icon": "icons/hero.png",
                    "levels": [{ "xp": 0, "skill_points": 1 }],
                }),
            )
            .asset("icons/hero.png", png(1, 1))
            .row(
                "player",
                "hero",
                json!({
                    "model": "hero",
                    "class": "hero",
                    "stats": stats(30.0),
                }),
            )
            .settings(json!({
                "name": "Test",
                "initial_spawn": { "area": area, "x": x, "y": y },
                "player": "hero",
            }))
    }

    /// A sword that, worn, lets its wearer strike: a basic attack on one enemy, landing the wearer's
    /// damage at the height of its swing.
    pub fn sword(self) -> Game {
        self.row(
            "skill",
            "strike",
            json!({
                "name": "Strike",
                "icon": "icons/strike.png",
                "target": "single_enemy",
                "basic_attack": true,
                "levels": [{ "cost": 1, "stats": { "power": 1.0 } }],
                "modules": [{
                    "type": "inline_script",
                    "nodes": {
                        "used": { "type": "on", "event": "used", "next": "swing" },
                        "swing": { "type": "animate", "action": "attack", "wait": "apex", "next": "hit" },
                        "hit": {
                            "type": "damage",
                            "who": { "type": "skill_targets" },
                            "by": { "type": "stat", "stat": "damage" },
                        },
                    },
                }],
            }),
        )
        .asset("icons/strike.png", png(1, 1))
        .item(
            "sword",
            json!({ "kind": { "type": "equipment", "slot": "weapon", "grants": ["strike"] } }),
        )
    }

    /// An item of `fields`, named after its key, with an icon and a quiet sound for every way it
    /// changes hands.
    pub fn item(self, key: &str, fields: Value) -> Game {
        let icon = format!("icons/{key}.png");
        let mut row = json!({
            "name": key,
            "icon": icon,
            "sfx": { "pickup": "item", "trade": "item", "drop": "item" },
        });
        for (field, value) in fields.as_object().expect("an item's fields") {
            row[field] = value.clone();
        }
        self.sfx("item")
            .row("item", key, row)
            .asset(&icon, png(1, 1))
    }

    /// Every new character starts wearing `items`.
    pub fn wearing(self, items: &[&str]) -> Game {
        self.edit("player", "hero", |hero| hero["wearing"] = json!(items))
    }

    /// Changes a row declared before.
    pub fn edit(mut self, table: &str, key: &str, change: impl FnOnce(&mut Value)) -> Game {
        let path = format!("tables/{table}/{key}.json");
        let bytes = self
            .files
            .get(&path)
            .unwrap_or_else(|| panic!("no {table} row `{key}` declared"));
        let mut row: Value = serde_json::from_slice(bytes).expect("a declared row is json");
        change(&mut row);
        self.put(&path, json_bytes(&row));
        self
    }

    /// A character of `health`, drawn with a model of its own under the same key, that does only
    /// what its `modules` make it do.
    pub fn npc(self, key: &str, health: f32, modules: Value) -> Game {
        self.model(key, 1.5, json!([])).row(
            "npc",
            key,
            json!({ "name": key, "model": key, "stats": stats(health), "modules": modules }),
        )
    }

    /// Gives the model under `key` a bust for every generic expression, so its lines can show a
    /// face.
    pub fn busts(self, key: &str) -> Game {
        const EXPRESSIONS: [&str; 6] =
            ["neutral", "happy", "sad", "angry", "surprised", "thinking"];
        let mut bust = json!({ "type": "bust" });
        let mut game = self;
        for expression in EXPRESSIONS {
            let file = format!("busts/{key}/{expression}.png");
            bust[expression] = json!(file);
            game = game.asset(&file, png(4, 4));
        }
        game.edit("model", key, |model| {
            model["modules"]
                .as_array_mut()
                .expect("a model's modules")
                .push(bust)
        })
    }

    /// A sound of a moment's silence.
    pub fn sfx(self, key: &str) -> Game {
        let file = format!("audio/{key}.wav");
        self.row(
            "sfx_role",
            "sounds",
            json!({ "name": "Sounds", "loudness": -28.0 }),
        )
        .row(
            "sfx",
            key,
            json!({ "file": file, "role": "sounds", "volume": 1.0, "pitch": 1.0 }),
        )
        .asset(&file, wav())
    }

    /// A babbling voice of silent letters, a character's `voice` module names it by `key`.
    pub fn babble(self, key: &str) -> Game {
        let letters = format!("audio/babble/{key}");
        let game = self
            .row(
                "babble_bank",
                key,
                json!({ "letters": letters, "volume": 0.22 }),
            )
            .row(
                "babble",
                key,
                json!({ "babble_bank": key, "pitch": 1.0, "range": 1.5, "pace": 12.0 }),
            );
        ('a'..='z').fold(game, |game, letter| {
            game.asset(&format!("{letters}/{letter}.wav"), wav())
        })
    }

    /// An attention mark of a plain icon.
    pub fn mark(self, key: &str) -> Game {
        let icon = format!("icons/marks/{key}.png");
        self.row("attention", key, json!({ "icon": icon }))
            .asset(&icon, png(1, 1))
    }

    /// A visual effect shader that draws nothing, of no parameters.
    pub fn shader(self, key: &str) -> Game {
        self.row("vfx_shader", key, json!({ "name": key, "params": [] }))
            .asset(
                &format!("shaders/{key}.wgsl"),
                b"fn vfx(uv: vec2<f32>) -> vec4<f32> {\n    return vec4<f32>(0.0);\n}\n".to_vec(),
            )
    }

    /// A visual effect of one transparent frame, shown for a second.
    pub fn vfx(self, key: &str) -> Game {
        let sheet = format!("vfx/{key}.png");
        self.row(
            "vfx",
            key,
            json!({
                "name": key,
                "layers": [{
                    "type": "sprite",
                    "sheet": sheet,
                    "frame": { "width": 1, "height": 1 },
                    "frames": 1,
                    "fps": 1.0,
                }],
            }),
        )
        .asset(&sheet, png(1, 1))
    }

    /// A model of one transparent frame, a tile wide and `height` tall, shown 100 ms a step for every
    /// action and heading; an attack lands on its second step, of three.
    pub fn model(self, key: &str, height: f32, modules: Value) -> Game {
        let image = format!("models/{key}.png");
        let step = json!({ "frame": 0, "ms": 100 });
        let apex = json!({ "frame": 0, "ms": 100, "apex": true });
        let actions: serde_json::Map<String, Value> = Action::VARIANTS
            .iter()
            .map(|action| {
                let strip = match action {
                    Action::Attack => json!([step, apex, step]),
                    _ => json!([step]),
                };
                let strips: serde_json::Map<String, Value> = Direction::VARIANTS
                    .iter()
                    .map(|direction| (direction.as_ref().to_owned(), strip.clone()))
                    .collect();
                (action.as_ref().to_owned(), Value::Object(strips))
            })
            .collect();
        self.row(
            "model",
            key,
            json!({
                "hitbox": { "width": 1.0, "height": height },
                "sprites": {
                    "type": "sheet",
                    "image": image,
                    "frame_size": { "width": 1, "height": 1 },
                    "actions": actions,
                },
                "modules": modules,
            }),
        )
        .asset(&image, png(1, 1))
    }

    /// An area of `map`'s ground, with `modules` placed on it, drawn with one plain tile.
    pub fn area(mut self, key: &str, map: &Map, modules: Value) -> Game {
        const TILE: u32 = 16;
        let tileset = format!("{key}_ground");
        let (width, height) = map.size();
        let ground = vec![vec!["0"; width]; height];
        let walk: Vec<Vec<&str>> = map
            .0
            .iter()
            .map(|row| {
                row.chars()
                    .map(|cell| if cell == '#' { "0" } else { "1" })
                    .collect()
            })
            .collect();
        self.put(
            &format!("tables/area/{key}/palette.csv"),
            format!("tileset,tile,flip\n{tileset},0,\n").into_bytes(),
        );
        self.put(&format!("tables/area/{key}/ground.csv"), csv(&ground));
        self.put(&format!("tables/area/{key}/walk.csv"), csv(&walk));
        self.row(
            "tileset",
            &tileset,
            json!({ "image": format!("tilesets/{tileset}.png"), "tile": TILE, "tiles": {} }),
        )
        .asset(&format!("tilesets/{tileset}.png"), png(TILE, TILE))
        .row(
            "area",
            key,
            json!({
                "name": key,
                "map": {
                    "type": "tilemap",
                    "size": { "width": width, "height": height },
                    "tile": TILE,
                    "ground": ["ground"],
                },
                "modules": modules,
            }),
        )
    }

    pub fn load(self) -> Content {
        self.try_load().unwrap_or_else(|report| panic!("{report}"))
    }

    /// Loads the rows and settings declared, as a folder of only some of a game's rows.
    pub fn try_load(self) -> Result<Content, LoadReport> {
        let registry = match self.settings {
            Some(_) => &*SETTLED_TABLES,
            None => &*TABLES,
        };
        load(registry, self.folder())
    }

    /// Loads the game as a whole one, held to everything a game must provide besides what it
    /// declares: every row the engine itself requires, and every quest and shop within reach.
    pub fn try_load_whole(self) -> Result<Content, LoadReport> {
        load(engine::systems::registry(), self.folder())
    }

    /// The folder of every file declared, and of `game.json` holding the settings.
    pub fn folder(&self) -> MemoryFolder {
        let mut files = self.files.clone();
        if let Some(settings) = &self.settings {
            let mut settings = settings.clone();
            if settings.get("content_version").is_none() {
                settings["content_version"] = json!(SETTLED_TABLES.version().0);
            }
            files.insert("game.json".to_owned(), json_bytes(&settings).into());
        }
        MemoryFolder {
            name: "test game".to_owned(),
            files,
        }
    }

    fn put(&mut self, path: &str, bytes: Vec<u8>) {
        self.files.insert(path.to_owned(), bytes.into());
    }
}

fn load(registry: &ContentRegistry, folder: MemoryFolder) -> Result<Content, LoadReport> {
    engine::core::content::load(
        registry,
        Arc::new(folder),
        version::build(),
        "the test game did not load",
    )
}

impl Default for Game {
    fn default() -> Game {
        Game::new()
    }
}

impl Map {
    /// Open ground, `width` × `height`.
    pub fn open(width: usize, height: usize) -> Map {
        Map(vec![".".repeat(width); height])
    }

    pub fn of(rows: &[&str]) -> Map {
        Map(rows.iter().map(|row| (*row).to_owned()).collect())
    }

    fn size(&self) -> (usize, usize) {
        (self.0.first().map_or(0, String::len), self.0.len())
    }
}

/// A fighter's stats at full `health`: six damage a hit at 1.2 hits a second from a tile and a half
/// away, walking four tiles a second.
pub fn stats(health: f32) -> Value {
    json!({
        "health": health,
        "max_health": health,
        "damage": 6.0,
        "attack_speed": 1.2,
        "attack_delay": 200.0,
        "movement_speed": 4.0,
        "range": 1.5,
    })
}

fn json_bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec_pretty(value).expect("json")
}

fn csv(rows: &[Vec<&str>]) -> Vec<u8> {
    let mut text = String::new();
    for row in rows {
        text.push_str(&row.join(","));
        text.push('\n');
    }
    text.into_bytes()
}
