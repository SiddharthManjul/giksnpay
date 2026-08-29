import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACP_PINNED_COMMIT,
  ACP_RELEASE_COMMIT,
  ACP_RELEASED_PATH_LAST_MODIFIED_COMMIT,
  ACP_SNAPSHOT_PATH,
  ACP_VERSION,
} from "./snapshot";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const snapshotRoot = resolve(repositoryRoot, ACP_SNAPSHOT_PATH);

describe("ACP snapshot provenance", () => {
  it("pins the dated release to immutable upstream commits", () => {
    const provenance = loadJsonRecord(resolve(snapshotRoot, "PROVENANCE.json"));

    expect(provenance.version).toBe(ACP_VERSION);
    expect(provenance.pinned_commit).toBe(ACP_PINNED_COMMIT);
    expect(provenance.release_commit).toBe(ACP_RELEASE_COMMIT);
    expect(provenance.released_path_last_modified_commit).toBe(
      ACP_RELEASED_PATH_LAST_MODIFIED_COMMIT,
    );
    expect(provenance.source_archive_url).toBe(
      `https://codeload.github.com/agentic-commerce-protocol/agentic-commerce-protocol/tar.gz/${ACP_PINNED_COMMIT}`,
    );
  });

  it("contains only the pinned ACP version directory", () => {
    const versions = readdirSync(resolve(repositoryRoot, "protocol/acp"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(versions).toEqual([ACP_VERSION]);
  });

  it("matches every recorded official artifact checksum", () => {
    const checksumLines = readFileSync(resolve(snapshotRoot, "CHECKSUMS.sha256"), "utf8")
      .trim()
      .split("\n");
    const checkedFiles = new Set<string>();

    for (const line of checksumLines) {
      const match = /^(?<hash>[a-f0-9]{64}) {2}(?<path>.+)$/u.exec(line);
      expect(match?.groups).toBeDefined();
      const hash = match?.groups?.hash;
      const path = match?.groups?.path;
      if (hash === undefined || path === undefined) {
        throw new Error(`Invalid checksum line: ${line}`);
      }

      const absolutePath = resolve(repositoryRoot, path);
      expect(absolutePath.startsWith(`${snapshotRoot}/`)).toBe(true);
      expect(lstatSync(absolutePath).isSymbolicLink()).toBe(false);
      expect(createHash("sha256").update(readFileSync(absolutePath)).digest("hex")).toBe(hash);
      checkedFiles.add(path);
    }

    const officialFiles = listFiles(snapshotRoot)
      .map((path) => relative(repositoryRoot, path))
      .filter(
        (path) =>
          !path.endsWith("/README.md") || path.includes("/examples/discount-extension/README.md"),
      )
      .filter((path) => !path.endsWith("/PROVENANCE.json"))
      .filter((path) => !path.endsWith("/CHECKSUMS.sha256"));

    expect([...checkedFiles].sort()).toEqual(officialFiles.sort());
  });
});

function loadJsonRecord(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Expected an object in ${path}`);
  }
  return value as Record<string, unknown>;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
