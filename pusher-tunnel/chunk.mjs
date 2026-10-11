/** Pusher Channels event data limit is 10,240 bytes — chunk JSON payloads for IAM face base64. */
export const CHUNK_CHARS = 7000;

export function splitString(s) {
  const out = [];
  for (let i = 0; i < s.length; i += CHUNK_CHARS) {
    out.push(s.slice(i, i + CHUNK_CHARS));
  }
  return out.length ? out : [""];
}

export function joinChunks(chunks) {
  return chunks.join("");
}

/** @typedef {{ id: string, tunnelKey: string, method: string, path: string, headers: Record<string,string>, body: string }} TunnelRequest */

export class RequestAssembler {
  constructor() {
    /** @type {Map<string, { meta?: object, chunks: string[], gotDone: boolean }>} */
    this.pending = new Map();
  }

  /** @returns {TunnelRequest | null} */
  ingest(event, payload) {
    const { id } = payload;
    if (!id) return null;
    let slot = this.pending.get(id);
    if (!slot) {
      slot = { chunks: [], gotDone: false };
      this.pending.set(id, slot);
    }
    if (event === "req_meta") {
      slot.meta = payload;
      slot.chunks = new Array(payload.totalChunks || 0).fill("");
    } else if (event === "req_chunk") {
      if (slot.chunks[payload.index] !== undefined) {
        slot.chunks[payload.index] = payload.data || "";
      }
    } else if (event === "req_done") {
      slot.gotDone = true;
    }
    if (!slot.gotDone || !slot.meta) return null;
    if (slot.chunks.some((c) => c === "" && slot.meta.totalChunks > 0)) return null;
    const meta = slot.meta;
    this.pending.delete(id);
    return {
      id,
      tunnelKey: meta.tunnelKey,
      method: meta.method,
      path: meta.path,
      headers: meta.headers || {},
      body: joinChunks(slot.chunks),
    };
  }
}

export class ResponseAssembler {
  constructor() {
    /** @type {Map<string, { meta?: object, chunks: string[], gotDone: boolean, resolve?: Function, reject?: Function }>} */
    this.pending = new Map();
  }

  wait(id, ms = 120_000) {
    return new Promise((resolve, reject) => {
      const slot = { chunks: [], gotDone: false, resolve, reject };
      this.pending.set(id, slot);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("pusher tunnel response timeout"));
        }
      }, ms);
    });
  }

  /** @returns {boolean} finished */
  ingest(event, payload) {
    const { id } = payload;
    if (!id) return false;
    let slot = this.pending.get(id);
    if (!slot && event !== "res_meta") return false;
    if (event === "res_meta") {
      if (!slot) {
        slot = { chunks: [], gotDone: false };
        this.pending.set(id, slot);
      }
      slot.meta = payload;
      slot.chunks = new Array(payload.totalChunks || 0).fill("");
    } else if (event === "res_chunk") {
      if (slot?.chunks[payload.index] !== undefined) {
        slot.chunks[payload.index] = payload.data || "";
      }
    } else if (event === "res_done") {
      if (slot) slot.gotDone = true;
    }
    if (!slot?.gotDone || !slot.meta) return false;
    if (slot.chunks.some((c) => c === "" && slot.meta.totalChunks > 0)) return false;
    const body = joinChunks(slot.chunks);
    this.pending.delete(id);
    slot.resolve?.({
      status: slot.meta.status,
      headers: slot.meta.headers || {},
      body,
    });
    return true;
  }
}
