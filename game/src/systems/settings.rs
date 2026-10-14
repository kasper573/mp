use std::collections::BTreeMap;
use std::iter;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use strum::VariantArray;
use ui::button::intent as button_intent;
use ui::tokens::typography;
use ui::{Activate, ButtonSize, SnapGrid, ValueChange, button_styled};

use crate::core::audio::mix::{AudioCategory, AudioFader, AudioMix, AudioVolume};
use crate::core::math::{Pos, Size, WindowPx};
use crate::core::platform::{ClientPlatform, Platform};
use crate::core::render::transition::{ScreenTransition, ScreenTransitionPreference};
use crate::systems::hud::{HudAudience, Window, single_tab};
use crate::systems::input::map::InputAction;
use crate::systems::interface::InterfaceIcon;

const SLIDER_WIDTH: f32 = 240.0;
const FADER_NAME_WIDTH: f32 = 80.0;

pub(crate) fn plugin(app: &mut App) {
    let settings = UserSettings::load(&*app.world().resource::<ClientPlatform>().0);
    app.insert_resource(settings)
        .add_systems(Update, (persist, apply));
}

#[derive(Resource, Serialize, Deserialize, Default)]
pub(crate) struct UserSettings {
    #[serde(default)]
    ui: UiSettings,
    #[serde(default)]
    text: TextSettings,
    #[serde(default)]
    sound: AudioMix,
    #[serde(default)]
    screen: ScreenSettings,
}

#[derive(Serialize, Deserialize, Clone, Copy)]
pub(crate) struct Placement {
    pub pos: Pos<WindowPx>,
    pub size: Size<WindowPx>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, PartialOrd)]
pub(crate) struct LettersPerSecond(pub f32);

pub struct SettingsWindow;

impl Window for SettingsWindow {
    fn audience(&self) -> HudAudience {
        HudAudience::Everyone
    }
    fn title(&self) -> &'static str {
        "Settings"
    }
    fn toggle(&self) -> InputAction {
        InputAction::ToggleSettings
    }
    fn icon(&self) -> InterfaceIcon {
        InterfaceIcon::Settings
    }
    fn contents(&self, world: &World) -> Vec<ui::WindowContent> {
        single_tab(self.title(), ui::scrolled(content(world)))
    }
    fn sync(&self, world: &mut World) {
        sync_labels(world)
    }
}

struct Toggle {
    label: fn(&UserSettings) -> &'static str,
    flip: fn(&mut UserSettings),
}

static SNAPPING: Toggle = Toggle {
    label: |settings| {
        if settings.snapping_enabled() {
            "ui snapping enabled"
        } else {
            "ui snapping disabled"
        }
    },
    flip: UserSettings::toggle_snapping,
};

static REDUCED_MOTION: Toggle = Toggle {
    label: |settings| {
        if settings.reduced_motion() {
            "reduced motion on"
        } else {
            "reduced motion off"
        }
    },
    flip: UserSettings::toggle_reduced_motion,
};

#[derive(Clone, Copy)]
enum SettingSlider {
    TextSpeed,
    Volume(AudioFader),
}

#[derive(Component, Clone)]
struct ToggleButton(&'static Toggle);

#[derive(Component, Clone, Default)]
struct TextSpeedLabel;

fn content(world: &World) -> Box<dyn Scene> {
    let settings = world.resource::<UserSettings>();
    Box::new(bsn! {
        Node { flex_direction: FlexDirection::Column, align_items: AlignItems::Start, row_gap: Val::Px(6.0) }
        Children [
            @{toggle_button(settings, &SNAPPING)}
            --
            @{text_speed_row(settings)}
            --
            @{toggle_button(settings, &REDUCED_MOTION)}
            --
            @{transition_row(settings)}
            --
            @{audio_section(settings)}
        ]
    })
}

fn text_speed_row(settings: &UserSettings) -> impl Scene + use<> {
    bsn! {
        Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), width: Val::Px(SLIDER_WIDTH), padding: {UiRect::vertical(Val::Px(6.0))} }
        Children [
            @{ui::styled_text(text_speed_label(settings), ui::theme::theme().surface_canvas.on, typography::BODY)}
            TextSpeedLabel
            --
            @{slider(settings, SettingSlider::TextSpeed)}
        ]
    }
}

fn transition_row(settings: &UserSettings) -> impl Scene + use<> {
    let choices: Vec<Box<dyn Scene>> = ScreenTransition::VARIANTS
        .iter()
        .map(|transition| -> Box<dyn Scene> {
            Box::new(ui::dropdown_item(transition.as_ref(), transition.as_ref()))
        })
        .collect();
    bsn! {
        Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(6.0), width: Val::Px(SLIDER_WIDTH), padding: {UiRect::vertical(Val::Px(6.0))} }
        Children [
            @{ui::styled_text("area transition", ui::theme::theme().surface_canvas.on, typography::BODY)}
            --
            @{ui::dropdown(settings.screen_transition().as_ref())}
            on(|picked: On<ValueChange<String>>, mut settings: ResMut<UserSettings>| {
                if let Ok(transition) = picked.value.parse() {
                    settings.set_screen_transition(transition);
                }
            })
            Children [
                @{ui::dropdown_trigger()}
                --
                @{ui::dropdown_content()} Children [ {choices} ]
            ]
        ]
    }
}

