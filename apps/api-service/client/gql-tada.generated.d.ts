/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
    'ActorId': unknown;
    'ActorModelId': unknown;
    'AreaFileInfo': { kind: 'OBJECT'; name: 'AreaFileInfo'; fields: { 'areaId': { name: 'areaId'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'AreaId'; ofType: null; }; } }; 'url': { name: 'url'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'UrlString'; ofType: null; }; } }; }; };
    'AreaId': unknown;
    'Boolean': unknown;
    'Character': { kind: 'OBJECT'; name: 'Character'; fields: { 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'CharacterId'; ofType: null; }; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
    'CharacterId': unknown;
    'FileUrlType': { name: 'FileUrlType'; enumValues: 'internal' | 'public'; };
    'GqlDate': unknown;
    'ItemDefinition': unknown;
    'ItemReference': unknown;
    'LocalFile': unknown;
    'Mutation': { kind: 'OBJECT'; name: 'Mutation'; fields: { 'setPatchOptimizerEnabled': { name: 'setPatchOptimizerEnabled'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; }; };
    'Pixel': unknown;
    'Query': { kind: 'OBJECT'; name: 'Query'; fields: { 'actorModelIds': { name: 'actorModelIds'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ActorModelId'; ofType: null; }; }; }; } }; 'actorSpritesheetUrl': { name: 'actorSpritesheetUrl'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'UrlString'; ofType: null; }; } }; 'areaFileUrl': { name: 'areaFileUrl'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'areaFileUrls': { name: 'areaFileUrls'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'AreaFileInfo'; ofType: null; }; }; }; } }; 'characterList': { name: 'characterList'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Character'; ofType: null; }; }; }; } }; 'defaultSpawnPoint': { name: 'defaultSpawnPoint'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'SpawnPoint'; ofType: null; }; } }; 'isPatchOptimizerEnabled': { name: 'isPatchOptimizerEnabled'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; 'itemDefinition': { name: 'itemDefinition'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ItemDefinition'; ofType: null; }; } }; 'myCharacterId': { name: 'myCharacterId'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'CharacterId'; ofType: null; }; } }; 'serverVersion': { name: 'serverVersion'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'testError': { name: 'testError'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; }; };
    'SpawnPoint': { kind: 'OBJECT'; name: 'SpawnPoint'; fields: { 'areaId': { name: 'areaId'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'AreaId'; ofType: null; }; } }; 'coords': { name: 'coords'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'TileVectorLike'; ofType: null; }; } }; }; };
    'String': unknown;
    'Tile': unknown;
    'TileVectorLike': { kind: 'OBJECT'; name: 'TileVectorLike'; fields: { 'x': { name: 'x'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Tile'; ofType: null; }; } }; 'y': { name: 'y'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Tile'; ofType: null; }; } }; }; };
    'TimesPerSecond': unknown;
    'UrlString': unknown;
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: 'Mutation';
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection
  }
}