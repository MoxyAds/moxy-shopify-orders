// app/routes/api.novaposhta.warehouses.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { searchWarehouses } from "app/utils/nova.poshta.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url   = new URL(request.url);
  const q     = url.searchParams.get("q")    ?? "";  // search term
  const city  = url.searchParams.get("city") ?? "";  // CityRef

  console.log("[warehouses-loader] cityRef =", city, "q =", q);

  if (!city) return json([]);

  const data  = await searchWarehouses(q, city);

  return json(data);
};
