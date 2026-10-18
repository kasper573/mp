use design_tokens::card::{self, Card};
use design_tokens::face::{self, Face, TextRole};
use design_tokens::glyph::Kind;
use design_tokens::motion::{self, Clock};
use design_tokens::sheet::{Depth, Sheet};
use design_tokens::{controls, ink};
use egui::{Context, Pos2, Rect, Vec2};

fn context() -> Context {
    let ctx = Context::default();
    design_tokens::apply(&ctx);
    ctx
}

fn pass(ctx: &Context, add: impl FnOnce(&mut egui::Ui)) {
    let input = egui::RawInput {
        screen_rect: Some(Rect::from_min_size(Pos2::ZERO, Vec2::new(1280.0, 720.0))),
        ..egui::RawInput::default()
    };
    let mut add = Some(add);
    let mut output = ctx.run_ui(input, |ui| {
        if let Some(add) = add.take() {
            add(ui);
        }
    });
    output.textures_delta.clear();
}

#[test]
fn every_face_lays_out_text_in_its_own_font() {
    let ctx = context();
    pass(&ctx, |_| {});
    for face in Face::ALL {
        let width = ctx.fonts_mut(|fonts| {
            fonts
                .layout_no_wrap("Rusty Sword".to_owned(), face.id(15.0), ink::INK)
                .size()
                .x
        });
        assert!(width > 10.0, "{face:?} lays out nothing");
    }
}

#[test]
fn text_roles_resolve_to_their_faces_and_sizes() {
    assert_eq!(TextRole::Title.face(), Face::SmallCapsBold);
    assert_eq!(TextRole::Title.size(), 17.0);
    assert_eq!(TextRole::Body.size(), 15.0);
    assert_eq!(TextRole::CardBody.size(), 14.5);
    assert_eq!(TextRole::Line.size(), 17.0);
    assert_eq!(TextRole::Flavour.face(), Face::Quill);
    assert_eq!(TextRole::Numeral.face(), Face::Numerals);
    assert_eq!(TextRole::KeyHint.face(), Face::Mono);
    assert!(TextRole::Section.tracking() > TextRole::Name.tracking());
    assert_eq!(TextRole::Body.line_height(), Some(21.0));
}

#[test]
fn roman_numerals() {
    assert_eq!(face::roman(0), "0");
    assert_eq!(face::roman(1), "I");
    assert_eq!(face::roman(4), "IV");
    assert_eq!(face::roman(9), "IX");
    assert_eq!(face::roman(12), "XII");
    assert_eq!(face::roman(3999), "MMMCMXCIX");
    assert_eq!(face::roman(4000), "4000");
}

#[test]
fn a_kinds_word_and_ground_agree_with_the_table() {
    assert_eq!(Kind::Equipment.word(), "equipment");
    assert_eq!(Kind::Equipment.ground()[1], ink::AZURE);
    assert_eq!(Kind::Usable.word(), "usable");
    assert_eq!(Kind::Usable.ground()[1], ink::WAX);
    assert_eq!(Kind::Resource.word(), "resource");
    assert_eq!(Kind::Quest.word(), "quest");
    assert_eq!(Kind::Quest.ground()[0], ink::TYRIAN);
    assert_eq!(Kind::Active.word(), "active skill");
    assert_eq!(Kind::Active.ground(), Kind::Usable.ground());
    assert_eq!(Kind::Passive.word(), "passive skill");
    let words: std::collections::HashSet<&str> = Kind::ALL.iter().map(|kind| kind.word()).collect();
    assert_eq!(words.len(), Kind::ALL.len());
}

#[test]
fn every_kind_glyph_decodes_into_a_texture() {
    let ctx = context();
    pass(&ctx, |_| {});
    for kind in Kind::ALL {
        let texture = kind.texture(&ctx);
        assert_eq!(texture, kind.texture(&ctx), "{kind:?} is loaded once");
    }
}

#[test]
fn the_sheet_clock_runs_up_in_180_ms_and_down_in_120_and_reverses_from_where_it_is() {
    let mut clock = Clock::CLOSED;
    assert!(clock.is_closed());
    clock.run(true, 0.09);
    assert!((clock.progress() - 0.5).abs() < 1e-5);
    clock.run(true, 0.09);
    assert!(clock.is_open());
    clock.run(false, 0.06);
    assert!((clock.progress() - 0.5).abs() < 1e-5);
    clock.run(true, 0.045);
    assert!((clock.progress() - 0.75).abs() < 1e-5);
    clock.run(false, 1.0);
    assert!(clock.is_closed());
}

