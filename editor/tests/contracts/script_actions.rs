use std::sync::Arc;

use editor::app::{BottomTab, Editor};
use editor::tabs::EditorTab;
use editor::views::script::{self, ScriptDoc, ScriptRow};
use engine::core::script::{Node, VariableType};
use engine::systems::script::ScriptDef;
use serde_json::json;
use testkit::path;

use crate::support::{self, Drawn, Frames, click, key};

const SCREEN: egui::Vec2 = egui::vec2(1600.0, 1000.0);

#[test]
fn deleting_several_selected_nodes_deletes_every_one_of_them() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(support::game(), &scratch);
    let at = talk();
    let mut frames = ScriptFrames::new();
    frames.run(&mut editor, &at, Vec::new());
    select(&mut editor, &at, &["ask", "answer"]);

    frames.run(
        &mut editor,
        &at,
        key(egui::Key::Delete, egui::Modifiers::NONE),
    );

    let names: Vec<String> = read(&editor).nodes.keys().cloned().collect();
    assert_eq!(names, ["start"]);
}

#[test]
fn duplicating_several_selected_nodes_copies_every_one_of_them() {
    let scratch = tempfile::tempdir().expect("scratch");
    let mut editor = open(support::game(), &scratch);
    let at = talk();
    let mut frames = ScriptFrames::new();
    frames.run(&mut editor, &at, Vec::new());
    select(&mut editor, &at, &["ask", "answer"]);

    frames.run(
        &mut editor,
        &at,
        key(egui::Key::D, egui::Modifiers::COMMAND),
    );

    let script = read(&editor);
    let saying = |said: &str| {
        script
            .nodes
            .values()
            .filter(|node| matches!(node, Node::Dialogue(dialogue) if dialogue.lines.iter().any(|line| editor::spans::plain(&line.text) == said)))
            .count()
    };
    assert_eq!((saying("Well?"), saying("Fine.")), (2, 2));
}

#[test]
fn enter_on_a_line_keeps_what_was_typed_into_it_and_adds_one_after() {
    for (caret, typed, lines) in [
        (egui::Key::End, " Speak up.", ["Well? Speak up.", ""]),
        (egui::Key::Home, "", ["Well?", ""]),
    ] {
        let scratch = tempfile::tempdir().expect("scratch");
        let mut editor = open(support::game(), &scratch);
        let at = talk();
        let mut frames = ScriptFrames::new();
        frames.run(&mut editor, &at, Vec::new());
        select(&mut editor, &at, &["ask"]);
        let line = frames
            .run(&mut editor, &at, Vec::new())
            .0
            .into_iter()
            .filter(|(text, _)| text == "Well?")
            .map(|(_, rect)| rect)
            .min_by(|a, b| a.left().total_cmp(&b.left()))
            .expect("the line is drawn on its card");

        for events in click(line.center())
            .into_iter()
            .chain([key(caret, egui::Modifiers::NONE)])
            .chain((!typed.is_empty()).then(|| vec![egui::Event::Text(typed.to_owned())]))
            .chain([key(egui::Key::Enter, egui::Modifiers::NONE)])
        {
            frames.run(&mut editor, &at, events);
        }

        let Some(Node::Dialogue(ask)) = read(&editor).nodes.get("ask").cloned() else {
            panic!("ask is a dialogue");
        };
        let shown: Vec<String> = ask
            .lines
            .iter()
            .map(|line| editor::spans::plain(&line.text))
            .collect();
        assert_eq!(shown, lines, "{caret:?}");
    }
}

