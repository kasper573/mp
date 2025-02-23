// This file exists as a workaround instead of using "tsx --improt otel.ts main.ts"
// because of https://github.com/privatenumber/tsx/issues/354
// It needs to be imported before anything else in the codebase.
import "./otel";
import "./main";
