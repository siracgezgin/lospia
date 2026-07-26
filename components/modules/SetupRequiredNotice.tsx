"use client";

import { useState } from "react";
import { DatabaseZap, ChevronDown } from "lucide-react";

interface Props {
  /** Friendly Turkish explanation of what is being awaited. */
  message: string;
  /** Optional short title override. */
  title?: string;
  /** Raw technical detail — shown only in a collapsible note for admins. */
  technicalDetail?: string | null;
  /** "banner" = compact inline strip; "block" = larger standalone card. */
  variant?: "banner" | "block";
}

/**
 * A calm, professional "veritabanı güncellemesi bekleniyor" notice. Replaces raw
 * PostgREST errors in the module UI. The raw English detail is tucked into a
 * collapsible note (admin-only surfaces render this), never shown up front.
 */
export function SetupRequiredNotice({
  message,
  title = "Veritabanı güncellemesi bekleniyor",
  technicalDetail,
  variant = "banner",
}: Props) {
  const [showDetail, setShowDetail] = useState(false);

  const isBlock = variant === "block";

  return (
    <div
      className={
        "anim-fade-down flex items-start gap-2.5 rounded-xl border border-[#e7d3ab] bg-[#fbf3e3] text-[#7a561c]" +
        (isBlock ? " px-5 py-4" : " px-4 py-3")
      }
    >
      <DatabaseZap size={16} className="mt-0.5 shrink-0 text-[#a05f1c]" />
      <div className="min-w-0">
        <p className={"font-semibold text-[#7a561c]" + (isBlock ? " text-[14px]" : " text-[13px]")}>
          {title}
        </p>
        <p className={"mt-0.5 leading-relaxed" + (isBlock ? " text-[13px]" : " text-[12.5px]")}>
          {message}
        </p>

        {technicalDetail && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDetail((s) => !s)}
              aria-expanded={showDetail}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#a05f1c] transition-colors duration-150 hover:text-[#7a561c]"
            >
              <ChevronDown
                size={12}
                className={"transition-transform duration-200 ease-standard" + (showDetail ? " rotate-180" : "")}
              />
              Teknik detay
            </button>
            {showDetail && (
              <p className="anim-fade-down mt-1 break-words rounded-md bg-[#f4e6c9] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-[#7a561c]">
                {technicalDetail}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
