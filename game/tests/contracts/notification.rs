use bevy_ecs::prelude::*;
use game::core::math::{Offset, Pos};
use game::core::tiling::Tiles;
use game::systems::area::AreaObject;
use game::systems::area::transition::{self, Crossing};
use game::systems::dialogue::Conversation;
use game::systems::history::{History, HistoryTopic};
use game::systems::input::map::InputMap;
use game::systems::movement::{Position, position};
use game::systems::notification::{self, Notification, NotificationKind, NotificationSent};
use game::systems::npc::{self, Pack};
use game::systems::player::{AreaDrawn, Xp, commands_locked};
use game::systems::quest;
use game::systems::quest::Id as QuestId;
use game::systems::text::LineText;

use crate::support::{
    Sim, content, later, object, remembered, row, settle, spawn_area, spoken, townsperson,
};

fn told(sim: &Sim, client: u32) -> Vec<Notification> {
    sim.notified(client)
        .into_iter()
        .map(|sent| sent.notification)
        .collect()
}

fn recorded(sim: &mut Sim, player: Entity) -> Vec<(HistoryTopic, Option<String>, String, u32)> {
    sim.world()
        .get::<History>(player)
        .map(|history| {
            history
                .records()
                .map(|record| {
                    let entry = &record.entry;
                    let text = entry.text.words(&InputMap::new(content()));
                    (entry.topic, entry.by.clone(), text, entry.repeats)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn narration(label: &'static str, text: String) -> Notification {
    Notification::new(
        NotificationKind::Narration {
            label: label.into(),
            sfx: None,
        },
        LineText::plain(text),
    )
}

fn object_center(sim: &mut Sim, name: &str) -> Pos<Tiles> {
    let entity = object(sim, name);
    sim.world()
        .get::<AreaObject>(entity)
        .expect("an area object")
        .shape
        .center()
}

fn travel(from: &mut Sim, player: Entity, to: game::systems::area::Id) -> (Sim, Entity) {
    let mut there = Sim::area(to);
    there.connect(1);
    from.world().entity_mut(player).insert(Crossing {
        dest_area: to,
        dest: there.map().fallback_spawn(),
    });
    let traveler = transition::departing(from.world())
        .pop()
        .expect("a traveler");
    let arrived = transition::arrive(there.world(), traveler);
    there.send(1, AreaDrawn);
    settle(&mut there);
    (there, arrived)
}

fn intros(sim: &Sim, client: u32) -> usize {
    told(sim, client)
        .iter()
        .filter(|notification| matches!(notification.kind, NotificationKind::Intro { .. }))
        .count()
}

#[test]
fn stepping_onto_the_pier_narrates_the_gulls_once() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let start = position(sim.world(), player).expect("position");
    let pier = object_center(&mut sim, "ferry-pier");

    sim.world()
        .entity_mut(player)
        .insert(Position { pos: pier });
    settle(&mut sim);
    assert_eq!(told(&sim, 1), vec![spoken(row("Gulls"))]);
    assert!(!commands_locked(sim.world(), player));

    later(&mut sim, 30.0);
    sim.forget_notified();
    sim.world()
        .entity_mut(player)
        .insert(Position { pos: start });
    settle(&mut sim);
    sim.world()
        .entity_mut(player)
        .insert(Position { pos: pier });
    settle(&mut sim);
    assert_eq!(told(&sim, 1), Vec::new());
    assert!(remembered(&mut sim, player, row("HeardGulls")));
}

#[test]
fn every_notification_is_recorded_when_it_is_raised() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    notification::notify(sim.world(), player, spoken(row("Gulls")));
    notification::record(
        sim.world(),
        player,
        &Notification::new(
            NotificationKind::error(content()),
            LineText::plain("Needs 10 Gold"),
        ),
    );

    let records = recorded(&mut sim, player);
    assert!(records.contains(&(
        HistoryTopic::Notification,
        Some("Gulls".to_owned()),
        "Gulls squabble over a fish head at the end of the pier.".to_owned(),
        1
    )));
    assert!(records.contains(&(HistoryTopic::Error, None, "Needs 10 Gold".to_owned(), 1)));
    assert_eq!(told(&sim, 1), vec![spoken(row("Gulls"))]);
}

#[test]
fn the_orc_chief_speaks_to_players_on_maras_errand_from_its_own_body() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let bystander = sim.join(2);
    sim.world().get_mut::<Xp>(player).expect("xp").gain(100_000);
    settle(&mut sim);
    quest::accept(sim.world(), player, row("TusksForTheChief")).expect("accepted");
    let at = position(sim.world(), player).expect("position");
    sim.world()
        .entity_mut(bystander)
        .insert(Position { pos: at });
    sim.forget_notified();

    let chief = npc::spawn(
        sim.world(),
        row("OrcChief"),
        at + Offset::new(2.0, 0.0),
        spawn_area(),
        Pack(u32::MAX),
    );
    settle(&mut sim);

    let said: Vec<NotificationSent> = sim
        .notified(1)
        .into_iter()
        .filter(|sent| matches!(sent.notification.kind, NotificationKind::Speech { .. }))
        .collect();
    assert_eq!(
        said.iter()
            .map(|sent| sent.notification.clone())
            .collect::<Vec<_>>(),
        vec![spoken(row("ChiefChallenge")), spoken(row("ChiefThreat"))]
    );
    assert!(said.iter().all(|sent| sent.speaker == Some(chief)));
    assert!(sim.world().get::<Conversation>(player).is_none());
    assert!(!commands_locked(sim.world(), player));
    assert!(
        !told(&sim, 2)
            .iter()
            .any(|notification| matches!(notification.kind, NotificationKind::Speech { .. }))
    );
}

#[test]
fn speech_names_no_body_when_the_speaker_is_someone_else() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let tobb = townsperson(&mut sim, row("Tobb"));

    notification::notify_from(
        sim.world(),
        player,
        Some(tobb),
        spoken(row("ChiefChallenge")),
    );

    assert_eq!(
        sim.notified(1)
            .into_iter()
            .map(|sent| sent.speaker)
            .collect::<Vec<_>>(),
        vec![None]
    );
}

#[test]
fn an_area_intro_plays_on_the_first_arrival_only_and_never_for_the_start_zone() {
    let mut island = Sim::area(spawn_area());
    let player = island.join(1);
    settle(&mut island);
    assert_eq!(intros(&island, 1), 0);

    let (mut forest, player) = travel(&mut island, player, row("Forest"));
    assert_eq!(
        told(&forest, 1)
            .into_iter()
            .filter(|notification| matches!(notification.kind, NotificationKind::Intro { .. }))
            .collect::<Vec<_>>(),
        vec![spoken(row("ForestIntro"))]
    );

    let (mut island, player) = travel(&mut forest, player, spawn_area());
    assert_eq!(intros(&island, 1), 0);

    let (forest, _) = travel(&mut island, player, row("Forest"));
    assert_eq!(intros(&forest, 1), 0);
}

#[test]
fn completing_a_quest_and_reaching_a_level_are_milestones() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    sim.world().get_mut::<Xp>(player).expect("xp").gain(100_000);
    settle(&mut sim);
    quest::accept(sim.world(), player, row("TusksForTheChief")).expect("accepted");

    quest::complete(sim.world(), player, row("TusksForTheChief"));
    settle(&mut sim);

    let milestones: Vec<(String, String, HistoryTopic)> = told(&sim, 1)
        .into_iter()
        .filter_map(|notification| match notification.kind {
            NotificationKind::Milestone { label, topic, .. } => Some((
                label.into_owned(),
                notification.text.words(&InputMap::new(content())),
                topic,
            )),
            _ => None,
        })
        .collect();
    assert!(
        milestones
            .iter()
            .any(|(label, _, topic)| label == "Level up" && *topic == HistoryTopic::Notification)
    );
    assert!(
        milestones.contains(&(
            "Quest complete".to_owned(),
            row::<QuestId>("TusksForTheChief")
                .get(content())
                .title
                .to_owned(),
            HistoryTopic::Quest
        ))
    );
}