#[test]
fn a_sheet_rests_flat_once_open_and_starts_small_faint_and_lifted() {
    let closed = Clock::CLOSED.pose();
    assert_eq!(closed.opacity, 0.0);
    assert!((closed.scale - 1.03).abs() < 1e-5);
    assert_eq!(closed.dy, -4.0);
    let open = Clock::OPEN.pose();
    assert_eq!(open.opacity, 1.0);
    assert_eq!(open.scale, 1.0);
    assert_eq!(open.dy, 0.0);
    assert_eq!(open.shadow, motion::SheetPose::REST.shadow);
    let mut mid = Clock::CLOSED;
    mid.run(true, 0.09);
    let pose = mid.pose();
    assert!(pose.opacity > 0.0 && pose.opacity < 1.0);
    assert!(pose.scale > 1.0 && pose.scale < 1.03);
}

#[test]
fn a_card_is_dealt_from_the_slot_at_a_fifth_turned_and_lands_straight() {
    let from = Rect::from_min_size(Pos2::new(100.0, 500.0), Vec2::splat(36.0));
    let to = Rect::from_min_size(Pos2::new(900.0, 96.0), Vec2::new(300.0, 380.0));
    let start = motion::deal(0.0, from, to);
    assert_eq!(start.center, from.center());
    assert!((start.scale - 0.2).abs() < 1e-5);
    assert!((start.angle - (-14.0_f32).to_radians()).abs() < 1e-5);
    assert_eq!(start.opacity, 0.0);
    let landed = motion::deal(1.0, from, to);
    assert_eq!(landed.center, to.center());
    assert!((landed.scale - 1.0).abs() < 1e-5);
    assert_eq!(landed.angle, 0.0);
    assert_eq!(landed.opacity, 1.0);
    let overshoot = motion::deal(0.19 / motion::DEAL_SECS, from, to);
    assert!(overshoot.scale > 1.0 && overshoot.scale <= 1.011);
    let mid = motion::deal(0.5, from, to);
    assert!(mid.center.x > from.center().x && mid.center.x < to.center().x);
}

#[test]
fn a_flicked_card_lifts_tilts_and_fades_and_a_replaced_one_drops_and_dims() {
    let at = Rect::from_min_size(Pos2::new(900.0, 96.0), Vec2::new(300.0, 380.0));
    let gone = motion::flick(1.0, at);
    assert_eq!(gone.center, at.center() - Vec2::new(0.0, 20.0));
    assert!((gone.angle - 4.0_f32.to_radians()).abs() < 1e-5);
    assert_eq!(gone.opacity, 0.0);
    assert_eq!(motion::flick(0.0, at).opacity, 1.0);
    let under = motion::replaced(1.0, at);
    assert_eq!(under.center, at.center() + Vec2::new(0.0, 26.0));
    assert!((under.opacity - 0.55).abs() < 1e-5);
}

#[test]
fn a_posed_layer_comes_back_as_meshes_moved_into_the_pose() {
    let ctx = context();
    let layer = egui::LayerId::new(egui::Order::Middle, egui::Id::new("card in motion"));
    let rest = Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::new(300.0, 380.0));
    let mut meshes = Vec::new();
    pass(&ctx, |ui| {
        ui.ctx()
            .layer_painter(layer)
            .rect_filled(rest, 0.0, ink::CREAM);
        let pose = motion::CardPose {
            center: rest.center() + Vec2::new(200.0, 0.0),
            scale: 1.0,
            angle: 0.0,
            opacity: 0.5,
        };
        meshes = motion::posed(ui.ctx(), layer, rest, pose);
    });
    assert!(!meshes.is_empty());
    let moved = meshes[0].calc_bounds();
    assert!((moved.center().x - (rest.center().x + 200.0)).abs() < 1.0);
    assert!(meshes[0].vertices[0].color.a() < 200);
}

