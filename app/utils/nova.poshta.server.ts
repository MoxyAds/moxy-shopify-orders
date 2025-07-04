
const base = "https://api.novaposhta.ua/v2.0/json/";
const apiKey = process.env.NOVA_POSTA_API_KEY!;

/* Wrapper so callers don’t repeat the boiler-plate */
async function novaCall(model: string, method: string, props: Record<string, unknown>) {
  const body = JSON.stringify({
    apiKey,
    modelName: model,
    calledMethod: method,
    methodProperties: props,
  });

  const res  = await fetch(base, { method: "POST", body, headers: { "Content-Type": "application/json" } });
  const json = await res.json();
  if (!json.success) throw new Error(json.errors?.join(", ") || "Nova Poshta API error");

  return json.data;
}

export async function searchCities(term: string) {
  const resp = await novaCall("Address", "searchSettlements", {
    CityName: term,
    Limit: 10,
  });

  // Each element is resp[0].Addresses[i]
  return resp[0]?.Addresses.map((a: any) => ({
    present: a.Present,          // label
    ref   : a.DeliveryCity
  })) ?? [];
}

export async function searchWarehouses(term: string, cityRef: string) {
  return await novaCall("Address", "getWarehouses", { CityRef: cityRef, FindByString: term, Limit: 10, Language: "UA" });
}
