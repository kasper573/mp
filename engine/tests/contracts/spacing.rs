use std::collections::HashMap;

use bevy_ecs::prelude::*;
use engine::core::math::{Offset, Pos};
use engine::core::tiling::{Cell, CellPos, TilePos, Tiles};
use engine::systems::area::warp::warp;
use engine::systems::area::{self, AreaDef, AreaId};
use engine::systems::combat::{self, AttackRequest, Attitude};
use engine::systems::movement::{
    self, MoveRequest, MoveSeq, MoveTarget, TileClaim, TileClaims, moving, position,
};
use engine::systems::npc::body::{self, Act, Priority};
use engine::systems::npc::{self, Home, Npc, Pack};
use engine::systems::script::{Owner, OwnerKind, Place, RiftInstances};
use engine::systems::stat;

use testkit::{Sim, content, place, row, spawn_area};

const FIGHTERS: Pack = Pack(1);
const VICTIMS: Pack = Pack(2);

#[test]
fn two_actors_reaching_for_each_other_end_on_neighbouring_tiles() {
    for gap in [2, 3, 4, 5] {
        for direction in [(1, 0), (0, 1), (1, 1), (-1, 0)] {
            let mut arena = Arena::new();
            let player = arena.player();
            let foe = arena.fighter(arena.at(direction.0 * gap, direction.1 * gap));

            arena.sim.send(1, AttackRequest { target: foe });
            arena.attack(foe, player);
            let rested_apart = arena.watch(4.0, |world| {
                !(resting(world, player)
                    && resting(world, foe)
                    && cell(world, player) == cell(world, foe))
            });

            assert!(rested_apart, "gap {gap} {direction:?}: rested on one tile");
            let world = arena.sim.world();
            assert!(resting(world, player) && resting(world, foe));
            assert_eq!(
                apart(cell(world, player), cell(world, foe)),
                1,
                "gap {gap} {direction:?}"
            );
        }
    }
}

#[test]
fn reach_met_mid_step_never_lands_on_the_target() {
    for offset in [(3, 0), (2, 1), (3, 2), (-2, 3), (4, -1), (1, -3)] {
        let mut arena = Arena::new();
        let player = arena.player();
        let target = arena.victim(arena.at(offset.0, offset.1));

        arena.sim.send(1, AttackRequest { target });
        let never_on_it = arena.watch(4.0, |world| {
            !(resting(world, player) && cell(world, player) == cell(world, target))
        });

        assert!(never_on_it, "{offset:?}: came to rest on the target");
        let world = arena.sim.world();
        assert!(resting(world, player), "{offset:?}");
        assert_eq!(apart(cell(world, player), cell(world, target)), 1);
    }
}

#[test]
fn a_pack_from_one_side_fills_distinct_berths() {
    let mut arena = Arena::new();
    let player = arena.player();
    let pack: Vec<Entity> = (0..4)
        .map(|row| arena.fighter(arena.at(4, row - 1)))
        .collect();

    for &fighter in &pack {
        arena.attack(fighter, player);
    }
    arena.run(4.0);

    let world = arena.sim.world();
    let target = cell(world, player);
    let mut tiles: Vec<CellPos> = pack.iter().map(|&f| cell(world, f)).collect();
    assert!(pack.iter().all(|&f| resting(world, f)));
    assert!(
        tiles.iter().all(|&tile| apart(tile, target) == 1),
        "{tiles:?}"
    );
    tiles.sort_by_key(|tile| (tile.x, tile.y));
    tiles.dedup();
    assert_eq!(tiles.len(), pack.len(), "two of the pack share a tile");
}

#[test]
fn a_ninth_attacker_shares_the_emptiest_berth() {
    let mut arena = Arena::new();
    let player = arena.player();
    let pack = arena.ring_of_fighters(9, player);

    arena.run(6.0);

    let world = arena.sim.world();
    let crowds = crowds(world, &pack);
    assert!(in_reach_of(world, &pack, player));
    assert_eq!(crowds.len(), 8, "{crowds:?}");
    assert_eq!(crowds.values().max(), Some(&2), "{crowds:?}");
}

#[test]
fn a_crowded_tile_evens_out_when_another_frees() {
    let mut arena = Arena::new();
    let player = arena.player();
    let mut pack = arena.ring_of_fighters(9, player);
    arena.run(6.0);

    let world = arena.sim.world();
    let before = crowds(world, &pack);
    let alone = pack
        .iter()
        .position(|&fighter| before[&cell(world, fighter)] == 1)
        .expect("a fighter alone on its tile");
    let gone = pack.remove(alone);
    npc::despawn(world, gone);
    arena.run(6.0);

    let world = arena.sim.world();
    let crowds = crowds(world, &pack);
    assert!(in_reach_of(world, &pack, player));
    assert_eq!(crowds.len(), 8, "{crowds:?}");
}

