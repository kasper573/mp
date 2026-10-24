use engine::core::time::{GameDay, UnixMillis, UtcHour};

const HOUR: u64 = 3_600_000;
const DAY: u64 = 24 * HOUR;

#[test]
fn the_day_rolls_over_exactly_at_the_reset_hour_and_nowhere_else() {
    let at_four = UnixMillis(10 * DAY + 4 * HOUR);
    let just_before = |at: UnixMillis| UnixMillis(at.0 - 1);
    assert_eq!(
        GameDay::of(at_four, hour(4)).0,
        GameDay::of(just_before(at_four), hour(4)).0 + 1
    );

    let midnight = UnixMillis(10 * DAY);
    assert_eq!(
        GameDay::of(just_before(midnight), hour(4)),
        GameDay::of(midnight, hour(4))
    );
    assert_ne!(
        GameDay::of(just_before(midnight), UtcHour::MIDNIGHT),
        GameDay::of(midnight, UtcHour::MIDNIGHT)
    );
}

#[test]
fn hours_outside_a_day_are_rejected() {
    assert!(UtcHour::try_from(23).is_ok());
    assert!(UtcHour::try_from(24).is_err());
    assert!(serde_json::from_str::<UtcHour>("24").is_err());
    assert_eq!(serde_json::from_str::<UtcHour>("23").ok(), Some(hour(23)));
}

fn hour(value: u8) -> UtcHour {
    UtcHour::try_from(value).expect("valid hour")
}
