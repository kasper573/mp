use bevy_ecs::prelude::*;
use game::core::math::Pos;
use game::core::tiling::{TilePos, Tiles};
use game::systems::area::AreaObject;
use game::systems::area::transition::Crossing;
use game::systems::history::History;
use game::systems::input::map::InputMap;
use game::systems::movement::{MoveRequest, Position, position};
use game::systems::notification::Notification;
use game::systems::player::commands_locked;

use crate::support::{
    Sim, content, conversation, count, errors, give, heard_the_news, labels, leave, locked, object,
    pick, remember, row, spawn_area, spoken, talk,
};

fn forest_road(sim: &mut Sim) -> Pos<Tiles> {
    let road = object(sim, "forest-road");
    sim.world()
        .get::<AreaObject>(road)
        .expect("the forest road")
        .shape
        .center()
}

fn head_for_the_forest_road(sim: &mut Sim, client: u32) {
    let road = forest_road(sim);
    sim.send(client, MoveRequest { pos: road });
}

fn arrived(sim: &mut Sim, player: Entity, at: Pos<Tiles>) -> bool {
    sim.run_until(15.0, |world| {
        position(world, player).is_some_and(|here| here.distance(at) < Tiles(0.5))
    })
}

fn crossed(sim: &mut Sim, player: Entity, within: f32) -> bool {
    sim.run_until(within, |world| world.get::<Crossing>(player).is_some())
}

fn halts(sim: &mut Sim, player: Entity) -> u32 {
    let inputs = InputMap::new(content());
    sim.world()
        .get::<History>(player)
        .map(|history| {
            history
                .records()
                .filter(|record| {
                    record.entry.by.as_deref() == Some("Ilsa")
                        && record.entry.text.words(&inputs).starts_with("Halt!")
                })
                .map(|record| record.entry.repeats)
                .sum()
        })
        .unwrap_or_default()
}

#[test]
fn without_a_pass_the_forest_road_is_plain_ground() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = forest_road(&mut sim);

    head_for_the_forest_road(&mut sim, 1);
    assert!(arrived(&mut sim, player, road));
    assert!(
        !crossed(&mut sim, player, 2.0),
        "the warp took you without a pass"
    );
    assert!(conversation(&mut sim, player).is_none());
    assert!(!commands_locked(sim.world(), player));
}

#[test]
fn ilsa_calls_halt_as_you_come_near_and_again_when_you_come_back() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = forest_road(&mut sim);

    head_for_the_forest_road(&mut sim, 1);
    assert!(arrived(&mut sim, player, road));
    sim.run_until(1.0, |_| false);
    assert_eq!(halts(&mut sim, player), 1);

    let away = Pos::new(road.x + 6.0, road.y + 3.0);
    sim.world()
        .entity_mut(player)
        .insert(Position { pos: away });
    sim.run_until(1.0, |_| false);
    assert_eq!(halts(&mut sim, player), 1);

    head_for_the_forest_road(&mut sim, 1);
    assert!(arrived(&mut sim, player, road));
    sim.run_until(1.0, |_| false);
    assert_eq!(halts(&mut sim, player), 2);
}

#[test]
fn ilsa_only_lets_seasoned_fighters_earn_a_pass() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);

    let hello = talk(&mut sim, 1, player, row("Ilsa"));
    assert!(locked(&hello, "I'm ready for the forest road."));
    pick(&mut sim, 1, player, "I'm ready for the forest road.");
    assert_eq!(errors(&sim, 1), vec!["Needs Level 3".to_owned()]);
    assert_eq!(count(&mut sim, player, row("RoadPass")), 0);
}

#[test]
fn a_road_pass_opens_the_forest_road_without_a_word_from_ilsa() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    give(&mut sim, player, row("RoadPass"), 1);

    head_for_the_forest_road(&mut sim, 1);
    assert!(crossed(&mut sim, player, 15.0), "the warp never took you");
    let crossing = *sim.world().get::<Crossing>(player).expect("crossing");
    assert_eq!(crossing.dest_area, row("Forest"));
    assert!(conversation(&mut sim, player).is_none());
    assert_eq!(halts(&mut sim, player), 0);
}

#[test]
fn walking_across_the_forest_road_without_a_pass_goes_nowhere() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = forest_road(&mut sim);
    let before = Pos::new(road.x, road.y + 3.0);
    let beyond = Pos::new(road.x, road.y - 2.0);
    sim.world()
        .entity_mut(player)
        .insert(Position { pos: before });

    sim.send(1, MoveRequest { pos: beyond });
    assert!(arrived(&mut sim, player, beyond), "the road stopped you");
    assert!(sim.world().get::<Crossing>(player).is_none());
    assert!(conversation(&mut sim, player).is_none());
}

#[test]
fn ilsa_trades_a_road_pass_for_a_fish_and_bram_only_looks_at_it() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    heard_the_news(&mut sim, player);
    give(&mut sim, player, row("FishSteak"), 1);

    let greeting = talk(&mut sim, 1, player, row("Ilsa"));
    assert!(!labels(&greeting).contains(&"Ugra's clan walks with me.".to_owned()));
    let traded = pick(&mut sim, 1, player, "Would a fish change your mind?").expect("talking");
    assert_eq!(traded.node, "fish");
    assert_eq!(count(&mut sim, player, row("RoadPass")), 1);
    assert_eq!(count(&mut sim, player, row("FishSteak")), 0);
    leave(&mut sim, 1, player);

    let bram = talk(&mut sim, 1, player, row("Bram"));
    assert!(!locked(&bram, "Ilsa gave me this pass."));
    pick(&mut sim, 1, player, "Ilsa gave me this pass.");
    let crossing = *sim
        .world()
        .get::<Crossing>(player)
        .expect("sailing for the forest");
    assert_eq!(crossing.dest_area, row("Forest"));
    assert_eq!(count(&mut sim, player, row("RoadPass")), 1);
}

#[test]
fn bram_sails_for_twenty_gold_and_the_crossing_is_narrated() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    heard_the_news(&mut sim, player);
    give(&mut sim, player, row("Gold"), 25);

    let bram = talk(&mut sim, 1, player, row("Bram"));
    assert!(!labels(&bram).contains(&"Ilsa gave me this pass.".to_owned()));
    pick(&mut sim, 1, player, "Sail to the forest.");

    assert_eq!(count(&mut sim, player, row("Gold")), 5);
    assert!(sim.world().get::<Crossing>(player).is_some());
    let told: Vec<Notification> = sim
        .notified(1)
        .into_iter()
        .map(|sent| sent.notification)
        .collect();
    assert!(told.contains(&spoken(row("GullSails"))));
}

#[test]
fn ilsa_has_a_word_only_for_friends_of_the_clan() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    heard_the_news(&mut sim, player);
    remember(&mut sim, player, row("SidedWithOrcs"));

    talk(&mut sim, 1, player, row("Ilsa"));
    let passed = pick(&mut sim, 1, player, "Ugra's clan walks with me.").expect("talking");
    assert_eq!(passed.node, "uneasy");
    assert_eq!(count(&mut sim, player, row("RoadPass")), 1);
}
