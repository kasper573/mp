use game::systems::account::{AccountId, Identity, Role};
use game::systems::player::{ClientId, Players};
use game::systems::spectate::{self, SpectateRequest, Spectators};
use game::systems::visibility;

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
