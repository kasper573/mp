use std::path::PathBuf;

use clap::error::ErrorKind;
use clap::{CommandFactory, Parser};
use editor::app::EditorLaunch;
use editor::scenes::SceneStep;
use engine::systems::launch;
use strum::VariantNames;

/// The Rift editor.
#[derive(Parser)]
struct Options {
    /// Opens this game folder right away.
    folder: Option<PathBuf>,
    #[arg(long, value_name = "JSON", long_help = scene_help())]
    scene: Option<String>,
    /// Keeps settings, journal and import records here instead of in the user's folder.
    #[arg(long, value_name = "PATH")]
    user_folder: Option<PathBuf>,
    /// Writes a line per frame: frame ms, ui ms, the active tab, entities, images, meshes.
    #[arg(long, value_name = "PATH")]
    frame_log: Option<PathBuf>,
    /// Prints the build and exits.
    #[arg(long)]
    build_info: bool,
    /// Prints every row shape as JSON and exits.
    #[arg(long)]
    shapes: bool,
}

fn main() {
    let options = Options::parse();
    if options.build_info {
        println!("{}", launch::build_info_line());
        return;
    }
    if options.shapes {
        let shapes = editor::schema::shapes();
        println!("{}", serde_json::to_string_pretty(&shapes).expect("json"));
        return;
    }
    let scene = options.scene.map(|json| {
        serde_json::from_str(&json).unwrap_or_else(|error| {
            Options::command()
                .error(ErrorKind::ValueValidation, format!("--scene: {error}"))
                .exit()
        })
    });
    let launch = EditorLaunch {
        folder: options.folder,
        scene,
        user: options.user_folder,
        frame_log: options.frame_log,
    };
    editor::app::build(launch).run();
}

fn scene_help() -> String {
    format!(
        "Opens the folder on a state, for recordings and tests: a JSON array of steps, each an object \
         keyed by its step name, e.g. [{{\"area\":\"island\"}},{{\"model\":{{\"open\":\"walk\"}}}}]. \
         The steps: {}. A step that opens a view, as model does, takes that view's own steps.",
        SceneStep::VARIANTS.join(", ")
    )
}
