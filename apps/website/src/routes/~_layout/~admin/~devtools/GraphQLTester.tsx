import { useQuery } from "@mp/query";
import { useQueryBuilder, graphql } from "@mp/api-service/client";

export function GraphQLTester() {
  const qb = useQueryBuilder();
  const { data, isLoading, error } = useQuery(qb.queryOptions(query));

  return (
    <>
      <h1>GraphQL Tester</h1>
      <pre>{JSON.stringify({ data, isLoading, error }, null, 2)}</pre>
    </>
  );
}

const query = graphql(`
  query Query($input: String) {
    foo(input: $input) {
      bar
    }
  }
`);
