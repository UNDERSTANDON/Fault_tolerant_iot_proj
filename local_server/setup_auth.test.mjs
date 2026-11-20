import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('setup and dashboard code no longer create or use a shared browser token', async () => {
  const [initializer, lanConfig, bridge, useAuth, useSmartHome, dashboardBundle] = await Promise.all([
    read('./Initialize-LocalBroker.ps1'),
    read('./Configure-LanDashboard.ps1'),
    read('./lan_broker_bridge.mjs'),
    read('../main/web_hoster/web/react_app/src/hooks/useAuth.js'),
    read('../main/web_hoster/web/react_app/src/hooks/useSmartHome.js'),
    read('../main/web_hoster/web/app.js'),
  ]);

  assert.doesNotMatch(initializer, /BRIDGE_BROWSER_TOKEN|New-RandomBrowserToken/);
  assert.match(lanConfig, /BRIDGE_BROWSER_TOKEN=.*(?:\\r\?\\n|\$)/);
  assert.doesNotMatch(lanConfig, /"BRIDGE_BROWSER_TOKEN=/);
  for (const source of [bridge, useAuth, useSmartHome, dashboardBundle]) {
    assert.doesNotMatch(source, /BRIDGE_BROWSER_TOKEN|isValidBrowserToken/);
    assert.doesNotMatch(source, /\/api\/auth\/bootstrap-admin/);
  }
});
