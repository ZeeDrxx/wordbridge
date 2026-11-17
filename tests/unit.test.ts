import { describe, expect, it } from "vitest";

import { moderatorFor, parseModerators } from "@/lib/auth";
import { arabicKey, latinKey, searchKey, slugify } from "@/lib/normalize";
import { describe as describeSubmission, issuesToFields, submissionRequestSchema } from "@/lib/submissions";

describe("latinKey: spellings of one word meet on one key", () => {
  it.each([
    [["bzzaf", "bezzaf", "bzaf", "Bezaf", "BZZAF"]],
    [["chhal", "ch7al", "shhal", "Ch7al"]],
    [["kifach", "kifash"]],
    [["3lach", "alach", "3lash"]],
    [["chkoun", "chkun", "shkoun"]],
    [["flouss", "flous"]],
    [["mzyan", "mezyan"]],
    [["khobz", "5obz"]],
  ])("%j", (spellings) => {
    const keys = new Set(spellings.map(latinKey));
    expect(keys.size).toBe(1);
  });

  it("keeps different words apart", () => {
    expect(latinKey("daba")).not.toBe(latinKey("dar"));
    expect(latinKey("fin")).not.toBe(latinKey("fhem"));
  });
});

describe("arabicKey", () => {
  it("drops harakat, shadda and tatweel", () => {
    expect(arabicKey("بزّاف")).toBe(arabicKey("بزاف"));
    expect(arabicKey("بـزاف")).toBe("بزاف");
  });
  it("folds alef and final-letter variants", () => {
    expect(arabicKey("إمتى")).toBe(arabicKey("امتي"));
    expect(arabicKey("خدمة")).toBe(arabicKey("خدمه"));
  });
  it("searchKey picks the script", () => {
    expect(searchKey("بزاف")).toBe("بزاف");
    expect(searchKey("Bezzaf")).toBe("bzaf");
  });
});

it("slugify keeps Arabizi digits", () => {
  expect(slugify("3afak")).toBe("3afak");
  expect(slugify(" Lbare7 ")).toBe("lbare7");
  expect(slugify("l-ma")).toBe("l-ma");
  expect(slugify("Ça va")).toBe("ca-va");
});

describe("submission validation", () => {
  const entry = { type: "new_entry", latin: "bnin", arabic: "بنين", pos: "adjective", fr: "délicieux" };

  it("accepts a new word and trims blanks to undefined", () => {
    const r = submissionRequestSchema.parse({ payload: { ...entry, en: "  " }, submitterName: "" });
    expect(r.payload).toMatchObject({ latin: "bnin", fr: "délicieux" });
    expect(r.payload.type === "new_entry" && r.payload.en).toBeUndefined();
    expect(r.submitterName).toBeUndefined();
  });

  it("requires a meaning", () => {
    const r = submissionRequestSchema.safeParse({ payload: { ...entry, fr: "" } });
    expect(r.success).toBe(false);
    expect(issuesToFields(r.error!)).toHaveProperty(["payload.fr"]);
  });

  it("checks scripts", () => {
    const wrong = submissionRequestSchema.safeParse({ payload: { ...entry, latin: "بنين", arabic: "bnin" } });
    expect(Object.keys(issuesToFields(wrong.error!)).sort()).toEqual(["payload.arabic", "payload.latin"]);
  });

  it("rejects unknown types and bad slugs", () => {
    expect(submissionRequestSchema.safeParse({ payload: { type: "delete_everything" } }).success).toBe(false);
    expect(submissionRequestSchema.safeParse({ payload: { type: "correction", entrySlug: "../etc", message: "x" } }).success).toBe(false);
  });

  it("describes submissions for moderators", () => {
    const spelling = submissionRequestSchema.parse({
      payload: { type: "new_spelling", entrySlug: "bzzaf", text: "yaser", region: "oriental", regionalWord: true },
    });
    expect(describeSubmission(spelling.payload)).toBe('Regional word "yaser" for bzzaf (oriental)');
  });
});

describe("moderator tokens", () => {
  const mods = parseModerators("amina:0123456789abcdef0123,short:abc,broken,youssef:fedcba9876543210fedc");

  it("ignores malformed or short entries", () => {
    expect([...mods.keys()]).toEqual(["amina", "youssef"]);
  });

  it("resolves a token to its moderator", () => {
    expect(moderatorFor("fedcba9876543210fedc", mods)).toBe("youssef");
    expect(moderatorFor("0123456789abcdef0123", mods)).toBe("amina");
    expect(moderatorFor("nope", mods)).toBeNull();
    expect(moderatorFor(undefined, mods)).toBeNull();
  });
});
