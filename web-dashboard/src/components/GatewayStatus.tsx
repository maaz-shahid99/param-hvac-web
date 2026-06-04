import { useEffect, useState } from "react";
import { api } from "../api";
import { ago, nowSec } from "./Cards";

// The cloud knows a gateway is alive when it POSTs readings — that stamps the
// gateway's API-key `last_used_at`. We treat the most recently used key as the
// gateway's "last forwarded" time. (No Bluetooth needed; works in the browser.)
const ONLINE_WINDOW = 120; // seconds

export default function GatewayStatus() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try {
      const r = await api.apiKeys();
      setKeys(r.keys || []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  const lastUsed = keys.reduce((m, k) => Math.max(m, Number(k.last_used_at) || 0), 0);
  const everUsed = lastUsed > 0;
  const online = everUsed && nowSec() - lastUsed < ONLINE_WINDOW;

  let title: string, sub: string;
  if (keys.length === 0) {
    title = "No gateway key";
    sub = "Mint an API key (Alerts & Thresholds) and provision a gateway with it.";
  } else if (!everUsed) {
    title = "Never connected";
    sub = `${keys.length} key(s) · no readings received yet — provision the gateway's cloud URL + key.`;
  } else {
    title = online ? "Forwarding to cloud" : "Not forwarding";
    sub = `last reading ${ago(nowSec() - lastUsed)} · ${keys.length} key(s)`;
  }

  return (
    <div className="card">
      <div className="hd">🛰️ Gateway</div>
      <div className="row">
        <div className="btnrow">
          <span className={`dot-s ${online ? "on" : "off"}`} />
          <div>
            <div>{loaded ? title : "…"}</div>
            <div className="small muted">{loaded ? sub : ""}</div>
          </div>
        </div>
        <span className={`badge ${online ? "green" : "grey"}`}>
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </div>
    </div>
  );
}
