import { OfflineDataStore } from "../offline/OfflineDataStore";

interface PrintJob {
  id: string;
  destination: string;
  priority: number;
  templateId: string;
  data: any;
  status: "pending" | "printing" | "done" | "error";
  attempts: number;
  createdAt: number;
  deviceId: string;
}

interface PrinterDriver {
  print: (payload: string) => Promise<void>;
}

export class PrintJobManager {
  private dataStore: OfflineDataStore;
  private printerDriver: PrinterDriver;
  private deviceId: string;
  private processing: boolean;

  constructor({
    dataStore,
    printerDriver,
    deviceId,
  }: {
    dataStore: OfflineDataStore;
    printerDriver: PrinterDriver;
    deviceId: string;
  }) {
    this.dataStore = dataStore;
    this.printerDriver = printerDriver;
    this.deviceId = deviceId;
    this.processing = false;
  }

  async enqueueJob({
    destination,
    priority = 10,
    templateId,
    data,
  }: {
    destination: string;
    priority?: number;
    templateId: string;
    data: any;
  }): Promise<PrintJob> {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const job: PrintJob = {
      id,
      destination,
      priority,
      templateId,
      data,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      deviceId: this.deviceId,
    };

    await this.dataStore.put("printJobs", job);
    this.processNext();
    return job;
  }

  async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const pendingJobs = (await this.dataStore.getAll(
        "printJobs",
        "status",
        "pending"
      )) as PrintJob[];

      if (!pendingJobs.length) {
        this.processing = false;
        return;
      }

      pendingJobs.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      });

      const job = pendingJobs[0];
      await this._processJob(job);
    } finally {
      this.processing = false;
      setTimeout(() => void this.processNext(), 0);
    }
  }

  private async _processJob(job: PrintJob): Promise<void> {
    const updated: PrintJob = {
      ...job,
      status: "printing",
      attempts: job.attempts + 1,
    };
    await this.dataStore.put("printJobs", updated);

    try {
      const payload = this._renderTemplate(job.templateId, job.data);
      await this.printerDriver.print(payload);
      updated.status = "done";
      await this.dataStore.put("printJobs", updated);
    } catch (err) {
      console.error("Print failed", err);
      if (updated.attempts < 3) {
        updated.status = "pending";
      } else {
        updated.status = "error";
      }
      await this.dataStore.put("printJobs", updated);
    }
  }

  private _renderTemplate(templateId: string, data: any): string {
    switch (templateId) {
      case "receipt":
        return this._renderReceipt(data);
      default:
        return "";
    }
  }

  private _renderReceipt({
    order,
    items,
  }: {
    order: { id: string; total: number };
    items: { qty: number; name: string; price: number }[];
  }): string {
    const lines: string[] = [];
    lines.push("\x1B@\x1B!\x18FOOD STALL\x1B!\x00\n");
    lines.push(`Order: ${order.id}\n`);
    lines.push("-----------------------------\n");
    items.forEach((i) => {
      lines.push(`${i.qty} x ${i.name}  ${i.price.toFixed(2)}\n`);
    });
    lines.push("-----------------------------\n");
    lines.push(`TOTAL: ${order.total.toFixed(2)}\n\n\n\n`);
    return lines.join("");
  }
}
