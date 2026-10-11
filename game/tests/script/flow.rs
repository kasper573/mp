use std::sync::Arc;

use bevy_ecs::prelude::*;
use game::core::script::compile::compile_owner;
use game::core::script::{Expr, Owner, OwnerKind, ValueType};
use game::core::tiling::Tiles;
use game::data::item::Id as ItemId;
use game::data::memory::Id as MemoryId;
use game::data::notification::Id as NotificationId;
use game::data::npc::Id as NpcId;
use game::systems::dialogue::Conversation;
use game::systems::interact::Verb;
use game::systems::item::ItemStack;
use game::systems::item::effects::Items;
use game::systems::memory::Remember;
use game::systems::movement::{Position, position};
use game::systems::notification::Notify;
use game::systems::npc::body::{self, Act, Attack, Priority};
use game::systems::npc::summon::Despawn;
use game::systems::npc::{self, Pack};
use game::systems::script::{
    Condition, DialogueNode, EventKind, InlineScript, Line, Node, Procedure, RiftEffect, RiftEvent,
    RiftInstances, RiftQuery, ScriptModule, Speaker, Who, choice,
};
use game::systems::stat::effects::{Heal, HealBy};
use game::systems::stat::{self, StatKind};
use game::systems::text::{Span, plain};

use crate::support::{
    Sim, content, conversation, count, errors, give, later, leave, pick, remembered, row,
    spawn_area, spoken,
};

type Name = &'static str;

static TEN: Condition = Expr::Num(10.0);
static SUBJECT: Condition = Expr::Query(RiftQuery::Subject);
static NOBODY: Condition = Expr::Local("nobody");

fn spans(text: &'static str) -> &'static [Span] {
    Box::leak(vec![plain(text)].into_boxed_slice())
}

fn narrator(text: &'static str) -> &'static [Line] {
    Box::leak(
        vec![Line {
            by: Speaker::Narrator,
            face: None,
            text: spans(text),
        }]
        .into_boxed_slice(),
    )
}

fn say(text: &'static str, choices: Vec<(&'static str, Option<Name>)>) -> Node {
    Node::Dialogue(DialogueNode {
        lines: narrator(text),
        choices: Box::leak(
            choices
                .into_iter()
                .map(|(label, to)| choice(spans(label), to))
                .collect::<Vec<_>>()
                .into_boxed_slice(),
        ),
        next: None,
        left: None,
    })
}

fn interacted(next: Name) -> (Name, Node) {
    (
        "interacted",
        Node::On {
            event: RiftEvent::Interacted {
                verb: Verb::Talk,
                reach: Tiles(2.0),
                marks: &[],
                news: false,
            },
            next: Some(next),
        },
    )
}

fn remember(key: &str, next: Option<Name>) -> Node {
    Node::Effect(RiftEffect::Remember(Remember {
        who: None,
        memory: row::<MemoryId>(key),
        to: None,
        next,
    }))
}

fn inline(locals: &'static [(Name, ValueType)], nodes: Vec<(Name, Node)>) -> ScriptModule {
    ScriptModule::Inline(InlineScript {
        state: &[],
        locals,
        nodes: Box::leak(nodes.into_boxed_slice()),
    })
}

fn compiled(modules: &[ScriptModule]) -> Vec<Arc<Procedure>> {
    compile_owner(content(), OwnerKind::Npc, "test/npc", modules).expect("compiles")
}

fn scripted_npc(sim: &mut Sim, beside: Entity, modules: &[ScriptModule]) -> (Entity, Owner) {
    let at = position(sim.world(), beside).expect("position");
    let spot = sim.walkable_near(at, Tiles(1.0), Tiles(1.5));
    let npc = npc::spawn(
        sim.world(),
        row::<NpcId>("Grisha"),
        spot,
        spawn_area(),
        Pack(u32::MAX),
    );
    let owner = Owner::Entity(OwnerKind::Npc, npc);
    let procedures = compiled(modules);
    let mut instances = sim.world().resource_mut::<RiftInstances>();
    instances.remove_owner(owner);
    instances.spawn_owner(owner, procedures);
    instances.raise(owner, EventKind::Started, None, Vec::new(), |_| true);
    sim.tick();
    (npc, owner)
}

fn raise(sim: &mut Sim, owner: Owner, kind: EventKind, subject: Entity) {
    sim.world().resource_mut::<RiftInstances>().raise(
        owner,
        kind,
        Some(subject),
        Vec::new(),
        |_| true,
    );
}

fn health(sim: &mut Sim, who: Entity) -> f32 {
    stat::effective(sim.world(), who, StatKind::Health)
}

fn notified(sim: &Sim, client: u32, ids: &[NotificationId]) -> Vec<NotificationId> {
    sim.notified(client)
        .into_iter()
        .filter_map(|sent| {
            ids.iter()
                .copied()
                .find(|id| sent.notification.text == spoken(*id).text)
        })
        .collect()
}

#[test]
fn a_wait_pauses_the_flow_and_an_effect_takes_the_output_it_earns() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let gold: ItemId = row("Gold");
    let script = inline(
        &[],
        vec![
            interacted("wait"),
            (
                "wait",
                Node::Wait {
                    seconds: Expr::Int(1),
                    at_most: 5.0,
                    next: Some("hello"),
                },
            ),
            ("hello", say("Pay up.", vec![("Pay.", Some("pay"))])),
            (
                "pay",
                Node::Effect(RiftEffect::Items(Items {
                    who: None,
                    take: Box::leak(vec![ItemStack::new(gold, 5)].into_boxed_slice()),
                    give: &[],
                    done: Some("paid"),
                    refused: Some("broke"),
                })),
            ),
            ("paid", say("Thanks.", vec![("Bye.", None)])),
            ("broke", say("No coin?", vec![("Bye.", None)])),
        ],
    );
    let (_, owner) = scripted_npc(&mut sim, player, &[script]);

    raise(&mut sim, owner, EventKind::Interacted, player);
    assert!(!sim.run_until(0.5, |world| world.get::<Conversation>(player).is_some()));
    assert!(sim.run_until(1.0, |world| world.get::<Conversation>(player).is_some()));
    assert_eq!(
        conversation(&mut sim, player).map(|now| now.node),
        Some("hello".to_owned())
    );

    let broke = pick(&mut sim, 1, player, "Pay.").expect("talking");
    assert_eq!(broke.node, "broke");
    leave(&mut sim, 1, player);

    give(&mut sim, player, gold, 5);
    raise(&mut sim, owner, EventKind::Interacted, player);
    assert!(sim.run_until(2.0, |world| world.get::<Conversation>(player).is_some()));
    let paid = pick(&mut sim, 1, player, "Pay.").expect("talking");
    assert_eq!(paid.node, "paid");
    assert_eq!(count(&mut sim, player, gold), 0);
}

