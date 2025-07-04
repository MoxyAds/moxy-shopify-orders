import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;


// ORDERS
// type NodeResponse = {
//   node: {
//     id: string;
//     name: string;
//     totalPriceSet: {
//       presentmentMoney: {
//         amount: string;
//         currencyCode: string;
//       };
//     };
//     customer?: {
//       firstName: string;
//     };
//     createdAt: string;
//   };
// };
export const getOrders = async (admin: any) => {
  const query = `
    {
      orders(first: 10) {
        edges {
          node {
            id
            name
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            customer {
              firstName
            }
            createdAt
          }
        }
      }
    }
  `;

  try {
    // `admin.graphql` should return the parsed GraphQL data or throw on error
    const data = await admin.graphql(query);

    // 'data' should already have the shape { orders: { edges: [...] } }
    console.log("GraphQL data from admin.graphql:", data);

    // Now parse the body:
    const parsed = await data.json();

    // The shape is typically { data: { orders: { edges: [...] } }, errors?: ... }
    console.log("Parsed GraphQL response:", parsed);

    // Make sure 'orders' actually exists
    if (!parsed.data?.orders?.edges) {
      throw new Error(
        "No orders found in GraphQL response: " + JSON.stringify(parsed),
      );
    }

    // Return an array of order nodes
    return parsed.data.orders.edges.map((edge: any) => edge.node);
  } catch (error) {
    console.error("Error fetching orders:", error);
    throw error;
  }
};
