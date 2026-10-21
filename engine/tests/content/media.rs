use serde_json::json;
use testkit::{Game, path, png, wav};

/// The rule and file of every error the game is refused for.
fn refusals(game: Game) -> Vec<(&'static str, String)> {
    let report = game.try_load().err().expect("refused");
    report
        .errors
        .iter()
        .map(|error| (error.problem.rule, error.file.clone()))
        .collect()
}

fn damaged(mut bytes: Vec<u8>, from_end: usize) -> Vec<u8> {
    let at = bytes.len() - from_end;
    for byte in &mut bytes[at..at + 16] {
        *byte ^= 0xff;
    }
    bytes
}

#[test]
fn an_image_damaged_past_its_header_is_refused() {
    let sheet = format!("{}/sprites.png", path("model", "orc"));
    let game = Game::new()
        .model("orc", 1.0, json!([]))
        .file(&sheet, damaged(png(32, 32), 30));
    assert_eq!(refusals(game), [("unreadable image", sheet)]);
}

#[test]
fn a_cut_short_image_is_refused() {
    let mut cut = png(32, 32);
    cut.truncate(cut.len() - 20);
    let game = Game::new().file("icons/cap.png", cut);
    assert_eq!(
        refusals(game),
        [("unreadable image", "icons/cap.png".to_owned())]
    );
}

#[test]
fn a_cut_short_sound_is_refused() {
    let clip = format!("{}/clip.wav", path("sfx", "hit"));
    let mut cut = wav();
    cut.truncate(cut.len() - 10);
    let game = Game::new().sfx("hit").file(&clip, cut);
    assert_eq!(refusals(game), [("unreadable sound", clip)]);
}

#[test]
fn a_sound_the_game_cannot_play_is_refused() {
    let mut garbled = wav();
    garbled[20] = 0x77;
    let game = Game::new().file("sounds/hum.wav", garbled);
    assert_eq!(
        refusals(game),
        [("unreadable sound", "sounds/hum.wav".to_owned())]
    );
}

#[test]
fn a_font_that_does_not_parse_is_refused() {
    let mut font = b"OTTO".to_vec();
    font.extend([0; 12]);
    let game = Game::new().file("fonts/hand.otf", font);
    assert_eq!(
        refusals(game),
        [("unreadable font", "fonts/hand.otf".to_owned())]
    );
}

#[test]
fn whole_media_loads() {
    Game::new()
        .model("orc", 1.0, json!([]))
        .sfx("hit")
        .file("icons/cap.png", png(8, 8))
        .load();
}
