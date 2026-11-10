"use client";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;
function loadTurnstile() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve(window.turnstile!);
    script.onerror = () => {
      loading = undefined;
      reject(
        new Error(
          "Human verification could not load. Check your connection and reload the page.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Cloudflare Turnstile check. Tokens are single-use: change `key` to get a fresh one. */
export default function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let widget: string | undefined;
    let mounted = true;
    loadTurnstile().then(
      (api) => {
        if (!mounted) return;
        widget = api.render(ref.current!, {
          sitekey: siteKey,
          size: "flexible",
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      },
      (cause: Error) => setError(cause.message),
    );
    return () => {
      mounted = false;
      if (widget) window.turnstile!.remove(widget);
    };
  }, [siteKey, onToken]);
  return error ? (
    <p role="alert" className="form-error">
      {error}
    </p>
  ) : (
    <div ref={ref} className="turnstile" />
  );
}
