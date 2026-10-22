import { Agent } from "node:https"
import { isIP } from "node:net"
import { z } from "zod"
import { connectionOptions, isPublicAddress } from "./site-check-network"

export const backupConnectionSchema = z.object({
  provider: z.enum(["r2", "s3"]),
  endpoint: z.string().trim().max(2048),
  region: z.string().trim().max(64).regex(/^[a-z0-9-]*$/, "Region 只能包含小写字母、数字和连字符"),
  bucket: z.string().trim().max(63).refine(value => !value || /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value), "请填写有效的存储桶名称"),
  prefix: z.string().trim().max(1024).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "前缀不能包含控制字符"),
  access_key: z.string().trim().max(1024).refine(value => !/[\u0000-\u0020\u007f]/.test(value), "Access Key 不能包含空白或控制字符").optional(),
  secret_key: z.string().trim().max(1024).refine(value => !/[\u0000-\u0020\u007f]/.test(value), "Secret Key 不能包含空白或控制字符").optional(),
})

export type BackupConnectionInput = z.infer<typeof backupConnectionSchema>
export type BackupConnection = Omit<BackupConnectionInput, "access_key" | "secret_key"> & {access_key: string, secret_key: string}
export type BackupConnectionResult = {ok: true, checkedAt: string, bucket: string, prefix: string, verified: ["list"]}

/** Only secure public storage origins may receive the signed credentials. */
export function backupEndpoint(value: string, provider: BackupConnection["provider"]): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, "")
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !host) throw new Error()
    if (isIP(host) && !isPublicAddress(host)) throw new Error()
    if (/^(localhost|.*\.(localhost|local|internal|invalid|test|onion))$/i.test(host)) throw new Error()
    if (provider === "r2" && (!/^[a-z0-9]+(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(host) || url.port || url.pathname !== "/")) throw new Error()
    return url
  } catch { throw new Error(provider === "r2" ? "请填写有效的 HTTPS R2 S3 API Endpoint" : "请填写有效的公网 HTTPS S3 Endpoint，不能包含凭据、查询参数或片段") }
}

function destination(connection: Pick<BackupConnection, "provider" | "endpoint" | "region">) {
  const url = backupEndpoint(connection.endpoint, connection.provider)
  // With AWS's default endpoint, Region determines the origin used by the SDK.
  return `${connection.provider}:${url?.origin || `aws:${connection.region || "us-east-1"}`}`
}

function suppliedKey(value: string | undefined) {
  return value && value !== "••••••••" ? value : ""
}

export function resolveBackupConnection(input: BackupConnectionInput, saved: BackupConnection): BackupConnection {
  const parsed = backupConnectionSchema.parse(input)
  const access = suppliedKey(parsed.access_key), secret = suppliedKey(parsed.secret_key)
  const nextDestination = destination(parsed)
  // Legacy invalid endpoints may be replaced, but never inherit stored credentials.
  let savedDestination: string | null = null
  try { savedDestination = destination(saved) } catch { /* explicit new credentials required */ }
  const sameDestination = nextDestination === savedDestination
  if (!sameDestination && (saved.access_key || saved.secret_key) && (!access || !secret)) {
    throw new Error("存储服务或 Endpoint 已更改，请重新填写 Access Key 和 Secret Key")
  }
  return {...parsed, access_key: access || (sameDestination ? saved.access_key : ""), secret_key: secret || (sameDestination ? saved.secret_key : "")}
}

export function backupPrefix(prefix: string) {
  return (prefix || "litestats").replace(/^\/+|\/+$/g, "")
}

export function requireBackupConnection(connection: BackupConnection) {
  backupEndpoint(connection.endpoint, connection.provider)
  if (connection.provider === "r2" && !connection.endpoint) throw new Error("请填写 R2 S3 API Endpoint")
  if (connection.provider === "s3" && (!connection.region || connection.region === "auto")) throw new Error("请填写 S3 Region，例如 us-east-1")
  if (!connection.bucket || !connection.access_key || !connection.secret_key) throw new Error("请填写存储桶、Access Key 和 Secret Key")
}

