use std::sync::{Arc, LazyLock};

use bevy_ecs::prelude::*;
use engine::core::content::{Content, ContentScope, with_content};
use engine::core::math::{Offset, Pos};
use engine::core::script::compile::compile_owner;
use engine::core::tiling::Tiles;
use engine::systems::area::AreaDef;
use engine::systems::combat::{self, AttackRequest};
use engine::systems::dialogue::{self, ConversationRequest};
use engine::systems::interact::{self, InteractRequest};
use engine::systems::movement::{self, position};
use engine::systems::npc::{self, NpcDef, Pack};
use engine::systems::script::{
    self, EventKind, Owner, OwnerKind, Procedure, RiftEffect, RiftInstances, ScriptModule,
};
use engine::systems::stat::{self, StatKind};
use engine::systems::{actor, skill};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use testkit::{Game, Map, Sim};

/// The rows every script under test names, loaded once a process.
pub fn content() -> &'static Content {
    static CONTENT: LazyLock<Content> = LazyLock::new(|| game().load());
    &CONTENT
}

/// Reads a value as the loader would, with every row key resolved against the test game.
pub fn parse<T: DeserializeOwned>(value: Value) -> T {
    let (result, scope) = with_content(ContentScope::of(content()), || {
        serde_json::from_value::<T>(value.clone())
    });
    assert!(!scope.has_problems(), "unknown rows in {value}");
    result.unwrap_or_else(|error| panic!("{error} in {value}"))
}

pub fn inline(nodes: Value) -> ScriptModule {
    parse(json!({ "type": "inline_script", "nodes": nodes }))
}

pub fn inline_with(locals: Value, nodes: Value) -> ScriptModule {
    parse(json!({ "type": "inline_script", "locals": locals, "nodes": nodes }))
}

pub fn effect(value: Value) -> RiftEffect {
    parse(value)
}

/// A fighter alone in the middle of a field, where the test game's characters can be set loose.
pub fn field() -> (Sim, Entity) {
    let mut sim = Sim::new(content().clone());
    sim.serve("field")
        .accept::<InteractRequest>()
        .accept::<ConversationRequest>()
        .accept::<AttackRequest>()
        .add((
            interact::interact_request,
            combat::request,
            dialogue::requests,
            actor::playing::progress,
            skill::casting::casts,
        ))
        .add((
            script::query::take_tick_roster,
            script::run_tick,
            npc::body::drive,
            movement::advance,
            interact::interactions,
            dialogue::hold,
            dialogue::refresh,
        ))
        .add((
            stat::settle_health,
            combat::defeats,
            skill::hotbar::settle_basic_attack,
            actor::settle,
        ));
    script::spawn_stateless(&mut sim.world);
    npc::spawn_all(&mut sim.world);
    let player = sim.join(1);
    sim.run(0.5);
    (sim, player)
}

/// The character of the npc row under `key`, spawned `offset` away from `near`, in `pack`.
pub fn spawn(sim: &mut Sim, key: &str, near: Entity, offset: Offset<Tiles>, pack: u32) -> Entity {
    let at: Pos<Tiles> = position(&sim.world, near).expect("a position") + offset;
    let area = sim.id::<AreaDef>("field");
    let def = sim.id::<NpcDef>(key);
    npc::spawn(&mut sim.world, def, at, area, Pack(pack))
}

/// A plain fighter beside `beside`, running only `modules`.
pub fn scripted_npc(sim: &mut Sim, beside: Entity, modules: &[&ScriptModule]) -> (Entity, Owner) {
    let npc = spawn(sim, "fighter", beside, Offset::new(1.0, 0.0), u32::MAX);
    let owner = Owner::Entity(OwnerKind::Npc, npc);
    let procedures = compiled("test/npc", modules);
    let mut instances = sim.world.resource_mut::<RiftInstances>();
    instances.remove_owner(owner);
    instances.spawn_owner(owner, procedures);
    instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
    sim.tick();
    (npc, owner)
}

pub fn compiled(name: &str, modules: &[&ScriptModule]) -> Vec<Arc<Procedure>> {
    compile_owner(content(), OwnerKind::Npc, name, modules).expect("compiles")
}

pub fn health(sim: &Sim, who: Entity) -> f32 {
    stat::effective(&sim.world, who, StatKind::Health)
}

