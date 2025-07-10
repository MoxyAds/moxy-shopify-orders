/* app/routes/app.orders.create.tsx */
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/server-runtime";
import { useActionData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  InlineError,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Checkbox,
  LegacyStack as Stack,
} from "@shopify/polaris";

import { useState } from "react";

import {
  authenticate,
  createDraftOrder,
  getOrCreateCustomer,
  normaliseUA,
  safeZip,
} from "app/shopify.server";

import CityAutocomplete, { type Option } from "app/components/CityAutocomplete";
import type { Product } from "app/components/ProductPicker";
import ProductPicker from "app/components/ProductPicker";

/* ───────────────────────── loader & action ────────────────────────── */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  /* ──────────── gather & validate form data ─────────── */
  const body = await request.formData();

  const ids  = body.getAll("variantId");
  const qtys = body.getAll("qty").map(Number);
  const lines = ids.map((id, i) => ({
    variantId: id,
    quantity : qtys[i] || 1,
  }));

  const required = ["first", "last", "phone", "cityRef", "warehouseRef"];
  const missing =
    required.filter(k => !body.get(k)).concat(lines.length ? [] : ["variantId"]);

  if (missing.length) {
    return json({ error: `Missing fields: ${missing.join(",")}` }, { status: 400 });
  }

  const isCOD = body.get("cod") === "1";
  const { admin } = await authenticate.admin(request);

  /* ──────────── ensure / create the customer ─────────── */
  const customerId = await getOrCreateCustomer(
    admin,
    body.get("first") as string,
    body.get("last")  as string,
    body.get("phone") as string,
  );

  try {
    /* create draft (4 args) */
    const draftId = await createDraftOrder(
      admin,
      lines,
      {
        firstName : body.get("first"),
        lastName  : body.get("last"),
        phone     : normaliseUA(body.get("phone") as string),   // +380…
        city      : body.get("cityName"),
        address1  : `Нова Пошта – ${body.get("warehouseName")}`,
        zip       : safeZip(body.get("postalCode")),
      },
      {
        npRefs: {
          cityRef      : body.get("cityRef"),
          warehouseRef : body.get("warehouseRef"),
        },
        customerId,
        cod : isCOD,
        tags: isCOD ? ["COD"] : [],
        note: isCOD
          ? "Накладений платіж / Cash-on-Delivery (300 ₴ передплата)"
          : "Оплачено повністю",

        /* pretty info for “Additional details” */
        cityLabel      : body.get("cityName"),
        warehouseLabel : body.get("warehouseName"),
        recipientPhone : normaliseUA(body.get("phone") as string),
      },
    );

    /* complete the draft → real order (paymentPending makes it “Partially paid”) */
    const COMPLETE_DRAFT = /* GraphQL */ `
      mutation completeDraft($id: ID!, $pending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $pending) {
          draftOrder { id order { id } }
          userErrors { message }
        }
      }
    `;

    const completeRes = await admin.graphql(COMPLETE_DRAFT, {
      variables: { id: draftId, pending: isCOD },
    });
    const completeJson: any = await completeRes.json();

    const errs = [
      ...(completeJson.errors ?? []),
      ...(completeJson.data?.draftOrderComplete?.userErrors ?? []),
    ];
    if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));

    /* real Order GID we’ll attach the deposit to */
    const orderGid: string | null =
      completeJson.data.draftOrderComplete.draftOrder.order?.id ?? null;

    /* ---- mark COD deposit in a metafield -------------------------------- */
    if (isCOD && orderGid) {
      await admin.graphql(
        `
          mutation setMeta($mfs: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $mfs) {
              userErrors { field message }
            }
          }
        `,
        {
          variables: {
            mfs: [
              {
                ownerId:   orderGid,       // 👈 goes *inside* the input object
                namespace: "cod",
                key:       "deposit_amount",
                type:      "single_line_text_field",
                value:     "300.00 UAH",
              },
            ],
          },
        },
      );
    }

    return redirect("/app/orders");
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message }, { status: 500 });
  }
};

