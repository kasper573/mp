import { createFileRoute } from "@tanstack/react-router";
import { GraphQLTester } from "./GraphQLTester";

export const Route = createFileRoute("/_layout/admin/devtools/graphql")({
  component: GraphQLTester,
});
