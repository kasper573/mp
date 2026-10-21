use std::collections::HashSet;

use editor::icons;
use editor::project::Project;
use editor::thumbs::Thumbnails;
use engine::systems::registry;
use serde_json::json;
use testkit::Game;

use crate::support;

#[test]
fn every_type_of_content_has_an_icon_of_its_own() {
    let unknown = icons::of_table("no_such_type");
    let mut seen = HashSet::new();
    for table in registry().table_names() {
        let icon = icons::of_table(table);
        assert_ne!(icon, unknown, "{table} has no icon");
        assert!(seen.insert(format!("{icon:?}")), "{table} shares its icon");
    }
}

#[test]
fn an_image_stands_in_for_its_icon_only_while_it_is_small() {
    let ctx = egui::Context::default();
    let (_scratch, project) = open(
        support::game()
            .asset("cap.png", png(16, 16))
            .asset("map.png", png(128, 96)),
    );
    let mut thumbs = Thumbnails::default();
    let mut budget = u32::MAX;

    let cap = icons::preview(&ctx, &mut thumbs, &project, "cap.png", &mut budget);
    assert_eq!(cap.map(|cap| cap.size), Some(egui::vec2(16.0, 16.0)));
    assert!(icons::preview(&ctx, &mut thumbs, &project, "map.png", &mut budget).is_none());
    assert!(
        icons::picture(&ctx, &mut thumbs, &project, "map.png", &mut budget).is_some(),
        "a big picture still shows where pictures are large"
    );
}

#[test]
fn a_content_file_stands_in_by_the_picture_it_names() {
    let ctx = egui::Context::default();
    let (_scratch, project) = open(
        support::game()
            .item("cap", json!({ "kind": { "type": "resource" } }))
            .asset("icons/cap.png", png(16, 16)),
    );
    let mut thumbs = Thumbnails::default();
    let mut budget = u32::MAX;
    let cap = testkit::path("item", "cap");
    let preview = icons::preview(&ctx, &mut thumbs, &project, &cap, &mut budget);
    assert_eq!(preview.map(|cap| cap.size), Some(egui::vec2(16.0, 16.0)));
}

#[test]
fn a_kind_that_keeps_its_icon_never_stands_in_by_its_files_pictures() {
    let ctx = egui::Context::default();
    let (_scratch, project) =
        open(support::game().area("field", &testkit::Map::open(4, 4), json!([])));
    let mut thumbs = Thumbnails::default();
    let mut budget = u32::MAX;
    let tileset = testkit::path("tileset", "field_ground");
    assert!(icons::preview(&ctx, &mut thumbs, &project, &tileset, &mut budget).is_none());
    assert!(icons::picture(&ctx, &mut thumbs, &project, &tileset, &mut budget).is_none());
}

#[test]
fn a_model_stands_in_by_what_its_first_frame_idling_toward_the_camera_draws() {
    let ctx = egui::Context::default();
    let model = |game: Game, name: &str, frame: u32, figure: (u32, u32)| {
        game.model(name, 1.0, json!([]))
            .edit("model", name, |model| {
                model["sprites"]["frame_size"] = json!({ "width": frame, "height": frame });
                model["sprites"]["actions"]["idle"]["s"] =
                    json!([{ "frame": 2, "ms": 100 }, { "frame": 3, "ms": 100 }]);
            })
            .part("model", name, "sprites.png", sheet(frame, 4, 2, figure))
    };
    let game = model(
        model(support::game(), "orc", 16, (5, 7)),
        "ogre",
        96,
        (40, 60),
    );
    let (_scratch, project) = open(game);
    let mut thumbs = Thumbnails::default();
    let mut budget = u32::MAX;

    let orc = icons::preview(
        &ctx,
        &mut thumbs,
        &project,
        &testkit::path("model", "orc"),
        &mut budget,
    )
    .expect("a 16 px frame stands in");
    assert_eq!(
        orc.size,
        egui::vec2(5.0, 7.0),
        "the third frame of four, cut to the figure it draws"
    );
    assert!(
        icons::preview(
            &ctx,
            &mut thumbs,
            &project,
            &testkit::path("model", "ogre"),
            &mut budget
        )
        .is_none(),
        "a 96 px frame is too big to read as an icon"
    );
}

/// `game` written to a scratch folder and opened, loaded through.
fn open(game: Game) -> (tempfile::TempDir, Project) {
    let scratch = tempfile::tempdir().expect("scratch");
    let project = support::open(game, &scratch).project.expect("a project");
    (scratch, project)
}

/// A sheet of `count` transparent square frames of `side` pixels in a row, the `drawn`th holding a
/// figure of `figure` pixels in its middle.
fn sheet(side: u32, count: u32, drawn: u32, figure: (u32, u32)) -> Vec<u8> {
    let mut image = image::RgbaImage::new(side * count, side);
    let left = drawn * side + (side - figure.0) / 2;
    let top = (side - figure.1) / 2;
    for x in left..left + figure.0 {
        for y in top..top + figure.1 {
            image.put_pixel(x, y, image::Rgba([10, 20, 30, 255]));
        }
    }
    encoded(&image)
}

fn png(width: u32, height: u32) -> Vec<u8> {
    encoded(&image::RgbaImage::from_pixel(
        width,
        height,
        image::Rgba([10, 20, 30, 255]),
    ))
}

fn encoded(image: &image::RgbaImage) -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, image::ImageFormat::Png)
        .expect("encodes");
    bytes.into_inner()
}