#[test]
fn a_pack_fans_out_when_its_target_stops() {
    let mut arena = Arena::new();
    let player = arena.player();
    let pack: Vec<Entity> = (0..3)
        .map(|row| arena.fighter(arena.at(-3, row - 1)))
        .collect();
    for &fighter in &pack {
        arena.attack(fighter, player);
    }

    let away = arena.at(4, 0);
    arena.sim.send(
        1,
        MoveRequest {
            pos: away,
            seq: MoveSeq(1),
        },
    );
    arena.run(8.0);

    let world = arena.sim.world();
    assert_eq!(position(world, player), Some(away));
    assert!(in_reach_of(world, &pack, player));
    assert_eq!(crowds(world, &pack).len(), pack.len());
}

#[test]
fn berths_hold_while_the_target_steps_within_reach() {
    let mut arena = Arena::new();
    let player = arena.player();
    let fighter = arena.fighter(arena.at(0, 3));
    arena.attack(fighter, player);
    arena.run(4.0);
    let berth = cell(arena.sim.world(), fighter);
    assert_eq!(berth, arena.at(0, 1).cell());

    let step = arena.at(1, 0);
    arena.sim.send(
        1,
        MoveRequest {
            pos: step,
            seq: MoveSeq(1),
        },
    );
    let held = arena.watch(3.0, |world| {
        position(world, fighter) == Some(berth.center())
    });

    assert!(held, "the fighter left a berth still in reach");
    assert_eq!(position(arena.sim.world(), player), Some(step));
}

#[test]
fn a_ground_click_onto_an_occupied_tile_is_honoured() {
    let mut arena = Arena::new();
    let player = arena.player();
    let spot = arena.at(3, 1);
    arena.victim(spot);

    arena.sim.send(
        1,
        MoveRequest {
            pos: spot,
            seq: MoveSeq(1),
        },
    );
    arena.run(4.0);

    let world = arena.sim.world();
    assert_eq!(position(world, player), Some(spot));
    assert!(resting(world, player));
}

#[test]
fn no_attacker_is_ever_held_out_of_reach() {
    let mut arena = Arena::new();
    let player = arena.player();
    let pack = arena.ring_of_fighters(14, player);

    arena.run(8.0);

    let world = arena.sim.world();
    assert!(pack.iter().all(|&fighter| resting(world, fighter)));
    assert!(in_reach_of(world, &pack, player));
    assert!(crowds(world, &pack).values().all(|&crowd| crowd <= 2));
}

#[test]
fn players_and_npcs_pick_berths_alike() {
    for offset in [(3, 0), (3, 2), (-2, 4), (0, -3)] {
        let berths = [true, false].map(|as_player| {
            let mut arena = Arena::new();
            let player = arena.player();
            let target = arena.victim(arena.at(0, 0));
            let attacker = if as_player {
                let start = arena.at(offset.0, offset.1);
                place(&mut arena.sim, player, start);
                arena.sim.send(1, AttackRequest { target });
                player
            } else {
                let aside = arena.at(-5, -5);
                place(&mut arena.sim, player, aside);
                let fighter = arena.fighter(arena.at(offset.0, offset.1));
                arena.attack(fighter, target);
                fighter
            };
            let arrived = arena.watch_until(4.0, |world| {
                resting(world, attacker) && apart(cell(world, attacker), cell(world, target)) == 1
            });
            assert!(arrived, "{offset:?} as player: {as_player}");
            cell(arena.sim.world(), attacker)
        });

        assert_eq!(berths[0], berths[1], "{offset:?}");
    }
}

#[test]
fn wandering_never_ends_on_a_claimed_tile() {
    let mut arena = Arena::new();
    let home = arena.at(0, 0);
    for (dx, dy) in [(0, 0), (1, 0), (-1, 1), (0, -2), (2, 2)] {
        arena.victim(arena.at(dx, dy));
    }
    let wanderers: Vec<Entity> = [(-2, 0), (2, -1), (1, 2), (-1, -1)]
        .into_iter()
        .map(|(dx, dy)| {
            let wanderer = arena.victim(arena.at(dx, dy));
            arena.sim.world().entity_mut(wanderer).insert(Home(home));
            wanderer
        })
        .collect();

    let apart = arena.watch(20.0, |world| {
        for &wanderer in &wanderers {
            body::order(
                world,
                wanderer,
                Act::Wander {
                    leash: Some(Tiles(2.5)),
                },
                Priority(1),
                None,
            );
        }
        let mut resting_on: HashMap<CellPos, u32> = HashMap::new();
        let mut actors = world.query_filtered::<Entity, With<Npc>>();
        for actor in actors.iter(world).collect::<Vec<_>>() {
            if resting(world, actor) {
                *resting_on.entry(cell(world, actor)).or_default() += 1;
            }
        }
        resting_on.values().all(|&count| count == 1)
    });

    assert!(apart, "a wanderer came to rest on a claimed tile");
}

