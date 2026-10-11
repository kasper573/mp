use std::sync::Arc;

use bevy_ecs::prelude::*;

use super::{Objective, QuestId};
use crate::core::content::{Content, Fixture};
use crate::core::script::{
    Answer, Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind, Reveal,
};
use crate::systems::dialogue::{self, CardOffer, ChoiceChip, ChoiceTag, ConversationPanel};
use crate::systems::script::condition;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Reach, RiftScripting};
use crate::systems::text::LineText;

#[derive(Clone)]
pub struct OfferQuest {
    pub who: Aim,
    pub quest: QuestId,
    pub accepted: Arrow,
    pub declined: Arrow,
    pub refused: Arrow,
}

#[derive(Clone)]
pub struct AcceptQuest {
    pub who: Aim,
    pub quest: QuestId,
    pub done: Arrow,
    pub refused: Arrow,
}

#[derive(Clone)]
pub struct TurnIn {
    pub who: Aim,
    pub quest: QuestId,
    pub done: Arrow,
    pub refused: Arrow,
    pub cancelled: Arrow,
}

#[derive(Clone)]
pub struct FailQuest {
    pub who: Aim,
    pub quest: QuestId,
    pub next: Arrow,
}

#[derive(Clone)]
pub struct CompleteTask {
    pub who: Aim,
    pub quest: QuestId,
    pub task: Name,
    pub next: Arrow,
}

#[derive(Clone)]
pub struct Decide {
    pub who: Aim,
    pub quest: QuestId,
    pub path: Name,
    pub next: Arrow,
}

const ACCEPT: &str = "Accept";
const DECLINE: &str = "Decline";
const NOT_YET: &str = "Not yet.";

impl EffectDef<RiftScripting> for OfferQuest {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![
            ("accepted", self.accepted),
            ("declined", self.declined),
            ("refused", self.refused),
        ]
    }
    fn pauses(&self) -> bool {
        true
    }
    fn keeps_box(&self) -> bool {
        true
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (quest, refused) = (self.quest, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(player) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to offer it to");
                return EffectStep::Output(2);
            };
            if let Some(reason) = super::offer_refusal(world, player, quest) {
                effects::refuse(world, cx, refused, reason);
                return EffectStep::Output(2);
            }
            let offers = offer_card(world, player, quest);
            let panel = Some(ConversationPanel::QuestOffer(quest));
            if dialogue::card(
                world,
                cx.key,
                player,
                offers,
                Answer::Output("declined"),
                panel,
            ) {
                EffectStep::Pause
            } else {
                EffectStep::Output(1)
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Offers(self.quest)]
    }
}

impl EffectDef<RiftScripting> for AcceptQuest {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("done", self.done), ("refused", self.refused)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (quest, refused) = (self.quest, self.refused);
        Ok(Box::new(move |world, cx| {
            let Some(player) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to accept it");
                return EffectStep::Output(1);
            };
            match super::accept(world, player, quest) {
                Ok(()) => EffectStep::Output(0),
                Err(reason) => {
                    effects::refuse(world, cx, refused, reason);
                    EffectStep::Output(1)
                }
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Accepts(self.quest)]
    }
}

impl EffectDef<RiftScripting> for TurnIn {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![
            ("done", self.done),
            ("refused", self.refused),
            ("cancelled", self.cancelled),
        ]
    }
    fn pauses(&self) -> bool {
        true
    }
    fn keeps_box(&self) -> bool {
        true
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (quest, refused) = (self.quest, self.refused);
        let decides = quest.get(cx.content).decision().is_some();
        Ok(Box::new(move |world, cx| {
            let Some(player) = effects::aimed_character(world, cx, &who) else {
                effects::refuse(world, cx, refused, "Nobody to hand it in");
                return EffectStep::Output(1);
            };
            if !super::ready_to_hand_in(world, player, quest) {
                let title = quest.get(world.resource::<Content>()).title;
                effects::refuse(
                    world,
                    cx,
                    refused,
                    format!("{title} isn't ready to hand in"),
                );
                return EffectStep::Output(1);
            }
            if decides {
                return match super::turn_in(world, player, quest, None) {
                    Ok(()) => EffectStep::Output(0),
                    Err(reason) => {
                        effects::refuse(world, cx, refused, reason);
                        EffectStep::Output(1)
                    }
                };
            }
            let offers = turn_in_card(world, player, quest);
            let panel = Some(ConversationPanel::QuestTurnIn(quest));
            if dialogue::card(
                world,
                cx.key,
                player,
                offers,
                Answer::Output("cancelled"),
                panel,
            ) {
                EffectStep::Pause
            } else {
                EffectStep::Output(2)
            }
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::TurnsIn(self.quest)]
    }
}

impl EffectDef<RiftScripting> for FailQuest {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let quest = self.quest;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                super::fail(world, player, quest);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Fails(self.quest)]
    }
}

