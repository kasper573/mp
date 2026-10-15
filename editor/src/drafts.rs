use egui::Ui;

pub fn draft_of(ui: &Ui, id: egui::Id) -> Option<String> {
    ui.ctx().data(|d| d.get_temp::<String>(id))
}

pub fn draft_or(ui: &Ui, id: egui::Id, current: String) -> String {
    draft_of(ui, id).unwrap_or(current)
}

pub fn set_draft(ui: &Ui, id: egui::Id, text: &str) {
    ui.ctx().data_mut(|d| d.insert_temp(id, text.to_owned()));
}

pub fn take_draft(ui: &Ui, id: egui::Id) -> Option<String> {
    ui.ctx().data_mut(|d| d.remove_temp::<String>(id))
}

pub fn clear_draft(ui: &Ui, id: egui::Id) {
    take_draft(ui, id);
}
