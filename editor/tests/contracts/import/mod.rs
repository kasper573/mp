mod art;
mod exports;

use std::collections::BTreeMap;
use std::path::PathBuf;
use ui::egui;

use editor::import::formats::{self, ExportFormat, ExportStrip};
use editor::import::model::{self, CuePlacement};
use editor::import::records::{ImportMapping, ImportRecord};
use editor::import::tileset;
use editor::views::area::grid::BundlePalette;
use editor::views::model::{ModelStrip, strip_of};
use editor::views::tileset::SheetRect;
use engine::core::content::FolderReader;
use engine::core::math::Direction;
use engine::systems::actor::model::SheetFrame;
use engine::systems::actor::{Action, ModelDef};
use engine::systems::area::grid::{self, PaletteRow};
use engine::systems::area::tileset::{TilesetDef, Walk};
use image::RgbaImage;
use testkit::path;

use self::art::{FRAME, TILE, fill};

#[test]
fn an_aseprite_sheet_imports_to_the_expected_row_and_image() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (reader, row) = art::walker();
    let sheet = art::walker_sheet();
    let strips = strips_of(&row, &sheet);
    let files = exports::aseprite(dir.path(), "walker", &strips, true);
    let dropped = formats::sort_out(&files).expect("a sheet and its json");
    let export = formats::decode(&dropped).expect("decodes");
    assert_eq!(export.kind, ExportFormat::SheetJson);
    assert_eq!(export.frame, FRAME);
    assert!(export.timed());
    let plan = plan_for(&row, &reader, &sheet, &export, None);
    assert!(plan.missing.is_empty());
    assert_eq!(plan.ready(), Ok(()));
    assert_eq!(plan.cues_kept(), plan.cues_total);
    let built = model::build(
        &plan,
        &export,
        row.clone(),
        &reader,
        &path("model", "walker"),
    )
    .expect("builds");
    assert_eq!(
        built.image,
        format!("{}/sprites.png", path("model", "walker"))
    );
    let image = formats::decode_image_bytes(&built.png).expect("a png");
    assert_eq!(image.dimensions(), (8 * FRAME.0, 40 * FRAME.1));
    for (name, frames) in &strips {
        let after = strip_of(&built.row, strip_named(name));
        assert_eq!(after.len(), frames.len(), "{name}");
        for (frame, (pixels, ms)) in after.iter().zip(frames) {
            assert_eq!(frame.ms, *ms, "{name}");
            let index = frame.frame;
            let cut = image::imageops::crop_imm(
                &image,
                (index % 8) * FRAME.0,
                (index / 8) * FRAME.1,
                FRAME.0,
                FRAME.1,
            )
            .to_image();
            assert_eq!(
                formats::pixel_hash(&cut),
                formats::pixel_hash(pixels),
                "{name} pixels"
            );
        }
    }
    assert_eq!(built.row.hitbox, row.hitbox);
    assert_eq!(built.row.modules.len(), row.modules.len());
    assert_eq!(
        apex(&built.row, Direction::S),
        vec![false, false, false, false, false, true, false, false]
    );
}

#[test]
fn a_texturepacker_sheet_with_rotated_frames_imports_alike() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (reader, row) = art::walker();
    let sheet = art::walker_sheet();
    let strips = strips_of(&row, &sheet);
    let files = exports::texturepacker(dir.path(), "walker", &strips);
    let export = formats::decode(&formats::sort_out(&files).unwrap()).expect("decodes");
    assert!(!export.timed(), "TexturePacker carries no durations");
    for (name, frames) in &strips {
        let strip = export.strip(name).expect(name);
        for (frame, (pixels, _)) in strip.frames.iter().zip(frames) {
            assert_eq!(frame.hash, formats::pixel_hash(pixels), "{name} unrotated");
        }
    }
    let (mapping, notes) = model::default_mapping(&export);
    assert!(mapping.values().all(Option::is_some));
    assert!(
        notes
            .values()
            .all(|note| *note == model::MappingNote::ByName)
    );
    let asked: BTreeMap<String, u32> = export.strips.iter().map(|s| (s.tag.clone(), 90)).collect();
    let plan = model::plan(
        Some(&row),
        &reader,
        Some(&sheet),
        &export,
        &mapping,
        &asked,
        None,
    );
    let strip = plan.strips.iter().find(|s| s.name == "walk_s").unwrap();
    assert!(strip.lengths.iter().all(|ms| *ms == 90));
}

