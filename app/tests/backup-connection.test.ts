import { expect, test } from "bun:test"
import { backupConnectionError, backupConnectionSchema, backupEndpoint, createBackupConnectionHandler, resolveBackupConnection, testBackupConnection, type BackupConnection, type BackupConnectionInput } from "../src/lib/backup-connection"
import { publicBackupSettings, type BackupSettings } from "../src/lib/backup"

const saved: BackupConnection = {
  provider: "r2", endpoint: "https://fixtureaccount.r2.cloudflarestorage.com", region: "auto",
  bucket: "fixture-bucket", prefix: "litestats", access_key: "saved-access-fixture", secret_key: "saved-secret-fixture",
}
const input = (patch: Partial<BackupConnectionInput> = {}): BackupConnectionInput => ({...saved, access_key: "", secret_key: "", ...patch})

test("public backup settings expose presence and schedule timezone without keys or raw errors", () => {
  const settings: BackupSettings = {...saved, enabled: true, schedule: "daily", hour: 3, minute: 0, weekday: 0, last_run_at: null, last_status: "error", last_error: `https://storage.invalid/?secret=${saved.secret_key}`, last_backup_id: null}
  const view = publicBackupSettings(settings)
  expect(view.access_key).toBe("")
  expect(view.secret_key).toBe("")
  expect(view.hasAccessKey && view.hasSecretKey && view.has_keys && view.configured).toBe(true)
  expect(view.scheduleTimezone.length).toBeGreaterThan(0)
  for (const secret of [saved.access_key, saved.secret_key, "storage.invalid"]) expect(JSON.stringify(view)).not.toContain(secret)
  expect(publicBackupSettings({...settings, access_key: ""}).configured).toBe(false)
})

test("blank and legacy masked fields retain saved keys only for the same provider and origin", () => {
  expect(resolveBackupConnection(input(), saved)).toEqual(saved)
  expect(resolveBackupConnection(input({access_key: "••••••••", secret_key: "••••••••"}), saved)).toEqual(saved)
  expect(resolveBackupConnection(input({bucket: "another-bucket", prefix: "new/path"}), saved)).toEqual({...saved, bucket: "another-bucket", prefix: "new/path"})
  expect(resolveBackupConnection(input({access_key: "new-access"}), saved).secret_key).toBe(saved.secret_key)
  for (const patch of [{endpoint: "https://otheraccount.r2.cloudflarestorage.com"}, {provider: "s3" as const, endpoint: "https://storage.example.com", region: "us-east-1"}]) {
    expect(() => resolveBackupConnection(input(patch), saved)).toThrow("重新填写 Access Key 和 Secret Key")
    expect(() => resolveBackupConnection(input({...patch, access_key: "new-access"}), saved)).toThrow("重新填写 Access Key 和 Secret Key")
    expect(resolveBackupConnection(input({...patch, access_key: "new-access", secret_key: "new-secret"}), saved).secret_key).toBe("new-secret")
  }
})

test("AWS default region switches require new keys; path changes keep the same custom origin", () => {
  const aws: BackupConnection = {...saved, provider: "s3", endpoint: "", region: "us-east-1"}
  expect(() => resolveBackupConnection({...aws, region: "eu-west-1", access_key: "", secret_key: ""}, aws)).toThrow("重新填写")
  const custom: BackupConnection = {...aws, endpoint: "https://storage.example.com/path"}
  expect(resolveBackupConnection({...custom, endpoint: "https://storage.example.com/another", access_key: "", secret_key: ""}, custom).secret_key).toBe(saved.secret_key)
  expect(resolveBackupConnection(input({access_key: "new-access", secret_key: "new-secret"}), {...saved, endpoint: "http://legacy.invalid"}).access_key).toBe("new-access")
})

test("endpoints accept actual R2 and public custom HTTPS S3, rejecting private/credential/query URLs", () => {
  for (const endpoint of [saved.endpoint, "https://fixtureaccount.eu.r2.cloudflarestorage.com", "https://fixtureaccount.fedramp.r2.cloudflarestorage.com"]) expect(backupEndpoint(endpoint, "r2")).not.toBeNull()
  for (const endpoint of ["", "https://s3.amazonaws.com", "https://storage.example.com:8443/s3/"]) expect(() => backupEndpoint(endpoint, "s3")).not.toThrow()
  for (const endpoint of ["http://storage.example.com", "https://user:secret@storage.example.com", "https://storage.example.com/?key=secret", "https://storage.example.com/#secret", "https://127.0.0.1", "https://169.254.169.254", "https://[::1]", "https://localhost", "https://storage.internal", "file:///tmp/backup"]) expect(() => backupEndpoint(endpoint, "s3")).toThrow()
  for (const endpoint of ["https://storage.example.com", "https://fixtureaccount.r2.cloudflarestorage.com.evil.example", "https://fixtureaccount.r2.cloudflarestorage.com/bucket"]) expect(() => backupEndpoint(endpoint, "r2")).toThrow()
})

