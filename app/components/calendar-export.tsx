"use client";
import { useState } from "react";
import { CircleHelp, Copy, Download, Link2Off, RefreshCw } from "lucide-react";
import ActionMenu from "./action-menu";
import Dialog from "./dialog";
import { exportCalendar } from "@/lib/ics";
import { FEED_HISTORY_DAYS } from "@/lib/calendar-feed";
import { FEED_SCOPES, FEED_SCOPE_LABELS, type FeedScope, type Item, type Mutate, type Snapshot } from "@/lib/model";

const SCOPE_HINTS: Record<FeedScope, string> = {
  mine: "Items assigned to you and meetings you attend",
  lab: "Everything on the lab calendar",
};

export default function CalendarExport({
  feed,
  feedToken,
  periodItems,
  periodLabel,
  busy,
  onCommand,
  onCopy,
  onDownloaded,
  onClose,
}: {
  feed: Snapshot["calendarFeed"];
  /** Set only right after this member created a link. */
  feedToken: string;
  periodItems: Item[];
  periodLabel: string;
  busy: boolean;
  onCommand: Mutate;
  onCopy: (text: string, copied: string) => Promise<void>;
  onDownloaded: () => void;
  onClose: () => void;
}) {
  // Before a link exists the choice is local; afterwards the saved scope is the only source.
  const [draftScope, setDraftScope] = useState<FeedScope>("mine");
  const [confirm, setConfirm] = useState<"replace" | "delete" | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const scope = feed?.scope ?? draftScope;
  const link = feedToken ? `${window.location.origin}/api/calendar/${feedToken}.ics` : "";
  const webcal = link.replace(/^https?:/, "webcal:");
  return (
    <Dialog
      title="Subscribe or export"
      onClose={onClose}
      head={
        <div className="dialog-title-row">
          <h2>Subscribe or export</h2>
          <button
            className="icon-button"
            aria-label="How to subscribe"
            title="How to subscribe"
            aria-expanded={helpOpen}
            aria-controls="calendar-export-help"
            onClick={() => setHelpOpen((open) => !open)}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      }
    >
      <div className="calendar-export">
        <div id="calendar-export-help" className="calendar-export-help" hidden={!helpOpen}>
          <p>Subscribe once and later changes arrive by themselves. Subscriptions are read-only.</p>
          <ul>
            <li><strong>Apple Calendar</strong>: Open in Apple Calendar, or File → New Calendar Subscription and paste the link.</li>
            <li><strong>Google Calendar</strong>: Add to Google Calendar, or Other calendars → + → From URL. Updates can take up to a day.</li>
            <li><strong>Outlook</strong>: Add calendar → Subscribe from web, then paste the link.</li>
          </ul>
          <p>
            Includes items from the past {FEED_HISTORY_DAYS} days onward. Events you imported from other calendars are
            left out so they do not appear twice.
          </p>
          <p>
            The link is shown only once, and anyone with it can read these items. Need it again? Create a new link; the
            old one stops working.
          </p>
          <p>Download saves the current period with your filters as a one-time file that does not update.</p>
        </div>
        <section aria-labelledby="feed-heading">
          <h3 id="feed-heading">Subscribe</h3>
          <fieldset className="feed-scopes" aria-label="Subscription scope" disabled={busy}>
            {FEED_SCOPES.map((value) => (
              <label key={value} className="feed-scope">
                <input
                  type="radio"
                  name="feed-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() =>
                    feed
                      ? void onCommand({ action: "setCalendarFeedScope", scope: value }, "")
                      : setDraftScope(value)
                  }
                />
                <span>
                  <strong>{FEED_SCOPE_LABELS[value]}</strong>
                  <small>{SCOPE_HINTS[value]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {feed ? (
            <>
              {link && (
                <div className="invite-code">
                  <code>{link}</code>
                  <button
                    className="icon-button"
                    aria-label="Copy subscription link"
                    onClick={() => void onCopy(link, "Subscription link copied")}
                  >
                    <Copy size={18} />
                  </button>
                </div>
              )}
              <div className="calendar-export-status">
                <p className="dialog-copy" role="status">
                  {link
                    ? "Shown only once. Copy it now."
                    : `Link active since ${new Date(feed.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}`}
                </p>
                {confirm ? (
                  <span className="calendar-export-confirm">
                    <button className="text-button" onClick={() => setConfirm(null)}>Cancel</button>
                    <button
                      className="button primary"
                      autoFocus
                      disabled={busy}
                      onClick={async () => {
                        const done = confirm === "replace"
                          ? await onCommand({ action: "createCalendarFeed", scope }, "")
                          : await onCommand({ action: "deleteCalendarFeed" }, "");
                        if (done) setConfirm(null);
                      }}
                    >
                      {confirm === "replace" ? "Confirm new link" : "Confirm turn off"}
                    </button>
                  </span>
                ) : (
                  <ActionMenu
                    name="subscription link"
                    busy={busy}
                    actions={[
                      { label: "New link", icon: <RefreshCw size={14} />, onSelect: () => setConfirm("replace") },
                      { label: "Turn off", icon: <Link2Off size={14} />, danger: true, onSelect: () => setConfirm("delete") },
                    ]}
                  />
                )}
              </div>
              {link && (
                <div className="calendar-export-actions">
                  <a className="button primary" href={webcal}>Open in Apple Calendar</a>
                  <a
                    className="button"
                    href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Add to Google Calendar
                  </a>
                </div>
              )}
            </>
          ) : (
            <button
              className="button primary calendar-export-create"
              disabled={busy}
              onClick={() => void onCommand({ action: "createCalendarFeed", scope }, "")}
            >
              Create subscription link
            </button>
          )}
        </section>
        <section aria-labelledby="download-heading">
          <h3 id="download-heading">Download</h3>
          <button
            className="button"
            disabled={!periodItems.length}
            onClick={() => {
              exportCalendar(periodItems);
              onDownloaded();
            }}
          >
            <Download size={14} />
            Download {periodLabel} (.ics)
          </button>
        </section>
      </div>
    </Dialog>
  );
}
