use bevy_ecs::prelude::*;
use engine::core::math::Pos;
use engine::core::tiling::{TilePos, Tiles};
use engine::systems::area::transition::Crossing;
use engine::systems::area::warp::warp;
use engine::systems::area::{self, AreaDef};
use engine::systems::dialogue::{self, Conversation, ConversationRequest};
use engine::systems::interact::{self, InteractRequest};
use engine::systems::memory::{self, MemoryDef};
use engine::systems::movement::{self, MoveRequest, MoveSeq, Position, moving, on_tile, position};
use engine::systems::player::{self, ARRIVAL_PATIENCE, AreaDrawn, JoinRequest, commands_locked};
use engine::systems::script::{self, Place};
use engine::systems::{npc, stat};
use serde_json::{Value, json};
use testkit::{Game, Map, Sim, labels, locked};

const ROAD: Pos<Tiles> = Pos::new(13.0, 6.0);

#[test]
fn an_arrival_is_released_by_the_client_reporting_its_area_drawn() {
    let mut sim = harbour();
    let player = arriving(&mut sim);
    assert!(commands_locked(&sim.world, player));

    let conn = sim.conn(1);
    sim.send(conn, AreaDrawn);
    sim.tick();
    assert!(!commands_locked(&sim.world, player));
}

#[test]
fn an_arrival_is_released_by_the_server_once_the_patience_runs_out() {
    let mut sim = harbour();
    let player = arriving(&mut sim);

    sim.run(ARRIVAL_PATIENCE.0 - 1.0);
    assert!(commands_locked(&sim.world, player));

    sim.run(2.0);
    assert!(!commands_locked(&sim.world, player));
}

#[test]
fn a_warp_taken_mid_stride_leaves_you_standing_where_it_put_you() {
    let mut sim = harbour();
    let player = sim.join(1);
    let start = position(&sim.world, player).expect("placed");
    let away = Pos::new(start.x, start.y + 5.0);
    let there = Pos::new(start.x - 2.0, start.y);

    walk(&mut sim, away);
    assert!(
        sim.run_until(5.0, |world| !on_tile(world, player)),
        "you never set off"
    );
    let to = Place {
        area: sim.id::<AreaDef>("harbour"),
        at: there,
    };
    warp(&mut sim.world, player, to).expect("a warp within the area");
    sim.later(2.0);
    assert_eq!(position(&sim.world, player), Some(there));
    assert!(!moving(&sim.world, player));
}

#[test]
fn a_warp_counts_as_a_jump_where_a_walk_does_not() {
    let mut sim = harbour();
    let player = sim.join(1);
    let start = position(&sim.world, player).expect("placed");
    let away = Pos::new(start.x - 2.0, start.y);
    let jumps = |sim: &Sim| sim.world.get::<Position>(player).expect("placed").jumps;
    let before = jumps(&sim);

    walk(&mut sim, away);
    assert!(
        sim.run_until(5.0, |world| position(world, player) == Some(away)),
        "you never got there"
    );
    assert_eq!(jumps(&sim), before, "the walk counted as a jump");
    let back = Place {
        area: sim.id::<AreaDef>("harbour"),
        at: start,
    };
    warp(&mut sim.world, player, back).expect("a warp within the area");
    assert_ne!(jumps(&sim), before, "the warp went uncounted");
}

#[test]
fn without_a_pass_the_road_is_ground_and_the_warden_halts_you_on_it() {
    let mut sim = harbour();
    let player = sim.join(1);
    let warden = sim.npc("warden");

    walk(&mut sim, ROAD);
    assert!(halted(&mut sim, player), "the warden never stopped you");
    let halt = sim.conversation(1).expect("halted");
    assert_eq!(halt.with, Some(warden));
    assert!(position(&sim.world, player).is_some_and(|at| at.distance(ROAD) < Tiles(0.5)));
    assert!(commands_locked(&sim.world, player));
    assert!(!labels(&halt).contains(&"I have a pass.".to_owned()));
    assert!(locked(&halt, "I'm ready for the road."));
    sim.pick(1, "I'm ready for the road.");
    assert_eq!(sim.errors(1), vec!["Needs Level 3".to_owned()]);

    sim.leave(1);
    walk(&mut sim, ROAD);
    assert!(
        !crossed(&mut sim, player, 3.0),
        "the warp took you without a pass"
    );
    assert!(sim.conversation(1).is_none());
}

