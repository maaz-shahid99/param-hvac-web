import { useEffect, useState } from "react";
import { usePoll } from "../usePoll";
import { api } from "../api";
import { ago, nowSec } from "./Cards";
import Icon from "./Icon";

// The cloud knows a gateway is alive when it POSTs readings — that stamps the
// gateway's API-key `last_used_at`. We treat the most recently used key as the
// gateway's "last forwarded" time. (No Bluetooth needed; works in the browser.)
const ONLINE_WINDOW = 120; // seconds

export default function GatewayStatus() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Distinguish "the gateway isn't forwarding" from "we couldn't ask". Swallowing
  // the error froze `lastUsed`, and after ONLINE_WINDOW the card asserted
  // "Not forwarding / OFFLINE" — blaming the customer's hardware for what was
  // really an expired token or a dropped connection in the browser.
  const [unreachable, setUnreachable] = useState(false);

  async function refresh() {
    try {
      const r = await api.apiKeys();
      setKeys(r.keys || []);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    } finally {
      setLoaded(true);
    }
  }

  usePoll(refresh, 10000);

  const lastUsed = keys.reduce((m, k) => Math.max(m, Number(k.last_used_at) || 0), 0);
  const everUsed = lastUsed > 0;
  const online = !unreachable && everUsed && nowSec() - lastUsed < ONLINE_WINDOW;
  const nKeys = keys.length;
  const keyWord = `${nKeys} ${nKeys === 1 ? "key" : "keys"}`;

  let title: string, sub: string;
  if (unreachable) {
    title = "Status unavailable";
    sub = "Could not reach the cloud server — this says nothing about the gateway itself.";
  } else if (nKeys === 0) {
    title = "No gateway key";
    sub = "Mint an API key (Alerts & Thresholds) and provision a gateway with it.";
  } else if (!everUsed) {
    title = "Never connected";
    sub = `${keyWord} · no readings received yet — provision the gateway's cloud URL + key.`;
  } else {
    title = online ? "Forwarding to cloud" : "Not forwarding";
    // "last contact", not "last reading": the timestamp is stamped by ANY
    // authenticated gateway call (mesh roster, crash upload, OTA check), not
    // only by a reading.
    sub = `last contact ${ago(nowSec() - lastUsed)} · ${keyWord}`;
  }

  // Don't assert OFFLINE before the first fetch resolves — that made every page
  // load flash a false gateway-down state.
  const badge = !loaded ? "…" : unreachable ? "UNKNOWN" : online ? "ONLINE" : "OFFLINE";

  return (
    <div className="card">
      <div className="hd hd-ico"><Icon name="router" size={18} /> Gateway</div>
      <div className="row">
        <div className="btnrow">
          <span className={`dot-s ${online ? "on" : "off"}`} />
          <div>
            <div>{loaded ? title : "…"}</div>
            <div className="small muted">{loaded ? sub : ""}</div>
          </div>
        </div>
        <span className={`badge ${online ? "green" : unreachable ? "amber" : "grey"}`}>{badge}</span>
      </div>
    </div>
  );
}
