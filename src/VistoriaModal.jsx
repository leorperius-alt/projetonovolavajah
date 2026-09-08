import React, { useState, useRef } from "react";
import { X, Camera, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import * as db from "./lib/db";

// Shell de modal mais largo que o padrão (o padrão é max-w-md), pra caber
// o diagrama do carro + fotos com folga. Mantido separado do ModalShell
// principal do LavaJaApp.jsx pra não criar import circular entre os dois arquivos.
function VistoriaShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-[var(--surface)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
          <h2 className="font-display font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text)]">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Diagrama do carro (visão de cima), simples e genérico.
// onDiagramClick recebe {x, y} em porcentagem (0-100) relativa ao desenho.
function CarDiagram({ marks, onDiagramClick, readOnly }) {
  const svgRef = useRef(null);

  const handleClick = (e) => {
    if (readOnly || !onDiagramClick) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onDiagramClick({ x, y });
  };

  const stroke = "var(--border)";
  const fill = "var(--bg)";

  return (
    <div className="relative w-full max-w-[220px] mx-auto select-none">
      <p className="text-center text-[10px] text-[var(--text-muted)] mb-1">FRENTE</p>
      <svg
        ref={svgRef}
        viewBox="0 0 240 440"
        onClick={handleClick}
        className={readOnly ? "" : "cursor-crosshair"}
        style={{ width: "100%", height: "auto" }}
      >
        {/* carroceria */}
        <rect x="20" y="20" width="200" height="400" rx="60" fill={fill} stroke={stroke} strokeWidth="3" />
        {/* para-brisa dianteiro */}
        <rect x="55" y="70" width="130" height="55" rx="10" fill="none" stroke={stroke} strokeWidth="2" />
        {/* cabine / teto */}
        <rect x="48" y="135" width="144" height="170" rx="14" fill="none" stroke={stroke} strokeWidth="2" />
        {/* vidro traseiro */}
        <rect x="55" y="315" width="130" height="50" rx="10" fill="none" stroke={stroke} strokeWidth="2" />
        {/* retrovisores */}
        <rect x="6" y="110" width="16" height="26" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
        <rect x="218" y="110" width="16" height="26" rx="4" fill={fill} stroke={stroke} strokeWidth="2" />
        {/* rodas */}
        <rect x="2" y="95" width="22" height="65" rx="8" fill={stroke} opacity="0.5" />
        <rect x="216" y="95" width="22" height="65" rx="8" fill={stroke} opacity="0.5" />
        <rect x="2" y="285" width="22" height="65" rx="8" fill={stroke} opacity="0.5" />
        <rect x="216" y="285" width="22" height="65" rx="8" fill={stroke} opacity="0.5" />

        {marks.map((m, i) => {
          const tipo = db.INSPECTION_MARK_TYPES.find((t) => t.value === m.tipo) || db.INSPECTION_MARK_TYPES[0];
          return (
            <circle
              key={i}
              cx={(m.x / 100) * 240}
              cy={(m.y / 100) * 440}
              r="9"
              fill={tipo.color}
              stroke="#fff"
              strokeWidth="2"
              style={{ cursor: readOnly ? "default" : "pointer" }}
            />
          );
        })}
      </svg>
      <p className="text-center text-[10px] text-[var(--text-muted)] mt-1">TRÁS</p>
    </div>
  );
}

function MarkTypeLegend({ tipoAtual, setTipoAtual }) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {db.INSPECTION_MARK_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => setTipoAtual(t.value)}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
            tipoAtual === t.value ? "border-[var(--text)]" : "border-[var(--border)] opacity-70"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---- Modal: fazer a vistoria antes de iniciar a lavagem ----
export function VistoriaModal({ data, companyId, myUserId, order, refetch, close }) {
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);

  const [tipoAtual, setTipoAtual] = useState("arranhao");
  const [marks, setMarks] = useState([]);
  const [photos, setPhotos] = useState([]); // { file, previewUrl }
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const addMark = ({ x, y }) => setMarks((prev) => [...prev, { x, y, tipo: tipoAtual }]);
  const removeLastMark = () => setMarks((prev) => prev.slice(0, -1));

  const handleFiles = (e) => {
    const restantes = 6 - photos.length;
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, restantes));
    const novas = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...novas]);
    e.target.value = "";
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const avancarParaLavagem = async () => {
    await db.updateOrderStatus(order.id, "lavando");
    refetch();
    close();
  };

  const salvarESeguir = async () => {
    if (saving) return;
    setSaving(true);
    setErro("");
    try {
      const photoUrls = [];
      for (const p of photos) {
        const url = await db.uploadInspectionPhoto(companyId, order.id, p.file);
        photoUrls.push(url);
      }
      await db.saveVehicleInspection(companyId, {
        orderId: order.id,
        vehicleId: order.vehicle_id,
        userId: myUserId,
        status: "realizada",
        marks,
        observations,
        photoUrls,
      });
      await avancarParaLavagem();
    } catch (err) {
      console.error(err);
      setErro("Não deu pra salvar a vistoria. Confira sua internet e tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const pularVistoria = async () => {
    if (saving) return;
    setSaving(true);
    setErro("");
    try {
      await db.saveVehicleInspection(companyId, {
        orderId: order.id,
        vehicleId: order.vehicle_id,
        userId: myUserId,
        status: "pulada",
      });
      await avancarParaLavagem();
    } catch (err) {
      console.error(err);
      setErro("Não deu pra pular agora. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <VistoriaShell title={`Vistoria — ${vehicle?.plate || "veículo"}${vehicle?.model ? " · " + vehicle.model : ""}`} onClose={close}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Marque no desenho onde tem arranhão, amassado ou outro dano. Isso ajuda a evitar reclamação depois da lavagem.
        </p>

        <MarkTypeLegend tipoAtual={tipoAtual} setTipoAtual={setTipoAtual} />

        <CarDiagram marks={marks} onDiagramClick={addMark} />

        {marks.length > 0 && (
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] -mt-2">
            <span>{marks.length} ponto(s) marcado(s)</span>
            <button onClick={removeLastMark} className="text-rose-400 hover:text-rose-300 font-medium">
              Desfazer último
            </button>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Fotos (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--border)]">
                <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className="w-16 h-16 rounded-lg border border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] cursor-pointer hover:border-zinc-400">
                <Camera size={18} />
                <span className="text-[9px]">Adicionar</span>
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Observações (opcional)</p>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            placeholder="Ex: risco no para-choque traseiro, já veio com o carro"
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] resize-none"
          />
        </div>

        {erro && <p className="text-sm text-rose-400">{erro}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={salvarESeguir}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-lg py-3"
          >
            <CheckCircle2 size={16} /> {saving ? "Salvando..." : "Salvar vistoria e iniciar lavagem"}
          </button>
          <button onClick={pularVistoria} disabled={saving} className="w-full text-center text-xs text-[var(--text-secondary)] hover:text-[var(--text)] py-1 disabled:opacity-60">
            Pular vistoria e iniciar lavagem
          </button>
        </div>
      </div>
    </VistoriaShell>
  );
}

// ---- Modal: ver uma vistoria já feita (somente leitura) ----
export function VistoriaViewModal({ data, order, close }) {
  const inspection = data.vehicleInspections?.find((v) => v.order_id === order.id);
  const customer = data.customers.find((c) => c.id === order.customer_id);
  const vehicle = customer?.vehicles.find((v) => v.id === order.vehicle_id);

  if (!inspection) {
    return (
      <VistoriaShell title="Vistoria" onClose={close}>
        <p className="text-sm text-[var(--text-secondary)]">Nenhuma vistoria registrada para esse veículo.</p>
      </VistoriaShell>
    );
  }

  if (inspection.status === "pulada") {
    return (
      <VistoriaShell title={`Vistoria — ${vehicle?.plate || "veículo"}`} onClose={close}>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <AlertTriangle size={28} className="text-amber-400" />
          <p className="text-sm text-[var(--text-secondary)]">A vistoria desse veículo foi pulada antes de iniciar a lavagem.</p>
        </div>
      </VistoriaShell>
    );
  }

  const marks = inspection.marks || [];
  const photos = inspection.photo_urls || [];

  return (
    <VistoriaShell title={`Vistoria — ${vehicle?.plate || "veículo"}`} onClose={close}>
      <div className="flex flex-col gap-4">
        <CarDiagram marks={marks} readOnly />

        {marks.length === 0 ? (
          <p className="text-sm text-center text-emerald-400">Nenhuma avaria marcada — carro entrou sem danos aparentes.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {db.INSPECTION_MARK_TYPES.map((t) => {
              const count = marks.filter((m) => m.tipo === t.value).length;
              if (!count) return null;
              return (
                <span key={t.value} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  {count}x {t.label}
                </span>
              );
            })}
          </div>
        )}

        {inspection.observations && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">Observações</p>
            <p className="text-sm text-[var(--text)]">{inspection.observations}</p>
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">Fotos</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)] block">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[var(--text-muted)]">
          Registrada em {new Date(inspection.created_at).toLocaleString("pt-BR")}
        </p>
      </div>
    </VistoriaShell>
  );
}
