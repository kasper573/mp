use driver::{Player, beside_resident, content, id};
use game::core::math::{Rect, WindowPx};
use game::systems::actor::ActorModel;
use game::systems::npc::NpcDef;

use crate::playtest;

const TUCK: f32 = 50.0;
const WIDE: (u32, u32) = (1600, 720);
const NARROW: (u32, u32) = (900, 720);

#[test]
fn a_bust_stands_tucked_behind_the_box_on_a_wide_screen() {
    let mut playtest = playtest();
    let mut player = playtest.join_as_on("talker", Some(beside_resident("island", "grisha")), WIDE);
    player.talk_to("grisha");
    let (figure, dialogue) = grisha_on_stage(&mut player);
    let near = figure.0;
    assert!(
        (near - (dialogue.max_x() - TUCK)).abs() <= 1.0,
        "the figure's near edge at {near}, the box's edge at {}",
        dialogue.max_x()
    );
}

#[test]
fn a_bust_stays_on_a_narrow_screen() {
    let mut playtest = playtest();
    let mut player =
        playtest.join_as_on("talker", Some(beside_resident("island", "grisha")), NARROW);
    player.talk_to("grisha");
    let (figure, _) = grisha_on_stage(&mut player);
    let far = figure.1;
    assert!(
        (far - NARROW.0 as f32).abs() <= 1.0,
        "the figure ends at {far} on a screen {} wide",
        NARROW.0
    );
}

// Where Grisha's figure spans across the screen, and the dialogue box, once the stage holds still.
fn grisha_on_stage(player: &mut Player) -> ((f32, f32), Rect<WindowPx>) {
    let grisha = id::<NpcDef>("grisha").get(content());
    let model = grisha.model.get(content());
    let busts: Vec<&str> = model
        .busts()
        .expect("Grisha has busts")
        .all()
        .map(|bust| bust.as_str())
        .collect();
    let figure = ActorModel::get(content(), grisha.model)
        .bust_figure()
        .expect("Grisha's busts show a figure");
    let settled = player.settled();
    let bust = settled
        .ui
        .iter()
        .find(|element| {
            element
                .image
                .as_deref()
                .is_some_and(|image| busts.contains(&image))
        })
        .expect("Grisha's bust on stage");
    let dialogue = settled
        .stage
        .as_ref()
        .and_then(|stage| stage.rect)
        .expect("the dialogue box");
    let rect = bust.rect;
    (
        (
            rect.min_x() + figure.left * rect.width(),
            rect.min_x() + figure.right * rect.width(),
        ),
        dialogue,
    )
}
