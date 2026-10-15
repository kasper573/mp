use driver::{Player, UiTarget, content, holding, id};
use game::core::content::Fixture;
use game::core::math::{Offset, Pos, Rect, Size, WindowPx};
use game::systems::input::map::InputAction;
use game::systems::interface::CursorShape;
use game::systems::item::ItemDef;
use game::systems::probe::{ProbeSnapshot, ProbeUiElement};
use game::systems::settings::DEFAULT_SNAP;
use strum::VariantArray;

use crate::playtest;

#[test]
fn a_window_dragged_about_however_wildly_keeps_the_spot_it_was_grabbed_by_under_the_pointer() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    player.act(InputAction::ToggleInventory);
    let before = player.find_ui("Inventory");

    let (grabbed, dragged) = player.dragging_ui("Inventory", wild_sweep);

    let title = UiTarget::text("Inventory")
        .find(&dragged)
        .expect("the window being dragged");
    assert_near(
        title.rect.min() - before.rect.min(),
        pointer(&dragged) - grabbed,
        "the window's move",
    );
}

#[test]
fn a_widget_dragged_about_however_wildly_keeps_the_spot_it_was_grabbed_by_under_the_pointer() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    let before = player.find_ui("Talker");

    let (grabbed, dragged) = player.dragging_ui("Talker", wild_sweep);

    let name = UiTarget::text("Talker")
        .find(&dragged)
        .expect("the widget being dragged");
    assert_near(
        name.rect.min() - before.rect.min(),
        pointer(&dragged) - grabbed,
        "the widget's move",
    );
}

#[test]
fn a_carried_item_follows_the_pointer_however_wildly_it_moves_and_stays_in_the_bag_when_let_go() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("armed", None);
    player.in_world();
    player.act(InputAction::ToggleInventory);
    let sword = id::<ItemDef>("rusty_sword").get(content()).icon.as_str();

    let (_, carried) = player.carrying(UiTarget::image(sword), wild_sweep);

    let at = pointer(&carried);
    let follows = carried
        .ui
        .iter()
        .filter(|element| element.image.as_deref() == Some(sword))
        .any(|element| element.rect.center().distance_to(at) <= 1.0);
    assert!(follows, "the sword wasn't drawn on the pointer");
    player.wait_until("the sword still in the bag", |snapshot| {
        holding(snapshot, "rusty_sword") == 1
    });
}

#[test]
fn a_window_let_go_lands_on_the_grid_and_opens_there_again() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    player.act(InputAction::ToggleInventory);
    player.find_ui("Inventory");

    player.drag_ui("Inventory", Offset::new(-75.0, 41.0));
    let landed = player.wait_for("the window to land on the grid", |snapshot| {
        window_rect(snapshot, "Inventory").filter(|rect| on_grid(rect.min()))
    });
    player.act(InputAction::ToggleInventory);
    player.wait_until("the window to close", |snapshot| {
        window_rect(snapshot, "Inventory").is_none()
    });
    player.act(InputAction::ToggleInventory);

    player.wait_until("the window where it landed", |snapshot| {
        window_rect(snapshot, "Inventory") == Some(landed)
    });
}

#[test]
fn a_window_resized_by_its_corner_follows_the_pointer_and_lands_on_the_grid() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    player.act(InputAction::ToggleInventory);
    let before = player.wait_for("the window", |snapshot| window_rect(snapshot, "Inventory"));
    let corner = player.find_ui("Resize");

    let (grabbed, held) = player.dragging_ui("Resize", |player| {
        let grabbed = pointer(&player.snapshot());
        (
            grabbed,
            player.sweep_pointer(&[grabbed + Offset::new(57.0, 33.0)]),
        )
    });

    let grip = UiTarget::text("Resize").find(&held).expect("the corner");
    assert_near(
        grip.rect.max() - corner.rect.max(),
        pointer(&held) - grabbed,
        "the corner's move",
    );
    let landed = player.wait_for("the window's size to land on the grid", |snapshot| {
        window_rect(snapshot, "Inventory").filter(|rect| {
            on_grid(Pos::new(rect.size.width, rect.size.height)) && rect.size != before.size
        })
    });
    assert_eq!(
        landed.min(),
        before.min(),
        "the window moved as it was resized"
    );
}

