use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use driver::{
    Player, area_key, area_named, beside_resident, clickable_point, ground_near, in_warp, taken,
};
use game::core::math::{Offset, Pos, WindowPx};
use game::core::tiling::Tiles;
use game::systems::input::gestures::ClickClaim;
use game::systems::input::map::InputAction;
use game::systems::probe::ProbeSnapshot;

use crate::playtest;

const LINE: usize = 12;
// A slow machine draws few frames, and the view follows the walk by up to a tile a frame, so a click
// aimed mid-walk lands up to this many tiles further along than aimed.
const DRIFT: usize = 2;
const CLEARANCE: f32 = 3.0;
// How far the walk goes with the button held, short enough that the pointer leading it stays on
// the line.
const HELD_FOR: f32 = 5.0;
const HITCH: Duration = Duration::from_millis(400);
// Slow enough on foot that a walk is still going, and seen going over several frames, when the
// driver looks and asks again, however few frames a slow machine draws.
const SLOW: &str = "stroller";
// Frames a walk may take to show it set off after its click.
const SETTING_OFF: u32 = 4;

// Where the player showed on screen, and where the server had them, frame by frame.
type Frames = Rc<RefCell<Vec<Shown>>>;

struct Shown {
    frame: u32,
    drawn: Pos<Tiles>,
    at: Pos<Tiles>,
}

#[test]
fn a_walk_sets_off_at_once_and_carries_on_unbroken_as_more_of_its_line_is_asked_for() {
    let mut playtest = playtest();
    let (mut player, step, tiles) = on_a_quiet_line(&mut playtest, SLOW);
    let start = player.walk_to(tiles[0]);
    let drawn = record_drawn(&mut player);

    // The first ask stops short of the line's farthest tile in view, so more of it is in view to ask
    // for straight after, before the walk can end on a machine that draws few frames.
    let (first_goal, at) = player.wait_for("the line in view", |seen| {
        let (farthest, _) = farthest_in_view(seen, &tiles, 2)?;
        let first_goal = farthest - 1;
        clickable_point(seen, tiles[first_goal]).map(|at| (first_goal, at))
    });
    player.point_at(at);
    let clicked = player.click();
    let (_, at) =
        farthest_in_view(&clicked, &tiles, first_goal + 1).expect("more of the line in view");
    player.point_at(at);
    let asked_again = player.click();
    let walking = asked_again.me.as_ref().expect("the player").drawn;
    assert!(
        (tiles[first_goal] - walking).dot(step) > 0.0,
        "the walk was at {walking:?}, done, before it was asked for more"
    );
    let set_off = drawn
        .borrow()
        .iter()
        .find(|shown| shown.frame > clicked.frame && shown.drawn != start)
        .map(|shown| shown.frame);
    assert!(
        set_off.is_some_and(|frame| frame <= clicked.frame + SETTING_OFF),
        "the walk set off in frame {set_off:?}, asked for in frame {}",
        clicked.frame
    );
    let end = player.come_to_rest();

    assert!(
        tiles[first_goal + 1..].contains(&end),
        "the walk ended at {end:?}, not on the line past {:?}",
        tiles[first_goal]
    );
    assert_unbroken(&drawn, clicked.frame, start, end, step);
}

#[test]
fn asking_again_for_tiles_along_the_way_walks_on_to_the_end_as_one_ask_does() {
    let mut playtest = playtest();
    let (mut player, step, tiles) = on_a_quiet_line(&mut playtest, SLOW);
    let start = player.walk_to(tiles[0]);
    let drawn = record_drawn(&mut player);

    let (goal, at) = player.wait_for("the line in view", |seen| farthest_in_view(seen, &tiles, 1));
    player.point_at(at);
    let clicked = player.click().frame;
    loop {
        let seen = player.snapshot();
        let walked = (seen.me.as_ref().expect("the player").drawn - tiles[0]).dot(step);
        let ahead = walked.round() as usize + 1 + DRIFT;
        if ahead >= goal {
            break;
        }
        player.point_at_tile(tiles[ahead]);
        player.click();
    }
    let end = player.come_to_rest();

    assert_eq!(end, tiles[goal]);
    assert_unbroken(&drawn, clicked, start, end, step);
}

#[test]
fn a_held_button_leading_the_walk_keeps_it_going_without_a_pause() {
    let mut playtest = playtest();
    let (mut player, step, tiles) = on_a_quiet_line(&mut playtest, SLOW);
    let start = player.walk_to(tiles[0]);
    let drawn = record_drawn(&mut player);

    // The pointer leads the walk by a tile, and by twice the walk one look takes more, so the walk
    // doesn't overtake it before the game sees it there, however few frames come. Before the walk,
    // a look is timed to judge the first lead by. The pointer moves on at least a tile each look,
    // faster than the walk, so a held button slow to follow it shows.
    let looking = Instant::now();
    let seen = player.wait_for("the line in view", |seen| {
        clickable_point(seen, tiles[1]).map(|_| seen.clone())
    });
    player.point_at(clickable_point(&seen, tiles[1]).expect("the line in view"));
    let look = looking.elapsed().as_secs_f32();
    let speed = seen.me.as_ref().expect("the player").speed.0.0;
    let mut along = 1.0 + 2.0 * speed * look;
    let first = on_the_line(&seen, &tiles, step, start, along);
    let pressed = player.point_at(first.expect("the line in view")).frame;
    player.holding_down(InputAction::Interact, |player| {
        let mut last = start;
        loop {
            let seen = player.snapshot();
            let me = seen.me.as_ref().expect("the player").drawn;
            let walked = (me - tiles[0]).dot(step);
            if walked >= HELD_FOR {
                break;
            }
            let lead = 1.0 + 2.0 * me.distance_to(last);
            last = me;
            along = (walked + lead).max(along + 1.0);
            if let Some(at) = on_the_line(&seen, &tiles, step, me, along) {
                assert_led(&player.point_at(at), step);
            }
        }
    });
    let end = player.come_to_rest();

    assert!(tiles.contains(&end), "the walk left its line, for {end:?}");
    assert_unbroken(&drawn, pressed, start, end, step);
}

