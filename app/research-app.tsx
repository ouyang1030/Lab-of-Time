"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  ArrowUpRight,
  CalendarArrowDown,
  CalendarDays,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Flag,
  Info,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  UserRoundPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { matchesSearch } from "@/lib/search";
import Calendar, { Avatar } from "./components/calendar";
import Dialog, { FeedbackContext } from "./components/dialog";
import ItemEditor from "./components/item-editor";
import Members from "./components/members";
import MemberAvatars from "./components/member-avatars";
import Onboarding from "./components/onboarding";
import Profile from "./components/profile";
import type { Repeat } from "@/lib/repeat";
import { dateKey, navigateDate, parseDate, periodRange } from "@/lib/calendar";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  CYCLE_LABELS,
  ROLE_LABELS,
  canEdit,
  type Item,
  type ItemType,
  type MemberColor,
  type Mutate,
  type Snapshot,
  type View,
} from "@/lib/model";
import { overlapsDates, itemTimeLabel } from "@/lib/item-dates";
import CalendarImport from "./components/calendar-import";
import { exportCalendar } from "@/lib/ics";

type Section = "calendar" | "tasks" | "meetings" | "milestones" | "members";
const TITLES: Record<Section, string> = {
  calendar: "Calendar",
  tasks: "Tasks",
  meetings: "Meetings",
  milestones: "Milestones",
  members: "Members",
};
const SECTION_TYPES: Partial<Record<Section, ItemType>> = {
  tasks: "task",
  meetings: "meeting",
  milestones: "milestone",
};
const VIEWS: Record<View, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};
const EMPTY_SNAPSHOT: Snapshot = {
  hasWorkspace: false,
  user: null,
  group: null,
  members: [],
  items: [],
  attendance: [],
  subscriptions: [],
};
const newItem = (
  ownerId: string,
  date: string,
  type: ItemType,
  cycle: View,
): Item => ({
  id: "",
  title: "",
  type,
  ownerId,
  date,
  time: "09:00",
  endTime: "10:00",
  endDate: "",
  allDay: false,
  sourceName: "",
  importBatch: "",
  importedBy: "",
  cycle,
  status: "todo",
  priority: "normal",
  description: "",
  location: "",
  url: "",
  seriesId: "",
  repeatEvery: "",
  repeatUntil: "",
  version: 1,
});
const todayInVienna = () =>
  parseDate(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(
      new Date(),
    ),
  );
const shortDate = (value: string) =>
  parseDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const shortMonth = (value: string) =>
  parseDate(value).toLocaleDateString("en-US", { month: "short" });

