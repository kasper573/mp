use bevy_ecs::prelude::*;
use game::core::math::Pos;
use game::core::tiling::{TilePos, Tiles};
use game::systems::area::transition::Crossing;
use game::systems::area::warp::warp;
use game::systems::dialogue::Conversation;
use game::systems::movement::{MoveRequest, MoveSeq, Position, moving, on_tile, position};
use game::systems::player::{
    ARRIVAL_PATIENCE, AreaDrawn, ClientId, JoinRequest, Players, commands_locked,
};
use game::systems::script::Place;

use testkit::{
    Sim, conversation, count, errors, give, heard_the_news, labels, later, leave, locked,
    object_center, pick, place, remember, row, spawn_area, spoken, talk, told, townsperson,
};

fn joining_player(sim: &mut Sim) -> Entity {
    sim.connect(1);
    sim.send(1, JoinRequest);
    sim.tick();
    *sim.world()
        .resource::<Players>()
        .0
        .get(&ClientId(1))
        .expect("joined player")
}

#[test]
fn an_arrival_is_released_by_the_client_reporting_its_area_drawn() {
    let mut sim = Sim::area(spawn_area());
    let player = joining_player(&mut sim);
    assert!(commands_locked(sim.world(), player));

    sim.send(1, AreaDrawn);
    sim.tick();
    assert!(!commands_locked(sim.world(), player));
}

#[test]
fn an_arrival_is_released_by_the_server_once_the_patience_runs_out() {
    let mut sim = Sim::area(spawn_area());
    let player = joining_player(&mut sim);

    sim.run_until(ARRIVAL_PATIENCE.0 - 1.0, |_| false);
    assert!(commands_locked(sim.world(), player));

    sim.run_until(2.0, |_| false);
    assert!(!commands_locked(sim.world(), player));
}

#[test]
fn a_warp_taken_mid_stride_leaves_you_standing_where_it_put_you() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let start = position(sim.world(), player).expect("placed");
    let away = sim.walkable_near(start, Tiles(4.0), Tiles(6.0));
    let there = sim.walkable_near(start, Tiles(2.0), Tiles(3.0));

    sim.send(
        1,
        MoveRequest {
            pos: away,
            seq: MoveSeq(1),
        },
    );
    assert!(
        sim.run_until(5.0, |world| !on_tile(world, player)),
        "you never set off"
    );
    let to = Place {
        area: spawn_area(),
        at: there,
    };
    warp(sim.world(), player, to).expect("a warp within the area");
    later(&mut sim, 2.0);
    assert_eq!(position(sim.world(), player), Some(there));
    assert!(!moving(sim.world(), player));
}

#[test]
fn a_warp_counts_as_a_jump_where_a_walk_does_not() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let start = position(sim.world(), player).expect("placed");
    let away = sim.walkable_near(start, Tiles(2.0), Tiles(3.0));
    let jumps = |sim: &mut Sim| sim.world().get::<Position>(player).expect("placed").jumps;
    let before = jumps(&mut sim);

    sim.send(
        1,
        MoveRequest {
            pos: away,
            seq: MoveSeq(1),
        },
    );
    assert!(
        sim.run_until(5.0, |world| position(world, player) == Some(away)),
        "you never got there"
    );
    assert_eq!(jumps(&mut sim), before, "the walk counted as a jump");
    let back = Place {
        area: spawn_area(),
        at: start,
    };
    warp(sim.world(), player, back).expect("a warp within the area");
    assert_ne!(jumps(&mut sim), before, "the warp went uncounted");
}

#[test]
fn without_a_pass_the_forest_road_is_ground_and_ilsa_halts_you_on_it() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let ilsa = townsperson(&mut sim, row("Ilsa"));
    let road = object_center(&mut sim, "forest-road");

    head_for_the_forest_road(&mut sim, 1);
    assert!(halted(&mut sim, player), "Ilsa never stopped you");
    let halt = conversation(&mut sim, player).expect("halted");
    assert_eq!(halt.with, Some(ilsa));
    assert!(position(sim.world(), player).is_some_and(|at| at.distance(road) < Tiles(0.5)));
    assert!(commands_locked(sim.world(), player));
    assert!(!labels(&halt).contains(&"I have a Road Pass.".to_owned()));
    assert!(locked(&halt, "I'm ready for the forest road."));
    pick(&mut sim, 1, player, "I'm ready for the forest road.");
    assert_eq!(errors(&sim, 1), vec!["Needs Level 3".to_owned()]);

    leave(&mut sim, 1, player);
    head_for_the_forest_road(&mut sim, 1);
    assert!(
        !crossed(&mut sim, player, 3.0),
        "the warp took you without a pass"
    );
    assert!(conversation(&mut sim, player).is_none());
}

#[test]
fn ilsa_halts_you_each_time_you_step_back_onto_the_road() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = object_center(&mut sim, "forest-road");
    head_for_the_forest_road(&mut sim, 1);
    assert!(halted(&mut sim, player));
    leave(&mut sim, 1, player);

    let off = Pos::new(road.x - 2.0, road.y);
    sim.send(
        1,
        MoveRequest {
            pos: off,
            seq: MoveSeq(1),
        },
    );
    assert!(arrived(&mut sim, player, off));
    head_for_the_forest_road(&mut sim, 1);
    assert!(halted(&mut sim, player), "Ilsa let you try twice");
}

#[test]
fn walking_past_the_forest_road_is_no_business_of_ilsas() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = object_center(&mut sim, "forest-road");
    let past = Pos::new(road.x - 2.0, road.y - 1.0);

    sim.send(
        1,
        MoveRequest {
            pos: past,
            seq: MoveSeq(1),
        },
    );
    assert!(arrived(&mut sim, player, past));
    assert!(conversation(&mut sim, player).is_none());
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
}

#[test]
fn crossing_the_forest_road_on_the_way_elsewhere_is_no_business_of_ilsas() {
    let mut sim = Sim::area(spawn_area());
    let player = sim.join(1);
    let road = object_center(&mut sim, "forest-road");
    let before = Pos::new(road.x, road.y + 3.0);
    let beyond = Pos::new(road.x, road.y - 2.0);
    place(&mut sim, player, before);

    sim.send(
        1,
        MoveRequest {
            pos: beyond,
            seq: MoveSeq(1),
        },
    );
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
    assert!(told(&sim, 1).contains(&spoken(row("GullSails"))));
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

fn head_for_the_forest_road(sim: &mut Sim, client: u32) {
    let road = object_center(sim, "forest-road");
    sim.send(
        client,
        MoveRequest {
            pos: road,
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