#[test]
fn flows_run_in_the_order_their_events_were_raised() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let gulls: NotificationId = row("Gulls");
    let sails: NotificationId = row("GullSails");
    let script = inline(
        &[],
        vec![
            interacted("first"),
            (
                "first",
                Node::Effect(RiftEffect::Notify(Notify {
                    who: None,
                    notification: gulls,
                    next: None,
                })),
            ),
            (
                "came_near",
                Node::On {
                    event: RiftEvent::CameNear {
                        within: Tiles(3.0),
                        by: Who::Characters,
                        npc: None,
                    },
                    next: Some("second"),
                },
            ),
            (
                "second",
                Node::Effect(RiftEffect::Notify(Notify {
                    who: None,
                    notification: sails,
                    next: None,
                })),
            ),
        ],
    );
    let (_, owner) = scripted_npc(&mut sim, player, &[script]);
    sim.forget_notified();

    raise(&mut sim, owner, EventKind::Interacted, player);
    raise(&mut sim, owner, EventKind::CameNear, player);
    sim.tick();
    assert_eq!(notified(&sim, 1, &[gulls, sails]), vec![gulls, sails]);

    sim.forget_notified();
    later(&mut sim, 61.0);
    raise(&mut sim, owner, EventKind::CameNear, player);
    raise(&mut sim, owner, EventKind::Interacted, player);
    sim.tick();
    assert_eq!(notified(&sim, 1, &[gulls, sails]), vec![sails, gulls]);
}

#[test]
fn a_lower_priority_act_waits_while_an_equal_one_interrupts() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let script = inline(
        &[],
        vec![
            interacted("attack"),
            (
                "attack",
                Node::Effect(RiftEffect::Attack(Attack {
                    target: &SUBJECT,
                    within: &TEN,
                    priority: 5,
                    defeated: None,
                    lost: Some("lost"),
                    interrupted: Some("stopped"),
                })),
            ),
            ("stopped", remember("BribedIlsa", None)),
            ("lost", remember("SidedWithOrcs", None)),
        ],
    );
    let (npc, owner) = scripted_npc(&mut sim, player, &[script]);
    let full = health(&mut sim, player);

    raise(&mut sim, owner, EventKind::Interacted, player);
    assert!(sim.run_until(5.0, |world| {
        stat::effective(world, player, StatKind::Health) < full
    }));
    assert_eq!(body::target(sim.world(), npc), Some(player));

    body::order(
        sim.world(),
        npc,
        Act::Wander { leash: None },
        Priority(1),
        None,
    );
    let hurt = health(&mut sim, player);
    assert!(sim.run_until(5.0, |world| {
        stat::effective(world, player, StatKind::Health) < hurt
    }));
    assert_eq!(body::target(sim.world(), npc), Some(player));
    assert!(!remembered(&mut sim, player, row("BribedIlsa")));

    body::order(sim.world(), npc, Act::Stop, Priority(5), None);
    sim.tick();
    assert!(remembered(&mut sim, player, row("BribedIlsa")));
    assert_eq!(body::target(sim.world(), npc), None);
    assert!(!remembered(&mut sim, player, row("SidedWithOrcs")));
}