impl EffectDef<RiftScripting> for CompleteTask {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let quest = self.quest;
        let task = self.task;
        let index = quest
            .get(cx.content)
            .objectives()
            .position(|objective| matches!(objective, Objective::Task { task: known, .. } if *known == task))
            .ok_or_else(|| format!("{} has no task {task}", quest.key(cx.content)))?;
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                super::complete_task(world, player, quest, index);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Completes(self.quest)]
    }
}

impl EffectDef<RiftScripting> for Decide {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let (quest, path) = (self.quest, self.path);
        let known = quest
            .get(cx.content)
            .decision()
            .is_some_and(|paths| paths.iter().any(|known| known.choice == path));
        if !known {
            return Err(format!("{} has no path {path:?}", quest.key(cx.content)));
        }
        Ok(Box::new(move |world, cx| {
            if let Some(player) = effects::aimed_character(world, cx, &who) {
                super::decide(world, player, quest, path);
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Completes(self.quest)]
    }
}

fn offer_card(world: &World, player: Entity, quest: QuestId) -> Vec<CardOffer> {
    let content = world.resource::<Content>();
    let def = quest.get(content);
    let open = super::open_to(world, player, quest);
    let chips = match def.requires().filter(|_| def.reveals(Reveal::Needs)) {
        Some(requires) => condition::parts(requires)
            .into_iter()
            .map(|part| ChoiceChip::Needs {
                what: condition::describe(content, part),
                met: condition::holds(world, player, part),
            })
            .collect(),
        None => Vec::new(),
    };
    vec![
        CardOffer {
            label: LineText::plain(ACCEPT),
            tag: ChoiceTag::Quest,
            icon: Some(super::offered_mark(def).get(content).icon),
            chips,
            locked: !open,
            warn: None,
            pick: Arc::new(move |world, player| {
                super::accept(world, player, quest).map(|()| Answer::Output("accepted"))
            }),
        },
        CardOffer {
            label: LineText::plain(DECLINE),
            tag: ChoiceTag::Dialogue,
            icon: None,
            chips: Vec::new(),
            locked: false,
            warn: None,
            pick: Arc::new(|_, _| Ok(Answer::Output("declined"))),
        },
    ]
}

fn turn_in_card(world: &World, player: Entity, quest: QuestId) -> Vec<CardOffer> {
    let content = world.resource::<Content>();
    let def = quest.get(content);
    let inventory = world.get::<crate::systems::item::Inventory>(player);
    let have = |item| inventory.map_or(0, |inventory| inventory.count(item));
    let chips =
        |pick: Option<crate::systems::item::ItemStack>| {
            let mut chips = Vec::new();
            if def.reveals(Reveal::Costs) {
                chips.extend(def.hand_in().iter().map(|stack| ChoiceChip::Pays {
                    item: stack.item,
                    count: stack.count,
                    have: have(stack.item),
                }));
            }
            if def.reveals(Reveal::Gains) {
                chips.extend(def.rewards().iter().copied().chain(pick).map(|stack| {
                    ChoiceChip::Gets {
                        item: stack.item,
                        count: stack.count,
                    }
                }));
            }
            chips
        };
    let mut offers: Vec<CardOffer> = if def.pick_one().is_empty() {
        vec![CardOffer {
            label: condition::spoken(world, player, def.hand_over()),
            tag: ChoiceTag::Quest,
            icon: Some(super::ready_mark(def).get(content).icon),
            chips: chips(None),
            locked: false,
            warn: None,
            pick: Arc::new(move |world, player| {
                super::turn_in(world, player, quest, None).map(|()| Answer::Output("done"))
            }),
        }]
    } else {
        def.pick_one()
            .iter()
            .map(|&pick| CardOffer {
                label: LineText::plain(super::pick_label(content, pick)),
                tag: ChoiceTag::Quest,
                icon: Some(pick.item.get(content).icon),
                chips: chips(Some(pick)),
                locked: false,
                warn: None,
                pick: Arc::new(move |world, player| {
                    super::turn_in(world, player, quest, Some(pick))
                        .map(|()| Answer::Output("done"))
                }),
            })
            .collect()
    };
    offers.push(CardOffer {
        label: LineText::plain(NOT_YET),
        tag: ChoiceTag::Dialogue,
        icon: None,
        chips: Vec::new(),
        locked: false,
        warn: None,
        pick: Arc::new(|_, _| Ok(Answer::Output("cancelled"))),
    });
    offers
}
