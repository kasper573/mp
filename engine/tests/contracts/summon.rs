use bevy_ecs::prelude::*;
use engine::core::time::{Seconds, WallClock};
use engine::systems::combat::{self, AttackRequest, Attitude};
use engine::systems::dialogue::{self, ConversationRequest};
use engine::systems::interact::{self, InteractRequest};
use engine::systems::memory::{self, MemoryDef};
use engine::systems::npc::{self, Npc, NpcDef, Summoned, summon};
use engine::systems::player::ClientId;
use engine::systems::stat::{self, StatKind};
use engine::systems::visibility::{self, Presence};
use engine::systems::{actor, movement, rewards, script, skill};
use serde_json::{Value, json};
use testkit::{Game, Map, Sim};

#[test]
fn a_gamblers_dice_take_ten_gold_a_roll_and_pay_twenty_on_a_win() {
    let mut sim = harbour();
    let player = sim.join(1);
    sim.give(player, "gold", 400);

    let mut node = sim.talk(1, "gambler").node;
    let (mut won, mut lost) = (false, false);
    for _ in 0..30 {
        let before = sim.count(player, "gold");
        let roll = if node == "hello" {
            "Roll the dice."
        } else {
            "Roll again."
        };
        node = sim.pick(1, roll).expect("at the table").node;
        let after = sim.count(player, "gold");
        if node == "loses" {
            assert_eq!(after, before + 10);
            won = true;
        } else if node == "wins" {
            assert_eq!(after, before - 10);
            lost = true;
        } else {
            panic!("the dice landed on {node:?}");
        }
    }
    assert!(won && lost, "thirty rolls went only one way");
}

#[test]
fn calling_the_gambler_a_cheat_sends_guards_after_you_alone() {
    let mut sim = harbour();
    let player = sim.join(1);
    let bystander = sim.join(2);
    sim.give(player, "gold", 400);

    lose_at_dice(&mut sim, 1);
    assert!(sim.pick(1, "You're cheating.").is_none());

    let guards = all_of(&mut sim, "guard");
    assert_eq!(guards.len(), 2);
    for &guard in &guards {
        assert!(matches!(
            sim.world.get::<Presence>(guard),
            Some(Presence::For(ClientId(1)))
        ));
        assert_eq!(
            sim.world.get::<Summoned>(guard),
            Some(&Summoned { with: Some(player) })
        );
        assert!(visibility::present(&sim.world, guard, player));
        assert!(!visibility::present(&sim.world, guard, bystander));
    }
    assert!(remembered(&sim, player, "grudge"));

    let full = stat::effective(&sim.world, player, StatKind::Health);
    let calm = stat::effective(&sim.world, bystander, StatKind::Health);
    assert!(sim.run_until(15.0, |world| stat::effective(
        world,
        player,
        StatKind::Health
    ) < full));
    assert_eq!(
        stat::effective(&sim.world, bystander, StatKind::Health),
        calm
    );

    assert_eq!(sim.talk(1, "gambler").node, "grudging");
}

#[test]
fn fighting_the_gambler_leaves_him_dead_in_your_world_only() {
    let mut sim = harbour();
    let player = sim.join(1);
    let bystander = sim.join(2);
    let grudge = sim.id::<MemoryDef>("grudge");
    memory::set(
        &mut sim.world,
        player,
        grudge,
        engine::core::script::Value::Bool(true),
    );
    let gambler = sim.npc("gambler");

    sim.talk(1, "gambler");
    assert!(sim.pick(1, "Then let's settle this.").is_none());
    let copies = all_of(&mut sim, "gambler_hostile");
    assert_eq!(copies.len(), 1);
    let copy = copies[0];
    assert!(!visibility::present(&sim.world, gambler, player));
    assert!(visibility::present(&sim.world, gambler, bystander));
    assert!(!visibility::present(&sim.world, copy, bystander));

    sim.run(0.5);
    let conn = sim.conn(1);
    sim.send(conn, AttackRequest { target: copy });
    assert!(
        sim.run_until(60.0, |world| stat::is_dead(world, copy)),
        "the copy never fell"
    );
    sim.run(0.5);
    assert!(remembered(&sim, player, "dead"));
    assert!(!remembered(&sim, player, "fighting"));
    assert!(!visibility::present(&sim.world, gambler, player));
    assert!(visibility::present(&sim.world, gambler, bystander));

    let mut clock = sim.world.resource_mut::<WallClock>();
    clock.now = clock.now.after(Seconds(1800.0));
    sim.run(0.5);
    assert!(visibility::present(&sim.world, gambler, player));
}

