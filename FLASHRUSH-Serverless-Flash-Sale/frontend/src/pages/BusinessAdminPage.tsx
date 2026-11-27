import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminTopbar } from "../components/admin/AdminTopbar";
import { AdminSidebar } from "../components/admin/AdminSidebar";
import { businessRequest } from "../services/accountService";
interface Person {
  id: string;
  username: string;
  name: string;
  email: string;
  enabled: boolean;
  status?: string;
  roles?: string[];
}
interface Stock {
  productId: string;
  name: string;
  stock: number;
}
interface Movement {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  actorId: string;
  createdAt: string;
}
export function BusinessAdminPage({
  section,
}: {
  section: "customers" | "users" | "inventory";
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [pid, setPid] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("support");
  const pending = useRef<{
    requestId: string;
    productId: string;
    delta: number;
    reason: string;
  } | null>(
    (() => {
      try {
        return JSON.parse(
          sessionStorage.getItem(
            `inventory-pending:${import.meta.env.VITE_API_BASE_URL}`,
          ) || "null",
        );
      } catch {
        return null;
      }
    })(),
  );
  async function load(next?: string) {
    setBusy(true);
    setError("");
    try {
      if (section === "inventory") {
        const [a, b] = await Promise.all([
          businessRequest("/admin/inventory"),
          businessRequest("/admin/inventory/movements"),
        ]);
        setStocks(a.items);
        setMovements(b.items);
      } else {
        const data = await businessRequest(
          `/admin/${section}${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        );
        setPeople((old) => (next ? [...old, ...data.items] : data.items));
        setCursor(data.nextCursor);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setPeople([]);
    setQuery("");
    if (pending.current) {
      setPid(pending.current.productId);
      setDelta(String(pending.current.delta));
      setReason(pending.current.reason);
    }
    load();
  }, [section]);
  async function adjust(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      pending.current ||= {
        requestId: crypto.randomUUID(),
        productId: pid,
        delta: Number(delta),
        reason,
      };
      sessionStorage.setItem(
        `inventory-pending:${import.meta.env.VITE_API_BASE_URL}`,
        JSON.stringify(pending.current),
      );
      await businessRequest(
        "/admin/inventory/adjustments",
        "POST",
        pending.current,
      );
      sessionStorage.removeItem(
        `inventory-pending:${import.meta.env.VITE_API_BASE_URL}`,
      );
      pending.current = null;
      setDelta("");
      setReason("");
      await load();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Lỗi"}. Giữ nguyên yêu cầu khi thử lại.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await businessRequest("/admin/users", "POST", { email, name, role });
      setEmail("");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể mời");
    } finally {
      setBusy(false);
    }
  }
  async function update(person: Person, changes: object) {
    setBusy(true);
    try {
      await businessRequest("/admin/users", "PATCH", {
        username: person.username,
        ...changes,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật");
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    customers: "Khách hàng",
    users: "Nhân viên và phân quyền",
    inventory: "Tồn kho",
  };
  return (
    <>
      <AdminTopbar />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" className="dash-admin-main">
          <header className="dash-admin-header">
            <h1>{titles[section]}</h1>
            <button
              className="button button-secondary"
              onClick={() => load()}
              disabled={busy}
            >
              Làm mới
            </button>
          </header>
          <div className="dash-admin-body dash-stack">
            {error && (
              <p role="alert" className="order-error">
                {error}
              </p>
            )}
            {busy && <p role="status">Đang xử lý...</p>}
            <label>
              Tìm kiếm
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tên, email hoặc mã sản phẩm"
              />
            </label>
            {section === "inventory" ? (
              <>
                <section className="dash-card business-table inventory-table"><table><thead><tr><th scope="col">Sản phẩm</th><th scope="col">Mã SKU</th><th scope="col">Tồn kho</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody>{stocks.filter(s=>`${s.name} ${s.productId}`.toLowerCase().includes(query.toLowerCase())).map(s=><tr key={s.productId}><th scope="row">{s.name}</th><td>{s.productId}</td><td className="stock-number">{s.stock.toLocaleString('vi-VN')}</td><td><span className={`stock-label ${s.stock===0?'is-empty':s.stock<=5?'is-low':''}`}>{s.stock===0?'Hết hàng':s.stock<=5?'Sắp hết':'Còn hàng'}</span></td><td><button className="text-link" disabled={busy||!!pending.current} onClick={()=>{setPid(s.productId);document.getElementById('inventory-adjustment')?.scrollIntoView({behavior:'smooth',block:'center'});}}>Điều chỉnh</button></td></tr>)}</tbody></table>{!stocks.length&&!busy&&<p>Chưa có sản phẩm.</p>}</section>
                <form id="inventory-adjustment" className="dash-card account-form" onSubmit={adjust}>
                  <h2>Nhập / xuất điều chỉnh</h2>
                  <label>
                    Sản phẩm
                    <select
                      required
                      disabled={!!pending.current}
                      value={pid}
                      onChange={(e) => setPid(e.target.value)}
                    >
                      <option value="">Chọn sản phẩm</option>
                      {stocks.map((s) => (
                        <option key={s.productId} value={s.productId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Số lượng thay đổi (+ nhập, − xuất)
                    <input
                      type="number"
                      step="1"
                      min={-10000}
                      max={10000}
                      required
                      disabled={!!pending.current}
                      value={delta}
                      onChange={(e) => setDelta(e.target.value)}
                    />
                  </label>
                  <label>
                    Lý do
                    <input
                      required
                      minLength={3}
                      maxLength={500}
                      disabled={!!pending.current}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button className="button button-primary" disabled={busy}>
                    {" "}
                    {pending.current
                      ? "Thử lại cùng yêu cầu"
                      : "Ghi nhận điều chỉnh"}{" "}
                  </button>
                </form>
                <section className="dash-card">
                  <h2>Lịch sử điều chỉnh gần nhất</h2>
                  <div className="business-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Sản phẩm</th>
                          <th>Thay đổi</th>
                          <th>Lý do</th>
                          <th>Người thực hiện</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => (
                          <tr key={m.id}>
                            <td>
                              {new Date(m.createdAt).toLocaleString("vi-VN")}
                            </td>
                            <td>{m.productId}</td>
                            <td>
                              {m.delta > 0 ? "+" : ""}
                              {m.delta}
                            </td>
                            <td>{m.reason}</td>
                            <td>{m.actorId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!movements.length && <p>Chưa có điều chỉnh.</p>}
                  </div>
                </section>
              </>
            ) : (
              <>
                {section === "users" && (
                  <form className="dash-card account-form" onSubmit={invite}>
                    <h2>Mời nhân viên qua email</h2>
                    <label>
                      Họ tên
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Vai trò
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="support">Chăm sóc khách hàng</option>
                        <option value="warehouse">Thủ kho</option>
                        <option value="manager">Quản lý</option>
                      </select>
                    </label>
                    <button className="button button-primary" disabled={busy}>
                      Gửi lời mời
                    </button>
                  </form>
                )}
                <section className="dash-card business-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Họ tên</th>
                        <th>Email</th>
                        <th>Trạng thái</th>
                        {section === "users" && (
                          <>
                            <th>Vai trò</th>
                            <th>Thao tác</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {people
                        .filter((p) =>
                          `${p.name} ${p.email}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              {p.name || "Chưa cập nhật"}
                              {section === "customers" && (
                                <button
                                  className="text-link"
                                  disabled={busy}
                                  onClick={async () => {
                                    const name = window.prompt(
                                      "Họ tên khách hàng",
                                      p.name,
                                    );
                                    if (!name?.trim()) return;
                                    setBusy(true);
                                    try {
                                      await businessRequest(
                                        "/admin/customers",
                                        "PATCH",
                                        {
                                          username: p.username,
                                          name: name.trim(),
                                        },
                                      );
                                      await load();
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : "Không thể cập nhật",
                                      );
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  Sửa họ tên
                                </button>
                              )}
                            </td>
                            <td>{p.email}</td>
                            <td>
                              {p.enabled ? p.status || "Hoạt động" : "Đã khóa"}
                            </td>
                            {section === "users" && (
                              <>
                                <td>
                                  <select
                                    aria-label={`Vai trò ${p.email}`}
                                    disabled={
                                      busy || p.roles?.includes("owner")
                                    }
                                    value={p.roles?.[0] || "customer"}
                                    onChange={(e) =>
                                      update(p, { role: e.target.value })
                                    }
                                  >
                                    {[
                                      "customer",
                                      "support",
                                      "warehouse",
                                      "manager",
                                      "owner",
                                    ].map((r) => (
                                      <option
                                        key={r}
                                        value={r}
                                        disabled={r === "owner"}
                                      >
                                        {r}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <button
                                    className="button button-secondary"
                                    disabled={
                                      busy || p.roles?.includes("owner")
                                    }
                                    onClick={() =>
                                      update(p, { enabled: !p.enabled })
                                    }
                                  >
                                    {p.enabled ? "Khóa" : "Mở khóa"}
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!people.length && !busy && <p>Chưa có tài khoản.</p>}
                  {cursor && (
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => load(cursor)}
                    >
                      Tải thêm
                    </button>
                  )}
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