fn audio_section(settings: &UserSettings) -> impl Scene + use<> {
    let faders: Vec<Box<dyn Scene>> = iter::once(AudioFader::Master)
        .chain(
            AudioCategory::VARIANTS
                .iter()
                .copied()
                .map(AudioFader::Category),
        )
        .map(|fader| -> Box<dyn Scene> { Box::new(fader_row(settings, fader)) })
        .collect();
    bsn! {
        Node { flex_direction: FlexDirection::Column, row_gap: Val::Px(4.0), width: {Val::Px(SLIDER_WIDTH + FADER_NAME_WIDTH)}, padding: {UiRect::top(Val::Px(6.0))} }
        Children [
            @{ui::styled_text("Audio", ui::theme::theme().surface_canvas.on, typography::NAME)}
            --
            {faders}
        ]
    }
}

fn fader_row(settings: &UserSettings, fader: AudioFader) -> impl Scene + use<> {
    bsn! {
        Node { flex_direction: FlexDirection::Row, align_items: AlignItems::Center }
        Children [
            @{ui::styled_text(fader_name(fader), ui::theme::theme().surface_canvas.on, typography::BODY)}
            Node { width: Val::Px(FADER_NAME_WIDTH) }
            --
            Node { flex_grow: 1.0 }
            Children [ @{slider(settings, SettingSlider::Volume(fader))} ]
        ]
    }
}

fn slider(settings: &UserSettings, slider: SettingSlider) -> impl Scene + use<> {
    let (min, max) = slider.range();
    bsn! {
        @{ui::slider(slider.value(settings), min, max)}
        on(move |changed: On<ValueChange<f32>>, mut settings: ResMut<UserSettings>| {
            slider.set(&mut settings, changed.value);
        })
        Children [
            @{ui::slider_track()}
            Children [ @{ui::slider_range()} -- @{ui::slider_thumb()} ]
        ]
    }
}

fn text_speed_label(settings: &UserSettings) -> String {
    format!(
        "text speed {} letters a second",
        settings.letters_per_second().0 as u32
    )
}

impl SettingSlider {
    fn value(self, settings: &UserSettings) -> f32 {
        match self {
            SettingSlider::TextSpeed => settings.letters_per_second().0,
            SettingSlider::Volume(fader) => settings.volume(fader).0,
        }
    }

    fn range(self) -> (f32, f32) {
        match self {
            SettingSlider::TextSpeed => (LettersPerSecond::SLOWEST.0, LettersPerSecond::FASTEST.0),
            SettingSlider::Volume(_) => (AudioVolume::SILENT.0, AudioVolume::FULL.0),
        }
    }

    fn set(self, settings: &mut UserSettings, value: f32) {
        match self {
            SettingSlider::TextSpeed => {
                settings.set_letters_per_second(LettersPerSecond(value.round()));
            }
            SettingSlider::Volume(fader) => {
                settings.set_volume(fader, AudioVolume((value * 100.0).round() / 100.0));
            }
        }
    }
}

fn fader_name(fader: AudioFader) -> &'static str {
    match fader {
        AudioFader::Master => "Master",
        AudioFader::Category(category) => category.into(),
    }
}

fn toggle_button(settings: &UserSettings, toggle: &'static Toggle) -> impl Scene + use<> {
    bsn! {
        @{button_styled(button_intent::PRIMARY, ButtonSize::Md, (toggle.label)(settings))}
        ~{ToggleButton(toggle)}
        on(move |_: On<Activate>, mut commands: Commands| {
            commands.queue(move |world: &mut World| {
                (toggle.flip)(&mut world.resource_mut::<UserSettings>());
            });
        })
    }
}