#[test]
fn summons_leave_with_their_owner() {
    let mut sim = harbour();
    let player = sim.join(1);
    let guard = sim.id::<NpcDef>("guard");
    summon(
        &mut sim.world,
        guard,
        2,
        player,
        Some(ClientId(1)),
        Some(player),
    );
    assert_eq!(all_of(&mut sim, "guard").len(), 2);

    sim.world.despawn(player);
    sim.tick();
    assert!(all_of(&mut sim, "guard").is_empty());
}

#[test]
fn a_townsperson_turned_hostile_can_be_fought_until_they_return_friendly() {
    let mut sim = harbour();
    let player = sim.join(1);
    let baker = sim.npc("baker");
    assert!(!combat::attackable(&sim.world, player, baker));

    sim.world.entity_mut(baker).insert(Attitude::Hostile);
    assert!(combat::attackable(&sim.world, player, baker));

    stat::apply_damage(&mut sim.world, baker, 10_000.0);
    assert!(sim.run_until(10.0, |world| !stat::is_dead(world, baker)));
    assert_eq!(sim.world.get::<Attitude>(baker), Some(&Attitude::Friendly));
}

fn harbour() -> Sim {
    let content = Game::new()
        .area(
            "harbour",
            &Map::open(15, 9),
            json!([
                {
                    "type": "resident",
                    "npc": "gambler",
                    "at": { "x": 7.0, "y": 4.0 },
                    "shown": {
                        "type": "all",
                        "of": [
                            { "type": "not", "of": { "type": "memory", "memory": "fighting" } },
                            {
                                "type": "not",
                                "of": { "type": "set_within", "memory": "dead", "seconds": 1800 },
                            },
                        ],
                    },
                },
                { "type": "resident", "npc": "baker", "at": { "x": 10.0, "y": 6.0 } },
            ]),
        )
        .hero("harbour", 5.0, 4.0)
        .sword()
        .wearing(&["sword"])
        .item(
            "gold",
            json!({ "kind": { "type": "resource" }, "modules": [{ "type": "stack", "max": 100_000 }] }),
        )
        .npc("gambler", 40.0, json!([{ "type": "script", "script": "gambler_roll" }]))
        .script("gambler_roll", "npc/gambler", "npc", gambling())
        .npc(
            "gambler_hostile",
            40.0,
            json!([
                { "type": "script", "script": "gambler_hostile_hunt" },
                { "type": "script", "script": "gambler_hostile_defeat" },
            ]),
        )
        .owned("script", "gambler_hostile_hunt", "npc/gambler_hostile", hunting())
        .script(
            "gambler_hostile_defeat",
            "npc/gambler_hostile",
            "npc",
            json!({
                "defeated": { "type": "on", "event": "defeated", "next": "over" },
                "over": { "type": "forget", "memories": ["fighting"], "next": "dead" },
                "dead": { "type": "remember", "memory": "dead" },
            }),
        )
        .edit("npc", "gambler_hostile", |copy| copy["basic_attack"] = json!("strike"))
        .npc("guard", 30.0, json!([{ "type": "script", "script": "guard_hunt" }]))
        .owned("script", "guard_hunt", "npc/guard", hunting())
        .edit("npc", "guard", |guard| guard["basic_attack"] = json!("strike"))
        .npc("baker", 20.0, json!([{ "type": "respawn", "after": 5.0 }]))
        .row("memory", "grudge", memory_row("never"))
        .row("memory", "fighting", memory_row("leaving_area"))
        .row("memory", "dead", memory_row("never"))
        .vfx("damage_taken")
        .shader("damage_pop")
        .vfx("defeated")
        .load();
    let mut sim = Sim::new(content);
    sim.serve("harbour")
        .accept::<InteractRequest>()
        .accept::<ConversationRequest>()
        .accept::<AttackRequest>()
        .add((
            interact::interact_request,
            dialogue::requests,
            combat::request,
            actor::playing::progress,
            skill::casting::casts,
        ))
        .add((
            (rewards::grant, npc::defeated).chain(),
            script::query::take_tick_roster,
            script::run_tick,
            npc::body::drive,
            movement::advance,
            interact::interactions,
            (dialogue::hold, dialogue::refresh).chain(),
            (npc::run_respawn, npc::dismiss).chain(),
        ))
        .add((
            stat::settle_health,
            combat::defeats,
            skill::hotbar::settle_basic_attack,
            actor::settle,
        ));
    script::spawn_stateless(&mut sim.world);
    npc::spawn_all(&mut sim.world);
    sim
}

