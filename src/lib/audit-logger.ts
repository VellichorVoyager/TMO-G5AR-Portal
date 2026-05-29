import fs from "fs/promises"
import path from "path"

export async function logAuditAction(action: string, ip: string | null, details: any = {}) {
  const logFile = path.join(process.cwd(), "audit.log")
  const timestamp = new Date().toISOString()
  
  const entry = JSON.stringify({
    timestamp,
    action,
    ip: ip || "unknown",
    details,
  }) + "\n"

  try {
    await fs.appendFile(logFile, entry)
  } catch (error) {
    console.error("Failed to write to audit log:", error)
  }
}
