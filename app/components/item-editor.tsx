"use client";
import { itemTimeLabel, lastItemDate } from "@/lib/item-dates";
import {
  REPEAT_LABELS,
  daysBetween,
  shiftDate,
  type Repeat,
  type RepeatEvery,
} from "@/lib/repeat";
import { useState, type ReactNode } from "react";
import {
  Check,
  CheckSquare,
  ChevronsUpDown,
  Flag,
  Trash2,
  Video,
} from "lucide-react";
import Dialog from "./dialog";
import { Avatar } from "./calendar";
import {
  TYPE_LABELS,
  CYCLE_LABELS,
  STATUS_LABELS,
  canEdit,
  type Item,
  type Member,
  type Rsvp,
} from "@/lib/model";

const TYPE_ICONS = { task: CheckSquare, meeting: Video, milestone: Flag };
const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="editor-row">
      <span className="editor-label">{label}:</span>
      <div className="editor-value">{children}</div>
    </div>
  );
}

export default function ItemEditor({
  item,
  members,
  me,
  attendance,
  busy,
  onSave,
  onDelete,
  onRsvp,
  onClose,
}: {
  item: Item;
  members: Member[];
  me: Member | undefined;
  attendance: Rsvp[];
  busy: boolean;
  onSave: (item: Item, repeat: Repeat | null) => Promise<boolean>;
  onDelete: (item: Item) => Promise<boolean>;
  onRsvp: (id: string, response: "yes" | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const hasNotes = !!(item.description || item.url);
  const [draft, setDraft] = useState(item);
  const savedRepeat = item.repeatEvery || "never";
  const [repeatEvery, setRepeatEvery] = useState<RepeatEvery | "never">(
    savedRepeat,
  );
  const [repeatUntil, setRepeatUntil] = useState(item.repeatUntil);
  // Like Mac Calendar, the date card folds into one line while notes are open.
  const [dateOpen, setDateOpen] = useState(!hasNotes);
  const [notesOpen, setNotesOpen] = useState(hasNotes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = !!me && (!item.id || canEdit(me, item));
  const update = <K extends keyof Item>(key: K, value: Item[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const [replyFailed, setReplyFailed] = useState(false);
  const attendingIds = new Set(attendance
    .filter((reply) => reply.itemId === item.id && reply.response === "yes")
    .map((reply) => reply.memberId));
  const attending = !!me && attendingIds.has(me.id);
  // All-day end dates are stored exclusive; the form always shows the last day.
  const endDay = draft.allDay ? lastItemDate(draft) : draft.endDate || draft.date;
  const repeat =
    repeatEvery === "never" ? null : { every: repeatEvery, until: repeatUntil };
  const repeatChanged =
    repeatEvery !== savedRepeat || (!!repeat && repeatUntil !== item.repeatUntil);
  const changed =
    repeatChanged || JSON.stringify(draft) !== JSON.stringify(item);
  const TypeIcon = TYPE_ICONS[draft.type];
  const foldDates = () => setDateOpen(false);
  return (
    <Dialog
      title={item.id ? "Item Info" : "New Item"}
      onClose={onClose}
      head={
        <span className="editor-heading">
          {item.id ? "Item Info" : "New Item"}
        </span>
      }
    >
      <form
        className="item-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onSave(draft, repeat)) onClose();
        }}
      >
        {draft.sourceName && (
          <p className="editor-note">
            Imported from {draft.sourceName}. Changes here do not update the
            external calendar.
          </p>
        )}
        <div className="editor-card editor-identity">
          <div className="editor-line">
            <input
              className="editor-title"
              aria-label="Title"
              autoFocus={!item.id}
              required
              maxLength={100}
              placeholder="New Item"
              value={draft.title}
              disabled={!editable}
              onChange={(e) => update("title", e.target.value)}
            />
            <label className="editor-pill" title="Type">
              <TypeIcon size={14} aria-hidden="true" />
              <span>{TYPE_LABELS[draft.type]}</span>
              <ChevronsUpDown size={13} aria-hidden="true" />
              <select
                aria-label="Type"
                value={draft.type}
                disabled={!editable}
                onChange={(e) => update("type", e.target.value as Item["type"])}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="editor-line">
            <input
              className="editor-location"
              aria-label="Location"
              maxLength={200}
              placeholder="Add Location"
              value={draft.location}
              disabled={!editable}
              onChange={(e) => update("location", e.target.value)}
            />
          </div>
        </div>
        {dateOpen ? (
          <div className="editor-card editor-grid">
            <Row label="All Day">
              <input
                type="checkbox"
                className="editor-check"
                aria-label="All day"
                checked={draft.allDay}
                disabled={!editable}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setDraft((current) => ({
                    ...current,
                    allDay,
                    endDate: allDay ? shiftDate(endDay, 1) : endDay,
                  }));
                }}
              />
            </Row>
            <Row label="Starts">
              <input
                type="date"
                aria-label="Start date"
                required
                value={draft.date}
                disabled={!editable}
                onChange={(e) => {
                  const date = e.target.value;
                  if (!date) return;
                  // Moving the start keeps the item's length, like Mac Calendar.
                  setDraft((current) => ({
                    ...current,
                    date,
                    endDate: current.endDate
                      ? shiftDate(current.endDate, daysBetween(current.date, date))
                      : current.endDate,
                  }));
                }}
              />
              {!draft.allDay && (
                <input
                  type="time"
                  aria-label={draft.type === "meeting" ? "Start time" : "Due time"}
                  required
                  value={draft.time}
                  disabled={!editable}
                  onChange={(e) => update("time", e.target.value)}
                />
              )}
            </Row>
            <Row label="Ends">
              <input
                type="date"
                aria-label="End date"
                required
                min={draft.date}
                value={endDay}
                disabled={!editable}
                onChange={(e) =>
                  e.target.value &&
                  update(
                    "endDate",
                    draft.allDay ? shiftDate(e.target.value, 1) : e.target.value,
                  )
                }
              />
              {!draft.allDay && draft.type === "meeting" && (
                <input
                  type="time"
                  aria-label="End time"
                  required
                  min={endDay === draft.date ? draft.time : undefined}
                  value={draft.endTime}
                  disabled={!editable}
                  onChange={(e) => update("endTime", e.target.value)}
                />
              )}
            </Row>
          </div>
        ) : (
          <button
            type="button"
            className="editor-card editor-summary"
            aria-expanded="false"
            onClick={() => setDateOpen(true)}
          >
            <span>
              {longDate(draft.date)} · {itemTimeLabel(draft)}
            </span>
          </button>
        )}
        <div className="editor-card editor-grid">
          <Row label="Cycle">
            <select
              aria-label="Cycle"
              disabled={!editable}
              value={draft.cycle}
              onChange={(e) => update("cycle", e.target.value as Item["cycle"])}
            >
              {Object.entries(CYCLE_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Repeat">
            <select
              aria-label="Repeat"
              disabled={!editable}
              value={repeatEvery}
              onChange={(e) => {
                const every = e.target.value as RepeatEvery | "never";
                setRepeatEvery(every);
                if (every !== "never" && !repeatUntil)
                  setRepeatUntil(shiftDate(draft.date, 28));
              }}
            >
              <option value="never">Never</option>
              {Object.entries(REPEAT_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            {item.seriesId && repeatChanged && (
              <small className="editor-hint">
                Replaces the later repeats of this item
              </small>
            )}
          </Row>
          {repeat && (
            <Row label="End Repeat">
              <input
                type="date"
                aria-label="End repeat"
                required
                disabled={!editable}
                min={draft.date}
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
              />
            </Row>
          )}
          <Row label="Status">
            <select
              aria-label="Status"
              disabled={!editable}
              value={draft.status}
              onChange={(e) =>
                update("status", e.target.value as Item["status"])
              }
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Priority">
            <select
              aria-label="Priority"
              disabled={!editable}
              value={draft.priority}
              onChange={(e) =>
                update("priority", e.target.value as Item["priority"])
              }
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Row>
          <Row label="Assignee">
            <select
              aria-label="Assignee"
              value={draft.ownerId}
              disabled={!editable || me?.role === "member"}
              onChange={(e) => update("ownerId", e.target.value)}
            >
              {members
                .filter((member) => member.active || member.id === draft.ownerId)
                .map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.name}
                    {!member.active ? " (Inactive)" : ""}
                  </option>
                ))}
            </select>
          </Row>
        </div>
        {notesOpen ? (
          <div className="editor-card editor-notes">
            <textarea
              aria-label="Notes"
              rows={3}
              maxLength={5000}
              disabled={!editable}
              value={draft.description}
              placeholder="Add Notes"
              onFocus={foldDates}
              onChange={(e) => update("description", e.target.value)}
            />
            <input
              type="url"
              aria-label="URL"
              maxLength={500}
              disabled={!editable}
              value={draft.url}
              placeholder="Add URL"
              onFocus={foldDates}
              onChange={(e) => update("url", e.target.value)}
            />
          </div>
        ) : (
          editable && (
            <button
              type="button"
              className="editor-card editor-summary placeholder"
              onClick={() => {
                setNotesOpen(true);
                foldDates();
              }}
            >
              Add Notes or URL
            </button>
          )
        )}
        {item.type === "meeting" && item.id && me && (
          <div className="attendance-box">
            <label className="attendance-reply">
              <Avatar member={me} small />
              <span>{me.name}</span>
              <input
                type="checkbox"
                aria-label="Confirm my attendance"
                checked={attending}
                disabled={busy}
                onChange={async (event) => {
                  setReplyFailed(false);
                  const saved = await onRsvp(item.id, event.target.checked ? "yes" : null);
                  setReplyFailed(!saved);
                }}
              />
              <span className="attendance-check" aria-hidden="true">
                {attending && <Check size={15} strokeWidth={3} />}
              </span>
            </label>
            {attending && (
              <ul className="attendance-avatars" aria-label="Attending members">
                {members.filter((member) => attendingIds.has(member.id)).map((member, index) => (
                  <li key={member.id} tabIndex={0} aria-label={member.name}
                    data-name={member.name} style={{ animationDelay: `${Math.min(index, 5) * 18}ms` }}>
                    <Avatar member={member} small />
                  </li>
                ))}
              </ul>
            )}
            {replyFailed && <small role="alert">Couldn’t save your reply. Please try again.</small>}
          </div>
        )}
        {editable && (
          <div className="dialog-actions">
            {item.id && (
              <button
                type="button"
                className={`text-button danger ${confirmDelete ? "confirm" : ""}`}
                disabled={busy}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  if (await onDelete(item)) onClose();
                }}
              >
                <Trash2 size={15} />
                {confirmDelete ? "Confirm" : "Delete"}
              </button>
            )}
            <div className="spacer" />
            {item.id && changed && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setDraft(item);
                  setRepeatEvery(savedRepeat);
                  setRepeatUntil(item.repeatUntil);
                }}
              >
                Revert
              </button>
            )}
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Saving…" : item.id ? "Apply" : "Create"}
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
