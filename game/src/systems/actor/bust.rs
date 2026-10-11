use serde::{Deserialize, Serialize};
use strum::VariantArray;

use crate::core::assets::AssetRef;
use crate::core::content::{Content, ContentRow, ModuleRule, ModuleSet};

pub use crate::data::expression::Id as IndividualExpression;

#[derive(Clone)]
pub struct ModelDef {
    pub sheet: AssetRef,
    pub modules: &'static [ModelModule],
}

impl ContentRow for ModelDef {
    const TABLE: &'static str = "model";
}

impl ModuleSet for ModelDef {
    type Module = ModelModule;

    fn modules(&self) -> &[ModelModule] {
        self.modules
    }

    fn rule(_: &ModelModule) -> ModuleRule {
        ModuleRule::AtMostOne
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ModelModule {
    Bust(Busts),
}

impl ModelDef {
    pub fn busts(&self) -> Option<&Busts> {
        self.modules
            .iter()
            .map(|ModelModule::Bust(busts)| busts)
            .next()
    }
}

#[derive(Clone, Serialize)]
pub struct Busts {
    #[serde(flatten)]
    pub generic: GenericBusts,
    #[serde(
        rename = "own",
        serialize_with = "own_busts",
        skip_serializing_if = "crate::core::content::serial::is_empty"
    )]
    pub individual: &'static [IndividualExpression],
}

fn own_busts<S: serde::Serializer>(
    own: &[IndividualExpression],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeSeq;
    let mut seq = serializer.serialize_seq(Some(own.len()))?;
    for expression in own {
        seq.serialize_element(&OwnBust(*expression))?;
    }
    seq.end()
}

struct OwnBust(IndividualExpression);

impl Serialize for OwnBust {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let file =
            crate::core::content::serial::with_scope_content(|content| self.0.get(content).bust);
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("name", &self.0)?;
        map.serialize_entry("file", &file)?;
        map.end()
    }
}

#[derive(Clone, Serialize)]
pub struct GenericBusts {
    pub neutral: AssetRef,
    pub happy: AssetRef,
    pub sad: AssetRef,
    pub angry: AssetRef,
    pub surprised: AssetRef,
    pub thinking: AssetRef,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Face {
    Generic(GenericExpression),
    Individual(IndividualExpression),
}

impl Serialize for Face {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Face::Generic(expression) => expression.serialize(serializer),
            Face::Individual(expression) => expression.serialize(serializer),
        }
    }
}

#[derive(
    Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq, Hash, VariantArray,
)]
#[serde(rename_all = "snake_case")]
pub enum GenericExpression {
    #[default]
    Neutral,
    Happy,
    Sad,
    Angry,
    Surprised,
    Thinking,
}

#[derive(Clone)]
pub struct IndividualExpressionDef {
    pub bust: AssetRef,
}

impl crate::core::content::ContentRow for IndividualExpressionDef {
    const TABLE: &'static str = "expression";
}

impl Busts {
    pub fn all<'a>(&'a self, content: &'a Content) -> impl Iterator<Item = AssetRef> + 'a {
        GenericExpression::VARIANTS
            .iter()
            .map(|&expression| self.generic.of(expression))
            .chain(
                self.individual
                    .iter()
                    .map(|expression| expression.get(content).bust),
            )
    }

    pub fn face(&self, content: &Content, face: Face) -> Option<AssetRef> {
        match face {
            Face::Generic(expression) => Some(self.generic.of(expression)),
            Face::Individual(expression) => self
                .individual
                .contains(&expression)
                .then(|| expression.get(content).bust),
        }
    }
}

impl GenericBusts {
    pub fn of(&self, expression: GenericExpression) -> AssetRef {
        match expression {
            GenericExpression::Neutral => self.neutral,
            GenericExpression::Happy => self.happy,
            GenericExpression::Sad => self.sad,
            GenericExpression::Angry => self.angry,
            GenericExpression::Surprised => self.surprised,
            GenericExpression::Thinking => self.thinking,
        }
    }
}
