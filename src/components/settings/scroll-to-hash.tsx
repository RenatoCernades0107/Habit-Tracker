"use client";

import { useEffect } from "react";

/**
 * Scrolls to the section named in the URL (e.g. /settings#notifications from Today's
 * setup checklist) once the page is on screen. Next.js scrolls to the hash when the
 * navigation commits, and with the (app) loading.tsx that can happen while the loading
 * outline is still showing, before the section exists.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return null;
}
