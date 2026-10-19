use std::sync::Arc;

use engine::core::content::{Content, ContentId, ContentRow};
use engine::core::math::Pos;
use engine::core::script::compile::compile_owner;
use engine::core::script::{EffectDef, Expr, ScriptError};
use engine::systems::area::AreaDef;
use engine::systems::item::ItemDef;
use engine::systems::memory::MemoryDef;
use engine::systems::quest::QuestDef;
use engine::systems::script::{
    EventKind, Place, Procedure, Reach, RiftScripting, RunnerKind, ScriptDef, ScriptModule,
};
use engine::systems::shop::ShopDef;
use serde_json::{Value, json};

use crate::game::{content, game, module, parse, parse_in};

const OWNERS: [RunnerKind; 6] = [
    RunnerKind::Object,
    RunnerKind::Npc,
    RunnerKind::Item,
    RunnerKind::Area,
    RunnerKind::Quest,
    RunnerKind::Shop,
];

#[test]
fn every_capability_compiles_for_exactly_the_owners_it_lists() {
    let capabilities = every_capability();
    assert_eq!(capabilities.len(), 38);
    for owner in OWNERS {
        for value in &capabilities {
            let content = game()
                .row(
                    "script",
                    "probe",
                    json!({
                        "runs_on": owner,
                        "nodes": { "on": entry(owner, "do"), "do": value },
                    }),
                )
                .load();
            let parsed: engine::systems::script::RiftEffect = parse_in(&content, value.clone());
            let kind = parsed.kind().name();
            let allowed = parsed.owners().contains(&owner);
            let script: ScriptModule = parse_in(&content, json!({ "script": "probe" }));
            let compiled = compile_in(&content, owner, &[&script]);
            assert_eq!(
                compiled.is_ok(),
                allowed,
                "{kind} for {owner:?}: {:?}",
                compiled.err().map(|error| error.to_string())
            );
        }
    }
}

#[test]
fn may_do_lists_exactly_what_a_script_reaches() {
    let gold = id::<ItemDef>("gold");
    let pass = id::<ItemDef>("pass");
    let bribed = id::<MemoryDef>("bribed");
    let honesty_box = id::<ShopDef>("box");
    let place = Place {
        area: id::<AreaDef>("forest"),
        at: Pos::new(3.0, 18.0),
    };

    let procedures = compile(RunnerKind::Npc, &[&module("compile_may_do")]).expect("compiles");
    let may_do = &procedures[0].may_do;

    assert_eq!(may_do.answers, vec![EventKind::Interacted]);
    assert_eq!(may_do.dialogue, vec!["hello"]);
    assert!(may_do.calls.is_empty());
    assert!(may_do.waits);
    let expected = [
        Reach::Takes(gold),
        Reach::Gives(pass),
        Reach::Warp(place),
        Reach::Remembers(bribed),
        Reach::OpensShop(honesty_box),
    ];
    assert_eq!(may_do.reaches.len(), expected.len(), "{:?}", may_do.reaches);
    for reach in expected {
        assert!(may_do.reaches.contains(&reach), "{reach:?} missing");
    }
}

#[test]
fn a_loop_without_a_wait_is_refused() {
    let error = compile(RunnerKind::Npc, &[&module("compile_loop")])
        .err()
        .expect("refused");

    assert_eq!(error.rule, "loop without a wait");
    assert_eq!(error.expected, "a → b → a");
}

#[test]
fn too_many_steps_between_pauses_are_refused() {
    let error = compile(RunnerKind::Npc, &[&module("compile_too_many")])
        .err()
        .expect("refused");

    assert_eq!(error.rule, "too many steps");
}

#[test]
fn a_decision_reaches_as_deciding_a_path_not_completing_a_task() {
    let procedures = compile(RunnerKind::Npc, &[&module("compile_decision")]).expect("compiles");
    let reaches = &procedures[0].may_do.reaches;

    assert!(
        reaches.contains(&Reach::Decides(id::<QuestDef>("plea"))),
        "{reaches:?}"
    );
    assert!(
        !reaches.contains(&Reach::Completes(id::<QuestDef>("plea"))),
        "{reaches:?}"
    );
}

