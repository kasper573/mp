use bevy_terminal::TerminalInput;
use engine::systems::account::{AccountId, Identity, Role};
use engine::systems::area::transition;
use engine::systems::movement::Position;
use engine::systems::player::{ClientId, Players};
use engine::systems::spectate::{self, SpectateRequest, Spectators};
use engine::systems::terminal::TerminalKind;
use engine::systems::visibility::{self, PrivateSight};

use testkit::{Sim, spawn_area};

#[test]
fn spectate_takes_the_character_out_of_the_world_and_exit_brings_it_back_where_it_stood() {
    let mut sim = Sim::area(spawn_area());
    let character = sim.join_identified(3, spectator());
    let stood = sim.world().get::<Position>(character).expect("a place").pos;

    spectate_command(&mut sim, 3);
    assert!(
        !sim.world()
            .resource::<Players>()
            .0
            .contains_key(&ClientId(3))
    );
    assert!(sim.world().get_entity(character).is_err());
    assert!(spectating(&sim, 3));

    sim.send(3, SpectateRequest::Stop);
    sim.tick();
    assert!(!spectating(&sim, 3));
    let travelers = transition::departing(sim.world());
    assert_eq!(travelers.len(), 1);
    let back = transition::arrive(
        sim.world(),
        travelers.into_iter().next().expect("a traveler"),
    );
    assert_eq!(
        sim.world().resource::<Players>().0.get(&ClientId(3)),
        Some(&back)
    );
    assert_eq!(
        sim.world().get::<Position>(back).expect("a place").pos,
        stood
    );
}

#[test]
fn an_account_without_the_spectate_role_keeps_playing() {
    let mut sim = Sim::area(spawn_area());
    let character = sim.join_identified(
        3,
        Identity {
            roles: Vec::new(),
            ..spectator()
        },
    );

    spectate_command(&mut sim, 3);

    assert!(!spectating(&sim, 3));
    assert_eq!(
        sim.world().resource::<Players>().0.get(&ClientId(3)),
        Some(&character)
    );
}

#[test]
fn a_spectator_follows_the_next_player_once_the_watched_one_leaves() {
    let mut sim = Sim::area(spawn_area());
    let leaver = sim.join(1);
    let successor = sim.join(2);
    sim.join_identified(3, spectator());
    let conn = sim.conn(3);
    spectate_command(&mut sim, 3);
    coordinate(&mut sim);
    assert_eq!(watching(&sim), Some(ClientId(1)));
    assert!(visibility::private_viewers(sim.world(), leaver).contains(&conn));
    assert!(!visibility::private_viewers(sim.world(), successor).contains(&conn));

    sim.world().resource_mut::<Players>().0.remove(&ClientId(1));
    coordinate(&mut sim);

    assert_eq!(watching(&sim), Some(ClientId(2)));
    assert!(!visibility::private_viewers(sim.world(), leaver).contains(&conn));
    assert!(visibility::private_viewers(sim.world(), successor).contains(&conn));
}

#[test]
fn a_spectator_arriving_from_another_world_sees_the_watched_player_at_once() {
    let mut origin = Sim::area(spawn_area());
    let mut far = Sim::area(spawn_area());
    far.join(1);
    let arrived = far.connect(3);
    origin.join_identified(3, spectator());
    spectate_command(&mut origin, 3);
    let mut worlds = [origin.app, far.app];

    let transfers = spectate::coordinate(&mut worlds, std::iter::empty());
    assert_eq!(transfers.len(), 1);
    let transfer = transfers
        .into_iter()
        .next()
        .expect("the spectator changes worlds");
    spectate::arrive(worlds[1].world_mut(), transfer);

    let sight = worlds[1]
        .world()
        .get::<PrivateSight>(arrived)
        .expect("the connection sees");
    assert_eq!(sight.watching, Some(ClientId(1)));
}

fn spectator() -> Identity {
    Identity {
        id: AccountId("spectator".to_owned()),
        name: "spectator".to_owned(),
        roles: vec![Role::Spectate],
    }
}

fn spectate_command(sim: &mut Sim, client: u32) {
    sim.send(
        client,
        TerminalInput {
            terminal: TerminalKind::Global,
            text: "/spectate".to_owned(),
        },
    );
    sim.tick();
}

fn spectating(sim: &Sim, client: u32) -> bool {
    sim.app
        .world()
        .resource::<Spectators>()
        .0
        .contains_key(&ClientId(client))
}

fn coordinate(sim: &mut Sim) {
    spectate::coordinate(std::slice::from_mut(&mut sim.app), std::iter::empty());
}

fn watching(sim: &Sim) -> Option<ClientId> {
    sim.app
        .world()
        .resource::<Spectators>()
        .0
        .get(&ClientId(3))
        .and_then(|spectator| spectator.watching())
}
