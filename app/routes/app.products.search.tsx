/* app/routes/app.products.search.tsx */
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";

/**  GET /app/products/search?q=snow → { products: […], debug: […] }  */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const q = new URL(request.url).searchParams.get("q") || "";

  const gql = /* GraphQL */ `
    query ($q: String!) {
      products(first: 20, query: $q) {
        edges {
          node {
            id
            title
            featuredImage { url }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  image { url }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
      }
    }`;

  const res  = await admin.graphql(gql, { variables: { q } });
  const data = await res.json();
  console.dir(data, { depth: null });

  const products = data.data.products.edges.map(({ node }: any) => {
    const fallback = node.featuredImage?.url ?? "";

    return {
      id   : node.id,
      title: node.title,

      variants: node.variants.edges.map(({ node: v }: any) => {
        // ────── prettify variant name ──────
        const isDefault = v.title === "Default Title";
        const titleFromOptions = v.selectedOptions
          .filter((o: any) => o.name !== "Title")          // ignore auto-added “Title”
          .map((o: any) => o.value)
          .join(" / ");

        return {
          id     : v.id,
          title  : isDefault && titleFromOptions ? titleFromOptions : v.title,
          image  : v.image?.url ?? fallback
                 ?? "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
          options: v.selectedOptions,                       // keep raw options if you need them later
        };
      }),
    };
  });

  return json({ products, debug: data }, { headers: { "Cache-Control": "no-store" } });
};