#[test]
fn an_effect_or_query_refuses_by_its_own_rule() {
    for key in ["compile_effect", "compile_query"] {
        let error = compile(RunnerKind::Npc, &[&module(key)])
            .err()
            .expect("refused");

        assert_eq!(error.rule, "unknown task");
        assert_eq!(error.node.as_deref(), Some("a"));
    }
}

#[test]
fn a_script_that_runs_itself_is_refused() {
    let error = compile(RunnerKind::Npc, &[&module("calls_loops")])
        .err()
        .expect("refused");

    assert_eq!(error.rule, "runs itself");
    assert!(error.expected.contains("loops"), "{}", error.expected);
}

#[test]
fn may_do_names_the_functions_a_script_calls() {
    let procedures = compile(RunnerKind::Npc, &[&module("calls_helper")]).expect("compiles");

    let may_do = &procedures[0].may_do;
    assert_eq!(may_do.calls, vec!["helper".to_owned()]);
    assert_eq!(may_do.answers, vec![EventKind::Started]);
    assert!(may_do.reaches.is_empty());
    assert!(!may_do.waits);
}

#[test]
fn an_if_always_taken_still_compiles_both_arrows() {
    let procedures = compile(RunnerKind::Area, &[&module("compile_if_taken")]).expect("compiles");

    assert_eq!(procedures[0].may_do.reaches.len(), 2);
}

#[test]
fn every_expression_shape_serializes_back_to_the_json_it_was_read_from() {
    let shapes = json!([
        true,
        3,
        2.5,
        "text",
        { "var": "aggro" },
        { "type": "local", "local": "target" },
        { "type": "state", "state": "count" },
        { "type": "event", "event": "started" },
        { "type": "all", "of": [true, { "type": "not", "of": false }] },
        { "type": "any", "of": [false] },
        { "type": "join", "of": ["a", "b"] },
        { "type": "round", "of": 2.5 },
        { "type": "not_equal", "a": { "var": "aggro" }, "b": 4 },
        { "type": "at_least", "a": { "var": "aggro" }, "b": 4 },
        { "type": "divide", "a": 9, "b": 3 }
    ]);
    for shape in shapes.as_array().expect("a list") {
        let expr: Expr<RiftScripting> = parse(shape.clone());
        assert_eq!(serde_json::to_value(&expr).expect("json"), *shape);
    }
}

#[test]
fn a_script_row_reads_back_as_written() {
    let def: ScriptDef = parse(json!({
        "runs_on": "npc",
        "variables": { "aggro": { "type": "number", "default": 4 } },
        "locals": { "target": "actor" },
        "nodes": {
            "spawned": { "type": "on", "event": "started", "next": "look" },
            "look": {
                "type": "set",
                "values": [{ "local": "target", "to": { "type": "nearest", "among": "characters", "within": { "var": "aggro" } } }]
            }
        }
    }));

    assert_eq!(def.runs_on, RunnerKind::Npc);
    assert_eq!(def.variables.len(), 1);
    assert_eq!(def.nodes.len(), 2);
}

#[test]
fn a_trade_field_reads_where_every_entry_reaching_the_node_raises_it() {
    compile(RunnerKind::Shop, &[&module("compile_trade_field")]).expect("compiles");
}

#[test]
fn an_event_field_is_refused_where_the_entry_reaching_it_raises_no_fields() {
    let error = compile(RunnerKind::Object, &[&module("compile_event_field")])
        .err()
        .expect("refused");

    assert_eq!(error.rule, "unknown field");
}

fn id<Row: ContentRow>(key: &str) -> ContentId<Row> {
    content()
        .by_key::<Row>(key)
        .expect("a row of the test game")
}

fn compile(
    owner: RunnerKind,
    modules: &[&ScriptModule],
) -> Result<Vec<Arc<Procedure>>, ScriptError> {
    compile_in(content(), owner, modules)
}

fn compile_in(
    content: &Content,
    owner: RunnerKind,
    modules: &[&ScriptModule],
) -> Result<Vec<Arc<Procedure>>, ScriptError> {
    compile_owner(content, owner, "test", modules).map_err(|mut errors| errors.remove(0).error)
}

