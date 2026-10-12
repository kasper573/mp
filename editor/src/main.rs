use std::path::PathBuf;

use bevy::prelude::*;
use bevy::window::{PresentMode, WindowResolution};

use editor::app::{EditorPlugin, Launch};

const USAGE: &str = "usage: editor [folder] [--scene STEPS] [--user-folder PATH] [--frame-log PATH] [--build-info] [--shapes]

  --scene STEPS      opens the folder on a state, for recordings and tests; steps join with `;`:
                     area:<key>  blueprint:<key>  row:<table>/<key>  rows:<table>/<key>,<key>
                     script:<key> | script:<table>/<key>#<pointer>  node:<name>  model:<key>
                     tileset:<key>  sheet:<table>  world  part:<area>/<indices>  resize:area/<key>
                     fold:<table>/<key>/<indices>  unfold:…  delete:<table>/<key>  save
                     clipboard:<table>/<key>/<index>  make-shared | make-inline | connect
                     bottom:<may-do|used-by|run|output|timeline|sheet|sounds|surfaces>
                     section:<stats|bag|equipment|start|areas|quests|memories|lines|shops|history>
                     mp:<strip|timing|cues|hitbox|busts|bottom|setby|surface|drop>:<arg>
                     tp:<mode|brush|select|tile|set|terrain|closeup|bottom|zoom|dialog>:<arg>
                     imp:<files|apply|retime>:<arg>  sh:<columns|sort|filter|cell>:<arg>
                     wm:<lens|colour|line|route|look|select|layer|arrange|arrange-apply|region|note>:<arg>  (look:<area>/<zoom>, route:<from>/<to>)
  --user-folder PATH settings, journal and import records go here instead of the user's folder
  --frame-log PATH   writes a line per frame: frame ms, ui ms, the active tab, entities, images, meshes
  --build-info       prints the build and exits
  --shapes           prints every row shape as JSON and exits";

fn main() {
    let mut launch = Launch::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            game::systems::launch::BUILD_INFO_FLAG => {
                println!("{}", game::systems::launch::build_info_line());
                return;
            }
            "--shapes" => {
                let settings = schemars::generate::SchemaSettings::draft2020_12()
                    .with(|settings| settings.inline_subschemas = true);
                let shapes = game::systems::registry().shapes(&settings);
                println!("{}", serde_json::to_string_pretty(&shapes).expect("json"));
                return;
            }
            "--scene" => launch.scene = args.next(),
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
