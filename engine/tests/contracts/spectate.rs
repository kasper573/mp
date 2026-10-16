use engine::systems::account::{AccountId, Identity, Role};
use engine::systems::player::{ClientId, Players};
use engine::systems::spectate::{self, SpectateRequest, Spectators};
use engine::systems::visibility::{self, PrivateSight};

use testkit::{Sim, spawn_area};

#[test]
fn a_spectator_follows_the_next_player_once_the_watched_one_leaves() {
    let mut sim = Sim::area(spawn_area());
    let leaver = sim.join(1);
    let successor = sim.join(2);
    let conn = sim.connect(3);
    sim.world().entity_mut(conn).insert(Identity {
        id: AccountId("spectator".to_owned()),
        name: "spectator".to_owned(),
        roles: vec![Role::Spectate],
    });
    sim.send(3, SpectateRequest::Start);
    sim.tick();
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

#[test]
fn a_spectator_arriving_from_another_world_sees_the_watched_player_at_once() {
    let mut origin = Sim::area(spawn_area());
    let mut far = Sim::area(spawn_area());
    far.join(1);
    let arrived = far.connect(3);
    let conn = origin.connect(3);
    origin.world().entity_mut(conn).insert(Identity {
        id: AccountId("spectator".to_owned()),
        name: "spectator".to_owned(),
        roles: vec![Role::Spectate],
    });
    origin.send(3, SpectateRequest::Start);
    origin.tick();
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