fn entry(owner: RunnerKind, next: &str) -> Value {
    match owner {
        RunnerKind::Object | RunnerKind::Npc => json!({
            "type": "on", "event": "interacted", "verb": "talk", "reach": 2.0, "next": next
        }),
        RunnerKind::Item | RunnerKind::Skill => {
            json!({ "type": "on", "event": "used", "next": next })
        }
        RunnerKind::Area => json!({ "type": "on", "event": "discovered", "next": next }),
        RunnerKind::Quest => json!({ "type": "on", "event": "accepted", "next": next }),
        RunnerKind::Shop => json!({ "type": "on", "event": "bought", "next": next }),
        RunnerKind::StatusEffect => json!({ "type": "on", "event": "activated", "next": next }),
        RunnerKind::Blueprint | RunnerKind::Any => unreachable!("no entry for {owner:?}"),
    }
}

fn every_capability() -> Vec<Value> {
    vec![
        json!({ "type": "warp", "to": { "area": "forest", "x": 3.0, "y": 18.0 } }),
        json!({ "type": "heal", "by": "full" }),
        json!({ "type": "damage", "by": 10.0 }),
        json!({ "type": "apply_status", "effect": "guarded", "power": 10.0, "seconds": 10.0 }),
        json!({ "type": "remove_status", "category": "debuff" }),
        json!({ "type": "items", "take": [{ "item": "gold" }] }),
        json!({ "type": "use_item", "item": "map" }),
        json!({ "type": "equip", "item": "pass" }),
        json!({ "type": "unequip", "slot": "weapon" }),
        json!({ "type": "drop_items", "item": "gold", "count": 1 }),
        json!({ "type": "spawn_ground_items", "items": [{ "item": "gold" }], "for": "subject" }),
        json!({ "type": "clear_ground_items", "within": 10.0 }),
        json!({
            "type": "move_items", "from": { "type": "subject" }, "to": { "type": "subject" },
            "items": [{ "item": "gold" }]
        }),
        json!({ "type": "grant_xp", "xp": 1 }),
        json!({ "type": "remember", "memory": "bribed" }),
        json!({ "type": "forget", "memories": ["bribed"] }),
        json!({ "type": "offer_quest", "quest": "x_marks" }),
        json!({ "type": "accept_quest", "quest": "x_marks" }),
        json!({ "type": "turn_in", "quest": "x_marks" }),
        json!({ "type": "fail_quest", "quest": "x_marks" }),
        json!({ "type": "complete_task", "quest": "x_marks", "task": "find_stone" }),
        json!({ "type": "decide", "quest": "plea", "path": "Keep them" }),
        json!({ "type": "open_shop", "shop": "box" }),
        json!({ "type": "notify", "notification": "gulls" }),
        json!({ "type": "say", "text": ["Hm."] }),
        json!({ "type": "wander", "priority": 1 }),
        json!({ "type": "walk_to", "to": { "type": "subject" }, "within": 1, "priority": 3 }),
        json!({ "type": "attack", "target": { "type": "subject" }, "within": 10.0, "priority": 5 }),
        json!({ "type": "stop", "priority": 9 }),
        json!({ "type": "face", "toward": { "type": "subject" } }),
        json!({ "type": "animate", "action": "attack", "wait": "apex" }),
        json!({ "type": "use_skill", "skill": "strike", "at": { "type": "subject" } }),
        json!({ "type": "reset_skills" }),
        json!({ "type": "vfx", "vfx": "damage_taken" }),
        json!({ "type": "set_attitude", "attitude": "hostile" }),
        json!({ "type": "spawn_npcs", "npc": "fighter", "count": 1, "near": "subject", "shown": "everyone" }),
        json!({ "type": "despawn" }),
        json!({ "type": "play_sound", "sfx": "ui_pick", "for": "subject" }),
    ]
}

