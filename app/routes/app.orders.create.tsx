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
} from "@shopify/polaris";

import { useState } from "react";

import { authenticate } from "app/shopify.server";
import CityAutocomplete, { type Option } from "app/components/CityAutocomplete";
import type { Product } from "app/components/ProductPicker";
import ProductPicker from "app/components/ProductPicker";

/* ───────────────────────── loader & action ────────────────────────── */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body  = await request.formData();
  const lines = body.getAll("variantId")               // ← multiple values
                   .map((id) => ({ variantId: id, quantity: 1 }));

  const required = ["first", "last", "phone", "cityRef", "warehouseRef"];
  const missing  =
    required.filter((f) => !body.get(f)).concat(lines.length ? [] : ["variantId"]);
  if (missing.length)
    return json({ error: `Missing fields: ${missing.join(",")}` }, { status: 400 });

  const { admin } = await authenticate.admin(request);

  const draft = {
    lineItems: lines,
    shippingAddress: {
      firstName : body.get("first"),
      lastName  : body.get("last"),
      phone     : body.get("phone"),
      city      : body.get("cityName"),
      address1  : `Nova Poshta warehouse ${body.get("warehouseRef")}`,
    },
    note: "Created from in-house admin panel",
  };

  const res = await admin.graphql(
    `mutation($draft: DraftOrderInput!){ draftOrderCreate(input:$draft){
        draftOrder{ id } userErrors{ message } }}`,
    { variables: { draft } },
  );
  const raw = await res.json() as any;
  if (raw.errors?.length || raw.data.draftOrderCreate.userErrors.length)
    return json({ error: "Shopify API error – check logs" }, { status: 500 });

  return redirect("/app/orders");
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

                {/* ---- product list preview + hidden inputs -------- */}
                {products.length > 0 && (
                  <ResourceList
                    resourceName={{ singular: "product", plural: "products" }}
                    items={products}
                    renderItem={(p) => (
                      <ResourceItem
                        id={p.id}
                        accessibilityLabel={p.title}
                        onClick={() => {}}
                      >
                        {p.title}
                        {/* remove chip */}
                        <Button
                          variant="plain"
                          onClick={() =>
                            setProducts((prev) => prev.filter((x) => x.id !== p.id))
                          }
                        >
                          Remove
                        </Button>
                        {/* one hidden input per variant */}
                        <input type="hidden" name="variantId" value={p.variantId} />
                      </ResourceItem>
                    )}
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
