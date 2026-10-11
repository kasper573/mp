pub mod compile;
pub mod dialogue;
pub mod expr;
pub mod may_do;
pub mod node;
pub mod run;
pub mod value;

use std::fmt;

use bevy_ecs::prelude::*;
use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize, Serializer};

pub use compile::{Compiler, EffectCall, EffectStep, Eval, OwnerRow, Procedure, Scripts, Step};
pub use dialogue::{Choice, ChoiceOffer, DialogueNode, DialogueView, Reveal, SpokenValues};
pub use expr::Expr;
pub use may_do::{MayDo, Reach};
pub use node::{Assignment, Node, Target};
pub use run::{Answer, BoxEnding, FlowCx, FlowKey, Instances, Locals, Owner, Pause};
pub use value::{Value, ValueType};

use crate::core::content::{ContentId, ContentRow, serial};

pub type Name = &'static str;
pub type Arrow = Option<Name>;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OwnerKind {
    Object,
    Npc,
    Item,
    Area,
    Quest,
    Shop,
    Blueprint,
    Any,
}

impl OwnerKind {
    pub const PLACED: [OwnerKind; 4] = [
        OwnerKind::Object,
        OwnerKind::Npc,
        OwnerKind::Area,
        OwnerKind::Blueprint,
    ];

    pub fn keeps_state(self) -> bool {
        !matches!(self, OwnerKind::Item | OwnerKind::Quest | OwnerKind::Shop)
    }

    pub fn name(self) -> &'static str {
        match self {
            OwnerKind::Object => "object",
            OwnerKind::Npc => "npc",
            OwnerKind::Item => "item",
            OwnerKind::Area => "area",
            OwnerKind::Quest => "quest",
            OwnerKind::Shop => "shop",
            OwnerKind::Blueprint => "blueprint",
            OwnerKind::Any => "any",
        }
    }
}

pub trait Vocabulary: Sized + Send + Sync + 'static {
    type Event: EventDef + Clone + Send + Sync + 'static;
    type Query: QueryDef<Self> + Clone + Send + Sync + 'static;
    type Effect: EffectDef<Self> + Clone + Send + Sync + 'static;
    type Line: LineDef<Self> + Clone + Send + Sync + 'static;
    type Text: Clone + Send + Sync + 'static;
    type Place: Clone + Send + Sync + 'static;
    type Row: Clone + Send + Sync + 'static;
    type Audio: Clone + Send + Sync + 'static;
    type Reach: Clone + Send + Sync + 'static;

    fn show_dialogue(world: &mut World, flow: FlowKey, subject: Entity, view: DialogueView<Self>);
    fn close_dialogue(world: &mut World, flow: FlowKey, subject: Entity, ending: BoxEnding);
    fn log_dropped_flow(world: &World, owner: &Owner, why: &str);
}

pub trait EventDef: Clone {
    type Kind: Copy + Eq + std::hash::Hash + fmt::Debug + Send + Sync + 'static;

    fn kind(&self) -> Self::Kind;
    fn owners(&self) -> &'static [OwnerKind];
    fn has_subject(&self) -> bool;
    fn is_run(&self) -> bool;
    fn fields(&self) -> &'static [(Name, ValueType)];
}

pub trait LineDef<V: Vocabulary> {
    fn values(&self) -> Vec<&'static Expr<V>>;
}

pub trait QueryDef<V: Vocabulary> {
    fn value_type(&self, cx: &Compiler<V>) -> Result<ValueType, String>;
    fn reads_subject(&self) -> bool;
    fn compile(&self, cx: &mut Compiler<V>) -> Result<Eval, String>;
}

