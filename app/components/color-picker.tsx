"use client";
import { Check } from "lucide-react";
import { MEMBER_COLORS, type MemberColor } from "@/lib/model";

export default function ColorPicker({
  value,
  onChange,
}: {
  value: MemberColor;
  onChange: (color: MemberColor) => void;
}) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Member color">
      {(Object.entries(MEMBER_COLORS) as [MemberColor, string][]).map(
        ([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={label}
            title={label}
            className={`color-swatch color-${key} ${value === key ? "selected" : ""}`}
            onClick={() => onChange(key)}
          >
            {value === key && <Check size={13} />}
          </button>
        ),
      )}
    </div>
  );
}