#[test]
fn a_walk_held_up_along_the_way_shows_at_its_end_no_later_than_the_server_has_it_there() {
    let mut playtest = playtest();
    let (mut player, step, tiles) = on_a_quiet_line(&mut playtest, SLOW);
    let start = player.walk_to(tiles[0]);
    let drawn = record_drawn(&mut player);

    let (goal, at) = player.wait_for("the line in view", |seen| farthest_in_view(seen, &tiles, 1));
    player.point_at(at);
    let clicked = player.click().frame;
    loop {
        player.hitch(HITCH);
        let seen = player.snapshot();
        let walked = (seen.me.as_ref().expect("the player").drawn - tiles[0]).dot(step);
        let ahead = walked.round() as usize + 1 + DRIFT;
        if ahead >= goal {
            break;
        }
        player.point_at_tile(tiles[ahead]);
        player.click();
    }
    let end = player.come_to_rest();
    player.wait_until("the walk shown at its end", |snapshot| {
        snapshot.me.as_ref().is_some_and(|me| me.drawn == end)
    });

    assert_eq!(end, tiles[goal]);
    assert_unbroken(&drawn, clicked, start, end, step);
    let first = |there: fn(&Shown) -> Pos<Tiles>| {
        drawn
            .borrow()
            .iter()
            .find(|shown| shown.frame > clicked && there(shown) == end)
            .map(|shown| shown.frame)
            .expect("a frame with the walk at its end")
    };
    let (shown, heard) = (first(|shown| shown.drawn), first(|shown| shown.at));
    assert!(
        shown <= heard,
        "the walk showed at its end in frame {shown}, after the server's word of it in {heard}"
    );
}

fn on_a_quiet_line(
    playtest: &mut driver::Playtest,
    character: &str,
) -> (Player, Offset<Tiles>, Vec<Pos<Tiles>>) {
    let mut player = playtest.join_as(
        character,
        Some(beside_resident("glimmercap", "gnome_alchemist")),
    );
    player.in_world();
    let (step, tiles) = player.wait_for("a quiet straight line of ground", quiet_line);
    (player, step, tiles)
}

fn record_drawn(player: &mut Player) -> Frames {
    let drawn: Frames = Rc::default();
    let log = drawn.clone();
    player.observe(move |snapshot| {
        if let Some(me) = &snapshot.me
            && log
                .borrow()
                .last()
                .is_none_or(|shown| shown.frame < snapshot.frame)
        {
            log.borrow_mut().push(Shown {
                frame: snapshot.frame,
                drawn: me.drawn,
                at: me.at,
            });
        }
    });
    drawn
}

// From where it set off after `since` to where it came to rest, the walk moved on along `step` in
// every frame it showed.
fn assert_unbroken(
    drawn: &Frames,
    since: u32,
    start: Pos<Tiles>,
    end: Pos<Tiles>,
    step: Offset<Tiles>,
) {
    let drawn = drawn.borrow();
    let way: Vec<Pos<Tiles>> = drawn
        .iter()
        .filter(|shown| shown.frame > since && shown.drawn != start)
        .map(|shown| shown.drawn)
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

// From the frame the game sees the held button over a tile, the walk heads at least that far, so
// a walk the pointer leads never catches up with it however fast it goes.
fn assert_led(seen: &ProbeSnapshot, step: Offset<Tiles>) {
    let ClickClaim::Walk(over) = seen.claim else {
        return;
    };
    let end = seen.me.as_ref().and_then(|me| me.walking_to);
    assert!(
        end.is_some_and(|end| (end - over).dot(step) >= 0.0),
        "with the button held over {over:?}, the walk headed for {end:?}"
    );
}

// Where on screen the line lies `along` tiles on from its first tile, or, past its end or out of
// view, its farthest tile in view still ahead of `me`, leaving room past it for the pointer to drift.
fn on_the_line(
    seen: &ProbeSnapshot,
    tiles: &[Pos<Tiles>],
    step: Offset<Tiles>,
    me: Pos<Tiles>,
    along: f32,
) -> Option<Pos<WindowPx>> {
    let within = &tiles[..tiles.len() - DRIFT];
    let along = along.min((within.len() - 1) as f32);
    clickable_point(seen, tiles[0] + step * along).or_else(|| {
        within
            .iter()
            .rev()
            .filter(|&&tile| (tile - me).dot(step) > 0.0)
            .find_map(|&tile| clickable_point(seen, tile))
    })
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
