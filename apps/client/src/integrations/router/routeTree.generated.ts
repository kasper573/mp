/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './../../routes/~__root'
import { Route as SpringImport } from './../../routes/~spring'
import { Route as PlayImport } from './../../routes/~play'
import { Route as AuthCallbackImport } from './../../routes/~authCallback'
import { Route as IndexImport } from './../../routes/~index'

// Create/Update Routes

const SpringRoute = SpringImport.update({
  id: '/spring',
  path: '/spring',
  getParentRoute: () => rootRoute,
} as any)

const PlayRoute = PlayImport.update({
  id: '/play',
  path: '/play',
  getParentRoute: () => rootRoute,
} as any)

const AuthCallbackRoute = AuthCallbackImport.update({
  id: '/authCallback',
  path: '/authCallback',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/solid-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/authCallback': {
      id: '/authCallback'
      path: '/authCallback'
      fullPath: '/authCallback'
      preLoaderRoute: typeof AuthCallbackImport
      parentRoute: typeof rootRoute
    }
    '/play': {
      id: '/play'
      path: '/play'
      fullPath: '/play'
      preLoaderRoute: typeof PlayImport
      parentRoute: typeof rootRoute
    }
    '/spring': {
      id: '/spring'
      path: '/spring'
      fullPath: '/spring'
      preLoaderRoute: typeof SpringImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/authCallback': typeof AuthCallbackRoute
  '/play': typeof PlayRoute
  '/spring': typeof SpringRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/authCallback': typeof AuthCallbackRoute
  '/play': typeof PlayRoute
  '/spring': typeof SpringRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/authCallback': typeof AuthCallbackRoute
  '/play': typeof PlayRoute
  '/spring': typeof SpringRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/authCallback' | '/play' | '/spring'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/authCallback' | '/play' | '/spring'
  id: '__root__' | '/' | '/authCallback' | '/play' | '/spring'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AuthCallbackRoute: typeof AuthCallbackRoute
  PlayRoute: typeof PlayRoute
  SpringRoute: typeof SpringRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AuthCallbackRoute: AuthCallbackRoute,
  PlayRoute: PlayRoute,
  SpringRoute: SpringRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "~__root.tsx",
      "children": [
        "/",
        "/authCallback",
        "/play",
        "/spring"
      ]
    },
    "/": {
      "filePath": "~index.tsx"
    },
    "/authCallback": {
      "filePath": "~authCallback.tsx"
    },
    "/play": {
      "filePath": "~play.tsx"
    },
    "/spring": {
      "filePath": "~spring.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
