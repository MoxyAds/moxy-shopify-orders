// app/routes/api.novaposhta.cities.tsx
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { searchCities } from "app/utils/nova.poshta.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const data = await searchCities(q);
  return json(data);
};
