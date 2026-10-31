"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// Your publisher ID, e.g. ca-pub-1234567890123456 (set in .env.local)
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

// In AdSense: Ads > By ad unit > Display ads. Create one unit per slot,
// then paste each numeric ad slot ID here. "0000000000" = not set yet.
const SLOT_IDS: Record<string, string> = {
  "top-banner": "0000000000",
  "left-sidebar": "0000000000",
  "below-upload": "0000000000",
  "mid-rectangle": "0000000000",
  "pre-faq-banner": "0000000000",
  "right-sidebar": "0000000000",
  "footer-banner": "0000000000",
  "mobile-anchor": "0000000000",
};

type Props = {
  name: string; // must match a key in SLOT_IDS
  w: number;
  h: number;
  className?: string;
  fixed?: boolean; // true = exact size (sidebars, mobile bar); false = responsive
  minViewport?: number; // only show at or above this screen width (px)
  maxViewport?: number; // only show below this screen width (px)
};

export default function AdSlot({ name, w, h, className = "", fixed = false, minViewport, maxViewport }: Props) {
  const pushed = useRef(false);
  const [visible, setVisible] = useState(false);

  const slotId = SLOT_IDS[name];
  const live = Boolean(CLIENT) && Boolean(slotId) && slotId !== "0000000000";

  // Only render (and request) ads that are actually visible on this screen
  useEffect(() => {
    const vw = window.innerWidth;
    setVisible((minViewport === undefined || vw >= minViewport) && (maxViewport === undefined || vw < maxViewport));
  }, [minViewport, maxViewport]);

  useEffect(() => {
    if (!visible || !live || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense error", e);
    }
  }, [visible, live]);

  if (!visible) return null;

  return (
    <aside aria-label="Advertisement" data-ad-slot={name} className={`mx-auto w-full ${className}`} style={{ maxWidth: w }}>
      <p className="mb-1 text-xs text-gray-400">Advertisement</p>
      {live ? (
        <ins
          className="adsbygoogle"
          style={fixed ? { display: "inline-block", width: w, height: h } : { display: "block", minHeight: h }}
          data-ad-client={CLIENT}
          data-ad-slot={slotId}
          {...(fixed ? {} : { "data-ad-format": "auto", "data-full-width-responsive": "true" })}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded border border-dashed border-gray-300 bg-gray-100 text-xs text-gray-400"
          style={{ minHeight: h }}
        >
          {w}×{h}
        </div>
      )}
    </aside>
  );
}