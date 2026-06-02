"use client";

import sdk from "@farcaster/miniapp-sdk";
import { useEffect } from "react";

let readySignalSent = false;

export function FarcasterReady() {
  useEffect(() => {
    if (readySignalSent) {
      return;
    }

    readySignalSent = true;

    sdk.actions.ready().catch((error: unknown) => {
      readySignalSent = false;

      if (process.env.NODE_ENV !== "production") {
        console.warn("Farcaster Mini App ready signal failed.", error);
      }
    });
  }, []);

  return null;
}
