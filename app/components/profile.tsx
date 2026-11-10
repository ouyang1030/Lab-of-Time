"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import type { Member, Mutate } from "@/lib/model";
import ColorPicker from "./color-picker";
import Dialog from "./dialog";

export default function Profile({
  member,
  busy,
  mutate,
  onClose,
}: {
  member: Member;
  busy: boolean;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [emailPassword, setEmailPassword] = useState("");
  // A blank field keeps the current sign-in email.
  const newEmail = email.trim().toLowerCase();
  const emailChanged = !!newEmail && newEmail !== member.email;
  const [color, setColor] = useState(member.color);
  const [currPassword, setCurrPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showSecurity, setShowSecurity] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Dialog title="Profile" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await mutate({
            action: "profile",
            name,
            color,
            ...(emailChanged ? { email: newEmail, current: emailPassword } : {}),
          });
          if (saved) onClose();
        }}
      >
        <label className="field">
          Name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Email
          <input
            type="email"
            maxLength={100}
            placeholder="e.g., alex@university.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {emailChanged && (
          <label className="field">
            Current password (required to change email)
            <input
              type="password"
              autoComplete="current-password"
              required
              value={emailPassword}
              onChange={(event) => setEmailPassword(event.target.value)}
            />
          </label>
        )}
        <div className="field">
          <span>Color</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="sidebar-divider" style={{ margin: "20px 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 12 }}>Account Security</strong>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowSecurity(!showSecurity)}
          >
            {showSecurity ? "Hide" : "Manage"}
          </button>
        </div>
        {showSecurity && (
          <div
            style={{
              display: "grid",
              gap: 14,
              background: "#fafafa",
              padding: 14,
              borderRadius: 8,
              marginBottom: 18,
            }}
          >
            <div>
              <strong
                style={{ display: "block", fontSize: 11, marginBottom: 8 }}
              >
                Change password
              </strong>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={currPassword}
                  onChange={(e) => setCurrPassword(e.target.value)}
                  style={{
                    fontSize: 11,
                    padding: "8px 10px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                  }}
                />
                <input
                  type="password"
                  placeholder="New password (min 12 chars)"
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    fontSize: 11,
                    padding: "8px 10px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                  }}
                />
                <button
                  type="button"
                  className="button"
                  disabled={busy || !currPassword || newPassword.length < 12}
                  onClick={async () => {
                    const ok = await mutate(
                      {
                        action: "changePassword",
                        current: currPassword,
                        password: newPassword,
                      },
                      "Password changed",
                    );
                    if (ok) {
                      setCurrPassword("");
                      setNewPassword("");
                    }
                  }}
                >
                  Update password
                </button>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                borderTop: "1px solid #eee",
                paddingTop: 12,
              }}
            >
              {!confirmDelete ? (
                <button
                  type="button"
                  className="button danger-text"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete account
                </button>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    type="password"
                    placeholder="Enter password to confirm"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    style={{
                      fontSize: 11,
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="button"
                      style={{ background: "#b91c1c", color: "#fff" }}
                      disabled={busy || !deletePassword}
                      onClick={async () => {
                        const ok = await mutate(
                          { action: "deleteAccount", current: deletePassword },
                          "Account deleted",
                        );
                        if (ok) onClose();
                      }}
                    >
                      Permanently delete
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <p style={{ fontSize: 10, color: "#888", margin: 0 }}>
                Permanently removes your account and calendar data. Owners must
                transfer ownership first.
              </p>
            </div>
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (await mutate({ action: "signOut" }, "")) onClose();
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
          <div className="spacer" />
          <button className="button primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
