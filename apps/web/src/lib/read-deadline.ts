/** Bound a complete read, including body consumption, without retrying writes. */
export async function withReadDeadline<T>(
  caller: AbortSignal | null | undefined,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(caller?.reason);
  if (caller?.aborted) cancel();
  else caller?.addEventListener("abort", cancel, { once: true });
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  try {
    return await read(controller.signal);
  } catch (error) {
    if (timedOut && !caller?.aborted) throw new Error("请求超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(deadline);
    caller?.removeEventListener("abort", cancel);
  }
}
