import { useEffect, useRef, useState, type FormEvent } from "react";
import { FolderTree, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import type {
  TorrentCategory,
  TorrentCategoryEdit,
  TorrentStatus,
  TorrentTag,
  TorrentTagEdit,
} from "../../lib/desktop";

interface LibraryMetadataDialogProps {
  categories: TorrentCategory[];
  tags: TorrentTag[];
  selectedTorrents: TorrentStatus[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreateCategory: (name: string) => Promise<boolean>;
  onRenameCategory: (id: string, name: string) => Promise<boolean>;
  onDeleteCategory: (id: string) => Promise<boolean>;
  onCreateTag: (name: string) => Promise<boolean>;
  onRenameTag: (id: string, name: string) => Promise<boolean>;
  onDeleteTag: (id: string) => Promise<boolean>;
  onApply: (
    torrentIds: number[],
    categoryEdit: TorrentCategoryEdit,
    tagEdit: TorrentTagEdit,
  ) => Promise<boolean>;
}

type EditingItem = { kind: "category" | "tag"; id: string; name: string } | null;

export function LibraryMetadataDialog({
  categories,
  tags,
  selectedTorrents,
  busy,
  error,
  onClose,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onApply,
}: LibraryMetadataDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [categoryName, setCategoryName] = useState("");
  const [tagName, setTagName] = useState("");
  const [editing, setEditing] = useState<EditingItem>(null);
  const [categoryEdit, setCategoryEdit] = useState<TorrentCategoryEdit>({ action: "keep" });
  const [tagEditAction, setTagEditAction] = useState<TorrentTagEdit["action"]>("keep");
  const [tagEditIds, setTagEditIds] = useState<string[]>([]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (categoryEdit.action === "assign" && !categories.some((category) => category.id === categoryEdit.categoryId)) {
      setCategoryEdit({ action: "keep" });
    }
    const validTagIds = new Set(tags.map((tag) => tag.id));
    setTagEditIds((current) => {
      const next = current.filter((id) => validTagIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [categories, tags, categoryEdit]);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName;
    if (!name.trim() || busy) return;
    if (await onCreateCategory(name)) setCategoryName("");
  }

  async function createTag(event: FormEvent) {
    event.preventDefault();
    const name = tagName;
    if (!name.trim() || busy) return;
    if (await onCreateTag(name)) setTagName("");
  }

  async function saveRename(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.name.trim() || busy) return;
    const saved = editing.kind === "category"
      ? await onRenameCategory(editing.id, editing.name)
      : await onRenameTag(editing.id, editing.name);
    if (saved) setEditing(null);
  }

  async function applyToSelected(event: FormEvent) {
    event.preventDefault();
    if (!selectedTorrents.length || busy) return;
    const tagEdit: TorrentTagEdit = tagEditAction === "keep"
      ? { action: "keep" }
      : { action: tagEditAction, tagIds: tagEditIds };
    const saved = await onApply(selectedTorrents.map((torrent) => torrent.id), categoryEdit, tagEdit);
    if (saved) onClose();
  }

  const hasChanges = categoryEdit.action !== "keep"
    || (tagEditAction !== "keep" && (tagEditAction === "replace" || tagEditIds.length > 0));

  return (
    <dialog
      className="library-dialog"
      ref={dialogRef}
      aria-labelledby="library-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <header className="library-dialog__header">
        <div>
          <h2 id="library-dialog-title">Categories &amp; tags</h2>
          <p>Organize downloads in your library. Files stay in their current folders.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close categories and tags">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      {selectedTorrents.length > 0 && (
        <form className="library-dialog__assignment" onSubmit={(event) => void applyToSelected(event)}>
          <div className="library-dialog__section-heading">
            <div>
              <h3>Edit {selectedTorrents.length} selected {selectedTorrents.length === 1 ? "torrent" : "torrents"}</h3>
              <p>Choose which fields to change. “Keep current” preserves each torrent’s existing value.</p>
            </div>
          </div>
          <div className="library-dialog__edit-grid">
            <label className="library-dialog__field">
              <span>Category</span>
              <select
                value={categoryEdit.action === "keep" ? "__keep__" : categoryEdit.action === "clear" ? "__none__" : categoryEdit.categoryId}
                disabled={busy}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCategoryEdit(value === "__keep__"
                    ? { action: "keep" }
                    : value === "__none__"
                      ? { action: "clear" }
                      : { action: "assign", categoryId: value });
                }}
              >
                <option value="__keep__">Keep current</option>
                <option value="__none__">No category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="library-dialog__field">
              <span>Tag action</span>
              <select
                value={tagEditAction}
                disabled={busy}
                onChange={(event) => setTagEditAction(event.currentTarget.value as TorrentTagEdit["action"])}
              >
                <option value="keep">Keep current</option>
                <option value="add">Add selected tags</option>
                <option value="remove">Remove selected tags</option>
                <option value="replace">Replace with selected tags</option>
              </select>
            </label>
          </div>
          {tagEditAction !== "keep" && (
            <div className="library-dialog__tag-options" aria-label="Tags to change">
              {tags.length === 0 ? <span>Create a tag below to use this action.</span> : tags.map((tag) => (
                <label className="library-dialog__tag-option" key={tag.id}>
                  <input
                    type="checkbox"
                    checked={tagEditIds.includes(tag.id)}
                    disabled={busy}
                    onChange={(event) => setTagEditIds((current) => event.currentTarget.checked
                      ? [...current, tag.id]
                      : current.filter((id) => id !== tag.id))}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="library-dialog__assignment-footer">
            <span>Category changes only relabel downloads; Torque does not move existing data.</span>
            <button className="primary-button" type="submit" disabled={busy || !hasChanges}>
              {busy ? "Saving…" : `Apply to ${selectedTorrents.length}`}
            </button>
          </div>
        </form>
      )}

      <div className="library-dialog__management">
        <section className="library-dialog__section" aria-labelledby="library-categories-heading">
          <div className="library-dialog__section-heading">
            <div>
              <h3 id="library-categories-heading">Categories</h3>
              <p>One category per torrent.</p>
            </div>
          </div>
          <form className="library-dialog__create" onSubmit={(event) => void createCategory(event)}>
            <input aria-label="New category name" maxLength={48} placeholder="e.g. Linux" value={categoryName} disabled={busy} onChange={(event) => setCategoryName(event.currentTarget.value)} />
            <button className="icon-button" type="submit" aria-label="Create category" disabled={busy || !categoryName.trim()}><Plus size={15} /></button>
          </form>
          <ul className="library-dialog__items">
            {categories.length === 0 && <li className="library-dialog__empty">Create a category to group related downloads.</li>}
            {categories.map((category) => (
              <li key={category.id}>
                {editing?.kind === "category" && editing.id === category.id ? (
                  <form className="library-dialog__rename" onSubmit={(event) => void saveRename(event)}>
                    <input autoFocus aria-label={`Rename ${category.name}`} maxLength={48} value={editing.name} disabled={busy} onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })} />
                    <button className="text-button" type="submit" disabled={busy || !editing.name.trim()}>Save</button>
                    <button className="text-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className="library-dialog__item-icon library-dialog__item-icon--category"><FolderTree size={14} aria-hidden="true" /></span>
                    <span className="library-dialog__item-name" title={category.name}>{category.name}</span>
                    <button className="library-dialog__item-action" type="button" aria-label={`Rename ${category.name}`} disabled={busy} onClick={() => setEditing({ kind: "category", id: category.id, name: category.name })}><Pencil size={13} /></button>
                    <button className="library-dialog__item-action library-dialog__item-action--delete" type="button" aria-label={`Delete ${category.name}`} disabled={busy} onClick={() => {
                      if (window.confirm(`Delete “${category.name}”? Torrents in this category will become uncategorized.`)) void onDeleteCategory(category.id);
                    }}><Trash2 size={13} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="library-dialog__section" aria-labelledby="library-tags-heading">
          <div className="library-dialog__section-heading">
            <div>
              <h3 id="library-tags-heading">Tags</h3>
              <p>Apply several tags to a torrent.</p>
            </div>
          </div>
          <form className="library-dialog__create" onSubmit={(event) => void createTag(event)}>
            <input aria-label="New tag name" maxLength={48} placeholder="e.g. Important" value={tagName} disabled={busy} onChange={(event) => setTagName(event.currentTarget.value)} />
            <button className="icon-button" type="submit" aria-label="Create tag" disabled={busy || !tagName.trim()}><Plus size={15} /></button>
          </form>
          <ul className="library-dialog__items">
            {tags.length === 0 && <li className="library-dialog__empty">Tags help you mark priority, size, or temporary downloads.</li>}
            {tags.map((tag) => (
              <li key={tag.id}>
                {editing?.kind === "tag" && editing.id === tag.id ? (
                  <form className="library-dialog__rename" onSubmit={(event) => void saveRename(event)}>
                    <input autoFocus aria-label={`Rename ${tag.name}`} maxLength={48} value={editing.name} disabled={busy} onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })} />
                    <button className="text-button" type="submit" disabled={busy || !editing.name.trim()}>Save</button>
                    <button className="text-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className="library-dialog__item-icon library-dialog__item-icon--tag"><Tag size={14} aria-hidden="true" /></span>
                    <span className="library-dialog__item-name" title={tag.name}>{tag.name}</span>
                    <button className="library-dialog__item-action" type="button" aria-label={`Rename ${tag.name}`} disabled={busy} onClick={() => setEditing({ kind: "tag", id: tag.id, name: tag.name })}><Pencil size={13} /></button>
                    <button className="library-dialog__item-action library-dialog__item-action--delete" type="button" aria-label={`Delete ${tag.name}`} disabled={busy} onClick={() => {
                      if (window.confirm(`Delete “${tag.name}”? It will be removed from all torrents.`)) void onDeleteTag(tag.id);
                    }}><Trash2 size={13} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {error && <p className="library-dialog__error" role="alert">{error}</p>}
      <footer className="library-dialog__footer">
        <span>{categories.length} {categories.length === 1 ? "category" : "categories"} · {tags.length} {tags.length === 1 ? "tag" : "tags"}</span>
        <button className="text-button" type="button" onClick={onClose}>Done</button>
      </footer>
    </dialog>
  );
}
