import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminTopbar } from '../components/admin/AdminTopbar';
import { AdminPageHeader, AdminRefreshButton } from '../components/admin/AdminPageHeader';
import { adminErrorMessage, adminHeaders } from '../services/adminAuth';
import { VoucherPresetPanel, type VoucherDraft } from '../components/admin/VoucherPresetPanel';
import { formatPrice } from '../utils/product';

interface Voucher { code:string; type:'percent'|'fixed'; value:number; minSpend:number; maxDiscount:number; usageLimit:number; usedCount:number; startsAt:string; endsAt:string; enabled:boolean; version:number }
const initial = (): Voucher => ({ code:'', type:'percent', value:10, minSpend:0, maxDiscount:0, usageLimit:100, usedCount:0, startsAt:new Date().toISOString(), endsAt:new Date(Date.now()+7*86400000).toISOString(), enabled:true, version:0 });
const local = (value:string) => new Date(Date.parse(value)-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16);
async function request(method='GET', data?:Record<string,unknown>) { const response = await fetch(`${String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/,'')}/admin/vouchers`, { method, headers:{'Content-Type':'application/json', ...adminHeaders()}, body:data ? JSON.stringify(data) : undefined }); const value = await response.json(); if (!response.ok) throw new Error(value.error?.code || 'Không thể xử lý voucher.'); return value; }

