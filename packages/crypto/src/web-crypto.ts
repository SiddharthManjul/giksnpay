export function getWebCrypto(): Crypto {
  const webCrypto = globalThis.crypto;
  if (webCrypto === undefined) {
    throw new Error("Web Crypto is unavailable in this runtime");
  }

  return webCrypto;
}

export function getSubtleCrypto(): SubtleCrypto {
  return getWebCrypto().subtle;
}