#[test]
fn a_grid_asks_the_frame_size_and_maps_rows_by_order() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (_, row) = art::walker();
    let sheet = art::walker_sheet();
    let strips = strips_of(&row, &sheet);
    let file = exports::grid(dir.path(), "walker", &strips, FRAME);
    let mut export = formats::decode(&formats::sort_out(&[file]).unwrap()).expect("decodes");
    assert_eq!(export.kind, ExportFormat::Grid);
    assert!(export.strips.is_empty());
    assert!(export.cut_grid(FRAME.0 + 2, FRAME.1).is_err());
    export.cut_grid(FRAME.0, FRAME.1).expect("cuts");
    assert_eq!(export.strips.len(), 40);
    let (mapping, notes) = model::default_mapping(&export);
    assert_eq!(mapping["row 1"].as_deref(), Some("idle_s"));
    assert_eq!(mapping["row 40"].as_deref(), Some("death_w"));
    assert!(
        notes
            .values()
            .all(|note| *note == model::MappingNote::ByOrder)
    );
}

#[test]
fn a_numbered_sequence_imports_and_a_gap_is_refused() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (_, row) = art::walker();
    let sheet = art::walker_sheet();
    let strips = strips_of(&row, &sheet);
    let files = exports::sequence(dir.path(), &strips[8..11]);
    let export = formats::decode(&formats::sort_out(&files).unwrap()).expect("decodes");
    assert_eq!(export.kind, ExportFormat::Sequence);
    assert_eq!(export.strips.len(), 3);
    assert_eq!(export.strip("walk_s").unwrap().frames.len(), 8);
    let gap: Vec<PathBuf> = files
        .into_iter()
        .filter(|f| !f.ends_with("walk_sw_4.png"))
        .collect();
    let refused = formats::decode(&formats::sort_out(&gap).unwrap()).unwrap_err();
    assert!(refused.contains("walk_sw skips"), "{refused}");
}

#[test]
fn a_gif_and_an_apng_carry_their_lengths() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let water = art::tileset();
    let frames = art::water(&water);
    let gif = exports::gif(dir.path(), "beach-water", &frames, 25);
    let export = formats::decode(&formats::sort_out(&[gif]).unwrap()).expect("decodes");
    assert_eq!(export.kind, ExportFormat::Gif);
    assert_eq!(export.frame, (art::WATER * TILE, art::WATER * TILE));
    let strip = &export.strips[0];
    assert_eq!(strip.tag, "beach-water");
    assert_eq!(
        strip.frames.iter().map(|f| f.ms).collect::<Vec<_>>(),
        vec![Some(250); 4]
    );
    let apng = exports::apng(dir.path(), "beach-water", &frames, (1, 3));
    let export = formats::decode(&formats::sort_out(&[apng]).unwrap()).expect("decodes");
    assert_eq!(export.kind, ExportFormat::Apng);
    assert_eq!(export.strips[0].frames[0].ms, Some(333), "half up");
    for (frame, pixels) in export.strips[0].frames.iter().zip(&frames) {
        assert_eq!(frame.hash, formats::pixel_hash(pixels));
    }
}

