use bevy::prelude::*;
use bevy_scene::{Scene, bsn};
use bevy_ui::widget::ImageNode;

use crate::components::input::{InputRef, input_cap};
use crate::components::{text_colored, tooltip, tooltip_content};
use crate::cursor::CursorStyle;
use crate::drag::{DragHandle, DragRoot, OnSettle, OnTap};
use crate::style::Style;
use crate::theme::theme;
use crate::{Align, Side};

const WIDGET: f32 = 48.0;
const BADGE: f32 = 12.0;

pub struct WidgetOptions {
    pub pos: Vec2,
    pub icon: Handle<Image>,
    pub badge: Option<InputRef>,
    pub tooltip: String,
    pub on_tap: OnTap,
    pub on_settle: OnSettle,
}

pub fn widget(opts: WidgetOptions) -> impl Scene {
    let family = theme().surface_floating;
    let node = Node {
        position_type: PositionType::Absolute,
        left: Val::Px(opts.pos.x),
        top: Val::Px(opts.pos.y),
        width: Val::Px(WIDGET),
        height: Val::Px(WIDGET),
        border: UiRect::all(Val::Px(1.0)),
        ..default()
    };
    bsn! {
        node
        BackgroundColor({family.base})
        BorderColor::all(family.border)
        @{tooltip(false)}
        DragRoot
        DragHandle
        CursorStyle::Pointer
        opts.on_tap
        opts.on_settle
        Children [
            Node {
                width: Val::Px(32.0),
                height: Val::Px(32.0),
                margin: {UiRect::all(Val::Px(8.0))},
            }
            ImageNode { image: {opts.icon} }
            Pickable { should_block_lower: false, is_hoverable: false }
            --
            {Vec::from_iter(opts.badge.map(badge))}
            --
            @{tooltip_content(Side::Left, Align::Center, 0.0)}
            Children [ @{label(opts.tooltip)} ]
        ]
    }
}

fn badge(input: InputRef) -> impl Scene {
    bsn! {
        Node { position_type: PositionType::Absolute, right: Val::Px(2.0), bottom: Val::Px(2.0) }
        Pickable { should_block_lower: false, is_hoverable: false }
        Children [ @{input_cap(input, BADGE, theme().surface_floating.on)} ]
    }
}

fn label(text: String) -> impl Scene {
    let family = theme().surface_inset;
    bsn! {
        Style::new().background(family.base).node(|node| {
            node.padding = UiRect::axes(Val::Px(6.0), Val::Px(3.0));
        })
        Pickable { should_block_lower: false, is_hoverable: false }
        Children [ @{text_colored(text, family.on)} ]
    }
}
