pub mod compile;
pub mod dialogue;
pub mod expr;
pub mod may_do;
pub mod node;
pub mod run;
pub mod value;

use std::collections::BTreeMap;
use std::fmt;

use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use strum::{EnumString, IntoStaticStr, VariantArray};

pub use compile::{Compiler, EffectCall, EffectStep, Eval, OwnerRow, Procedure, Scripts, Step};
pub use dialogue::{
    Choice, ChoiceOffer, DialogueNode, DialogueView, SpokenValues, check_reveals_unique,
};
pub use expr::Expr;
pub use may_do::{MayDo, Reach};
pub use node::{Assignment, Node, Target};
pub use run::{
    Answer, BoxEnding, ChoiceState, FlowCx, FlowKey, FlowSteering, FlowTrace, Instances, Locals,
    Owner, Pause, TraceStep,
};
pub use value::{Value, ValueType};

use crate::core::content::{Content, ContentId, ContentRow};

/// The output an effect takes when nothing else is said.
pub const NEXT: &str = "next";
/// The output an effect takes when it would not do what it was asked.
pub const REFUSED: &str = "refused";

#[derive(JsonSchema, Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(transparent)]
#[schemars(extend("x-arrow" = true))]
pub struct Arrow(Option<String>);

impl Arrow {
    pub fn to(&self) -> Option<&str> {
        self.0.as_deref()
    }

    pub fn is_none(&self) -> bool {
        self.0.is_none()
    }
}

/// What kind of thing owns a script, which decides the events raised for it and the effects it
/// may use.
pub trait OwnerKindDef:
    Copy
    + Eq
    + std::hash::Hash
    + fmt::Debug
    + Serialize
    + DeserializeOwned
    + JsonSchema
    + VariantArray
    + Send
    + Sync
    + 'static
{
    /// The owner of a script any other may run.
    const ANY: Self;

    fn keeps_state(self) -> bool;
    fn name(self) -> &'static str;
}

pub trait Vocabulary:
    Copy + Eq + std::hash::Hash + fmt::Debug + Sized + Send + Sync + 'static
{
    type OwnerKind: OwnerKindDef;
    type Event: EventDef<Self>
        + Clone
        + Serialize
        + DeserializeOwned
        + JsonSchema
        + Send
        + Sync
        + 'static;
    type Query: QueryDef<Self>
        + Clone
        + Serialize
        + DeserializeOwned
        + JsonSchema
        + Send
        + Sync
        + 'static;
    type Effect: EffectDef<Self>
        + Clone
        + Serialize
        + DeserializeOwned
        + JsonSchema
        + Send
        + Sync
        + 'static;
    type Line: LineDef<Self>
        + Clone
        + Serialize
        + DeserializeOwned
        + JsonSchema
        + Send
        + Sync
        + 'static;
    type Text: TextDef<Self>
        + Clone
        + Serialize
        + DeserializeOwned
        + JsonSchema
        + Send
        + Sync
        + 'static;
    type Reveal: RevealDef + Serialize + DeserializeOwned + JsonSchema + Send + Sync + 'static;
    type Place: Clone + Serialize + DeserializeOwned + JsonSchema + Send + Sync + 'static;
    type Row: Clone + Send + Sync + 'static;
    type Audio: Clone + Serialize + DeserializeOwned + JsonSchema + Send + Sync + 'static;
    type Reach: Clone + Send + Sync + 'static;

    fn row_value(content: &Content, table: &str, key: &str) -> Option<Self::Row>;
    fn audio_value(content: &Content, key: &str) -> Option<Self::Audio>;
    fn show_dialogue(
        world: &mut World,
        flow: FlowKey<Self>,
        subject: Entity,
        view: DialogueView<Self>,
    );
    fn close_dialogue(world: &mut World, flow: FlowKey<Self>, subject: Entity, ending: BoxEnding);
    fn log_dropped_flow(world: &World, owner: &Owner<Self>, why: &str);
}

pub trait EventDef<V: Vocabulary>: Clone {
    type Kind: Copy + Eq + std::hash::Hash + fmt::Debug + Send + Sync + 'static;

    fn kind(&self) -> Self::Kind;
    fn owners(&self) -> &'static [V::OwnerKind];
    fn has_subject(&self) -> bool;
    fn is_run(&self) -> bool;
    fn fields(&self) -> &'static [(&'static str, ValueType)];
    /// The rules the event's own values keep, beyond what the schema says.
    fn check(&self) -> Result<(), ScriptFault> {
        Ok(())
    }
}