#[test]
fn importing_again_keeps_the_cues_that_still_fit_and_asks_for_the_rest() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (reader, row) = art::walker();
    let sheet = art::walker_sheet();
    let mut strips = strips_of(&row, &sheet);
    let run_e = strips.iter_mut().find(|(name, _)| name == "run_e").unwrap();
    run_e.1.remove(5);
    run_e.1.remove(4);
    let attack_s = strips
        .iter_mut()
        .find(|(name, _)| name == "attack_s")
        .unwrap();
    attack_s.1.remove(2);
    attack_s.1.remove(1);
    let files = exports::aseprite(dir.path(), "walker", &strips, true);
    let export = formats::decode(&formats::sort_out(&files).unwrap()).expect("decodes");
    let plan = plan_for(&row, &reader, &sheet, &export, None);
    let run = plan.strips.iter().find(|s| s.name == "run_e").unwrap();
    assert_eq!(run.before.len(), 8);
    assert_eq!(run.after_count(), 6);
    let steps: Vec<(usize, Option<usize>)> =
        run.cues.iter().map(|cue| (cue.from, cue.to)).collect();
    assert_eq!(
        steps,
        vec![(0, Some(0)), (4, None)],
        "the first step follows its frame, the fifth has nothing to follow"
    );
    assert_eq!(run.needs_place(), 1);
    let attack = plan.strips.iter().find(|s| s.name == "attack_s").unwrap();
    assert!(
        attack
            .cues
            .iter()
            .all(|cue| cue.from == 5 && cue.to == Some(3) && cue.by_pixels)
    );
    assert_eq!(plan.ready(), Err("one cue needs a place".to_owned()));
    let mut plan = plan;
    plan.strip_mut("run_e").unwrap().cues[1].choice = Some(CuePlacement::Frame(3));
    assert_eq!(plan.ready(), Ok(()));
    let built = model::build(&plan, &export, row.clone(), &reader, "walker").expect("builds");
    let after = strip_of(&built.row, strip_named("run_e"));
    assert_eq!(after.len(), 6);
    assert!(after[0].step);
    assert!(after[3].step);
    assert_eq!(
        apex(&built.row, Direction::S),
        vec![false, false, false, true, false, false]
    );
    let sound = strip_of(&built.row, strip_named("attack_s"))[3]
        .sound
        .expect("the attack's sound");
    assert_eq!(reader.path_of(sound), Some(path("sfx", "slash03").as_str()));
}

#[test]
fn importing_again_asks_before_replacing_lengths_edited_here() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (reader, mut row) = art::walker();
    let sheet = art::walker_sheet();
    let strips = strips_of(&row, &sheet);
    let files = exports::aseprite(dir.path(), "walker", &strips, false);
    let export = formats::decode(&formats::sort_out(&files).unwrap()).expect("decodes");
    let (mapping, _) = model::default_mapping(&export);
    let plan = model::plan(
        Some(&row),
        &reader,
        Some(&sheet),
        &export,
        &mapping,
        &BTreeMap::new(),
        None,
    );
    let built = model::build(&plan, &export, row.clone(), &reader, "walker").unwrap();
    let record = model::record(&export, "walker", &mapping, built.lengths.clone());
    assert_eq!(record.strips["attack_s"], art::ATTACK_MS.to_vec());
    let attack = row
        .sprites
        .actions
        .get_mut(&Action::Attack)
        .and_then(|strips| strips.get_mut(&Direction::S))
        .expect("an attack facing south");
    attack[4].ms = 90;
    attack[5].ms = 80;
    let plan = model::plan(
        Some(&row),
        &reader,
        Some(&sheet),
        &export,
        &mapping,
        &BTreeMap::new(),
        Some(&record),
    );
    assert!(!plan.decided());
    assert_eq!(plan.retimed(), 1);
    let attack = plan.strips.iter().find(|s| s.name == "attack_s").unwrap();
    let retimed = attack.retimed.as_ref().expect("asks which lengths win");
    assert_eq!(retimed.here[4], 90);
    assert!(retimed.keep_here);
    assert_eq!(attack.final_lengths()[4], 90);
    let mut export_wins = attack.clone();
    export_wins.retimed.as_mut().unwrap().keep_here = false;
    assert_eq!(export_wins.final_lengths()[4], 60);
    let untouched = plan.strips.iter().find(|s| s.name == "walk_s").unwrap();
    assert!(untouched.retimed.is_none());
    let same = model::plan(
        Some(&row),
        &reader,
        Some(&sheet),
        &export,
        &mapping,
        &BTreeMap::new(),
        None,
    );
    assert_eq!(
        same.retimed(),
        0,
        "without a record the export's lengths simply win"
    );
}

