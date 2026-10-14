use bevy_scene::{Scene, bsn};
use bevy_ui::{AlignItems, BorderRadius, Checkable, FlexDirection, Node, Val};
use bevy_ui_widgets::Button;

use crate::components::checkbox::toggle_box_style;
use crate::state::{Gated, InheritChecked, SelectGroup, SelectItem, SelectTrigger};
use crate::style::Style;
use crate::theme::theme;
use crate::tokens::{radius, spacing};

pub fn radio_group(value: Option<String>) -> impl Scene {
    bsn! {
        SelectGroup {
            exclusive: true,
            toggleable: false,
            initial: {value.into_iter().collect::<Vec<_>>()},
        }
        Style::new().node(|node| {
            node.flex_direction = FlexDirection::Column;
            node.width = Val::Percent(100.0);
            node.row_gap = Val::Px(spacing::L);
        })
    }
}

pub fn radio_item(value: impl Into<String>) -> impl Scene {
    let value_str = value.into();
    bsn! {
        Button
        Checkable
        SelectItem { value: {value_str} }
        SelectTrigger
        Style::new().node(|node| {
            node.flex_direction = FlexDirection::Row;
            node.align_items = AlignItems::Center;
            node.column_gap = Val::Px(spacing::M);
        })
    }
}

pub fn radio_circle() -> impl Scene {
    bsn! {
        InheritChecked
        toggle_box_style(radius::PILL)
    }
}

pub fn radio_indicator() -> impl Scene {
    bsn! {
        Node {
            width: Val::Px(10.0),
            height: Val::Px(10.0),
            border_radius: { BorderRadius::all(Val::Px(radius::PILL)) },
        }
        InheritChecked
        Gated
        Style::new().background(theme().primary.on)
    }
}