export function AdminVouchersPage() {
  const [presets,setPresets] = useState<VoucherDraft[]>([]);
  const [notice,setNotice] = useState('');
  const [items,setItems] = useState<Voucher[]>([]); const [draft,setDraft] = useState<Voucher>(); const [editing,setEditing] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [search,setSearch] = useState('');
  async function load() { setBusy(true); setError(''); try { const data = await request(); setItems(data.items); setPresets(data.presets || []); } catch (reason) { setError(adminErrorMessage(reason,'Không thể tải voucher.')); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
 async function createPresets(){
  setBusy(true);setError('');setNotice('');let created=0;
  try{for(const preset of presets.filter(p=>!items.some(item=>item.code===p.code))){
   try{await request('POST',{...preset});created++;}catch(reason){if(!(reason instanceof Error)||reason.message!=='VOUCHER_EXISTS')throw reason;}
  }await load();setNotice(`Đã phát hành ${created} mã mới. Các mã đã có được giữ nguyên.`);}
  catch(reason){setError(reason instanceof Error?reason.message:'Không thể phát hành.');setNotice(`Đã tạo ${created} mã. Tải lại để kiểm tra trước khi thử tiếp.`);}
  finally{setBusy(false);}
 }
  async function save(event:FormEvent) { event.preventDefault(); if (!draft) return; setBusy(true); setError(''); try { const data=Object.fromEntries(['code','type','value','minSpend','maxDiscount','usageLimit','startsAt','endsAt','enabled','version'].map(key => [key,draft[key as keyof Voucher]])); await request(editing?'PATCH':'POST',data); setDraft(undefined); await load(); } catch (reason) { setError(adminErrorMessage(reason,'Không thể lưu.')); } finally { setBusy(false); } }
  const shown = items.filter(item => item.code.includes(search.toUpperCase()));
  return <><AdminTopbar/><div className="dash-admin"><AdminSidebar/><main id="main-content" className="dash-admin-main">
    <AdminPageHeader title="Voucher" description="Tạo và quản lý ưu đãi dành cho khách hàng." actions={<><AdminRefreshButton onClick={() => void load()} disabled={busy}/><button className="button button-primary" onClick={() => { setDraft(initial()); setEditing(false); }}>＋ Tạo voucher</button></>}/>
    <div className="dash-admin-body dash-stack">{notice&&<p role="status">{notice}</p>}<VoucherPresetPanel presets={presets} existing={items.map(item=>item.code)} busy={busy} onPick={preset=>{setDraft({...preset,usedCount:0,version:0});setEditing(false);}} onCreateAll={()=>void createPresets()}/><section className="dash-card business-table">
      <div className="dash-section-heading"><h2 className="sr-only">Danh sách voucher</h2></div>{error && <p role="alert" className="order-error">{error}</p>}
      <div className="admin-search-toolbar"><label htmlFor="voucher-search"><span>Tìm mã voucher</span><span className="admin-search-input"><Search size={16} aria-hidden="true"/><input id="voucher-search" placeholder="Tìm mã voucher theo mã giảm giá" value={search} onChange={event => setSearch(event.target.value)}/></span></label></div>
      {busy && <p role="status">Đang tải…</p>}
      <table><thead><tr><th>Mã</th><th>Ưu đãi</th><th>Đơn tối thiểu</th><th>Lượt dùng</th><th>Hết hạn</th><th>Trạng thái</th><th/></tr></thead><tbody>
        {shown.length ? shown.map(v => { const status=!v.enabled?'Đã tắt':Date.now()>=Date.parse(v.endsAt)?'Hết hạn':Date.now()<Date.parse(v.startsAt)?'Chưa bắt đầu':v.usedCount>=v.usageLimit?'Hết lượt':'Đang hoạt động'; const tone=status==='Đang hoạt động'?'':'is-empty'; return <tr key={v.code}><th scope="row">{v.code}</th><td>{v.type==='percent'?`${v.value}%`:formatPrice(v.value)}{v.maxDiscount>0&&<small> · tối đa {formatPrice(v.maxDiscount)}</small>}</td><td>{formatPrice(v.minSpend)}</td><td>{v.usedCount}/{v.usageLimit}</td><td>{new Date(v.endsAt).toLocaleString('vi-VN')}</td><td><span className={`stock-label ${tone}`}>{status}</span></td><td><button className="text-link" onClick={() => { setDraft(v); setEditing(true); }}>Sửa</button></td></tr>; }) : !busy && <tr><td colSpan={7}><div className="empty-state"><p>Chưa có voucher phù hợp.</p><button className="button button-primary" onClick={() => { setDraft(initial()); setEditing(false); }}>＋ Tạo voucher đầu tiên</button></div></td></tr>}
      </tbody></table>
    </section>
    {draft && <form className="dash-card account-form" onSubmit={save}><h2>{editing?'Sửa voucher':'Voucher mới'}</h2><label>Mã<input required pattern="[A-Z0-9_-]{3,32}" disabled={editing} value={draft.code} onChange={event => setDraft({...draft,code:event.target.value.toUpperCase()})}/></label><label>Loại giảm<select value={draft.type} onChange={event => setDraft({...draft,type:event.target.value as Voucher['type']})}><option value="percent">Phần trăm</option><option value="fixed">Số tiền</option></select></label>{([['value','Giá trị giảm'],['minSpend','Đơn tối thiểu (₫)'],['maxDiscount','Trần giảm (₫), 0 = không giới hạn'],['usageLimit','Tổng lượt dùng']] as const).map(([key,label]) => <label key={key}>{label}<input type="number" step="1" min={key==='value'||key==='usageLimit'?1:0} max={key==='value'&&draft.type==='percent'?100:undefined} required value={draft[key]} onChange={event => setDraft({...draft,[key]:Number(event.target.value)})}/></label>)}<label>Bắt đầu<input type="datetime-local" required value={local(draft.startsAt)} onChange={event => event.target.value&&setDraft({...draft,startsAt:new Date(event.target.value).toISOString()})}/></label><label>Kết thúc<input type="datetime-local" required value={local(draft.endsAt)} onChange={event => event.target.value&&setDraft({...draft,endsAt:new Date(event.target.value).toISOString()})}/></label><label><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({...draft,enabled:event.target.checked})}/>Cho phép sử dụng</label><p>Mỗi tài khoản dùng một lần. Lượt chỉ được ghi nhận khi đơn xác nhận.</p><div className="dash-table-actions"><button className="button button-primary" disabled={busy}>Lưu</button><button type="button" className="button button-secondary" onClick={() => setDraft(undefined)}>Hủy</button></div></form>}
    </div></main></div></>;
}
