import { SIGNALWORKS_MERCHANT } from "./identity";

export const MINDPAY_API_AUDIENCE = "https://api.mindpay.example/";
export const SIGNALWORKS_ORIGIN = `https://${SIGNALWORKS_MERCHANT.domain}`;
export const SIGNALWORKS_MANIFEST_URL = `${SIGNALWORKS_ORIGIN}/.well-known/mindpay.json`;
export const SIGNALWORKS_CATALOG_URL = `${SIGNALWORKS_ORIGIN}/catalog/feed.json`;
