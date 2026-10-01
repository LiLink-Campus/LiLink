"use client";
import { useRef, useState } from "react";
import styles from "./BirthDatePicker.module.css";

export function BirthDatePicker({value, minYear, maxYear, onChange}: {value: string; minYear: number; maxYear: number; onChange: (value: string) => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [year, setYear] = useState(maxYear);
  const [month, setMonth] = useState(1);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  function open() { const [y,m] = value.split("-").map(Number); setYear(y || maxYear); setMonth(m || 1); dialog.current?.showModal(); }
  return <>
    <button type="button" className={styles.trigger} aria-label="选择出生日期" onClick={open}>{value ? value.replaceAll("-", "/") : "请选择出生日期"}<span aria-hidden="true">▦</span></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="birth-picker-title">
      <header><h2 id="birth-picker-title">选择出生日期</h2><button type="button" aria-label="关闭日期选择" onClick={() => dialog.current?.close()}>×</button></header>
      <div className={styles.selects}><select aria-label="出生年份" value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from({length:maxYear-minYear+1},(_,i)=>maxYear-i).map(y=><option key={y} value={y}>{y} 年</option>)}</select><select aria-label="出生月份" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m} 月</option>)}</select></div>
      <div className={styles.calendar}>{["日","一","二","三","四","五","六"].map(d=><span key={d}>{d}</span>)}{Array.from({length:firstDay},(_,i)=><span key={`empty-${i}`}/>)}{Array.from({length:days},(_,i)=>i+1).map(day=>{const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`; return <button key={day} type="button" aria-label={`${year}年${month}月${day}日`} aria-pressed={date===value} onClick={()=>{onChange(date);dialog.current?.close();}}>{day}</button>;})}</div>
      <p>选择日期后自动保存</p>
    </dialog>
  </>;
}
