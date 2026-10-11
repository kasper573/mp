use std::collections::BTreeMap;

use game::core::math::Pos;
use game::core::script::Value;
use game::core::time::Seconds;
use game::systems::GameSettings;
use game::systems::actor::Name;
use game::systems::area::transition::Discovered;
use game::systems::dialogue;
use game::systems::effect::{Effect, TimedEffects};
use game::systems::equipment::{Equipment, EquipmentSlot};
use game::systems::history::{History, HistoryEntry, HistoryTopic};
use game::systems::item::{Inventory, ItemStack};
use game::systems::job::Job;
use game::systems::memory;
use game::systems::movement::Position;
use game::systems::player::Xp;
use game::systems::player::snapshot::{
    CharacterSnapshot, CharacterStart, HeardLine, JoinAs, MemoryValue, QuestState, SnapshotEffect,
    SnapshotMemory, SnapshotQuest, SnapshotRecord, SnapshotShop,
};
use game::systems::quest::{QuestLog, QuestResult};
use game::systems::script::Place;
use game::systems::shop::{Sale, ShopLedger};
use game::systems::stat::{StatKind, Stats};
use game::systems::text::LineText;

use crate::support::{CLOCK, Sim, content, row};

#[test]
fn a_character_joined_from_a_row_is_that_character() {
    let forest = row("forest");
    let start = Place {
        area: forest,
        at: Pos::new(12.0, 10.0),
    };
    let snapshot = tess(start);
    let mut sim = Sim::area(forest);

    let player = sim.join_as(
        1,
        JoinAs {
            snapshot: snapshot.clone(),
            start,
        },
    );
    let world = sim.world();

    assert_eq!(
        world.get::<Name>(player).map(|name| name.name.as_str()),
        Some("Tess")
    );
    assert_eq!(
        world.get::<Position>(player).map(|position| position.pos),
        Some(start.at)
    );
    assert_eq!(world.get::<Xp>(player), Some(&Xp { amount: 60 }));
    assert_eq!(
        world.get::<Job>(player),
        Some(&Job {
            def: row("adventurer")
        })
    );
    let stats = world.get::<Stats>(player).expect("stats");
    assert_eq!(stats.get(StatKind::Damage), 9.0);
    assert_eq!(stats.get(StatKind::MaxHealth), 30.0);
    assert_eq!(
        world.get::<Inventory>(player).map(|bag| bag.slots.clone()),
        Some(snapshot.bag.clone())
    );
    assert_eq!(
        world.get::<Equipment>(player),
        Some(&Equipment {
            slots: snapshot.equipment.clone()
        })
    );
    let known = world.get::<Discovered>(player).expect("known areas");
    assert!(known.knows(forest) && known.knows(row("island")));
    let timed = world.get::<TimedEffects>(player).expect("effects");
    assert_eq!(timed.0.len(), 1);
    assert_eq!(timed.0[0].effect, Effect::Chasing);
    assert_eq!(timed.0[0].until, CLOCK.now.after(Seconds(30.0)));
    let log = world.get::<QuestLog>(player).expect("quest log");
    let tusks = log
        .active(row("tusks_for_the_chief"))
        .expect("on the errand");
    assert_eq!(tusks.counts, vec![0, 1]);
    assert_eq!(
        log.finished(row("letter_for_the_captain"))
            .map(|finished| finished.result),
        Some(QuestResult::Completed)
    );
    assert_eq!(log.tracked, vec![row("tusks_for_the_chief")]);
    assert_eq!(
        memory::get(world, player, row("chief_taunted_you")),
        Value::Bool(true)
    );
    assert!(memory::set_within(
        world,
        player,
        row("chief_taunted_you"),
        Seconds(20.0)
    ));
    assert!(!memory::set_within(
        world,
        player,
        row("chief_taunted_you"),
        Seconds(5.0)
    ));
    assert!(dialogue::heard(world, player, "npc/tobb", "news"));
    let mut ledger = ShopLedger::default();
    ledger.sold(row("mara_wares"), sale());
    assert_eq!(world.get::<ShopLedger>(player), Some(&ledger));
    let history = world.get::<History>(player).expect("history");
    let records: Vec<_> = history.records().collect();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].entry.text, LineText::plain("Hello"));
    assert_eq!(records[0].at, CLOCK.now.before(Seconds(5.0)));
}

#[test]
fn a_start_of_its_own_moves_the_character_and_nothing_else() {
    let island = row("island");
    let spawn = content().built::<GameSettings>().spawn;
    let snapshot = CharacterSnapshot {
        start: CharacterStart::Spawn(game::systems::player::snapshot::AtSpawn::Spawn),
        ..tess(spawn)
    };
    let here = Place {
        area: island,
        at: Pos::new(spawn.at.x + 3.0, spawn.at.y),
    };
    let mut sim = Sim::area(island);

    let player = sim.join_as(
        1,
        JoinAs {
            snapshot: snapshot.clone(),
            start: here,
        },
    );
    let world = sim.world();

    assert_eq!(
        world.get::<Position>(player).map(|position| position.pos),
        Some(here.at)
    );
    assert_eq!(world.get::<Xp>(player), Some(&Xp { amount: 60 }));
    assert!(
        world
            .get::<Discovered>(player)
            .expect("known areas")
            .knows(island)
    );
}

fn tess(start: Place) -> CharacterSnapshot {
    CharacterSnapshot {
        name: "Tess".to_owned(),
        job: row("adventurer"),
        xp: 60,
        stats: BTreeMap::from([(StatKind::Damage, 9.0)]),
        effects: vec![SnapshotEffect {
            effect: Effect::Chasing,
            left: Seconds(30.0),
        }],
        bag: vec![
            ItemStack::new(row("orc_tusk"), 5),
            ItemStack::new(row("gold"), 20),
        ],
        equipment: BTreeMap::from([(EquipmentSlot::Offhand, row("bone_shield"))]),
        known_areas: vec![row("island"), row("forest")],
        quests: vec![
            SnapshotQuest {
                quest: row("tusks_for_the_chief"),
                state: QuestState::Active,
                progress: vec![0, 1],
                left: None,
                decided: None,
            },
            SnapshotQuest {
                quest: row("letter_for_the_captain"),
                state: QuestState::Completed,
                progress: Vec::new(),
                left: None,
                decided: None,
            },
        ],
        memories: vec![SnapshotMemory {
            memory: row("chief_taunted_you"),
            value: MemoryValue::Bool(true),
            ago: Seconds(10.0),
        }],
        lines_heard: vec![HeardLine {
            script: "npc/tobb".to_owned(),
            node: "news".to_owned(),
        }],
        shops: vec![SnapshotShop {
            shop: row("mara_wares"),
            stock: Vec::new(),
            sales: vec![sale()],
        }],
        history: vec![SnapshotRecord {
            ago: Seconds(5.0),
            entry: HistoryEntry::of(HistoryTopic::Talk, LineText::plain("Hello")),
        }],
        start: CharacterStart::At(start),
    }
}

fn sale() -> Sale {
    Sale {
        item: row("bone"),
        count: 2,
        paid: vec![ItemStack::new(row("gold"), 4)],
    }
}
