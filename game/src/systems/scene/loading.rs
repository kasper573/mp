use std::sync::Arc;
use std::time::Duration;

use bevy::prelude::*;
use bevy::scene::Scene as UiScene;
use bevy::tasks::{IoTaskPool, Task, block_on, futures_lite::future};
use bevy::winit::{UpdateMode, WinitSettings};
use ui::{Activate, CardOptions, button, card, styled_text, text_colored};

use super::Scene;
use crate::core::content::sync::{
    ContentSource, Counted, SyncError, SyncPhase, SyncPolicy, SyncProgress, SyncStatus,
    SyncedContent, sync,
};
use crate::core::content::version;
use crate::core::platform::{ClientPlatform, FetchFailure, LocalFuture, Platform, StartParams};
use crate::core::render::transition::ScreenTransitionPhase;
use crate::core::time::Seconds;

#[derive(Resource)]
pub struct AfterLoading(pub Scene);

pub struct LoadingPlugin;

impl Plugin for LoadingPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Shown>()
            .add_systems(OnEnter(Scene::Loading), begin)
            .add_systems(
                Update,
                (poll, show).chain().run_if(in_state(Scene::Loading)),
            )
            .add_systems(
                OnExit(Scene::Loading),
                (crate::systems::scene::despawn_all::<LoadingUi>, forget),
            );
    }
}

const RETRY_EVERY: Seconds = Seconds(30.0);
const UPDATED: &str = "A new version of the game is live. Reload the page to play.";

#[derive(Resource)]
struct Syncing {
    task: Task<Result<SyncedContent, SyncError>>,
    status: SyncStatus,
}

#[derive(Resource, Clone, PartialEq)]
struct LoadingFailure {
    reason: String,
    retry_at: Option<Seconds>,
}

#[derive(Resource, Default)]
struct Shown {
    progress: SyncProgress,
    card: Option<CardModel>,
    announced: Option<String>,
}

#[derive(Component, Default, Clone)]
struct LoadingUi;

#[derive(Clone, PartialEq)]
struct CardModel {
    title: String,
    lines: Vec<String>,
    notes: Vec<String>,
    retry: bool,
    veiled: bool,
}

struct ServerContent {
    platform: Arc<dyn Platform>,
    base: String,
}

impl ContentSource for ServerContent {
    fn get(&self, path: &str) -> LocalFuture<Result<Vec<u8>, FetchFailure>> {
        self.platform.get(format!("{}{path}", self.base))
    }
}

// The card only needs a few frames a second, and every frame a software renderer draws is main-thread
// time the download's fetches and cache writes can't have.
const CARD_FRAME: Duration = Duration::from_millis(100);

fn begin(world: &mut World) {
    world.remove_resource::<LoadingFailure>();
    world.insert_resource(WinitSettings {
        focused_mode: UpdateMode::reactive_low_power(CARD_FRAME),
        unfocused_mode: UpdateMode::reactive_low_power(CARD_FRAME),
    });
    start(world);
}

fn forget(world: &mut World) {
    world.remove_resource::<Syncing>();
    world.remove_resource::<LoadingFailure>();
    world.insert_resource(WinitSettings::game());
    *world.resource_mut::<Shown>() = Shown::default();
}

fn start(world: &mut World) {
    let platform = world.resource::<ClientPlatform>().0.clone();
    let base = world.resource::<StartParams>().game_server_url.clone();
    let status = SyncStatus::default();
    let task = IoTaskPool::get().spawn_local({
        let status = status.clone();
        async move {
            let source = ServerContent {
                platform: platform.clone(),
                base,
            };
            let store = platform.content_store();
            sync(
                &source,
                &*store,
                version::build(),
                SyncPolicy::default(),
                status,
            )
            .await
        }
    });
    world.insert_resource(Syncing { task, status });
}