/* ───────────────────────── component ────────────────────────── */
export default function CreateOrder() {
  /* product picker ------------------------------------------------ */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [products,   setProducts]   = useState<Product[]>([]);

  /* customer / shipping fields ----------------------------------- */
  const [first, setFirst] = useState("");
  const [last,  setLast]  = useState("");
  const [phone, setPhone] = useState("");
  const [city,  setCity]  = useState<Option | null>(null);
  const [wh,    setWh]    = useState<Option | null>(null);
  const [cod,   setCod]   = useState(false);

  const actionData = useActionData<typeof action>();

  return (
    <Page title="Create order">
      {/* ----------- product picker modal (multi-select) ------------ */}
      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        picked={products}
        onSelect={setProducts}        // ← returns full new list
      />

      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <FormLayout>

                {/* ---- customer info -------------------------------- */}
                <TextField label="First name" name="first"
                  value={first} onChange={setFirst} autoComplete="off" />
                <TextField label="Last name"  name="last"
                  value={last}  onChange={setLast}  autoComplete="off" />
                <TextField label="Phone"      name="phone"
                  value={phone} onChange={setPhone} type="tel" autoComplete="off" />

                {/* ---- hidden shipping fields ----------------------- */}
                <input type="hidden" name="cityRef"      value={city?.value ?? ""} />
                <input type="hidden" name="cityName"     value={city?.label ?? ""} />
                <input type="hidden" name="warehouseRef" value={wh?.value   ?? ""} />
                <input type="hidden" name="warehouseName" value={wh?.label ?? ""} />
                <input type="hidden" name="postalCode" value={city?.zip ?? ""} />

                {/* ---- cascading city-/warehouse-pickers ------------ */}
                <CityAutocomplete
                  endpoint="/api/novaposhta/cities"
                  placeholder="Search city"
                  selected={city?.value}
                  onSelect={(opt) => { setCity(opt); setWh(null); }}
                />
                {city && (
                  <CityAutocomplete
                    endpoint={`/api/novaposhta/warehouses?city=${city.value}`}
                    placeholder="Search warehouse"
                    selected={wh?.value}
                    onSelect={setWh}
                  />
                )}

                {/* ---- COD checkbox ------------------------------ */}
              <Checkbox
                label="Накладений платіж (передплата 300 ₴)"
                checked={cod}
                onChange={setCod}
              />
              {/* hidden field so the <form> sends it */}
              <input type="hidden" name="cod" value={cod ? "1" : ""} />

                {/* ---- product list preview + hidden inputs -------- */}
                {products.length > 0 && (
                  <ResourceList
                    resourceName={{ singular: "product", plural: "products" }}
                    items={products}
                    renderItem={(p) => {
                      const selectedVariant =
                        p.variants.find((v) => v.id === p.pickedVariantId) ?? p.variants[0];

                      return (
                        <ResourceItem
                          id={p.id}
                          media={
                            <Thumbnail
                              size="small"
                              source={
                                (p.variants.find(v => v.id === p.pickedVariantId)?.image) ||
                                "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"
                              }
                              alt={p.title}
                            />
                          }
                          onClick={() => {}}
                        >
                          <Stack alignment="center" spacing="tight">
                            <Stack.Item fill>
                              <div style={{ fontWeight: 600 }}>{p.title}</div>

                              {/* variant selector */}
                              <select
                                value={p.pickedVariantId}
                                onChange={(e) =>
                                  setProducts(prev =>
                                    prev.map(x =>
                                      x.id === p.id
                                        ? { ...x, pickedVariantId: e.currentTarget.value }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                {p.variants.map(v => (
                                  <option key={v.id} value={v.id}>{v.title}</option>
                                ))}
                              </select>

                              {/* quantity */}
                              <input
                                type="number"
                                min={1}
                                style={{ width: 70, marginLeft: 8 }}
                                value={p.qty ?? 1}
                                onChange={(e) =>
                                  setProducts(prev =>
                                    prev.map(x =>
                                      x.id === p.id ? { ...x, qty: Number(e.currentTarget.value) } : x,
                                    ),
                                  )
                                }
                              />
                            </Stack.Item>

                            <Button
                              variant="plain"
                              onClick={() => setProducts(prev => prev.filter(x => x.id !== p.id))}
                            >
                              Remove
                            </Button>
                          </Stack>

                          {/* hidden fields sent to the server */}
                          <input type="hidden" name="variantId" value={p.pickedVariantId} />
                          <input type="hidden" name="qty"       value={p.qty ?? 1} />
                        </ResourceItem>
                      );
                    }}
                  />
                )}

                {/* ---- open picker ---------------------------------- */}
                <Button onClick={() => setPickerOpen(true)}>
                  {products.length ? "Add / remove products" : "Select products"}
                </Button>

                {/* ---- any server-side error ------------------------ */}
                {actionData?.error && (
                  <InlineError message={actionData.error} fieldID="form-error" />
                )}

                <Button variant="primary" submit>
                  Create order
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
