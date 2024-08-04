// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTransformer = Transformer<any, any>;

export interface ConcreteTransformer<Actual, Serialized> {
  parse: (serialized: Serialized) => Actual;
  serialize: (actual: Actual) => Serialized;
}

export interface AbstractTransformer<Serialized> {
  parse: <Actual>(serialized: Serialized) => Actual;
  serialize: <Actual>(actual: Actual) => Serialized;
}