#[test]
fn an_attack_loses_a_target_that_leaves_its_range() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let script = inline(
        &[],
        vec![
            interacted("attack"),
            (
                "attack",
                Node::Effect(RiftEffect::Attack(Attack {
                    target: &SUBJECT,
                    within: &TEN,
                    priority: 5,
                    defeated: None,
                    lost: Some("lost"),
                    interrupted: None,
                })),
            ),
            ("lost", remember("SidedWithOrcs", None)),
        ],
    );
    let (npc, owner) = scripted_npc(&mut sim, player, &[script]);

    raise(&mut sim, owner, EventKind::Interacted, player);
    assert!(sim.run_until(5.0, |world| body::target(world, npc) == Some(player)));

    let here = position(sim.world(), player).expect("position");
    let far = sim.walkable_near(here, Tiles(14.0), Tiles(30.0));
    sim.world().entity_mut(player).insert(Position { pos: far });
    assert!(sim.run_until(5.0, |world| body::target(world, npc).is_none()));
    sim.tick();
    assert!(remembered(&mut sim, player, row("SidedWithOrcs")));
}

#[test]
fn a_capability_aimed_at_nobody_takes_refused_or_tells_the_subject_why() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let gold: ItemId = row("Gold");
    let script = inline(
        &[("nobody", ValueType::Actor)],
        vec![
            interacted("give"),
            (
                "give",
                Node::Effect(RiftEffect::Items(Items {
                    who: Some(&NOBODY),
                    take: &[],
                    give: Box::leak(vec![ItemStack::new(gold, 1)].into_boxed_slice()),
                    done: Some("gave"),
                    refused: Some("refused"),
                })),
            ),
            ("gave", remember("SidedWithOrcs", None)),
            ("refused", remember("BribedIlsa", Some("heal"))),
            (
                "heal",
                Node::Effect(RiftEffect::Heal(Heal {
                    who: Some(&NOBODY),
                    by: HealBy::Full,
                    next: Some("despawn"),
                })),
            ),
            (
                "despawn",
                Node::Effect(RiftEffect::Despawn(Despawn {
                    who: Some(&NOBODY),
                    done: Some("gone"),
                    refused: None,
                })),
            ),
            ("gone", remember("TideChestLooted", None)),
        ],
    );
    let (_, owner) = scripted_npc(&mut sim, player, &[script]);
    stat::apply_damage(sim.world(), player, 1.0);

    raise(&mut sim, owner, EventKind::Interacted, player);
    sim.tick();

    assert!(remembered(&mut sim, player, row("BribedIlsa")));
    assert!(!remembered(&mut sim, player, row("SidedWithOrcs")));
    assert!(!remembered(&mut sim, player, row("TideChestLooted")));
    assert_eq!(count(&mut sim, player, gold), 0);
    assert_eq!(errors(&sim, 1).len(), 1);
    assert!(
        errors(&sim, 1)[0].contains("Nobody"),
        "{:?}",
        errors(&sim, 1)
    );
}

#[test]
fn an_npc_can_be_the_subject_of_a_flow() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let script = inline(
        &[],
        vec![
            (
                "came_near",
                Node::On {
                    event: RiftEvent::CameNear {
                        within: Tiles(3.0),
                        by: Who::Npcs,
                        npc: None,
                    },
                    next: Some("heal"),
                },
            ),
            (
                "heal",
                Node::Effect(RiftEffect::Heal(Heal {
                    who: None,
                    by: HealBy::Full,
                    next: None,
                })),
            ),
        ],
    );
    let (_, healer) = scripted_npc(&mut sim, player, &[script]);
    let here = position(sim.world(), player).expect("position");
    let spot = sim.walkable_near(here, Tiles(1.0), Tiles(2.0));
    let patient = npc::spawn(
        sim.world(),
        row::<NpcId>("Orc"),
        spot,
        spawn_area(),
        Pack(u32::MAX),
    );
    sim.tick();
    let full = health(&mut sim, patient);
    stat::apply_damage(sim.world(), patient, 3.0);
    assert!(health(&mut sim, patient) < full);

    raise(&mut sim, healer, EventKind::CameNear, patient);
    sim.tick();

    assert_eq!(health(&mut sim, patient), full);
}
