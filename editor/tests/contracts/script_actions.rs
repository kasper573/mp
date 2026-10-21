use std::sync::Arc;

use editor::app::Editor;
use editor::project::Project;
use editor::schema::SchemaShapes;
use editor::user::{EditorSettings, UserFolder};
use editor::views::script::{self, ScriptDoc, ScriptRef, ScriptRow};
use engine::core::script::{Node, VariableType};
use engine::systems::script::ScriptDef;
use serde_json::json;
use testkit::path;

use crate::support;

const SCREEN: egui::Vec2 = egui::vec2(1600.0, 1000.0);

#[test]
fn deleting_several_selected_nodes_deletes_every_one_of_them() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let at = talk();
    let mut frames = Frames::new();
    frames.run(&mut editor, &at, Vec::new());
    let doc = ScriptDoc::load(&editor, &at).expect("the script");
    let gone = ["ask".to_owned(), "answer".to_owned()];
    script::select_nodes(&mut editor, &doc, &gone);

    editor.views.script.keys.delete = true;
    frames.run(&mut editor, &at, Vec::new());

    let names: Vec<String> = read(&editor).nodes.keys().cloned().collect();
    assert_eq!(names, ["start"]);
}

#[test]
fn duplicating_several_selected_nodes_copies_every_one_of_them() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let at = talk();
    let mut frames = Frames::new();
    frames.run(&mut editor, &at, Vec::new());
    let doc = ScriptDoc::load(&editor, &at).expect("the script");
    script::select_nodes(&mut editor, &doc, &["ask".to_owned(), "answer".to_owned()]);

    editor.views.script.keys.duplicate = true;
    frames.run(&mut editor, &at, Vec::new());

    assert_eq!(read(&editor).nodes.len(), 5);
}

#[test]
fn entering_a_line_keeps_what_was_typed_into_it_and_adds_one_after() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let at = talk();
    let mut frames = Frames::new();
    let line = line_on_card(&mut editor, &at, &mut frames);

    let end = egui::pos2(line.right() - 1.0, line.center().y);
    for events in [
        vec![egui::Event::PointerMoved(end)],
        vec![click(end, true)],
        vec![click(end, false)],
        vec![key(egui::Key::End, true), key(egui::Key::End, false)],
        vec![egui::Event::Text(" Speak up.".to_owned())],
        vec![key(egui::Key::Enter, true), key(egui::Key::Enter, false)],
    ] {
        frames.run(&mut editor, &at, events);
    }

    assert_eq!(ask_lines(&editor), ["Well? Speak up.", ""]);
}

#[test]
fn entering_inside_a_line_keeps_it_whole_and_adds_one_after() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(&scratch);
    let at = talk();
    let mut frames = Frames::new();
    let line = line_on_card(&mut editor, &at, &mut frames);

    let start = egui::pos2(line.left() + 1.0, line.center().y);
    for events in [
        vec![egui::Event::PointerMoved(start)],
        vec![click(start, true)],
        vec![click(start, false)],
        vec![key(egui::Key::Home, true), key(egui::Key::Home, false)],
        vec![key(egui::Key::Enter, true), key(egui::Key::Enter, false)],
    ] {
        frames.run(&mut editor, &at, events);
    }

    assert_eq!(ask_lines(&editor), ["Well?", ""]);
}

