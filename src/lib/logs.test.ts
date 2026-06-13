import { describe, expect, it } from "vitest";

import { getLogEntrySearchText, parseLogMessageDetails, parseLogText } from "./logs";

describe("parseLogText", () => {
  it("parses nginx-style rows with a hidden 2-digit field", () => {
    const [entry] = parseLogText(
      "2026-06-03 09:00:00.0000|INFO|07|Platform.Hosting.Startup|Startup complete | request_id=REQ-0001\n",
    );

    expect(entry?.isParsed).toBe(true);
    expect(entry?.level).toBe("INFO");
    expect(entry?.category).toBe("Platform.Hosting.Startup");
    expect(entry?.message).toBe("Startup complete | request_id=REQ-0001");
    expect(entry ? getLogEntrySearchText(entry) : "").not.toContain("07");
  });

  it("preserves pipe characters in legacy 4-part messages", () => {
    const [entry] = parseLogText(
      "2026-06-03 09:00:00.0000|WARN|Billing.Domain.PaymentProcessor|Queue lag exceeded threshold | elapsed_ms=2200 | node=node-3\n",
    );

    expect(entry?.isParsed).toBe(true);
    expect(entry?.message).toBe("Queue lag exceeded threshold | elapsed_ms=2200 | node=node-3");
  });

  it("extracts structured metadata from the message body", () => {
    const details = parseLogMessageDetails(
      "Database command failed | correlation=CORR-40317 node=node-6 tenant=tenant-alpha exception=System.TimeoutException",
    );

    expect(details.headline).toBe("Database command failed");
    expect(details.notes).toEqual([]);
    expect(details.fields).toEqual([
      { key: "correlation", value: "CORR-40317" },
      { key: "node", value: "node-6" },
      { key: "tenant", value: "tenant-alpha" },
      { key: "exception", value: "System.TimeoutException" },
    ]);
  });

  it("keeps non-key-value context notes alongside extracted metadata", () => {
    const details = parseLogMessageDetails("Background worker lease renewed | seeded startup event | request_id=REQ-0020");

    expect(details.headline).toBe("Background worker lease renewed");
    expect(details.notes).toEqual(["seeded startup event"]);
    expect(details.fields).toEqual([{ key: "request_id", value: "REQ-0020" }]);
  });
});