#[test]
fn a_tileset_grid_is_cut_whole_and_a_wider_one_keeps_tile_data_and_palettes() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (reader, row) = beach();
    let old = art::tileset();
    let spaced = exports::spaced_grid(dir.path(), "beach", &old, 16, 2, 1, 1);
    let export = formats::decode(&formats::sort_out(&[spaced]).unwrap()).unwrap();
    let settings = tileset::TileGridSettings {
        tile: 16,
        margin: 2,
        spacing: 1,
        extruded: 1,
    };
    let cut = tileset::cut_grid(export.sheet.as_ref().unwrap(), settings).expect("whole tiles");
    assert_eq!((cut.columns, cut.rows), (art::COLUMNS, art::ROWS));
    assert_eq!(
        formats::pixel_hash(&cut.image),
        formats::pixel_hash(&old),
        "margins, spacing and extrusion dropped"
    );
    assert!(
        tileset::cut_grid(
            export.sheet.as_ref().unwrap(),
            tileset::TileGridSettings {
                tile: 16,
                ..settings
            }
        )
        .is_ok()
    );
    assert!(
        tileset::cut_grid(
            export.sheet.as_ref().unwrap(),
            tileset::TileGridSettings {
                tile: 17,
                ..settings
            }
        )
        .is_err()
    );

    let mut wide = RgbaImage::new(old.width() + 64, old.height());
    image::GenericImage::copy_from(&mut wide, &old, 0, 0).unwrap();
    fill(&mut wide, old.width(), 0, 64, 16, [200, 90, 120, 255]);
    let island = art::island_palette();
    let palettes = vec![BundlePalette {
        bundle: path("area", "island"),
        rows: palette(&island),
    }];
    let plan =
        tileset::tile_plan(&old, &row, &wide, &path("tileset", "beach"), &palettes).expect("plans");
    assert_eq!(
        (plan.old_columns, plan.new_columns),
        (art::COLUMNS, art::COLUMNS + 4)
    );
    assert!(plan.gone.is_empty());
    assert_eq!(plan.new_tiles, 4);
    assert_eq!(
        plan.matches[&art::PAVED],
        (art::PAVED / art::COLUMNS) * (art::COLUMNS + 4) + art::PAVED % art::COLUMNS,
        "found by pixels at the same column and row"
    );
    assert_eq!(plan.ready(), Ok(()));
    let (new_row, rewritten) =
        tileset::apply_tile_plan(&plan, &row, &path("tileset", "beach"), &palettes).unwrap();
    assert_eq!(
        row.tiles.len() - plan.blank_data,
        new_row.tiles.len(),
        "transparent tiles carry nothing"
    );
    for (old_index, data) in &row.tiles {
        let Some(target) = plan.matches.get(old_index) else {
            assert!(
                formats::cell(&old, (TILE, TILE), *old_index)
                    .is_some_and(|t| formats::is_blank(&t))
            );
            continue;
        };
        let moved = &new_row.tiles[target];
        assert_eq!(moved.walk, data.walk);
        assert_eq!(moved.surface, data.surface);
        assert_eq!(moved.animation.len(), data.animation.len());
        for (before, after) in data.animation.iter().zip(&moved.animation) {
            assert_eq!(after.tile, plan.matches[&before.tile]);
            assert_eq!(after.ms, before.ms);
        }
    }
    let after = &rewritten
        .iter()
        .find(|palette| palette.bundle == path("area", "island"))
        .expect("island rewritten")
        .rows;
    let before = palette(&island);
    assert_eq!(before.len(), after.len());
    for (old, new) in before.iter().zip(after) {
        assert_eq!(plan.matches[&old.tile], new.tile);
        assert_eq!(old.flip, new.flip);
    }

    let game = dir.path().join("game");
    beach_game().write_to(&game);
    let beach = game.join(path("tileset", "beach"));
    wide.save(beach.join("image.png")).unwrap();
    let written = reader
        .write(&path("tileset", "beach"), &new_row)
        .expect("the tileset writes");
    for (file, bytes) in written.files {
        std::fs::write(game.join(file), bytes).unwrap();
    }
    for palette in &rewritten {
        std::fs::write(
            game.join(format!("{}/palette.csv", palette.bundle)),
            grid::write_palette(&palette.rows),
        )
        .unwrap();
    }
    let loaded = engine::systems::load_content(
        std::sync::Arc::new(engine::core::content::FilesystemFolder(game)),
        "cargo test failed",
    );
    if let Err(report) = &loaded {
        panic!("the folder loads after the re-import:\n{report}");
    }
}