#[test]
fn every_module_naming_a_script_is_read_where_it_names_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let say = json!({ "type": "dialogue", "lines": [{ "by": { "type": "narrator" }, "text": ["Ding."] }], "choices": [{ "label": ["Bye."] }] });
    let game = support::game()
        .script(
            "chime",
            "area",
            json!({ "found": { "type": "on", "event": "discovered", "next": "say" }, "say": say }),
        )
        .script(
            "door",
            "object",
            json!({ "entered": { "type": "on", "event": "entered", "by": "characters", "next": "say" }, "say": say }),
        )
        .npc(
            "keeper",
            10.0,
            json!([{ "type": "script", "script": path("script", "talk") }]),
        )
        .edit_scene("area", support::AREA, |scene| {
            let scene = scene.as_array_mut().expect("a scene");
            scene.push(json!({ "type": "script", "label": "Bells", "script": path("script", "chime") }));
            scene.push(json!({
                "type": "object",
                "name": "door",
                "shape": { "type": "rect", "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },
                "scripts": [{ "script": path("script", "door") }],
            }));
        });
    let editor = open_game(game, &scratch);
    let project = editor.project.as_ref().expect("a project");
    assert!(
        project.loads(),
        "{:?}",
        project.report.as_ref().map(ToString::to_string)
    );
    let reader = project.reader();

    for script in ["talk", "chime", "door"] {
        let key = path("script", script);
        let named = project.usages.files_naming(&key);
        assert!(!named.is_empty(), "something names {key}");
        for (file, pointers) in named {
            for pointer in pointers {
                let module = ScriptRef::parse(&pointer)
                    .module
                    .and_then(|at| at.module_in(project, &file))
                    .unwrap_or_else(|| panic!("{file} {pointer} holds a script module"));
                assert_eq!(reader.path_of(module.script), Some(key.as_str()));
            }
        }
    }
}

/// Where the first line of `ask` is drawn on its card, once `ask` is selected.
fn line_on_card(editor: &mut Editor, at: &ScriptRow, frames: &mut Frames) -> egui::Rect {
    frames.run(editor, at, Vec::new());
    let doc = ScriptDoc::load(editor, at).expect("the script");
    script::select_nodes(editor, &doc, &["ask".to_owned()]);
    let texts = frames.run(editor, at, Vec::new());
    texts
        .iter()
        .filter(|(text, _)| text == "Well?")
        .map(|(_, rect)| *rect)
        .min_by(|a, b| a.left().total_cmp(&b.left()))
        .unwrap_or_else(|| panic!("the line is drawn on its card: {texts:?}"))
}

fn ask_lines(editor: &Editor) -> Vec<String> {
    let Some(Node::Dialogue(ask)) = read(editor).nodes.get("ask").cloned() else {
        panic!("ask is a dialogue");
    };
    ask.lines
        .iter()
        .map(|line| editor::spans::plain(&line.text))
        .collect()
}

#[test]
fn a_condition_inside_a_query_is_edited_as_a_condition() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game().row(
        "script",
        "watch",
        json!({
            "runs_on": "npc",
            "locals": { "target": "actor" },
            "nodes": {
                "start": { "type": "on", "event": "started", "next": "found" },
                "found": {
                    "type": "if",
                    "test": { "type": "present", "actor": { "type": "local", "local": "target" } },
                    "yes": "rest",
                    "no": "rest",
                },
                "rest": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "rest" },
            },
        }),
    );
    let mut editor = open_game(game, &scratch);
    let at = ScriptRow::new(path("script", "watch"));
    let mut frames = Frames::new();
    frames.run(&mut editor, &at, Vec::new());
    let doc = ScriptDoc::load(&editor, &at).expect("the script");
    script::select_nodes(&mut editor, &doc, &["found".to_owned()]);

    let texts = frames.run(&mut editor, &at, Vec::new());

    let target = texts
        .iter()
        .find(|(text, _)| text == "target")
        .map(|(_, rect)| *rect)
        .unwrap_or_else(|| panic!("the local's name is drawn: {texts:?}"));
    assert!(
        target.right() <= SCREEN.x,
        "the local's name fits on screen: {target:?}"
    );
    assert!(
        !texts.iter().any(|(text, _)| text.contains("\"type\"")),
        "{texts:?}"
    );
}