/** Never forward service response bodies, credential material or URLs to the browser. */
export function backupConnectionError(error: unknown, timedOut = false): string {
  const value = error as {name?: string, code?: string, $metadata?: {httpStatusCode?: number}, cause?: {code?: string}}
  const code = [value?.name, value?.code, value?.cause?.code].filter(Boolean).join(":")
  const status = value?.$metadata?.httpStatusCode
  if (timedOut || /Timeout|Abort|ETIMEDOUT/i.test(code)) return "连接测试超时，请检查 Endpoint 或稍后重试"
  if (status === 401 || status === 403 || /AccessDenied|InvalidAccessKey|SignatureDoesNotMatch|InvalidToken|ExpiredToken/.test(code)) return "认证或列出对象权限失败，请检查密钥和存储桶的读取权限"
  if (status === 404 || /NoSuchBucket|NotFound/.test(code)) return "未找到存储桶，请检查存储桶名称和 Endpoint"
  if (status === 301 || /PermanentRedirect|AuthorizationHeaderMalformed|IllegalLocationConstraint/.test(code)) return "存储桶区域不匹配，请检查 Region 和 Endpoint"
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "无法解析存储地址，请检查 Endpoint"
  if (/CERT|TLS|SSL/i.test(code)) return "存储地址的 HTTPS 证书验证失败"
  return "无法连接对象存储，请检查 Endpoint、Region、存储桶和权限后重试"
}

type ProbeClient = {send: (command: unknown, options: {abortSignal: AbortSignal}) => Promise<unknown>, destroy: () => void}
type ProbeOptions = {
  timeoutMs?: number
  client?: (connection: BackupConnection, signal: AbortSignal) => Promise<ProbeClient>
}

async function storageProbeClient(connection: BackupConnection, signal: AbortSignal): Promise<ProbeClient> {
  const {S3Client} = await import("@aws-sdk/client-s3")
  // Resolve and pin public answers for every destination requested by the SDK.
  const agent = new Agent({
    keepAlive: false,
    rejectUnauthorized: true,
    lookup: (host, options, callback) => {
      connectionOptions(host, signal).then(pinned => pinned.lookup(host, options, callback), () => callback(new Error("Storage hostname is unavailable"), "", 4))
    },
  })
  const client = new S3Client({
    region: connection.region || "auto",
    endpoint: connection.endpoint || undefined,
    forcePathStyle: connection.provider === "r2" || !!connection.endpoint,
    credentials: {accessKeyId: connection.access_key, secretAccessKey: connection.secret_key},
    maxAttempts: 1,
    followRegionRedirects: false,
    ignoreConfiguredEndpointUrls: true,
    requestHandler: {httpsAgent: agent, connectionTimeout: 5_000, requestTimeout: 12_000},
  })
  return {
    send: (command, options) => client.send(command as import("@aws-sdk/client-s3").ListObjectsV2Command, options),
    destroy: () => {client.destroy(); agent.destroy()},
  }
}

/** A bounded, read-only list proves connection and listing only, never write/restore. */
export async function testBackupConnection(connection: BackupConnection, options: ProbeOptions = {}): Promise<BackupConnectionResult> {
  requireBackupConnection(connection)
  const controller = new AbortController()
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 12_000, 15_000))
  let client: ProbeClient | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {controller.abort(); reject(new Error("timeout"))}, timeoutMs)
  })
  try {
    const run = async () => {
      const {ListObjectsV2Command} = await import("@aws-sdk/client-s3")
      controller.signal.throwIfAborted()
      const activeClient = await (options.client || storageProbeClient)(connection, controller.signal)
      if (controller.signal.aborted) {activeClient.destroy(); controller.signal.throwIfAborted()}
      client = activeClient
      controller.signal.throwIfAborted()
      await client.send(new ListObjectsV2Command({Bucket: connection.bucket, Prefix: `${backupPrefix(connection.prefix)}/backups/`, MaxKeys: 1}), {abortSignal: controller.signal})
      return {ok: true as const, checkedAt: new Date().toISOString(), bucket: connection.bucket, prefix: backupPrefix(connection.prefix), verified: ["list"] as ["list"]}
    }
    return await Promise.race([run(), timeout])
  } catch (error) {
    throw new Error(backupConnectionError(error, controller.signal.aborted))
  } finally {
    clearTimeout(timer)
    client?.destroy()
  }
}

type BackupConnectionDependencies = {
  admin: () => Promise<unknown>
  read: () => Promise<BackupConnection>
  probe: (connection: BackupConnection) => Promise<BackupConnectionResult>
}

export function createBackupConnectionHandler(dependencies: BackupConnectionDependencies) {
  return async (input: BackupConnectionInput) => {
    await dependencies.admin()
    const parsed = backupConnectionSchema.parse(input)
    const saved = await dependencies.read()
    return dependencies.probe(resolveBackupConnection(parsed, saved))
  }
}
