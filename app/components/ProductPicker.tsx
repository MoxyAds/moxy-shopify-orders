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
  variantId: string; // gid://… (first variant)
  imageUrl: string;
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

  /* bring selection back in sync if parent resets it */
  useEffect(() => {
    setSelectedIds(new Set(picked.map((p) => p.id)));
  }, [picked]);

  /* ----- backend search  -------------------------------------- */
  const search = useCallback(async (term: string) => {
    if (!term) return setItems([]);
    setLoading(true);
    const res  = await fetch(`/app/products/search?q=${encodeURIComponent(term)}`);
    const list = await res.json();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => { search(query); }, [query, search]);

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
          onSelect(selectedProducts);
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
            const media = (
              <Thumbnail
                size="small"
                source={
                  item.imageUrl ||
                  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"
                }
                alt={item.title}
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
                {item.title}
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
