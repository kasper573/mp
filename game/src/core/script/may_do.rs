use super::{EventDef, Name, Vocabulary};

pub type Reach<V> = <V as Vocabulary>::Reach;

#[derive(Clone)]
pub struct MayDo<V: Vocabulary> {
    pub answers: Vec<<V::Event as EventDef>::Kind>,
    pub reaches: Vec<Reach<V>>,
    pub dialogue: Vec<Name>,
    pub calls: Vec<String>,
    pub waits: bool,
}

impl<V: Vocabulary> Default for MayDo<V> {
    fn default() -> Self {
        MayDo {
            answers: Vec::new(),
            reaches: Vec::new(),
            dialogue: Vec::new(),
            calls: Vec::new(),
            waits: false,
        }
    }
}

impl<V: Vocabulary> MayDo<V> {
    pub fn answers(&self, kind: <V::Event as EventDef>::Kind) -> bool {
        self.answers.contains(&kind)
    }

    pub fn absorb(&mut self, other: &MayDo<V>) {
        self.reaches.extend(other.reaches.iter().cloned());
        self.dialogue.extend(other.dialogue.iter().copied());
        self.calls.extend(other.calls.iter().cloned());
        self.waits |= other.waits;
    }
}