fn game() -> Game {
    let fighter = |script: &str| json!([{ "type": "shared_script", "script": script, "values": { "aggro": 4.0 } }]);
    Game::new()
        .area(
            "field",
            &Map::open(32, 32),
            json!([{ "type": "resident", "npc": "stroller", "at": { "x": 26.0, "y": 4.0 } }]),
        )
        .area("forest", &Map::open(8, 20), json!([]))
        .hero("field", 8.0, 8.0)
        .sword()
        .wearing(&["sword"])
        .npc("fighter", 30.0, json!([]))
        .npc("hunter", 30.0, fighter("hunts"))
        .npc("guard", 30.0, fighter("defends"))
        .npc("chief", 30.0, fighter("protects"))
        .npc("bat", 30.0, json!([{ "type": "shared_script", "script": "flees" }]))
        .npc("stroller", 30.0, json!([{ "type": "shared_script", "script": "strolls" }]))
        .edit("npc", "fighter", striking)
        .edit("npc", "hunter", striking)
        .edit("npc", "guard", striking)
        .edit("npc", "chief", striking)
        .edit("npc", "bat", striking)
        .row("script", "hunts", fights_nearest("characters"))
        .row("script", "defends", fights_nearest("attackers"))
        .row("script", "protects", fights_nearest("pack_attackers"))
        .row(
            "script",
            "flees",
            json!({
                "owner": "npc",
                "nodes": {
                    "spawned": { "type": "on", "event": "started", "next": "hostile" },
                    "hostile": { "type": "set_attitude", "attitude": "hostile", "next": "roam" },
                    "roam": { "type": "wander", "priority": 1, "next": "tick" },
                    "tick": { "type": "wait", "seconds": 1, "at_most": 1.0, "next": "roam" },
                },
            }),
        )
        .row(
            "script",
            "strolls",
            json!({
                "owner": "npc",
                "nodes": {
                    "spawned": { "type": "on", "event": "started", "next": "roam" },
                    "roam": { "type": "wander", "leash": 3, "priority": 1, "next": "rest" },
                    "rest": { "type": "wait", "seconds": 1, "at_most": 2.0, "next": "roam" },
                },
            }),
        )
        .item("gold", json!({ "name": "Gold", "kind": { "type": "resource" }, "modules": [{ "type": "stack", "max": 1000 }] }))
        .item("pass", json!({ "kind": { "type": "equipment", "slot": "offhand" } }))
        .item(
            "map",
            json!({
                "kind": { "type": "usable" },
                "modules": [{
                    "type": "inline_script",
                    "nodes": {
                        "used": { "type": "on", "event": "used", "next": "look" },
                        "look": { "type": "notify", "notification": "gulls" },
                    },
                }],
            }),
        )
        .row("memory", "bribed", remembered("Bribed"))
        .row("memory", "sided", remembered("Sided"))
        .row("memory", "looted", remembered("Looted"))
        .row(
            "status_effect",
            "guarded",
            json!({
                "name": "Guarded",
                "icon": "icons/status.png",
                "category": "buff",
                "description": "Guarded.",
                "vfx": {},
                "modules": [],
            }),
        )
        .asset("icons/status.png", testkit::png(1, 1))
        .row(
            "quest",
            "x_marks",
            json!({
                "title": "X Marks the Spot",
                "category": "Mysteries",
                "blurb": "Dig.",
                "xp": 10,
                "modules": [
                    { "type": "task", "task": "find_stone", "label": "Find the stone" },
                    { "type": "hand_over", "text": ["Here."] },
                ],
            }),
        )
        .row(
            "quest",
            "plea",
            json!({
                "title": "The Plea",
                "category": "Errands",
                "blurb": "Answer.",
                "xp": 10,
                "modules": [{
                    "type": "decide",
                    "label": "Answer",
                    "paths": [
                        { "choice": "Give them", "means": ["Given"] },
                        { "choice": "Keep them", "means": ["Kept"] },
                    ],
                }],
            }),
        )
        .row(
            "shop",
            "box",
            json!({
                "title": "Honesty box",
                "mark": "merchant",
                "modules": [{
                    "type": "sells",
                    "item": "pass",
                    "price": [{ "item": "gold", "count": 3 }],
                    "stock": { "type": "unlimited" },
                }],
            }),
        )
        .mark("merchant")
        .row("notification", "gulls", narration("Gulls squabble."))
        .row("notification", "sails", narration("A sail on the horizon."))
        .row("notification", "intro", narration("Pines close in."))
        .sfx("waves")
        .sfx("ui_pick")
        .sfx("ui_refuse")
        .sfx("ui_close")
        .vfx("damage_taken")
        .shader("damage_pop")
        .vfx("healed")
        .shader("heal_pop")
        .vfx("defeated")
}

/// A temperament that fights the nearest of `among` within its aggro, and roams while none is.
fn fights_nearest(among: &str) -> Value {
    json!({
        "owner": "npc",
        "variables": { "aggro": { "type": "number" } },
        "locals": { "target": "actor" },
        "nodes": {
            "spawned": { "type": "on", "event": "started", "next": "hostile" },
            "hostile": { "type": "set_attitude", "attitude": "hostile", "next": "look" },
            "look": {
                "type": "set",
                "values": [{ "local": "target", "to": { "type": "nearest", "among": among, "within": { "var": "aggro" } } }],
                "next": "found",
            },
            "found": {
                "type": "if",
                "test": { "type": "present", "actor": { "type": "local", "local": "target" } },
                "yes": "fight",
                "no": "roam",
            },
            "fight": {
                "type": "attack",
                "target": { "type": "local", "local": "target" },
                "within": { "var": "aggro" },
                "priority": 5,
                "defeated": "look",
                "lost": "look",
                "interrupted": "look",
            },
            "roam": { "type": "wander", "priority": 1, "next": "tick" },
            "tick": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "look" },
        },
    })
}

fn striking(npc: &mut Value) {
    npc["basic_attack"] = json!("strike");
}

fn remembered(label: &str) -> Value {
    json!({ "label": label, "type": "boolean", "resets": "never" })
}

fn narration(text: &str) -> Value {
    json!({ "kind": { "type": "narration", "label": "Shore", "sfx": "waves" }, "text": [text] })
}
