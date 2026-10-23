use bevy::prelude::*;
use bevy::time::Real;
use bevy_egui::EguiUserTextures;
use editor::app::Editor;
use editor::rows;
use editor::stage::{self, Posed, PosedActor, Scene};
use engine::core::math::Pos;
use engine::systems::actor::model::{MODEL_SPRITES, ModelDef};
use testkit::path;

use crate::support::{self, Frames};

#[test]
fn an_open_preview_draws_a_model_with_the_sheet_it_has_now() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = support::open(support::game(), &scratch);
    let hero = path("model", "hero");
    let mut world = World::new();
    world.init_resource::<Assets<Image>>();
    world.init_resource::<EguiUserTextures>();
    world.insert_resource(Time::<Real>::default());
    let mut frames = Frames::new(ui::egui::vec2(900.0, 700.0));
    let mut drawn_pixels = |editor: &mut Editor, world: &mut World| {
        let model = support::content(editor)
            .by_path::<ModelDef>(&hero)
            .expect("the hero's model");
        let posed = Scene::Posed(Posed {
            actors: vec![PosedActor::standing(model, Pos::new(1.0, 1.0))],
            ..Posed::default()
        });
        frames.run(Vec::new(), |ui| {
            stage::show(editor, ui, &hero, posed.clone(), false);
        });
        stage::sync(editor, world);
        let image = world
            .query::<&Sprite>()
            .single(world)
            .expect("the hero is staged")
            .image
            .clone();
        world
            .resource::<Assets<Image>>()
            .get(&image)
            .and_then(|image| image.data.clone())
            .expect("the sheet's pixels")
    };
    assert_eq!(drawn_pixels(&mut editor, &mut world), [0, 0, 0, 0]);

    let red = scratch.path().join("red.png");
    image::RgbaImage::from_pixel(1, 1, image::Rgba([255, 0, 0, 255]))
        .save(&red)
        .expect("a red sheet");
    rows::put_parts(&mut editor, &hero, MODEL_SPRITES, &[red]).expect("the sheet is replaced");
    support::settled(&mut editor);

    assert_eq!(drawn_pixels(&mut editor, &mut world), [255, 0, 0, 255]);
}