pub fn scripts() -> Vec<(&'static str, Value)> {
    vec![
        (
            "compile_may_do",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "hello"),
                    "hello": {
                        "type": "dialogue",
                        "lines": [{ "by": { "type": "narrator" }, "text": ["Pay or go."] }],
                        "choices": [
                            { "label": ["Pay."], "to": "pay" },
                            { "label": ["Go."], "to": "go" }
                        ]
                    },
                    "pay": {
                        "type": "items",
                        "take": [{ "item": "gold", "count": 5 }],
                        "give": [{ "item": "pass" }],
                        "done": "warp"
                    },
                    "warp": { "type": "warp", "to": { "area": "forest", "x": 3.0, "y": 18.0 } },
                    "go": { "type": "wait", "seconds": 1, "at_most": 5.0, "next": "mark" },
                    "mark": { "type": "remember", "memory": "bribed", "next": "shop" },
                    "shop": { "type": "open_shop", "shop": "box" },
                },
            }),
        ),
        (
            "compile_loop",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "a"),
                    "a": { "type": "if", "test": true, "yes": "b" },
                    "b": { "type": "if", "test": true, "yes": "a" },
                },
            }),
        ),
        (
            "compile_too_many",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "outer"),
                    "outer": { "type": "repeat", "times": 1000, "at_most": 1000, "each": "inner" },
                    "inner": { "type": "repeat", "times": 1000, "at_most": 1000, "each": "check" },
                    "check": { "type": "if", "test": true },
                },
            }),
        ),
        (
            "compile_decision",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "decide"),
                    "decide": {
                        "type": "decide",
                        "quest": "plea",
                        "path": "Keep them",
                    },
                },
            }),
        ),
        (
            "compile_effect",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "a"),
                    "a": { "type": "complete_task", "quest": "x_marks", "task": "no_such_task" },
                },
            }),
        ),
        (
            "compile_query",
            json!({
                "runs_on": "npc",
                "nodes": {
                    "on": entry(RunnerKind::Npc, "a"),
                    "a": {
                        "type": "if",
                        "test": { "type": "task_done", "quest": "x_marks", "task": "no_such_task" },
                    },
                },
            }),
        ),
        (
            "compile_if_taken",
            json!({
                "runs_on": "area",
                "nodes": {
                    "on": entry(RunnerKind::Area, "check"),
                    "check": { "type": "if", "test": { "type": "not", "of": true }, "yes": "yes", "no": "no" },
                    "yes": { "type": "notify", "notification": "gulls" },
                    "no": { "type": "notify", "notification": "intro" },
                },
            }),
        ),
        (
            "compile_trade_field",
            json!({
                "runs_on": "shop",
                "locals": { "price": "integer" },
                "nodes": {
                    "on": { "type": "on", "event": "bought", "next": "read" },
                    "read": { "type": "set", "values": [{ "local": "price", "to": { "type": "event", "event": "count" } }], "next": "check" },
                    "check": { "type": "if", "test": { "type": "more", "a": { "type": "local", "local": "price" }, "b": 0 } },
                },
            }),
        ),
        (
            "compile_event_field",
            json!({
                "runs_on": "object",
                "locals": { "price": "integer" },
                "nodes": {
                    "on": { "type": "on", "event": "started", "next": "read" },
                    "read": { "type": "set", "values": [{ "local": "price", "to": { "type": "event", "event": "count" } }], "next": "check" },
                    "check": { "type": "if", "test": { "type": "more", "a": { "type": "local", "local": "price" }, "b": 0 } },
                },
            }),
        ),
        (
            "helper",
            json!({
                "runs_on": "any",
                "nodes": {
                    "run": { "type": "on", "event": "run", "next": "done" },
                    "done": { "type": "return" }
                }
            }),
        ),
        (
            "loops",
            json!({
                "runs_on": "any",
                "nodes": {
                    "run": { "type": "on", "event": "run", "next": "again" },
                    "again": { "type": "run", "script": "loops" }
                }
            }),
        ),
        ("calls_helper", calling("helper")),
        ("calls_loops", calling("loops")),
    ]
}

fn calling(script: &str) -> Value {
    json!({
        "runs_on": "npc",
        "nodes": {
            "on": { "type": "on", "event": "started", "next": "call" },
            "call": { "type": "run", "script": script }
        }
    })
}