#[test]
fn a_variable_given_another_type_drops_the_default_it_had_as_the_old_one() {
    let scratch = tempfile::tempdir().expect("scratch");
    let game = support::game().row(
        "script",
        "tally",
        json!({
            "runs_on": "npc",
            "variables": { "count": { "type": "integer", "default": 3 } },
            "nodes": {
                "start": { "type": "on", "event": "started", "next": "rest" },
                "rest": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "rest" },
            },
        }),
    );
    let mut editor = open_game(game, &scratch);
    let at = ScriptRow::new(path("script", "tally"));
    let mut frames = Frames::new();
    frames.run(&mut editor, &at, Vec::new());
    let texts = frames.run(&mut editor, &at, Vec::new());
    let kind = drawn_at(&texts, "Integer");
    for events in [
        vec![egui::Event::PointerMoved(kind)],
        vec![click(kind, true)],
        vec![click(kind, false)],
    ] {
        frames.run(&mut editor, &at, events);
    }
    let texts = frames.run(&mut editor, &at, Vec::new());
    let text = drawn_at(&texts, "Text");

    for events in [
        vec![egui::Event::PointerMoved(text)],
        vec![click(text, true)],
        vec![click(text, false)],
    ] {
        frames.run(&mut editor, &at, events);
    }

    let script = editor
        .read::<ScriptDef>(&at.key)
        .expect("a project")
        .expect("the script reads");
    let count = &script.variables["count"];
    assert_eq!(count.ty, VariableType::Text);
    assert!(count.default.is_none());
}

/// Where `text` is drawn among `texts`, the last of them when it is drawn more than once.
fn drawn_at(texts: &[(String, egui::Rect)], text: &str) -> egui::Pos2 {
    texts
        .iter()
        .rev()
        .find(|(drawn, _)| drawn == text)
        .map(|(_, rect)| rect.center())
        .unwrap_or_else(|| panic!("{text} is drawn: {texts:?}"))
}

fn talk() -> ScriptRow {
    ScriptRow::new(path("script", "talk"))
}

fn open(scratch: &tempfile::TempDir) -> Editor {
    open_game(support::game(), scratch)
}

/// `game` with the `talk` script, open in the editor.
fn open_game(game: testkit::Game, scratch: &tempfile::TempDir) -> Editor {
    let line = |text: &str| json!({ "by": { "type": "narrator" }, "text": [text] });
    let game = game.script(
        "talk",
        "npc",
        json!({
            "start": { "type": "on", "event": "interacted", "verb": "talk", "reach": 2.0, "next": "ask" },
            "ask": { "type": "dialogue", "lines": [line("Well?")], "choices": [{ "label": ["Go on."], "to": "answer" }] },
            "answer": { "type": "dialogue", "lines": [line("Fine.")], "choices": [{ "label": ["Bye."] }] },
        }),
    );
    let folder = scratch.path().join("game");
    game.write_to(&folder);
    let mut project = Project::open(&folder, Arc::new(SchemaShapes::load())).expect("opens");
    project.settle();
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    editor.project = Some(project);
    editor
}

fn read(editor: &Editor) -> Arc<ScriptDef> {
    editor
        .read::<ScriptDef>(&path("script", "talk"))
        .expect("a project")
        .expect("the script reads")
}

/// The script view drawn frame after frame in one context, as the editor draws it.
struct Frames {
    ctx: egui::Context,
}

impl Frames {
    fn new() -> Frames {
        let ctx = egui::Context::default();
        editor::ui::theme::apply(&ctx);
        Frames { ctx }
    }

    /// Draws a frame of `events` and one more to settle, giving the texts the last one drew and
    /// where.
    fn run(
        &mut self,
        editor: &mut Editor,
        at: &ScriptRow,
        events: Vec<egui::Event>,
    ) -> Vec<(String, egui::Rect)> {
        let mut texts = Vec::new();
        for events in [events, Vec::new()] {
            let input = egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, SCREEN)),
                events,
                ..Default::default()
            };
            let mut output = self.ctx.run_ui(input, |ui| script::show(editor, ui, at));
            output.textures_delta.clear();
            texts = output
                .shapes
                .iter()
                .filter_map(|clipped| match &clipped.shape {
                    egui::Shape::Text(text) => Some((
                        text.galley.text().to_owned(),
                        text.galley.rect.translate(text.pos.to_vec2()),
                    )),
                    _ => None,
                })
                .collect();
        }
        texts
    }
}

fn click(pos: egui::Pos2, pressed: bool) -> egui::Event {
    egui::Event::PointerButton {
        pos,
        button: egui::PointerButton::Primary,
        pressed,
        modifiers: egui::Modifiers::NONE,
    }
}

fn key(key: egui::Key, pressed: bool) -> egui::Event {
    egui::Event::Key {
        key,
        physical_key: None,
        pressed,
        repeat: false,
        modifiers: egui::Modifiers::NONE,
    }
}
