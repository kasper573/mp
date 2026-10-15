use game::core::math::{Offset, Pos};
use game::core::tiling::{Cell, TilePos, Tiles};
use game::systems::area::{self, AreaDef, AreaId};
use game::systems::movement::{self, HeardMove, MoveRequest, MoveSeq, position};
use game::systems::player::CommandLock;

use crate::support::{Sim, content};

const TICKS: usize = 240;

#[test]
fn asking_again_for_the_tile_a_walk_heads_to_changes_nothing() {
    let once = Walk::start().toward(Offset::new(8.0, 0.0)).trail();
    let mut walk = Walk::start().toward(Offset::new(8.0, 0.0));
    let again = walk.trail_while(|walk| walk.ask(Offset::new(8.0, 0.0)));

    assert_eq!(again, once);
}

#[test]
fn asking_for_a_tile_further_along_the_line_walks_on_as_if_asked_for_it_at_first() {
    for end in [
        Offset::new(8.0, 0.0),
        Offset::new(0.0, -8.0),
        Offset::new(-7.0, 7.0),
    ] {
        let once = Walk::start().toward(end).trail();
        let mut walk = Walk::start().toward(end * 0.375);
        let mut ticks = 0;
        let extended = walk.trail_while(|walk| {
            ticks += 1;
            if ticks == 12 {
                walk.ask(end);
            }
        });

        assert_eq!(extended, once, "walking toward {end:?}");
    }
}

#[test]
fn asking_for_every_tile_along_a_walk_as_it_goes_walks_it_as_one() {
    let straight = [
        Offset::new(8.0, 0.0),
        Offset::new(0.0, -8.0),
        Offset::new(-7.0, 7.0),
    ];
    let oblique = [
        Offset::new(8.0, 3.0),
        Offset::new(-3.0, 7.0),
        Offset::new(5.0, -6.0),
    ];
    for end in straight {
        for ahead in 1..=3 {
            let once = Walk::start().toward(end).trail();
            assert_eq!(spam(&once, ahead), once, "{ahead} ahead toward {end:?}");
        }
    }
    for end in oblique {
        let once = Walk::start().toward(end).trail();
        assert_eq!(spam(&once, 1), once, "toward {end:?}");
    }
}

#[test]
fn asking_for_tiles_further_along_a_walk_as_it_goes_never_holds_it_up() {
    for end in [
        Offset::new(8.0, 3.0),
        Offset::new(-3.0, 7.0),
        Offset::new(5.0, -6.0),
    ] {
        for ahead in 2..=3 {
            let once = Walk::start().toward(end).trail();
            let spammed = spam(&once, ahead);
            let arrived = arrival(&once);

            assert_eq!(arrival(&spammed), arrived, "{ahead} ahead toward {end:?}");
            assert_eq!(spammed.last(), Some(&end));
            assert!(
                spammed[..=arrived]
                    .windows(2)
                    .all(|pair| pair[0] != pair[1]),
                "{ahead} ahead toward {end:?} paused on the way"
            );
        }
    }
}

#[test]
fn a_tile_on_the_way_ends_the_walk_there() {
    let end = Offset::new(8.0, 3.0);
    let once = Walk::start().toward(end).trail();
    let tiles = tiles_passed(&once);
    let stop = tiles[4];
    let mut walk = Walk::start().toward(end);
    let mut ticks = 0;
    let cut = walk.trail_while(|walk| {
        ticks += 1;
        if ticks == 5 {
            walk.ask(stop);
        }
    });

    let arrived = cut
        .iter()
        .position(|&at| at == stop)
        .expect("the walk to reach the tile on the way");
    assert_eq!(cut[..arrived], once[..arrived]);
    assert!(cut[arrived..].iter().all(|&at| at == stop));
}

#[test]
fn turning_back_mid_step_turns_at_once() {
    let mut walk = Walk::start().toward(Offset::new(6.0, 0.0));
    walk.ticks(3);
    let before = walk.at();
    assert!(before.x > 0.0 && before.x < 1.0, "mid-step: {before:?}");

    walk.ask(Offset::new(-6.0, 0.0));
    walk.ticks(1);

    assert!(walk.at().x < before.x);
    assert_eq!(walk.at().y, 0.0);
}

#[test]
fn a_walk_over_open_ground_keeps_to_the_straight_line() {
    for end in [
        Offset::new(7.0, 3.0),
        Offset::new(-2.0, 8.0),
        Offset::new(6.0, -5.0),
    ] {
        assert_keeps_to_the_line(&Walk::start().toward(end).trail(), end);
    }
}