#[test]
fn importing_onto_an_open_tileset_lands_on_a_click_and_the_tileset_shows_on() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let mut editor = crate::support::open(beach_game(), &dir);
    let beach = path("tileset", "beach");
    let old = art::tileset();
    let mut wide = RgbaImage::new(old.width() + 64, old.height());
    image::GenericImage::copy_from(&mut wide, &old, 0, 0).unwrap();
    fill(&mut wide, old.width(), 0, 64, 16, [200, 90, 120, 255]);
    let delivered = dir.path().join("beach_wide.png");
    wide.save(&delivered).unwrap();
    editor.open_tab(editor::tabs::EditorTab::Tileset { key: beach.clone() });
    editor.place_tabs();
    editor::import::dropped(&mut editor, vec![delivered]);
    let until = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !editor.views.tileset.reimports.contains_key(&beach) {
        assert!(std::time::Instant::now() < until, "the import reads");
        editor::import::poll(&mut editor);
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    let mut frames = crate::support::Frames::new(egui::vec2(1600.0, 1000.0));
    let mut show = |editor: &mut editor::app::Editor, events| {
        frames.run(events, |ui| {
            editor::views::tileset::show(editor, ui, &beach)
        })
    };
    let confirm = show(&mut editor, Vec::new()).at("Import, as one step");

    for events in crate::support::click(confirm) {
        show(&mut editor, events);
    }
    let drawn = show(&mut editor, Vec::new());

    let image = crate::support::files(&mut editor)
        .get(&format!("{beach}/image.png"))
        .map(|bytes| image::load_from_memory(bytes).expect("a png").to_rgba8());
    assert_eq!(image.map(|image| image.width()), Some(wide.width()));
    assert!(drawn.rect("Import, as one step").is_none(), "{drawn:?}");
}

#[test]
fn tiles_selected_on_a_sheet_take_the_brush_in_one_step() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let mut editor = crate::support::open(beach_game(), &dir);
    let beach = path("tileset", "beach");
    editor.open_tab(editor::tabs::EditorTab::Tileset { key: beach.clone() });
    editor.place_tabs();
    let mut frames = crate::support::Frames::new(egui::vec2(1600.0, 1000.0));
    let mut show = |editor: &mut editor::app::Editor, events| {
        frames.run(events, |ui| {
            editor::views::tileset::show(editor, ui, &beach)
        })
    };
    show(&mut editor, Vec::new());
    let selection = SheetRect {
        x: 2,
        y: 3,
        w: 4,
        h: 2,
    };
    let tiles: Vec<u32> = selection.tiles(art::COLUMNS).collect();
    editor.views.tileset.view_mut(&beach).selection = Some(selection);
    editor::views::tileset::select_tile(&mut editor, &beach, tiles[0]);
    let walks = |editor: &mut editor::app::Editor| -> Vec<Option<Walk>> {
        let row = crate::support::settled(editor)
            .read::<TilesetDef>(&beach)
            .expect("the tileset reads");
        tiles.iter().map(|tile| row.walk(*tile)).collect()
    };
    let before = walks(&mut editor);
    let paint = show(&mut editor, Vec::new()).at("Paint walk: blocks on these tiles");

    for events in crate::support::click(paint) {
        show(&mut editor, events);
    }

    assert_eq!(walks(&mut editor), vec![Some(Walk::Blocks); tiles.len()]);
    editor.undo();
    assert_eq!(walks(&mut editor), before);
}

#[test]
fn a_gone_tile_still_painted_blocks_until_replaced() {
    let (_, row) = beach();
    let old = art::tileset();
    let mut changed = old.clone();
    fill(
        &mut changed,
        (art::PAVED % art::COLUMNS) * TILE,
        (art::PAVED / art::COLUMNS) * TILE,
        TILE,
        TILE,
        [1, 2, 3, 255],
    );
    let beach = path("tileset", "beach");
    let palettes = vec![BundlePalette {
        bundle: path("area", "island"),
        rows: palette(&format!(
            "tileset,tile,flip\n{beach},{},\n{beach},{},\n",
            art::PAVED,
            art::PAVED + 1
        )),
    }];
    let mut plan = tileset::tile_plan(&old, &row, &changed, &beach, &palettes).expect("plans");
    assert_eq!(plan.gone, vec![art::PAVED]);
    assert!(plan.gone_used.contains_key(&art::PAVED));
    assert!(plan.ready().is_err());
    plan.replacements.insert(art::PAVED, Some(art::PAVED + 1));
    assert_eq!(plan.ready(), Ok(()));
    let (_, rewritten) = tileset::apply_tile_plan(&plan, &row, &beach, &palettes).unwrap();
    assert_eq!(rewritten[0].rows[0].tile, art::PAVED + 1);
}