test("storage schemas reject oversized fields, malformed buckets and control characters", () => {
  for (const patch of [{endpoint: "x".repeat(2049)}, {region: "x".repeat(65)}, {bucket: "x".repeat(64)}, {bucket: "bad/bucket"}, {prefix: "x".repeat(1025)}, {access_key: "x".repeat(1025)}, {secret_key: "x".repeat(1025)}, {access_key: "bad\nkey"}, {prefix: "bad\u0000prefix"}]) expect(backupConnectionSchema.safeParse(input(patch)).success).toBe(false)
})

test("non-admin testing cannot read saved credentials or contact object storage", async () => {
  let reads = 0, probes = 0
  const handler = createBackupConnectionHandler({admin: async () => {throw new Error("没有权限")}, read: async () => {reads++; return saved}, probe: async () => {probes++; throw new Error("unreachable")}})
  await expect(handler(input())).rejects.toThrow("没有权限")
  expect({reads, probes}).toEqual({reads: 0, probes: 0})
})

test("testing uses unsaved form values without changing saved settings or scheduling/writing backups", async () => {
  const stored = {...saved}, calls: BackupConnection[] = []
  const handler = createBackupConnectionHandler({admin: async () => undefined, read: async () => stored, probe: async connection => {calls.push(connection); return {ok: true, checkedAt: "fixture-time", bucket: connection.bucket, prefix: connection.prefix, verified: ["list"]}}})
  const result = await handler(input({bucket: "unsaved-bucket", prefix: "unsaved-prefix"}))
  expect(calls).toEqual([{...saved, bucket: "unsaved-bucket", prefix: "unsaved-prefix"}])
  expect(stored).toEqual(saved)
  expect(result.verified).toEqual(["list"])
  expect(result.bucket).toBe("unsaved-bucket")
  await expect(handler(input({endpoint: "https://otheraccount.r2.cloudflarestorage.com"}))).rejects.toThrow("重新填写")
  expect(calls.length).toBe(1)
})

test("probe only lists one object under the configured backup prefix and releases its client", async () => {
  const requests: unknown[] = []
  let destroys = 0
  const result = await testBackupConnection({...saved, prefix: "/nested/backup/"}, {client: async () => ({send: async (command, options) => {requests.push(command); expect(options.abortSignal.aborted).toBe(false); return {Contents: []}}, destroy: () => {destroys++}})})
  const command = requests[0] as {constructor: {name: string}, input: unknown}
  expect(requests.length).toBe(1)
  expect(command.constructor.name).toBe("ListObjectsV2Command")
  expect(command.input).toEqual({Bucket: saved.bucket, Prefix: "nested/backup/backups/", MaxKeys: 1})
  expect(result).toMatchObject({ok: true, bucket: saved.bucket, prefix: "nested/backup", verified: ["list"]})
  expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false)
  expect(destroys).toBe(1)
})

test("invalid/incomplete settings cannot create a client or make requests", async () => {
  let clients = 0
  const client = async () => {clients++; throw new Error("unreachable")}
  for (const config of [{...saved, endpoint: "http://127.0.0.1"}, {...saved, endpoint: ""}, {...saved, secret_key: ""}, {...saved, provider: "s3" as const, endpoint: "", region: "auto"}]) await expect(testBackupConnection(config, {client})).rejects.toThrow()
  expect(clients).toBe(0)
})

test("timeouts abort and release the client even if the provider never responds", async () => {
  let signal: AbortSignal | undefined, destroys = 0
  await expect(testBackupConnection(saved, {timeoutMs: 5, client: async (_connection, abortSignal) => {signal = abortSignal; return {send: async () => new Promise(() => undefined), destroy: () => {destroys++}}}})).rejects.toThrow("连接测试超时")
  expect(signal?.aborted).toBe(true)
  expect(destroys).toBe(1)
})

test("late client creation after timeout still releases resources without contacting storage", async () => {
  let destroys = 0, sends = 0
  await expect(testBackupConnection(saved, {timeoutMs: 2, client: async () => {await Bun.sleep(10); return {send: async () => {sends++}, destroy: () => {destroys++}}}})).rejects.toThrow("连接测试超时")
  await Bun.sleep(15)
  expect({destroys, sends}).toEqual({destroys: 1, sends: 0})
})

test("provider errors remain helpful but never expose response URLs or secrets", async () => {
  for (const [name, status, message] of [["AccessDenied", 403, "权限"], ["NoSuchBucket", 404, "未找到存储桶"], ["PermanentRedirect", 301, "区域不匹配"], ["ENOTFOUND", 0, "解析"], ["CERT_HAS_EXPIRED", 0, "证书"], ["unknown", 500, "无法连接"]] as const) {
    let destroys = 0
    try {
      await testBackupConnection(saved, {client: async () => ({send: async () => {throw Object.assign(new Error(`https://host.example/?secret=${saved.secret_key}`), {name, $metadata: {httpStatusCode: status}})}, destroy: () => {destroys++}})})
      throw new Error("expected failure")
    } catch (error) {
      expect((error as Error).message).toContain(message)
      for (const secret of [saved.secret_key, "https:"]) expect((error as Error).message).not.toContain(secret)
    }
    expect(destroys).toBe(1)
  }
  expect(backupConnectionError({code: `secret-${saved.secret_key}`})).not.toContain(saved.secret_key)
})
