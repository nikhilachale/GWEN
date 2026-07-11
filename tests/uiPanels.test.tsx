import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ConversationPanel from "../src/ui/ConversationPanel.js";
import HealthPanel from "../src/ui/HealthPanel.js";

test("ConversationPanel renders its core controls", () => {
  globalThis.window = {
    ...globalThis.window,
    gwenBridge: {
      getConversations: async () => [],
      onConversation: () => () => {},
    },
    confirm: () => true,
  } as any;

  const html = renderToStaticMarkup(React.createElement(ConversationPanel, { onClose: () => {} }));

  assert.match(html, /CONVERSATIONS/);
  assert.match(html, /Search transcripts/);
  assert.match(html, /NEW/);
  assert.match(html, /CLEAR/);
  assert.match(html, /No matching conversations/);
});

test("HealthPanel renders loading shell and actions", () => {
  globalThis.window = {
    ...globalThis.window,
    gwenBridge: {
      getHealthSnapshot: async () => ({
        generatedAt: new Date(0).toISOString(),
        overall: "ok",
        sections: [],
      }),
    },
  } as any;

  const html = renderToStaticMarkup(React.createElement(HealthPanel, { onClose: () => {} }));

  assert.match(html, /HEALTH/);
  assert.match(html, /\.\.\./);
  assert.match(html, /Collecting snapshot/);
});
