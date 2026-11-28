import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Mail } from "lucide-react";
import "../styles/staff-login.css";
import { BrandLogo } from "../components/layout/BrandLogo";
import {
  accessToken,
  businessRequest,
  login,
  logout,
  type Account,
} from "../services/accountService";

type Mode =
  | "login"
  | "register"
  | "confirm"
  | "forgot-password"
  | "reset-password"
  | "new-password";
export function AccountPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [account, setAccount] = useState<Account>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const user = await businessRequest("/auth/me");
    setAccount(user);
  }
  useEffect(() => {
    if (accessToken())
      load().catch(() => setMessage("Phiên hết hạn. Vui lòng đăng nhập lại."));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login" || mode === "new-password") {
        const data = await login(
          email,
          password,
          mode === "new-password" ? challenge : undefined,
        );
        if (data.challenge === "NEW_PASSWORD_REQUIRED") {
          setChallenge(data.session);
          setMode("new-password");
          setPassword("");
          setMessage("Đặt mật khẩu mới để hoàn tất đăng nhập.");
        } else {
          await load();
          setPassword("");
        }
      } else {
        await businessRequest(`/auth/${mode}`, "POST", {
          email,
          password,
          name,
          code,
        });
        if (mode === "register") {
          setMode("confirm");
          setMessage("Kiểm tra email để lấy mã xác nhận.");
        } else if (mode === "forgot-password") {
          setMode("reset-password");
          setMessage("Nhập mã từ email và mật khẩu mới.");
        } else {
          setMode("login");
          setMessage("Thành công. Bạn có thể đăng nhập.");
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Yêu cầu thất bại.");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<Mode, string> = {
    login: "Đăng nhập",
    register: "Tạo tài khoản",
    confirm: "Xác nhận email",
    "forgot-password": "Quên mật khẩu",
    "reset-password": "Đặt lại mật khẩu",
    "new-password": "Đổi mật khẩu lần đầu",
  };
  return (
    <div className={account ? "container account-page" : "staff-login-page"}>
      {account && <h1>Tài khoản của bạn</h1>}
      {account && message && (
        <p role="status" className="order-notice">
          {message}
        </p>
      )}
      {account ? (
        <>
          <section className="order-panel">
            <h2>{account.name || account.email}</h2>
            <p>{account.email}</p>
            <p>Vai trò: {account.roles.join(", ") || "Khách hàng"}</p>
            {account.roles.length > 0 && <Link to={account.roles.every(role => role === 'warehouse') ? '/admin/inventory' : '/admin'}>Mở quản trị</Link>}
            <button
              className="button button-secondary"
              onClick={async () => {
                await logout().catch(() => {});
                setAccount(undefined);
              }}
            >
              Đăng xuất
            </button>
          </section>

        </>
      ) : (
        <form className="staff-login-card" onSubmit={submit}>
          <BrandLogo />
          <h1>{mode === "login" ? "Đăng nhập Admin" : labels[mode]}</h1>
          {message && <p role="status" className="order-notice">{message}</p>}
          <label>
            Email
            <span className="staff-login-input">
              <Mail size={19} strokeWidth={1.6} aria-hidden="true" />
            <input
              type="email"
              placeholder="Nhập email..."
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            </span>
          </label>
          {mode === "register" && (
            <label>
              Họ tên
              <input
                required
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {["login", "register", "reset-password", "new-password"].includes(
            mode,
          ) && (
            <label>
              Mật khẩu
              <span className="staff-login-input">
                <LockKeyhole size={19} strokeWidth={1.6} aria-hidden="true" />
              <input
                type="password"
                placeholder="Nhập mật khẩu..."
                required
                minLength={mode === "login" ? undefined : 12}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              </span>
            </label>
          )}
          {["confirm", "reset-password"].includes(mode) && (
            <label>
              Mã xác nhận
              <input
                required
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <button className="staff-login-submit" disabled={busy}>
            {busy ? "Đang xử lý..." : labels[mode]}
          </button>
          <div className="staff-login-links">
            {(["login", "forgot-password"] as Mode[])
              .filter((v) => v !== mode)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setMode(v);
                    setMessage("");
                  }}
                >
                  {labels[v]}
                </button>
              ))}
          </div>
        </form>
      )}
    </div>
  );
}
