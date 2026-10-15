use driver::UiTarget;
use game::systems::input::map::InputAction;

use crate::playtest;

#[test]
fn turned_on_in_the_settings_a_frame_rate_meter_shows_in_the_bottom_left_corner() {
    let mut playtest = playtest();
    let mut player = playtest.join_as("talker", None);
    player.in_world();
    assert!(meter().find(&player.snapshot()).is_none());

    player.act(InputAction::ToggleSettings);
    player.click_ui(UiTarget::starting("Show FPS"));
    let shown = player.find_ui(meter());
    let screen = player.snapshot().screen.expect("a screen");

    let readout = shown.text.expect("the meter's readout");
    let (now, range) = readout.split_once(" FPS (").expect("a rate and its range");
    let (low, high) = range
        .trim_end_matches(')')
        .split_once('-')
        .expect("the lowest and highest rate");
    let [now, low, high] = [now, low, high].map(|rate| rate.parse::<u32>().expect("a rate"));
    assert!(low <= now && now <= high, "{readout}");
    assert!(shown.rect.min_x() >= 8.0 && shown.rect.max_x() < screen.width / 4.0);
    assert!(shown.rect.max_y() <= screen.height - 8.0 && shown.rect.min_y() > screen.height * 0.75);

    player.click_ui(UiTarget::starting("Show FPS"));
    player.wait_until("the meter to go", |snapshot| {
        meter().find(snapshot).is_none()
    });
}

fn meter() -> UiTarget {
    UiTarget::containing(" FPS (")
}