fn poll(world: &mut World) {
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let Some(mut syncing) = world.remove_resource::<Syncing>() else {
        let due = world
            .get_resource::<LoadingFailure>()
            .is_some_and(|failure| failure.retry_at.is_some_and(|at| now >= at));
        if due {
            world.remove_resource::<LoadingFailure>();
            start(world);
        }
        return;
    };
    match block_on(future::poll_once(&mut syncing.task)) {
        None => world.insert_resource(syncing),
        Some(Ok(synced)) => {
            world.resource_mut::<Shown>().progress = syncing.status.latest();
            match crate::systems::install_content(world, synced) {
                Ok(()) => {
                    let next = world.resource::<AfterLoading>().0.clone();
                    world.resource_mut::<NextState<Scene>>().set(next);
                }
                Err(report) => fail(world, report.to_string(), now),
            }
        }
        Some(Err(SyncError::OtherBuild { server })) => {
            world.resource_mut::<Shown>().progress = syncing.status.latest();
            if !world.resource::<ClientPlatform>().0.relaunch(&server) {
                world.insert_resource(LoadingFailure {
                    reason: UPDATED.to_owned(),
                    retry_at: None,
                });
            }
        }
        Some(Err(SyncError::Failed(reason))) => {
            world.resource_mut::<Shown>().progress = syncing.status.latest();
            fail(world, reason, now);
        }
    }
}

fn fail(world: &mut World, reason: String, now: Seconds) {
    world.insert_resource(LoadingFailure {
        reason,
        retry_at: Some(now + RETRY_EVERY),
    });
}

fn show(world: &mut World) {
    if let Some(syncing) = world.get_resource::<Syncing>() {
        let latest = syncing.status.latest();
        world.resource_mut::<Shown>().progress = latest;
    }
    let failure = world.get_resource::<LoadingFailure>().cloned();
    let veiled = *world.resource::<ScreenTransitionPhase>() != ScreenTransitionPhase::Idle;
    let model = {
        let shown = world.resource::<Shown>();
        card_model(&shown.progress, failure.as_ref(), veiled)
    };
    if world.resource::<Shown>().card.as_ref() == Some(&model) {
        return;
    }
    let ui: Vec<Entity> = world
        .query_filtered::<Entity, With<LoadingUi>>()
        .iter(world)
        .collect();
    for entity in ui {
        world.entity_mut(entity).despawn();
    }
    let _ = world.spawn_scene(loading_card(&model));
    if let Ok(mut window) = world
        .query_filtered::<&mut Window, With<bevy::window::PrimaryWindow>>()
        .single_mut(world)
        && window.title != model.title
    {
        window.title = model.title.clone();
    }
    let status = {
        let shown = world.resource::<Shown>();
        announcement(&model, &shown.progress)
    };
    let mut shown = world.resource_mut::<Shown>();
    if shown.announced.as_ref() != Some(&status) {
        shown.announced = Some(status.clone());
        world.resource::<ClientPlatform>().0.announce(&status);
    }
    world.resource_mut::<Shown>().card = Some(model);
}

fn card_model(
    progress: &SyncProgress,
    failure: Option<&LoadingFailure>,
    veiled: bool,
) -> CardModel {
    let title = progress
        .name
        .clone()
        .unwrap_or_else(|| "Loading".to_owned());
    let mut lines = Vec::new();
    let mut notes = Vec::new();
    match &progress.phase {
        SyncPhase::Checking => lines.push("Checking content…".to_owned()),
        SyncPhase::Reading => {
            lines.push("Content checked".to_owned());
            lines.push("Read from this device".to_owned());
            lines.push(format!(
                "{} of {} MB",
                megabytes(progress.read.bytes),
                megabytes(progress.read.bytes_total)
            ));
        }
        SyncPhase::Downloading { changes } => {
            lines.push("Content checked".to_owned());
            let fetched = progress.fetched;
            if fetched.files_total == 0 && !progress.rows_changed {
                lines.push("Up to date".to_owned());
                lines.push(format!(
                    "Read from this device {} MB",
                    megabytes(progress.read.bytes_total)
                ));
            } else if *changes {
                lines.push("Downloading changes".to_owned());
                lines.push(format!(
                    "{} of {} MB",
                    megabytes(fetched.bytes),
                    megabytes(fetched.bytes_total)
                ));
                lines.push(format!(
                    "{} of {} files changed{}",
                    grouped(fetched.files_total),
                    grouped(progress.files_in_index),
                    if progress.rows_changed {
                        ", and the rows"
                    } else {
                        ""
                    }
                ));
            } else {
                lines.push("Downloading".to_owned());
                lines.push(format!(
                    "{} of {} MB",
                    megabytes(fetched.bytes),
                    megabytes(fetched.bytes_total)
                ));
                lines.push(format!(
                    "{} of {} files",
                    grouped(fetched.files),
                    grouped(fetched.files_total)
                ));
            }
        }
        SyncPhase::Done => {
            lines.push("Content checked".to_owned());
            lines.push(
                if progress.fetched.files_total == 0 && !progress.rows_changed {
                    "Up to date".to_owned()
                } else {
                    "Downloaded".to_owned()
                },
            );
            lines.push("Joining".to_owned());
        }
    }
    if progress.retrying > 0 {
        notes.push(format!(
            "Retrying {} {}",
            progress.retrying,
            if progress.retrying == 1 {
                "file"
            } else {
                "files"
            }
        ));
    }
    if progress.memory_only {
        notes.push("Files won't be kept on this device".to_owned());
    }
    let retry = match failure {
        Some(failure) => {
            lines = vec!["Download failed".to_owned(), failure.reason.clone()];
            if failure.retry_at.is_some() {
                notes.push("Retrying every 30 seconds".to_owned());
            }
            true
        }
        None => false,
    };
    CardModel {
        title,
        lines,
        notes,
        retry,
        veiled,
    }
}

