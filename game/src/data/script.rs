use crate::core::script::{
    Assignment, Expr, Node, OwnerKind, Target, ValueType, Variable, VariableType,
};
use crate::systems::area::warp::Warp;
use crate::systems::combat::Attitude;
use crate::systems::npc::body::{Attack, Wander};
use crate::systems::npc::summon::SetAttitude;
use crate::systems::script::query::Among;
use crate::systems::script::{Condition, Fill, RiftEffect, RiftEvent, RiftQuery, ScriptDef, Who};

const AGGRO: Condition = Expr::Var("aggro");
const TARGET: Condition = Expr::Local("target");
const LEASH: Condition = Expr::Int(3);

crate::table! {
    Warp: ScriptDef {
        owner: OwnerKind::Object,
        variables: &[("to", Variable { ty: VariableType::Place, default: None })],
        state: &[],
        locals: &[],
        nodes: &[
            ("entered", Node::On { event: RiftEvent::Entered { by: Who::Characters }, next: Some("warp") }),
            ("warp", Node::Effect(RiftEffect::Warp(Warp { who: None, to: Fill::Var("to"), next: None }))),
        ],
    },
    IdleStroll: ScriptDef {
        owner: OwnerKind::Npc,
        variables: &[],
        state: &[],
        locals: &[],
        nodes: &[
            ("spawned", Node::On { event: RiftEvent::Started, next: Some("roll") }),
            ("roll", Node::Random { weights: &[1, 1, 1, 1, 1, 1], outputs: &[Some("rest_1"), Some("rest_2"), Some("rest_3"), Some("rest_4"), Some("rest_5"), Some("rest_6")] }),
            ("rest_1", Node::Wait { seconds: Expr::Int(1), at_most: 1.0, next: Some("roam") }),
            ("rest_2", Node::Wait { seconds: Expr::Int(2), at_most: 2.0, next: Some("roam") }),
            ("rest_3", Node::Wait { seconds: Expr::Int(3), at_most: 3.0, next: Some("roam") }),
            ("rest_4", Node::Wait { seconds: Expr::Int(4), at_most: 4.0, next: Some("roam") }),
            ("rest_5", Node::Wait { seconds: Expr::Int(5), at_most: 5.0, next: Some("roam") }),
            ("rest_6", Node::Wait { seconds: Expr::Int(6), at_most: 6.0, next: Some("roam") }),
            ("roam", Node::Effect(RiftEffect::Wander(Wander { leash: Some(&LEASH), priority: 1, next: Some("roll") }))),
        ],
    },
    CombatPacifist: ScriptDef {
        owner: OwnerKind::Npc,
        variables: &[],
        state: &[],
        locals: &[],
        nodes: &[
            ("spawned", Node::On { event: RiftEvent::Started, next: Some("hostile") }),
            ("hostile", Node::Effect(RiftEffect::SetAttitude(SetAttitude { attitude: Attitude::Hostile, next: Some("roll") }))),
            ("roll", Node::Random { weights: &[40, 60], outputs: &[Some("roam"), Some("tick")] }),
            ("roam", Node::Effect(RiftEffect::Wander(Wander { leash: None, priority: 1, next: Some("tick") }))),
            ("tick", Node::Wait { seconds: Expr::Int(0), at_most: 1.0, next: Some("roll") }),
        ],
    },
    CombatDefensive: ScriptDef {
        owner: OwnerKind::Npc,
        variables: &[("aggro", Variable { ty: VariableType::Number, default: None })],
        state: &[],
        locals: &[("target", ValueType::Actor)],
        nodes: &[
            ("spawned", Node::On { event: RiftEvent::Started, next: Some("hostile") }),
            ("hostile", Node::Effect(RiftEffect::SetAttitude(SetAttitude { attitude: Attitude::Hostile, next: Some("look") }))),
            ("look", Node::Set {
                values: &[Assignment {
                    target: Target::Local("target"),
                    to: Expr::Query(RiftQuery::Nearest { among: Among::Attackers, npc: None, within: &AGGRO }),
                }],
                next: Some("found"),
            }),
            ("found", Node::If { test: Expr::Query(RiftQuery::Present { actor: &TARGET }), yes: Some("fight"), no: Some("roam") }),
            ("fight", Node::Effect(RiftEffect::Attack(Attack {
                target: &TARGET,
                within: &AGGRO,
                priority: 5,
                defeated: Some("look"),
                lost: Some("look"),
                interrupted: Some("look"),
            }))),
            ("roam", Node::Effect(RiftEffect::Wander(Wander { leash: None, priority: 1, next: Some("tick") }))),
            ("tick", Node::Wait { seconds: Expr::Int(0), at_most: 1.0, next: Some("look") }),
        ],
    },
    CombatAggressive: ScriptDef {
        owner: OwnerKind::Npc,
        variables: &[("aggro", Variable { ty: VariableType::Number, default: None })],
        state: &[],
        locals: &[("target", ValueType::Actor)],
        nodes: &[
            ("spawned", Node::On { event: RiftEvent::Started, next: Some("hostile") }),
            ("hostile", Node::Effect(RiftEffect::SetAttitude(SetAttitude { attitude: Attitude::Hostile, next: Some("look") }))),
            ("look", Node::Set {
                values: &[Assignment {
                    target: Target::Local("target"),
                    to: Expr::Query(RiftQuery::Nearest { among: Among::Characters, npc: None, within: &AGGRO }),
                }],
                next: Some("found"),
            }),
            ("found", Node::If { test: Expr::Query(RiftQuery::Present { actor: &TARGET }), yes: Some("fight"), no: Some("roam") }),
            ("fight", Node::Effect(RiftEffect::Attack(Attack {
                target: &TARGET,
                within: &AGGRO,
                priority: 5,
                defeated: Some("look"),
                lost: Some("look"),
                interrupted: Some("look"),
            }))),
            ("roam", Node::Effect(RiftEffect::Wander(Wander { leash: None, priority: 1, next: Some("tick") }))),
            ("tick", Node::Wait { seconds: Expr::Int(0), at_most: 1.0, next: Some("look") }),
        ],
    },
    CombatProtective: ScriptDef {
        owner: OwnerKind::Npc,
        variables: &[("aggro", Variable { ty: VariableType::Number, default: None })],
        state: &[],
        locals: &[("target", ValueType::Actor)],
        nodes: &[
            ("spawned", Node::On { event: RiftEvent::Started, next: Some("hostile") }),
            ("hostile", Node::Effect(RiftEffect::SetAttitude(SetAttitude { attitude: Attitude::Hostile, next: Some("look") }))),
            ("look", Node::Set {
                values: &[Assignment {
                    target: Target::Local("target"),
                    to: Expr::Query(RiftQuery::Nearest { among: Among::PackAttackers, npc: None, within: &AGGRO }),
                }],
                next: Some("found"),
            }),
            ("found", Node::If { test: Expr::Query(RiftQuery::Present { actor: &TARGET }), yes: Some("fight"), no: Some("roam") }),
            ("fight", Node::Effect(RiftEffect::Attack(Attack {
                target: &TARGET,
                within: &AGGRO,
                priority: 5,
                defeated: Some("look"),
                lost: Some("look"),
                interrupted: Some("look"),
            }))),
            ("roam", Node::Effect(RiftEffect::Wander(Wander { leash: None, priority: 1, next: Some("tick") }))),
            ("tick", Node::Wait { seconds: Expr::Int(0), at_most: 1.0, next: Some("look") }),
        ],
    },
}
