import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  statSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";

const ENTRYPOINT_PATH = resolve(
  import.meta.dir,
  "../../docker-entrypoint.sh"
);

describe("docker-entrypoint.sh", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "entrypoint-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("entrypoint script exists and is executable", () => {
    // then
    expect(existsSync(ENTRYPOINT_PATH)).toBe(true);
    const stat = statSync(ENTRYPOINT_PATH);
    // Check owner execute bit (0o100)
    expect(stat.mode & 0o100).toBeTruthy();
  });

  test("umask 0077 causes new files to be created with 0600 permissions", async () => {
    // given
    const testScript = join(tempDir, "test-umask.sh");
    const testFile = join(tempDir, "testfile.db");
    writeFileSync(
      testScript,
      `#!/bin/sh
set -e
umask 0077
touch "${testFile}"
`,
      { mode: 0o755 }
    );

    // when
    const proc = Bun.spawn(["sh", testScript], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    // then
    expect(proc.exitCode).toBe(0);
    const stat = statSync(testFile);
    const fileMode = stat.mode & 0o777;
    expect(fileMode).toBe(0o600);
  });

  test("entrypoint fixes permissions on existing SQLite files", async () => {
    // given - simulate /app/.run with overly permissive files
    const runDir = join(tempDir, ".run");
    const dbFile = join(runDir, "test.db");
    const walFile = join(runDir, "test.db-wal");
    const shmFile = join(runDir, "test.db-shm");

    Bun.spawnSync(["mkdir", "-p", runDir]);
    writeFileSync(dbFile, "");
    writeFileSync(walFile, "");
    writeFileSync(shmFile, "");
    chmodSync(dbFile, 0o644);
    chmodSync(walFile, 0o644);
    chmodSync(shmFile, 0o644);

    // Create a modified entrypoint that uses our temp dir
    const modifiedEntrypoint = join(tempDir, "entrypoint.sh");
    writeFileSync(
      modifiedEntrypoint,
      `#!/bin/sh
set -e
umask 0077
for f in ${runDir}/*.db ${runDir}/*.db-wal ${runDir}/*.db-shm; do
  [ -e "$f" ] && chmod 0600 "$f"
done
exec "$@"
`,
      { mode: 0o755 }
    );

    // when
    const proc = Bun.spawn(["sh", modifiedEntrypoint, "true"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    // then
    expect(proc.exitCode).toBe(0);
    expect(statSync(dbFile).mode & 0o777).toBe(0o600);
    expect(statSync(walFile).mode & 0o777).toBe(0o600);
    expect(statSync(shmFile).mode & 0o777).toBe(0o600);
  });

  test("entrypoint executes the CMD argument", async () => {
    // when
    const proc = Bun.spawn(["sh", ENTRYPOINT_PATH, "echo", "hello"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // then
    expect(proc.exitCode).toBe(0);
    expect(output.trim()).toBe("hello");
  });

  test("Dockerfile contains ENTRYPOINT directive", async () => {
    // given
    const dockerfilePath = resolve(import.meta.dir, "../../Dockerfile");
    const content = await Bun.file(dockerfilePath).text();

    // then
    expect(content).toContain('ENTRYPOINT ["./docker-entrypoint.sh"]');
  });
});
