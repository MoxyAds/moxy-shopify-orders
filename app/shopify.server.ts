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

// ────────────────────────────────────────────────────────────
//  Draft Orders
// ────────────────────────────────────────────────────────────
type DraftOrderLine = { variantId: unknown; quantity: number };

/** Options you may want to tweak per-order */
interface DraftExtras {
  /* required bits */
  npRefs: { cityRef: unknown; warehouseRef: unknown };
  cod: boolean;

  /* optional Shopify fields */
  tags?: string[];
  note?: string;

  /* 👇 Any other key is welcome */
  [key: string]: unknown;
}

/**
 * Creates a Shopify Draft Order and returns its GID.
 * Throws with a readable message if Shopify responds with userErrors / errors.
 */
export async function createDraftOrder(
  admin: any,
  lines: DraftOrderLine[],
  shipping: {
    firstName: unknown;
    lastName : unknown;
    phone    : unknown;
    city     : unknown;
    address1 : unknown;
    zip?     : unknown;
  },
  extras: DraftExtras,
) {
  /* ───────────────── shape DraftOrderInput ─────────────────── */
  const draft: Record<string, unknown> = {
    lineItems: lines,
    shippingAddress: shipping,
    phone: shipping.phone,
    // standard fields
    tags: extras.tags ?? (extras.cod ? ["COD"] : []),
    note:
      extras.note ??
      (extras.cod
        ? "Накладений платіж / Cash-on-Delivery (300 ₴ передплата)"
        : "Оплачено повністю"),
    // customAttributes keep NovaPoshta refs (+ COD flag so it’s queryable)
    customAttributes: [
      { key: "NP-cityRef",      value: String(extras.npRefs.cityRef) },
      { key: "NP-warehouseRef", value: String(extras.npRefs.warehouseRef) },
      { key: "COD",             value: extras.cod ? "true" : "false" },
    ],
  };

  /* ───────────────── call Shopify Admin API ────────────────── */
  const res = await admin.graphql(
    `
      mutation ($draft: DraftOrderInput!) {
        draftOrderCreate(input: $draft) {
          draftOrder { id }
          userErrors  { field message }
        }
      }
    `,
    { variables: { draft } },
  );

  const payload = await res.json();
  const apiErrors   = payload.errors ?? [];
  const userErrors  = payload.data?.draftOrderCreate?.userErrors ?? [];

  if (apiErrors.length || userErrors.length) {
    const details = [...apiErrors, ...userErrors]
      .map((e: any) => e.message ?? JSON.stringify(e))
      .join("; ");
    throw new Error("Shopify API error: " + details);
  }

  return payload.data.draftOrderCreate.draftOrder.id as string;
}


/**
 * Return an existing customer that matches the phone OR create one and
 * return the new GID.  Phone is normalised to +380XXXXXXXXX first.
 */
export async function getOrCreateCustomer(
  admin: any,
  firstName: string,
  lastName: string,
  rawPhone: string,
) {
  const phone = normaliseUA(rawPhone);           //  ➜  +38… format

  /* 1️⃣ Look-up by phone ------------------------------------------------ */
  const find = await admin.graphql(`
    query ($q: String!) {
      customers(first: 1, query: $q) { edges { node { id } } }
    }`,
    { variables: { q: `phone:${phone}` } },
  );
  const found = (await find.json()).data.customers.edges[0]?.node?.id;
  if (found) return found;

  /* 2️⃣ Create new ------------------------------------------------------ */
  const create = await admin.graphql(`
    mutation ($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer   { id }
        userErrors { message }
      }
    }`,
    { variables: { input: { firstName, lastName, phone } } },
  );
  const createJson = await create.json();
  const errs = createJson.data.customerCreate.userErrors;
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));

  return createJson.data.customerCreate.customer.id as string;
}

/* Helper used above */
export function normaliseUA(n: string) {
  const digits = n.replace(/\D/g, "");          // strip spaces, dashes …
  return digits.startsWith("380") ? `+${digits}` : `+38${digits}`;
}

/**
 * Make sure we always hand Shopify *some* postal code.
 * If Nova Poshta didn’t return Index1, fall back to Kyiv’s 01001.
 */
export function safeZip(raw: unknown) {
  const z = String(raw ?? "").trim();
  return /^\d{5}$/.test(z) ? z : "01001";          // Kyiv - central PO
}
