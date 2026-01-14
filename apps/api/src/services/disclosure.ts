import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

export type ReportType = 'quarterly' | 'annual' | 'incident' | 'audit';
export type ReportStatus = 'draft' | 'pending' | 'published';

export interface DisclosureReport {
  id: string;
  title: string;
  type: ReportType;
  status: ReportStatus;
  date: string;
  summary: string;
  content?: string;
  file_url?: string;
  author: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface CreateReportInput {
  title: string;
  type: ReportType;
  date: string;
  summary: string;
  content?: string;
  fileUrl?: string;
  author: string;
}

export class DisclosureService {
  private db: Database.Database;
  private io: SocketServer;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS disclosure_reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        date TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT,
        file_url TEXT,
        author TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        published_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_disclosure_reports_type ON disclosure_reports(type);
      CREATE INDEX IF NOT EXISTS idx_disclosure_reports_status ON disclosure_reports(status);
      CREATE INDEX IF NOT EXISTS idx_disclosure_reports_date ON disclosure_reports(date DESC);
    `);
  }

  create(input: CreateReportInput): DisclosureReport {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO disclosure_reports (id, title, type, status, date, summary, content, file_url, author, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title,
      input.type,
      input.date,
      input.summary,
      input.content || null,
      input.fileUrl || null,
      input.author,
      now,
      now
    );

    const report = this.getById(id)!;
    this.io.emit('disclosure:created', { report });
    return report;
  }

  getById(id: string): DisclosureReport | null {
    return this.db.prepare('SELECT * FROM disclosure_reports WHERE id = ?').get(id) as DisclosureReport | null;
  }

  getAll(options: {
    type?: ReportType;
    status?: ReportStatus;
    limit?: number;
    offset?: number;
  } = {}): DisclosureReport[] {
    let query = 'SELECT * FROM disclosure_reports WHERE 1=1';
    const params: any[] = [];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }
    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 50, options.offset || 0);

    return this.db.prepare(query).all(...params) as DisclosureReport[];
  }

  getPublished(limit = 50): DisclosureReport[] {
    return this.db.prepare(`
      SELECT * FROM disclosure_reports
      WHERE status = 'published'
      ORDER BY date DESC
      LIMIT ?
    `).all(limit) as DisclosureReport[];
  }

  update(id: string, updates: Partial<CreateReportInput>): DisclosureReport {
    const report = this.getById(id);
    if (!report) {
      throw new Error('Report not found');
    }

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (updates.title) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.type) {
      fields.push('type = ?');
      params.push(updates.type);
    }
    if (updates.date) {
      fields.push('date = ?');
      params.push(updates.date);
    }
    if (updates.summary) {
      fields.push('summary = ?');
      params.push(updates.summary);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      params.push(updates.content);
    }
    if (updates.fileUrl !== undefined) {
      fields.push('file_url = ?');
      params.push(updates.fileUrl);
    }

    params.push(id);

    this.db.prepare(`
      UPDATE disclosure_reports SET ${fields.join(', ')} WHERE id = ?
    `).run(...params);

    const updated = this.getById(id)!;
    this.io.emit('disclosure:updated', { report: updated });
    return updated;
  }

  publish(id: string): DisclosureReport {
    const report = this.getById(id);
    if (!report) {
      throw new Error('Report not found');
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE disclosure_reports
      SET status = 'published', published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, id);

    const updated = this.getById(id)!;
    this.io.emit('disclosure:published', { report: updated });
    return updated;
  }

  setPending(id: string): DisclosureReport {
    const report = this.getById(id);
    if (!report) {
      throw new Error('Report not found');
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE disclosure_reports
      SET status = 'pending', updated_at = ?
      WHERE id = ?
    `).run(now, id);

    return this.getById(id)!;
  }

  delete(id: string): void {
    const report = this.getById(id);
    if (!report) {
      throw new Error('Report not found');
    }

    this.db.prepare('DELETE FROM disclosure_reports WHERE id = ?').run(id);
    this.io.emit('disclosure:deleted', { id });
  }

  getStats(): {
    total: number;
    published: number;
    pending: number;
    draft: number;
    byType: Record<ReportType, number>;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM disclosure_reports').get() as any)?.count || 0;
    const published = (this.db.prepare("SELECT COUNT(*) as count FROM disclosure_reports WHERE status = 'published'").get() as any)?.count || 0;
    const pending = (this.db.prepare("SELECT COUNT(*) as count FROM disclosure_reports WHERE status = 'pending'").get() as any)?.count || 0;
    const draft = (this.db.prepare("SELECT COUNT(*) as count FROM disclosure_reports WHERE status = 'draft'").get() as any)?.count || 0;

    const typeRows = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM disclosure_reports GROUP BY type
    `).all() as Array<{ type: ReportType; count: number }>;

    const byType: Record<ReportType, number> = {
      quarterly: 0,
      annual: 0,
      incident: 0,
      audit: 0,
    };

    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    return { total, published, pending, draft, byType };
  }
}
