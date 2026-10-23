use ui::egui;

use testkit::path;

use crate::support::{self, Frames};

#[test]
fn ctrl_and_the_wheel_over_a_tilesets_sheet_zoom_it_in_and_out() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game()
        .row(
            "tileset",
            "rocks",
            serde_json::json!({ "tile": testkit::TILE }),
        )
        .part("tileset", "rocks", "image.png", testkit::png(256, 256));
    let mut editor = support::open(game, &scratch);
    let tileset = path("tileset", "rocks");
    let mut frames = Frames::new(egui::vec2(1600.0, 900.0));
    let mut show = |editor: &mut editor::app::Editor, events: Vec<egui::Event>| {
        frames.run(events, |ui| {
            editor::views::tileset::show(editor, ui, &tileset)
        })
    };
    show(&mut editor, Vec::new());
    show(&mut editor, Vec::new());
    let zoom =
        |editor: &editor::app::Editor| editor.views.tileset.view(&path("tileset", "rocks")).zoom;

    for (notches, zooms_in) in [(1.0, true), (-1.0, false)] {
        let before = zoom(&editor);
        let ctrl = egui::Modifiers::CTRL | egui::Modifiers::COMMAND;
        let wheel = vec![
            egui::Event::ModifiersChanged(ctrl),
            egui::Event::PointerMoved(egui::pos2(800.0, 450.0)),
            egui::Event::MouseWheel {
                unit: egui::MouseWheelUnit::Line,
                delta: egui::vec2(0.0, notches),
                phase: egui::TouchPhase::Move,
                modifiers: ctrl,
            },
        ];
        show(&mut editor, wheel);
        show(
            &mut editor,
            vec![egui::Event::ModifiersChanged(egui::Modifiers::NONE)],
        );
        assert_eq!(zoom(&editor) > before, zooms_in, "{notches} notch");
    }
}
