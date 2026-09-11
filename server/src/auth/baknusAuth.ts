import jwt from "jsonwebtoken";

export interface BaknusUser {
  id: string | number;
  email: string;
  name: string;
  token?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_change_me";
const BAKNUS_MAIL_API_URL = process.env.BAKNUS_MAIL_API_URL || "http://localhost:5000/api/auth/login";
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "baktinusantara666.sch.id,baknus.sch.id")
  .split(",")
  .map(d => d.trim().toLowerCase());

/**
 * Validasi apakah domain email terdaftar sebagai domain resmi Baknus
 */
export function isAllowedBaknusDomain(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  return ALLOWED_DOMAINS.some(allowed => domain === allowed || domain.endsWith("." + allowed));
}

/**
 * Verifikasi pengguna melalui JWT Token Baknus Mail atau Kredensial Langsung
 */
export async function authenticateBaknusUser(options: {
  token?: string;
  email?: string;
  password?: string;
}): Promise<BaknusUser> {
  // 1. Verifikasi via JWT Token (SSO / sesi tersimpan)
  if (options.token) {
    try {
      const decoded = jwt.verify(options.token, JWT_SECRET) as any;
      const email = (decoded.email || "").toLowerCase();

      if (!isAllowedBaknusDomain(email)) {
        throw new Error(`Domain email '${email}' tidak diizinkan! Hanya akun resmi Baknus.`);
      }

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

  // 2. Verifikasi via Email & Password langsung ke API Baknus Mail
  if (options.email && options.password) {
    const email = options.email.trim().toLowerCase();

    // Validasi domain email terlebih dahulu
    if (!isAllowedBaknusDomain(email)) {
      throw new Error(`Akses ditolak! Email '${email}' bukan domain resmi Baknus (${ALLOWED_DOMAINS.join(", ")}).`);
    }

    try {
      console.log(`[BaknusAuth] Mencoba autentikasi ke ${BAKNUS_MAIL_API_URL} untuk: ${email}`);
      const response = await fetch(BAKNUS_MAIL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: options.password })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as any;
        const msg = errorData?.error || "Email atau password Baknus Mail salah!";
        throw new Error(msg);
      }

      const data = (await response.json()) as any;
      const user = data?.user || {};
      const token = data?.token || jwt.sign({ id: user.id || 1, email }, JWT_SECRET, { expiresIn: "7d" });

      return {
        id: user.id || `baknus_${email}`,
        email: user.email || email,
        name: user.displayName || email.split("@")[0],
        token: token
      };
    } catch (err: any) {
      console.error(`[BaknusAuth] Error koneksi ke Baknus Mail API:`, err.message);

      // Jika dalam lingkungan development dan server backend baknusmail sedang offline, berikan fallback dev
      if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true") {
        console.warn(`[BaknusAuth DEV] Menggunakan mode dev bypass untuk testing: ${email}`);
        return {
          id: `dev_${email}`,
          email: email,
          name: email.split("@")[0]
        };
      }

      throw new Error(err.message || "Gagal memverifikasi akun ke server Baknus Mail.");
    }
  }

  throw new Error("Kredensial Baknus Mail (email & password atau token) wajib diisi!");
}
