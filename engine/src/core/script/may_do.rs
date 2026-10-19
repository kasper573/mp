use super::{EventDef, Vocabulary};

#[derive(Clone)]
pub struct MayDo<V: Vocabulary> {
    pub answers: Vec<<V::Event as EventDef<V>>::Kind>,
    pub reaches: Vec<V::Reach>,
    pub dialogue: Vec<String>,
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
    pub fn answers(&self, kind: <V::Event as EventDef<V>>::Kind) -> bool {
        self.answers.contains(&kind)
    }

    /// What one owner's procedures may do between them, the events each answers included.
    pub fn owned<'a>(parts: impl IntoIterator<Item = &'a MayDo<V>>) -> MayDo<V>
    where
        V: 'a,
    {
        let mut all = MayDo::default();
        for part in parts {
            all.absorb(part);
            all.answers.extend(part.answers.iter().copied());
        }
        all
    }

    /// Takes in what a called procedure may do; the events it answers stay its own.
    pub fn absorb(&mut self, other: &MayDo<V>) {
        self.reaches.extend(other.reaches.iter().cloned());
        self.dialogue.extend(other.dialogue.iter().cloned());
        self.calls.extend(other.calls.iter().cloned());
        self.waits |= other.waits;
    }
}
