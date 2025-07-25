/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './../../routes/~__root'
import { Route as AuthCallbackRouteImport } from './../../routes/~auth-callback'
import { Route as LayoutRouteRouteImport } from './../../routes/~_layout/~route'
import { Route as LayoutPlayRouteImport } from './../../routes/~_layout/~play'
import { Route as LayoutContactRouteImport } from './../../routes/~_layout/~contact'
import { Route as LayoutIndexRouteImport } from './../../routes/~_layout/~index'
import { Route as LayoutAdminSpectatorRouteImport } from './../../routes/~_layout/~admin/~spectator'
import { Route as LayoutAdminDevtoolsRouteRouteImport } from './../../routes/~_layout/~admin/~devtools/~route'
import { Route as LayoutAdminDevtoolsTileRendererTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~tile-renderer-tester'
import { Route as LayoutAdminDevtoolsStorageTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~storage-tester'
import { Route as LayoutAdminDevtoolsSpringTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~spring-tester'
import { Route as LayoutAdminDevtoolsObservableTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~observable-tester'
import { Route as LayoutAdminDevtoolsErrorTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~error-tester'
import { Route as LayoutAdminDevtoolsActorTesterRouteImport } from './../../routes/~_layout/~admin/~devtools/~actor-tester'
import { Route as LayoutAdminDevtoolsIndexRouteImport } from './../../routes/~_layout/~admin/~devtools/~index'

const AuthCallbackRoute = AuthCallbackRouteImport.update({
  id: '/auth-callback',
  path: '/auth-callback',
  getParentRoute: () => rootRouteImport,
} as any)
const LayoutRouteRoute = LayoutRouteRouteImport.update({
  id: '/_layout',
  getParentRoute: () => rootRouteImport,
} as any)
const LayoutPlayRoute = LayoutPlayRouteImport.update({
  id: '/play',
  path: '/play',
  getParentRoute: () => LayoutRouteRoute,
} as any)
const LayoutContactRoute = LayoutContactRouteImport.update({
  id: '/contact',
  path: '/contact',
  getParentRoute: () => LayoutRouteRoute,
} as any)
const LayoutIndexRoute = LayoutIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => LayoutRouteRoute,
} as any)
const LayoutAdminSpectatorRoute = LayoutAdminSpectatorRouteImport.update({
  id: '/admin/spectator',
  path: '/admin/spectator',
  getParentRoute: () => LayoutRouteRoute,
} as any)
const LayoutAdminDevtoolsRouteRoute =
  LayoutAdminDevtoolsRouteRouteImport.update({
    id: '/admin/devtools',
    path: '/admin/devtools',
    getParentRoute: () => LayoutRouteRoute,
  } as any)
const LayoutAdminDevtoolsTileRendererTesterRoute =
  LayoutAdminDevtoolsTileRendererTesterRouteImport.update({
    id: '/tile-renderer-tester',
    path: '/tile-renderer-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsStorageTesterRoute =
  LayoutAdminDevtoolsStorageTesterRouteImport.update({
    id: '/storage-tester',
    path: '/storage-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsSpringTesterRoute =
  LayoutAdminDevtoolsSpringTesterRouteImport.update({
    id: '/spring-tester',
    path: '/spring-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsObservableTesterRoute =
  LayoutAdminDevtoolsObservableTesterRouteImport.update({
    id: '/observable-tester',
    path: '/observable-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsErrorTesterRoute =
  LayoutAdminDevtoolsErrorTesterRouteImport.update({
    id: '/error-tester',
    path: '/error-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsActorTesterRoute =
  LayoutAdminDevtoolsActorTesterRouteImport.update({
    id: '/actor-tester',
    path: '/actor-tester',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)
const LayoutAdminDevtoolsIndexRoute =
  LayoutAdminDevtoolsIndexRouteImport.update({
    id: '/',
    path: '/',
    getParentRoute: () => LayoutAdminDevtoolsRouteRoute,
  } as any)

export interface FileRoutesByFullPath {
  '/auth-callback': typeof AuthCallbackRoute
  '/': typeof LayoutIndexRoute
  '/contact': typeof LayoutContactRoute
  '/play': typeof LayoutPlayRoute
  '/admin/devtools': typeof LayoutAdminDevtoolsRouteRouteWithChildren
  '/admin/spectator': typeof LayoutAdminSpectatorRoute
  '/admin/devtools/': typeof LayoutAdminDevtoolsIndexRoute
  '/admin/devtools/actor-tester': typeof LayoutAdminDevtoolsActorTesterRoute
  '/admin/devtools/error-tester': typeof LayoutAdminDevtoolsErrorTesterRoute
  '/admin/devtools/observable-tester': typeof LayoutAdminDevtoolsObservableTesterRoute
  '/admin/devtools/spring-tester': typeof LayoutAdminDevtoolsSpringTesterRoute
  '/admin/devtools/storage-tester': typeof LayoutAdminDevtoolsStorageTesterRoute
  '/admin/devtools/tile-renderer-tester': typeof LayoutAdminDevtoolsTileRendererTesterRoute
}
export interface FileRoutesByTo {
  '/auth-callback': typeof AuthCallbackRoute
  '/': typeof LayoutIndexRoute
  '/contact': typeof LayoutContactRoute
  '/play': typeof LayoutPlayRoute
  '/admin/spectator': typeof LayoutAdminSpectatorRoute
  '/admin/devtools': typeof LayoutAdminDevtoolsIndexRoute
  '/admin/devtools/actor-tester': typeof LayoutAdminDevtoolsActorTesterRoute
  '/admin/devtools/error-tester': typeof LayoutAdminDevtoolsErrorTesterRoute
  '/admin/devtools/observable-tester': typeof LayoutAdminDevtoolsObservableTesterRoute
  '/admin/devtools/spring-tester': typeof LayoutAdminDevtoolsSpringTesterRoute
  '/admin/devtools/storage-tester': typeof LayoutAdminDevtoolsStorageTesterRoute
  '/admin/devtools/tile-renderer-tester': typeof LayoutAdminDevtoolsTileRendererTesterRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/_layout': typeof LayoutRouteRouteWithChildren
  '/auth-callback': typeof AuthCallbackRoute
  '/_layout/': typeof LayoutIndexRoute
  '/_layout/contact': typeof LayoutContactRoute
  '/_layout/play': typeof LayoutPlayRoute
  '/_layout/admin/devtools': typeof LayoutAdminDevtoolsRouteRouteWithChildren
  '/_layout/admin/spectator': typeof LayoutAdminSpectatorRoute
  '/_layout/admin/devtools/': typeof LayoutAdminDevtoolsIndexRoute
  '/_layout/admin/devtools/actor-tester': typeof LayoutAdminDevtoolsActorTesterRoute
  '/_layout/admin/devtools/error-tester': typeof LayoutAdminDevtoolsErrorTesterRoute
  '/_layout/admin/devtools/observable-tester': typeof LayoutAdminDevtoolsObservableTesterRoute
  '/_layout/admin/devtools/spring-tester': typeof LayoutAdminDevtoolsSpringTesterRoute
  '/_layout/admin/devtools/storage-tester': typeof LayoutAdminDevtoolsStorageTesterRoute
  '/_layout/admin/devtools/tile-renderer-tester': typeof LayoutAdminDevtoolsTileRendererTesterRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/auth-callback'
    | '/'
    | '/contact'
    | '/play'
    | '/admin/devtools'
    | '/admin/spectator'
    | '/admin/devtools/'
    | '/admin/devtools/actor-tester'
    | '/admin/devtools/error-tester'
    | '/admin/devtools/observable-tester'
    | '/admin/devtools/spring-tester'
    | '/admin/devtools/storage-tester'
    | '/admin/devtools/tile-renderer-tester'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/auth-callback'
    | '/'
    | '/contact'
    | '/play'
    | '/admin/spectator'
    | '/admin/devtools'
    | '/admin/devtools/actor-tester'
    | '/admin/devtools/error-tester'
    | '/admin/devtools/observable-tester'
    | '/admin/devtools/spring-tester'
    | '/admin/devtools/storage-tester'
    | '/admin/devtools/tile-renderer-tester'
  id:
    | '__root__'
    | '/_layout'
    | '/auth-callback'
    | '/_layout/'
    | '/_layout/contact'
    | '/_layout/play'
    | '/_layout/admin/devtools'
    | '/_layout/admin/spectator'
    | '/_layout/admin/devtools/'
    | '/_layout/admin/devtools/actor-tester'
    | '/_layout/admin/devtools/error-tester'
    | '/_layout/admin/devtools/observable-tester'
    | '/_layout/admin/devtools/spring-tester'
    | '/_layout/admin/devtools/storage-tester'
    | '/_layout/admin/devtools/tile-renderer-tester'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  LayoutRouteRoute: typeof LayoutRouteRouteWithChildren
  AuthCallbackRoute: typeof AuthCallbackRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/auth-callback': {
      id: '/auth-callback'
      path: '/auth-callback'
      fullPath: '/auth-callback'
      preLoaderRoute: typeof AuthCallbackRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/_layout': {
      id: '/_layout'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof LayoutRouteRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/_layout/play': {
      id: '/_layout/play'
      path: '/play'
      fullPath: '/play'
      preLoaderRoute: typeof LayoutPlayRouteImport
      parentRoute: typeof LayoutRouteRoute
    }
    '/_layout/contact': {
      id: '/_layout/contact'
      path: '/contact'
      fullPath: '/contact'
      preLoaderRoute: typeof LayoutContactRouteImport
      parentRoute: typeof LayoutRouteRoute
    }
    '/_layout/': {
      id: '/_layout/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof LayoutIndexRouteImport
      parentRoute: typeof LayoutRouteRoute
    }
    '/_layout/admin/spectator': {
      id: '/_layout/admin/spectator'
      path: '/admin/spectator'
      fullPath: '/admin/spectator'
      preLoaderRoute: typeof LayoutAdminSpectatorRouteImport
      parentRoute: typeof LayoutRouteRoute
    }
    '/_layout/admin/devtools': {
      id: '/_layout/admin/devtools'
      path: '/admin/devtools'
      fullPath: '/admin/devtools'
      preLoaderRoute: typeof LayoutAdminDevtoolsRouteRouteImport
      parentRoute: typeof LayoutRouteRoute
    }
    '/_layout/admin/devtools/tile-renderer-tester': {
      id: '/_layout/admin/devtools/tile-renderer-tester'
      path: '/tile-renderer-tester'
      fullPath: '/admin/devtools/tile-renderer-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsTileRendererTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/storage-tester': {
      id: '/_layout/admin/devtools/storage-tester'
      path: '/storage-tester'
      fullPath: '/admin/devtools/storage-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsStorageTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/spring-tester': {
      id: '/_layout/admin/devtools/spring-tester'
      path: '/spring-tester'
      fullPath: '/admin/devtools/spring-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsSpringTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/observable-tester': {
      id: '/_layout/admin/devtools/observable-tester'
      path: '/observable-tester'
      fullPath: '/admin/devtools/observable-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsObservableTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/error-tester': {
      id: '/_layout/admin/devtools/error-tester'
      path: '/error-tester'
      fullPath: '/admin/devtools/error-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsErrorTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/actor-tester': {
      id: '/_layout/admin/devtools/actor-tester'
      path: '/actor-tester'
      fullPath: '/admin/devtools/actor-tester'
      preLoaderRoute: typeof LayoutAdminDevtoolsActorTesterRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
    '/_layout/admin/devtools/': {
      id: '/_layout/admin/devtools/'
      path: '/'
      fullPath: '/admin/devtools/'
      preLoaderRoute: typeof LayoutAdminDevtoolsIndexRouteImport
      parentRoute: typeof LayoutAdminDevtoolsRouteRoute
    }
  }
}

interface LayoutAdminDevtoolsRouteRouteChildren {
  LayoutAdminDevtoolsIndexRoute: typeof LayoutAdminDevtoolsIndexRoute
  LayoutAdminDevtoolsActorTesterRoute: typeof LayoutAdminDevtoolsActorTesterRoute
  LayoutAdminDevtoolsErrorTesterRoute: typeof LayoutAdminDevtoolsErrorTesterRoute
  LayoutAdminDevtoolsObservableTesterRoute: typeof LayoutAdminDevtoolsObservableTesterRoute
  LayoutAdminDevtoolsSpringTesterRoute: typeof LayoutAdminDevtoolsSpringTesterRoute
  LayoutAdminDevtoolsStorageTesterRoute: typeof LayoutAdminDevtoolsStorageTesterRoute
  LayoutAdminDevtoolsTileRendererTesterRoute: typeof LayoutAdminDevtoolsTileRendererTesterRoute
}

const LayoutAdminDevtoolsRouteRouteChildren: LayoutAdminDevtoolsRouteRouteChildren =
  {
    LayoutAdminDevtoolsIndexRoute: LayoutAdminDevtoolsIndexRoute,
    LayoutAdminDevtoolsActorTesterRoute: LayoutAdminDevtoolsActorTesterRoute,
    LayoutAdminDevtoolsErrorTesterRoute: LayoutAdminDevtoolsErrorTesterRoute,
    LayoutAdminDevtoolsObservableTesterRoute:
      LayoutAdminDevtoolsObservableTesterRoute,
    LayoutAdminDevtoolsSpringTesterRoute: LayoutAdminDevtoolsSpringTesterRoute,
    LayoutAdminDevtoolsStorageTesterRoute:
      LayoutAdminDevtoolsStorageTesterRoute,
    LayoutAdminDevtoolsTileRendererTesterRoute:
      LayoutAdminDevtoolsTileRendererTesterRoute,
  }

const LayoutAdminDevtoolsRouteRouteWithChildren =
  LayoutAdminDevtoolsRouteRoute._addFileChildren(
    LayoutAdminDevtoolsRouteRouteChildren,
  )

interface LayoutRouteRouteChildren {
  LayoutIndexRoute: typeof LayoutIndexRoute
  LayoutContactRoute: typeof LayoutContactRoute
  LayoutPlayRoute: typeof LayoutPlayRoute
  LayoutAdminDevtoolsRouteRoute: typeof LayoutAdminDevtoolsRouteRouteWithChildren
  LayoutAdminSpectatorRoute: typeof LayoutAdminSpectatorRoute
}

const LayoutRouteRouteChildren: LayoutRouteRouteChildren = {
  LayoutIndexRoute: LayoutIndexRoute,
  LayoutContactRoute: LayoutContactRoute,
  LayoutPlayRoute: LayoutPlayRoute,
  LayoutAdminDevtoolsRouteRoute: LayoutAdminDevtoolsRouteRouteWithChildren,
  LayoutAdminSpectatorRoute: LayoutAdminSpectatorRoute,
}

const LayoutRouteRouteWithChildren = LayoutRouteRoute._addFileChildren(
  LayoutRouteRouteChildren,
)

const rootRouteChildren: RootRouteChildren = {
  LayoutRouteRoute: LayoutRouteRouteWithChildren,
  AuthCallbackRoute: AuthCallbackRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
