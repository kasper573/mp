use std::path::PathBuf;

use bevy::prelude::*;
use bevy::window::{PresentMode, WindowResolution};
use editor::app::{EditorLaunch, EditorPlugin};

const USAGE: &str = "usage: editor [folder] [--scene JSON] [--user-folder PATH] [--frame-log PATH] [--build-info] [--shapes]

  --scene JSON       opens the folder on a state, for recordings and tests: a JSON array of steps, each an
                     object keyed by its step name (snake_case), e.g. [{\"area\":\"island\"},{\"bottom\":\"output\"},{\"model\":{\"open\":\"walk\"}}]
                     top level: area blueprint resize row rows part fold unfold delete duplicate clipboard
                     script node make_shared make_inline connect bottom model tileset sheet world import
                     section save dialog; model, tileset, sheet, world and import take their own steps
  --user-folder PATH settings, journal and import records go here instead of the user's folder
  --frame-log PATH   writes a line per frame: frame ms, ui ms, the active tab, entities, images, meshes
  --build-info       prints the build and exits
  --shapes           prints every row shape as JSON and exits";

fn main() {
    let mut launch = EditorLaunch::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            engine::systems::launch::BUILD_INFO_FLAG => {
                println!("{}", engine::systems::launch::build_info_line());
                return;
            }
            "--shapes" => {
                let shapes = editor::schema::shapes_json();
                println!("{}", serde_json::to_string_pretty(&shapes).expect("json"));
                return;
            }
            "--scene" => {
                let json = args.next().unwrap_or_default();
                match serde_json::from_str(&json) {
                    Ok(steps) => launch.scene = Some(steps),
                    Err(error) => {
                        eprintln!("--scene: {error}\n{USAGE}");
                        std::process::exit(2);
                    }
                }
            }
            "--user-folder" => launch.user = args.next().map(PathBuf::from),
            "--frame-log" => launch.frame_log = args.next().map(PathBuf::from),
            "--help" | "-h" => {
                println!("{USAGE}");
                return;
            }
            other if other.starts_with("--") => {
                eprintln!("unknown flag {other}\n{USAGE}");
                std::process::exit(2);
            }
            folder => launch.folder = Some(PathBuf::from(folder)),
        }
    }
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Rift editor".to_owned(),
                        resolution: WindowResolution::new(1600, 1000),
                        present_mode: PresentMode::AutoNoVsync,
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest()),
        )
        .add_plugins(bevy_kira_audio::AudioPlugin)
        .add_plugins(EditorPlugin { launch })
        .run();
}