pub trait EffectDef<V: Vocabulary> {
    fn owners(&self) -> &'static [OwnerKind];
    fn needs_subject(&self) -> bool;
    fn outputs(&self) -> Vec<(Name, Arrow)>;
    fn pauses(&self) -> bool;
    fn keeps_box(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<V>) -> Result<EffectCall, String>;
    fn reach(&self, cx: &Compiler<V>) -> Vec<Reach<V>>;
}

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct ScriptDef<V: Vocabulary> {
    pub owner: OwnerKind,
    #[serde(
        serialize_with = "serial::pairs_map",
        skip_serializing_if = "serial::is_empty"
    )]
    pub variables: &'static [(Name, Variable<V>)],
    #[serde(
        serialize_with = "serial::pairs_map",
        skip_serializing_if = "serial::is_empty"
    )]
    pub state: &'static [(Name, ValueType)],
    #[serde(
        serialize_with = "serial::pairs_map",
        skip_serializing_if = "serial::is_empty"
    )]
    pub locals: &'static [(Name, ValueType)],
    #[serde(serialize_with = "serial::pairs_map")]
    pub nodes: &'static [(Name, Node<V>)],
}

impl<V: Vocabulary> ContentRow for ScriptDef<V> {
    const TABLE: &'static str = "script";
}

pub type ScriptId<V> = ContentId<ScriptDef<V>>;

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct InlineScript<V: Vocabulary> {
    #[serde(
        serialize_with = "serial::pairs_map",
        skip_serializing_if = "serial::is_empty"
    )]
    pub state: &'static [(Name, ValueType)],
    #[serde(
        serialize_with = "serial::pairs_map",
        skip_serializing_if = "serial::is_empty"
    )]
    pub locals: &'static [(Name, ValueType)],
    #[serde(serialize_with = "serial::pairs_map")]
    pub nodes: &'static [(Name, Node<V>)],
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub enum ScriptModule<V: Vocabulary> {
    #[serde(rename = "shared_script")]
    Shared {
        script: ScriptId<V>,
        #[serde(
            serialize_with = "serial::pairs_map",
            skip_serializing_if = "serial::is_empty"
        )]
        values: &'static [(Name, VarValue<V>)],
    },
    #[serde(rename = "inline_script")]
    Inline(InlineScript<V>),
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VariableType {
    Integer,
    Number,
    Boolean,
    Text,
    Name,
    Place,
    Row,
    Audio,
    Condition,
}

#[derive(Clone, Serialize)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub struct Variable<V: Vocabulary> {
    #[serde(rename = "type")]
    pub ty: VariableType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<VarValue<V>>,
}

#[derive(Clone, Serialize)]
#[serde(untagged)]
#[serde(bound(
    serialize = "V::Event: Serialize, V::Query: Serialize, V::Effect: Serialize, V::Line: Serialize, V::Text: Serialize, V::Place: Serialize, V::Row: Serialize, V::Audio: Serialize"
))]
pub enum VarValue<V: Vocabulary> {
    Integer(i64),
    Number(f64),
    Boolean(bool),
    Text(Name),
    Name(Name),
    Place(V::Place),
    Row(V::Row),
    Audio(V::Audio),
    Condition(&'static Expr<V>),
}

impl<V: Vocabulary> VarValue<V> {
    pub fn variable_type(&self) -> VariableType {
        match self {
            VarValue::Integer(_) => VariableType::Integer,
            VarValue::Number(_) => VariableType::Number,
            VarValue::Boolean(_) => VariableType::Boolean,
            VarValue::Text(_) => VariableType::Text,
            VarValue::Name(_) => VariableType::Name,
            VarValue::Place(_) => VariableType::Place,
            VarValue::Row(_) => VariableType::Row,
            VarValue::Audio(_) => VariableType::Audio,
            VarValue::Condition(_) => VariableType::Condition,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Fill<T: 'static> {
    Const(T),
    Var(Name),
}

impl<T: Serialize> Serialize for Fill<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Fill::Const(value) => value.serialize(serializer),
            Fill::Var(name) => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("var", name)?;
                map.end()
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScriptError {
    pub rule: &'static str,
    pub owner: String,
    pub node: Option<String>,
    pub expected: String,
}

impl fmt::Display for ScriptError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}: {}", self.owner, self.rule)?;
        if let Some(node) = &self.node {
            write!(f, " at {node}")?;
        }
        write!(f, ": {}", self.expected)
    }
}
