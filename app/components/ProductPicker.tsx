/* app/components/ProductPicker.tsx */
import {
  Modal,
  TextField,
  ResourceList,
  ResourceItem,
  Spinner,
  Thumbnail,
  Badge,
  Box,
} from "@shopify/polaris";
import {useState, useEffect, useCallback} from "react";

/* ---------- data shape returned by our search route ---------- */
export interface Product {
  id: string;        // gid://…
  title: string;
  variants: {id: string; title: string; image: string}[];
  pickedVariantId?: string;
  qty?: number;
}

/* ---------- props   ----------------------------------------- */
interface Props {
  open: boolean;
  onClose(): void;
  /** All items picked in previous sessions – so we can pre-tick them */
  picked: Product[];
  /** Called with the FULL new list when user confirms */
  onSelect(products: Product[]): void;
}

/* ------------------------------------------------------------------ */
export default function ProductPicker({open, onClose, picked, onSelect}: Props) {
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [items,   setItems]   = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(
    picked.map((p) => p.id),
  ));
  const [variantForId, setVariantForId] = useState<Record<string,string>>(
    () =>
      Object.fromEntries(
        picked.map(p => [p.id, p.pickedVariantId ?? p.variants[0].id]),
      ),
  );

  /* bring selection back in sync if parent resets it */
  useEffect(() => {
    setSelectedIds(new Set(picked.map((p) => p.id)));
  }, [picked]);

  /* ----- backend search  -------------------------------------- */
  const search = useCallback(async (term: string) => {

    setLoading(true);

    const res = await fetch(`/app/products/search?q=${encodeURIComponent(term)}`);
    const { products } = await res.json();          // products is the array we shaped above
    setItems(products);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) search(query);            // empty query ⇒ full list
  }, [open, query, search]);

  /* ----- build Product[] out of selectedIds ------------------- */
  const selectedProducts = items
    .filter((p) => selectedIds.has(p.id))
    // keep already-picked items even if not in current result page
    .concat(picked.filter((p) => selectedIds.has(p.id) && !items.find(i => i.id === p.id)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add products"
      primaryAction={{
        content: `Add ${selectedIds.size}`,
        onAction: () => {
          const out = selectedProducts.map((p) => ({
            id   : p.id,
            title: p.title,
            variants: p.variants,
            pickedVariantId: variantForId[p.id] ?? p.variants[0].id,
            qty: p.qty ?? 1,
          }));
          onSelect(out);
          onClose();
        },
        disabled: selectedIds.size === 0,
      }}
      secondaryActions={[{content: "Cancel", onAction: onClose}]}
    >
      <Modal.Section>
        <TextField
          label="Search products"
          value={query}
          onChange={setQuery}
          autoComplete="off"
        />

        {loading ? (
          <Box padding="400">
            <Spinner accessibilityLabel="Loading" size="large" />
          </Box>
        ) : (
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={items}
            selectedItems={Array.from(selectedIds)}
            selectable
            renderItem={(item) => {
              const variantId   = variantForId[item.id] ?? item.variants[0].id;
              const variantInfo =
                item.variants.find(v => v.id === variantId) ?? item.variants[0];  // ✔ safe
              const media = (
                <Thumbnail
                  size="small"
                  source={variantInfo.image}
                  alt={`${item.title} – ${variantInfo.title}`}
                />
              );

            return (
              <ResourceItem
                id={item.id}
                media={media}                                          /* ✨ thumbnail */
                accessibilityLabel={`Select ${item.title}`}
                verticalAlignment="center"
                onClick={() =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                    return next;
                  })
                }
              >
                <strong>{item.title}</strong><br/>
                {/* variant selector */}
                <select
                  value={variantId}
                  onChange={e =>
                    setVariantForId({ ...variantForId, [item.id]: e.currentTarget.value })
                  }
                >
                  {item.variants.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.title}                        {/* now shows “Black / L” etc. */}
                    </option>
                  ))}
                </select>
              </ResourceItem>
            );
          }}
          onSelectionChange={(ids) => setSelectedIds(new Set(ids as string[]))}
        />
        )}

        {selectedIds.size > 0 && (
          <Box paddingBlockStart="400">
            <Badge>{`${selectedIds.size} selected`}</Badge>
          </Box>
        )}
      </Modal.Section>
    </Modal>
  );
}