#[test]
fn the_same_line_from_the_same_speaker_goes_out_once_per_window_and_merges_in_history() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    for _ in 0..25 {
        notification::notify(sim.world(), player, spoken(row("Gulls")));
    }
    assert_eq!(told(&sim, 1), vec![spoken(row("Gulls"))]);
    let gulls = |records: Vec<(HistoryTopic, Option<String>, String, u32)>| {
        records
            .into_iter()
            .filter(|(_, by, ..)| by.as_deref() == Some("Gulls"))
            .map(|(.., repeats)| repeats)
            .collect::<Vec<_>>()
    };
    assert_eq!(gulls(recorded(&mut sim, player)), vec![25]);

    later(&mut sim, 11.0);
    notification::notify(sim.world(), player, spoken(row("Gulls")));
    assert_eq!(
        told(&sim, 1),
        vec![spoken(row("Gulls")), spoken(row("Gulls"))]
    );
}

#[test]
fn a_flood_goes_out_in_a_burst_and_then_at_the_refill_rate() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    for line in 0..15 {
        notification::notify(
            sim.world(),
            player,
            narration("Drums", format!("Beat {line}")),
        );
    }
    assert_eq!(told(&sim, 1).len(), 10);
    assert_eq!(
        recorded(&mut sim, player)
            .iter()
            .filter(|(_, by, ..)| by.as_deref() == Some("Drums"))
            .count(),
        15
    );

    later(&mut sim, 1.0);
    for line in 15..20 {
        notification::notify(
            sim.world(),
            player,
            narration("Drums", format!("Beat {line}")),
        );
    }
    assert_eq!(told(&sim, 1).len(), 12);
}

#[test]
fn errors_and_feed_lines_answer_every_action() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let refused = Notification::new(
        NotificationKind::error(content()),
        LineText::plain("Needs 10 Gold"),
    );
    for _ in 0..20 {
        notification::notify(sim.world(), player, refused.clone());
    }
    assert_eq!(told(&sim, 1), vec![refused; 20]);
}