#[test]
fn the_server_owns_up_to_the_latest_move_asked_of_it_heeded_or_not() {
    let mut walk = Walk::start();
    walk.ask(Offset::new(3.0, 0.0));
    walk.ask(Offset::new(4.0, 0.0));
    walk.ticks(1);
    walk.sim.world().entity_mut(walk.player).insert(CommandLock);
    walk.ask(Offset::new(-4.0, 0.0));
    walk.ticks(1);

    assert_eq!(walk.heard(), HeardMove(MoveSeq(3)));
}

struct Walk {
    sim: Sim,
    player: bevy_ecs::entity::Entity,
    start: Pos<Tiles>,
    asked: MoveSeq,
}

impl Walk {
    fn start() -> Walk {
        let (area, start) = open_ground(8);
        let mut sim = Sim::area(area);
        let player = sim.join(1);
        sim.tick();
        movement::relocate(sim.world(), player, start);
        Walk {
            sim,
            player,
            start,
            asked: MoveSeq::default(),
        }
    }

    fn toward(mut self, to: Offset<Tiles>) -> Walk {
        self.ask(to);
        self
    }

    fn ask(&mut self, to: Offset<Tiles>) {
        self.asked = MoveSeq(self.asked.0 + 1);
        let pos = self.start + to;
        self.sim.send(
            1,
            MoveRequest {
                pos,
                seq: self.asked,
            },
        );
    }

    fn ticks(&mut self, count: usize) {
        for _ in 0..count {
            self.sim.tick();
        }
    }

    fn at(&mut self) -> Offset<Tiles> {
        position(self.sim.world(), self.player).expect("the player") - self.start
    }

    fn heard(&mut self) -> HeardMove {
        *self
            .sim
            .world()
            .get::<HeardMove>(self.player)
            .expect("the latest move heard")
    }

    fn trail(&mut self) -> Vec<Offset<Tiles>> {
        self.trail_while(|_| {})
    }

    fn trail_while(&mut self, mut each_tick: impl FnMut(&mut Walk)) -> Vec<Offset<Tiles>> {
        (0..TICKS)
            .map(|_| {
                self.sim.tick();
                let at = self.at();
                each_tick(self);
                at
            })
            .collect()
    }
}

// Walks the way `once` went, asking each tick for the tile `ahead` tiles past the one nearest.
fn spam(once: &[Offset<Tiles>], ahead: usize) -> Vec<Offset<Tiles>> {
    let tiles = tiles_passed(once);
    let mut walk = Walk::start().toward(tiles[1]);
    walk.trail_while(|walk| {
        let at = walk.at();
        let nearest = (0..tiles.len())
            .min_by(|&a, &b| {
                (at - tiles[a])
                    .length()
                    .total_cmp(&(at - tiles[b]).length())
            })
            .expect("tiles along the walk");
        walk.ask(tiles[(nearest + ahead).min(tiles.len() - 1)]);
    })
}

fn arrival(trail: &[Offset<Tiles>]) -> usize {
    let end = trail.last().expect("a trail");
    trail
        .iter()
        .position(|at| at == end)
        .expect("the end of the trail")
}

fn assert_keeps_to_the_line(trail: &[Offset<Tiles>], end: Offset<Tiles>) {
    let length = end.length();
    for at in trail {
        let off = (at.x * end.y - at.y * end.x).abs() / length;
        assert!(
            off <= 0.5 + 1e-4,
            "{at:?} strays {off} from the line toward {end:?}"
        );
    }
}

// A walk steps from tile to neighboring tile, so the tile nearest it changes halfway through each
// step: the tiles nearest it in turn are the tiles it passes.
fn tiles_passed(trail: &[Offset<Tiles>]) -> Vec<Offset<Tiles>> {
    let mut tiles = vec![Offset::zero()];
    for at in trail {
        let nearest = at.to_point().snap().to_vector();
        if tiles.last() != Some(&nearest) {
            tiles.push(nearest);
        }
    }
    tiles
}

// The middle of the first square of ground, `reach` tiles each way, open to walk all over.
fn open_ground(reach: i32) -> (AreaId, Pos<Tiles>) {
    content()
        .ids::<AreaDef>()
        .find_map(|area| {
            let grid = &area::load(content(), area).grid;
            let open = |center: &Pos<Tiles>| {
                let cell = center.cell();
                (-reach..=reach).all(|dy| {
                    (-reach..=reach).all(|dx| grid.walkable(cell.step((dx, dy)).center()))
                })
            };
            grid.nodes().iter().copied().find(open).map(|at| (area, at))
        })
        .expect("open ground in some area")
}
