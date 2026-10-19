use editor::spans;
use serde_json::{Value, json};

fn token_of(span: Value) -> String {
    spans::plain(&json!([span]))
}

#[test]
fn typing_inside_a_styled_span_keeps_its_style() {
    let line = json!(["The ", { "text": "red", "ink": "danger" }, " key"]);
    let typed = spans::retype(&line, "The red key", "The reed key");
    assert_eq!(
        typed,
        Some(json!(["The ", { "text": "reed", "ink": "danger" }, " key"]))
    );
}

#[test]
fn typing_where_two_spans_meet_continues_the_first() {
    let line = json!([{ "text": "red", "ink": "danger" }, " key"]);
    let typed = spans::retype(&line, "red key", "reds key");
    assert_eq!(
        typed,
        Some(json!([{ "text": "reds", "ink": "danger" }, " key"]))
    );
}

#[test]
fn deleting_a_styled_span_whole_leaves_the_plain_text_around_it() {
    let line = json!(["a ", { "text": "red", "ink": "danger" }, " key"]);
    let typed = spans::retype(&line, "a red key", "a  key");
    assert_eq!(typed, Some(json!(["a  key"])));
}

#[test]
fn a_value_is_deleted_whole_or_not_at_all() {
    let line = json!(["You have ", { "value": 3 }, " coins"]);
    let shown = spans::plain(&line);
    let token = token_of(json!({ "value": 3 }));
    let without = shown.replace(&token, "");
    assert_eq!(
        spans::retype(&line, &shown, &without),
        Some(json!(["You have  coins"]))
    );
    let cut: String = token.chars().skip(1).collect();
    let partly = shown.replace(&token, &cut);
    assert_eq!(spans::retype(&line, &shown, &partly), None);
}

#[test]
fn text_typed_beside_a_value_keeps_the_value_whole() {
    let line = json!(["You have ", { "value": 3 }]);
    let shown = spans::plain(&line);
    let typed = spans::retype(&line, &shown, &format!("{shown} coins"));
    assert_eq!(typed, Some(json!(["You have ", { "value": 3 }, " coins"])));
}

#[test]
fn restyling_a_selection_splits_the_span_around_it() {
    let line = json!(["a red key"]);
    let styled = spans::restyle(&line, (2, 5), |style| {
        style.insert("ink".to_owned(), json!("danger"));
    });
    assert_eq!(
        styled,
        json!(["a ", { "text": "red", "ink": "danger" }, " key"])
    );
}

#[test]
fn restyling_leaves_values_as_they_are() {
    let line = json!(["a ", { "value": 3 }, " b"]);
    let shown = spans::plain(&line);
    let styled = spans::restyle(&line, (0, shown.chars().count()), |style| {
        style.insert("slow".to_owned(), json!(true));
    });
    assert_eq!(
        styled,
        json!([
            { "text": "a ", "slow": true },
            { "value": 3 },
            { "text": " b", "slow": true }
        ])
    );
}

#[test]
fn a_value_replaces_the_selection() {
    let line = json!(["a red key"]);
    assert_eq!(
        spans::with_value(&line, (2, 5)),
        Some(json!(["a ", { "value": 0 }, " key"]))
    );
}

#[test]
fn text_typed_between_two_values_lands_between_them() {
    let line = json!([{ "value": 1 }, { "value": 2 }]);
    let shown = spans::plain(&line);
    let between = token_of(json!({ "value": 1 })).chars().count();
    let mut typed: Vec<char> = shown.chars().collect();
    typed.insert(between, '+');
    let typed: String = typed.into_iter().collect();
    assert_eq!(
        spans::retype(&line, &shown, &typed),
        Some(json!([{ "value": 1 }, "+", { "value": 2 }]))
    );
}
