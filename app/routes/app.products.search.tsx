/* app/routes/app.products.search.tsx */
import {json, type LoaderFunctionArgs} from "@remix-run/node";
import {authenticate} from "app/shopify.server";

/**  GET /app/products/search?q=snow  →  [{id,title,variantId,imageUrl}, …]  */
export const loader = async ({request}: LoaderFunctionArgs) => {
  const {admin} = await authenticate.admin(request);
  const q = new URL(request.url).searchParams.get("q") ?? "";

  const gql = `
    query ($q: String!){
      products(first: 20, query: $q){
        edges{
          node{
            id
            title
            featuredImage { url }
            variants(first: 1){ edges{ node{ id } } }
          }
        }
      }
    }`;

  const res  = await admin.graphql(gql, {variables: {q}});
  const data = await res.json();

  const products = data.data.products.edges.map(
    ({node}: any) => ({
      id       : node.id,
      title    : node.title,
      variantId: node.variants.edges[0]?.node.id,
      imageUrl : node.featuredImage?.url ?? "",     // ✨
    }),
  );

  return json(products);
};
