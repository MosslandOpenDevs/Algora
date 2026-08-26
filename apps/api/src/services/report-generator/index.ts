/**
 * Report Generator Service
 * Automatically generates governance reports on schedule
 */

import type { Database } from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { parse } from 'date-fns';
import { DataCollector } from './data-collector';
import { WeeklyReportGenerator } from './weekly-report';
import { MonthlyReportGenerator } from './monthly-report';
import { DisclosureService } from '../disclosure';

export class ReportGeneratorService {
  private dataCollector: DataCollector;
  private weeklyGenerator: WeeklyReportGenerator;
  private monthlyGenerator: MonthlyReportGenerator;
  private disclosureService: DisclosureService;

  constructor(
    private db: Database,
    private io: SocketServer
  ) {
    this.dataCollector = new DataCollector(db);
    this.weeklyGenerator = new WeeklyReportGenerator();
    this.monthlyGenerator = new MonthlyReportGenerator();
    this.disclosureService = new DisclosureService(db, io);
  }

  /**
   * Recompute an already-published report over its own period and replace its
   * body.
   *
   * Every report published before 2026-08-26 states `LLM API Calls | 0` and
   * `Uptime | 99.9%`, because `collectSystemMetrics` returned those as
   * constants. The call figure was wrong by tens of thousands; the uptime was
   * never measured at all.
   *
   * The period comes from the report itself — the body carries
   * `**Period:** Jun 15, 2026 - Jun 22, 2026` — rather than being re-derived
   * from the publication date and an assumption about the generator's window.
   * If a report does not state one, it is left alone: guessing the window
   * would be the same class of mistake being corrected.
   *
   * A correction notice is prepended. Quietly replacing the body of a
   * published governance record would be its own failure, whatever the numbers
   * say afterwards.
   *
   * `dryRun` computes everything and writes nothing, so a correction can be
   * inspected before it lands.
   */
  async regenerateReport(
    id: string,
    options: { dryRun?: boolean } = {}
  ): Promise<{
    id: string;
    title: string;
    period: { start: string; end: string };
    content: string;
    written: boolean;
  }> {
    const report = this.disclosureService.getById(id);
    if (!report) throw new Error(`Report not found: ${id}`);

    const period = this.parseReportPeriod(report.content ?? '');
    if (!period) throw new Error(`Report ${id} does not state its period; refusing to guess`);

    const isMonthly = /^Monthly/i.test(report.title);
    const metrics = this.dataCollector.collectMetrics(
      period.start,
      period.end,
      isMonthly ? 'monthly' : 'weekly'
    );

    const regenerated = isMonthly
      ? await this.monthlyGenerator.generate(metrics)
      : await this.weeklyGenerator.generate(metrics);

    const content = `${this.correctionNotice()}\n\n${regenerated.content}`;

    if (!options.dryRun) {
      this.disclosureService.update(id, { summary: regenerated.summary, content });
    }

    return {
      id,
      title: report.title,
      period: { start: period.start.toISOString(), end: period.end.toISOString() },
      content,
      written: !options.dryRun,
    };
  }

  /** The `**Period:** MMM d, yyyy - MMM d, yyyy` line the templates emit. */
  private parseReportPeriod(content: string): { start: Date; end: Date } | null {
    const match = /\*\*Period:\*\*\s*(.+?)\s*-\s*(.+?)\s*(?:\n|$)/.exec(content);
    if (!match) return null;

    const start = parse(match[1].trim(), 'MMM d, yyyy', new Date());
    const end = parse(match[2].trim(), 'MMM d, yyyy', new Date());
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    return { start, end };
  }

  private correctionNotice(): string {
    return [
      '> **Corrected.** This report was first published with system metrics that',
      '> were never measured: LLM call volume was reported as 0, and uptime as a',
      '> flat 99.9%, because the collector returned both as constants. Call',
      '> figures below now come from the `budget_usage` ledger for this period.',
      '> Uptime is shown as not measured, because nothing records it.',
      '>',
      '> Governance figures — signals, issues, proposals, sessions, agents — are',
      '> recomputed from the same data over the same period and are unchanged in',
      '> substance; narrative sections are regenerated and may differ in wording.',
    ].join('\n');
  }

  /**
   * Generate and save a weekly report
   */
  async generateWeeklyReport(autoPublish: boolean = false): Promise<{
    id: string;
    title: string;
    success: boolean;
  }> {
    console.info('[ReportGenerator] Generating weekly report...');

    try {
      // Calculate date range (last 7 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      // Collect metrics
      const metrics = this.dataCollector.collectMetrics(startDate, endDate, 'weekly');

      // Generate report
      const report = await this.weeklyGenerator.generate(metrics);

      // Save to disclosure reports
      const savedReport = this.disclosureService.create({
        title: report.title,
        type: 'quarterly', // Using quarterly type for weekly reports (closest match)
        date: new Date().toISOString(),
        summary: report.summary,
        content: report.content,
        author: 'Algora Report Generator',
      });

      // Auto-publish if requested
      if (autoPublish) {
        this.disclosureService.publish(savedReport.id);
      }

      console.info(`[ReportGenerator] Weekly report generated: ${savedReport.id}`);

      // Emit event
      this.io.emit('disclosure:new', {
        type: 'weekly_report',
        reportId: savedReport.id,
        title: report.title,
      });

      return {
        id: savedReport.id,
        title: report.title,
        success: true,
      };
    } catch (error) {
      console.error('[ReportGenerator] Failed to generate weekly report:', error);
      throw error;
    }
  }

  /**
   * Generate and save a monthly report
   */
  async generateMonthlyReport(autoPublish: boolean = false): Promise<{
    id: string;
    title: string;
    success: boolean;
  }> {
    console.info('[ReportGenerator] Generating monthly report...');

    try {
      // Calculate date range (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      // Collect metrics
      const metrics = this.dataCollector.collectMetrics(startDate, endDate, 'monthly');

      // Generate report
      const report = await this.monthlyGenerator.generate(metrics);

      // Save to disclosure reports
      const savedReport = this.disclosureService.create({
        title: report.title,
        type: 'annual', // Using annual type for monthly reports (closest match)
        date: new Date().toISOString(),
        summary: report.summary,
        content: report.content,
        author: 'Algora Report Generator',
      });

      // Auto-publish if requested
      if (autoPublish) {
        this.disclosureService.publish(savedReport.id);
      }

      console.info(`[ReportGenerator] Monthly report generated: ${savedReport.id}`);

      // Emit event
      this.io.emit('disclosure:new', {
        type: 'monthly_report',
        reportId: savedReport.id,
        title: report.title,
      });

      return {
        id: savedReport.id,
        title: report.title,
        success: true,
      };
    } catch (error) {
      console.error('[ReportGenerator] Failed to generate monthly report:', error);
      throw error;
    }
  }

  /**
   * Get preview of report metrics without saving
   */
  getMetricsPreview(type: 'weekly' | 'monthly'): ReturnType<DataCollector['collectMetrics']> {
    const endDate = new Date();
    const startDate = new Date();

    if (type === 'weekly') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate.setDate(startDate.getDate() - 30);
    }

    return this.dataCollector.collectMetrics(startDate, endDate, type);
  }
}

export { DataCollector } from './data-collector';
export { WeeklyReportGenerator } from './weekly-report';
export { MonthlyReportGenerator } from './monthly-report';