#[test]
fn placement_lands_on_the_nearest_free_tile() {
    let mut sim = Sim::area(spawn_area());
    let players: Vec<Entity> = (1..=4).map(|client| sim.join(client)).collect();
    let world = sim.world();
    let mut tiles: Vec<CellPos> = players.iter().map(|&p| cell(world, p)).collect();
    let spawn = tiles[0];
    assert!(
        tiles.iter().all(|&tile| apart(tile, spawn) <= 1),
        "{tiles:?}"
    );
    tiles.sort_by_key(|tile| (tile.x, tile.y));
    tiles.dedup();
    assert_eq!(tiles.len(), players.len());

    let mut arena = Arena::new();
    let player = arena.player();
    let spot = arena.at(4, 0);
    arena.victim(spot);
    warp(
        arena.sim.world(),
        player,
        Place {
            area: arena.area,
            at: spot,
        },
    )
    .expect("warped");

    let world = arena.sim.world();
    assert_eq!(cell(world, player), arena.at(4, 1).cell());
}

#[test]
fn a_despawned_actor_leaves_no_claim() {
    let mut arena = Arena::new();
    let spot = arena.at(2, 0).cell();
    let gone = arena.victim(arena.at(2, 0));
    let fallen = arena.victim(arena.at(2, 0));
    assert_eq!(arena.claims(spot), 2);

    npc::despawn(arena.sim.world(), gone);
    assert_eq!(arena.claims(spot), 1);

    combat::inflict(arena.sim.world(), fallen, None, 1_000_000.0);
    arena.run(0.2);
    assert!(stat::is_dead(arena.sim.world(), fallen));
    assert_eq!(arena.claims(spot), 0);
}

#[test]
fn the_claim_index_matches_a_rebuild_from_scratch() {
    let mut arena = Arena::new();
    let player = arena.player();
    let pack = arena.ring_of_fighters(10, player);

    for round in 0..8 {
        let at = position(arena.sim.world(), player).expect("position");
        let step = if round % 2 == 0 { 2.0 } else { -2.0 };
        arena.sim.send(
            1,
            MoveRequest {
                pos: at + Offset::new(step, 0.0),
                seq: MoveSeq(round + 1),
            },
        );
        if round == 4 {
            npc::despawn(arena.sim.world(), pack[0]);
        }
        if round == 6 {
            combat::inflict(arena.sim.world(), pack[1], None, 1_000_000.0);
        }
        arena.sim.tick();
        let consistent = arena.watch(1.0, |world| {
            rebuilt(world) == indexed(world) && claims_follow_walks(world)
        });
        assert!(consistent, "round {round}");
    }
}

struct Arena {
    sim: Sim,
    area: AreaId,
    origin: CellPos,
}

impl Arena {
    /// A sim with nobody else about, centred on open ground the player can walk all over.
    fn new() -> Arena {
        let (area, origin) = open_ground();
        let mut sim = Sim::area(area);
        sim.join(1);
        let world = sim.world();
        let npcs: Vec<Entity> = world
            .query_filtered::<Entity, With<Npc>>()
            .iter(world)
            .collect();
        for npc in npcs {
            npc::despawn(world, npc);
        }
        let mut arena = Arena { sim, area, origin };
        let player = arena.player();
        place(&mut arena.sim, player, origin.center());
        arena.sim.tick();
        arena
    }

    fn player(&mut self) -> Entity {
        self.sim
            .world()
            .resource::<engine::systems::player::Players>()
            .0[&engine::systems::player::ClientId(1)]
    }

    fn at(&self, dx: i32, dy: i32) -> Pos<Tiles> {
        self.origin.step((dx, dy)).center()
    }

    fn fighter(&mut self, at: Pos<Tiles>) -> Entity {
        self.brute(at, FIGHTERS)
    }

    fn victim(&mut self, at: Pos<Tiles>) -> Entity {
        self.brute(at, VICTIMS)
    }

