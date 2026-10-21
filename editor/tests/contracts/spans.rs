use editor::spans;
use engine::core::content::serial::json_of;
use engine::systems::text::{Fx, Ink, Span};
use serde_json::{Value, json};

fn line_of(json: Value) -> Vec<Span> {
    serde_json::from_value(json).expect("a line of spans")
}

fn json(spans: Option<Vec<Span>>) -> Option<Value> {
    spans.map(|spans| json_of(&spans).expect("spans write"))
}

fn token_of(span: Value) -> String {
    spans::plain(&line_of(json!([span])))
}

#[test]
fn typing_inside_a_styled_span_keeps_its_style() {
    let line = line_of(json!(["The ", { "text": "red", "ink": "danger" }, " key"]));
    let typed = json(spans::retype(&line, "The red key", "The reed key"));
    assert_eq!(
        typed,
        Some(json!(["The ", { "text": "reed", "ink": "danger" }, " key"]))
    );
}

#[test]
fn typing_where_two_spans_meet_continues_the_first() {
    let line = line_of(json!([{ "text": "red", "ink": "danger" }, " key"]));
    let typed = json(spans::retype(&line, "red key", "reds key"));
    assert_eq!(
        typed,
        Some(json!([{ "text": "reds", "ink": "danger" }, " key"]))
    );
}

#[test]
fn deleting_a_styled_span_whole_leaves_the_plain_text_around_it() {
    let line = line_of(json!(["a ", { "text": "red", "ink": "danger" }, " key"]));
    let typed = json(spans::retype(&line, "a red key", "a  key"));
    assert_eq!(typed, Some(json!(["a  key"])));
}

#[test]
fn a_value_is_deleted_whole_or_not_at_all() {
    let line = line_of(json!(["You have ", { "value": 3 }, " coins"]));
    let shown = spans::plain(&line);
    let token = token_of(json!({ "value": 3 }));
    let without = shown.replace(&token, "");
    assert_eq!(
        json(spans::retype(&line, &shown, &without)),
        Some(json!(["You have  coins"]))
    );
    let cut: String = token.chars().skip(1).collect();
    let partly = shown.replace(&token, &cut);
    assert_eq!(json(spans::retype(&line, &shown, &partly)), None);
}

#[test]
fn text_typed_beside_a_value_keeps_the_value_whole() {
    let line = line_of(json!(["You have ", { "value": 3 }]));
    let shown = spans::plain(&line);
    let typed = json(spans::retype(&line, &shown, &format!("{shown} coins")));
    assert_eq!(typed, Some(json!(["You have ", { "value": 3 }, " coins"])));
}

#[test]
fn restyling_a_selection_splits_the_span_around_it() {
    let line = line_of(json!(["a red key"]));
    let styled = spans::restyle(&line, (2, 5), |style| style.push(Fx::Ink(Ink::Danger)));
    assert_eq!(
        json(Some(styled)),
        Some(json!(["a ", { "text": "red", "ink": "danger" }, " key"]))
    );
}

#[test]
fn restyling_leaves_values_as_they_are() {
    let line = line_of(json!(["a ", { "value": 3 }, " b"]));
    let shown = spans::plain(&line);
    let styled = spans::restyle(&line, (0, shown.chars().count()), |style| {
        style.push(Fx::Slow)
    });
    assert_eq!(
        json(Some(styled)),
        Some(json!([
            { "text": "a ", "slow": true },
            { "value": 3 },
            { "text": " b", "slow": true }
        ]))
    );
}

#[test]
fn a_value_replaces_the_selection() {
    let line = line_of(json!(["a red key"]));
    assert_eq!(
        json(spans::with_value(&line, (2, 5))),
        Some(json!(["a ", { "value": 0 }, " key"]))
    );
}

#[test]
fn text_typed_between_two_values_lands_between_them() {
    let line = line_of(json!([{ "value": 1 }, { "value": 2 }]));
    let shown = spans::plain(&line);
    let between = token_of(json!({ "value": 1 })).chars().count();
    let mut typed: Vec<char> = shown.chars().collect();
    typed.insert(between, '+');
    let typed: String = typed.into_iter().collect();
    assert_eq!(
        json(spans::retype(&line, &shown, &typed)),
        Some(json!([{ "value": 1 }, "+", { "value": 2 }]))
    );
}
