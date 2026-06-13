import { describe, expect, it } from "vitest";

import { formatXml, splitMessageBlocks } from "./messageDetail";

describe("messageDetail", () => {
  it("formats nested xml with indentation", () => {
    const formatted = formatXml("<root><child depth=\"1\"><value>payload</value></child></root>");

    expect(formatted).toBe([
      "<root>",
      "  <child depth=\"1\">",
      "    <value>payload</value>",
      "  </child>",
      "</root>",
    ].join("\n"));
  });

  it("extracts xml payload blocks from pipe-delimited messages", () => {
    const blocks = splitMessageBlocks(
      "Preparing SQL command parameters | seeded startup event | request_id=REQ-0019 | xml_payload=<root><value>payload</value></root>",
    );

    expect(blocks).toEqual([
      { content: "Preparing SQL command parameters", kind: "text" },
      { content: "seeded startup event", kind: "text" },
      { content: "request_id=REQ-0019", kind: "text" },
      { content: "xml_payload=", kind: "text" },
      { content: "<root>\n  <value>payload</value>\n</root>", kind: "xml" },
    ]);
  });
});