// Back and forth across most of the screen, faster than frames come, pushing what is dragged
// against every edge on the way, then on to rest with the drawn cursor hanging over a corner, and
// back. Gives where the pointer grabbed and how the interface looked at the last rest.
fn wild_sweep(player: &mut Player) -> (Pos<WindowPx>, ProbeSnapshot) {
    let seen = player.snapshot();
    let grabbed = pointer(&seen);
    let screen = seen.screen.expect("a screen");
    let rest = grabbed.lerp(Pos::new(screen.width, screen.height) * 0.5, 0.5);
    let mut path = wiggle(grabbed, screen);
    path.push(rest);
    let rested = player.sweep_pointer(&path);
    assert_cursor_drawn_on_the_pointer(&rested);
    let cornered = player.sweep_pointer(&[overhanging_corner(&rested, screen)]);
    assert_cursor_drawn_on_the_pointer(&cornered);
    let back = player.sweep_pointer(&[rest]);
    assert_cursor_drawn_on_the_pointer(&back);
    (grabbed, back)
}

fn wiggle(from: Pos<WindowPx>, screen: Size<WindowPx>) -> Vec<Pos<WindowPx>> {
    (1..=WIGGLE)
        .map(|step| {
            let turn = step as f32;
            let at = from
                + Offset::new(
                    screen.width * 0.45 * (turn * 0.37).sin(),
                    screen.height * 0.45 * (turn * 0.23).sin(),
                );
            Pos::new(
                at.x.clamp(1.0, screen.width - 2.0),
                at.y.clamp(1.0, screen.height - 2.0),
            )
        })
        .collect()
}

const WIGGLE: usize = 240;

// Where the drawn cursor hangs a quarter of its size over the bottom right corner of the screen.
fn overhanging_corner(seen: &ProbeSnapshot, screen: Size<WindowPx>) -> Pos<WindowPx> {
    let (cursor, hotspot) = drawn_cursor(seen).expect("a cursor drawn in the frame");
    let size = cursor.rect.size;
    Pos::new(screen.width, screen.height) + hotspot - Offset::new(size.width, size.height) * 0.75
}

fn assert_cursor_drawn_on_the_pointer(seen: &ProbeSnapshot) {
    assert!(
        !seen.input.system_cursor,
        "the system drew the cursor over a drag"
    );
    let (cursor, hotspot) = drawn_cursor(seen).expect("a cursor drawn in the frame");
    assert_near(
        cursor.rect.min() + hotspot - pointer(seen),
        Offset::new(0.0, 0.0),
        "the drawn cursor's offset from the pointer",
    );
}

// The game's own cursor in the interface, and its hotspot.
fn drawn_cursor(seen: &ProbeSnapshot) -> Option<(&ProbeUiElement, Offset<WindowPx>)> {
    CursorShape::VARIANTS.iter().find_map(|shape| {
        let cursor = shape.get(content());
        seen.ui
            .iter()
            .find(|element| element.image.as_deref() == Some(cursor.image.as_str()))
            .map(|element| {
                let hotspot = Offset::new(f32::from(cursor.hotspot.x), f32::from(cursor.hotspot.y));
                (element, hotspot)
            })
    })
}

// The smallest piece of the interface holding the window's title.
fn window_rect(seen: &ProbeSnapshot, title: &str) -> Option<Rect<WindowPx>> {
    let title = UiTarget::text(title).find(seen)?.rect.center();
    seen.covered
        .iter()
        .filter(|rect| rect.contains(title))
        .min_by(|a, b| a.size.width.total_cmp(&b.size.width))
        .copied()
}

fn on_grid(at: Pos<WindowPx>) -> bool {
    let off = |value: f32| (value / DEFAULT_SNAP.0 - (value / DEFAULT_SNAP.0).round()).abs();
    off(at.x) < 0.01 && off(at.y) < 0.01
}

fn pointer(seen: &ProbeSnapshot) -> Pos<WindowPx> {
    seen.input.cursor.expect("the pointer")
}

fn assert_near(seen: Offset<WindowPx>, expected: Offset<WindowPx>, what: &str) {
    assert!(
        (seen.x - expected.x).abs() <= 1.0 && (seen.y - expected.y).abs() <= 1.0,
        "{what} was {seen:?}, not {expected:?}"
    );
}