#[test]
fn a_card_is_300_wide_as_tall_as_its_plate_and_never_past_420() {
    let ctx = context();
    let mut short = None;
    let mut long = None;
    pass(&ctx, |ui| {
        short = Some(
            Card::new(Kind::Equipment, "Rusty Sword")
                .show(ui, |ui, _| card::fact(ui, "+2 Damage"))
                .rect,
        );
        long = Some(
            Card::new(Kind::Quest, "A long errand")
                .show(ui, |ui, _| {
                    for line in 0..40 {
                        card::fact(ui, &format!("Objective {line}"));
                    }
                })
                .rect,
        );
    });
    let (short, long) = (short.unwrap(), long.unwrap());
    assert_eq!(short.width(), card::WIDTH);
    assert!(short.height() > card::KIND_BAND + card::ART + card::NAME_BAND);
    assert!(short.height() < card::MAX_HEIGHT);
    assert!(
        (long.height() - card::MAX_HEIGHT).abs() <= 1.0,
        "{}",
        long.height()
    );
}

#[test]
fn a_card_cuts_a_long_name_and_tells_the_plate_so() {
    let ctx = context();
    let mut cut = Vec::new();
    pass(&ctx, |ui| {
        Card::new(Kind::Resource, "Bundle").show(ui, |_, plate| cut.push(plate.name_cut));
        Card::new(
            Kind::Resource,
            "A bundle of seventeen very long dried herbs from the far marsh",
        )
        .show(ui, |_, plate| cut.push(plate.name_cut));
    });
    assert_eq!(cut, vec![false, true]);
}

#[test]
fn a_closable_card_has_a_cross_and_a_page_card_has_none() {
    let ctx = context();
    let mut crosses = Vec::new();
    pass(&ctx, |ui| {
        let mut closable = Card::new(Kind::Active, "Cleave");
        closable.closable = true;
        crosses.push(closable.show(ui, |_, _| {}).close.is_some());
        crosses.push(
            Card::new(Kind::Passive, "Thick Skin")
                .show(ui, |_, _| {})
                .close
                .is_some(),
        );
    });
    assert_eq!(crosses, vec![true, false]);
}

#[test]
fn a_sheet_lays_its_parts_out_and_shrinks_its_cross_when_small() {
    let ctx = context();
    pass(&ctx, |ui| {
        let sheet = Sheet {
            title: Some("Inventory"),
            closable: true,
            curl: true,
            depth: Depth::Front,
        };
        let rect = Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::new(400.0, 230.0));
        let parts = sheet.paint(ui.painter(), rect);
        assert_eq!(parts.band.height(), design_tokens::sheet::TITLE_BAND);
        assert!(rect.contains_rect(parts.body));
        assert!(parts.body.min.y >= parts.band.max.y);
        let cross = parts.cross.unwrap();
        assert_eq!(cross.width(), design_tokens::sheet::CROSS);
        assert!(rect.contains_rect(cross));
        let curl = parts.curl.unwrap();
        assert_eq!(curl.max, rect.max);
        let small = sheet.paint(
            ui.painter(),
            Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::splat(100.0)),
        );
        assert_eq!(
            small.cross.unwrap().width(),
            design_tokens::sheet::SMALL_CROSS
        );
    });
}

#[test]
fn controls_stand_a_control_tall() {
    let ctx = context();
    let mut heights = Vec::new();
    pass(&ctx, |ui| {
        heights.push(controls::button(ui, "Buy").rect.height());
        heights.push(controls::primary(ui, "Confirm").rect.height());
        heights.push(controls::danger(ui, "Abandon").rect.height());
        let mut value = 0.5;
        heights.push(controls::slider(ui, &mut value, 0.0..=1.0).rect.height());
        assert_eq!(value, 0.5);
    });
    assert!(
        heights
            .iter()
            .all(|height| *height == controls::CONTROL_HEIGHT)
    );
}

#[test]
fn a_sheet_in_motion_keeps_its_pin_where_it_falls_within_a_pixel_at_rest() {
    let ctx = context();
    let rect = Rect::from_min_size(Pos2::new(210.3, 140.6), Vec2::new(400.0, 230.0));
    let pin = Pos2::new(355.25, 148.75);
    let within = |at: Pos2| at - Pos2::new(at.x.round(), at.y.round());
    let mut clock = Clock::CLOSED;
    for _ in 0..12 {
        clock.run(true, motion::SHEET_OPEN_SECS / 12.0);
        let posed = clock.pose().transform(&ctx, rect, pin) * pin;
        let drift = within(posed) - within(pin);
        assert!(drift.length() < 1e-3, "drifted {drift:?} within its pixel");
    }
}
