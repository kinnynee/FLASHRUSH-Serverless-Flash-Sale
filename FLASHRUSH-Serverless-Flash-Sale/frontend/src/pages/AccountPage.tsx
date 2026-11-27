import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
  const [orders, setOrders] = useState<
    { orderId: string; status: string; quantity: number }[]
  >([]);
  async function load() {
    const user = await businessRequest("/auth/me");
    setAccount(user);
    const data = await businessRequest("/me/orders");
    setOrders(data.items);
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
    <div className="container account-page">
      <h1>{account ? "Tài khoản của bạn" : labels[mode]}</h1>
      {message && (
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
            {account.roles.length > 0 && <Link to="/admin">Mở quản trị</Link>}
            <button
              className="button button-secondary"
              onClick={async () => {
                await logout().catch(() => {});
                setAccount(undefined);
                setOrders([]);
              }}
            >
              Đăng xuất
            </button>
          </section>
          <section className="order-panel">
            <h2>Đơn hàng đã gắn tài khoản</h2>
            {orders.length ? (
              orders.map((order) => (
                <p key={order.orderId}>
                  {order.orderId} · {order.quantity} sản phẩm · {order.status}
                </p>
              ))
            ) : (
              <p>
                Chưa có đơn hàng gắn tài khoản. Đơn khách vãng lai được giữ
                riêng trên trình duyệt.
              </p>
            )}
          </section>
        </>
      ) : (
        <form className="order-panel account-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
              <input
                type="password"
                required
                minLength={mode === "login" ? undefined : 12}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
          <button className="button button-primary" disabled={busy}>
            {busy ? "Đang xử lý..." : labels[mode]}
          </button>
          <div className="account-links">
            {(["login", "register", "confirm", "forgot-password"] as Mode[])
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
