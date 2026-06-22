import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderLaunchdPlist,
  writeLaunchdPlist,
} from "../src/launchd.js";

test("renders launchd plist for the local daemon", () => {
  const plist = renderLaunchdPlist({
    configPath: "/tmp/devrank/config <private>.json",
    label: "com.devrank.local-agent.test",
    logDirectory: "/tmp/devrank/logs",
    nodePath: "/usr/local/bin/node",
    repoRoot: "/tmp/devrank-os",
  });

  assert.match(plist, /<key>Label<\/key>\n  <string>com\.devrank\.local-agent\.test<\/string>/);
  assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/);
  assert.match(plist, /<string>\/tmp\/devrank-os\/apps\/local-agent\/dist\/index\.js<\/string>/);
  assert.match(plist, /<string>--watch<\/string>/);
  assert.match(plist, /config &lt;private&gt;\.json/);
  assert.match(plist, /<key>RunAtLoad<\/key>\n  <true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\n  <true\/>/);
});

test("writes launchd plist to disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-launchd-"));
  const plistPath = join(root, "LaunchAgents", "com.devrank.local-agent.test.plist");
  const result = await writeLaunchdPlist({
    configPath: join(root, "config.json"),
    label: "com.devrank.local-agent.test",
    logDirectory: join(root, "logs"),
    nodePath: "/usr/local/bin/node",
    plistPath,
    repoRoot: "/tmp/devrank-os",
  });
  const content = await readFile(plistPath, "utf8");

  assert.equal(result.plistPath, plistPath);
  assert.equal(content, result.plist);
  assert.match(content, /com\.devrank\.local-agent\.test/);
});
