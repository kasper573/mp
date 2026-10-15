use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use driver::{WaitBudget, area_key, area_named, beside_resident, ground_near, in_warp, open};
use game::core::math::{Offset, Pos};
use game::core::tiling::Tiles;
use game::systems::probe::ProbeSnapshot;

use crate::playtest;

const LINE: usize = 7;
const FIRST_GOAL: usize = 4;
const CLEARANCE: f32 = 3.0;

// Where the player showed on screen, frame by frame.
type Frames = Vec<(u32, Pos<Tiles>)>;

#[test]
fn a_walk_sets_off_at_once_and_carries_on_unbroken_as_more_of_its_line_is_asked_for() {
    let mut playtest = playtest();
    let mut player = playtest.join_as(
        "traveler",
        Some(beside_resident("glimmercap", "gnome_alchemist")),
    );
    player.in_world();
    let (step, tiles) = player.wait_for("a quiet straight line of ground", quiet_line);
    let start = player.walk_to(tiles[0]);
    let drawn: Rc<RefCell<Frames>> = Rc::default();
    let log = drawn.clone();
    player.observe(move |snapshot| {
        if let Some(me) = &snapshot.me
            && log
                .borrow()
                .last()
                .is_none_or(|&(frame, _)| frame < snapshot.frame)
        {
            log.borrow_mut().push((snapshot.frame, me.drawn));
        }
    });

    player.point_at_tile(tiles[FIRST_GOAL]);
    let clicked = player.click().frame;
    player.wait_within(
        "the walk to set off",
        WaitBudget {
            time: Duration::ZERO,
            frames: 4,
        },
        |snapshot| {
            snapshot
                .me
                .as_ref()
                .is_some_and(|me| me.drawn != start)
                .then_some(())
        },
    );
    player.point_at_tile(tiles[LINE - 1]);
    player.click();
    let end = player.come_to_rest();

    assert_eq!(end, tiles[LINE - 1]);
    let drawn = drawn.borrow();
    let way: Vec<Pos<Tiles>> = drawn
        .iter()
        .filter(|(frame, at)| *frame > clicked && *at != start)
        .map(|&(_, at)| at)
        .take_while(|&at| at != end)
        .collect();
    assert!(!way.is_empty(), "the walk went unseen");
    for pair in way.windows(2) {
        let progress = (pair[1] - pair[0]).dot(step);
        assert!(
            progress > 0.0,
            "the walk held up or turned back between {:?} and {:?}",
            pair[0],
            pair[1]
        );
    }
}

// A level line of open ground near the player, one tile per step, so all of it stays in the wide
// view once the player stands at its start, and with nobody near enough to wander onto it during
// the walk: a click on them would talk instead.
fn quiet_line(seen: &ProbeSnapshot) -> Option<(Offset<Tiles>, Vec<Pos<Tiles>>)> {
    let area = area_key(seen)?;
    let grid = &area_named(area).grid;
    let me = seen.me.as_ref()?.at;
    let quiet = |tile: Pos<Tiles>| {
        grid.walkable(tile)
            && open(seen, tile)
            && !in_warp(seen, tile)
            && seen
                .actors
                .iter()
                .all(|other| other.at.distance_to(tile) > CLEARANCE)
    };
    let steps = [Offset::new(1.0, 0.0), Offset::new(-1.0, 0.0)];
    ground_near(area, me, Tiles(0.0)..=Tiles(6.0))
        .into_iter()
        .flat_map(|from| steps.iter().map(move |&step| (from, step)))
        .find_map(|(from, step)| {
            let tiles: Vec<Pos<Tiles>> = (0..LINE).map(|i| from + step * i as f32).collect();
            tiles
                .iter()
                .all(|&tile| quiet(tile))
                .then_some((step, tiles))
        })
}