    fn brute(&mut self, at: Pos<Tiles>, pack: Pack) -> Entity {
        let area = self.area;
        let world = self.sim.world();
        let brute = npc::spawn(world, row("Orc"), at, area, pack);
        world
            .resource_mut::<RiftInstances>()
            .remove_owner(Owner::Entity(OwnerKind::Npc, brute));
        world.entity_mut(brute).insert(Attitude::Hostile);
        brute
    }

    fn attack(&mut self, attacker: Entity, target: Entity) {
        body::order(
            self.sim.world(),
            attacker,
            Act::Attack {
                target,
                within: Tiles(40.0),
            },
            Priority(9),
            None,
        );
    }

    /// `count` fighters set around the target out of reach, all coming for it.
    fn ring_of_fighters(&mut self, count: usize, target: Entity) -> Vec<Entity> {
        let fighters: Vec<Entity> = (0..count)
            .map(|index| {
                let angle = std::f32::consts::TAU * index as f32 / count as f32;
                let (dx, dy) = (4.0 * angle.cos(), 4.0 * angle.sin());
                self.fighter(self.at(dx.round() as i32, dy.round() as i32))
            })
            .collect();
        for &fighter in &fighters {
            self.attack(fighter, target);
        }
        fighters
    }

    fn run(&mut self, seconds: f32) {
        self.sim.run_until(seconds, |_| false);
    }

    /// Plays on for `seconds`, as long as `holds` holds at every tick.
    fn watch(&mut self, seconds: f32, mut holds: impl FnMut(&mut World) -> bool) -> bool {
        let mut held = true;
        self.sim.run_until(seconds, |world| {
            held &= holds(world);
            !held
        });
        held
    }

    fn watch_until(&mut self, seconds: f32, done: impl FnMut(&mut World) -> bool) -> bool {
        self.sim.run_until(seconds, done)
    }

    fn claims(&mut self, cell: CellPos) -> u16 {
        let area = self.area;
        self.sim.world().resource::<TileClaims>().on(area, cell)
    }
}

/// The middle of the first square of ground in any area, six tiles each way, open to walk all over.
fn open_ground() -> (AreaId, CellPos) {
    content()
        .ids::<AreaDef>()
        .find_map(|area| {
            let grid = &area::load(content(), area).grid;
            let open = |center: &Pos<Tiles>| {
                let cell = center.cell();
                (-6..=6).all(|dy| (-6..=6).all(|dx| grid.walkable(cell.step((dx, dy)).center())))
            };
            grid.nodes()
                .iter()
                .copied()
                .find(open)
                .map(|at| (area, at.cell()))
        })
        .expect("open ground in some area")
}

fn resting(world: &World, actor: Entity) -> bool {
    !moving(world, actor) && position(world, actor).is_some_and(|at| at.on_center())
}

fn cell(world: &World, actor: Entity) -> CellPos {
    position(world, actor).expect("position").cell()
}

fn apart(a: CellPos, b: CellPos) -> i32 {
    (a.x - b.x).abs().max((a.y - b.y).abs())
}

fn crowds(world: &World, actors: &[Entity]) -> HashMap<CellPos, u32> {
    let mut crowds = HashMap::new();
    for &actor in actors {
        *crowds.entry(cell(world, actor)).or_default() += 1;
    }
    crowds
}

fn in_reach_of(world: &World, actors: &[Entity], target: Entity) -> bool {
    let target = cell(world, target);
    actors
        .iter()
        .all(|&actor| apart(cell(world, actor), target) <= 1)
}

fn rebuilt(world: &mut World) -> HashMap<(AreaId, CellPos), u16> {
    let mut counts = HashMap::new();
    for claim in world.query::<&TileClaim>().iter(world) {
        *counts.entry((claim.area, claim.cell)).or_default() += 1;
    }
    counts
}

fn indexed(world: &World) -> HashMap<(AreaId, CellPos), u16> {
    world.resource::<TileClaims>().claimed().collect()
}

/// Every standing actor claims where its walk ends, or where it stands; a fallen one claims nothing.
fn claims_follow_walks(world: &mut World) -> bool {
    let mut actors = world.query::<(Entity, &movement::Position, Option<&MoveTarget>)>();
    let actors: Vec<_> = actors
        .iter(world)
        .map(|(actor, at, goal)| (actor, at.pos, goal.map(|goal| goal.pos)))
        .collect();
    actors.into_iter().all(|(actor, at, goal)| {
        let claim = movement::claim_of(world, actor).map(|claim| claim.cell);
        if world.get::<npc::Npc>(actor).is_none()
            && world.get::<engine::systems::player::Owner>(actor).is_none()
        {
            return true;
        }
        if stat::is_dead(world, actor) {
            return claim.is_none();
        }
        claim == Some(goal.unwrap_or(at).cell())
    })
}
