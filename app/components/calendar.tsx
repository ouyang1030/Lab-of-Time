import { overlapsDates, itemTimeLabel, lastItemDate } from "@/lib/item-dates";
import EventPreview from "./event-preview";
import { CalendarDays, Flag, Plus, Check, Video } from "lucide-react";
import {
  addDays,
  dateKey,
  monthDays,
  startOfWeek,
  periodRange,
  layoutWeekRow,
} from "@/lib/calendar";
import {
  TYPE_LABELS,
  type Item,
  type Member,
  type MemberColor,
  type View,
} from "@/lib/model";
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Avatar({
  member,
  small = false,
}: {
  member: Member;
  small?: boolean;
}) {
  const parts = member.name.trim().split(/\s+/);
  const initials =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : member.name.slice(0, 2).toUpperCase();
  return (
    <span
      title={member.name}
      className={`avatar color-${member.color} ${small ? "small" : ""}`}
    >
      {initials}
    </span>
  );
}
function DoneToggle({
  item,
  onToggle,
}: {
  item: Item;
  onToggle: (item: Item) => void;
}) {
  const done = item.status === "done";
  return (
    <button
      className={`done-toggle ${done ? "checked" : ""}`}
      aria-label={`${done ? "Reopen" : "Complete"} ${item.title}`}
      aria-pressed={done}
      title={done ? "Mark as not done" : "Mark as done"}
      onClick={() => onToggle(item)}
    >
      {done && <Check size={10} strokeWidth={3} />}
    </button>
  );
}
export function EventPill({
  item,
  color = "blue",
  owner,
  onSelect,
  onToggleDone,
  connectLeft,
  connectRight,
  isRowStart,
}: {
  item: Item;
  color?: MemberColor;
  owner?: string;
  onSelect: (item: Item) => void;
  /** Omitted when the viewer may not change this item's status. */
  onToggleDone?: (item: Item) => void;
  connectLeft: boolean;
  connectRight: boolean;
  isRowStart: boolean;
}) {
  const multiDay = connectLeft || connectRight;
  const isFirstDay = !connectLeft;
  const isLastDay = !connectRight;
  const showTitle = isFirstDay || isRowStart;

  let timeLabel = itemTimeLabel(item);
  if (multiDay) {
    timeLabel = "";
    if (!item.allDay) {
      const endTime = item.type === "milestone" ? item.time : item.endTime;
      if (isFirstDay && item.type !== "milestone") timeLabel = item.time;
      if (isLastDay && endTime) timeLabel = `ends ${endTime}`;
    }
  }

  const classes = [
    "event-pill",
    item.type,
    multiDay ? "multi-day" : "",
    multiDay && item.allDay ? "all-day-span" : "",
    item.priority === "high" && isLastDay ? "priority-fold" : "",
    `color-${color}`,
    item.status === "done" ? "completed" : "",
    onToggleDone ? "can-complete" : "",
    connectLeft ? "connect-left" : "",
    connectRight ? "connect-right" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wrapClasses = [
    connectLeft ? "connect-left" : "",
    connectRight ? "connect-right" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <EventPreview item={item} owner={owner} className={wrapClasses}>
      <button
        className={classes}
        onClick={() => onSelect(item)}
        aria-label={`${item.title}${timeLabel ? `, ${timeLabel}` : ""}${item.priority === "high" ? ", high priority" : ""}`}
        title={`${itemTimeLabel(item)} ${item.title}`}
      >
        {isFirstDay && (
          item.status === "done" ? (
            <Check size={11} />
          ) : multiDay && item.allDay ? (
            <CalendarDays size={11} />
          ) : item.type === "milestone" ? (
            <Flag size={11} />
          ) : item.type === "meeting" ? (
            <Video size={11} />
          ) : (
            <i />
          )
        )}
        {showTitle ? (
          <span>{item.title}</span>
        ) : (
          <span className="event-pill-cont" aria-hidden="true" />
        )}
        {timeLabel && <time>{timeLabel}</time>}
      </button>
      {onToggleDone && <DoneToggle item={item} onToggle={onToggleDone} />}
    </EventPreview>
  );
}
/** One month of the quarter and year views: a dot grid, plus its milestones when `onSelect` is given. */
function MiniMonth({
  month,
  items,
  selected,
  today,
  memberColor,
  onDay,
  onMonth,
  onSelect,
}: {
  month: Date;
  items: Item[];
  selected: string;
  today: string;
  memberColor: (ownerId: string) => MemberColor;
  onDay: (date: string) => void;
  onMonth: (date: Date) => void;
  onSelect?: (item: Item) => void;
}) {
  const [start, end] = periodRange(month, "month");
  const entries = items.filter((item) => overlapsDates(item, start, end));
  const milestones = entries.filter((item) => item.type === "milestone");
  return (
    <section className={onSelect ? "quarter-month" : "quarter-month year-month"}>
      <button className="quarter-title" onClick={() => onMonth(month)}>
        <strong>{month.toLocaleDateString("en-US", { month: "long" })}</strong>
        <span>{entries.length} items →</span>
      </button>
      <div className="mini-week">
        {weekdays.map((day) => (
          <span key={day}>{day[0]}</span>
        ))}
      </div>
      <div className="mini-grid">
        {monthDays(month).map((day) => {
          const key = dateKey(day);
          const dayItems = entries.filter((item) => overlapsDates(item, key));
          return (
            <button
              key={key}
              className={`${day.getMonth() !== month.getMonth() ? "muted-day" : ""} ${key === today ? "mini-today" : ""} ${key === selected ? "mini-selected" : ""}`}
              onClick={() => onDay(key)}
              aria-label={`${key}, ${dayItems.length} items`}
            >
              {day.getDate()}
              <div>
                {dayItems.slice(0, 3).map((item) => (
                  <i
                    className={`dot ${item.type} color-${memberColor(item.ownerId)}`}
                    key={item.id}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      {onSelect && (
        <div className="quarter-events">
          {milestones.slice(0, 4).map((item) => (
            <button key={item.id} onClick={() => onSelect(item)}>
              <span
                className={`dot milestone color-${memberColor(item.ownerId)}`}
              />
              <span>{item.title}</span>
              <time>
                {month.toLocaleDateString("en-US", { month: "short" })}{" "}
                {Number(item.date.slice(8))}
              </time>
            </button>
          ))}
          {milestones.length === 0 && <p>No milestones</p>}
        </div>
      )}
    </section>
  );
}
export default function Calendar({
  date,
  view,
  items,
  members,
  selected,
  today,
  onDay,
  onSelect,
  canComplete,
  onToggleDone,
  onAdd,
  onMonth,
}: {
  date: Date;
  view: View;
  items: Item[];
  members: Member[];
  selected: string;
  today: string;
  onDay: (date: string) => void;
  onSelect: (item: Item) => void;
  canComplete: (item: Item) => boolean;
  onToggleDone: (item: Item) => void;
  onAdd: (date: string) => void;
  onMonth: (date: Date) => void;
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberColor = (ownerId: string): MemberColor =>
    memberById.get(ownerId)?.color ?? "blue";
  const ownerName = (ownerId: string) => memberById.get(ownerId)?.name;
  if (view === "year" || view === "quarter") {
    const firstMonth = view === "year" ? 0 : Math.floor(date.getMonth() / 3) * 3;
    return (
      <div className={view === "year" ? "year-grid" : "quarter-grid"}>
        {Array.from({ length: view === "year" ? 12 : 3 }, (_, offset) => (
          <MiniMonth
            key={offset}
            month={new Date(date.getFullYear(), firstMonth + offset, 1, 12)}
            items={items}
            selected={selected}
            today={today}
            memberColor={memberColor}
            onDay={onDay}
            onMonth={onMonth}
            // Only the quarter view has room to list each month's milestones.
            onSelect={view === "quarter" ? onSelect : undefined}
          />
        ))}
      </div>
    );
  }
  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))
      : monthDays(date);

  const weekRows: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weekRows.push(days.slice(i, i + 7));
  }

  const weekRowSlots = weekRows.map((week) =>
    layoutWeekRow(week, items, view === "week"),
  );

  return (
    <div className={`calendar-scroll ${view}`}>
      <div className="calendar-inner">
        <div className="weekdays">
          {weekdays.map((day, i) => (
            <span className={i > 4 ? "weekend" : ""} key={day}>
              {day}
              {view === "week" && (
                <strong className={dateKey(days[i]) === today ? "current" : ""}>
                  {days[i].getDate()}
                </strong>
              )}
            </span>
          ))}
        </div>
        <div className="calendar-grid">
          {weekRows.map((week, weekIdx) => {
            const rowSlots = weekRowSlots[weekIdx];
            return week.map((day, colIdx) => {
              const key = dateKey(day);
              const daySlotItems = rowSlots[colIdx];
              const allDayEntries = items.filter((item) => overlapsDates(item, key));
              const isMonthOutside =
                day.getMonth() !== date.getMonth() && view === "month";
              const isWeekend = colIdx > 4;

              const daySingles =
                view === "week"
                  ? items
                      .filter(
                        (item) =>
                          item.date === key && lastItemDate(item) === item.date,
                      )
                      .sort((a, b) => a.time.localeCompare(b.time))
                  : [];

              return (
                <div
                  key={key}
                  className={`day-cell ${isMonthOutside ? "outside" : ""} ${isWeekend ? "weekend-cell" : ""} ${selected === key ? "selected-day" : ""}`}
                >
                  <div className="day-top">
                    <button
                      aria-label={`View ${key}`}
                      className={`day-number ${key === today ? "today" : ""}`}
                      onClick={() => onDay(key)}
                    >
                      {day.getDate()}
                    </button>
                    <button
                      className="day-add"
                      aria-label={`Add item on ${key}`}
                      onClick={() => onAdd(key)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="day-events">
                    {(view === "week"
                      ? daySlotItems
                      : daySlotItems.slice(0, 3)
                    ).map((slotItem, slotIdx) =>
                      slotItem ? (
                        <EventPill
                          key={slotItem.item.id}
                          item={slotItem.item}
                          color={memberColor(slotItem.item.ownerId)}
                          owner={ownerName(slotItem.item.ownerId)}
                          onSelect={onSelect}
                          onToggleDone={
                            canComplete(slotItem.item) ? onToggleDone : undefined
                          }
                          connectLeft={slotItem.connectLeft}
                          connectRight={slotItem.connectRight}
                          isRowStart={slotItem.isRowStart}
                        />
                      ) : (
                        <div
                          key={`spacer-${slotIdx}`}
                          className="calendar-slot-spacer"
                          aria-hidden="true"
                        />
                      ),
                    )}
                    {daySingles.map((item) => (
                      <EventPreview
                        key={item.id}
                        item={item}
                        className={canComplete(item) ? "can-complete" : ""}
                        owner={ownerName(item.ownerId)}
                      >
                        <button
                          aria-label={item.priority === "high" ? `${item.title}, high priority` : undefined}
                          className={`week-event ${item.priority === "high" ? "priority-fold" : ""} ${item.type} color-${memberColor(item.ownerId)} ${item.status === "done" ? "completed" : ""}`}
                          onClick={() => onSelect(item)}
                        >
                          <time>{itemTimeLabel(item)}</time>
                          <strong>{item.title}</strong>
                          <span>
                            {TYPE_LABELS[item.type]}
                            {item.status === "done" ? " · Done" : ""}
                          </span>
                        </button>
                        {canComplete(item) && (
                          <DoneToggle item={item} onToggle={onToggleDone} />
                        )}
                      </EventPreview>
                    ))}
                    {view === "week" &&
                      daySlotItems.length === 0 &&
                      daySingles.length === 0 && (
                        <button
                          className="week-empty"
                          aria-label={`Add item on ${key}`}
                          onClick={() => onAdd(key)}
                        >
                          <Plus size={16} />
                        </button>
                      )}
                  </div>
                  {view === "month" && allDayEntries.length > 3 && (
                    <button className="more-events" onClick={() => onDay(key)}>
                      +{allDayEntries.length - 3} more
                    </button>
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