#[test]
fn an_animation_lands_on_a_block_reusing_frames_found_by_pixels() {
    let dir = tempfile::tempdir().expect("a scratch folder");
    let (_, row) = beach();
    let water = art::tileset();
    let frames = art::water(&water);
    let gif = exports::gif(dir.path(), "beach-water", &frames, 25);
    let export = formats::decode(&formats::sort_out(&[gif]).unwrap()).unwrap();
    let plan = tileset::anim_plan(&water, &row, &export, true, (1, 1)).expect("plans");
    assert_eq!(
        plan.animated() as u32,
        art::WATER * art::WATER - art::STILL_WATER
    );
    assert_eq!(plan.still as u32, art::STILL_WATER);
    assert!(
        plan.new_images.is_empty(),
        "every frame is on the tileset already"
    );
    assert!(plan.fits.is_some());
    let (png, new_row) = tileset::apply_anim_plan(&plan, &water, &row, &export).unwrap();
    assert!(png.is_none(), "nothing appended, nothing redrawn");
    let first = art::COLUMNS + 1;
    let animation = &new_row.tiles[&first].animation;
    let tiles: Vec<u32> = animation.iter().map(|frame| frame.tile).collect();
    assert_eq!(tiles, (0..4).map(|k| first + 9 * k).collect::<Vec<_>>());
    assert!(animation.iter().all(|frame| frame.ms == 250));
    let frozen = exports::gif(
        dir.path(),
        "beach-still",
        &[frames[0].clone(), frames[0].clone()],
        25,
    );
    let frozen = formats::decode(&formats::sort_out(&[frozen]).unwrap()).unwrap();
    let still = tileset::anim_plan(&water, &row, &frozen, true, (1, 1));
    assert!(still.is_err(), "a block that never changes is refused");
    let mut fresh = frames.clone();
    fill(&mut fresh[1], 0, 0, TILE, TILE, [9, 9, 9, 255]);
    let gif = exports::gif(dir.path(), "beach-water-new", &fresh, 25);
    let export = formats::decode(&formats::sort_out(&[gif]).unwrap()).unwrap();
    let plan = tileset::anim_plan(&water, &row, &export, true, (1, 1)).unwrap();
    assert_eq!(plan.new_images.len(), 1);
    let (png, new_row) = tileset::apply_anim_plan(&plan, &water, &row, &export).unwrap();
    let grown = formats::decode_image_bytes(&png.expect("appended")).unwrap();
    assert_eq!(
        grown.height(),
        water.height() + TILE,
        "new frames go after the last tile"
    );
    assert_eq!(
        new_row.tiles[&first].animation[1].tile,
        art::COLUMNS * art::ROWS
    );
}

#[test]
fn import_records_written_by_earlier_editors_still_read() {
    let written = serde_json::json!([
        {
            "export": "/art/walker.png",
            "files": ["/art/walker.png", "/art/walker.json"],
            "table": "model",
            "key": "walker",
            "mapping": { "idle": "idle_s", "flourish": "skip" },
            "size": 10,
            "hash": "0011",
            "strips": { "idle_s": [100, 120] },
            "part": ""
        },
        {
            "export": "/art/beach.png",
            "files": ["/art/beach.png"],
            "table": "tileset",
            "key": "beach",
            "mapping": { "grid": { "tile": 16, "margin": 2, "spacing": 1, "extruded": 1 } },
            "size": 4,
            "hash": "2233",
            "strips": {},
            "part": ""
        },
        {
            "export": "/art/water.gif",
            "files": ["/art/water.gif"],
            "table": "tileset",
            "key": "beach",
            "mapping": { "animation": { "column": 3, "row": 4 } },
            "size": 4,
            "hash": "4455",
            "strips": {},
            "part": "animation 3,4"
        }
    ]);
    let records: Vec<ImportRecord> = serde_json::from_value(written).expect("reads");
    assert_eq!(
        records[1].mapping,
        ImportMapping::Grid {
            grid: tileset::TileGridSettings {
                tile: 16,
                margin: 2,
                spacing: 1,
                extruded: 1,
            }
        }
    );
    assert_eq!(
        records.iter().map(ImportRecord::block).collect::<Vec<_>>(),
        vec![None, None, Some(tileset::TileBlock { column: 3, row: 4 })]
    );
    let strips = ["idle", "flourish"].map(|tag| ExportStrip {
        tag: tag.to_owned(),
        frames: Vec::new(),
    });
    let export = formats::AnimationExport::new(Vec::new(), ExportFormat::SheetJson, strips.into());
    let mapping = model::recorded_mapping(&records[0], &export);
    assert_eq!(mapping["idle"], Some("idle_s".to_owned()));
    assert_eq!(mapping["flourish"], None, "a skipped tag stays skipped");
    let rewritten: Vec<ImportRecord> =
        serde_json::from_value(serde_json::to_value(&records).unwrap()).expect("reads back");
    assert!(
        rewritten
            .iter()
            .zip(&records)
            .all(|(again, record)| again.mapping == record.mapping && again.files == record.files)
    );
}

