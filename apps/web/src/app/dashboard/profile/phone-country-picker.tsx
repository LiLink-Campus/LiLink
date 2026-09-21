"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import styles from "./phone-country-picker.module.css";

import { phoneCountryNames } from "./phone-country-names";
const commonCountries: CountryCode[] = ["CN", "HK", "MO", "TW", "SG", "US", "CA", "GB", "AU", "JP", "KR", "MY"];
const shortNames: Partial<Record<CountryCode, string>> = { HK: "中国香港", MO: "中国澳门", TW: "中国台湾" };
const countries = phoneCountryNames.map(({ country, name, english }) => ({
  country,
  name: shortNames[country] ?? name,
  searchNames: [name, english, shortNames[country], country].join(" ").toLowerCase(),
  code: getCountryCallingCode(country),
}));
const common = commonCountries.flatMap((country) => countries.filter((item) => item.country === country));
const remaining = countries.filter((item) => !commonCountries.includes(item.country));
const orderedCountries = [...common, ...remaining];

export function PhoneCountryPicker({ value, onChange }: { value: CountryCode; onChange: (country: CountryCode) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = countries.find((item) => item.country === value)!;
  const trimmedQuery = query.trim().toLowerCase();
  const codeQuery = /^\+?\d+$/.test(trimmedQuery) ? trimmedQuery.replace("+", "") : null;
  const exactCountry = orderedCountries.find((item) => item.country.toLowerCase() === trimmedQuery);
  const filtered = exactCountry ? [exactCountry] : trimmedQuery ? orderedCountries.filter((item) => codeQuery
    ? item.code.startsWith(codeQuery)
    : item.searchNames.includes(trimmedQuery)) : orderedCountries;

  useEffect(() => {
    const element = dialog.current;
    if (!open) {
      element?.close();
      return;
    }
    element?.showModal();
    search.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function close() { setOpen(false); }
  function select(country: CountryCode) { onChange(country); close(); }
  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[0]) select(filtered[0].country);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      results.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }
  function handleResultKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(results.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const current = buttons.indexOf(event.currentTarget);
    if (event.key === "ArrowUp" && current === 0) { search.current?.focus(); return; }
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + (event.key === "ArrowDown" ? 1 : -1);
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }
  function countryList(items: typeof countries, label: string) {
    return <ul className={styles.list} aria-label={label}>
      {items.map((item) => <li key={item.country}>
        <button type="button" className={styles.choice} aria-pressed={item.country === value} onClick={() => select(item.country)} onKeyDown={handleResultKey}>
          <span className={styles.region}>{item.name}</span><span className={styles.callingCode}>+{item.code}</span>
          <span className={styles.check} aria-hidden="true">{item.country === value ? "✓" : ""}</span>
        </button>
      </li>)}
    </ul>;
  }

  return <>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={`电话区号：${selected.name} +${selected.code}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => { setQuery(""); setOpen(true); }}>
      <span className={styles.triggerRegion} title={selected.name}>{selected.name}</span><span className={styles.triggerCode}>+{selected.code}</span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <dialog id={id} ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onKeyDown={(event) => { if (event.key === "Escape" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); close(); } }} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
      <header className={styles.header}><div><h2 id={`${id}-title`}>选择电话区号</h2><p>找到你的国家或地区</p></div><button type="button" className={styles.close} aria-label="关闭区号选择" onClick={close}>×</button></header>
      <div className={styles.searchBox}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <input ref={search} type="search" aria-label="搜索国家、地区或区号" placeholder="国家、地区或区号，如 +86" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); results.current?.scrollTo({ top: 0 }); }} onKeyDown={handleSearchKey} />
        {query && <button type="button" aria-label="清空区号搜索" onClick={() => { setQuery(""); search.current?.focus(); }}>×</button>}
      </div>
      {open && <div ref={results} className={styles.results}>
        {trimmedQuery ? <><p className={styles.groupLabel} role="status">找到 {filtered.length} 个国家或地区</p>{filtered.length ? countryList(filtered, "区号搜索结果") : <div className={styles.empty}><strong>没有找到相关区号</strong><p>试试国家或地区名，也可以直接搜索 +86。</p></div>}</> : <><p className={styles.groupLabel}>常用地区</p>{countryList(common, "常用国家和地区")}<p className={styles.groupLabel}>其他国家和地区</p>{countryList(remaining, "其他国家和地区")}</>}
      </div>}
    </dialog>
  </>;
}
