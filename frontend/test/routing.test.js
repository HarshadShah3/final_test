import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('unknown paths render the not-found page instead of the home page', async t => {
  globalThis.window = {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  };
  t.after(() => delete globalThis.window);

  const vite = await createServer({ appType: 'custom', server: { middlewareMode: true } });
  t.after(() => vite.close());

  const { AppRoutes } = await vite.ssrLoadModule('/src/App.jsx');
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/not/a/real/page-98765'] },
      React.createElement(AppRoutes),
    ),
  );

  assert.match(markup, /404/);
  assert.match(markup, /We couldn&#x27;t find that page\./);
  assert.doesNotMatch(markup, /Thinking about leaving Melbourne\?/);
});
