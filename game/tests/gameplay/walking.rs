use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use driver::{
    WaitBudget, area_key, area_named, beside_resident, clickable_point, ground_near, in_warp, taken,
};
use game::core::math::{Offset, Pos, WindowPx};
use game::core::tiling::Tiles;
use game::systems::probe::ProbeSnapshot;

use crate::playtest;

const LINE: usize = 12;
// A slow machine draws few frames, and the view follows the walk by up to a tile a frame, so a click
// aimed mid-walk lands up to this many tiles further along than aimed.
const DRIFT: usize = 2;
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

    let (first_goal, at) =
        player.wait_for("the line in view", |seen| farthest_in_view(seen, &tiles, 1));
    player.point_at(at);
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
    let (_, at) = player.wait_for("more of the line in view", |seen| {
        farthest_in_view(seen, &tiles, first_goal + 1)
    });
    player.point_at(at);
    player.click();
    let end = player.come_to_rest();

    assert!(
        tiles[first_goal + 1..].contains(&end),
        "the walk ended at {end:?}, not on the line past {:?}",
        tiles[first_goal]
    );
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

// The farthest tile of the line from `from` on that a click can reach now, and where to click it,
// leaving room past it for the click to drift.
fn farthest_in_view(
    seen: &ProbeSnapshot,
    tiles: &[Pos<Tiles>],
    from: usize,
) -> Option<(usize, Pos<WindowPx>)> {
    (from..tiles.len() - DRIFT).rev().find_map(|index| {
        let tile = tiles[index];
        clickable_point(seen, tile)
            .filter(|_| !taken(seen, tile))
            .map(|at| (index, at))
    })
}

// A level line of open ground starting near the player, one tile per step, with nobody near enough
// to wander onto it during the walk: a click on them would talk instead.
fn quiet_line(seen: &ProbeSnapshot) -> Option<(Offset<Tiles>, Vec<Pos<Tiles>>)> {
    let area = area_key(seen)?;
    let grid = &area_named(area).grid;
    let me = seen.me.as_ref()?.at;
    let quiet = |tile: Pos<Tiles>| {
        grid.walkable(tile)
            && !taken(seen, tile)
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
