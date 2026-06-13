  export interface MessageBlock {
  content: string;
  kind: "text" | "xml";
}

function formatXmlNode(node: Node, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);

  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    const text = node.textContent?.trim();
    if (text) {
      lines.push(`${indent}${text}`);
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const attributes = Array.from(element.attributes)
    .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
    .join("");
  const children = Array.from(element.childNodes).filter((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      return true;
    }

    return Boolean(child.textContent?.trim());
  });

  if (children.length === 0) {
    lines.push(`${indent}<${element.tagName}${attributes} />`);
    return;
  }

  if (children.length === 1 && (children[0]?.nodeType === Node.TEXT_NODE || children[0]?.nodeType === Node.CDATA_SECTION_NODE)) {
    lines.push(`${indent}<${element.tagName}${attributes}>${children[0].textContent?.trim() ?? ""}</${element.tagName}>`);
    return;
  }

  lines.push(`${indent}<${element.tagName}${attributes}>`);
  children.forEach((child) => {
    formatXmlNode(child, depth + 1, lines);
  });
  lines.push(`${indent}</${element.tagName}>`);
}

export function formatXml(xml: string): string | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    return null;
  }

  const root = document.documentElement;
  if (!root) {
    return null;
  }

  const lines: string[] = [];
  formatXmlNode(root, 0, lines);
  return lines.join("\n");
}

export function splitMessageBlocks(message: string): MessageBlock[] {
  const segments = message
    .split(" | ")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.flatMap((segment) => {
    const keyValueXmlMatch = segment.match(/^([\w.-]+)=(<[\s\S]+>)$/);
    if (keyValueXmlMatch) {
      const formatted = formatXml(keyValueXmlMatch[2]);
      if (formatted) {
        return [
          { content: `${keyValueXmlMatch[1]}=`, kind: "text" as const },
          { content: formatted, kind: "xml" as const },
        ];
      }
    }

    const trailingXmlMatch = segment.match(/^(.*?)(<[\s\S]+>)$/);
    if (trailingXmlMatch) {
      const formatted = formatXml(trailingXmlMatch[2]);
      if (formatted) {
        const prefix = trailingXmlMatch[1]?.trim();
        return [
          ...(prefix ? [{ content: prefix, kind: "text" as const }] : []),
          { content: formatted, kind: "xml" as const },
        ];
      }
    }

    return [{ content: segment, kind: "text" as const }];
  });
}