fn sync_labels(world: &mut World) {
    if !world.is_resource_changed::<UserSettings>() {
        return;
    }
    let buttons: Vec<(&'static Toggle, Vec<Entity>)> = world
        .query::<(&ToggleButton, &Children)>()
        .iter(world)
        .map(|(button, children)| (button.0, children.iter().collect()))
        .collect();
    let speed = text_speed_label(world.resource::<UserSettings>());
    let labels: Vec<(Entity, String)> = world
        .query_filtered::<Entity, With<TextSpeedLabel>>()
        .iter(world)
        .map(|entity| (entity, speed.clone()))
        .collect();
    let texts: Vec<(Entity, String)> = buttons
        .into_iter()
        .flat_map(|(toggle, texts)| {
            let label = (toggle.label)(world.resource::<UserSettings>()).to_owned();
            texts.into_iter().map(move |text| (text, label.clone()))
        })
        .chain(labels)
        .collect();
    for (entity, label) in texts {
        if let Some(mut text) = world.get_mut::<Text>(entity)
            && text.0 != label
        {
            text.0 = label;
        }
    }
}

impl UserSettings {
    pub(crate) fn snapping_enabled(&self) -> bool {
        self.ui.snap.is_some()
    }

    pub(crate) fn toggle_snapping(&mut self) {
        self.ui.snap = match self.ui.snap {
            Some(_) => None,
            None => Some(DEFAULT_SNAP),
        };
    }

    pub(crate) fn letters_per_second(&self) -> LettersPerSecond {
        self.text.letters_per_second
    }

    pub(crate) fn set_letters_per_second(&mut self, letters_per_second: LettersPerSecond) {
        self.text.letters_per_second = letters_per_second.clamped();
    }

    pub(crate) fn reduced_motion(&self) -> bool {
        self.text.reduced_motion
    }

    pub(crate) fn toggle_reduced_motion(&mut self) {
        self.text.reduced_motion = !self.text.reduced_motion;
    }

    pub(crate) fn volume(&self, fader: AudioFader) -> AudioVolume {
        self.sound.level(fader)
    }

    pub(crate) fn set_volume(&mut self, fader: AudioFader, volume: AudioVolume) {
        self.sound.set(fader, volume);
    }

    pub(crate) fn screen_transition(&self) -> ScreenTransition {
        self.screen.transition
    }

    pub(crate) fn set_screen_transition(&mut self, transition: ScreenTransition) {
        self.screen.transition = transition;
    }

    pub(crate) fn widget_pos(&self, id: &str) -> Option<Pos<WindowPx>> {
        self.ui.widgets.get(id).copied()
    }

    pub(crate) fn set_widget_pos(&mut self, id: &str, pos: Pos<WindowPx>) {
        self.ui.widgets.insert(id.to_owned(), pos);
    }

    pub(crate) fn window_placement(&self, id: &str) -> Option<Placement> {
        self.ui.windows.get(id).copied()
    }

    pub(crate) fn set_window_placement(&mut self, id: &str, placement: Placement) {
        self.ui.windows.insert(id.to_owned(), placement);
    }

    fn load(platform: &dyn Platform) -> UserSettings {
        let mut settings: UserSettings = platform
            .load(KEY)
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();
        settings.ui.snap = settings.ui.snap.filter(|snap| snap.0 > 0.0);
        settings.text.letters_per_second = settings.text.letters_per_second.clamped();
        settings
    }

    fn save(&self, platform: &dyn Platform) {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            platform.save(KEY, &json);
        }
    }
}

impl LettersPerSecond {
    pub(crate) const SLOWEST: LettersPerSecond = LettersPerSecond(15.0);
    pub(crate) const FASTEST: LettersPerSecond = LettersPerSecond(120.0);

    fn clamped(self) -> LettersPerSecond {
        LettersPerSecond(self.0.clamp(Self::SLOWEST.0, Self::FASTEST.0))
    }
}

impl Default for LettersPerSecond {
    fn default() -> LettersPerSecond {
        LettersPerSecond(45.0)
    }
}

const KEY: &str = "rift.user_settings";
const DEFAULT_SNAP: WindowPx = WindowPx(16.0);

#[derive(Serialize, Deserialize)]
struct UiSettings {
    #[serde(default = "default_snap")]
    snap: Option<WindowPx>,
    #[serde(default)]
    widgets: BTreeMap<String, Pos<WindowPx>>,
    #[serde(default)]
    windows: BTreeMap<String, Placement>,
}

impl Default for UiSettings {
    fn default() -> UiSettings {
        UiSettings {
            snap: default_snap(),
            widgets: BTreeMap::new(),
            windows: BTreeMap::new(),
        }
    }
}

fn default_snap() -> Option<WindowPx> {
    Some(DEFAULT_SNAP)
}

#[derive(Serialize, Deserialize, Default)]
struct TextSettings {
    #[serde(default)]
    letters_per_second: LettersPerSecond,
    #[serde(default)]
    reduced_motion: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct ScreenSettings {
    #[serde(default)]
    transition: ScreenTransition,
}

/// Saved on change rather than at each place that changes a setting. The initial load counts as a
/// change too, harmlessly writing back what was just read.
fn persist(settings: Res<UserSettings>, platform: Res<ClientPlatform>) {
    if settings.is_changed() {
        settings.save(&*platform.0);
    }
}

fn apply(
    settings: Res<UserSettings>,
    mut grid: ResMut<SnapGrid>,
    mut speed: ResMut<ui::TypewriterSpeed>,
    mut motion: ResMut<ui::MotionPreference>,
    mut audio_mix: ResMut<AudioMix>,
    mut transition: ResMut<ScreenTransitionPreference>,
) {
    if !settings.is_changed() {
        return;
    }
    grid.0 = settings.ui.snap.map(|snap| snap.0);
    *speed = ui::TypewriterSpeed(Some(settings.text.letters_per_second.0));
    motion.reduced = settings.text.reduced_motion;
    *audio_mix = settings.sound;
    transition.0 = settings.screen.transition;
}
