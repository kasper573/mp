use editor::drafts;
use egui::{Context, Id, RawInput, Ui};

fn frame(ctx: &Context, mut body: impl FnMut(&mut Ui)) {
    let _ = ctx.run_ui(RawInput::default(), |ui| body(ui));
}

#[test]
fn a_draft_outlives_the_frame_that_wrote_it() {
    let ctx = Context::default();
    let field = Id::new("field");
    frame(&ctx, |ui| drafts::set_draft(ui, field, "12"));
    frame(&ctx, |ui| {
        assert_eq!(drafts::draft_of(ui, field).as_deref(), Some("12"));
    });
}

#[test]
fn a_field_without_a_draft_shows_its_current_value() {
    let ctx = Context::default();
    let field = Id::new("field");
    frame(&ctx, |ui| {
        assert_eq!(drafts::draft_or(ui, field, "5".to_owned()), "5");
    });
    frame(&ctx, |ui| drafts::set_draft(ui, field, "7"));
    frame(&ctx, |ui| {
        assert_eq!(drafts::draft_or(ui, field, "5".to_owned()), "7");
    });
}

#[test]
fn taking_a_draft_hands_it_over_once() {
    let ctx = Context::default();
    let field = Id::new("field");
    frame(&ctx, |ui| drafts::set_draft(ui, field, "3"));
    frame(&ctx, |ui| {
        assert_eq!(drafts::take_draft(ui, field).as_deref(), Some("3"));
    });
    frame(&ctx, |ui| {
        assert_eq!(drafts::take_draft(ui, field), None);
        assert_eq!(drafts::draft_of(ui, field), None);
    });
}

#[test]
fn clearing_a_draft_leaves_other_fields_alone() {
    let ctx = Context::default();
    let (first, second) = (Id::new("first"), Id::new("second"));
    frame(&ctx, |ui| {
        drafts::set_draft(ui, first, "1");
        drafts::set_draft(ui, second, "2");
    });
    frame(&ctx, |ui| drafts::clear_draft(ui, first));
    frame(&ctx, |ui| {
        assert_eq!(drafts::draft_of(ui, first), None);
        assert_eq!(drafts::draft_of(ui, second).as_deref(), Some("2"));
    });
}
