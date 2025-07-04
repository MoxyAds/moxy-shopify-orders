/* app/components/CityAutocomplete.tsx */
import { useCallback, useEffect, useState } from "react";
import { Autocomplete }            from "@shopify/polaris";

export type Option = { label: string; value: string };

interface Props {
  /** Where to fetch — `/api.novaposhta.cities` or `/api.novaposhta.warehouses?city=…` */
  endpoint: string;
  placeholder: string;
  selected: string | undefined;
  onSelect(value: Option): void;
}

export default function CityAutocomplete({
  endpoint,
  placeholder,
  selected,
  onSelect,
}: Props) {
  const [options,  setOptions]  = useState<Option[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [input,    setInput]    = useState("");

  /** Hit our loader every key-stroke (debounced in real life) */
  const update = useCallback(async (term: string) => {

    if (term.length < 2) {
      setOptions([]);          // show nothing
      setLoading(false);
      return;
    }

    setLoading(true);
    const sep  = endpoint.includes("?") ? "&" : "?";
    const res  = await fetch(`${endpoint}${sep}q=${encodeURIComponent(term)}`);
    const raw  = (await res.json()) as any[];
    // map Nova-Poshta shape → label/value
    const opts = raw.map((c) => ({
      label : c.Present ?? c.present ?? c.Description,
      value : c.Ref    ?? c.ref,     // <- will always be the city ref
    }));

    setOptions(opts);
    setLoading(false);
  }, [endpoint]);

  /* Fetch when input changes */
  useEffect(() => { if (input) update(input); }, [input, update]);

  useEffect(() => {
    if (!selected) setInput("");
  }, [selected]);

  return (
    <Autocomplete
      loading={loading}
      options={options}
      selected={selected ? [selected] : []}
      textField={
        <Autocomplete.TextField
          label="City"               /* required prop */
          labelHidden
          value={input}
          placeholder={placeholder}
          onChange={setInput}
          autoComplete="off"
        />
      }
      onSelect={(values) => {
        const value = values[0] as string;
        const opt   = options.find((o) => o.value === value)!;
        setInput(opt.label);           // show full text
        onSelect(opt);
      }}
    />
  );
}