/// The beach tileset of `beach_game`, read as the game reads it, and the reader it was read with.
fn beach() -> (FolderReader, TilesetDef) {
    let reader = FolderReader::new(
        engine::systems::registry(),
        std::sync::Arc::new(beach_game().folder()),
    );
    let tileset = reader
        .read::<TilesetDef>(&path("tileset", "beach"))
        .expect("the beach tileset reads");
    (reader, tileset)
}

/// A whole game whose island is painted with the beach tileset.
fn beach_game() -> testkit::Game {
    let mut tileset = Vec::new();
    art::tileset()
        .write_to(
            &mut std::io::Cursor::new(&mut tileset),
            image::ImageFormat::Png,
        )
        .unwrap();
    testkit::Game::new()
        .area("island", &testkit::Map::open(5, 5), serde_json::json!([]))
        .hero("island", 2.0, 2.0)
        .engine_rows()
        .sfx("step")
        .row(
            "surface",
            "sand",
            serde_json::json!({ "name": "Sand", "footstep": path("sfx", "step") }),
        )
        .row("tileset", "beach", art::tileset_row())
        .part("tileset", "beach", "image.png", tileset)
        .part("area", "island", "palette.csv", art::island_palette())
        .whole()
}

fn strip_named(name: &str) -> ModelStrip {
    let (action, direction) = name.split_once('_').expect("action_direction");
    ModelStrip::parse(action, direction).expect("a strip of a model")
}

fn apex(row: &ModelDef, direction: Direction) -> Vec<bool> {
    strip_of(
        row,
        ModelStrip {
            action: Action::Attack,
            direction,
        },
    )
    .iter()
    .map(|frame: &SheetFrame| frame.apex)
    .collect()
}

fn strips_of(row: &ModelDef, sheet: &RgbaImage) -> Vec<(String, Vec<(RgbaImage, u32)>)> {
    let size = row.sprites.frame_size;
    let (fw, fh) = (size.width, size.height);
    let columns = sheet.width() / fw;
    model::strip_names()
        .into_iter()
        .map(|name| {
            let frames = strip_of(row, strip_named(&name))
                .iter()
                .map(|frame| {
                    let index = frame.frame;
                    let cut = image::imageops::crop_imm(
                        sheet,
                        (index % columns) * fw,
                        (index / columns) * fh,
                        fw,
                        fh,
                    )
                    .to_image();
                    (cut, frame.ms)
                })
                .collect();
            (name, frames)
        })
        .collect()
}

fn palette(text: &str) -> Vec<PaletteRow> {
    let file = grid::GridFile {
        path: "palette.csv",
        text,
    };
    grid::read_palette(file, &mut Vec::new()).expect("a palette")
}

fn plan_for(
    row: &ModelDef,
    reader: &FolderReader,
    sheet: &RgbaImage,
    export: &formats::AnimationExport,
    record: Option<&ImportRecord>,
) -> model::ModelImportPlan {
    let (mapping, _) = model::default_mapping(export);
    model::plan(
        Some(row),
        reader,
        Some(sheet),
        export,
        &mapping,
        &BTreeMap::new(),
        record,
    )
}
