"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Member } from "@/lib/model";
import { Avatar } from "./calendar";

export default function MemberAvatars({ members }: { members: Member[] }) {
  const remaining = members.slice(4);
  return (
    <div className="avatar-stack">
      {members.slice(0, 4).map((member) => (
        <Avatar member={member} small key={member.id} />
      ))}
      {remaining.length > 0 && <RemainingMembers members={remaining} />}
    </div>
  );
}

function RemainingMembers({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (root.current?.contains(document.activeElement)) trigger.current?.focus();
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="member-overflow"
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        const focused = document.activeElement;
        if (!(event.currentTarget.contains(focused) && focused?.matches(":focus-visible"))) {
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="avatar small member-overflow-trigger"
        aria-label={`View ${members.length} more members`}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="member-overflow-panel" id={panelId}>
          <div className="member-overflow-card">
            <p>More members ({members.length})</p>
            <ul tabIndex={0} aria-label="More members">
              {members.map((member) => (
                <li key={member.id}>
                  <Avatar member={member} small />
                  <span>{member.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