#[test]
fn a_script_lists_every_module_running_it_with_the_values_it_gives() {
    let scratch = tempfile::tempdir().expect("scratch");
    let counted = |runs_on: &str, on: serde_json::Value| {
        json!({
            "runs_on": runs_on,
            "variables": { "times": { "type": "integer", "default": 1 } },
            "nodes": {
                "on": on,
                "check": {
                    "type": "if",
                    "test": { "type": "at_least", "a": { "var": "times" }, "b": 4 },
                    "yes": "rest",
                    "no": "rest",
                },
                "rest": { "type": "wait", "seconds": 0, "at_most": 1.0, "next": "rest" },
            },
        })
    };
    let game = support::game()
        .row(
            "script",
            "chime",
            counted("area", json!({ "type": "on", "event": "discovered", "next": "check" })),
        )
        .row(
            "script",
            "door",
            counted(
                "object",
                json!({ "type": "on", "event": "entered", "by": "characters", "next": "check" }),
            ),
        )
        .edit_scene("area", support::AREA, |scene| {
            let scene = scene.as_array_mut().expect("a scene");
            scene.push(json!({ "type": "script", "label": "Bells", "script": path("script", "chime"), "values": { "times": 5 } }));
            scene.push(json!({
                "type": "object",
                "name": "door",
                "shape": { "type": "rect", "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },
                "scripts": [{ "script": path("script", "door"), "values": { "times": 2 } }],
            }));
        });
    let mut editor = open(game, &scratch);

    for (script, given) in [("chime", "times 5"), ("door", "times 2")] {
        let at = ScriptRow::new(path("script", script));
        let mut frames = Frames::new(SCREEN);
        let drawn = frames.run(Vec::new(), |ui| {
            script::bottom(&mut editor, ui, &at, BottomTab::UsedBy)
        });
        assert!(drawn.any(|text| text == given), "{script}: {drawn:?}");
    }
}

#[test]
fn a_condition_inside_a_query_is_shown_as_a_condition_within_the_screen() {
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
    let mut editor = open(game, &scratch);
    let at = ScriptRow::new(path("script", "watch"));
    let mut frames = ScriptFrames::new();
    frames.run(&mut editor, &at, Vec::new());
    select(&mut editor, &at, &["found"]);

    let drawn = frames.run(&mut editor, &at, Vec::new());

    let target = drawn
        .rect("target")
        .unwrap_or_else(|| panic!("the local's name is drawn: {drawn:?}"));
    assert!(
        target.right() <= SCREEN.x,
        "the local's name fits on screen: {target:?}"
    );
    assert!(!drawn.any(|text| text.contains("\"type\"")), "{drawn:?}");
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
    let mut editor = open(game, &scratch);
    let at = ScriptRow::new(path("script", "tally"));
    let mut frames = ScriptFrames::new();
    frames.run(&mut editor, &at, Vec::new());
    for chip in ["Integer", "Text"] {
        let at_chip = frames.run(&mut editor, &at, Vec::new()).at(chip);
        for events in click(at_chip) {
            frames.run(&mut editor, &at, events);
        }
    }

    let script = editor
        .read::<ScriptDef>(&at.key)
        .expect("a project")
        .expect("the script reads");
    let count = &script.variables["count"];
    assert_eq!(count.ty, VariableType::Text);
    assert!(count.default.is_none());
}

fn talk() -> ScriptRow {
    ScriptRow::new(path("script", "talk"))
}

fn select(editor: &mut Editor, at: &ScriptRow, nodes: &[&str]) {
    let doc = ScriptDoc::load(editor, at).expect("the script");
    let nodes: Vec<String> = nodes.iter().map(|node| (*node).to_owned()).collect();
    script::select_nodes(editor, &doc, &nodes);
}

/// `game` with the `talk` script, open in the editor.
fn open(game: testkit::Game, scratch: &tempfile::TempDir) -> Editor {
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
    support::open(game, scratch)
}

fn read(editor: &Editor) -> Arc<ScriptDef> {
    editor
        .read::<ScriptDef>(&path("script", "talk"))
        .expect("a project")
        .expect("the script reads")
}

/// The script view drawn as the editor draws it in its tab, taking the editor's keys.
struct ScriptFrames(Frames);

impl ScriptFrames {
    fn new() -> ScriptFrames {
        ScriptFrames(Frames::new(SCREEN))
    }

    /// Draws a frame of `events` and one more to settle, giving what the last one drew.
    fn run(&mut self, editor: &mut Editor, at: &ScriptRow, events: Vec<egui::Event>) -> Drawn {
        editor.open_tab(EditorTab::Script(at.clone()));
        editor.place_tabs();
        let mut drawn = Drawn::default();
        for events in [events, Vec::new()] {
            drawn = self.0.run(events, |ui| {
                editor::ui::shortcuts(editor, ui.ctx());
                script::show(editor, ui, at);
            });
        }
        drawn
    }
}
