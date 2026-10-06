import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@/model/migrations";
import { bi } from "@/model/text";
import { LocalStorageWorksheetStore } from "@/storage";
import { stringifyWorksheet } from "@/storage/document";
import { documentKey } from "./keys";
import { folderConnect } from "./folderTestKit";
import { MemoryCloud } from "./memorySource";
import {
  computer,
  edit,
  library,
  memoryConnect,
  openEditor,
  paper,
  settle,
  titles,
  type Connect,
} from "./testKit";
import type { SyncSource } from "./types";

/**
 * The executor end to end: two simulated computers (two web stores), one shared
 * in-memory cloud, reached directly and through the folder source (`folderTestKit.ts`).
 */

const SOURCES: [string, Connect][] = [
  ["memory", memoryConnect],
  ["folder", folderConnect],
];

describe.each(SOURCES)("%s source", (_source, connect) => {
  function pair() {
    const cloud = new MemoryCloud();
    return {
      cloud,
      a: computer(cloud, "A", undefined, connect),
      b: computer(cloud, "B", undefined, connect),
    };
  }

  describe("two computers", () => {
    it("a new paper on A appears on B", async () => {
      const { a, b } = pair();
      const doc = paper("Mock");
      await a.store.save(doc);
      expect((await a.sync()).counts.uploaded).toBe(1);
      expect((await b.sync()).counts.downloaded).toBe(1);
      expect(await library(b)).toEqual([`live ${doc.id} Mock`]);
      expect(stringifyWorksheet((await b.store.load(doc.id))!)).toBe(
        stringifyWorksheet((await a.store.load(doc.id))!),
      );
    });

    it("an edit on A reaches B, and an unchanged library then does nothing", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("One");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(a, doc.id, "Two");
      await a.sync();
      await b.sync();
      expect(await titles(b)).toEqual({ live: ["Two"], trash: [] });
      const quiet = await b.sync();
      expect(Object.values(quiet.counts).every((n) => n === 0)).toBe(true);
    });

    it("a download is announced with origin sync, so it is not uploaded back", async () => {
      const { a, b } = pair();
      const doc = paper("Mock");
      await a.store.save(doc);
      await a.sync();
      b.feed.events.length = 0;
      await b.sync();
      expect(b.feed.events).toEqual([
        { docId: doc.id, kind: "saved", origin: "sync" },
      ]);
    });

    it.each(["A first", "B first"])(
      "simultaneous edits keep both, %s, and settle with no duplicates",
      async (order) => {
        const { cloud, a, b } = pair();
        const doc = paper("Base");
        await a.store.save(doc);
        await settle(cloud, a, b);
        await edit(a, doc.id, "FromA");
        await edit(b, doc.id, "FromB");
        const [first, second] = order === "A first" ? [a, b] : [b, a];
        await first.sync();
        const report = await second.sync();
        expect(report.counts.conflicts).toBe(1);
        expect(report.conflicts).toEqual([
          {
            id: doc.id,
            copyId: expect.any(String),
            name: expect.stringMatching(
              new RegExp(
                `^From${second.name} \\(from ${second.name}, \\d+ \\w{3} \\d\\d:\\d\\d\\)$`,
              ),
            ),
          },
        ]);
        await settle(cloud, a, b);
        expect(await titles(a)).toEqual({
          live: ["FromA", "FromB"],
          trash: [],
        });
        expect(await library(a)).toEqual(await library(b));
        // The remote kept the id: the copy holds the computer that synced second.
        const own = await a.store.load(doc.id);
        expect(own?.title.en[0].text).toBe(`From${first.name}`);
      },
    );

    it("a delete on A puts the paper in B’s Trash, never deletes it", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Doomed");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await a.store.trash(doc.id);
      await settle(cloud, a, b);
      expect(await library(b)).toEqual([`trash ${doc.id} Doomed`]);
      expect(cloud.files.has(documentKey(doc.id, "trash"))).toBe(true);
    });

    it("an edit on B beats a delete on A", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Kept");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await a.store.trash(doc.id);
      await a.sync();
      await edit(b, doc.id, "Edited");
      await settle(cloud, b, a);
      expect(await library(a)).toEqual([`live ${doc.id} Edited`]);
      expect(await library(b)).toEqual([`live ${doc.id} Edited`]);
      expect(cloud.files.has(documentKey(doc.id, "trash"))).toBe(false);
    });

    it("a restore on one computer brings the paper back on the other", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Back");
      await a.store.save(doc);
      await a.store.trash(doc.id);
      await settle(cloud, a, b);
      expect(await library(b)).toEqual([`trash ${doc.id} Back`]);
      await b.store.restore(doc.id);
      await settle(cloud, a, b);
      expect(await library(a)).toEqual([`live ${doc.id} Back`]);
    });
  });

  describe("a second computer joins (library-folder.md § 1.3)", () => {
    it("links the same paper, keeps both of a changed one, copies the rest, live beats Trash", async () => {
      const { cloud, a, b } = pair();
      const same = paper("Same");
      const changed = paper("Original");
      const onlyA = paper("OnlyA");
      const trashedOnB = paper("Trashed");
      for (const doc of [same, changed, onlyA, trashedOnB])
        await a.store.save(doc);
      await a.sync();

      // B's own library: the same file, the same id edited (an emailed copy), its own paper.
      await b.store.save(same);
      await b.store.save({ ...changed, title: bi("Edited", "") });
      await b.store.save(trashedOnB);
      await b.store.trash(trashedOnB.id);
      const onlyB = paper("OnlyB");
      await b.store.save(onlyB);

      const report = await b.sync();
      expect(report.counts).toMatchObject({
        linked: 1,
        conflicts: 1,
        uploaded: 1,
        downloaded: 1,
        movedLocal: 1,
      });
      await settle(cloud, a, b);
      expect(await titles(b)).toEqual({
        live: ["Edited", "OnlyA", "OnlyB", "Original", "Same", "Trashed"],
        trash: [],
      });
      expect(await library(a)).toEqual(await library(b));
      // The folder kept the id; B's version is the named copy.
      expect((await b.store.load(changed.id))?.title.en[0].text).toBe(
        "Original",
      );
    });
  });

  describe("faults", () => {
    it("waits for a delayed upload, then picks it up", async () => {
      const { cloud, a, b } = pair();
      cloud.delayed = true;
      const doc = paper("Late");
      await a.store.save(doc);
      await a.sync();
      await b.sync();
      expect(await library(b)).toEqual([]);
      cloud.deliver();
      await b.sync();
      expect(await library(b)).toEqual([`live ${doc.id} Late`]);
    });

    it("pauses when the source is unreachable, deleting nothing", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Here");
      await a.store.save(doc);
      await settle(cloud, a, b);
      cloud.setUnavailable("B", true);
      expect((await b.sync()).status).toBe("unavailable");
      expect(await library(b)).toEqual([`live ${doc.id} Here`]);
    });

    // B's run makes 15 source calls here (a conflict, an upload, a download, a move each
    // way, a provider copy): stopping after every one of them must be safe.
    it.each(Array.from({ length: 17 }, (_, n) => n))(
      "stopped after %i calls mid-run, the next run finishes without loss or duplicates",
      async (calls) => {
        const { cloud, a, b } = pair();
        const docs = [paper("P1"), paper("P2"), paper("P3"), paper("P6")];
        for (const doc of docs) await a.store.save(doc);
        await settle(cloud, a, b);
        await edit(a, docs[0].id, "P1a");
        await edit(b, docs[0].id, "P1b");
        await a.store.trash(docs[1].id);
        await a.store.save(paper("P5"));
        await b.store.save(paper("P4"));
        await b.store.trash(docs[2].id);
        await a.sync();
        cloud.put(
          "p6.worksheet (1).json",
          stringifyWorksheet({ ...docs[3], title: bi("P6x", "") }),
        );
        cloud.failAfter("B", calls);
        await b.sync();
        cloud.setUnavailable("B", false);
        await settle(cloud, a, b);
        expect(await titles(b)).toEqual({
          live: ["P1a", "P1b", "P4", "P5", "P6", "P6x"],
          trash: ["P2", "P3"],
        });
        expect(await library(a)).toEqual(await library(b));
      },
    );

    it("a provider conflict copy becomes its own paper, once, even when both computers resolve it", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      cloud.delayed = true;
      await edit(a, doc.id, "FromA");
      await edit(b, doc.id, "FromB");
      // Both upload before either sees the other: the cloud keeps one and makes a copy.
      await a.sync();
      await b.sync();
      cloud.deliver();
      expect(
        [...cloud.files.keys()].some((key) => key.includes("conflict copy")),
      ).toBe(true);
      // Both see the provider's copy before either's resolution arrives.
      const ra = await a.sync();
      const rb = await b.sync();
      expect(ra.counts.providerCopies + rb.counts.providerCopies).toBe(2);
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({ live: ["FromA", "FromB"], trash: [] });
      expect(await library(a)).toEqual(await library(b));
      expect(
        [...cloud.files.keys()].some((key) => key.includes("conflict copy")),
      ).toBe(false);
      const copy = (await library(a)).find((row) =>
        row.includes("(from another computer)"),
      );
      expect(copy).toBeDefined();
    });

    it("a Trash file beside a live one (a delete that crossed an edit) is kept as a copy", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      // A's edit-and-delete and B's edit met at the provider: live is B's, Trash holds A's.
      cloud.put(
        documentKey(doc.id, "live"),
        stringifyWorksheet({ ...doc, title: bi("FromB", "") }),
      );
      cloud.put(
        documentKey(doc.id, "trash"),
        stringifyWorksheet({ ...doc, title: bi("FromA", "") }),
      );
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({ live: ["FromB"], trash: ["FromA"] });
      expect(await library(a)).toEqual(await library(b));
    });

    it.each(Array.from({ length: 6 }, (_, n) => n))(
      "an edit-and-trash stopped after %i calls finishes as a plain move, with no copy",
      async (calls) => {
        const { cloud, a, b } = pair();
        const doc = paper("Base");
        await a.store.save(doc);
        await settle(cloud, a, b);
        await edit(a, doc.id, "Edited");
        await a.store.trash(doc.id);
        cloud.failAfter("A", calls);
        await a.sync();
        cloud.setUnavailable("A", false);
        await b.sync();
        await settle(cloud, a, b);
        expect(await library(b)).toEqual([`trash ${doc.id} Edited`]);
        expect(await library(a)).toEqual(await library(b));
      },
    );

    it("a conflict stopped after its copy was made, the copy then edited, still resolves", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(a, doc.id, "FromA");
      await a.sync();
      await edit(b, doc.id, "FromB");
      cloud.failAfter("B", 3); // list, read A's edit, write the copy; then offline
      expect((await b.sync()).status).toBe("unavailable");
      cloud.setUnavailable("B", false);
      const copy = (await b.store.list()).find((row) => row.id !== doc.id)!;
      await edit(b, copy.id, "CopyEdited");
      const report = await b.sync();
      expect(report.errors).toEqual([]);
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({
        live: ["CopyEdited", "FromA"],
        trash: [],
      });
      expect(await library(a)).toEqual(await library(b));
    });

    it("a malformed remote file is skipped and reported; the rest syncs", async () => {
      const { cloud, a, b } = pair();
      cloud.put(
        "broken.worksheet.json",
        '{"schemaVersion": 1, "id": "broken", "tit',
      );
      const doc = paper("Fine");
      await a.store.save(doc);
      await a.sync();
      const report = await b.sync();
      expect(report.held).toEqual([
        { id: "broken", key: "broken.worksheet.json", reason: "unreadable" },
      ]);
      expect(await library(b)).toEqual([`live ${doc.id} Fine`]);
    });

    it("a torn update of a synced paper never overwrites the local copy", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Whole");
      await a.store.save(doc);
      await settle(cloud, a, b);
      const key = documentKey(doc.id, "live");
      cloud.put(key, cloud.files.get(key)!.text.slice(0, 40));
      await edit(b, doc.id, "Mine");
      const report = await b.sync();
      expect(report.held).toEqual([{ id: doc.id, key, reason: "unreadable" }]);
      expect(await titles(b)).toEqual({ live: ["Mine"], trash: [] });
    });

    it("re-plans when the remote changes between planning and writing: both versions kept", async () => {
      const cloud = new MemoryCloud();
      let sneak: (() => void) | undefined;
      const racing = (source: SyncSource): SyncSource => ({
        ...source,
        list: () => source.list(),
        read: (key) => source.read(key),
        changes: (cursor) => source.changes(cursor),
        remove: (key, options) => source.remove(key, options),
        write: (key, text, options) => {
          sneak?.();
          sneak = undefined;
          return source.write(key, text, options);
        },
      });
      const a = computer(cloud, "A", undefined, connect);
      const b = computer(cloud, "B", racing, connect);
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(b, doc.id, "FromB");
      sneak = () => {
        const key = documentKey(doc.id, "live");
        cloud.put(
          key,
          stringifyWorksheet({ ...doc, title: bi("Sneaked", "") }),
        );
      };
      const report = await b.sync();
      expect(report.counts.conflicts).toBe(1);
      expect(await titles(b)).toEqual({
        live: ["FromB", "Sneaked"],
        trash: [],
      });
    });

    it("re-plans when the teacher saves between planning and writing: the save is kept", async () => {
      const cloud = new MemoryCloud();
      let during: (() => Promise<void>) | undefined;
      const slow = (source: SyncSource): SyncSource => ({
        list: () => source.list(),
        write: (key, text, options) => source.write(key, text, options),
        changes: (cursor) => source.changes(cursor),
        remove: (key, options) => source.remove(key, options),
        read: async (key) => {
          const pending = during;
          during = undefined;
          await pending?.();
          return source.read(key);
        },
      });
      const a = computer(cloud, "A", undefined, connect);
      const b = computer(cloud, "B", slow, connect);
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(a, doc.id, "FromA");
      await a.sync();
      // B's run reads A's edit; meanwhile the teacher, on B, saves the same paper.
      during = () => edit(b, doc.id, "TypedOnB");
      const report = await b.sync();
      expect(report.counts.conflicts).toBe(1);
      expect(await titles(b)).toEqual({
        live: ["FromA", "TypedOnB"],
        trash: [],
      });
    });

    it("a folder that is suddenly empty is filled again from here, not read as everything deleted", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("One");
      await a.store.save(doc);
      await settle(cloud, a, b);
      for (const key of [...cloud.files.keys()]) cloud.drop(key);
      const report = await b.sync();
      expect(report).toMatchObject({
        status: "ok",
        remoteWasEmpty: true,
        counts: { uploaded: 1 },
      });
      expect(await titles(b)).toEqual({ live: ["One"], trash: [] });
      await settle(cloud, a, b);
      expect(await library(a)).toEqual([`live ${doc.id} One`]);
    });

    it("a library wiped here is brought back from the mirror, not deleted there", async () => {
      const { cloud, a, b } = pair();
      await a.store.save(paper("Two"));
      await settle(cloud, a, b);
      b.storage.clear();
      expect((await b.sync()).counts.downloaded).toBe(1);
      expect(await titles(b)).toEqual({ live: ["Two"], trash: [] });
    });
  });

  describe("a newer build’s document", () => {
    const NEWER = CURRENT_SCHEMA_VERSION + 97;

    it("is downloaded, and its file is never overwritten from here", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Old");
      await a.store.save(doc);
      await settle(cloud, a, b);
      // The other computer, on a newer build, updates the paper.
      const key = documentKey(doc.id, "live");
      const newerText = JSON.stringify({
        ...JSON.parse(stringifyWorksheet(doc)),
        schemaVersion: NEWER,
        title: { en: [{ text: "Newer" }], zh: [] },
      });
      cloud.put(key, newerText);
      await b.sync();
      expect((await b.store.load(doc.id))?.schemaVersion).toBe(NEWER);

      // Meanwhile A, still on this build, had edited the paper: kept as a copy instead.
      await edit(a, doc.id, "EditedOnA");
      const report = await a.sync();
      expect(report.counts.conflicts).toBe(1);
      expect(cloud.files.get(key)?.text).toBe(newerText);
      expect(await titles(a)).toEqual({
        live: ["EditedOnA", "Newer"],
        trash: [],
      });
    });

    it("held locally, is never given an older schema by a download", async () => {
      const { cloud, b } = pair();
      const doc = paper("Newer", { schemaVersion: NEWER });
      await b.store.adopt(doc);
      await b.sync();
      const key = documentKey(doc.id, "live");
      // An older build (or a hand edit) writes an older schema over the remote file.
      cloud.put(
        key,
        stringifyWorksheet({
          ...doc,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          title: bi("Older", ""),
        }),
      );
      const before = b.storage.getItem(`econ-worksheet:${doc.id}`);
      const report = await b.sync();
      expect(report.held).toEqual([{ id: doc.id, reason: "newer-build" }]);
      expect(b.storage.getItem(`econ-worksheet:${doc.id}`)).toBe(before);
    });
  });

  describe("the hash cache", () => {
    it("an unchanged library loads no document on the next run, on either computer", async () => {
      const { cloud, a, b } = pair();
      const docs = [paper("One"), paper("Two"), paper("Three")];
      for (const doc of docs) await a.store.save(doc);
      await a.store.trash(docs[2].id);
      await settle(cloud, a, b);
      for (const c of [a, b]) {
        c.loads.count = 0;
        const report = await c.sync();
        expect(Object.values(report.counts).every((n) => n === 0)).toBe(true);
        expect(c.loads.count, c.name).toBe(0);
      }
      // An edit costs that one document: read for the plan, re-read before the upload.
      await edit(a, docs[0].id, "OneEdited");
      a.loads.count = 0;
      expect((await a.sync()).counts.uploaded).toBe(1);
      expect(a.loads.count).toBe(2);
    });

    it("an edit that keeps the same updatedAt is still uploaded", async () => {
      const { cloud, a, b } = pair();
      const stamp = "2026-10-05T06:32:00.000Z";
      const doc = paper("One", { updatedAt: stamp });
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(a, doc.id, "Two", stamp);
      expect((await a.sync()).counts.uploaded).toBe(1);
      await b.sync();
      expect(await titles(b)).toEqual({ live: ["Two"], trash: [] });
    });

    it("a write it never heard of (another tab) is seen by its new updatedAt", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("One", { updatedAt: "2026-10-05T06:32:00.000Z" });
      await a.store.save(doc);
      await settle(cloud, a, b);
      const otherTab = new LocalStorageWorksheetStore(
        Date.now,
        () => a.storage,
      );
      await otherTab.save({
        ...doc,
        title: bi("Two", ""),
        updatedAt: "2026-10-05T06:33:00.000Z",
      });
      expect((await a.sync()).counts.uploaded).toBe(1);
      await b.sync();
      expect(await titles(b)).toEqual({ live: ["Two"], trash: [] });
    });

    it("a conflict planned from a cached hash loads this computer’s version for the copy", async () => {
      const { cloud, a, b } = pair();
      const doc = paper("Base");
      await a.store.save(doc);
      await settle(cloud, a, b);
      await edit(b, doc.id, "FromB");
      cloud.failAfter("B", 1); // B lists and hashes its edit, then cannot upload it
      expect((await b.sync()).status).toBe("unavailable");
      cloud.setUnavailable("B", false);
      expect(b.hashCache.get(doc.id)).toBeDefined();
      await edit(a, doc.id, "FromA");
      await a.sync();
      b.loads.count = 0;
      expect((await b.sync()).counts.conflicts).toBe(1);
      expect(b.loads.count).toBeGreaterThan(0);
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({ live: ["FromA", "FromB"], trash: [] });
      expect(await library(a)).toEqual(await library(b));
    });

    it("an unreadable document is held every run, never cached", async () => {
      const { a } = pair();
      const doc = paper("Torn");
      await a.store.save(doc);
      a.storage.setItem(`econ-worksheet:${doc.id}`, '{"torn');
      for (let run = 0; run < 2; run += 1) {
        a.loads.count = 0;
        expect((await a.sync()).held).toEqual([
          { id: doc.id, reason: "unreadable-local" },
        ]);
        expect(a.loads.count).toBe(1);
        expect(a.hashCache.get(doc.id)).toBeUndefined();
      }
    });
  });

  describe("the open editor", () => {
    async function shared(title: string) {
      const { cloud, a, b } = pair();
      const doc = paper(title);
      await a.store.save(doc);
      await settle(cloud, a, b);
      return { cloud, a, b, doc };
    }

    const shown = (worksheet: { title: { en: { text: string }[] } }) => worksheet.title.en.map((run) => run.text).join("");

    it("clean: the download is taken in and the editor shows it", async () => {
      const { a, b, doc } = await shared("One");
      const editor = await openEditor(b, doc.id);
      await edit(a, doc.id, "Two");
      await a.sync();
      expect((await b.sync()).counts.downloaded).toBe(1);
      expect(editor.reloads).toBe(1);
      expect(shown(editor.worksheet)).toBe("Two");
    });

    it("unsaved edits: nothing is done to it until they are saved, then both are kept", async () => {
      const { cloud, a, b, doc } = await shared("One");
      const editor = await openEditor(b, doc.id);
      editor.type("Mine");
      await edit(a, doc.id, "Theirs");
      await a.sync();
      const held = await b.sync();
      expect(held.held).toEqual([{ id: doc.id, reason: "busy" }]);
      expect(held.counts.downloaded).toBe(0);
      expect(await titles(b)).toEqual({ live: ["One"], trash: [] });
      expect(editor.reloads).toBe(0);
      await editor.save();
      const report = await b.sync();
      expect(report.counts.conflicts).toBe(1);
      // The editor stays on its id, which now holds the other computer's version.
      expect(report.conflicts).toEqual([{ id: doc.id, copyId: expect.any(String), name: expect.stringContaining("(from B,") }]);
      expect(shown(editor.worksheet)).toBe("Theirs");
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({ live: ["Mine", "Theirs"], trash: [] });
      expect(await library(a)).toEqual(await library(b));
    });

    it("unsaved edits hold an upload too, so they are never compared with a stale base", async () => {
      const { a, b, doc } = await shared("One");
      await edit(b, doc.id, "Saved");
      const editor = await openEditor(b, doc.id);
      editor.type("Typing");
      expect((await b.sync()).held).toEqual([{ id: doc.id, reason: "busy" }]);
      await editor.save();
      expect((await b.sync()).counts.uploaded).toBe(1);
      await a.sync();
      expect(await titles(a)).toEqual({ live: ["Typing"], trash: [] });
    });

    it("an edit typed while sync writes the open document keeps both", async () => {
      const { cloud, a, b, doc } = await shared("One");
      const editor = await openEditor(b, doc.id);
      await edit(a, doc.id, "Theirs");
      await a.sync();
      b.hooks.beforeAdopt = (id) => {
        if (id === doc.id) editor.type("Mine");
      };
      const raced = await b.sync();
      b.hooks.beforeAdopt = undefined;
      expect(raced.held).toEqual([{ id: doc.id, reason: "busy" }]);
      expect(editor.reloads).toBe(0);
      expect((await b.sync()).held).toEqual([{ id: doc.id, reason: "busy" }]);
      await editor.save();
      expect((await b.sync()).counts.conflicts).toBe(1);
      expect(shown(editor.worksheet)).toBe("Theirs");
      await settle(cloud, a, b);
      expect(await titles(a)).toEqual({ live: ["Mine", "Theirs"], trash: [] });
      expect(await library(a)).toEqual(await library(b));
    });
  });
});
