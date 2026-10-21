/// The JSON pointer of a field of a serialized type, checked against the type: `field!(ModelDef,
/// sprites.frame_size)` is `"/sprites/frame_size"`, and naming a field the type doesn't have
/// doesn't compile.
#[macro_export]
macro_rules! field {
    ($ty:ty, $($field:ident).+) => {{
        let _ = |row: &$ty| {
            let _ = &row.$($field).+;
        };
        concat!($("/", stringify!($field)),+)
    }};
}

pub mod core;
pub mod systems;
