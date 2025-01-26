import { point } from "drizzle-orm/pg-core";

export const vector = (name: string) => point(name, { mode: "xy" });
