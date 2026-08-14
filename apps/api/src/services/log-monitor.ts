import * as fs from 'fs';
import * as path from 'path';
import * as _readline from 'readline';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  module: string;
  message: string;
  raw: string;
}

interface LogStats {
  totalLines: number;
  byLevel: {
    info: number;
    warn: number;
    error: number;
  };
  byModule: Record<string, number>;
  slowRequests: number;
  recentErrors: LogEntry[];
  logFiles: {
    name: string;
    size: number;
    modified: Date;
  }[];
  diskUsage: {
    totalBytes: number;
    totalMB: string;
  };
}

interface LogSearchResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

const LOGS_DIR = path.join(__dirname, '../../logs');

// Parse log line to extract components
function parseLogLine(line: string): LogEntry | null {
  // Format: "2026-01-21 10:03:52 +09:00: [Module] Message" or "2026-01-21 10:03:52 +09:00: Message"
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}):\s*(.*)$/);

  if (!timestampMatch) {
    return null;
  }

  const timestamp = timestampMatch[1];
  const content = timestampMatch[2];

  // Extract module if present
  const moduleMatch = content.match(/^\[([^\]]+)\]\s*(.*)$/);
  const module = moduleMatch ? moduleMatch[1] : 'general';
  const message = moduleMatch ? moduleMatch[2] : content;

  // Determine level
  let level: 'info' | 'warn' | 'error' = 'info';
  if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
    level = 'error';
  } else if (message.toLowerCase().includes('warn') || module === 'SLOW') {
    level = 'warn';
  }

  return {
    timestamp,
    level,
    module,
    message,
    raw: line,
  };
}

export class LogMonitorService {
  private logsDir: string;

  constructor(logsDir: string = LOGS_DIR) {
    this.logsDir = logsDir;
  }

  // Get list of log files with metadata
  getLogFiles(): { name: string; size: number; modified: Date; type: 'out' | 'error' }[] {
    if (!fs.existsSync(this.logsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.logsDir, { withFileTypes: true })
      // Dirent#isFile does not follow symlinks. Log reads must stay inside the
      // managed log set even if a link is later dropped into this directory.
      .filter(entry => entry.isFile() && entry.name.endsWith('.log'))
      .map(entry => {
        const name = entry.name;
        const filePath = path.join(this.logsDir, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          size: stat.size,
          modified: stat.mtime,
          type: name.includes('error') ? 'error' as const : 'out' as const,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    return files;
  }

  // Get total disk usage of logs
  getDiskUsage(): { totalBytes: number; totalMB: string } {
    const files = this.getLogFiles();
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    return {
      totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    };
  }

  // Read last N lines from a log file
  async getRecentLogs(
    fileName: string,
    limit: number = 100
  ): Promise<LogEntry[]> {
    const filePath = path.join(this.logsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const entries: LogEntry[] = [];
    const _lines: string[] = [];

    // Read file in reverse to get last N lines efficiently
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(l => l.trim());
    const recentLines = allLines.slice(-limit);

    for (const line of recentLines) {
      const entry = parseLogLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  // Search logs with filters
  async searchLogs(options: {
    query?: string;
    level?: 'info' | 'warn' | 'error';
    module?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<LogSearchResult> {
    const { query, level, module, startDate, endDate, limit = 100, offset = 0 } = options;

    const allEntries: LogEntry[] = [];
    const files = this.getLogFiles();

    // Process each log file
    for (const file of files) {
      const filePath = path.join(this.logsDir, file.name);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const entry = parseLogLine(line);
        if (!entry) continue;

        // Apply filters
        if (level && entry.level !== level) continue;
        if (module && entry.module !== module) continue;
        if (query && !entry.raw.toLowerCase().includes(query.toLowerCase())) continue;
        if (startDate && entry.timestamp < startDate) continue;
        if (endDate && entry.timestamp > endDate) continue;

        allEntries.push(entry);
      }
    }

    // Sort by timestamp descending
    allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const paginatedEntries = allEntries.slice(offset, offset + limit);

    return {
      entries: paginatedEntries,
      total: allEntries.length,
      hasMore: offset + limit < allEntries.length,
    };
  }

  // Get aggregated log statistics
  async getStats(): Promise<LogStats> {
    const files = this.getLogFiles();
    const diskUsage = this.getDiskUsage();

    const stats: LogStats = {
      totalLines: 0,
      byLevel: { info: 0, warn: 0, error: 0 },
      byModule: {},
      slowRequests: 0,
      recentErrors: [],
      logFiles: files.map(f => ({
        name: f.name,
        size: f.size,
        modified: f.modified,
      })),
      diskUsage,
    };

    // Process each log file
    for (const file of files) {
      const filePath = path.join(this.logsDir, file.name);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      stats.totalLines += lines.length;

      for (const line of lines) {
        const entry = parseLogLine(line);
        if (!entry) continue;

        // Count by level
        stats.byLevel[entry.level]++;

        // Count by module
        stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;

        // Count slow requests
        if (entry.module === 'SLOW') {
          stats.slowRequests++;
        }

        // Track recent errors
        if (entry.level === 'error' && stats.recentErrors.length < 50) {
          stats.recentErrors.push(entry);
        }
      }
    }

    // Sort recent errors by timestamp descending
    stats.recentErrors.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    stats.recentErrors = stats.recentErrors.slice(0, 20);

    return stats;
  }

  // Get today's error summary
  async getTodayErrorSummary(): Promise<{
    count: number;
    byModule: Record<string, number>;
    samples: LogEntry[];
  }> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.searchLogs({
      level: 'error',
      startDate: today,
      limit: 1000,
    });

    const byModule: Record<string, number> = {};
    for (const entry of result.entries) {
      byModule[entry.module] = (byModule[entry.module] || 0) + 1;
    }

    return {
      count: result.total,
      byModule,
      samples: result.entries.slice(0, 10),
    };
  }

  // Clear old logs (manual cleanup)
  clearOldLogs(daysToKeep: number = 30): { deleted: string[]; errors: string[] } {
    const deleted: string[] = [];
    const errors: string[] = [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const files = this.getLogFiles();

    for (const file of files) {
      if (file.modified < cutoffDate) {
        try {
          fs.unlinkSync(path.join(this.logsDir, file.name));
          deleted.push(file.name);
        } catch (err) {
          errors.push(`Failed to delete ${file.name}: ${err}`);
        }
      }
    }

    return { deleted, errors };
  }
}

export const logMonitorService = new LogMonitorService();
