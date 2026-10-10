"use client";

/*
  The «enter the code» step survives a reload: the email, which flow sent the code and when, kept in
  sessionStorage per page (never the password, never the code). Read with useSyncExternalStore, so the server
  render and the first client render are the plain form, and the step appears right after hydration.
  sessionStorage can be missing or throw (private mode, blocked storage): then the step lives in memory only.
*/

import { useSyncExternalStore } from "react";

/** signup / confirm: verify type "email" after a sign-up email; login: a sign-in code; recovery: a reset code. */
export type OtpFlow = "signup" | "confirm" | "login" | "recovery";
export type OtpPending = { email: string; flow: OtpFlow; sentAt: number };
type Page = "signup" | "login" | "recovery";

/** After this long the step is forgotten and the plain form shows again (the code itself lasts 10 minutes). */
const KEEP_MS = 60 * 60 * 1000;
const FLOWS: OtpFlow[] = ["signup", "confirm", "login", "recovery"];

const key = (page: Page) => `adli-otp:${page}`;
const memory = new Map<Page, string | null>();
const cache = new Map<Page, { raw: string | null; value: OtpPending | null }>();
const listeners = new Set<() => void>();
let storageBroken = false;

function readRaw(page: Page): string | null {
  if (!storageBroken) {
    try {
      return sessionStorage.getItem(key(page));
    } catch {
      storageBroken = true;
    }
  }
  return memory.get(page) ?? null;
}

function writeRaw(page: Page, raw: string | null) {
  memory.set(page, raw);
  if (!storageBroken) {
    try {
      if (raw === null) sessionStorage.removeItem(key(page));
      else sessionStorage.setItem(key(page), raw);
    } catch {
      storageBroken = true;
    }
  }
  listeners.forEach((l) => l());
}

function parse(raw: string | null): OtpPending | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OtpPending>;
    if (typeof v.email !== "string" || typeof v.sentAt !== "number" || !FLOWS.includes(v.flow as OtpFlow)) return null;
    if (Date.now() - v.sentAt > KEEP_MS) return null;
    return { email: v.email, flow: v.flow as OtpFlow, sentAt: v.sentAt };
  } catch {
    return null;
  }
}

/** Same object while the stored text is the same (useSyncExternalStore needs a stable snapshot). */
function snapshot(page: Page): OtpPending | null {
  const raw = readRaw(page);
  const hit = cache.get(page);
  if (hit && hit.raw === raw) return hit.value;
  const value = parse(raw);
  cache.set(page, { raw, value });
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The pending code step of one page, and how to set or drop it. */
export function useOtpPending(page: Page) {
  const pending = useSyncExternalStore(
    subscribe,
    () => snapshot(page),
    () => null,
  );
  return {
    pending,
    save: (email: string, flow: OtpFlow) => writeRaw(page, JSON.stringify({ email, flow, sentAt: Date.now() })),
    clear: () => writeRaw(page, null),
  };
}
