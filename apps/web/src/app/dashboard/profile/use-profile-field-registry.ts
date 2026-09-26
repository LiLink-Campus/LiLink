import { useCallback, useRef } from "react";

export function useProfileFieldRegistry() {
  const questionBlockRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const setAttentionBlockRef = useCallback(
    (keys: readonly string[], node: HTMLFieldSetElement | null) => {
      for (const key of keys) {
        if (node) questionBlockRefs.current.set(key, node);
        else questionBlockRefs.current.delete(key);
      }
    },
    []
  );
  return { questionBlockRefs, setAttentionBlockRef };
}
export type ProfileFieldRegistry = ReturnType<typeof useProfileFieldRegistry>;
