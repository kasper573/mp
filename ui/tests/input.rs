use egui::{Context, Event, Key, Modifiers, PointerButton, Pos2, RawInput, Rect, Vec2};
use ui::input::{NumberField, SliderField};

struct Typing {
    ctx: Context,
    field: Rect,
}

impl Typing {
    fn new() -> Self {
        let ctx = Context::default();
        ui::apply(&ctx);
        Self {
            ctx,
            field: Rect::NOTHING,
        }
    }

    /// One frame of the field holding `values`, after `events`: whether it took new numbers.
    fn frame<const K: usize>(
        &mut self,
        events: Vec<Event>,
        values: [&mut f32; K],
        range: Option<std::ops::RangeInclusive<f32>>,
    ) -> bool {
        let input = RawInput {
            screen_rect: Some(Rect::from_min_size(Pos2::ZERO, Vec2::new(400.0, 200.0))),
            events,
            ..RawInput::default()
        };
        let mut taken = false;
        let mut field = Rect::NOTHING;
        let mut once = Some((values, range));
        let mut output = self.ctx.run_ui(input, |ui| {
            let Some((values, range)) = once.take() else {
                return;
            };
            let number = NumberField::of(values);
            let number = match range {
                Some(range) => number.range(range),
                None => number,
            };
            taken = number.show(ui);
            field = ui.min_rect();
        });
        output.textures_delta.clear();
        self.field = field;
        taken
    }

    /// The field clicked into, all of it selected, `text` typed over it and `then` pressed.
    fn types<const K: usize>(
        &mut self,
        values: [&mut f32; K],
        range: Option<std::ops::RangeInclusive<f32>>,
        text: &str,
        then: Key,
    ) -> bool {
        let mut held: Vec<f32> = values.iter().map(|value| **value).collect();
        let mut frame = |typing: &mut Self, events: Vec<Event>| {
            let mut refs = held.iter_mut();
            let values: [&mut f32; K] = std::array::from_fn(|_| refs.next().expect("a value"));
            typing.frame(events, values, range.clone())
        };
        frame(self, Vec::new());
        let at = self.field.center();
        let click = |pressed| Event::PointerButton {
            pos: at,
            button: PointerButton::Primary,
            pressed,
            modifiers: Modifiers::NONE,
        };
        frame(self, vec![Event::PointerMoved(at), click(true)]);
        frame(self, vec![click(false)]);
        frame(self, vec![key(Key::A, Modifiers::COMMAND)]);
        frame(self, vec![Event::Text(text.to_owned())]);
        let taken = frame(self, vec![key(then, Modifiers::NONE)]);
        for (value, typed) in values.into_iter().zip(held) {
            *value = typed;
        }
        taken
    }
}

fn key(key: Key, modifiers: Modifiers) -> Event {
    Event::Key {
        key,
        physical_key: None,
        pressed: true,
        repeat: false,
        modifiers,
    }
}

#[test]
fn a_number_field_takes_what_is_typed_only_once_it_reads_and_is_confirmed() {
    struct Case {
        text: &'static str,
        range: Option<std::ops::RangeInclusive<f32>>,
        then: Key,
        expected: f32,
        taken: bool,
    }
    let case = |text, range, then, expected, taken| Case {
        text,
        range,
        then,
        expected,
        taken,
    };
    let cases = [
        case("7.5", None, Key::Enter, 7.5, true),
        case("99", Some(0.0..=10.0), Key::Enter, 10.0, true),
        case("-3", Some(0.0..=10.0), Key::Enter, 0.0, true),
        case("seven", None, Key::Enter, 1.0, false),
        case("7", None, Key::Escape, 1.0, false),
    ];
    for Case {
        text,
        range,
        then,
        expected,
        taken,
    } in cases
    {
        let mut value = 1.0;
        let took = Typing::new().types([&mut value], range, text, then);
        assert_eq!(
            (value, took),
            (expected, taken),
            "typing {text:?} then {then:?}"
        );
    }
}

#[test]
fn a_field_of_several_numbers_takes_them_all_or_none() {
    let (mut x, mut y) = (1.0, 2.0);
    assert!(Typing::new().types([&mut x, &mut y], None, "3, 4", Key::Enter));
    assert_eq!((x, y), (3.0, 4.0));
    assert!(!Typing::new().types([&mut x, &mut y], None, "5", Key::Enter));
    assert_eq!((x, y), (3.0, 4.0));
}

#[test]
fn a_slider_keeps_a_value_outside_its_range_until_slid_then_takes_a_plain_one() {
    let ctx = Context::default();
    ui::apply(&ctx);
    let frame = |events: Vec<Event>, value: &mut f32| {
        let input = RawInput {
            screen_rect: Some(Rect::from_min_size(Pos2::ZERO, Vec2::new(400.0, 200.0))),
            events,
            ..RawInput::default()
        };
        let mut moved = false;
        let mut slider = Rect::NOTHING;
        let _ = ctx.run_ui(input, |ui| {
            moved = SliderField::new(value, 0.0..=1.0).show(ui);
            let room = ui.min_rect();
            slider = Rect::from_min_size(
                room.min,
                Vec2::new(ui.spacing().slider_width, room.height()),
            );
        });
        (moved, slider)
    };
    let mut value = 3.0;
    let (moved, slider) = frame(Vec::new(), &mut value);
    assert!(!moved);
    assert_eq!(value, 3.0);
    let at = slider.center();
    let press = |pressed| Event::PointerButton {
        pos: at,
        button: PointerButton::Primary,
        pressed,
        modifiers: Modifiers::NONE,
    };
    assert!(frame(vec![Event::PointerMoved(at), press(true)], &mut value).0);
    frame(vec![press(false)], &mut value);
    assert_eq!(value, 0.5);
}
