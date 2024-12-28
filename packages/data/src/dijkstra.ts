// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import dijkstrajs from "dijkstrajs";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const find_path = dijkstrajs.find_path;

// For some reason typescript refuses to compile this file in vite even if I define
// the proper types as a declaration file, so we have to use ts-nocheck.
