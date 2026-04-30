import type { ReactNode } from "react";

type LocalizedTextProps = {
  zh: ReactNode;
  en: ReactNode;
};

export function LocalizedText({ zh, en }: LocalizedTextProps) {
  return (
    <>
      <span className="locale-text locale-text-zh">{zh}</span>
      <span className="locale-text locale-text-en">{en}</span>
    </>
  );
}
