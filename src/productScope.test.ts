import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isFocusedPage, isFocusedPlatform, UPSTREAM_REMOTE_SERVICES_ENABLED} from './productScope';
import {MENU_VISIBLE_PLATFORM_IDS} from './types/platform';

test('product scope retains complete Codex and Claude destinations', () => {
  for(const page of ['codex','codex-api-service','codex-instances','claude','claude-cli','2fa','settings']) assert.ok(isFocusedPage(page),page);
  assert.deepEqual(new Set(MENU_VISIBLE_PLATFORM_IDS),new Set(['codex','codex_api_service','claude_manager']));
});
test('unrelated platforms and advertising cannot be re-enabled through navigation',()=>{
  for(const name of ['cursor','windsurf','antigravity','workbuddy','zed','grok']) assert.equal(isFocusedPlatform(name),false,name);
  for(const page of ['dashboard','overview','api-relay','github-copilot','trae','wakeup']) assert.equal(isFocusedPage(page),false,page);
  assert.equal(UPSTREAM_REMOTE_SERVICES_ENABLED,false);
});