fn gambling() -> Value {
    let said = |text: &str, choices: Value| {
        json!({
            "type": "dialogue",
            "lines": [{ "by": { "type": "narrator" }, "text": [text] }],
            "choices": choices,
        })
    };
    json!({
            "interacted": {
                "type": "on",
                "event": "interacted",
                "verb": "talk",
                "reach": 2.0,
                "next": "holds_grudge",
            },
            "holds_grudge": {
                "type": "if",
                "test": { "type": "set_within", "memory": "grudge", "seconds": 1800 },
                "yes": "grudging",
                "no": "hello",
            },
            "hello": said("Ten gold a roll.", json!([
                { "label": ["Roll the dice."], "to": "stake" },
                { "label": ["Not today."] },
            ])),
            "stake": { "type": "items", "take": [{ "item": "gold", "count": 10 }], "done": "roll" },
            "roll": { "type": "random", "weights": [45, 55], "outputs": ["payout", "wins"] },
            "payout": { "type": "items", "give": [{ "item": "gold", "count": 20 }], "done": "loses" },
            "loses": said("Beginner's luck.", json!([
                { "label": ["Roll again."], "to": "stake" },
                { "label": ["Quit."] },
            ])),
            "wins": said("The house wins!", json!([
                { "label": ["Roll again."], "to": "stake" },
                { "label": ["You're cheating."], "to": "remember_grudge" },
                { "label": ["Leave."] },
            ])),
            "remember_grudge": { "type": "remember", "memory": "grudge", "next": "guards" },
            "guards": {
                "type": "spawn_npcs",
                "npc": "guard",
                "count": 2,
                "near": "owner",
                "shown": "subject",
            },
            "grudging": said("You've got some nerve.", json!([
                { "label": ["Then let's settle this."], "to": "remember_fight" },
                { "label": ["I'm leaving."] },
            ])),
            "remember_fight": { "type": "remember", "memory": "fighting", "next": "copy" },
            "copy": {
                "type": "spawn_npcs",
                "npc": "gambler_hostile",
                "count": 1,
                "near": "owner",
                "shown": "subject",
            },
    })
}

fn hunting() -> Value {
    json!({
        "runs_on": "npc",
        "locals": { "target": "actor" },
        "nodes": {
            "spawned": { "type": "on", "event": "started", "next": "hostile" },
            "hostile": { "type": "set_attitude", "attitude": "hostile", "next": "look" },
            "look": {
                "type": "set",
                "values": [{
                    "local": "target",
                    "to": { "type": "nearest", "among": "characters", "within": 10.0 },
                }],
                "next": "found",
            },
            "found": {
                "type": "if",
                "test": { "type": "present", "actor": { "type": "local", "local": "target" } },
                "yes": "fight",
                "no": "tick",
            },
            "fight": {
                "type": "attack",
                "target": { "type": "local", "local": "target" },
                "within": 10.0,
                "priority": 5,
                "defeated": "look",
                "lost": "look",
                "interrupted": "look",
            },
            "tick": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "look" },
        },
    })
}

fn memory_row(resets: &str) -> Value {
    json!({ "label": "remembered", "type": "boolean", "resets": resets })
}

fn all_of(sim: &mut Sim, key: &str) -> Vec<Entity> {
    let def = sim.id::<NpcDef>(key);
    sim.world
        .query::<(Entity, &Npc)>()
        .iter(&sim.world)
        .filter(|(_, npc)| npc.def == def)
        .map(|(entity, _)| entity)
        .collect()
}

fn remembered(sim: &Sim, player: Entity, key: &str) -> bool {
    let id = sim.id::<MemoryDef>(key);
    memory::get(&sim.world, player, id).truthy()
}

fn lose_at_dice(sim: &mut Sim, client: u32) {
    let mut node = sim.talk(client, "gambler").node;
    for _ in 0..40 {
        let roll = match node.as_str() {
            "hello" => "Roll the dice.",
            "loses" => "Roll again.",
            "wins" => return,
            other => panic!("the gambler is at {other:?}"),
        };
        node = sim.pick(client, roll).expect("still at the table").node;
    }
    panic!("never lost a roll");
}
