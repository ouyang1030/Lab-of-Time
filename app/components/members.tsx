"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Crown, KeyRound, MoreHorizontal, Trash2 } from "lucide-react";
import { ROLE_LABELS, type Member, type Mutate, type Snapshot } from "@/lib/model";
import { Avatar } from "./calendar";
import Dialog from "./dialog";

export default function Members({
  data,
  me,
  busy,
  mutate,
  onProfile,
}: {
  data: Snapshot;
  me?: Member;
  busy: boolean;
  mutate: Mutate;
  onProfile: () => void;
}) {
  const [confirmId, setConfirmId] = useState("");
  const [confirmation, setConfirmation] = useState<
    { action: "removeMember" | "transferOwnership"; member: Member } | { action: "leaveGroup" } | null
  >(null);
  const [transferReady, setTransferReady] = useState(false);
  const closeConfirmation = () => {
    if (!busy) {
      setConfirmation(null);
      setTransferReady(false);
    }
  };
  const [dissolving, setDissolving] = useState(false);
  return (
    <section className="members-section">
      {confirmation && data.group && (
        <Dialog
          title={confirmation.action === "leaveGroup" ? "Leave lab" : confirmation.action === "removeMember" ? "Remove from lab" : "Transfer ownership"}
          onClose={closeConfirmation}
        >
          <p className="dissolve-warning">
            {confirmation.action === "leaveGroup" ? (
              <>Are you sure you want to leave <strong>{data.group.name}</strong>?
                Your account will remain active and you can join or create another lab.
                All your tasks, meetings and milestones, including completed items, will be transferred to the lab owner.
                Your meeting responses and calendar subscriptions will be removed.</>
            ) : confirmation.action === "removeMember" ? (
              <>Remove <strong>{confirmation.member.name}</strong> from <strong>{data.group.name}</strong>?
                Their account will remain active and they can join or create another lab.
                All their tasks, meetings and milestones, including completed items, will be transferred to you.
                Their meeting responses and calendar subscriptions will be removed. This cannot be undone.</>
            ) : transferReady ? (
              <>Confirm the transfer to <strong>{confirmation.member.name}</strong>.
                You will become an Admin and lose owner permissions. Only the new owner can transfer ownership back.</>
            ) : (
              <>Make <strong>{confirmation.member.name}</strong> the owner of <strong>{data.group.name}</strong>?
                They will manage members and have permission to dissolve the lab. You will become an Admin.</>
            )}
          </p>
          <div className="dialog-actions">
            <div className="spacer" />
            <button className="button" autoFocus disabled={busy} onClick={closeConfirmation}>Cancel</button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (confirmation.action === "transferOwnership" && !transferReady) {
                  setTransferReady(true);
                  return;
                }
                const command = confirmation.action === "leaveGroup"
                  ? { action: "leaveGroup" }
                  : { action: confirmation.action, id: confirmation.member.id };
                const message = confirmation.action === "leaveGroup" ? "You left the lab"
                  : confirmation.action === "removeMember" ? "Member removed; their items were transferred to you"
                  : "Ownership transferred. You are now an admin.";
                if (await mutate(command, message)) {
                  setConfirmation(null);
                  setTransferReady(false);
                }
              }}
            >
              {busy ? "Saving…" : confirmation.action === "leaveGroup" ? "Confirm & leave"
                : confirmation.action === "removeMember" ? "Remove member"
                : transferReady ? "Confirm transfer" : "Continue"}
            </button>
          </div>
        </Dialog>
      )}
      {dissolving && data.group && (
        <DissolveLab
          name={data.group.name}
          memberCount={data.members.length}
          busy={busy}
          onDissolve={(name) =>
            mutate({ action: "dissolveGroup", name }, "Lab dissolved")
          }
          onClose={() => setDissolving(false)}
        />
      )}
      <div className="member-grid">
        {data.members
          .filter((member) => member.active || me?.role === "owner")
          .map((member) => {
            const tasks = data.items.filter(
              (item) => item.ownerId === member.id && item.type === "task",
            );
            const isSelf = me?.id === member.id;
            const canManage = me?.role === "owner" && member.role !== "owner";
            return (
              <article className="member-card" key={member.id}>
                <div className="member-top">
                  <Avatar member={member} />
                  {isSelf && member.role === "owner" ? (
                    <OwnerBadge onDissolve={() => setDissolving(true)} />
                  ) : (
                    <span className="role-badge">
                      {member.active ? ROLE_LABELS[member.role] : "Inactive"}
                    </span>
                  )}
                </div>
                <h3>
                  {member.name}
                  {isSelf && <small>You</small>}
                </h3>
                <p>{member.email || "No email set"}</p>
                <div className="member-stats">
                  <div>
                    <strong>
                      {tasks.filter((item) => item.status !== "done").length}
                    </strong>
                    <span>Active tasks</span>
                  </div>
                  <div>
                    <strong>
                      {tasks.filter((item) => item.status === "done").length}
                    </strong>
                    <span>Completed</span>
                  </div>
                </div>
                {(isSelf || canManage) && (
                  <div className="member-actions">
                    {isSelf ? (
                      <>
                        <button className="text-button" onClick={onProfile}>
                          Edit profile <ArrowUpRight size={14} />
                        </button>
                        {member.role !== "owner" && (
                          <button className="text-button member-danger" disabled={busy} onClick={() => setConfirmation({ action: "leaveGroup" })}>
                            Leave lab
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="member-routine-actions">
                          <select
                            aria-label={`Role for ${member.name}`}
                            value={member.role}
                            disabled={busy}
                            onChange={(event) =>
                              void mutate(
                                {
                                  action: "role",
                                  id: member.id,
                                  role: event.target.value,
                                },
                                "Role updated",
                              )
                            }
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              if (!member.active) {
                                void mutate(
                                  {
                                    action: "role",
                                    id: member.id,
                                    role: member.role,
                                  },
                                  "Member restored",
                                );
                                return;
                              }
                              if (confirmId !== member.id) {
                                setConfirmId(member.id);
                                return;
                              }
                              void mutate(
                                { action: "deactivate", id: member.id },
                                "Member deactivated",
                              );
                              setConfirmId("");
                            }}
                          >
                            {member.active
                              ? confirmId === member.id
                                ? "Confirm"
                                : "Deactivate"
                              : "Restore"}
                          </button>
                        </div>
                        <MemberMenu
                          member={member}
                          busy={busy}
                          onReset={() => void mutate({ action: "issueReset", id: member.id }, "Reset code generated")}
                          onTransfer={() => {
                            setTransferReady(false);
                            setConfirmation({ action: "transferOwnership", member });
                          }}
                          onRemove={() => setConfirmation({ action: "removeMember", member })}
                        />
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
}
/** A menu button with arrow navigation, dismissal and focus restoration. */
function MemberMenu({ member, busy, onReset, onTransfer, onRemove }: {
  member: Member;
  busy: boolean;
  onReset: () => void;
  onTransfer: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (action: () => void) => {
    close();
    action();
  };
  return (
    <div className="member-menu-anchor" ref={anchor} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={`More actions for ${member.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      ><MoreHorizontal size={18} /></button>
      {open && (
        <div className="member-menu" id={menuId} role="menu" aria-label={`Actions for ${member.name}`} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const current = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
              : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
            options[next]?.focus();
          }
        }}>
          <button type="button" role="menuitem" tabIndex={-1} autoFocus disabled={busy} onClick={() => choose(onReset)}>
            <KeyRound size={14} /> Issue reset code
          </button>
          <button type="button" role="menuitem" tabIndex={-1} disabled={busy || !member.active} onClick={() => choose(onTransfer)}>
            <Crown size={14} /> Transfer ownership
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className="member-danger" disabled={busy} onClick={() => choose(onRemove)}>
            <Trash2 size={14} /> Remove from lab
          </button>
        </div>
      )}
    </div>
  );
}
/** The owner's own badge; right-click (or the context-menu key) opens lab actions. */
function OwnerBadge({ onDissolve }: { onDissolve: () => void }) {
  const [open, setOpen] = useState(false);
  const badge = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    badge.current?.focus();
  };
  return (
    <span className="badge-anchor">
      <button
        ref={badge}
        type="button"
        className="role-badge"
        title="Right-click for lab options"
        aria-haspopup="menu"
        aria-expanded={open}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
            return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {ROLE_LABELS.owner}
      </button>
      {open && (
        <div
          className="badge-menu"
          role="menu"
          onKeyDown={(event) => event.key === "Escape" && close()}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              onDissolve();
            }}
          >
            Dissolve lab…
          </button>
        </div>
      )}
    </span>
  );
}
function DissolveLab({
  name,
  memberCount,
  busy,
  onDissolve,
  onClose,
}: {
  name: string;
  memberCount: number;
  busy: boolean;
  onDissolve: (name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <Dialog title="Dissolve lab" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onDissolve(typed);
        }}
      >
        <p className="dissolve-warning">
          Dissolving <strong>{name}</strong> permanently deletes all of its
          items, meeting responses and calendar subscriptions. All{" "}
          {memberCount} {memberCount === 1 ? "member leaves" : "members leave"}{" "}
          the lab and can then create or join another one. This cannot be
          undone.
        </p>
        <label className="field">
          Type the lab name to confirm
          <input
            autoFocus
            autoComplete="off"
            maxLength={100}
            placeholder={name}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <div className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || typed.trim() !== name}
          >
            {busy ? "Dissolving…" : "Dissolve lab"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