/// What a screen reader hears: the card's words, with transfers rounded to quarters so the status
/// changes a few times, not every frame.
fn announcement(model: &CardModel, progress: &SyncProgress) -> String {
    let quarter = |counted: Counted| {
        let done = counted.bytes * 4 / counted.bytes_total.max(1);
        format!("{}%", done.min(4) * 25)
    };
    let mut parts = vec![model.title.clone()];
    if model.retry {
        parts.extend(model.lines.iter().cloned());
    } else {
        match progress.phase {
            SyncPhase::Reading if progress.read.bytes_total > 0 => {
                parts.push(format!(
                    "reading from this device, {}",
                    quarter(progress.read)
                ));
            }
            SyncPhase::Downloading { .. } if progress.fetched.bytes_total > 0 => {
                parts.push(format!("downloading, {}", quarter(progress.fetched)));
            }
            _ => parts.extend(model.lines.iter().cloned()),
        }
    }
    parts.extend(model.notes.iter().cloned());
    parts.join(". ")
}

fn loading_card(model: &CardModel) -> impl UiScene + use<> {
    let theme = ui::theme::theme();
    let color = theme.surface_elevated.on;
    let background = if model.veiled {
        Color::NONE
    } else {
        super::connection::OVERLAY_BG
    };
    let mut body: Vec<Box<dyn UiScene>> = vec![Box::new(styled_text(
        model.title.clone(),
        color,
        ui::tokens::typography::NAME,
    ))];
    for line in &model.lines {
        body.push(Box::new(text_colored(line.clone(), color)));
    }
    for note in &model.notes {
        body.push(Box::new(styled_text(
            note.clone(),
            color,
            ui::tokens::typography::CAPTION,
        )));
    }
    if model.retry {
        body.push(Box::new(bsn! { @{button("Retry")} on(retry) }));
    }
    bsn! {
        LoadingUi
        super::screen_node()
        BackgroundColor({background})
        GlobalZIndex({ui::tokens::layer::SYSTEM})
        Children [
            @{card(CardOptions { floating: true, ..default() })}
            Node {
                min_width: Val::Px(280.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: Val::Px({ui::tokens::spacing::M}),
            }
            Children [ {body} ]
        ]
    }
}

fn retry(_: On<Activate>, mut commands: Commands) {
    commands.queue(|world: &mut World| {
        if world.get_resource::<Syncing>().is_some() {
            return;
        }
        let updated = world
            .get_resource::<LoadingFailure>()
            .is_some_and(|failure| failure.retry_at.is_none());
        world.remove_resource::<LoadingFailure>();
        if updated {
            let build = world
                .resource::<Shown>()
                .progress
                .name
                .clone()
                .unwrap_or_default();
            world.resource::<ClientPlatform>().0.relaunch(&build);
        }
        start(world);
    });
}

fn megabytes(bytes: u64) -> String {
    format!("{:.1}", bytes as f64 / 1_000_000.0)
}

fn grouped(count: usize) -> String {
    let digits = count.to_string();
    let mut out = String::new();
    for (i, digit) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}
