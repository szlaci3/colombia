import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  GripVertical,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  createBlock,
  moveCard,
  moveItem,
  uid,
  type Block,
  type BoardBlock,
  type Card,
  type TableBlock,
} from "../model";
import { Editable } from "./Editable";
import { Art } from "./Art";

export const blockNames = {
  hero: "Hero section",
  products: "Product collection",
  table: "Data table",
  board: "Kanban board",
  quote: "Testimonial",
  text: "Text section",
};
type BlockProps = {
  block: Block;
  update: (block: Block) => void;
  preview: boolean;
};

function Table({
  block,
  update,
  preview,
}: {
  block: TableBlock;
  update: (block: Block) => void;
  preview: boolean;
}) {
  function setCell(row: number, column: number, value: string) {
    const next = structuredClone(block);
    next.rows[row][column] = value;
    update(next);
  }
  return (
    <section className="table-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Clarity in the details</span>
          <Editable
            as="h2"
            label="Table title"
            value={block.title}
            onChange={(title) => update({ ...block, title })}
            preview={preview}
          />
        </div>
        <span className="count-badge">{block.rows.length} rows</span>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Editable data table"
      >
        <table>
          <thead>
            <tr>
              {block.headers.map((header, i) => (
                <th key={i} scope="col">
                  <Editable
                    label={`Column ${i + 1} header`}
                    value={header}
                    preview={preview}
                    onChange={(value) =>
                      update({
                        ...block,
                        headers: block.headers.map((h, j) =>
                          j === i ? value : h,
                        ),
                      })
                    }
                  />
                </th>
              ))}
              {!preview && (
                <th scope="col">
                  <span className="sr-only">Row actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    <Editable
                      className={
                        j === 0
                          ? "table-name"
                          : cell === "Active" ||
                              cell === "Pending" ||
                              cell === "In progress"
                            ? `status-pill status-${cell.toLowerCase().replace(" ", "-")}`
                            : ""
                      }
                      label={`Row ${i + 1}, ${block.headers[j] || `column ${j + 1}`}`}
                      value={cell}
                      preview={preview}
                      onChange={(value) => setCell(i, j, value)}
                    />
                  </td>
                ))}
                {!preview && (
                  <td>
                    <button
                      className="icon-button row-delete"
                      aria-label={`Delete row ${i + 1}`}
                      onClick={() =>
                        update({
                          ...block,
                          rows: block.rows.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!preview && (
        <div className="structure-actions">
          <button
            disabled={block.rows.length >= 100}
            onClick={() =>
              update({
                ...block,
                rows: [
                  ...block.rows,
                  block.headers.map((_, i) => (i === 0 ? "New person" : "—")),
                ],
              })
            }
          >
            <Plus size={14} /> Add row
          </button>
          <button
            disabled={block.headers.length >= 20}
            onClick={() =>
              update({
                ...block,
                headers: [...block.headers, "New column"],
                rows: block.rows.map((row) => [...row, "—"]),
              })
            }
          >
            <Plus size={14} /> Add column
          </button>
          <button
            className="muted-action"
            disabled={block.headers.length <= 1}
            onClick={() =>
              update({
                ...block,
                headers: block.headers.slice(0, -1),
                rows: block.rows.map((row) => row.slice(0, -1)),
              })
            }
          >
            <Trash2 size={13} /> Last column
          </button>
        </div>
      )}
    </section>
  );
}

function KanbanCard({
  card,
  columns,
  currentColumn,
  update,
  remove,
  move,
  preview,
}: {
  card: Card;
  columns: BoardBlock["columns"];
  currentColumn: string;
  update: (card: Card) => void;
  remove: () => void;
  move: (columnId: string) => void;
  preview: boolean;
}) {
  const sortable = useSortable({ id: card.id, disabled: preview });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.35 : 1,
      }}
      className="kanban-card"
    >
      <div className="card-top">
        <Editable
          className="card-tag"
          label={`Tag for ${card.title}`}
          value={card.tag}
          onChange={(tag) => update({ ...card, tag })}
          preview={preview}
        />
        {!preview && (
          <button
            ref={sortable.setActivatorNodeRef}
            className="icon-button drag-handle"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Drag card ${card.title}`}
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>
      <Editable
        as="h3"
        label={`Card title: ${card.title}`}
        value={card.title}
        onChange={(title) => update({ ...card, title })}
        preview={preview}
      />
      <div className="card-bottom">
        <Editable
          className="avatar"
          label={`Assignee for ${card.title}`}
          value={card.person}
          maxLength={4}
          onChange={(person) => update({ ...card, person })}
          preview={preview}
        />
        {!preview && (
          <div className="card-actions">
            <select
              aria-label={`Move ${card.title}`}
              value={currentColumn}
              onChange={(event) => move(event.target.value)}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label={`Delete card ${card.title}`}
              onClick={remove}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function BoardColumn({
  column,
  children,
}: {
  column: BoardBlock["columns"][number];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={`board-column ${isOver ? "drop-over" : ""}`}
    >
      {children}
    </div>
  );
}

function Board({
  block,
  update,
  preview,
}: {
  block: BoardBlock;
  update: (block: Block) => void;
  preview: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const updateColumn = (
    columnId: string,
    change: (column: BoardBlock["columns"][number]) => void,
  ) => {
    const next = structuredClone(block);
    const column = next.columns.find((c) => c.id === columnId);
    if (column) change(column);
    update(next);
  };
  function dragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    if (!over || over.id === active.id) return;
    const target = block.columns.find(
      (column) =>
        column.id === over.id ||
        column.cards.some((card) => card.id === over.id),
    );
    if (target)
      update(
        moveCard(
          block,
          String(active.id),
          target.id,
          target.id === over.id ? undefined : String(over.id),
        ),
      );
  }
  return (
    <section className="board-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">The next good thing</span>
          <Editable
            as="h2"
            label="Board title"
            value={block.title}
            onChange={(title) => update({ ...block, title })}
            preview={preview}
          />
        </div>
        <span className="team-avatars">
          <span>AM</span>
          <span>SR</span>
          <span>JL</span>
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) =>
          setActiveCard(
            block.columns
              .flatMap((c) => c.cards)
              .find((c) => c.id === active.id) ?? null,
          )
        }
        onDragEnd={dragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        <div className="board-columns">
          {block.columns.map((column, index) => (
            <BoardColumn key={column.id} column={column}>
              <div className="column-heading">
                <span className={`column-dot dot-${index % 3}`} />
                <Editable
                  as="h3"
                  label={`Column title: ${column.title}`}
                  value={column.title}
                  onChange={(title) =>
                    updateColumn(column.id, (c) => {
                      c.title = title;
                    })
                  }
                  preview={preview}
                />
                <span className="column-count">{column.cards.length}</span>
                {!preview && (
                  <button
                    className="icon-button"
                    aria-label={`Delete column ${column.title}`}
                    disabled={block.columns.length <= 1}
                    onClick={() =>
                      update({
                        ...block,
                        columns: block.columns.filter(
                          (c) => c.id !== column.id,
                        ),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <SortableContext
                items={column.cards.map((card) => card.id)}
                strategy={verticalListSortingStrategy}
              >
                {column.cards.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    columns={block.columns}
                    currentColumn={column.id}
                    preview={preview}
                    update={(value) =>
                      updateColumn(column.id, (c) => {
                        c.cards = c.cards.map((item) =>
                          item.id === card.id ? value : item,
                        );
                      })
                    }
                    remove={() =>
                      updateColumn(column.id, (c) => {
                        c.cards = c.cards.filter((item) => item.id !== card.id);
                      })
                    }
                    move={(target) => update(moveCard(block, card.id, target))}
                  />
                ))}
              </SortableContext>
              {!preview && (
                <button
                  className="add-card"
                  disabled={column.cards.length >= 100}
                  onClick={() =>
                    updateColumn(column.id, (c) => {
                      c.cards.push({
                        id: uid(),
                        title: "A new possibility",
                        tag: "Ideas",
                        person: "ME",
                      });
                    })
                  }
                >
                  <Plus size={14} /> Add a card
                </button>
              )}
            </BoardColumn>
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="kanban-card drag-overlay">{activeCard.title}</div>
          )}
        </DragOverlay>
      </DndContext>
      {!preview && (
        <div className="structure-actions">
          <button
            disabled={block.columns.length >= 8}
            onClick={() =>
              update({
                ...block,
                columns: [
                  ...block.columns,
                  { id: uid(), title: "New column", cards: [] },
                ],
              })
            }
          >
            <Plus size={14} /> Add column
          </button>
          <span className="small-hint">
            Drag cards, or use their move menu.
          </span>
        </div>
      )}
    </section>
  );
}

export function BlockContent({ block, update, preview }: BlockProps) {
  switch (block.type) {
    case "hero":
      return (
        <section className="hero-section">
          <div className="hero-copy">
            <Editable
              className="eyebrow"
              label="Hero eyebrow"
              value={block.eyebrow}
              onChange={(eyebrow) => update({ ...block, eyebrow })}
              preview={preview}
            />
            <Editable
              as="h2"
              className="hero-title"
              label="Hero headline"
              multiline
              value={block.title}
              onChange={(title) => update({ ...block, title })}
              preview={preview}
            />
            <Editable
              as="p"
              className="hero-description"
              label="Hero description"
              multiline
              value={block.description}
              onChange={(description) => update({ ...block, description })}
              preview={preview}
            />
            <span className="prototype-cta">
              Thoughtfully made <ArrowUpRight size={16} />
            </span>
          </div>
          <Art kind="hero" />
        </section>
      );
    case "products":
      return (
        <section className="products-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The everyday collection</span>
              <Editable
                as="h2"
                label="Collection title"
                value={block.title}
                onChange={(title) => update({ ...block, title })}
                preview={preview}
              />
            </div>
            <span className="collection-detail">
              Considered. Collected. Kept.
            </span>
          </div>
          <div className="product-grid">
            {block.items.map((product, index) => {
              const change = (
                key: "name" | "category" | "price",
                value: string,
              ) =>
                update({
                  ...block,
                  items: block.items.map((item) =>
                    item.id === product.id ? { ...item, [key]: value } : item,
                  ),
                });
              return (
                <article className="product-card" key={product.id}>
                  <div className="product-picture">
                    <Art kind={product.art} />
                    <span className="product-number">0{index + 1}</span>
                  </div>
                  <div className="product-info">
                    <Editable
                      as="h3"
                      label={`Product ${index + 1} name`}
                      value={product.name}
                      preview={preview}
                      onChange={(value) => change("name", value)}
                    />
                    <Editable
                      className="product-price"
                      label={`Product ${index + 1} price`}
                      value={product.price}
                      preview={preview}
                      onChange={(value) => change("price", value)}
                    />
                  </div>
                  <Editable
                    as="p"
                    className="product-category"
                    label={`Product ${index + 1} description`}
                    value={product.category}
                    preview={preview}
                    onChange={(value) => change("category", value)}
                  />
                  {!preview && (
                    <div className="product-actions">
                      <button
                        className="icon-button"
                        aria-label={`Move product ${index + 1} left`}
                        disabled={index === 0}
                        onClick={() =>
                          update({
                            ...block,
                            items: moveItem(block.items, index, index - 1),
                          })
                        }
                      >
                        <ArrowUp className="rotate-left" size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move product ${index + 1} right`}
                        disabled={index === block.items.length - 1}
                        onClick={() =>
                          update({
                            ...block,
                            items: moveItem(block.items, index, index + 1),
                          })
                        }
                      >
                        <ArrowDown className="rotate-left" size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete product ${index + 1}`}
                        disabled={block.items.length <= 1}
                        onClick={() =>
                          update({
                            ...block,
                            items: block.items.filter(
                              (p) => p.id !== product.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {!preview && (
            <button
              className="inline-add"
              disabled={block.items.length >= 24}
              onClick={() => {
                const defaults = createBlock("products");
                if (defaults.type === "products")
                  update({
                    ...block,
                    items: [
                      ...block.items,
                      defaults.items[block.items.length % 3],
                    ],
                  });
              }}
            >
              <Plus size={14} /> Add product
            </button>
          )}
        </section>
      );
    case "table":
      return <Table block={block} update={update} preview={preview} />;
    case "board":
      return <Board block={block} update={update} preview={preview} />;
    case "quote":
      return (
        <section className="quote-section">
          <div className="quote-stars" role="img" aria-label="5 out of 5 stars">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={11} fill="currentColor" />
            ))}
          </div>
          <Editable
            as="blockquote"
            label="Testimonial quote"
            value={block.quote}
            preview={preview}
            onChange={(quote) => update({ ...block, quote })}
          />
          <Editable
            as="p"
            label="Testimonial author"
            value={block.author}
            preview={preview}
            onChange={(author) => update({ ...block, author })}
          />
        </section>
      );
    case "text":
      return (
        <section className="text-section">
          <span className="eyebrow">
            <Check size={12} /> Made with intention
          </span>
          <Editable
            as="h2"
            label="Section title"
            value={block.title}
            preview={preview}
            onChange={(title) => update({ ...block, title })}
          />
          <Editable
            as="p"
            label="Section body"
            value={block.body}
            multiline
            preview={preview}
            onChange={(body) => update({ ...block, body })}
          />
        </section>
      );
  }
}

export function SortableBlock({
  block,
  update,
  preview,
  selected,
  select,
  index,
  count,
  move,
  duplicate,
  remove,
}: BlockProps & {
  selected: boolean;
  select: () => void;
  index: number;
  count: number;
  move: (to: number) => void;
  duplicate: () => void;
  remove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled: preview });
  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      data-block-type={block.type}
      className={`canvas-block ${selected && !preview ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => !preview && select()}
      onFocus={() => !preview && select()}
    >
      {!preview && (
        <div className="block-toolbar">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="icon-button drag-handle"
            aria-label={`Drag ${blockNames[block.type]}`}
          >
            <GripVertical size={14} />
          </button>
          <span>{blockNames[block.type]}</span>
          <div className="block-tools">
            <button
              className="icon-button"
              aria-label={`Move ${blockNames[block.type]} up`}
              disabled={index === 0}
              onClick={() => move(index - 1)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              className="icon-button"
              aria-label={`Move ${blockNames[block.type]} down`}
              disabled={index === count - 1}
              onClick={() => move(index + 1)}
            >
              <ArrowDown size={13} />
            </button>
            <button
              className="icon-button"
              aria-label={`Duplicate ${blockNames[block.type]}`}
              disabled={count >= 24}
              onClick={duplicate}
            >
              <Copy size={13} />
            </button>
            <button
              className="icon-button"
              aria-label={`Delete ${blockNames[block.type]}`}
              disabled={count <= 1}
              onClick={remove}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
      <BlockContent block={block} update={update} preview={preview} />
    </div>
  );
}
