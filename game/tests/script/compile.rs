use std::sync::Arc;

use game::core::audio::playback::SfxId;
use game::core::content::{ContentBuilder, ContentId};
use game::core::math::Pos;
use game::core::script::compile::compile_owner;
use game::core::script::{EffectDef, Expr, OwnerKind, ScriptError};
use game::core::tiling::Tiles;
use game::data::area::Id as AreaId;
use game::data::item::Id as ItemId;
use game::data::job::Id as JobId;
use game::data::memory::Id as MemoryId;
use game::data::notification::Id as NotificationId;
use game::data::npc::Id as NpcId;
use game::data::quest::Id as QuestId;
use game::data::shop::Id as ShopId;
use game::systems::area::warp::Warp;
use game::systems::chat::Say;
use game::systems::combat::Attitude;
use game::systems::equipment::EquipmentSlot;
use game::systems::interact::Verb;
use game::systems::item::ItemStack;
use game::systems::item::effects::{
    ClearGroundItems, DropItems, Equip, Items, MoveItems, SpawnGroundItems, Unequip, UseItem,
};
use game::systems::job::{GrantXp, SetJob};
use game::systems::memory::{Forget, Remember};
use game::systems::notification::Notify;
use game::systems::npc::body::{Attack, Face, FaceTarget, Stop, WalkTarget, WalkTo, Wander};
use game::systems::npc::summon::{Despawn, SetAttitude, ShownFor, SpawnNear, SpawnNpcs};
use game::systems::quest::effects::{
    AcceptQuest, CompleteTask, Decide, FailQuest, OfferQuest, TurnIn,
};
use game::systems::script::effect::PlaySound;
use game::systems::script::{
    Condition, DialogueNode, EventKind, Fill, InlineScript, Line, Node, Place, Procedure, Reach,
    RiftEffect, RiftEvent, RiftQuery, ScriptDef, ScriptModule, Speaker, choice,
};
use game::systems::shop::OpenShop;
use game::systems::stat::StatKind;
use game::systems::stat::effects::{Buff, ClearBuffs, Damage, Heal, HealBy};
use game::systems::text::{Span, plain};

use crate::support::{content, row};

type Name = &'static str;

static ONE: Condition = Expr::Int(1);
static TEN: Condition = Expr::Num(10.0);
static SUBJECT: Condition = Expr::Query(RiftQuery::Subject);
static ALWAYS: Condition = Expr::Bool(true);

const OWNERS: [OwnerKind; 6] = [
    OwnerKind::Object,
    OwnerKind::Npc,
    OwnerKind::Item,
    OwnerKind::Area,
    OwnerKind::Quest,
    OwnerKind::Shop,
];

fn spans(text: &'static str) -> &'static [Span] {
    Box::leak(vec![plain(text)].into_boxed_slice())
}

fn nodes(list: Vec<(Name, Node)>) -> &'static [(Name, Node)] {
    Box::leak(list.into_boxed_slice())
}

fn inline(nodes: &'static [(Name, Node)]) -> ScriptModule {
    ScriptModule::Inline(InlineScript {
        state: &[],
        locals: &[],
        nodes,
    })
}

fn compile(owner: OwnerKind, modules: &[ScriptModule]) -> Result<Vec<Arc<Procedure>>, ScriptError> {
    compile_owner(content(), owner, "test", modules)
}

