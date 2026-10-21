use std::sync::Arc;

use engine::core::audio::playback::{SfxDef, SfxRoleDef};
use engine::core::content::{ContentFolder, FolderReader, write};
use engine::systems::GameSettings;
use engine::systems::actor::model::{GenericExpression, ModelDef, ModelModule};
use engine::systems::area::AreaDef;
use serde_json::json;
use testkit::{Game, path};

use crate::support::game;

fn reader(game: &Game) -> FolderReader {
    FolderReader::new(game.registry(), Arc::new(game.folder()))
}

#[test]
fn a_bundle_reads_with_its_parts() {
    let game = game().model("hero", 1.0, json!([])).busts("hero");
    let model: ModelDef = reader(&game).read(&path("model", "hero")).expect("reads");

    let hero = path("model", "hero");
    assert_eq!(model.sprites.image.as_str(), format!("{hero}/sprites.png"));
    let busts = model
        .modules
        .iter()
        .find_map(|module| match module {
            ModelModule::Bust(busts) => Some(busts),
            _ => None,
        })
        .expect("a bust module");
    assert_eq!(
        busts.generic.of(GenericExpression::Angry).as_str(),
        format!("{hero}/busts/angry.png")
    );
}

#[test]
fn a_reference_reads_as_the_id_of_the_path_it_names() {
    let game = game().sfx("hit");
    let reader = reader(&game);
    let sfx: SfxDef = reader.read(&path("sfx", "hit")).expect("reads");

    assert_eq!(
        reader.path_of(sfx.role),
        Some(path("sfx_role", "sounds").as_str())
    );
    assert_eq!(
        reader.id_of::<SfxRoleDef>(&path("sfx_role", "sounds")),
        Some(sfx.role)
    );
}

#[test]
fn a_file_naming_a_path_no_file_has_does_not_read() {
    let game = game().sfx("hit").edit("sfx", "hit", |sfx| {
        sfx["role"] = json!("nowhere/gone.sfx_role.json");
    });
    let errors = reader(&game)
        .read::<SfxDef>(&path("sfx", "hit"))
        .err()
        .expect("refused");
    assert!(!errors.is_empty());
}

#[test]
fn a_file_of_another_type_does_not_read() {
    let game = game().sfx("hit");
    assert!(reader(&game).read::<ModelDef>(&path("sfx", "hit")).is_err());
}

#[test]
fn a_file_writes_back_exactly_as_writing_the_whole_game_does() {
    let game = || {
        game()
            .sfx("hit")
            .model("hero", 1.0, json!([]))
            .busts("hero")
    };
    let whole = tempfile::tempdir().expect("a folder");
    write(game().registry(), game().load(), whole.path()).expect("written");
    let game = game();
    let reader = reader(&game);
    let same_as_whole = |files: std::collections::BTreeMap<String, Vec<u8>>| {
        assert!(!files.is_empty());
        for (file, bytes) in files {
            let written = std::fs::read(whole.path().join(&file)).expect("written whole");
            assert_eq!(bytes, written, "{file}");
        }
    };

    let area = path("area", "start");
    let start: AreaDef = reader.read(&area).expect("reads");
    same_as_whole(reader.write(&area, &start).expect("writes").files);
    let hero = path("model", "hero");
    let model: ModelDef = reader.read(&hero).expect("reads");
    same_as_whole(reader.write(&hero, &model).expect("writes").files);
    let settings: GameSettings = reader.settings().expect("reads");
    same_as_whole(reader.write_settings(&settings).expect("writes"));
}

#[test]
fn an_area_writes_its_scene_and_grids_beside_its_fields() {
    let game = game();
    let reader = reader(&game);
    let area = path("area", "start");
    let start: AreaDef = reader.read(&area).expect("reads");

    let files = reader.write(&area, &start).expect("writes").files;

    let folder = game.folder();
    for file in files.keys() {
        assert!(folder.read(file).is_ok(), "{file} is a file the area keeps");
    }
    assert!(files.contains_key(&format!("{area}/scene.json")));
    assert!(files.contains_key(&format!("{area}/layers/ground.csv")));
}

#[test]
fn a_part_an_area_no_longer_writes_is_removed() {
    let game = game();
    let reader = reader(&game);
    let area = path("area", "start");
    let mut start: AreaDef = reader.read(&area).expect("reads");
    start.blueprint.scene.grids.layers.clear();

    let written = reader.write(&area, &start).expect("writes");

    let ground = format!("{area}/layers/ground.csv");
    assert!(!written.files.contains_key(&ground));
    assert_eq!(written.removed, [ground]);
}
