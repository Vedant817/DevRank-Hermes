import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<T> {
  const { LINEAR_API_KEY } = requireEnv(env, ["LINEAR_API_KEY"], "Linear API");

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: LINEAR_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed with ${response.status}.`);
  }

  const json = (await response.json()) as GraphqlResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  if (!json.data) {
    throw new Error("Linear API returned no data.");
  }

  return json.data;
}