#[test]
fn the_warden_halts_you_each_time_you_step_back_onto_the_road() {
    let mut sim = harbour();
    let player = sim.join(1);
    walk(&mut sim, ROAD);
    assert!(halted(&mut sim, player));
    sim.leave(1);

    let off = Pos::new(ROAD.x - 2.0, ROAD.y);
    walk(&mut sim, off);
    assert!(arrived(&mut sim, player, off));
    walk(&mut sim, ROAD);
    assert!(halted(&mut sim, player), "the warden let you try twice");
}

#[test]
fn walking_past_the_road_is_no_business_of_the_wardens() {
    let mut sim = harbour();
    let player = sim.join(1);
    let past = Pos::new(ROAD.x - 2.0, ROAD.y - 1.0);

    walk(&mut sim, past);
    assert!(arrived(&mut sim, player, past));
    assert!(sim.conversation(1).is_none());
}

#[test]
fn the_warden_only_lets_seasoned_fighters_earn_a_pass() {
    let mut sim = harbour();
    let player = sim.join(1);

    let hello = sim.talk(1, "warden");
    assert!(locked(&hello, "I'm ready for the road."));
    sim.pick(1, "I'm ready for the road.");
    assert_eq!(sim.errors(1), vec!["Needs Level 3".to_owned()]);
    assert_eq!(sim.count(player, "pass"), 0);
}

#[test]
fn a_pass_opens_the_road_without_a_word_from_the_warden() {
    let mut sim = harbour();
    let player = sim.join(1);
    sim.give(player, "pass", 1);

    walk(&mut sim, ROAD);
    assert!(crossed(&mut sim, player, 15.0), "the warp never took you");
    let crossing = *sim.world.get::<Crossing>(player).expect("crossing");
    assert_eq!(crossing.dest_area, sim.id::<AreaDef>("forest"));
    assert!(sim.conversation(1).is_none());
}

#[test]
fn crossing_the_road_on_the_way_elsewhere_is_no_business_of_the_wardens() {
    let mut sim = harbour();
    let player = sim.join(1);
    let before = Pos::new(ROAD.x, ROAD.y + 3.0);
    let beyond = Pos::new(ROAD.x, ROAD.y - 2.0);
    movement::relocate(&mut sim.world, player, before);

    walk(&mut sim, beyond);
    assert!(arrived(&mut sim, player, beyond), "the road stopped you");
    assert!(sim.world.get::<Crossing>(player).is_none());
    assert!(sim.conversation(1).is_none());
}

#[test]
fn the_warden_trades_a_pass_for_a_fish_and_the_ferryman_only_looks_at_it() {
    let mut sim = harbour();
    let player = sim.join(1);
    sim.give(player, "fish", 1);

    let greeting = sim.talk(1, "warden");
    assert!(!labels(&greeting).contains(&"The clan walks with me.".to_owned()));
    let traded = sim
        .pick(1, "Would a fish change your mind?")
        .expect("talking");
    assert_eq!(traded.node, "fish");
    assert_eq!(sim.count(player, "pass"), 1);
    assert_eq!(sim.count(player, "fish"), 0);
    sim.leave(1);

    let ferry = sim.talk(1, "ferryman");
    assert!(!locked(&ferry, "The warden gave me this pass."));
    sim.pick(1, "The warden gave me this pass.");
    let crossing = *sim
        .world
        .get::<Crossing>(player)
        .expect("sailing for the forest");
    assert_eq!(crossing.dest_area, sim.id::<AreaDef>("forest"));
    assert_eq!(sim.count(player, "pass"), 1);
}

