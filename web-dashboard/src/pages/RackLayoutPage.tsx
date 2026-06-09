import { useEffect, useState } from "react";
import { api, autoName } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";

type Port = {
  id: string; type: "intake" | "exhaust"; label: string; box: number;
  assignedEui?: string | null; assignedProbeRom?: string | null; probeLabel?: string | null;
};
type Unit = { id: string; name: string; ports: Port[] };
type Rack = { id: string; name: string; units: Unit[] };

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export default function RackLayoutPage() {
  const { isAdmin } = useAuth();
  const [racks, setRacks] = useState<Rack[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [probesByEui, setProbesByEui] = useState<Record<string, { rom: string; temp: number | null }[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // inline assign form: which port + the picked sensor/probe
  const [assignPort, setAssignPort] = useState<string | null>(null);
  const [aEui, setAEui] = useState("");
  const [aRom, setARom] = useState("");

  async function load() {
    try {
      const [t, dev, cur] = await Promise.all([
        api.topology(),
        api.devices().catch(() => ({ devices: [] })),
        api.current().catch(() => ({ sensors: [] })),
      ]);
      setRacks(t.topology?.racks || []);
      const nm: Record<string, string> = {};
      for (const d of dev.devices || []) {
        if (String(d.kind) !== "sensor") continue;
        const eui = String(d.eui).toLowerCase();
        nm[eui] = d.name || autoName(eui, "sensor");
      }
      const pm: Record<string, { rom: string; temp: number | null }[]> = {};
      for (const s of cur.sensors || []) {
        const eui = String(s.eui).toLowerCase();
        if (!nm[eui]) nm[eui] = autoName(eui, "sensor");
        if (!s.rom) continue;
        (pm[eui] ||= []);
        if (!pm[eui].some((p) => p.rom === s.rom))
          pm[eui].push({ rom: String(s.rom), temp: s.temp != null ? Number(s.temp) : null });
      }
      setNames(nm);
      setProbesByEui(pm);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Could not reach the cloud server.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function mutate(fn: (r: Rack[]) => void) {
    const next: Rack[] = JSON.parse(JSON.stringify(racks));
    fn(next);
    setRacks(next);
    setBusy(true);
    api.putTopology({ racks: next }).catch((e: any) => setErr(e.message)).finally(() => setBusy(false));
  }
  const nextBox = () => {
    let m = 0;
    for (const r of racks) for (const u of r.units) for (const p of u.ports) m = Math.max(m, p.box || 0);
    return m + 1;
  };
  const sensorList = Object.entries(names).sort((a, b) => a[1].localeCompare(b[1]));
  const takenRoms = (eui: string, exceptPort?: string) => {
    const s = new Set<string>();
    for (const r of racks) for (const u of r.units) for (const p of u.ports) {
      if (p.id === exceptPort) continue;
      if ((p.assignedEui || "").toLowerCase() === eui && p.assignedProbeRom) s.add(String(p.assignedProbeRom).toLowerCase());
    }
    return s;
  };

  const ask = (msg: string, cur = "") => window.prompt(msg, cur);

  const openAssign = (p: Port) => {
    setAssignPort(p.id);
    setAEui((p.assignedEui || "").toLowerCase());
    setARom((p.assignedProbeRom || "").toLowerCase());
  };
  const submitAssign = (rackId: string, unitId: string, portId: string) => {
    mutate((rk) => {
      const port = rk.find((r) => r.id === rackId)?.units.find((u) => u.id === unitId)?.ports.find((p) => p.id === portId);
      if (!port) return;
      port.assignedEui = aEui || null;
      port.assignedProbeRom = aRom || null;
      const idx = aRom ? (probesByEui[aEui]?.findIndex((x) => x.rom === aRom) ?? -1) : -1;
      port.probeLabel = idx >= 0 ? `Probe ${idx + 1}` : null;
    });
    setAssignPort(null);
  };

  if (loading) return <div className="center-msg">Loading…</div>;

  return (
    <>
      <PageHeader title="Rack Layout">
        {busy && <span className="small muted">Saving…</span>}
        {isAdmin && (
          <button onClick={() => { const n = ask("New rack name", `Rack ${racks.length + 1}`); if (n) mutate((r) => r.push({ id: uid(), name: n.trim(), units: [] })); }}>
            <Icon name="add" size={17} /> Add Rack
          </button>
        )}
      </PageHeader>
      <div className="page">
        {err && <div className="error">{err}</div>}
        {!isAdmin && <div className="bd muted">Read-only — only admins can edit the layout.</div>}
        {racks.length === 0 && <div className="card"><div className="bd muted">No racks yet. {isAdmin ? "Add one to start." : ""}</div></div>}

        {racks.map((rack) => (
          <div className="card rack-card" key={rack.id}>
            <div className="hd hd-ico" style={{ justifyContent: "space-between" }}>
              <span className="hd-ico"><Icon name="dns" size={18} /> {rack.name}</span>
              {isAdmin && (
                <span className="btnrow">
                  <button className="iconbtn" title="Rename rack" onClick={() => { const n = ask("Rename rack", rack.name); if (n) mutate((r) => { const x = r.find((y) => y.id === rack.id); if (x) x.name = n.trim(); }); }}><Icon name="edit" size={18} /></button>
                  <button className="iconbtn danger" title="Delete rack" onClick={() => { if (confirm(`Delete ${rack.name}?`)) mutate((r) => { const i = r.findIndex((y) => y.id === rack.id); if (i >= 0) r.splice(i, 1); }); }}><Icon name="delete" size={18} /></button>
                </span>
              )}
            </div>
            <div className="bd">
              {rack.units.map((unit) => (
                <div className="unit" key={unit.id}>
                  <div className="unit-head">
                    <Icon name="dvr" size={17} />
                    <span className="nm">{unit.name}</span>
                    {isAdmin && (
                      <span className="btnrow">
                        <button className="iconbtn" title="Rename unit" onClick={() => { const n = ask("Rename unit", unit.name); if (n) mutate((r) => { const u = r.find((y) => y.id === rack.id)?.units.find((z) => z.id === unit.id); if (u) u.name = n.trim(); }); }}><Icon name="edit" size={16} /></button>
                        <button className="iconbtn danger" title="Delete unit" onClick={() => { if (confirm(`Delete ${unit.name}?`)) mutate((r) => { const x = r.find((y) => y.id === rack.id); if (x) x.units = x.units.filter((z) => z.id !== unit.id); }); }}><Icon name="delete" size={16} /></button>
                      </span>
                    )}
                  </div>

                  {unit.ports.map((port) => {
                    const assignedName = port.assignedEui ? (names[(port.assignedEui || "").toLowerCase()] || port.assignedEui) : null;
                    const probes = (probesByEui[(aEui || "").toLowerCase()] || []).filter(
                      (p) => !takenRoms(aEui, port.id).has(p.rom) || p.rom === aRom);
                    return (
                      <div key={port.id}>
                        <div className="port">
                          <span className={`ptag ${port.type}`}>{port.type === "exhaust" ? "EXHAUST" : "INTAKE"}</span>
                          <div className="pinfo">
                            <div>{port.label}</div>
                            <div className="small muted">
                              {assignedName
                                ? <span className="hd-ico"><Icon name="thermostat" size={14} /> {assignedName}{port.probeLabel ? ` · ${port.probeLabel}` : ""}</span>
                                : "unassigned"}
                            </div>
                          </div>
                          {isAdmin && (
                            <span className="btnrow">
                              <button className="secondary" onClick={() => openAssign(port)}>
                                <Icon name="link" size={16} /> {port.assignedEui ? "Reassign" : "Assign"}
                              </button>
                              {port.assignedEui && (
                                <button className="iconbtn" title="Unassign" onClick={() => mutate((r) => { const p = r.find((y) => y.id === rack.id)?.units.find((u) => u.id === unit.id)?.ports.find((q) => q.id === port.id); if (p) { p.assignedEui = null; p.assignedProbeRom = null; p.probeLabel = null; } })}><Icon name="link_off" size={18} /></button>
                              )}
                              <button className="iconbtn danger" title="Delete port" onClick={() => mutate((r) => { const u = r.find((y) => y.id === rack.id)?.units.find((z) => z.id === unit.id); if (u) u.ports = u.ports.filter((q) => q.id !== port.id); })}><Icon name="delete" size={16} /></button>
                            </span>
                          )}
                        </div>
                        {assignPort === port.id && isAdmin && (
                          <div className="assign-form">
                            <select value={aEui} onChange={(e) => { setAEui(e.target.value); setARom(""); }}>
                              <option value="">— select sensor —</option>
                              {sensorList.map(([eui, nm]) => <option key={eui} value={eui}>{nm}</option>)}
                            </select>
                            <select value={aRom} onChange={(e) => setARom(e.target.value)} disabled={!aEui}>
                              <option value="">Whole sensor (hottest)</option>
                              {probes.map((p) => (
                                <option key={p.rom} value={p.rom}>
                                  Probe {(probesByEui[aEui] || []).findIndex((x) => x.rom === p.rom) + 1} · …{p.rom.slice(-4)}{p.temp != null ? ` · ${p.temp.toFixed(1)}°` : ""}
                                </option>
                              ))}
                            </select>
                            <button disabled={!aEui} onClick={() => submitAssign(rack.id, unit.id, port.id)}><Icon name="check" size={16} /> Save</button>
                            <button className="secondary" onClick={() => setAssignPort(null)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isAdmin && (
                    <div className="btnrow" style={{ marginTop: 8 }}>
                      <button className="ghost" onClick={() => mutate((r) => { const u = r.find((y) => y.id === rack.id)?.units.find((z) => z.id === unit.id); if (u) u.ports.push({ id: uid(), type: "intake", label: `Intake ${u.ports.filter((p) => p.type === "intake").length + 1}`, box: nextBox() }); })}><Icon name="login" size={16} /> Add Intake</button>
                      <button className="ghost" onClick={() => mutate((r) => { const u = r.find((y) => y.id === rack.id)?.units.find((z) => z.id === unit.id); if (u) u.ports.push({ id: uid(), type: "exhaust", label: `Exhaust ${u.ports.filter((p) => p.type === "exhaust").length + 1}`, box: nextBox() }); })}><Icon name="logout" size={16} /> Add Exhaust</button>
                    </div>
                  )}
                </div>
              ))}

              {isAdmin && (
                <button className="ghost" onClick={() => mutate((r) => { const x = r.find((y) => y.id === rack.id); if (x) x.units.push({ id: uid(), name: `Unit ${x.units.length + 1}`, ports: [] }); })}><Icon name="add" size={16} /> Add Unit</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
