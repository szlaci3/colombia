import {
  useEffect,
  useRef,
  type ElementType,
  type KeyboardEvent,
  type FocusEvent,
  type ClipboardEvent,
} from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  as?: ElementType;
  className?: string;
  preview?: boolean;
  multiline?: boolean;
  maxLength?: number;
};

export function Editable({
  value,
  onChange,
  label,
  as: Tag = "span",
  className = "",
  preview,
  multiline,
  maxLength = 2000,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (
      ref.current &&
      document.activeElement !== ref.current &&
      ref.current.textContent !== value
    )
      ref.current.textContent = value;
  });
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.currentTarget.textContent = value;
      event.currentTarget.blur();
    }
  }
  if (preview)
    return <Tag className={`preview-text ${className}`}>{value}</Tag>;
  return (
    <Tag
      ref={ref}
      className={`editable ${className}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={!!multiline}
      tabIndex={0}
      onKeyDown={keyDown}
      onBlur={(event: FocusEvent<HTMLElement>) => {
        const next = (
          event.currentTarget.innerText ??
          event.currentTarget.textContent ??
          ""
        )
          .replace(/\r\n/g, "\n")
          .slice(0, maxLength);
        event.currentTarget.textContent = next;
        if (next !== value) onChange(next);
      }}
      onPaste={(event: ClipboardEvent<HTMLElement>) => {
        event.preventDefault();
        const pasted = event.clipboardData
          .getData("text/plain")
          .slice(0, maxLength);
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(pasted);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }}
    >
      {value}
    </Tag>
  );
}
