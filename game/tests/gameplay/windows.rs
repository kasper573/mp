use driver::{UiTarget, content};
use game::core::content::Fixture;
use game::core::math::{Offset, WindowPx};
use game::systems::input::map::InputAction;
use game::systems::interface::CursorShape;
use game::systems::probe::{ProbeSnapshot, ProbeUiElement};
use strum::VariantArray;

use crate::playtest;

#[test]
fn a_dragged_window_and_the_cursor_dragging_it_show_in_the_same_frame() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    player.act(InputAction::ToggleInventory);
    let before = player.find_ui("Inventory");

    let (grabbed, dragged) = player.dragging_ui("Inventory", |player| {
        let grabbed = player.snapshot().input.cursor.expect("the pointer");
        player.point_at(grabbed + Offset::new(-40.0, 20.0));
        (
            grabbed,
            player.point_at(grabbed + Offset::new(-120.0, 60.0)),
        )
    });

    let pointer = dragged.input.cursor.expect("the pointer");
    let moved = pointer - grabbed;
    let title = UiTarget::text("Inventory")
        .find(&dragged)
        .expect("the window being dragged");
    assert_near(
        title.rect.min() - before.rect.min(),
        moved,
        "the window's move",
    );
    assert!(
        !dragged.input.system_cursor,
        "the system drew the cursor over a drag"
    );
    let (cursor, hotspot) = drawn_cursor(&dragged).expect("a cursor drawn in the frame");
    assert_near(
        cursor.rect.min() + hotspot - pointer,
        Offset::new(0.0, 0.0),
        "the drawn cursor's offset from the pointer",
    );

    player.wait_until("the system to draw the cursor again", |snapshot| {
        snapshot.input.system_cursor && drawn_cursor(snapshot).is_none()
    });
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

fn assert_near(seen: Offset<WindowPx>, expected: Offset<WindowPx>, what: &str) {
    assert!(
        (seen.x - expected.x).abs() <= 1.0 && (seen.y - expected.y).abs() <= 1.0,
        "{what} was {seen:?}, not {expected:?}"
    );
}