export default function ResearchApp({
  turnstileSiteKey,
}: {
  turnstileSiteKey: string;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [today, setToday] = useState(todayInVienna);
  const [date, setDate] = useState(todayInVienna);
  const [selectedDay, setSelectedDay] = useState(() =>
    dateKey(todayInVienna()),
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState<View>("month");
  const [section, setSection] = useState<Section>("calendar");
  const [types, setTypes] = useState<ItemType[]>([
    "task",
    "meeting",
    "milestone",
  ]);
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Item | null>(null);
  const [panel, setPanel] = useState<"invite" | "profile" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [issuedReset, setIssuedReset] = useState<{
    memberId: string;
    code: string;
  } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const sequence = useRef(0);
  const mutating = useRef(false);
  const load = useCallback(async () => {
    if (mutating.current) return;
    const requestId = ++sequence.current;
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = (await response.json()) as Snapshot & { error: string };
      if (!response.ok) throw new Error(result.error);
      if (requestId === sequence.current) {
        setSnapshot(result);
        setError("");
      }
    } catch (cause) {
      if (requestId === sequence.current) setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!snapshot?.group) return;
    const refresh = () => {
      setToday(todayInVienna());
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [snapshot?.group, load]);
  useEffect(() => {
    if (!snapshot?.user) {
      setSkipOnboarding(false);
    }
  }, [snapshot?.user]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const data = snapshot ?? EMPTY_SNAPSHOT;
  const me = data.members.find(
    (member) => member.id === snapshot?.user?.userId,
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        editor ||
        importOpen ||
        panel ||
        !me
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      setEditor(
        newItem(me.id, selectedDay, SECTION_TYPES[section] ?? "task", view),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, importOpen, panel, me, section, selectedDay, view]);
  const activeMembers = data.members.filter((member) => member.active);
  const todayKey = dateKey(today);
  const [rangeStart, rangeEnd] = periodRange(date, view);
  const filtered = data.items.filter(
    (item) =>
      types.includes(item.type) &&
      (owner === "all" || item.ownerId === owner) &&
      matchesSearch(item, data.members, search),
  );
  const sectionType = SECTION_TYPES[section];
  const byDateTime = (a: Item, b: Item) =>
    `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
  const searchResults = filtered
    .filter((item) => !sectionType || item.type === sectionType)
    .sort(byDateTime);
  const inPeriod = filtered.filter(
    (item) => overlapsDates(item, rangeStart, rangeEnd),
  );
  const sectionItems = inPeriod
    .filter((item) => item.type === sectionType)
    .sort(byDateTime);
  const tasks = inPeriod.filter((item) => item.type === "task");
  const meetings = inPeriod.filter((item) => item.type === "meeting");
  const milestones = inPeriod.filter((item) => item.type === "milestone");
  const completed = tasks.filter((item) => item.status === "done").length;
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;
  const selectedItems = filtered
    .filter((item) => overlapsDates(item, selectedDay))
    .sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = filtered
    .filter(
      (item) =>
        item.type === "milestone" &&
        item.date >= todayKey &&
        item.status !== "done",
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const periodLabel =
    view === "year"
      ? `${date.getFullYear()}`
      : view === "quarter"
        ? `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
        : view === "week"
          ? `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}, ${date.getFullYear()}`
          : date.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            });
  const memberById = new Map(data.members.map((member) => [member.id, member]));
  const ownerColor = (ownerId: string): MemberColor =>
    memberById.get(ownerId)?.color ?? "blue";
  const ownerName = (ownerId: string) => memberById.get(ownerId)?.name;
  const mutate: Mutate = async (command, message = "Saved") => {
    if (mutating.current) return false;
    mutating.current = true;
    sequence.current++;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as Snapshot & {
        error: string;
        resetCode?: string;
        notice?: string;
      };
      if (!response.ok) throw new Error(result.error);
      const { resetCode, ...next } = result;
      setSnapshot(next);
      if (resetCode)
        setIssuedReset({ memberId: String(command.id), code: resetCode });
      if (result.notice || message) setToast(result.notice || message);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
      mutating.current = false;
    }
  };
  const createItem = (
    day = selectedDay,
    type: ItemType = SECTION_TYPES[section] ?? "task",
  ) => {
    if (me) setEditor(newItem(me.id, day, type, view));
  };
  // Omitting repeat keeps the item's series as it is.
  const saveItem = (item: Item, repeat?: Repeat | null) => {
    const { id, ...rest } = item;
    return mutate({ action: "saveItem", item: id ? item : rest, repeat });
  };
  const toggleDone = (item: Item) =>
    saveItem({ ...item, status: item.status === "done" ? "todo" : "done" });
  const changeSection = (next: Section) => {
    setSection(next);
    setMenuOpen(false);
  };
  const toggleType = (type: ItemType) =>
    setTypes((current) =>
      current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type],
    );
  const goToday = () => {
    const value = todayInVienna();
    setDate(value);
    setToday(value);
    setSelectedDay(dateKey(value));
  };
  const copyCode = async (code: string, copied: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setToast(copied);
    } catch {
      // The browser refuses clipboard access without permission or focus.
      setError("Failed to copy. Please copy the code manually.");
    }
  };
  const navButton = (key: Section, Icon: typeof Users) => (
    <button
      key={key}
      aria-label={TITLES[key]}
      title={TITLES[key]}
      className={section === key ? "nav-item active" : "nav-item"}
      onClick={() => changeSection(key)}
    >
      <Icon size={18} strokeWidth={1.7} />
      <span>{TITLES[key]}</span>
      {key === "members" && <small>{activeMembers.length}</small>}
      {(key === "tasks" || key === "milestones") && (
        <small>
          {
            data.items.filter(
              (item) =>
                item.type === SECTION_TYPES[key] && item.status !== "done",
            ).length
          }
        </small>
      )}
    </button>
  );
  return (
    <FeedbackContext.Provider value={error}>
      <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
        {menuOpen && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <button
            className="sidebar-collapse icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <a href="/" className="brand">
            <span className="brand-mark">
              <img src="/logo.png?v=2" alt="Lab of Time" />
            </span>
            <span>Lab of Time</span>
          </a>
          <nav aria-label="Main navigation">
            {(
              [
                ["calendar", CalendarDays],
                ["tasks", CheckSquare],
                ["meetings", Video],
                ["milestones", Flag],
              ] as const
            ).map(([key, Icon]) => navButton(key, Icon))}
          </nav>
          <nav className="sidebar-members" aria-label="Lab members">
            {navButton("members", Users)}
          </nav>
          <div className="sidebar-bottom">
            {me ? (
              <button
                className="profile-button"
                onClick={() => setPanel("profile")}
              >
                <Avatar member={me} />
                <span>
                  <strong>{me.name}</strong>
                  <small>{ROLE_LABELS[me.role]}</small>
                </span>
                <Settings2 size={16} />
              </button>
            ) : snapshot?.user ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  className="profile-button"
                  title="Create a lab"
                  onClick={() => setSkipOnboarding(false)}
                >
                  <span
                    className="avatar avatar-blue avatar-small"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Plus size={14} />
                  </span>
                  <span>
                    <strong>{snapshot.user.displayName}</strong>
                    <small
                      style={{
                        color: "var(--accent, #0070f3)",
                        fontWeight: 600,
                      }}
                    >
                      Create lab
                    </small>
                  </span>
                </button>
                <button
                  className="text-button"
                  style={{
                    fontSize: 11,
                    alignSelf: "flex-start",
                    padding: "2px 6px",
                  }}
                  onClick={() =>
                    void mutate({ action: "signOut" }, "Signed out")
                  }
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </aside>
        <main className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={19} />
              </button>
              {data.group && (
                <LabName
                  name={data.group.name}
                  canRename={me?.role === "owner"}
                  onRename={(name) =>
                    mutate({ action: "renameGroup", name }, "Lab renamed")
                  }
                />
              )}
            </div>
            <div className="topbar-right">
              <span className="sync-state">
                <span className="sync-dot" />
                {loading ? "Connecting" : error ? "Sync error" : "Synced"}
              </span>
              <MemberAvatars members={activeMembers} />
              <button
                className="icon-button invite-members-button"
                aria-label="Invite members"
                onClick={() => setPanel("invite")}
              >
                <UserRoundPlus size={18} aria-hidden="true" />
                <span className="invite-members-tooltip" aria-hidden="true">
                  Invite members
                </span>
              </button>
            </div>
          </header>
          <div className="content">
            {error && (
              <div className="error-banner" role="alert">
                <Info size={17} />
                <span>{error}</span>
                <button onClick={() => void load()}>Retry</button>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {section !== "members" && (
              <div className="stats-grid">
                <Stat
                  title={`${VIEWS[view]} Tasks`}
                  value={tasks.length}
                  detail={`${tasks.filter((item) => item.status === "doing").length} in progress`}
                  icon={<CheckSquare size={18} />}
                />
                <Stat
                  title="Completion"
                  value={`${progress}%`}
                  detail={`${completed} / ${tasks.length} done`}
                  icon={<CheckCheck size={18} />}
                  progress={progress}
                />
                <Stat
                  title="Meetings"
                  value={meetings.length}
                  detail={`${meetings.filter((item) => item.date >= todayKey).length} upcoming`}
                  icon={<Video size={18} />}
                />
                <Stat
                  title="Open Milestones"
                  value={
                    milestones.filter((item) => item.status !== "done").length
                  }
                  detail={`${milestones.length} total in ${view}`}
                  icon={<Flag size={18} />}
                />
              </div>
            )}
            {section !== "members" ? (
              <div className="workspace-content">
                <section className="calendar-card">
                  <div className="calendar-toolbar">
                    <div className="date-navigation">
                      <h2>{periodLabel}</h2>
                      <div className="nav-arrows">
                        <button
                          className="icon-button"
                          aria-label="Previous period"
                          onClick={() => setDate(navigateDate(date, view, -1))}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button className="today-button" onClick={goToday}>
                          Today
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Next period"
                          onClick={() => setDate(navigateDate(date, view, 1))}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="view-switch" aria-label="Calendar view">
                      {Object.entries(VIEWS).map(([key, label]) => (
                        <button
                          aria-pressed={view === key}
                          key={key}
                          className={view === key ? "active" : ""}
                          onClick={() => setView(key as View)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-toolbar">
                    <label className="member-filter">
                      <Users size={14} />
                      <select
                        aria-label="Filter by member"
                        value={owner}
                        onChange={(event) => setOwner(event.target.value)}
                      >
                        <option value="all">All members</option>
                        {data.members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                            {!member.active ? " (Inactive)" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} />
                    </label>
                    <div className="spacer" />
                    <label className="search-box">
                      <Search size={15} />
                      <input
                        aria-label="Search items"
                        placeholder="Search all dates…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          className="icon-button"
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Refresh data"
                      title="Refresh data"
                      disabled={busy || loading}
                      onClick={() => {
                        void load();
                      }}
                    >
                      <RefreshCw size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Import calendar"
                      title="Import calendar"
                      onClick={() => setImportOpen(true)}
                    >
                      <CalendarArrowDown size={16} />
                    </button>
                    {importOpen && (
                      <CalendarImport
                        onClose={() => setImportOpen(false)}
                        items={data.items}
                        subscriptions={data.subscriptions}
                        memberId={me?.id || ""}
                        onCommand={mutate}
                      />
                    )}
                    <button
                      className="icon-button"
                      aria-label="Export current period as ICS"
                      title="Export calendar (.ics)"
                      onClick={() => {
                        exportCalendar(inPeriod);
                        setToast("Calendar exported (.ics)");
                      }}
                    >
                      <ArrowUpFromLine size={16} />
                    </button>
                  </div>
                  {search.trim() ? (
                    <div className="search-results">
                      <div className="search-results-heading">
                        <span role="status">
                          {searchResults.length} results · All dates
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setSearch("")}
                        >
                          Back to calendar
                        </button>
                      </div>
                      {searchResults.map((item) => (
                        <button
                          className={`search-result color-${ownerColor(item.ownerId)}`}
                          key={item.id}
                          onClick={() => {
                            setDate(parseDate(item.date));
                            setSelectedDay(item.date);
                            setEditor(item);
                          }}
                        >
                          <span className={`type-symbol ${item.type}`} />
                          <div>
                            <strong>{item.title}</strong>
                            <span>
                              {TYPE_LABELS[item.type]} · {item.date} ·{" "}
                              {itemTimeLabel(item)} ·{" "}
                              {ownerName(item.ownerId)}
                            </span>
                            <p>{item.description || item.location}</p>
                          </div>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                      {!searchResults.length && (
                        <div className="empty-state">
                          <Search size={24} />
                          <h3>No matching items</h3>
                          <p>
                            Try another keyword, or adjust member and type
                            filters.
                          </p>
                          <button
                            className="button"
                            onClick={() => {
                              setOwner("all");
                              setTypes(["task", "meeting", "milestone"]);
                            }}
                          >
                            Clear member & type filters
                          </button>
                        </div>
                      )}
                    </div>
                  ) : section === "calendar" ? (
                    <Calendar
                      date={date}
                      view={view}
                      items={filtered}
                      members={data.members}
                      selected={selectedDay}
                      today={todayKey}
                      onDay={setSelectedDay}
                      onSelect={setEditor}
                      canComplete={(item) => !busy && !!me && canEdit(me, item)}
                      onToggleDone={toggleDone}
                      onAdd={createItem}
                      onMonth={(value) => {
                        setDate(value);
                        setView("month");
                      }}
                    />
                  ) : section === "tasks" || section === "milestones" ? (
                    <div className="task-view">
                      <div className="task-list">
                        {sectionItems.map((item) => {
                          const assignee = memberById.get(item.ownerId);
                          return (
                            <div
                              className={`task-row color-${ownerColor(item.ownerId)}`}
                              key={item.id}
                            >
                              <button
                                aria-label={`${item.status === "done" ? "Reopen" : "Complete"} ${item.title}`}
                                className={`task-check ${item.status === "done" ? "checked" : ""}`}
                                disabled={busy || !me || !canEdit(me, item)}
                                onClick={() => void toggleDone(item)}
                              >
                                {item.status === "done" ? (
                                  <Check size={14} />
                                ) : (
                                  <Circle size={18} />
                                )}
                              </button>
                              <button
                                className="task-name"
                                onClick={() => setEditor(item)}
                              >
                                <strong
                                  className={
                                    item.status === "done" ? "strike" : ""
                                  }
                                >
                                  {item.title}
                                </strong>
                                <span>
                                  {CYCLE_LABELS[item.cycle]} · Due {item.date}
                                </span>
                              </button>
                              <span className={`status-tag ${item.status}`}>
                                {STATUS_LABELS[item.status]}
                              </span>
                              {assignee && <Avatar member={assignee} small />}
                            </div>
                          );
                        })}
                        {sectionItems.length === 0 &&
                          (section === "tasks" ? (
                            <Empty
                              icon={<CheckSquare size={27} />}
                              title="No tasks in this period"
                              description="Create a task or adjust your filters."
                              onAction={() => createItem()}
                            />
                          ) : (
                            <Empty
                              icon={<Flag size={27} />}
                              title="No milestones in this period"
                              description="Add a milestone or adjust your filters."
                              onAction={() => createItem(selectedDay, "milestone")}
                            />
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="meeting-list">
                      {sectionItems.map((item) => (
                          <button
                            className={`meeting-card color-${ownerColor(item.ownerId)}`}
                            key={item.id}
                            onClick={() => setEditor(item)}
                          >
                            <div className="meeting-date">
                              <span>{shortMonth(item.date)}</span>
                              <strong>{Number(item.date.slice(8))}</strong>
                            </div>
                            <div>
                              <span className="meeting-time">
                                <Clock3 size={13} />
                                {itemTimeLabel(item)}
                              </span>
                              <h3>{item.title}</h3>
                              <p>
                                {item.location || "TBD"} ·{" "}
                                {
                                  data.attendance.filter(
                                    (r) =>
                                      r.itemId === item.id &&
                                      r.response === "yes",
                                  ).length
                                }{" "}
                                attending
                              </p>
                            </div>
                            <ArrowUpRight size={18} />
                          </button>
                        ))}
                      {sectionItems.length === 0 && (
                        <Empty
                          icon={<Video size={27} />}
                          title="No meetings scheduled"
                          description="Schedule a meeting for this period."
                          onAction={() => createItem(selectedDay, "meeting")}
                        />
                      )}
                    </div>
                  )}
                  {section === "calendar" && (
                    <div className="calendar-footer">
                      <div>
                        {Object.entries(TYPE_LABELS).map(([type, label]) => (
                          <button
                            key={type}
                            className="type-filter"
                            aria-pressed={types.includes(type as ItemType)}
                            onClick={() => toggleType(type as ItemType)}
                          >
                            <i className={`type-symbol ${type}`} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
                <aside className="agenda">
                  <div className="agenda-head">
                    <div>
                      <h2>
                        {selectedDay === todayKey
                          ? "Today"
                          : shortDate(selectedDay)}
                      </h2>
                      <p className="agenda-summary">
                        {parseDate(selectedDay).toLocaleDateString("en-US", {
                          weekday: "long",
                        })}
                      </p>
                    </div>
                    <span className="agenda-date">
                      {Number(selectedDay.slice(8))}
                    </span>
                  </div>
                  <div className="agenda-items">
                    {selectedItems.map((item) => (
                      <button
                        key={item.id}
                        className={`agenda-item ${item.type} color-${ownerColor(item.ownerId)}`}
                        onClick={() => setEditor(item)}
                      >
                        <span className="agenda-time">
                          {itemTimeLabel(item)}
                          <span className="type-symbol" />
                        </span>
                        <strong>{item.title}</strong>
                        <span className="agenda-item-meta">
                          {item.type === "meeting" ? (
                            <Video size={12} />
                          ) : item.type === "milestone" ? (
                            <Flag size={12} />
                          ) : (
                            <CheckSquare size={12} />
                          )}
                          {item.location || ownerName(item.ownerId)}
                          <span className="agenda-status">
                            {STATUS_LABELS[item.status]}
                          </span>
                        </span>
                      </button>
                    ))}
                    {selectedItems.length === 0 && (
                      <div className="empty-day">
                        <CalendarDays size={26} strokeWidth={1.2} />
                        <p>No items scheduled</p>
                      </div>
                    )}
                  </div>
                  <button
                    className="add-day"
                    onClick={() => createItem(selectedDay)}
                  >
                    <Plus size={14} />
                    Add item
                  </button>
                  <div className="agenda-divider" />
                  <div className="section-row">
                    <h3>Upcoming Milestones</h3>
                    <Flag size={14} />
                  </div>
                  <div className="milestone-list">
                    {upcoming.map((item) => (
                      <button
                        key={item.id}
                        className={`color-${ownerColor(item.ownerId)}`}
                        onClick={() => setEditor(item)}
                      >
                        <span className="milestone-month">
                          {shortMonth(item.date)}
                          <strong>{Number(item.date.slice(8))}</strong>
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {ownerName(item.ownerId)}{" "}
                            · {CYCLE_LABELS[item.cycle]}
                          </small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                    {upcoming.length === 0 && (
                      <p className="muted">No upcoming milestones</p>
                    )}
                  </div>
                </aside>
              </div>
            ) : (
              <Members
                data={data}
                me={me}
                busy={busy}
                mutate={mutate}
                onProfile={() => setPanel("profile")}
              />
            )}
          </div>
        </main>
        {editor && (
          <ItemEditor
            key={editor.id || "new"}
            item={editor}
            members={data.members}
            me={me}
            attendance={data.attendance}
            busy={busy}
            onSave={saveItem}
            onDelete={(item) =>
              mutate(
                { action: "deleteItem", id: item.id, version: item.version },
                "Item deleted",
              )
            }
            onRsvp={(id, response) =>
              mutate(
                { action: "rsvp", id, response },
                response === "yes"
                  ? "Marked as attending"
                  : "Attendance withdrawn",
              )
            }
            onClose={() => setEditor(null)}
          />
        )}
        {panel === "invite" && (
          <Dialog title="Invite Members" onClose={() => setPanel(null)}>
            {data.group?.inviteCode ? (
              <div className="invite-dialog">
                <p>
                  Share this invite code with lab members so they can join or
                  sign in to {data.group.name}.
                </p>
                <div className="invite-code">
                  <code>{data.group.inviteCode}</code>
                  <button
                    className="icon-button"
                    onClick={() =>
                      void copyCode(data.group!.inviteCode!, "Invite code copied")
                    }
                    aria-label="Copy invite code"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate({ action: "rotateInvite" }, "Invite code reset")
                  }
                >
                  <RefreshCw size={14} />
                  Reset invite code
                </button>
              </div>
            ) : (
              <p className="dialog-copy">
                Ask the group owner or an admin for the invite code.
              </p>
            )}
          </Dialog>
        )}
        {panel === "profile" && me && (
          <Profile
            member={me}
            busy={busy}
            mutate={mutate}
            onClose={() => setPanel(null)}
          />
        )}
        {issuedReset && (
          <Dialog
            title="Password reset code"
            onClose={() => setIssuedReset(null)}
          >
            <div className="invite-dialog">
              <p>
                Give this one-time code to{" "}
                {memberById.get(issuedReset.memberId)?.name ?? "the member"}{" "}
                in person or via a trusted channel. It expires in 24 hours and
                is shown only once. They can use it from “Forgot password?” on
                the sign-in screen.
              </p>
              <div className="invite-code">
                <code>{issuedReset.code}</code>
                <button
                  className="icon-button"
                  aria-label="Copy reset code"
                  onClick={() =>
                    void copyCode(issuedReset.code, "Reset code copied")
                  }
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
          </Dialog>
        )}
        {!loading && !snapshot?.group && !skipOnboarding && (
          <Onboarding
            account={snapshot?.user ?? null}
            turnstileSiteKey={turnstileSiteKey}
            busy={busy}
            error={error}
            onSubmit={mutate}
            onSkip={() => setSkipOnboarding(true)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
        {error && (editor || panel) && (
          <div className="dialog-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
/** Owners rename the lab in place: double-click (or Enter) to edit, Enter or blur saves, Escape cancels. */
function LabName({
  name,
  canRename,
  onRename,
}: {
  name: string;
  canRename: boolean;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  if (!canRename) return <span className="lab-name">{name}</span>;
  if (draft === null)
    return (
      <button
        type="button"
        className="lab-name"
        title="Double-click to rename"
        onDoubleClick={() => setDraft(name)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          setDraft(name);
        }}
      >
        {name}
      </button>
    );
  const finish = async () => {
    const next = draft.trim();
    if (cancelled.current || !next || next === name) {
      cancelled.current = false;
      setDraft(null);
    } else if (await onRename(next)) setDraft(null);
  };
  return (
    <input
      className="lab-name-input"
      aria-label="Lab name"
      autoFocus
      maxLength={100}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => void finish()}
      onKeyDown={(event) => {
        if (event.key === "Escape") cancelled.current = true;
        if (event.key === "Enter" || event.key === "Escape")
          event.currentTarget.blur();
      }}
    />
  );
}
function Stat({
  title,
  value,
  detail,
  icon,
  progress,
}: {
  title: string;
  value: number | string;
  detail: string;
  icon: React.ReactNode;
  progress?: number;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-number">{value}</div>
      <div className="stat-bottom">
        <span>{detail}</span>
        {progress !== undefined && (
          <div className="progress-bar">
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}
function Empty({
  icon,
  title,
  description,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="button" onClick={onAction}>
        <Plus size={15} />
        New Item
      </button>
    </div>
  );
}