pub trait RevealDef: Copy + Eq + std::hash::Hash + fmt::Debug + Send + Sync + 'static {
    /// Whether a choice revealing this still shows, locked, while its requirements are unmet.
    fn shows_while_locked(self) -> bool;
    fn name(self) -> &'static str;
}

pub trait LineDef<V: Vocabulary> {
    fn values(&self) -> Vec<&Expr<V>>;
}

pub trait TextDef<V: Vocabulary> {
    fn values(&self) -> Vec<&Expr<V>>;
}

pub trait QueryDef<V: Vocabulary> {
    fn value_type(&self, cx: &Compiler<V>) -> ValueType;
    fn reads_subject(&self) -> bool;
    fn compile<'c>(&'c self, cx: &mut Compiler<'c, V>) -> Result<Eval, ScriptFault>;
}

pub trait EffectDef<V: Vocabulary> {
    fn owners(&self) -> &'static [V::OwnerKind] {
        V::OwnerKind::VARIANTS
    }
    fn needs_subject(&self) -> bool;
    fn outputs(&self) -> Vec<(&'static str, &Arrow)>;
    fn pauses(&self) -> bool {
        false
    }
    fn keeps_box(&self) -> bool {
        false
    }
    fn compile<'c>(&'c self, cx: &mut Compiler<'c, V>) -> Result<EffectCall<V>, ScriptFault>;
    fn reach(&self, cx: &Compiler<V>) -> Vec<Reach<V>>;
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "", deny_unknown_fields)]
#[schemars(bound = "")]
pub struct ScriptDef<V: Vocabulary> {
    pub owner: V::OwnerKind,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub variables: BTreeMap<String, Variable<V>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub state: BTreeMap<String, ValueType>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub locals: BTreeMap<String, ValueType>,
    pub nodes: BTreeMap<String, Node<V>>,
}

impl<V: Vocabulary> ContentRow for ScriptDef<V> {
    const TABLE: &'static str = "script";
}

pub type ScriptId<V> = ContentId<ScriptDef<V>>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "", deny_unknown_fields)]
#[schemars(bound = "")]
pub struct InlineScript<V: Vocabulary> {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub state: BTreeMap<String, ValueType>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub locals: BTreeMap<String, ValueType>,
    pub nodes: BTreeMap<String, Node<V>>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", bound = "")]
#[schemars(bound = "")]
pub enum ScriptModule<V: Vocabulary> {
    #[serde(rename = "shared_script")]
    Shared {
        script: ScriptId<V>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        values: BTreeMap<String, VarValue<V>>,
    },
    #[serde(rename = "inline_script")]
    Inline(InlineScript<V>),
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Hash,
    EnumString,
    IntoStaticStr,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
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

impl VariableType {
    pub fn name(self) -> &'static str {
        self.into()
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(bound = "", deny_unknown_fields)]
#[schemars(bound = "")]
pub struct Variable<V: Vocabulary> {
    #[serde(rename = "type")]
    pub ty: VariableType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub table: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<VarValue<V>>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(untagged, bound = "")]
#[schemars(bound = "")]
pub enum VarValue<V: Vocabulary> {
    Integer(i64),
    Number(f64),
    Boolean(bool),
    Str(String),
    Place(V::Place),
    Condition(Expr<V>),
}

impl<V: Vocabulary> VarValue<V> {
    pub fn kind(&self) -> &'static str {
        match self {
            VarValue::Integer(_) => "an integer",
            VarValue::Number(_) => "a number",
            VarValue::Boolean(_) => "a boolean",
            VarValue::Str(_) => "a string",
            VarValue::Place(_) => "a place",
            VarValue::Condition(_) => "a condition",
        }
    }
}

#[derive(JsonSchema, Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Fill<T> {
    Var { var: String },
    Const(T),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScriptFault {
    pub rule: &'static str,
    pub expected: String,
}

impl ScriptFault {
    pub fn new(rule: &'static str, expected: impl fmt::Display) -> ScriptFault {
        ScriptFault {
            rule,
            expected: expected.to_string(),
        }
    }
}

impl fmt::Display for ScriptFault {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}: {}", self.rule, self.expected)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScriptError {
    pub rule: &'static str,
    pub owner: String,
    pub node: Option<String>,
    pub expected: String,
    pub script: Option<String>,
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
