import { customType } from "drizzle-orm/pg-core";

export const branded = <BrandedString extends string>(name: string) =>
  customType<{ data: BrandedString }>({
    dataType() {
      return "text";
    },
  })(name);