#[test]
fn the_ferryman_sails_for_twenty_gold_and_the_crossing_is_narrated() {
    let mut sim = harbour();
    let player = sim.join(1);
    sim.give(player, "gold", 25);

    let ferry = sim.talk(1, "ferryman");
    assert!(!labels(&ferry).contains(&"The warden gave me this pass.".to_owned()));
    sim.pick(1, "Sail to the forest.");

    assert_eq!(sim.count(player, "gold"), 5);
    assert!(sim.world.get::<Crossing>(player).is_some());
    let sails = sim.spoken("sails");
    assert!(sim.told(1).contains(&sails));
}

#[test]
fn the_warden_has_a_word_only_for_friends_of_the_clan() {
    let mut sim = harbour();
    let player = sim.join(1);
    let sided = sim.id::<MemoryDef>("sided");
    memory::set(
        &mut sim.world,
        player,
        sided,
        engine::core::script::Value::Bool(true),
    );

    sim.talk(1, "warden");
    let passed = sim.pick(1, "The clan walks with me.").expect("talking");
    assert_eq!(passed.node, "uneasy");
    assert_eq!(sim.count(player, "pass"), 1);
}

fn harbour() -> Sim {
    let stacked =
        || json!({ "kind": { "type": "resource" }, "modules": [{ "type": "stack", "max": 1000 }] });
    let content = Game::new()
        .area(
            "harbour",
            &Map::open(20, 12),
            json!([
                { "type": "resident", "npc": "warden", "at": { "x": 11.0, "y": 3.0 } },
                { "type": "resident", "npc": "ferryman", "at": { "x": 4.0, "y": 9.0 } },
                {
                    "type": "object",
                    "name": "road",
                    "shape": { "type": "rect", "x": 12.5, "y": 5.5, "w": 1.0, "h": 1.0 },
                    "scripts": [{
                        "type": "inline_script",
                        "nodes": {
                            "entered": { "type": "on", "event": "entered", "by": "characters", "next": "pass" },
                            "pass": { "type": "if", "test": holding_pass(), "yes": "cross" },
                            "cross": { "type": "warp", "to": { "area": "forest", "x": 3.0, "y": 3.0 } },
                        },
                    }],
                },
            ]),
        )
        .area("forest", &Map::open(8, 8), json!([]))
        .hero("harbour", 8.0, 6.0)
        .item("gold", json!({ "name": "Gold", "kind": { "type": "resource" }, "modules": [{ "type": "stack", "max": 1000 }] }))
        .item("pass", stacked())
        .item("fish", stacked())
        .npc("warden", 40.0, json!([warden()]))
        .npc("ferryman", 40.0, json!([ferryman()]))
        .row(
            "memory",
            "sided",
            json!({ "label": "Sided with the clan", "type": "boolean", "resets": "never" }),
        )
        .row(
            "notification",
            "sails",
            json!({
                "kind": { "type": "narration", "label": "The ferry", "sfx": "hull" },
                "text": ["The ferry scrapes onto the forest shore."],
            }),
        )
        .sfx("hull")
        .sfx("ui_refuse")
        .sfx("ui_close")
        .load();
    let mut sim = Sim::new(content);
    sim.serve("harbour")
        .accept::<AreaDrawn>()
        .accept::<MoveRequest>()
        .accept::<InteractRequest>()
        .accept::<ConversationRequest>()
        .add((
            player::arrival_holds,
            movement::move_request,
            interact::interact_request,
            dialogue::requests,
        ))
        .add((
            script::query::take_tick_roster,
            area::object::track,
            npc::approach,
            script::run_tick,
            npc::body::drive,
            movement::advance,
            interact::interactions,
            dialogue::hold,
            dialogue::refresh,
        ))
        .add(stat::settle_health);
    script::spawn_stateless(&mut sim.world);
    npc::spawn_all(&mut sim.world);
    area::object::spawn_all(&mut sim.world);
    sim
}