fn entry(owner: OwnerKind) -> RiftEvent {
    match owner {
        OwnerKind::Object | OwnerKind::Npc => RiftEvent::Interacted {
            verb: Verb::Talk,
            reach: Tiles(2.0),
            marks: &[],
            news: false,
        },
        OwnerKind::Item => RiftEvent::Used,
        OwnerKind::Area => RiftEvent::Discovered,
        OwnerKind::Quest => RiftEvent::Accepted,
        OwnerKind::Shop => RiftEvent::Bought { item: None },
        OwnerKind::Blueprint | OwnerKind::Any => unreachable!("no entry for {owner:?}"),
    }
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

fn every_capability() -> Vec<RiftEffect> {
    let gold: ItemId = row("Gold");
    let pass: ItemId = row("RoadPass");
    let forest: AreaId = row("Forest");
    let place = Place {
        area: forest,
        at: Pos::new(3.0, 18.0),
    };
    let stacks: &'static [ItemStack] = Box::leak(vec![ItemStack::new(gold, 1)].into_boxed_slice());
    let memories: &'static [MemoryId] =
        Box::leak(vec![row::<MemoryId>("BribedIlsa")].into_boxed_slice());
    vec![
        RiftEffect::Warp(Warp {
            who: None,
            to: Fill::Const(place),
            next: None,
        }),
        RiftEffect::Heal(Heal {
            who: None,
            by: HealBy::Full,
            next: None,
        }),
        RiftEffect::Damage(Damage {
            who: None,
            by: &TEN,
            next: None,
        }),
        RiftEffect::Buff(Buff {
            who: None,
            stat: StatKind::Health,
            by: &TEN,
            seconds: &TEN,
            next: None,
        }),
        RiftEffect::ClearBuffs(ClearBuffs {
            who: None,
            next: None,
        }),
        RiftEffect::Items(Items {
            who: None,
            take: stacks,
            give: &[],
            done: None,
            refused: None,
        }),
        RiftEffect::UseItem(UseItem {
            who: None,
            item: row("TatteredMap"),
            used: None,
            refused: None,
        }),
        RiftEffect::Equip(Equip {
            who: None,
            item: pass,
            done: None,
            refused: None,
        }),
        RiftEffect::Unequip(Unequip {
            who: None,
            slot: EquipmentSlot::Weapon,
            done: None,
            refused: None,
        }),
        RiftEffect::DropItems(DropItems {
            who: None,
            item: gold,
            count: &ONE,
            done: None,
            refused: None,
        }),
        RiftEffect::SpawnGroundItems(SpawnGroundItems {
            items: stacks,
            at: None,
            for_subject: true,
            seconds: None,
            next: None,
        }),
        RiftEffect::ClearGroundItems(ClearGroundItems {
            at: None,
            within: &TEN,
            next: None,
        }),
        RiftEffect::MoveItems(MoveItems {
            from: &SUBJECT,
            to: &SUBJECT,
            items: stacks,
            done: None,
            refused: None,
        }),
        RiftEffect::GrantXp(GrantXp {
            who: None,
            xp: &ONE,
            next: None,
        }),
        RiftEffect::SetJob(SetJob {
            who: None,
            job: row::<JobId>("Adventurer"),
            next: None,
        }),
        RiftEffect::Remember(Remember {
            who: None,
            memory: memories[0],
            to: None,
            next: None,
        }),
        RiftEffect::Forget(Forget {
            who: None,
            memories,
            next: None,
        }),
        RiftEffect::OfferQuest(OfferQuest {
            who: None,
            quest: row::<QuestId>("XMarksTheSpot"),
            accepted: None,
            declined: None,
            refused: None,
        }),
        RiftEffect::AcceptQuest(AcceptQuest {
            who: None,
            quest: row::<QuestId>("XMarksTheSpot"),
            done: None,
            refused: None,
        }),
        RiftEffect::TurnIn(TurnIn {
            who: None,
            quest: row::<QuestId>("XMarksTheSpot"),
            done: None,
            refused: None,
            cancelled: None,
        }),
        RiftEffect::FailQuest(FailQuest {
            who: None,
            quest: row::<QuestId>("XMarksTheSpot"),
            next: None,
        }),
        RiftEffect::CompleteTask(CompleteTask {
            who: None,
            quest: row::<QuestId>("XMarksTheSpot"),
            task: "find_stone",
            next: None,
        }),
        RiftEffect::Decide(Decide {
            who: None,
            quest: row::<QuestId>("ShamansPlea"),
            path: "Keep them",
            next: None,
        }),
        RiftEffect::OpenShop(OpenShop {
            who: None,
            shop: row::<ShopId>("HonestyBox"),
            closed: None,
        }),
        RiftEffect::Notify(Notify {
            who: None,
            notification: row::<NotificationId>("Gulls"),
            next: None,
        }),
        RiftEffect::Say(Say {
            text: spans("Hm."),
            within: None,
            next: None,
        }),
        RiftEffect::Wander(Wander {
            leash: None,
            priority: 1,
            next: None,
        }),
        RiftEffect::WalkTo(WalkTo {
            to: WalkTarget::Actor(&SUBJECT),
            within: &ONE,
            priority: 3,
            arrived: None,
            blocked: None,
            interrupted: None,
        }),
        RiftEffect::Attack(Attack {
            target: &SUBJECT,
            within: &TEN,
            priority: 5,
            defeated: None,
            lost: None,
            interrupted: None,
        }),
        RiftEffect::Stop(Stop {
            priority: 9,
            next: None,
        }),
        RiftEffect::Face(Face {
            toward: FaceTarget::Actor(&SUBJECT),
            next: None,
        }),
        RiftEffect::SetAttitude(SetAttitude {
            attitude: Attitude::Hostile,
            next: None,
        }),
        RiftEffect::SpawnNpcs(SpawnNpcs {
            npc: row::<NpcId>("Orc"),
            count: 1,
            near: SpawnNear::Subject,
            shown: ShownFor::Everyone,
            next: None,
        }),
        RiftEffect::Despawn(Despawn {
            who: None,
            done: None,
            refused: None,
        }),
        RiftEffect::PlaySound(PlaySound {
            sfx: Fill::Const(row::<SfxId>("UiPick")),
            for_everyone: false,
            next: None,
        }),
    ]
}

#[test]
fn every_capability_compiles_for_exactly_the_owners_it_lists() {
    let kinds: Vec<&str> = every_capability().iter().map(RiftEffect::kind).collect();
    assert_eq!(kinds.len(), 35);
    for owner in OWNERS {
        for effect in every_capability() {
            let kind = effect.kind();
            let allowed = effect.owners().contains(&owner);
            let script = inline(nodes(vec![
                (
                    "on",
                    Node::On {
                        event: entry(owner),
                        next: Some("do"),
                    },
                ),
                ("do", Node::Effect(effect)),
            ]));
            let compiled = compile(owner, &[script]);
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
    let gold: ItemId = row("Gold");
    let pass: ItemId = row("RoadPass");
    let bribed: MemoryId = row("BribedIlsa");
    let honesty_box: ShopId = row("HonestyBox");
    let place = Place {
        area: row("Forest"),
        at: Pos::new(3.0, 18.0),
    };
    let script = inline(nodes(vec![
        (
            "on",
            Node::On {
                event: entry(OwnerKind::Npc),
                next: Some("hello"),
            },
        ),
        (
            "hello",
            Node::Dialogue(DialogueNode {
                lines: narrator("Pay or go."),
                choices: Box::leak(
                    vec![
                        choice(spans("Pay."), Some("pay")),
                        choice(spans("Go."), Some("go")),
                    ]
                    .into_boxed_slice(),
                ),
                next: None,
                left: None,
            }),
        ),
        (
            "pay",
            Node::Effect(RiftEffect::Items(Items {
                who: None,
                take: Box::leak(vec![ItemStack::new(gold, 5)].into_boxed_slice()),
                give: Box::leak(vec![ItemStack::new(pass, 1)].into_boxed_slice()),
                done: Some("warp"),
                refused: None,
            })),
        ),
        (
            "warp",
            Node::Effect(RiftEffect::Warp(Warp {
                who: None,
                to: Fill::Const(place),
                next: None,
            })),
        ),
        (
            "go",
            Node::Wait {
                seconds: Expr::Int(1),
                at_most: 5.0,
                next: Some("mark"),
            },
        ),
        (
            "mark",
            Node::Effect(RiftEffect::Remember(Remember {
                who: None,
                memory: bribed,
                to: None,
                next: Some("shop"),
            })),
        ),
        (
            "shop",
            Node::Effect(RiftEffect::OpenShop(OpenShop {
                who: None,
                shop: honesty_box,
                closed: None,
            })),
        ),
    ]));

    let procedures = compile(OwnerKind::Npc, &[script]).expect("compiles");
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
    let script = inline(nodes(vec![
        (
            "on",
            Node::On {
                event: entry(OwnerKind::Npc),
                next: Some("a"),
            },
        ),
        (
            "a",
            Node::If {
                test: Expr::Bool(true),
                yes: Some("b"),
                no: None,
            },
        ),
        (
            "b",
            Node::If {
                test: Expr::Bool(true),
                yes: Some("a"),
                no: None,
            },
        ),
    ]));

    let error = compile(OwnerKind::Npc, &[script]).err().expect("refused");

    assert_eq!(error.rule, "loop without a wait");
    assert_eq!(error.expected, "a → b → a");
}

#[test]
fn too_many_steps_between_pauses_are_refused() {
    let script = inline(nodes(vec![
        (
            "on",
            Node::On {
                event: entry(OwnerKind::Npc),
                next: Some("outer"),
            },
        ),
        (
            "outer",
            Node::Repeat {
                times: Expr::Int(1_000),
                at_most: 1_000,
                each: Some("inner"),
                then: None,
            },
        ),
        (
            "inner",
            Node::Repeat {
                times: Expr::Int(1_000),
                at_most: 1_000,
                each: Some("check"),
                then: None,
            },
        ),
        (
            "check",
            Node::If {
                test: Expr::Bool(true),
                yes: None,
                no: None,
            },
        ),
    ]));

    let error = compile(OwnerKind::Npc, &[script]).err().expect("refused");

    assert_eq!(error.rule, "too many steps");
}

const HELPER: ScriptId = ContentId::new(0);
const LOOPS: ScriptId = ContentId::new(1);
type ScriptId = game::systems::script::ScriptId;

const HELPER_DEF: ScriptDef = ScriptDef {
    owner: OwnerKind::Any,
    variables: &[],
    state: &[],
    locals: &[],
    nodes: &[
        (
            "run",
            Node::On {
                event: RiftEvent::Run,
                next: Some("done"),
            },
        ),
        ("done", Node::Return { value: None }),
    ],
};

const LOOPS_DEF: ScriptDef = ScriptDef {
    owner: OwnerKind::Any,
    variables: &[],
    state: &[],
    locals: &[],
    nodes: &[
        (
            "run",
            Node::On {
                event: RiftEvent::Run,
                next: Some("again"),
            },
        ),
        (
            "again",
            Node::Run {
                script: LOOPS,
                values: &[],
                into: None,
                next: None,
            },
        ),
    ],
};

fn functions() -> game::core::content::Content {
    let mut tables = ContentBuilder::default();
    tables.table::<ScriptDef>(vec![
        ("helper".to_owned(), HELPER_DEF),
        ("loops".to_owned(), LOOPS_DEF),
    ]);
    tables.build()
}

fn calling(script: ScriptId) -> ScriptModule {
    inline(nodes(vec![
        (
            "on",
            Node::On {
                event: RiftEvent::Started,
                next: Some("call"),
            },
        ),
        (
            "call",
            Node::Run {
                script,
                values: &[],
                into: None,
                next: None,
            },
        ),
    ]))
}

#[test]
fn a_script_that_runs_itself_is_refused() {
    let error = compile_owner(&functions(), OwnerKind::Npc, "test", &[calling(LOOPS)])
        .err()
        .expect("refused");

    assert_eq!(error.rule, "runs itself");
    assert!(error.expected.contains("loops"), "{}", error.expected);
}

#[test]
fn may_do_names_the_functions_a_script_calls() {
    let procedures =
        compile_owner(&functions(), OwnerKind::Npc, "test", &[calling(HELPER)]).expect("compiles");

    let may_do = &procedures[0].may_do;
    assert_eq!(may_do.calls, vec!["helper".to_owned()]);
    assert_eq!(may_do.answers, vec![EventKind::Started]);
    assert!(may_do.reaches.is_empty());
    assert!(!may_do.waits);
}

#[test]
fn an_if_always_taken_still_compiles_both_arrows() {
    let script = inline(nodes(vec![
        (
            "on",
            Node::On {
                event: entry(OwnerKind::Area),
                next: Some("check"),
            },
        ),
        (
            "check",
            Node::If {
                test: Expr::Not(&ALWAYS),
                yes: Some("yes"),
                no: Some("no"),
            },
        ),
        (
            "yes",
            Node::Effect(RiftEffect::Notify(Notify {
                who: None,
                notification: row::<NotificationId>("Gulls"),
                next: None,
            })),
        ),
        (
            "no",
            Node::Effect(RiftEffect::Notify(Notify {
                who: None,
                notification: row::<NotificationId>("ForestIntro"),
                next: None,
            })),
        ),
    ]));

    let procedures = compile(OwnerKind::Area, &[script]).expect("compiles");

    assert_eq!(procedures[0].may_do.reaches.len(), 2);
}
