/** Web Crypto SHA-256 helpers for proof content hashes + audit chain. */

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hash of filename + size + type + kind — stubs don't store file bytes. */
export async function proofContentHash(
  name: string,
  size: number,
  type: string,
  kind: string,
): Promise<string> {
  return sha256Hex(`${name}|${size}|${type}|${kind}`)
}

export async function chainHash(prevHash: string, payload: string): Promise<string> {
  return sha256Hex(`${prevHash}|${payload}`)
}