fn warden() -> Value {
    let said = |text: &str, choices: Value| {
        json!({
            "type": "dialogue",
            "lines": [{ "by": { "type": "narrator" }, "text": [text] }],
            "choices": choices,
        })
    };
    let seasoned = json!({ "type": "at_least", "a": { "type": "level" }, "b": 3 });
    json!({
        "type": "inline_script",
        "nodes": {
            "interacted": { "type": "on", "event": "interacted", "verb": "talk", "reach": 2.0, "next": "hello" },
            "watches_road": {
                "type": "on",
                "event": "stood_on",
                "by": "characters",
                "object": "road",
                "next": "no_pass",
            },
            "no_pass": { "type": "if", "test": { "type": "not", "of": holding_pass() }, "yes": "halt" },
            "halt": said("Halt! Nobody takes the road without a pass.", json!([
                { "label": ["I have a pass."], "requires": holding_pass(), "reveal": ["needs"], "to": "lets_you_pass" },
                { "label": ["I'm ready for the road."], "requires": seasoned, "reveal": ["locked", "needs"], "to": "earn_pass" },
                { "label": ["I'll turn back."] },
            ])),
            "hello": said("The road is closed.", json!([
                { "label": ["I'm ready for the road."], "requires": seasoned, "reveal": ["locked", "needs"], "to": "earn_pass" },
                { "label": ["Would a fish change your mind?"], "reveal": ["costs"], "to": "fish_for_pass" },
                {
                    "label": ["The clan walks with me."],
                    "requires": { "type": "memory", "memory": "sided" },
                    "to": "clan_pass",
                },
                { "label": ["Goodbye."] },
            ])),
            "earn_pass": { "type": "items", "give": [{ "item": "pass" }], "done": "lets_you_pass" },
            "fish_for_pass": {
                "type": "items",
                "take": [{ "item": "fish" }],
                "give": [{ "item": "pass" }],
                "done": "fish",
            },
            "clan_pass": { "type": "items", "give": [{ "item": "pass" }], "done": "uneasy" },
            "lets_you_pass": said("Fine. Keep that pass on you.", json!([{ "label": ["Thank you."] }])),
            "fish": said("Fine. Take the pass.", json!([{ "label": ["Enjoy it."] }])),
            "uneasy": said("Then go.", json!([{ "label": ["Thank you."] }])),
        },
    })
}

fn ferryman() -> Value {
    json!({
        "type": "inline_script",
        "nodes": {
            "interacted": { "type": "on", "event": "interacted", "verb": "talk", "reach": 2.0, "next": "hello" },
            "hello": {
                "type": "dialogue",
                "lines": [{ "by": { "type": "narrator" }, "text": ["Twenty gold, or show me a pass."] }],
                "choices": [
                    { "label": ["Sail to the forest."], "reveal": ["costs"], "to": "fare" },
                    {
                        "label": ["The warden gave me this pass."],
                        "requires": holding_pass(),
                        "reveal": ["needs"],
                        "to": "sail",
                    },
                    { "label": ["Goodbye."] },
                ],
            },
            "fare": { "type": "items", "take": [{ "item": "gold", "count": 20 }], "done": "sail" },
            "sail": { "type": "notify", "notification": "sails", "next": "cross" },
            "cross": { "type": "warp", "to": { "area": "forest", "x": 3.0, "y": 3.0 } },
        },
    })
}

fn holding_pass() -> Value {
    json!({ "type": "at_least", "a": { "type": "holding", "item": "pass" }, "b": 1 })
}

/// A client joined but has not yet drawn the area it arrived in.
fn arriving(sim: &mut Sim) -> Entity {
    let conn = sim.connect(1);
    sim.send(conn, JoinRequest);
    player::join(&mut sim.world);
    sim.player(1)
}

fn walk(sim: &mut Sim, to: Pos<Tiles>) {
    let conn = sim.conn(1);
    sim.send(
        conn,
        MoveRequest {
            pos: to,
            seq: MoveSeq(1),
        },
    );
}

fn arrived(sim: &mut Sim, player: Entity, at: Pos<Tiles>) -> bool {
    sim.run_until(15.0, |world| {
        position(world, player).is_some_and(|here| here.distance(at) < Tiles(0.5))
    })
}

fn crossed(sim: &mut Sim, player: Entity, within: f32) -> bool {
    sim.run_until(within, |world| world.get::<Crossing>(player).is_some())
}

fn halted(sim: &mut Sim, player: Entity) -> bool {
    sim.run_until(15.0, |world| {
        world
            .get::<Conversation>(player)
            .is_some_and(|now| now.node == "halt")
    })
}
