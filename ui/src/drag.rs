//! What a drag carries from one widget to another.

use egui::{Context, DragAndDrop, Response};

pub fn carry<T: Send + Sync + 'static>(gui: &Context, carried: T) {
    DragAndDrop::set_payload(gui, carried);
}

pub fn carried<T: Clone + Send + Sync + 'static>(gui: &Context) -> Option<T> {
    DragAndDrop::payload::<T>(gui).map(|carried| (*carried).clone())
}

/// What was let go of over the widget this frame, if anything; taking it leaves nothing for
/// whatever else lies under the pointer.
pub fn dropped<T: Clone + Send + Sync + 'static>(response: &Response) -> Option<T> {
    let carried = (*response.dnd_release_payload::<T>()?).clone();
    DragAndDrop::clear_payload(&response.ctx);
    Some(carried)
}
