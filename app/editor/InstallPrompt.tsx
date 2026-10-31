"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "paceframe:install-dismissed";

/** Registers the service worker and offers "Add to Home Screen" (native prompt on Android, how-to on iOS). */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iOS Safari has no install prompt; show how to do it instead.
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    const t = isIos ? setTimeout(() => setIos(true), 4000) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDeferred(null);
    setIos(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!deferred && !ios) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(max(env(safe-area-inset-bottom),12px)+104px)] z-[70] flex items-center gap-3 rounded-2xl bg-white p-3 text-black shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Install Paceframe</div>
        <div className="text-xs text-black/60">
          {ios ? (
            <>
              Tap <Share size={12} className="inline -translate-y-px" /> then <b>Add to Home Screen</b>
            </>
          ) : (
            "Full screen, faster, works offline"
          )}
        </div>
      </div>
      {deferred && (
        <button onClick={install} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#fc4c02] px-4 text-sm font-semibold text-white">
          <Download size={15} />
          Install
        </button>
      )}
      <button onClick={dismiss} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black/50" aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
}
