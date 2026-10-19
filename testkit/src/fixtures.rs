use engine::core::content::Fixture;
use engine::core::content::fixture::FixtureLock;
use engine::core::vfx::{ParamKind, ShaderParam};
use engine::systems::area::world_map::WorldMap;
use engine::systems::attention::AttentionMark;
use engine::systems::input::map::InputAction;
use engine::systems::interface::{CursorShape, InterfaceIcon, InterfaceSound};
use engine::systems::vfx::{VfxFixture, VfxShaderFixture};
use serde_json::{Value, json};

use crate::Game;
use crate::art::png;

impl Game {
    /// Every row the engine itself requires, each in its plainest form that keeps what the engine
    /// reads from it, so a game of only the rows a test declares loads as a whole one. A row the
    /// test declares after replaces the plain one.
    pub fn engine_rows(self) -> Game {
        let game = each::<InputAction>(self, |game, key, _| {
            game.row("input", key, json!({ "label": key, "bindings": [] }))
        });
        let game = each::<AttentionMark>(game, |game, key, _| game.mark(key));
        let game = each::<InterfaceSound>(game, |game, key, _| game.sfx(key));
        let game = each::<CursorShape>(game, |game, key, _| {
            let image = format!("icons/cursors/{key}.png");
            game.row(
                "cursor",
                key,
                json!({ "image": image, "hotspot": { "x": 0, "y": 0 } }),
            )
            .asset(&image, png(1, 1))
        });
        let game = each::<InterfaceIcon>(game, |game, key, _| {
            let image = format!("icons/interface/{key}.png");
            game.row("interface_icon", key, json!({ "image": image }))
                .asset(&image, png(1, 1))
        });
        let game = each::<VfxFixture>(game, |game, key, _| game.vfx(key));
        let game = each::<VfxShaderFixture>(game, |game, key, locks| {
            game.shader(key).edit("vfx_shader", key, |shader| {
                shader["params"] = Value::Array(locks.iter().filter_map(param).collect());
            })
        });
        each::<WorldMap>(game, |game, key, _| game.row("world_map", key, json!({})))
    }
}

fn each<F: Fixture>(game: Game, add: impl Fn(Game, &str, Vec<FixtureLock>) -> Game) -> Game {
    F::VARIANTS.iter().fold(game, |game, fixture| {
        add(game, fixture.key(), fixture.locks())
    })
}

/// The shader parameter a lock keeps, holding its kind's blank value.
fn param(lock: &FixtureLock) -> Option<Value> {
    let FixtureLock::Entry { list, entry } = lock else {
        return None;
    };
    if list != "/params" {
        return None;
    }
    let name = entry["name"].as_str()?.to_owned();
    let kind: ParamKind = serde_json::from_value(entry["kind"].clone()).ok()?;
    let param = ShaderParam {
        name,
        kind,
        default: kind.blank(),
        min: None,
        max: None,
    };
    serde_json::to_value(param).ok()
}
