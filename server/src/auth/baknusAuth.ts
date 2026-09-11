import jwt from "jsonwebtoken";
import { ImapFlow } from "imapflow";

export interface BaknusUser {
  id: string | number;
  email: string;
  name: string;
  token?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_change_me";
const MAIL_HOST = process.env.MAIL_HOST || "mail.smk.baktinusantara666.sch.id";
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const DEFAULT_DOMAIN = process.env.DEFAULT_EMAIL_DOMAIN || "smk.baktinusantara666.sch.id";
const BAKNUS_MAIL_API_URL = process.env.BAKNUS_MAIL_API_URL || "http://localhost:5000/api/auth/login";

/**
 * Normalisasi input menjadi full email resmi Baknus
 * Contoh: "frian_p" -> "frian_p@smk.baktinusantara666.sch.id"
 */
export function normalizeEmail(input: string): string {
  if (!input) return "";
  const cleaned = input.trim().toLowerCase();
  if (cleaned.includes("@")) {
    return cleaned;
  }
  return `${cleaned}@${DEFAULT_DOMAIN}`;
}

/**
 * Verifikasi kredensial langsung ke server IMAP Mailcow Baknus Mail
 */
async function verifyViaImap(email: string, password: string): Promise<boolean> {
  const client = new ImapFlow({
    host: MAIL_HOST,
    port: IMAP_PORT,
    secure: IMAP_PORT === 993,
    auth: {
      user: email,
      pass: password
    },
    logger: false,
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log(`[BaknusAuth IMAP] Mencoba autentikasi ke ${MAIL_HOST}:${IMAP_PORT} untuk: ${email}`);
    await client.connect();
    await client.logout();
    console.log(`[BaknusAuth IMAP] Kredensial VALID untuk: ${email}`);
    return true;
  } catch (err: any) {
    console.warn(`[BaknusAuth IMAP] Gagal autentikasi untuk ${email}:`, err.message);
    try {
      await client.logout();
    } catch (_) {}
    return false;
  }
}

/**
 * Verifikasi pengguna melalui JWT Token atau Kredensial Langsung
 */
export async function authenticateBaknusUser(options: {
  token?: string;
  email?: string;
  username?: string;
  password?: string;
}): Promise<BaknusUser> {
  // 1. Verifikasi via JWT Token (SSO / sesi tersimpan)
  if (options.token) {
    try {
      const decoded = jwt.verify(options.token, JWT_SECRET) as any;
      const email = normalizeEmail(decoded.email || "");

      return {
        id: decoded.id || `baknus_${email}`,
        email: email,
        name: decoded.displayName || email.split("@")[0],
        token: options.token
      };
    } catch (err: any) {
      console.warn(`[BaknusAuth] JWT verify gagal:`, err.message);
      throw new Error(`Token Baknus Mail tidak valid atau telah kedaluwarsa.`);
    }
  }

  // 2. Verifikasi via Kredensial Langsung (Username / Email & Password)
  const rawIdentifier = options.username || options.email;
  if (rawIdentifier && options.password) {
    const email = normalizeEmail(rawIdentifier);
    const username = email.split("@")[0];

    // Coba Verifikasi Utama: Langsung ke server IMAP Baknus (Port 993)
    const isImapValid = await verifyViaImap(email, options.password);

    if (isImapValid) {
      const token = jwt.sign({ id: `baknus_${username}`, email }, JWT_SECRET, { expiresIn: "7d" });
      return {
        id: `baknus_${username}`,
        email: email,
        name: username,
        token: token
      };
    }

    // Fallback: Jika IMAP gagal, coba ke API endpoint jika tersedia
    try {
      console.log(`[BaknusAuth API] Mencoba fallback API ke ${BAKNUS_MAIL_API_URL} untuk ${email}`);
      const response = await fetch(BAKNUS_MAIL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: options.password })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const user = data?.user || {};
        const token = data?.token || jwt.sign({ id: user.id || 1, email }, JWT_SECRET, { expiresIn: "7d" });

        return {
          id: user.id || `baknus_${username}`,
          email: user.email || email,
          name: user.displayName || username,
          token: token
        };
      }
    } catch (apiErr: any) {
      console.warn(`[BaknusAuth API] Fallback API tidak dapat dijangkau:`, apiErr.message);
    }

    // Jika development mode bypass aktif
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true") {
      console.warn(`[BaknusAuth DEV] Mode dev bypass: ${email}`);
      return {
        id: `dev_${username}`,
        email: email,
        name: username
      };
    }

    throw new Error(`Username atau password Baknus Mail salah!`);
  }

  throw new Error("Username dan password Baknus Mail wajib diisi!");
}
