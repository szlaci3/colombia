import { useEffect, useRef } from "react";

export function useNavigationDrawer(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const phone = window.matchMedia("(max-width: 600px)");
    if (!phone.matches) {
      close();
      return;
    }
    const drawer = ref.current;
    const opener = document.querySelector<HTMLElement>(
      `[aria-controls="${drawer.id}"]`,
    );
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const targets = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    (
      drawer.querySelector<HTMLElement>('[aria-current="page"]') ?? targets()[0]
    )?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || document.querySelector("dialog[open]")) return;
      const items = targets();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (
        !drawer.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const resize = () => {
      if (!phone.matches) close();
    };
    document.addEventListener("keydown", keydown);
    phone.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      phone.removeEventListener("change", resize);
      if (!document.querySelector("dialog[open]"))
        opener?.focus({ preventScroll: true });
    };
  }, [open, close]);
  return ref;
}
