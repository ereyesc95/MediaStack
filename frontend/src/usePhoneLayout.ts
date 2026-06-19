import { useLayoutEffect, useState } from "react";

/** Match MusicHome breakpoints — phone only, excludes tablets (e.g. Surface Pro). */
const PHONE_MAX_WIDTH = 900;
const PHONE_PORTRAIT_MAX_WIDTH = 480;
const TABLET_PORTRAIT_MAX_WIDTH = 1366;
const TABLET_LANDSCAPE_MAX_HEIGHT = 950;

function hasTouchScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0;
}

export type DeviceLayout =
  | "desktop"
  | "tablet-landscape"
  | "tablet-portrait"
  | "mobile-landscape"
  | "mobile-portrait";

export function resolveDeviceLayout(): DeviceLayout {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscape = window.matchMedia("(orientation: landscape)").matches;

  if (landscape) {
    if (width <= PHONE_MAX_WIDTH) return "mobile-landscape";
    if (
      hasTouchScreen() &&
      height <= TABLET_LANDSCAPE_MAX_HEIGHT &&
      width > PHONE_MAX_WIDTH
    ) {
      return "tablet-landscape";
    }
    return "desktop";
  }

  if (width <= PHONE_PORTRAIT_MAX_WIDTH) return "mobile-portrait";
  if (width <= TABLET_PORTRAIT_MAX_WIDTH) return "tablet-portrait";
  return "desktop";
}

export function isPhoneLayout(layout?: DeviceLayout): boolean {
  const l = layout ?? resolveDeviceLayout();
  return l === "mobile-portrait" || l === "mobile-landscape";
}

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => isPhoneLayout());

  useLayoutEffect(() => {
    const update = () => setPhone(isPhoneLayout());
    const landscapeMq = window.matchMedia("(orientation: landscape)");
    landscapeMq.addEventListener("change", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      landscapeMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return phone;
}

/** Stacked About layout: image on top (phone + tablet portrait only). */
export function isStackedArtistLayout(layout?: DeviceLayout): boolean {
  const l = layout ?? resolveDeviceLayout();
  return l === "mobile-portrait" || l === "tablet-portrait";
}

export function isMobilePortraitLayout(layout?: DeviceLayout): boolean {
  return (layout ?? resolveDeviceLayout()) === "mobile-portrait";
}

export function isMobileLandscapeLayout(layout?: DeviceLayout): boolean {
  return (layout ?? resolveDeviceLayout()) === "mobile-landscape";
}

export function useDeviceLayout(): DeviceLayout {
  const [layout, setLayout] = useState<DeviceLayout>(() => resolveDeviceLayout());

  useLayoutEffect(() => {
    const update = () => setLayout(resolveDeviceLayout());
    const landscapeMq = window.matchMedia("(orientation: landscape)");
    landscapeMq.addEventListener("change", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      landscapeMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return layout;
}
